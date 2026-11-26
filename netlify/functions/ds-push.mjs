
const productionOrigin='https://dulce-app.netlify.app';
const allowedOrigin=v=>v===productionOrigin||/^https:\/\/[a-z0-9-]+--dulce-app\.netlify\.app$/.test(v);
const reply=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)});
function originOf(event){
    const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
    let rawOrigin='';
    try{rawOrigin=new URL(event.rawUrl||'').origin;}catch{}
    let headerOrigin='';
    if(headers.origin){try{headerOrigin=new URL(headers.origin).origin;}catch{throw fail(403,'Origen inválido.');}}
    const origin=[rawOrigin,'https://'+String(headers.host||'').toLowerCase()].find(allowedOrigin);
    if(!origin||(headerOrigin&&headerOrigin!==origin))throw fail(403,'Origen no autorizado.');
    return origin;
}
function publicError(error,stage){
    if(error?.status)return {status:error.status,code:error.publicCode||'REQUEST_REJECTED',message:error.message};
    const code=String(error?.code||'').toLowerCase(),msg=String(error?.message||'').toLowerCase();
    if(code==='8'||code.includes('resource_exhausted')||msg.includes('resource_exhausted'))return {status:503,code:'FIREBASE_QUOTA',message:'Firebase alcanzó su cuota de operaciones.'};
    if(code==='7'||code.includes('permission-denied')||code.includes('permission_denied')||msg.includes('permission_denied'))return {status:503,code:'FIREBASE_PERMISSION',message:'La cuenta de servicio no tiene permisos suficientes en Firebase. Revisá IAM y acceso a Firestore/FCM.'};
    if(code==='16'||code.includes('invalid-credential')||code.includes('unauthenticated')||msg.includes('invalid_grant')||msg.includes('invalid jwt signature'))return {status:503,code:'FIREBASE_CREDENTIAL_REJECTED',message:'Firebase rechazó la cuenta de servicio. Verificá que la clave esté activa y pertenezca a dulcesall.'};
    if(stage==='load')return {status:503,code:'PUSH_RUNTIME',message:'No se pudo cargar Firebase Admin en Netlify.'};
    if(stage==='authorize')return {status:503,code:'FIREBASE_AUTH_CHECK',message:'No se pudo verificar el perfil en Firebase. Revisá credenciales y permisos de la cuenta de servicio.'};
    if(stage==='register')return {status:503,code:'PUSH_REGISTER_FAILED',message:'No se pudo guardar el dispositivo en Firestore. Revisá permisos y cuota.'};
    if(stage==='test')return {status:503,code:'PUSH_SEND_FAILED',message:'FCM no pudo enviar la prueba. Revisá que la API de FCM esté habilitada y que la cuenta tenga permisos.'};
    return {status:500,code:'PUSH_SERVER_ERROR',message:'No se pudo completar la operación push. Revisá el registro de ds-push en Netlify.'};
}
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const handler=async event=>{
    let stage='request';
    try{
        if(event.httpMethod!=='POST')return reply(405,{ok:false});
        const origin=originOf(event);
        const authorization=Object.entries(event.headers||{}).find(([k])=>k.toLowerCase()==='authorization')?.[1];
        if(!authorization?.startsWith('Bearer '))throw fail(401,'Iniciá sesión nuevamente.');
        let body;try{body=JSON.parse(event.body||'{}');}catch{throw fail(400,'Solicitud inválida.');}
        const action=body?.action;
        if(!['event','config','register','disable','test','status'].includes(action))throw fail(400,'Acción inválida.');
        stage='load';
        const {admin,authorize,hash,sendToDevices,dispatchOnce,eventMessage}=await import('./lib/push-admin.mjs');
        const {Timestamp}=await import('firebase-admin/firestore');
        stage='initialize';
        const svc=admin(),{db}=svc;
        stage='authorize';
        const {uid,profile}=await authorize({...event,headers:{...event.headers,authorization}},svc);
        stage=action;
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
            const vapidKey=String(process.env.FCM_VAPID_PUBLIC_KEY||'').trim();
            if(!vapidKey)throw Object.assign(fail(503,'Falta FCM_VAPID_PUBLIC_KEY en este despliegue.'),{publicCode:'VAPID_MISSING'});
            const bytes=Buffer.from(vapidKey,'base64url');
            if(!/^[A-Za-z0-9_-]+={0,2}$/.test(vapidKey)||bytes.length!==65||bytes[0]!==4)throw Object.assign(fail(503,'FCM_VAPID_PUBLIC_KEY debe ser la clave pública Web Push de Firebase, no la API key.'),{publicCode:'VAPID_INVALID'});
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
    }catch(e){const result=publicError(e,stage);console.error('ds-push',{stage,code:result.code,firebaseCode:e?.code||null});return reply(result.status,{ok:false,code:result.code,message:result.message});}
};
