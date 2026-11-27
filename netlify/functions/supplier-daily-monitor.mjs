
import supplier from './lib/supplier-price.cjs';
import { admin,dispatchOnce,productionOrigin,money,hash } from './lib/push-admin.mjs';
import { FieldPath,Timestamp } from './lib/firebase-rest.mjs';
import { argentinaDay,shouldCheck,scheduleRef,normalizeSchedule } from './lib/supplier-schedule.mjs';
const normal=s=>String(s||'').toLowerCase().trim().replace(/^(g|grs|gramo|gramos)$/,'gr').replace(/^(kilo|kilos)$/,'kg').replace(/^(un|u|unidades)$/,'unidad').replace(/^(lt|litro|litros)$/,'l');
export function supplierSummary(day,stats){
    const checked=Number(stats.checked)||0,changed=Number(stats.changed)||0,errors=Number(stats.errors)||0,initial=Number(stats.initial)||0;
    const same=Math.max(0,checked-changed-initial);
    const title=errors?'Proveedores: revisión con incidencias':changed?'Proveedores: revisión finalizada':checked===0?'Proveedores: sin insumos vinculados':initial?'Proveedores: revisión finalizada':'Proveedores: sin cambios';
    const body=checked+' precios revisados · '+changed+' cambios · '+same+' sin cambios'+(initial?' · '+initial+' referencias iniciales':'')+' · '+errors+' consultas fallidas.'+(errors?' Revisá el detalle en Stock.':'')+(checked===0&&!errors?' Agregá enlaces de proveedor en Stock.':'');
    return {id:'supplier-summary-'+day,title,body,path:'/stock.html'};
}
const publishSummary=async(svc,ref,day,stats)=>{
    if(stats.summarySentAt)return;
    const message=supplierSummary(day,stats);
    try{
        await dispatchOnce(svc,productionOrigin,message);
        const event=await svc.db.collection('dsPushEvents').doc(hash(productionOrigin+'|'+message.id)).get();
        if(event.exists&&event.data().status==='sent'){
            await ref.set({summarySentAt:Timestamp.now(),summaryDevices:Number(event.data().devices)||0,summaryDelivered:Number(event.data().delivered)||0,summaryError:''},{merge:true});
        }
    }catch(e){
        console.warn('supplier-summary',day,e.code||'ERROR');
        await ref.set({summaryError:String(e.code||'ERROR').slice(0,100),summaryLastAttempt:Timestamp.now()},{merge:true});
    }
};
const run=async()=>{
    // Scheduled functions run only in published production. Never change the official purchase cost.
    if(process.env.CONTEXT && process.env.CONTEXT!=='production')return {statusCode:200,body:'Preview: sin consultas automáticas.'};
    const svc=admin(),{db}=svc;
    const now=new Date(),today=argentinaDay(now).key;
    const settings=await scheduleRef(db).get(),schedule=normalizeSchedule(settings.data());
    if(!schedule.enabled)return {statusCode:200,body:'Consulta automática desactivada.'};
    const collection=db.collection('dsSupplierChecks');
    let day=today,run=collection.doc(today),current=(await run.get()).data()||{};
    // Continuar una revisión iniciada el día anterior si cruzó medianoche.
    if(!current.startedAt&&!current.done){
        const yesterday=argentinaDay(new Date(now.getTime()-86400000)).key,priorRef=collection.doc(yesterday),prior=(await priorRef.get()).data()||{};
        if(prior.summaryVersion===1&&prior.startedAt&&!prior.done){day=yesterday;run=priorRef;current=prior;}
        else if(prior.summaryVersion===1&&prior.done&&!prior.summarySentAt&&!shouldCheck(schedule,now)){await publishSummary(svc,priorRef,yesterday,prior);return {statusCode:200,body:'Reintento resumen anterior.'};}
    }
    if(!current.startedAt&&!current.done&&!shouldCheck(schedule,now))return {statusCode:200,body:'Día no seleccionado o antes del horario.'};
    if(current.done){if(current.summaryVersion===1&&!current.summarySentAt)await publishSummary(svc,run,day,current);return {statusCode:200,body:'Ya revisado.'};}
    const claim=await db.runTransaction(async tx=>{const s=await tx.get(run),d=s.data()||{};if(d.done||d.leaseUntil?.toMillis()>Date.now())return null;tx.set(run,{day,summaryVersion:1,scheduledTime:d.scheduledTime||schedule.time,startedAt:d.startedAt||Timestamp.now(),leaseUntil:Timestamp.fromMillis(Date.now()+120000)},{merge:true});return d;});
    if(!claim)return {statusCode:200,body:'Ya revisado o en proceso.'};
    const query=db.collection('materiasPrimas').orderBy(FieldPath.documentId());
    // Avanzar hasta 25 documentos por ejecución, pero consultar como máximo 3 sitios externos a la vez.
    const batch=await (claim.cursor?query.startAfter(claim.cursor):query).limit(25).get();
    let linked=0,processed=[];
    for(const doc of batch.docs){processed.push(doc);if(String(doc.data().proveedorUrl||'').trim()&&++linked===3)break;}
    const results=await Promise.all(processed.map(async doc=>{
        const d=doc.data(),url=String(d.proveedorUrl||'').trim();
        if(!url)return {kind:'skip'};
        try{
            const state=db.collection('dsSupplierObservations').doc(doc.id),old=(await state.get()).data()||{};
            if(old.day===day&&['same','initial','changed'].includes(old.runKind))return {kind:old.runKind};
            const observed=await supplier.detectSupplierPrice(url);
            const configuredQty=Number(d.proveedorPresentacionCantidad)||0,configuredUnit=normal(d.proveedorPresentacionUnidad);
            const detectedQty=Number(observed.packageQuantity)||0,detectedUnit=normal(observed.packageUnit);
            if(configuredQty && configuredUnit && detectedQty && detectedUnit && (configuredQty!==detectedQty||configuredUnit!==detectedUnit))throw new Error('La presentación detectada difiere de la configurada; requiere revisión manual.');
            const key=hash(url+'|'+configuredQty+'|'+configuredUnit);
            const saved=Number(d.proveedorPrecioActual)||0;
            // El primer valor guardado por el proveedor es la referencia inicial; luego comparar con la última observación.
            const before=old.key===key?Number(old.price)||0:saved;
            const next=Number(observed.price);
            if(!Number.isFinite(next)||next<=0)throw new Error('Precio no válido.');
            if(before>0 && Math.abs(before-next)>=0.01){
                const variation=(next-before)/before*100;
                try{await dispatchOnce(svc,productionOrigin,{id:'supplier-'+day+'-'+doc.id+'-'+hash(String(before)+'|'+next).slice(0,12),title:'Proveedor: '+(variation>0?'aumento de precio':'baja de precio'),body:(d.nombre||'Insumo')+' · '+money(before)+' → '+money(next)+' ('+(variation>0?'+':'')+variation.toFixed(2)+'%)',path:'/stock.html'});}catch(e){console.warn('supplier change push',doc.id,e.code||'ERROR');}
            }
            const checkedAt=Timestamp.now();
            const history=old.key===key&&Array.isArray(old.history)?old.history:[];
            const entry={price:next,previous:before||null,at:checkedAt};
            const recorded=history.length&&Number(history[0].price)===next?history:[entry,...history].slice(0,30);
            const kind=before<=0?'initial':Math.abs(before-next)>=0.01?'changed':'same';
            await state.set({key,price:next,checkedAt,source:observed.source||'',host:observed.host||'',name:d.nombre||'',day,runKind:kind,history:recorded,configuredQty,configuredUnit,url});
            return {kind};
        }catch(e){console.warn('supplier daily',doc.id,e.message);await db.collection('dsSupplierObservations').doc(doc.id).set({lastError:String(e.message).slice(0,250),lastAttempt:Timestamp.now()},{merge:true});return {kind:'error'};}
    }));
    const done=batch.size<25&&processed.length===batch.size;
    const count=kind=>results.filter(r=>r.kind===kind).length;
    const patch={checked:(claim.checked||0)+count('same')+count('changed')+count('initial'),changed:(claim.changed||0)+count('changed'),initial:(claim.initial||0)+count('initial'),errors:(claim.errors||0)+count('error'),skipped:(claim.skipped||0)+count('skip'),leaseUntil:Timestamp.fromMillis(0),done};
    if(processed.length)patch.cursor=processed.at(-1).id;
    if(done)patch.finishedAt=Timestamp.now();
    await run.set(patch,{merge:true});
    if(done)await publishSummary(svc,run,day,patch);
    return {statusCode:200,body:JSON.stringify(patch)};
};

export const config={schedule:"*/5 * * * *"};
export default async function(){
    const result=await run();
    return new Response(result.body,{status:result.statusCode,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
}
