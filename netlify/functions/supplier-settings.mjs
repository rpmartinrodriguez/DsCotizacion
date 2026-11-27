
import {admin,authorize} from './lib/push-admin.mjs';
import {Timestamp} from './lib/firebase-rest.mjs';
import {normalizeSchedule,validateSchedule,scheduleRef} from './lib/supplier-schedule.mjs';
const allowed=origin=>origin==='https://dulce-app.netlify.app'||/^https:\/\/[a-z0-9-]+--dulce-app\.netlify\.app$/.test(origin);
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export default async function(request){
    let stage='request';
    try{
        if(request.method!=='POST')return json(405,{ok:false,message:'Método no permitido.'});
        const origin=new URL(request.url).origin;
        if(!allowed(origin)||(request.headers.get('origin')&&request.headers.get('origin')!==origin))return json(403,{ok:false,message:'Origen no autorizado.'});
        const token=request.headers.get('authorization')||'';
        if(!token.startsWith('Bearer '))return json(401,{ok:false,message:'Iniciá sesión.'});
        let body;try{body=await request.json();}catch{return json(400,{ok:false,message:'Solicitud inválida.'});}
        if(!['get','save','history'].includes(body?.action))return json(400,{ok:false,message:'Acción inválida.'});
        stage='credentials';
        const svc=admin();
        stage='authorize';
        const {uid,profile}=await authorize({headers:{authorization:token}},svc);
        if(profile.rol!=='master')return json(403,{ok:false,message:'Sólo administradores pueden configurar las consultas.'});
        const ref=scheduleRef(svc.db);
        if(body.action==='get'){
            stage='read-schedule';
            const snap=await ref.get();
            return json(200,{ok:true,schedule:normalizeSchedule(snap.data())});
        }
        if(body.action==='history'){
            stage='read-history';
            const runs=await svc.db.collection('dsSupplierChecks').orderBy('__name__','desc').limit(1).get();
            const last=runs.docs[0]?.data();
            const lastRun=last?{day:last.day||runs.docs[0].id,done:last.done===true,checked:last.checked||0,changed:last.changed||0,errors:last.errors||0,initial:last.initial||0,startedAt:last.startedAt?.toMillis?.()||0,finishedAt:last.finishedAt?.toMillis?.()||0,summarySent:!!last.summarySentAt,summaryDelivered:last.summaryDelivered??null,summaryDevices:last.summaryDevices??null,summaryError:last.summaryError||''}:null;
            return json(200,{ok:true,lastRun});
        }
        const value=validateSchedule(body.schedule);
        stage='save-schedule';
        await ref.set({...value,updatedAt:Timestamp.now(),updatedBy:uid});
        return json(200,{ok:true,schedule:value});
    }catch(error){
        const raw=String(error?.publicCode||error?.code||error?.name||'UNKNOWN');
        const code=/^[A-Za-z0-9_/-]{1,80}$/.test(raw)?raw:'UNKNOWN';
        const messages={RESOURCE_EXHAUSTED:'Firebase alcanzó su cuota de operaciones.',PERMISSION_DENIED:'La cuenta de servicio no tiene permiso para esta operación de Firestore.',UNAUTHENTICATED:'Firebase rechazó las credenciales.',invalid_grant:'Google rechazó la cuenta de servicio.',TimeoutError:'Firebase no respondió a tiempo.',INVALID_ARGUMENT:'Firebase rechazó la consulta.',FAILED_PRECONDITION:'Firebase requiere revisar la configuración de la consulta.'};
        console.error('supplier-settings',{stage,code,status:error?.status||error?.httpStatus||null});
        return json(error.status||503,{ok:false,stage,code,message:error.status?error.message:messages[code]||'No se pudo completar la operación de proveedores.'});
    }
}
