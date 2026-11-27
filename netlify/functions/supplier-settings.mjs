
import {admin,authorize} from './lib/push-admin.mjs';
import {Timestamp} from './lib/firebase-rest.mjs';
import {normalizeSchedule,validateSchedule,scheduleRef} from './lib/supplier-schedule.mjs';
const allowed=origin=>origin==='https://dulce-app.netlify.app'||/^https:\/\/[a-z0-9-]+--dulce-app\.netlify\.app$/.test(origin);
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export default async function(request){
    try{
        if(request.method!=='POST')return json(405,{ok:false,message:'Método no permitido.'});
        const origin=new URL(request.url).origin;
        if(!allowed(origin)||(request.headers.get('origin')&&request.headers.get('origin')!==origin))return json(403,{ok:false,message:'Origen no autorizado.'});
        const token=request.headers.get('authorization')||'';
        if(!token.startsWith('Bearer '))return json(401,{ok:false,message:'Iniciá sesión.'});
        let body;try{body=await request.json();}catch{return json(400,{ok:false,message:'Solicitud inválida.'});}
        if(!['get','save'].includes(body?.action))return json(400,{ok:false,message:'Acción inválida.'});
        const svc=admin();
        const {uid,profile}=await authorize({headers:{authorization:token}},svc);
        if(profile.rol!=='master')return json(403,{ok:false,message:'Sólo administradores pueden configurar las consultas.'});
        const ref=scheduleRef(svc.db);
        if(body.action==='get'){
            const snap=await ref.get();
            const runs=await svc.db.collection('dsSupplierChecks').orderBy('__name__','desc').limit(1).get();
            const last=runs.docs[0]?.data();
            const lastRun=last?{day:last.day||runs.docs[0].id,done:last.done===true,checked:last.checked||0,changed:last.changed||0,errors:last.errors||0,initial:last.initial||0,startedAt:last.startedAt?.toMillis?.()||0,finishedAt:last.finishedAt?.toMillis?.()||0,summarySent:!!last.summarySentAt,summaryDelivered:last.summaryDelivered??null,summaryDevices:last.summaryDevices??null,summaryError:last.summaryError||''}:null;
            return json(200,{ok:true,schedule:normalizeSchedule(snap.data()),lastRun});
        }
        const value=validateSchedule(body.schedule);
        await ref.set({...value,updatedAt:Timestamp.now(),updatedBy:uid});
        return json(200,{ok:true,schedule:value});
    }catch(error){
        console.error('supplier-settings',{code:error?.code||error?.publicCode||null,status:error?.status||null});
        return json(error.status||503,{ok:false,message:error.status?error.message:'No se pudo acceder a la configuración de proveedores.'});
    }
}
