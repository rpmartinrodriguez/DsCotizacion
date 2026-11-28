import {randomBytes} from 'node:crypto';
import QRCode from 'qrcode';
import {admin,authorize,hash,productionOrigin} from './lib/push-admin.mjs';
import {googleClass,googleWallet} from './lib/fidelizacion-google.mjs';
import {validBirthdate,birthdays,remindBirthdays} from './lib/fidelizacion-birthdays.mjs';
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const validId=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const publicActions=['invite-status','register','public-register','google-link','opt-out'];
const policyVersion='2026-11-27-stamps';
const dniOf=v=>typeof v==='string'?v.trim().replace(/[.\s]/g,''):'';
const validDni=v=>/^\d{7,8}$/.test(v);
const stamps=m=>Number.isSafeInteger(m?.stamps)&&m.stamps>=0?m.stamps:0;
const count=m=>Number.isSafeInteger(m?.purchaseCount)&&m.purchaseCount>=0?m.purchaseCount:0;
const view=(id,m)=>({id,card:m.card,name:m.name||'',phone:m.phone||'',email:m.email||'',dni:m.dni||'',birthdate:m.birthdate||'',birthdayReminder:m.birthdayReminder===true,state:m.state,consent:m.consent===true,registeredAt:m.registeredAt||0,googleSaved:m.googleSaved===true,googleIssued:m.googleIssued===true,lastPushStatus:m.lastPushStatus||'',stamps:stamps(m),purchaseCount:count(m)});
const validContact=(name,phone,birthdate)=>name.split(/\s+/).length>=2&&/^\+?[\d\s().-]+$/.test(phone)&&phone.replace(/\D/g,'').length>=7&&phone.replace(/\D/g,'').length<=15&&validBirthdate(birthdate);
async function claimDni(tx,index,origin,dni,id,old=''){
 if(dni===old)return;
 const next=dni?index.doc(hash(origin+'|'+dni)):null,prev=old?index.doc(hash(origin+'|'+old)):null;
 const n=next?(await tx.get(next)).data():null,p=prev?(await tx.get(prev)).data():null;
 if(n?.memberId&&n.memberId!==id)fail(409,'No se pudo asignar ese documento. Revisá los datos con administración.');
 if(prev&&p?.memberId===id)tx.set(prev,{memberId:''});
 if(next)tx.set(next,{memberId:id});
}
async function syncGoogle(ref,prod){
 const m=(await ref.get()).data();
 if(!m?.googleIssued)return 'not-issued';
 try{const wallet=await googleWallet(prod);await wallet.update(m);return 'updated';}catch{return 'pending';}
}
export default async function(request,context){
 try{
  if(request.method!=='POST')return json(405,{ok:false});
  const origin=new URL(request.url).origin,prod=origin===productionOrigin;
  if(!prod&&!/^https:\/\/[a-z0-9-]+--dulce-app\.netlify\.app$/.test(origin))fail(403,'Origen no autorizado.');
  if(request.headers.get('origin')!==origin)fail(403,'Origen no autorizado.');
  const raw=await request.text();
  if(raw.length>4096)fail(413,'Solicitud demasiado extensa.');
  const body=JSON.parse(raw), action=body?.action;
  const svc=admin(),db=svc.db;
  const suffix=prod?'Live':'Test', members=db.collection('dsLoyaltyMembers'+suffix);
  const index=db.collection('dsLoyaltyDni'+suffix),movements=db.collection('dsLoyaltyMovements'+suffix);
  const ready=Boolean(googleClass(prod))&&(prod||googleClass(false)!==googleClass(true));
  if(publicActions.includes(action)){
   if(!validId(body.token))fail(404,'Invitación inválida.');
   const ref=members.doc(hash(body.token));
   if(action==='public-register'){
    const name=clean(body.name,100),phone=clean(body.phone,35),birthdate=body.birthdate,dni=dniOf(body.dni);
    if(!validContact(name,phone,birthdate)||(dni&&!validDni(dni))||body.accept!==true)fail(400,'Revisá los datos y aceptá el aviso de privacidad.');
    const ip=context?.ip;
    if(!ip)fail(503,'No se pudo validar la conexión. Solicitá asistencia en el local.');
    const bucket=Math.floor(Date.now()/3600000);
    const rate=db.collection('dsLoyaltyRegistrationRate'+suffix).doc(hash(origin+'|'+ip+'|'+bucket));
    const proposed='DS-'+randomBytes(12).toString('hex').toUpperCase();
    const card=await db.runTransaction(async tx=>{
     const existing=(await tx.get(ref)).data();
     if(existing){if(existing.origin===origin&&existing.state==='registered')return existing.card;fail(409,'Registro no disponible.');}
     const r=(await tx.get(rate)).data()||{};
     if((r.count||0)>=30)fail(429,'Demasiados registros desde esta conexión. Intentá más tarde o consultá en el local.');
     await claimDni(tx,index,origin,dni,ref.id);
     tx.set(rate,{count:(r.count||0)+1,expiresAt:Date.now()+7200000});
     tx.set(ref,{origin,card:proposed,state:'registered',name,phone,dni,birthdate,birthdayKey:birthdate.slice(5),birthdayReminder:true,stamps:0,purchaseCount:0,consent:body.consent===true,consentAt:Date.now(),policyVersion,registeredAt:Date.now()});
     return proposed;
    });
    const m=(await ref.get()).data();
    return json(200,{ok:true,state:'registered',card,stamps:stamps(m),purchaseCount:count(m),qr:await QRCode.toDataURL(card,{width:280,margin:4,errorCorrectionLevel:'M'}),consent:m.consent===true,googleReady:ready});
   }
   const snap=await ref.get(), m=snap.data();
   if(!snap.exists||m.origin!==origin)fail(404,'Invitación inválida.');
   if(m.state==='pending'&&m.expiresAt<Date.now())fail(410,'La invitación venció. Solicitá una nueva en el local.');
   if(action==='invite-status'){
    const registered=m.state==='registered';
    return json(200,{ok:true,state:m.state,card:registered?m.card:null,stamps:stamps(m),purchaseCount:count(m),qr:registered?await QRCode.toDataURL(m.card,{width:280,margin:4,errorCorrectionLevel:'M'}):null,consent:m.consent===true,googleReady:ready});
   }
   if(action==='register'){
    const name=clean(body.name,100),phone=clean(body.phone,35),birthdate=body.birthdate,dni=dniOf(body.dni);
    if(!validContact(name,phone,birthdate)||(dni&&!validDni(dni))||body.accept!==true)fail(400,'Completá nombre y apellido, un celular válido, la fecha de nacimiento y aceptá el aviso de privacidad.');
    await db.runTransaction(async tx=>{
     const current=(await tx.get(ref)).data();
     if(!current||current.state!=='pending'||current.expiresAt<Date.now())fail(409,'Invitación usada o vencida.');
     await claimDni(tx,index,origin,dni,ref.id);
     tx.set(ref,{state:'registered',name,phone,dni,birthdate,stamps:0,purchaseCount:0,birthdayKey:birthdate.slice(5),birthdayReminder:true,consent:body.consent===true,consentAt:Date.now(),policyVersion,registeredAt:Date.now()},{merge:true});
    });
    return json(200,{ok:true,state:'registered',card:m.card,stamps:0,purchaseCount:0,qr:await QRCode.toDataURL(m.card,{width:280,margin:4,errorCorrectionLevel:'M'}),consent:body.consent===true,googleReady:ready});
   }
   if(m.state!=='registered')fail(409,'Completá primero tu registro.');
   if(action==='opt-out'){await ref.set({consent:false,consentAt:Date.now()},{merge:true});return json(200,{ok:true});}
   if(action==='google-link'){
    const wallet=await googleWallet(prod),url=await wallet.issue(m,origin);
    await ref.set({googleIssued:true},{merge:true});
    return json(200,{ok:true,url});
   }
  }
  const {uid,profile}=await authorize({headers:{authorization:request.headers.get('authorization')||''}},svc);
  if(profile.rol!=='master')fail(403,'Sólo administradores.');
  if(action==='counter-qr'){
   const url=origin+'/mi-tarjeta.html';
   return json(200,{ok:true,url,qr:await QRCode.toDataURL(url,{width:600,margin:4,errorCorrectionLevel:'M'})});
  }
  if(action==='lookup'){
   const value=clean(body.value,100),dni=dniOf(value);
   let docs=[];
   if(/^DS-[A-F0-9]{24}$/i.test(value))docs=(await members.where('card','==',value.toUpperCase()).limit(3).get()).docs;
   else if(validDni(dni)){
    const link=(await index.doc(hash(origin+'|'+dni)).get()).data();
    if(link?.memberId){const s=await members.doc(link.memberId).get();if(s.exists&&s.data().dni===dni)docs=[s];}
   }else fail(400,'Escaneá el QR de la tarjeta o ingresá el DNI.');
   const d=docs.find(d=>d.data().origin===origin&&d.data().state==='registered');
   if(!d)fail(404,'No encontramos un cliente registrado con ese código o documento.');
   return json(200,{ok:true,member:view(d.id,d.data())});
  }
  if(['edit-member','purchase','reverse-purchase','history','sync-wallet'].includes(action)){
   if(!validId(body.id))fail(400,'Cliente inválido.');
   const ref=members.doc(body.id),old=(await ref.get()).data();
   if(!old||old.origin!==origin||old.state!=='registered')fail(404,'Cliente no encontrado.');
   if(action==='history'){
    const data=await movements.where('memberKey','==',hash(origin+'|'+body.id)).limit(500).get();
    return json(200,{ok:true,items:data.docs.map(d=>({id:d.id,...d.data()})).filter(v=>v.origin===origin&&v.memberId===body.id).sort((a,b)=>b.at-a.at).map(({id,reference,amount,at,reversed,reversedAt})=>({id,reference,amount,at,reversed:reversed===true,reversedAt:reversedAt||0})),limited:data.size===500});
   }
   if(action==='sync-wallet')return json(200,{ok:true,wallet:await syncGoogle(ref,prod)});
   if(action==='edit-member'){
    const name=clean(body.name,100),phone=clean(body.phone,35),birthdate=body.birthdate,dni=dniOf(body.dni);
    if(!validContact(name,phone,birthdate)||(dni&&!validDni(dni)))fail(400,'Revisá nombre, celular, nacimiento y documento.');
    await db.runTransaction(async tx=>{
     const m=(await tx.get(ref)).data();if(!m||m.origin!==origin||m.state!=='registered')fail(404,'Cliente no encontrado.');
     await claimDni(tx,index,origin,dni,body.id,m.dni||'');
     tx.set(ref,{name,phone,birthdate,birthdayKey:birthdate.slice(5),dni,birthdayReminder:body.birthdayReminder===true,consent:m.consent===true&&body.consent!==false,updatedAt:Date.now(),updatedBy:uid,...(m.consent&&body.consent===false?{consentAt:Date.now()}: {})},{merge:true});
    });
   }
   if(action==='purchase'){
    const reference=clean(body.reference,80).toUpperCase(),amount=body.amount;
    if(!reference||!Number.isFinite(amount)||amount<=0||amount>100000000||Math.abs(amount*100-Math.round(amount*100))>0.0001)fail(400,'Ingresá un comprobante único y un importe válido.');
    const movement=movements.doc(hash(origin+'|'+reference));
    await db.runTransaction(async tx=>{
     const m=(await tx.get(ref)).data(),existing=await tx.get(movement);
     if(!m||m.origin!==origin||m.state!=='registered')fail(404,'Cliente no encontrado.');
     if(existing.exists)fail(409,'Ese comprobante ya fue registrado. No se duplicaron sellos.');
     tx.set(movement,{origin,memberId:body.id,memberKey:hash(origin+'|'+body.id),reference,amount,at:Date.now(),uid,reversed:false});
     tx.set(ref,{stamps:stamps(m)+1,purchaseCount:count(m)+1},{merge:true});
    });
   }
   if(action==='reverse-purchase'){
    if(!validId(body.movementId))fail(400,'Movimiento inválido.');
    const movement=movements.doc(body.movementId);
    await db.runTransaction(async tx=>{
     const m=(await tx.get(ref)).data(),v=(await tx.get(movement)).data();
     if(!m||m.origin!==origin||m.state!=='registered'||!v||v.origin!==origin||v.memberId!==body.id)fail(404,'Compra no encontrada.');
     if(v.reversed||stamps(m)<1||count(m)<1)fail(409,'La compra ya está anulada o el saldo no permite revertirla.');
     tx.set(movement,{reversed:true,reversedAt:Date.now(),reversedBy:uid},{merge:true});
     tx.set(ref,{stamps:stamps(m)-1,purchaseCount:count(m)-1},{merge:true});
    });
   }
   const member=view(body.id,(await ref.get()).data());
   const wallet=await syncGoogle(ref,prod);
   return json(200,{ok:true,member,wallet});
  }
  if(action==='birthdays')return json(200,{ok:true,people:await birthdays(svc,origin,prod)});
  if(action==='birthday-test'){
   if(prod)fail(403,'La prueba manual sólo está disponible en vistas previas.');
   return json(200,{ok:true,...await remindBirthdays(svc,origin,false)});
  }
  if(action==='list'){
   const query=members.orderBy('__name__').limit(101);
   const snap=await (validId(body.after)?query.startAfter(body.after):query).get();
   const rows=snap.docs.slice(0,100).map(d=>({id:d.id,...d.data()})).filter(m=>m.origin===origin).map(m=>view(m.id,m));
   return json(200,{ok:true,rows,next:snap.size>100?snap.docs[99].id:null,googleReady:ready,production:prod});
  }
  if(action==='invite'){
   const token=randomBytes(32).toString('hex'),card='DS-'+randomBytes(12).toString('hex').toUpperCase();
   const url=origin+'/mi-tarjeta.html#'+token;
   const qr=await QRCode.toDataURL(url,{width:280,margin:3,errorCorrectionLevel:'M'});
   await members.doc(hash(token)).set({origin,card,state:'pending',createdAt:Date.now(),expiresAt:Date.now()+86400000,createdBy:uid,consent:false});
   return json(200,{ok:true,url,qr});
  }
  if(!['refresh-google','send-google'].includes(action)||!validId(body.id))fail(400,'Acción inválida.');
  const ref=members.doc(body.id),m=(await ref.get()).data();
  if(!m||m.origin!==origin||m.state!=='registered')fail(404,'Cliente no encontrado.');
  const wallet=await googleWallet(prod);
  const status=await wallet.status(m.card);
  await ref.set({googleIssued:status.issued,googleSaved:status.saved,googleCheckedAt:Date.now()},{merge:true});
  if(action==='refresh-google')return json(200,{ok:true,...status});
  if(!status.saved)fail(409,'La tarjeta no figura guardada en Google Wallet.');
  const title=clean(body.title,80),message=clean(body.message,300);
  if(!title||!message||body.confirm!==true)fail(400,'Ingresá y confirmá el mensaje.');
  // Reservar el cupo antes de enviar; no reintentar automáticamente un envío incierto.
  await db.runTransaction(async tx=>{
   const current=(await tx.get(ref)).data();
   if(current?.consent!==true)fail(403,'El cliente no autorizó promociones.');
   const now=Date.now(),recent=(current.pushAttempts||[]).filter(t=>t>now-86400000);
   if(recent.length>=3)fail(429,'Límite de tres intentos en 24 horas.');
   tx.set(ref,{pushAttempts:[...recent,now],lastPushAt:now,lastPushStatus:'intentado'},{merge:true});
  });
  const audit=db.collection('dsLoyaltyPush'+suffix).doc(randomBytes(20).toString('hex'));
  await audit.set({origin,card:m.card,title,message,uid,at:Date.now(),status:'intentado'});
  try{await wallet.notify(m.card,title,message);}
  catch(e){await audit.set({status:'error o resultado incierto'},{merge:true});await ref.set({lastPushStatus:'error o resultado incierto'},{merge:true});throw e;}
  await audit.set({status:'aceptado por Google'},{merge:true});
  await ref.set({lastPushStatus:'aceptado por Google'},{merge:true});
  return json(200,{ok:true,message:'Google aceptó el mensaje. La entrega al dispositivo no está confirmada.'});
 }catch(e){console.error('fidelizacion',{status:e.status||500});return json(e.status||503,{ok:false,message:e.status?e.message:'No se pudo completar la operación. Revisá la conexión o configuración.'});}
}
