
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { createHash } from 'node:crypto';
export const productionOrigin = 'https://dulce-app.netlify.app';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const money = n => Number(n || 0).toLocaleString('es-AR',{style:'currency',currency:'ARS'});
export const reply = (statusCode,body) => ({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(body)});
export function admin() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_ADMIN_CREDENTIALS;
    if (!raw) throw new Error('Falta configurar FIREBASE_SERVICE_ACCOUNT_JSON en Netlify.');
    const service = JSON.parse(raw);
    if ((service.project_id || service.projectId) !== 'dulcesall') throw new Error('Las credenciales no corresponden al proyecto dulcesall.');
    const app = getApps().find(a=>a.name==='ds-push') || initializeApp({credential:cert(service),projectId:'dulcesall'},'ds-push');
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
    try { user = await services.auth.verifyIdToken(token); } catch { throw Object.assign(new Error('Sesión inválida.'),{status:401}); }
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
