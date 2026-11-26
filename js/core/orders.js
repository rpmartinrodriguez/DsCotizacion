export const ORDER_STAGES=['presupuestado','confirmado','produccion','listo','entregado'];
export const ORDER_LABELS={presupuestado:'Presupuestado',confirmado:'Confirmado',produccion:'En producción',listo:'Listo para entregar',entregado:'Entregado'};
export const orderStage=p=>p?.esVenta===true?(ORDER_STAGES.slice(1).includes(p.estadoPedido)?p.estadoPedido:'confirmado'):'presupuestado';
export const nextStage=p=>ORDER_STAGES[ORDER_STAGES.indexOf(orderStage(p))+1]||null;
export const orderDate=value=>{try{const d=value?.toDate?value.toDate():value?.seconds!==undefined?new Date(value.seconds*1000):new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):'';}catch{return '';}};
export function aggregateIngredients(items){
 const map=new Map();
 for(const row of items||[]){const id=row.idMateriaPrima||row.id,qty=Number(row.cantidadTotal??row.cantidad);
 if(typeof id!=='string'||!id||id.includes('/')||!Number.isFinite(qty)||qty<=0)throw Error('Hay ingredientes sin identificación o cantidad válida. Revisá el presupuesto.');
 const prior=map.get(id);map.set(id,{id,qty:qty+(prior?.qty||0),name:row.nombreMateriaPrima||row.nombre||prior?.name||id});}
 return [...map.values()];
}
export function consumeLots(lots,quantity){
 const output=(Array.isArray(lots)?lots:[]).map(x=>({...x}));
 if(!output.length)throw Error('Un insumo no tiene lotes. Revisá Stock antes de confirmar el pedido.');
 const millis=x=>x?.toMillis?.()??(x?.seconds!==undefined?x.seconds*1000:Date.parse(x)||0);
 output.sort((a,b)=>millis(a.fechaCompra)-millis(b.fechaCompra));
 let remaining=quantity;
 for(const lot of output){const available=Math.max(0,Number(lot.stockRestante)||0),used=Math.min(available,remaining);lot.stockRestante=(Number(lot.stockRestante)||0)-used;remaining-=used;if(remaining<=1e-9)break;}
 if(remaining>1e-9)output.at(-1).stockRestante=(Number(output.at(-1).stockRestante)||0)-remaining;
 return output;
}
