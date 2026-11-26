
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { createHash, createPrivateKey } from 'node:crypto';
export const productionOrigin = 'https://dulce-app.netlify.app';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const money = n => Number(n || 0).toLocaleString('es-AR',{style:'currency',currency:'ARS'});
export const reply = (statusCode,body) => ({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(body)});
const setupError=(publicCode,message)=>Object.assign(new Error(message),{status:503,publicCode});
export function parseServiceAccount(raw){
    if(!raw||!String(raw).trim())throw setupError('FIREBASE_CREDENTIALS_MISSING','Falta FIREBASE_SERVICE_ACCOUNT_JSON en este despliegue. Revisá Functions y Deploy Previews en Netlify.');
    let service;
    try{
        const value=String(raw).trim().replace(/^\uFEFF/,'');
        try{service=JSON.parse(value);}catch{service=JSON.parse(Buffer.from(value,'base64').toString('utf8'));}
        if(typeof service==='string')service=JSON.parse(service);
        if(!service||typeof service!=='object'||Array.isArray(service))throw Error('Formato');
    }catch{throw setupError('FIREBASE_CREDENTIALS_FORMAT','FIREBASE_SERVICE_ACCOUNT_JSON debe contener el JSON completo de la cuenta de servicio.');
    }
    const projectId=String(service.project_id||service.projectId||'').trim();
    const clientEmail=String(service.client_email||service.clientEmail||'').trim();
    const privateKey=String(service.private_key||service.privateKey||'').replace(/\\n/g,'\n').trim();
    if(projectId!=='dulcesall')throw setupError('FIREBASE_PROJECT_MISMATCH','Las credenciales deben pertenecer al proyecto Firebase dulcesall.');
    if(!clientEmail||!privateKey)throw setupError('FIREBASE_CREDENTIALS_INCOMPLETE','Faltan client_email o private_key en el JSON.');
    try{createPrivateKey(privateKey);}catch{throw setupError('FIREBASE_PRIVATE_KEY_INVALID','La clave privada tiene un formato inválido. Copiá el archivo JSON original completo.');}
    return {projectId,clientEmail,privateKey};
}
export function admin(){
    const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON||process.env.FIREBASE_SERVICE_ACCOUNT||process.env.FIREBASE_ADMIN_CREDENTIALS;
    let app=getApps().find(a=>a.name==='ds-push');
    if(!app){
        const service=parseServiceAccount(raw);
        try{app=initializeApp({credential:cert(service),projectId:'dulcesall'},'ds-push');}
        catch{throw setupError('FIREBASE_ADMIN_INIT','No se pudo inicializar Firebase Admin con las credenciales configuradas.');}
    }
    return {db:getFirestore(app),auth:getAuth(app),messaging:getMessaging(app)};
}
export async function activeProfile(db,uid) {
    const doc = await db.collection('usuarios').doc(uid).get();
    return doc.exists && doc.data().estado==='activo' ? doc.data() : null;
}
export async function authorize(event,services) {
    const token = (event.headers?.authorization || event.headers?.Authorization || '').replace(/^Bearer /,'');
    if (!token) throw Object.assign(new Error('Iniciá sesión.'),{status:401});
    let user;
    try { user = await services.auth.verifyIdToken(token); } catch(error) {
        if(['auth/argument-error','auth/id-token-expired','auth/id-token-revoked','auth/invalid-id-token','auth/user-disabled'].includes(error?.code))throw Object.assign(new Error('Sesión inválida o vencida. Volvé a iniciar sesión.'),{status:401,publicCode:'AUTH_INVALID'});
        throw error;
    }
    const profile = await activeProfile(services.db,user.uid);
    if (!profile) throw Object.assign(new Error('Usuario no autorizado.'),{status:403});
    return {uid:user.uid,profile};
}
export async function sendToDevices(services, origin, message, {uid=null,tokenHash=null}={}) {
    const {db,messaging}=services;
    const snap=await db.collection('dsPushDevices').where('origin','==',origin).get();
    const profiles=new Map();
    const now=Date.now();
    const devices=[];
    for (const d of snap.docs) {
        const v=d.data();
        if (!v.token || (uid && uid!==v.uid) || (tokenHash && tokenHash!==d.id) || (message.after && v.createdAt?.toMillis() > message.after)) continue;
        if (!profiles.has(v.uid)) profiles.set(v.uid,await activeProfile(db,v.uid));
        if (profiles.get(v.uid)?.rol!=='master') continue;
        if (v.updatedAt?.toMillis() < now-90*86400000) continue;
        devices.push(d);
    }
    let delivered=0;
    for(let i=0;i<devices.length;i+=400){
        const part=devices.slice(i,i+400);
        const result=await messaging.sendEachForMulticast({tokens:part.map(d=>d.data().token),data:{title:String(message.title),body:String(message.body).slice(0,800),path:message.path,eventId:message.id},webpush:{headers:{TTL:'86400',Urgency:'high'}}});
        delivered+=result.successCount;
        await Promise.all(result.responses.map((res,index)=>!res.success && ['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(res.error?.code)?part[index].ref.delete():Promise.resolve()));
    }
    return {delivered,devices:devices.length};
}
export async function dispatchOnce(services,origin,message) {
    const ref=services.db.collection('dsPushEvents').doc(hash(origin+'|'+message.id));
    const claim=await services.db.runTransaction(async tx=>{
        const old=await tx.get(ref);
        if(old.exists && (old.data().status==='sent' || (old.data().status==='sending' && old.data().claimedAt?.toMillis()>Date.now()-120000))) return false;
        tx.set(ref,{id:message.id,origin,status:'sending',claimedAt:Timestamp.now(),title:message.title,body:message.body,path:message.path},{merge:true});return true;
    });
    if(!claim)return {duplicate:true};
    try { const result=await sendToDevices(services,origin,message);await ref.update({status:'sent',sentAt:FieldValue.serverTimestamp(),...result});return result; }
    catch(error){await ref.update({status:'failed'});throw error;}
}

export function eventMessage(kind,id,d,time){
    const sale=kind==='mp-sale',close=kind==='drawer-close';
    return {id:kind+'-'+id,after:time,path:'/pos.html',title:sale?'Venta con Mercado Pago':close?'Caja cerrada':'Caja abierta',body:sale?money(d.pagoMercadoPago)+' por Mercado Pago · Total '+money(d.total)+' · '+(d.vendedor||'Mostrador'):close?(d.cerradaPor||d.usuarioNombre||'Operador')+' · '+(d.turno||'')+' · Efectivo '+money(d.totalEfectivo)+' · Mercado Pago '+money(d.totalMercadoPago):(d.usuarioNombre||'Operador')+' · '+(d.turno||'')+' · Fondo '+money(d.fondoInicial)};
}
