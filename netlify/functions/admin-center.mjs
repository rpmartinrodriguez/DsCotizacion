import {admin,authorize,hash} from './lib/push-admin.mjs';
import {Timestamp} from './lib/firebase-rest.mjs';
const allowed=o=>o==='https://dulce-app.netlify.app'||/^https:\/\/[a-z0-9-]+--dulce-app\.netlify\.app$/.test(o);
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const date=v=>v?.toMillis?.()||0;
const rows=s=>s.docs.map(d=>({...d.data(),eventId:d.data().id,id:d.id}));
const validId=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export default async function(request){
    try{
        if(request.method!=='POST')return json(405,{ok:false});
        const origin=new URL(request.url).origin,header=request.headers.get('origin');
        if(!allowed(origin)||(header&&header!==origin))return json(403,{ok:false,message:'Origen no autorizado.'});
        const token=request.headers.get('authorization')||'';
        if(!token.startsWith('Bearer '))return json(401,{ok:false,message:'Iniciá sesión.'});
        const body=await request.json().catch(()=>null);
        if(!body||!['inbox','inbox-update','suppliers'].includes(body.action))return json(400,{ok:false,message:'Acción inválida.'});
        const svc=admin(),{db}=svc,{uid,profile}=await authorize({headers:{authorization:token}},svc);
        if(profile.rol!=='master')return json(403,{ok:false,message:'Sólo administradores.'});
        if(body.action==='suppliers'){
            const [observations,runs]=await Promise.all([
                db.collection('dsSupplierObservations').orderBy('__name__').limit(301).get(),
                db.collection('dsSupplierChecks').orderBy('__name__','desc').limit(7).get()
            ]);
            return json(200,{ok:true,observations:rows(observations).slice(0,300).map(d=>({id:d.id,name:d.name||'',price:d.price||0,checkedAt:date(d.checkedAt),lastAttempt:date(d.lastAttempt),error:d.lastError||'',history:(Array.isArray(d.history)?d.history:[]).slice(0,30).map(v=>({price:v.price,previous:v.previous,at:date(v.at)}))})),runs:rows(runs).map(d=>({day:d.day||d.id,done:d.done===true,checked:d.checked||0,changed:d.changed||0,errors:d.errors||0})),truncated:observations.size>300});
        }
        const prefs=db.collection('dsNotificationPrefs').doc(hash(uid+'|'+origin));
        if(body.action==='inbox-update'){
            if(!['read','hide'].includes(body.kind)||!Array.isArray(body.ids)||body.ids.length>100||body.ids.some(v=>!validId(v)))return json(400,{ok:false,message:'Selección inválida.'});
            await db.runTransaction(async tx=>{
                const old=(await tx.get(prefs)).data()||{},key=body.kind==='read'?'read':'hidden';
                const next=[...new Set([...(Array.isArray(old[key])?old[key]:[]),...body.ids])].slice(-500);
                tx.set(prefs,{[key]:next,updatedAt:Timestamp.now()},{merge:true});
            });
            return json(200,{ok:true});
        }
        // La consulta usa un solo índice y limita lecturas; el origen se filtra antes de responder.
        const [events,settings]=await Promise.all([db.collection('dsPushEvents').orderBy('claimedAt','desc').limit(150).get(),prefs.get()]);
        const values=settings.data()||{},read=new Set(values.read||[]),hidden=new Set(values.hidden||[]);
        const items=rows(events).filter(d=>d.origin===origin&&!hidden.has(d.id)).slice(0,100).map(d=>({id:d.id,title:d.title||'Aviso',body:d.body||'',path:['/pos.html','/stock.html','/index.html'].includes(d.path)?d.path:'/index.html',at:date(d.claimedAt),kind:String(d.eventId||'').startsWith('supplier-')||d.path==='/stock.html'?'proveedores':String(d.title||'').includes('Mercado Pago')?'ventas':'cajas',read:read.has(d.id),status:d.status||''}));
        return json(200,{ok:true,items,limited:events.size===150});
    }catch(e){console.error('admin-center',{code:e?.code||e?.publicCode||null});return json(e.status||503,{ok:false,message:e.status?e.message:'No se pudo cargar el centro de control. Revisá la conexión.'});}
}
