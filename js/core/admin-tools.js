import {escapeHtml} from './html.js';
import {formatCurrency} from './format.js';
import {getEffectiveUnitCost} from './pricing.js';
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const money=v=>formatCurrency(Number(v)||0);
const date=v=>v?new Date(v).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',dateStyle:'short',timeStyle:'short'}):'Sin consulta';
const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const btn=(text,fn,cls='btn-secondary')=>{const el=make('button',cls,text);el.type='button';el.addEventListener('click',fn);return el;};
const readLocal=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const writeLocal=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
export function mountAdminTools({session,p,header,navMenu}){
 if(document.getElementById('ds-global-search'))return;
 const master=session.rol==='master',auth=session.auth,uid=auth.currentUser?.uid;
 if(!uid)return;
 const favoriteKey='ds-favorite-pages:'+uid,cache=new Map();
 const routes=[...document.querySelectorAll('.ds-topnav-panel .nav-menu__link')].map(a=>({label:a.textContent.trim(),href:a.getAttribute('href'),type:'Acceso'})).filter(x=>x.href);
 const allowedRoutes=new Set(routes.map(x=>x.href));
 const favorites=()=>{const v=readLocal(favoriteKey,[]);return Array.isArray(v)?v.filter(x=>allowedRoutes.has(x)):[];};
 const api=async(action,extra={})=>{
    if(!auth.currentUser||auth.currentUser.uid!==uid)throw Error('Volvé a iniciar sesión.');
    const response=await fetch('/.netlify/functions/admin-center',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await auth.currentUser.getIdToken()},body:JSON.stringify({action,...extra})});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok)throw Error(data?.message||'No se pudo conectar (HTTP '+response.status+').');
    return data;
 };
 const firestore=()=>import('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');
 const getCollection=async(name,max=500,force=false)=>{
    const old=cache.get(name+max);
    if(!force&&old&&Date.now()-old.at<120000)return old.promise;
    const promise=(async()=>{const f=await firestore(),db=f.getFirestore(auth.app),snap=await f.getDocs(f.query(f.collection(db,name),f.limit(max+1)));return {rows:snap.docs.slice(0,max).map(d=>({...d.data(),id:d.id})),limited:snap.size>max};})();
    cache.set(name+max,{at:Date.now(),promise});
    try{return await promise;}catch(e){cache.delete(name+max);throw e;}
 };
 const dialog=(title)=>{
    const d=make('dialog','ds-tools-dialog'),head=make('div','ds-tools-head'),h=make('h2','',title),close=btn('×',()=>d.close());
    close.setAttribute('aria-label','Cerrar');head.append(h,close);const body=make('div','ds-tools-body');d.append(head,body);document.body.append(d);return {d,body};
 };
 const toast=message=>{let el=document.getElementById('ds-tools-toast');if(!el){el=make('div','ds-tools-toast');el.id='ds-tools-toast';el.setAttribute('role','status');document.body.append(el);}el.textContent=message;el.hidden=false;clearTimeout(el._hide);el._hide=setTimeout(()=>el.hidden=true,2800);};
 const search=dialog('Buscar en Dulce Sall'),input=make('input','ds-tools-input'),results=make('div','ds-tools-results'),note=make('p','ds-tools-muted');
 input.type='search';input.placeholder='Producto, ingrediente, cliente o sección…';input.setAttribute('aria-label','Buscar');
 search.body.append(input,note,results);
 const searchButton=btn('⌕',()=>{if(!search.d.open){search.d.showModal();input.focus();renderSearch();}});
 searchButton.id='ds-global-search';searchButton.className='ds-global-search';searchButton.title='Buscar (Ctrl + K)';searchButton.setAttribute('aria-label','Buscar en la aplicación');
 header.append(searchButton);
 let request=0,timer;
 const rowLink=(row,star=false)=>{
    const line=make('div','ds-tools-row'),link=make('a','',row.label),small=make('small','',row.type);link.href=row.href;
    const copy=make('div');copy.append(link,small);line.append(copy);
    if(star){const favorite=btn(favorites().includes(row.href)?'★':'☆',()=>{let arr=favorites();arr=arr.includes(row.href)?arr.filter(x=>x!==row.href):[...arr,row.href].slice(-8);writeLocal(favoriteKey,arr);renderSearch();});favorite.setAttribute('aria-label','Marcar favorito: '+row.label);line.append(favorite);}
    return line;
 };
 const renderSearch=async()=>{
    const id=++request,q=norm(input.value);results.replaceChildren();note.textContent='';
    const favoriteRows=routes.filter(r=>favorites().includes(r.href));
    const immediate=q?routes.filter(r=>norm(r.label).includes(q)):favoriteRows.length?favoriteRows:routes.slice(0,8);
    if(immediate.length){results.append(make('h3','',q?'Secciones':favoriteRows.length?'Favoritos':'Accesos rápidos'));immediate.forEach(r=>results.append(rowLink(r,true)));}
    if(q.length<2){note.textContent='Escribí al menos dos letras para buscar datos. Ctrl + K abre este buscador.';return;}
    const sources=[];
    if(p.recetas||p.precios||p.stock)sources.push({name:'recetas',label:'Producto / receta',field:'nombreTorta',href:r=>'productos.html?id='+encodeURIComponent(r.id)});
    if(p.stock)sources.push({name:'materiasPrimas',label:'Materia prima',field:'nombre',href:r=>'stock.html?buscar='+encodeURIComponent(r.nombre||'')});
    if(p.clientes)sources.push({name:'clientes',label:'Cliente',field:'nombre',href:r=>'clientes.html?buscar='+encodeURIComponent(r.nombre||'')});
    note.textContent='Buscando datos…';
    const batches=await Promise.allSettled(sources.map(async source=>({source,...await getCollection(source.name)})));
    if(id!==request||!search.d.open)return;
    let count=0,limited=false,fail=0;
    for(const b of batches){if(b.status!=='fulfilled'){fail++;continue;}const {source,rows,limited:cap}=b.value;limited ||= cap;const matches=rows.filter(r=>norm([r[source.field],r.codigoBarras,r.telefono].filter(Boolean).join(' ')).includes(q)).slice(0,12);if(matches.length){results.append(make('h3','',source.label));for(const r of matches){count++;results.append(rowLink({label:r[source.field]||'Sin nombre',href:source.href(r),type:source.label}));}}}
    note.textContent=(count||immediate.length?'Resultados disponibles.':'No encontramos coincidencias.')+(limited?' Búsqueda acotada a 500 registros por colección.':'')+(fail?' Algunas colecciones no se pudieron consultar.':'');
 };
 input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(renderSearch,180);});
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]')){e.preventDefault();searchButton.click();}});
 if(!master)return;
 const inbox=dialog('Notificaciones'),inboxStatus=make('p','ds-tools-muted'),inboxList=make('div','ds-tools-results'),filter=make('select','ds-tools-input'),actions=make('div','ds-tools-actions');
 for(const [v,label] of [['all','Todas'],['unread','No leídas'],['ventas','Ventas'],['cajas','Cajas'],['proveedores','Proveedores'],['fidelizacion','Fidelización']]){const o=make('option','',label);o.value=v;filter.append(o);}
 let notifications=[],inboxBusy=false;
 const renderInbox=()=>{inboxList.replaceChildren();const visible=notifications.filter(n=>filter.value==='all'||(filter.value==='unread'?!n.read:n.kind===filter.value));const unread=notifications.filter(n=>!n.read).length;try{sessionStorage.setItem('ds-inbox-unread:'+uid,String(unread));}catch{}inboxStatus.textContent=unread+' sin leer · hasta 100 avisos recientes';const bell=document.getElementById('ds-push-open');if(bell){bell.dataset.unread=unread?String(unread):'';bell.title=unread?unread+' notificaciones sin leer':'Notificaciones';}if(!visible.length)inboxList.append(make('p','ds-tools-muted','No hay avisos para mostrar.'));
    for(const n of visible){const row=make('article','ds-tools-notice'+(!n.read?' unread':'')),title=make('strong','',n.title),content=make('p','',n.body),time=make('small','',date(n.at)),controls=make('div','ds-tools-actions'),link=make('a','','Abrir módulo');link.href=n.path;controls.append(link);if(!n.read)controls.append(btn('Leída',()=>mutate('read',[n.id])));controls.append(btn('Eliminar',()=>mutate('hide',[n.id])));row.append(title,content,time,controls);inboxList.append(row);}
 };
 const loadInbox=async()=>{if(inboxBusy)return;inboxBusy=true;inboxStatus.textContent='Cargando avisos…';try{notifications=(await api('inbox')).items;renderInbox();}catch(e){inboxStatus.textContent=e.message;}finally{inboxBusy=false;}};
 const mutate=async(kind,ids)=>{if(inboxBusy||!ids.length)return;inboxBusy=true;try{await api('inbox-update',{kind,ids});notifications=kind==='hide'?notifications.filter(n=>!ids.includes(n.id)):notifications.map(n=>ids.includes(n.id)?{...n,read:true}:n);renderInbox();}catch(e){inboxStatus.textContent=e.message;}finally{inboxBusy=false;}};
 actions.append(btn('Actualizar',loadInbox),btn('Marcar todas como leídas',()=>mutate('read',notifications.filter(n=>!n.read).map(n=>n.id))),btn('Configurar push',()=>{inbox.d.close();window.dispatchEvent(new Event('ds-open-push-settings'));}));
 filter.addEventListener('change',renderInbox);inbox.body.append(actions,filter,inboxStatus,inboxList);
 window.addEventListener('ds-push-received',()=>{if(inbox.d.open)loadInbox();else{const bell=document.getElementById('ds-push-open');if(bell)bell.dataset.unread='•';try{sessionStorage.setItem('ds-inbox-unread:'+uid,'•');}catch{}}});
 window.addEventListener('ds-open-inbox',e=>{e.preventDefault();if(!inbox.d.open){inbox.d.showModal();loadInbox();}});
 const supplier=dialog('Centro de proveedores'),supStatus=make('p','ds-tools-muted'),supList=make('div','ds-tools-results'),supSearch=make('input','ds-tools-input');supSearch.type='search';supSearch.placeholder='Buscar insumo o proveedor…';
 let supplyData=null;
 const renderSupplier=()=>{
    if(!supplyData)return;const {observations,runs,materials,recipes,alternatives=[]}=supplyData,q=norm(supSearch.value),obs=new Map(observations.map(x=>[x.id,x]));supList.replaceChildren();
    const last=runs[0];supStatus.textContent=last?'Última ejecución: '+last.day+' · '+(last.done?'Finalizada':'En proceso')+' · '+last.checked+' revisados · '+last.changed+' cambios · '+last.errors+' errores':'Aún no hay ejecuciones automáticas registradas.';
    const list=materials.filter(m=>m.proveedorUrl||obs.has(m.id)).filter(m=>norm([m.nombre,m.proveedorUltimoHost,m.proveedorUrl].join(' ')).includes(q)).slice(0,100);
    for(const m of list){
       const o=obs.get(m.id),card=make('article','ds-tools-notice'),name=make('strong','',m.nombre||'Insumo'),stored=Number(m.proveedorPrecioActual)||0,latest=Number(o?.price)||0,affected=recipes.filter(r=>Array.isArray(r.ingredientes)&&r.ingredientes.some(i=>i?.idMateriaPrima===m.id));
       const normalizeUnit=s=>String(s||'').toLowerCase().trim().replace(/^(g|grs|gramo|gramos)$/,'gr').replace(/^(kilo|kilos)$/,'kg').replace(/^(un|u|unidades)$/,'unidad').replace(/^(lt|litro|litros)$/,'l');
       const compatible=Boolean(o?.url&&o.url===String(m.proveedorUrl||'').trim()&&Number(o.configuredQty)===Number(m.proveedorPresentacionCantidad)&&normalizeUnit(o.configuredUnit)===normalizeUnit(m.proveedorPresentacionUnidad)&&Number(m.proveedorCantidadBase)>0);
       const diff=stored>0&&latest>0&&compatible?(latest-stored)/stored*100:null;
       card.append(name,make('p','', 'Registrado: '+(stored?money(stored):'—')+' · Observado: '+(latest?money(latest):'—')+(diff===null?'':' · '+(diff>=0?'+':'')+diff.toFixed(1)+'%')));
       card.append(make('small','', 'Última consulta: '+date(o?.checkedAt)+' · '+affected.length+' recetas vinculadas'));
       if(o?.error)card.append(make('p','ds-tools-error','Último intento: '+o.error));
       const history=make('details'),summary=make('summary','','Historial y recetas afectadas');history.append(summary);
       const items=[...(o?.history||[]).map(x=>({at:x.at,price:x.price,source:'Automático'})),...(m.historialPreciosProveedor||[]).map(x=>({at:x.fecha?.toMillis?.()||0,price:x.precioNuevo,source:'Manual'}))].filter(x=>x.at&&Number(x.price)>0).sort((a,b)=>b.at-a.at).slice(0,20);
       if(items.length)for(const h of items)history.append(make('p','',date(h.at)+' · '+money(h.price)+' · '+h.source));else history.append(make('p','ds-tools-muted','Sin historial disponible.'));
       if(affected.length)history.append(make('p','',affected.map(r=>r.nombreTorta||'Receta').join(', ')));
       const currentUnit=getEffectiveUnitCost(m);
       if(compatible&&latest>0){
           const unit=latest/Number(m.proveedorCantidadBase);
           history.append(make('p','','Costo observado por '+(m.unidad||'unidad')+': '+money(unit)+' (misma presentación).'));
           if(currentUnit>0){const impact=make('details'),heading=make('summary','','Simular impacto en recetas');impact.append(heading);
               affected.slice(0,12).forEach(r=>{const qty=r.ingredientes.filter(i=>i?.idMateriaPrima===m.id).reduce((s,i)=>s+(Number(i.cantidad)||0),0),yieldQty=Number(r.rendimiento)>0?Number(r.rendimiento):1;const delta=(unit-currentUnit)*qty/yieldQty;impact.append(make('p','', (r.nombreTorta||'Receta')+' · '+(delta>=0?'+':'')+money(delta)+' por unidad de rendimiento'));});
               impact.append(make('small','','Simulación informativa; no cambia costos ni precios.'));history.append(impact);}
       }else if(latest>0)history.append(make('p','ds-tools-muted','Presentación no verificada para comparar costos unitarios; esperar una nueva consulta.'));
       const altBox=make('details'),altSummary=make('summary','','Comparar proveedores alternativos');altBox.append(altSummary);
       if(currentUnit>0)altBox.append(make('p','','Costo aplicado: '+money(currentUnit)+' por '+(m.unidad||'unidad')));
       const quotes=alternatives.find(a=>a.id===m.id)?.items||[];
       for(const quote of quotes.filter(a=>a.unit===m.unidad).sort((a,b)=>a.price/a.quantity-b.price/b.quantity)){
           const cost=quote.price/quote.quantity,change=currentUnit>0?(cost-currentUnit)/currentUnit*100:null;
           altBox.append(make('p','',quote.name+' · '+money(cost)+' por '+quote.unit+(change===null?'':' · '+(change>=0?'+':'')+change.toFixed(1)+'%')+' · '+date(quote.at)));
       }
       if(m.unidad){
           const nameInput=make('input','ds-tools-input'),priceInput=make('input','ds-tools-input'),qtyInput=make('input','ds-tools-input');
           nameInput.placeholder='Proveedor alternativo';priceInput.placeholder='Precio total ARS';qtyInput.placeholder='Cantidad en '+m.unidad;
           for(const el of [priceInput,qtyInput]){el.type='number';el.min='0.000001';el.step='any';}
           const saveAlt=btn('Guardar cotización',async()=>{if(!nameInput.value.trim()||!(Number(priceInput.value)>0)||!(Number(qtyInput.value)>0)){toast('Completá proveedor, precio y cantidad.');return;}saveAlt.disabled=true;try{await api('supplier-alternative',{materialId:m.id,alternative:{name:nameInput.value,price:Number(priceInput.value),quantity:Number(qtyInput.value),unit:m.unidad}});toast('Cotización guardada.');await loadSupplier(true);}catch(e){toast(e.message);}finally{saveAlt.disabled=false;}});
           const form=make('div','ds-tools-alt-form');form.append(nameInput,priceInput,qtyInput,saveAlt);altBox.append(form);
       }
       history.append(altBox);
       const link=make('a','','Revisar en Stock');link.href='stock.html?buscar='+encodeURIComponent(m.nombre||'');card.append(history,link);supList.append(card);
    }
    if(!list.length)supList.append(make('p','ds-tools-muted','No hay insumos vinculados que coincidan.'));
 };
 const loadSupplier=async(force=false)=>{supStatus.textContent='Consultando información…';try{const [data,m,r]=await Promise.all([api('suppliers'),getCollection('materiasPrimas',500,force),getCollection('recetas',500,force)]);supplyData={...data,materials:m.rows,recipes:r.rows};renderSupplier();if(data.truncated||m.limited||r.limited)supStatus.textContent+=' · Vista acotada; consultá Stock para el resto.';}catch(e){supStatus.textContent=e.message;}};
 supplier.body.append(btn('Actualizar vista',()=>loadSupplier(true)),supSearch,supStatus,supList);supSearch.addEventListener('input',renderSupplier);
 const openSupplier=()=>{if(!supplier.d.open)supplier.d.showModal();loadSupplier();};
 const panel=[...document.querySelectorAll('.ds-topnav-panel')].find(x=>x.querySelector('a[href="stock.html"]'));
 const addPanelAction=(panel,label,handler)=>{if(!panel)return;const b=btn(label,()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));handler();});b.className='ds-tools-menu-action';panel.append(b);};
 addPanelAction(panel,'Centro de proveedores',openSupplier);
 const backup=dialog('Respaldo de datos'),backupStatus=make('p','ds-tools-muted','Descarga local de datos operativos; no contiene credenciales ni tokens de notificaciones. No restaura ni modifica la base.');
 const backupButton=btn('Descargar respaldo JSON',async()=>{
    backupButton.disabled=true;try{
       const f=await firestore(),db=f.getFirestore(auth.app),names=['recetas','materiasPrimas','categorias','config','cajas','ventasMostrador','movimientosStock','gastosOperativos','ccClientes','ccMovimientos','presupuestosGuardados','clientes','auditoriaMostrador','modelos3D'],data={format:'dulcesall-operativo-v1',createdAt:new Date().toISOString(),collections:{}};
       for(const name of names){let cursor=null,items=[];while(true){backupStatus.textContent='Respaldando '+name+' ('+items.length+')…';const constraints=[f.orderBy(f.documentId()),f.limit(250)];if(cursor)constraints.push(f.startAfter(cursor));const snap=await f.getDocs(f.query(f.collection(db,name),...constraints));items.push(...snap.docs.map(d=>({id:d.id,data:d.data()})));if(snap.size<250)break;cursor=snap.docs.at(-1);}data.collections[name]=items;}
       const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})),a=make('a');a.href=url;a.download='DulceSall_respaldo_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);backupStatus.textContent='Respaldo operativo descargado. Guardalo en un lugar seguro.';toast('Respaldo descargado.');
    }catch(e){backupStatus.textContent='No se generó un respaldo completo: '+e.message;}finally{backupButton.disabled=false;}
 });
 backup.body.append(backupStatus,backupButton);const adminPanel=[...document.querySelectorAll('.ds-topnav-panel')].find(x=>x.querySelector('a[href="usuarios.html"]'));addPanelAction(adminPanel,'Respaldo operativo',()=>backup.d.showModal());
}
