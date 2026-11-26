
import { admin,authorize,reply,hash,money,sendToDevices,dispatchOnce,productionOrigin,eventMessage } from './lib/push-admin.mjs';
import { Timestamp } from 'firebase-admin/firestore';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const handler=async event=>{
    try{
        if(event.httpMethod!=='POST')return reply(405,{ok:false});
        const origin=new URL(event.headers?.origin || '').origin;
        const host=String(event.headers?.host || '').toLowerCase();
        if(new URL(origin).host!==host || !(origin===productionOrigin || /^https:\/\/[a-z0-9-]+--dulce-app\.netlify\.app$/.test(origin)))throw fail(403,'Origen no autorizado.');
        const svc=admin(),{db}=svc;
        const {uid,profile}=await authorize(event,svc);
        const body=JSON.parse(event.body||'{}');
        const action=body.action;
        if(action==='event'){
            if(profile.rol!=='master' && profile.permisos?.mostrador!==true)throw fail(403,'Sin permiso de mostrador.');
            if(!['drawer-open','drawer-close','mp-sale'].includes(body.kind)|| !/^[a-zA-Z0-9_-]{1,180}$/.test(body.id||''))throw fail(400,'Evento inválido.');
            const sale=body.kind==='mp-sale',close=body.kind==='drawer-close';
            const snap=await db.collection(sale?'ventasMostrador':'cajas').doc(body.id).get();
            if(!snap.exists)throw fail(404,'Operación no encontrada.');
            const d=snap.data(),date=sale?d.fecha:close?d.fechaCierre:d.fechaApertura;
            const time=date?.toMillis?.()||0;
            if(!time||time<Date.now()-15*60000||time>Date.now()+60000)throw fail(400,'Operación fuera de la ventana de aviso.');
            if(sale && !(Number(d.pagoMercadoPago)>0))return reply(200,{ok:true,skipped:true});
            if(close && d.estado!=='cerrada')throw fail(400,'La caja no está cerrada.');
            const msg=eventMessage(body.kind,body.id,d,time);
            return reply(200,{ok:true,...await dispatchOnce(svc,origin,msg)});
        }
        if(profile.rol!=='master')throw fail(403,'Sólo administradores.');
        if(action==='config'){
            const vapidKey=process.env.FCM_VAPID_PUBLIC_KEY || '';
            if(!vapidKey)throw fail(503,'Falta FCM_VAPID_PUBLIC_KEY en Netlify.');
            return reply(200,{ok:true,vapidKey});
        }
        if(!['register','disable','test','status'].includes(action))throw fail(400,'Acción inválida.');
        if(typeof body.token!=='string'||body.token.length<20||body.token.length>4096)throw fail(400,'Token de dispositivo inválido.');
        const key=hash(body.token),ref=db.collection('dsPushDevices').doc(key);
        const existing=await ref.get(),owned=existing.exists&&existing.data().uid===uid&&existing.data().origin===origin;
        if(action==='register'){
            await ref.set({uid,origin,token:body.token,createdAt:owned?existing.data().createdAt:Timestamp.now(),updatedAt:Timestamp.now()});
            return reply(200,{ok:true});
        }
        if(action==='status')return reply(200,{ok:true,active:owned});
        if(action==='disable'){if(owned)await ref.delete();return reply(200,{ok:true});}
        if(!owned)throw fail(403,'Activá primero las notificaciones.');
        const result=await sendToDevices(svc,origin,{id:'test-'+Date.now(),title:'Dulce Sall · Prueba push',body:'Las notificaciones están configuradas en este dispositivo.',path:'/index.html'},{uid,tokenHash:key});
        if(!result.delivered)throw fail(502,'FCM no pudo entregar la prueba.');
        return reply(200,{ok:true,...result});
    }catch(e){console.error('ds-push',e.message);return reply(e.status||500,{ok:false,message:e.status?e.message:'No se pudo completar la operación push. Revisá la configuración de Firebase y Netlify.'});}
};
