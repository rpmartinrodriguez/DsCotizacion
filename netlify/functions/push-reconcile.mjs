
import {admin,dispatchOnce,productionOrigin,eventMessage} from './lib/push-admin.mjs';
import {Timestamp} from 'firebase-admin/firestore';
const run=async()=>{
    if(process.env.CONTEXT&&process.env.CONTEXT!=='production')return {statusCode:200,body:'Preview'};
    const svc=admin(),{db}=svc;
    // Backup for a closed browser or an interrupted immediate request. No historical backfill.
    const since=Timestamp.fromMillis(Date.now()-15*60000);
    const devices=await db.collection('dsPushDevices').where('origin','==',productionOrigin).limit(1).get();
    if(devices.empty)return {statusCode:200,body:'No hay dispositivos.'};
    const specs=[['mp-sale','ventasMostrador','fecha'],['drawer-open','cajas','fechaApertura'],['drawer-close','cajas','fechaCierre']];
    const groups=await Promise.all(specs.map(async ([kind,collection,field])=>{
        const s=await db.collection(collection).where(field,'>=',since).orderBy(field,'desc').limit(60).get();
        return s.docs.flatMap(doc=>{
            const d=doc.data();
            if(kind==='mp-sale'&&(!(Number(d.pagoMercadoPago)>0)||d.costoSnapshotVersion!==2))return [];
            if(kind==='drawer-close'&&d.estado!=='cerrada')return [];
            const time=d[field]?.toMillis?.()||0;
            if(time>Date.now()+60000||!time)return [];
            return [eventMessage(kind,doc.id,d,time)];
        });
    }));
    const messages=groups.flat();
    const started=Date.now();
    let processed=0;
    for(let i=0;i<messages.length&&Date.now()-started<18000;i+=5){
        await Promise.allSettled(messages.slice(i,i+5).map(m=>dispatchOnce(svc,productionOrigin,m)));
        processed+=Math.min(5,messages.length-i);
    }
    return {statusCode:200,body:JSON.stringify({processed,total:messages.length})};
};

export const config={schedule:"*/5 * * * *"};
export default async function(){
    const result=await run();
    return new Response(result.body,{status:result.statusCode,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
}
