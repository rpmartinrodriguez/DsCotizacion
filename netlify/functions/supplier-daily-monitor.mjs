
import supplier from './lib/supplier-price.cjs';
import { admin,dispatchOnce,productionOrigin,money,hash } from './lib/push-admin.mjs';
import { FieldPath,Timestamp } from './lib/firebase-rest.mjs';
import { argentinaDay,shouldCheck,scheduleRef } from './lib/supplier-schedule.mjs';
const normal=s=>String(s||'').toLowerCase().trim().replace(/^(g|grs|gramo|gramos)$/,'gr').replace(/^(kilo|kilos)$/,'kg').replace(/^(un|u|unidades)$/,'unidad').replace(/^(lt|litro|litros)$/,'l');
const run=async()=>{
    // Scheduled functions run only in published production. Never change the official purchase cost.
    if(process.env.CONTEXT && process.env.CONTEXT!=='production')return {statusCode:200,body:'Preview: sin consultas automáticas.'};
    const svc=admin(),{db}=svc;
    const now=new Date(),day=argentinaDay(now).key;
    const settings=await scheduleRef(db).get();
    if(!shouldCheck(settings.data(),now))return {statusCode:200,body:'Consulta automática desactivada o día no seleccionado.'};
    const run=db.collection('dsSupplierChecks').doc(day);
    const claim=await db.runTransaction(async tx=>{const s=await tx.get(run),d=s.data()||{};if(d.done||d.leaseUntil?.toMillis()>Date.now())return null;tx.set(run,{day,leaseUntil:Timestamp.fromMillis(Date.now()+120000)},{merge:true});return d;});
    if(!claim)return {statusCode:200,body:'Ya revisado o en proceso.'};
    const query=db.collection('materiasPrimas').orderBy(FieldPath.documentId());
    const batch=await (claim.cursor?query.startAfter(claim.cursor):query).limit(3).get();
    const results=await Promise.all(batch.docs.map(async doc=>{
        const d=doc.data(),url=String(d.proveedorUrl||'').trim();
        if(!url)return {kind:'skip'};
        try{
            const observed=await supplier.detectSupplierPrice(url);
            const state=db.collection('dsSupplierObservations').doc(doc.id),old=(await state.get()).data()||{};
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
                await dispatchOnce(svc,productionOrigin,{id:'supplier-'+day+'-'+doc.id+'-'+hash(String(before)+'|'+next).slice(0,12),title:'Proveedor: '+(variation>0?'aumento de precio':'baja de precio'),body:(d.nombre||'Insumo')+' · '+money(before)+' → '+money(next)+' ('+(variation>0?'+':'')+variation.toFixed(2)+'%)',path:'/stock.html'});
            }
            await state.set({key,price:next,checkedAt:Timestamp.now(),source:observed.source||'',host:observed.host||'',name:d.nombre||'',day});
            return {kind:before>0&&Math.abs(before-next)>=0.01?'changed':'same'};
        }catch(e){console.warn('supplier daily',doc.id,e.message);await db.collection('dsSupplierObservations').doc(doc.id).set({lastError:String(e.message).slice(0,250),lastAttempt:Timestamp.now()},{merge:true});return {kind:'error'};}
    }));
    const done=batch.size<3;
    const count=kind=>results.filter(r=>r.kind===kind).length;
    const patch={checked:(claim.checked||0)+count('same')+count('changed'),changed:(claim.changed||0)+count('changed'),errors:(claim.errors||0)+count('error'),leaseUntil:Timestamp.fromMillis(0),done};
    if(batch.size)patch.cursor=batch.docs.at(-1).id;
    if(done)patch.finishedAt=Timestamp.now();
    await run.set(patch,{merge:true});
    return {statusCode:200,body:JSON.stringify(patch)};
};

export const config={schedule:"*/15 10-23,0-2 * * *"};
export default async function(){
    const result=await run();
    return new Response(result.body,{status:result.statusCode,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
}
