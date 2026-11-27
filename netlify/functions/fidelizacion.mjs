import {randomBytes} from 'node:crypto';
import QRCode from 'qrcode';
import {admin,authorize,hash,productionOrigin} from './lib/push-admin.mjs';
import {googleClass,googleWallet} from './lib/fidelizacion-google.mjs';
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const validId=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const publicActions=['invite-status','register','google-link','opt-out'];
const policyVersion='2026-11-27';
export default async function(request){
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
  const ready=Boolean(googleClass(prod))&&(prod||googleClass(false)!==googleClass(true));
  if(publicActions.includes(action)){
   if(!validId(body.token))fail(404,'Invitación inválida.');
   const ref=members.doc(hash(body.token));
   const snap=await ref.get(), m=snap.data();
   if(!snap.exists||m.origin!==origin)fail(404,'Invitación inválida.');
   if(m.state==='pending'&&m.expiresAt<Date.now())fail(410,'La invitación venció. Solicitá una nueva en el local.');
   if(action==='invite-status')return json(200,{ok:true,state:m.state,card:m.state==='registered'?m.card:null,consent:m.consent===true,googleReady:ready});
   if(action==='register'){
    const name=clean(body.name,100),email=clean(body.email,160),phone=clean(body.phone,35);
    if(name.length<2||body.accept!==true||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))fail(400,'Revisá tus datos y aceptá el aviso de privacidad.');
    await db.runTransaction(async tx=>{
     const current=(await tx.get(ref)).data();
     if(!current||current.state!=='pending'||current.expiresAt<Date.now())fail(409,'Invitación usada o vencida.');
     tx.set(ref,{state:'registered',name,email,phone,consent:body.consent===true,consentAt:Date.now(),policyVersion,registeredAt:Date.now()},{merge:true});
    });
    return json(200,{ok:true,card:m.card,googleReady:ready});
   }
   if(m.state!=='registered')fail(409,'Completá primero tu registro.');
   if(action==='opt-out'){await ref.set({consent:false,consentAt:Date.now()},{merge:true});return json(200,{ok:true});}
   if(action==='google-link'){
    const wallet=await googleWallet(prod),url=await wallet.issue(m,origin);
    return json(200,{ok:true,url});
   }
  }
  const {uid,profile}=await authorize({headers:{authorization:request.headers.get('authorization')||''}},svc);
  if(profile.rol!=='master')fail(403,'Sólo administradores.');
  if(action==='list'){
   const query=members.orderBy('__name__').limit(101);
   const snap=await (validId(body.after)?query.startAfter(body.after):query).get();
   const rows=snap.docs.slice(0,100).map(d=>({id:d.id,...d.data()})).filter(m=>m.origin===origin).map(({id,card,name,email,phone,state,consent,registeredAt,googleSaved,googleIssued,lastPushAt,lastPushStatus})=>({id,card,name,email,phone,state,consent,registeredAt,googleSaved,googleIssued,lastPushAt,lastPushStatus}));
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
