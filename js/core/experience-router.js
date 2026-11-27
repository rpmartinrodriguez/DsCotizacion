import {getFirestore,doc,getDocFromServer} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {createModuleScope} from './module-scope.js';
import {updateCartIcon} from '../cart.js?v=2';
const route=(permissions,load,forms=false,modals=[])=>({permissions,load,forms,modals});
const routes={
 'index.html':route(['indicadores'],async()=>[(await import('../home.js?v=7')).setupInicio]),
 'agenda.html':route(['agenda'],async()=>[(await import('../agenda.js?v=3')).setupAgenda],false,['agenda-dia-modal']),
 'productos.html':route(['recetas','precios','stock'],async()=>[(await import('../productos.js?v=2')).setupProductos]),
 'recetas.html':route(['recetas'],async()=>[(await import('../recetas.js?v=8')).setupRecetas],true,['receta-modal-overlay','modal-porciones']),
 'stock.html':route(['stock'],async()=>{const [stock,schedule]=await Promise.all([import('../stock.js?v=8'),import('../stock/supplier-schedule-r261.js')]);return [(app,session,scope)=>{schedule.setupSupplierSchedule(app,scope);return stock.setupStock(app,session,scope);}];},false,['edit-producto-completo-modal-overlay','ajustar-stock-modal-overlay','historial-movimientos-modal-overlay','supplier-results-modal-overlay','supplier-history-modal-overlay']),
 'presupuesto.html':route(['presupuestos'],async()=>[(await import('../presupuesto.js?v=6')).setupPresupuesto],true,['custom-modal-overlay']),
 'cotizacion-actual.html':route(['presupuestos','mostrador'],async()=>[(await import('../cotizacion-actual.js?v=5')).setupCotizacion],true,['resumen-cotizacion-modal']),
 'precios.html':route(['precios'],async()=>[(await import('../precios.js?v=5')).setupPrecios],false,['revision-precio-modal']),
 'finanzas.html':route(['finanzas'],async()=>{const [a,b]=await Promise.all([import('../finanzas.js?v=2'),import('../finanzas/eerr.js?v=4')]);return [a.setupFinanzas,b.setupEstadoResultados];},true),
 'historial.html':route(['historial'],async()=>[(await import('../historial.js?v=11')).setupHistorial],false,['agradecimiento-modal-overlay','confirm-venta-modal-overlay','confirm-delete-modal-overlay','ds-order-dialog']),
 'compras.html':route(['compras'],async()=>[(await import('../compras.js?v=2')).setupCompras],true),
 'compras-lista.html':route(['compras_lista'],async()=>[(await import('../compras-lista.js?v=2')).setupListaCompras]),
 'clientes.html':route(['clientes'],async()=>[(await import('../clientes.js?v=4')).setupClientes],false,['cliente-modal-overlay']),
 'modelos.html':route(['modelos'],async()=>[(await import('../modelos.js?v=2')).setupModelos],true)
};
export function pilotRoute(path){const file=path==='/'?'index.html':path.slice(1);return Object.hasOwn(routes,file)?file:null;}
export const canRoute=(profile,file)=>!!routes[file]&&(profile?.rol==='master'||routes[file].permissions.some(k=>profile?.permisos?.[k]===true));
const fingerprint=profile=>JSON.stringify([profile?.rol||'empleado',Object.keys(profile?.permisos||{}).filter(k=>profile.permisos[k]===true).sort()]);
const headerExtras='.header__cart-link,.ds-topbar-actions,.header__spacer';
const styleSelector='link[rel="stylesheet"],style';
const vendorUrls=['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js','https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js'];
const vendors=new Map();
const vendor=src=>{
 if(vendors.has(src))return vendors.get(src);
 const task=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('No se pudo cargar la herramienta PDF.'));};document.head.append(script);});
 vendors.set(src,task);task.catch(()=>vendors.delete(src));return task;
};
const filters={
 'productos.html':['productos-buscar','productos-estado'],
 'recetas.html':['buscador-recetas'],
 'stock.html':['buscador-stock'],
 'clientes.html':['buscador-clientes'],
 'historial.html':['orders-stage','orders-view'],
 'precios.html':['revision-busqueda','revision-margen-objetivo','revision-caida-alerta']
};
export function mountExperience({session,p,closeMenu,groups}){
 if(window.DSExperience)return;
 const auth=session.auth,app=auth.app,db=getFirestore(app),uid=auth.currentUser?.uid;
 let active=pilotRoute(location.pathname),scope=null,cleanups=[],busy=false,seq=0,dirty=false,activeHref=location.href;
 if(!active||!uid||!canRoute(session.perfil,active))throw Error('Pantalla no autorizada.');
 const original=fingerprint(session.perfil),templates=new Map();
 const message=document.createElement('div');message.className='ds-tools-toast';message.setAttribute('role','status');message.hidden=true;document.body.append(message);
 let timer;
 const notify=text=>{message.textContent=text;message.hidden=false;clearTimeout(timer);timer=setTimeout(()=>message.hidden=true,4000);};
 const capture=(root,file)=>{
    const main=root.querySelector('main');
    if(!main)throw Error('Pantalla no disponible.');
    const modals=routes[file].modals.map(id=>{const node=root.getElementById(id);if(!node)throw Error('Pantalla incompleta: '+id);return node.cloneNode(true);});
    if(main.querySelector('script')||modals.some(m=>m.querySelector('script')))throw Error('Plantilla inválida.');
    const extras=[...root.querySelectorAll('.header>'+headerExtras.split(',').join(',.header>'))].map(el=>el.cloneNode(true));
    const styles=[...root.head.querySelectorAll(styleSelector)].filter(el=>el.tagName==='STYLE'||new URL(el.getAttribute('href'),location.origin).origin===location.origin).map(el=>({key:el.tagName==='STYLE'?'inline:'+el.textContent:'link:'+new URL(el.getAttribute('href'),location.origin).href,node:el.cloneNode(true)}));
    return {main:main.cloneNode(true),modals,extras,styles,classes:[...root.body.classList].filter(v=>/^(ds-|rol-)/.test(v)),title:root.title};
 };
 templates.set(active,capture(document,active));
 let styles=new Map([...document.head.querySelectorAll(styleSelector)].map(el=>[el.tagName==='STYLE'?'inline:'+el.textContent:'link:'+el.href,el]));
 const getTemplate=async file=>{
    if(templates.has(file))return templates.get(file);
    const response=await fetch('/'+file,{cache:'no-cache',credentials:'same-origin'});
    if(!response.ok||new URL(response.url,location.href).origin!==location.origin)throw Error('No se pudo cargar la pantalla.');
    const html=new DOMParser().parseFromString(await response.text(),'text/html');
    if(!html.body.classList.contains('ds-experience-pilot'))throw Error('La versión de la pantalla cambió.');
    const template=capture(html,file);templates.set(file,template);return template;
 };
 const prepareStyles=async template=>{
    const next=new Map(),added=[];
    try{
       for(const item of template.styles){
          if(styles.has(item.key)){next.set(item.key,styles.get(item.key));continue;}
          const el=item.node.cloneNode(true),media=el.getAttribute('media');el.media='not all';el.dataset.dsOriginalMedia=media||'';added.push(el);
          next.set(item.key,el);
          if(el.tagName==='LINK')await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Tiempo de carga de estilos.')),8000);el.onload=()=>{clearTimeout(timeout);resolve();};el.onerror=()=>{clearTimeout(timeout);reject(Error('No se pudo cargar un estilo.'));};document.head.append(el);});
          else document.head.append(el);
       }
       return {apply(){for(const [key,el] of styles)if(!next.has(key))el.remove();for(const el of added){el.media=el.dataset.dsOriginalMedia;delete el.dataset.dsOriginalMedia;}for(const el of next.values())document.head.append(el);styles=next;},cancel(){for(const el of added)el.remove();}};
    }catch(error){for(const el of added)el.remove();throw error;}
 };
 const mark=file=>{
    groups.forEach(group=>{const button=group.querySelector('.nav-category-btn'),panel=document.getElementById(button.getAttribute('aria-controls'));let selected=false;for(const link of panel?.querySelectorAll('a[href]')||[]){const yes=pilotRoute(new URL(link.href,location.href).pathname)===file;link.classList.toggle('active',yes);if(yes){link.setAttribute('aria-current','page');selected=true;}else link.removeAttribute('aria-current');}button.classList.toggle('is-current',selected);});
    for(const el of document.querySelectorAll('main [data-permission],.header [data-permission]')){const allowed=session.perfil.rol==='master'||session.perfil.permisos?.[el.dataset.permission]===true;el.hidden=!allowed;if(allowed&&el.style.display==='none')el.style.removeProperty('display');}
    const name=document.getElementById('ds-user-name');if(name)name.textContent=String(session.perfil.nombre||'equipo').trim().split(/\s+/)[0]||'equipo';
    updateCartIcon();
 };
 const key=(file,id)=>'ds-experience-filter:'+uid+':'+file+':'+id;
 const restoreFilters=file=>{for(const id of filters[file]||[]){const el=document.getElementById(id);if(!el)continue;try{const value=sessionStorage.getItem(key(file,id));if(value!==null&&(!location.search||!['buscador-stock','buscador-clientes','productos-estado'].includes(id)))el.value=value;}catch{} }};
 const bindFilters=file=>{for(const id of filters[file]||[]){const el=document.getElementById(id);if(!el)continue;const save=()=>{try{sessionStorage.setItem(key(file,id),el.value);}catch{}};el.addEventListener('input',save,{signal:scope.signal});el.addEventListener('change',save,{signal:scope.signal});}};
 const leave=()=>{for(const stop of cleanups.splice(0))try{stop();}catch{}scope?.dispose();scope=null;};
 const start=(file,mounts)=>{
    scope=createModuleScope();dirty=false;mark(file);restoreFilters(file);
    for(const mount of mounts){const stop=mount(app,session,scope);if(typeof stop==='function'&&stop!==scope.dispose)cleanups.push(stop);}
    bindFilters(file);
    document.querySelector('main')?.addEventListener('ds-form-saved',()=>dirty=false,{signal:scope.signal});
    const main=document.querySelector('main');if(routes[file].forms&&main){const changed=event=>{const el=event.target;if(el?.matches('input:not([type=search]):not([type=hidden]),textarea,select')&&!(filters[file]||[]).includes(el.id))dirty=true;};main.addEventListener('input',changed,{signal:scope.signal});main.addEventListener('change',changed,{signal:scope.signal});main.addEventListener('reset',()=>dirty=false,{signal:scope.signal});}
 };
 const blocked=()=>{if(busy||scope?.busy){notify('Hay una operación en curso. Esperá a que termine.');return true;}if(document.querySelector('.modal-overlay.visible,dialog[open][data-ds-module-owned]')||routes[active].modals.some(id=>document.getElementById(id)?.open)){notify('Cerrá el formulario abierto antes de cambiar de sección.');return true;}if(dirty&&!window.confirm('Hay campos modificados en esta pantalla. ¿Querés salir de todas formas?'))return true;return false;};
 const loadModule=async file=>{if(file==='precios.html'){if(!window.jspdf)await vendor(vendorUrls[0]);if(!window.jspdf?.jsPDF?.API?.autoTable)await vendor(vendorUrls[1]);}return routes[file].load();};
 const initial=async()=>{busy=true;window.DSNavigation?.begin();try{start(active,await loadModule(active));}finally{busy=false;window.DSNavigation?.end();}};
 const go=async(url,pop=false)=>{
    const file=pilotRoute(url.pathname);
    if(!file||url.hash||!canRoute(session.perfil,file)){if(pop&&blocked()){history.pushState({dsPilot:true},'',activeHref);return;}dirty=false;if(pop)location.reload();else location.assign(url.href);return;}
    if(file===active&&!pop&&url.href===location.href)return;
    if(blocked()){if(pop)history.pushState({dsPilot:true},'',activeHref);return;}
    busy=true;const ticket=++seq;window.DSNavigation?.begin();closeMenu();
    const oldMain=document.querySelector('main');activeHref=pop?activeHref:location.href;oldMain.inert=true;let prepared;
    try{
        const [snap,template,mounts]=await Promise.all([getDocFromServer(doc(db,'usuarios',uid)),getTemplate(file),loadModule(file)]);
        if(ticket!==seq)return;
        if(auth.currentUser?.uid!==uid||!snap.exists()||snap.data().estado!=='activo'){leave();location.replace('/login.html');return;}
        const profile=snap.data();
        if(fingerprint(profile)!==original||!canRoute(profile,file)){dirty=false;location.assign(url.href);return;}
        prepared=await prepareStyles(template);
        if(ticket!==seq)return;
        if(scope?.busy)throw Error('Operación pendiente.');
        session.perfil={...profile,uid};
        const main=template.main.cloneNode(true),modals=template.modals.map(el=>el.cloneNode(true));
        leave();for(const id of routes[active].modals)document.getElementById(id)?.remove();
        oldMain.replaceWith(main);for(const modal of modals)document.body.append(modal);
        const header=document.querySelector('.header');for(const el of header.querySelectorAll(headerExtras))el.remove();for(const el of template.extras)header.append(el.cloneNode(true));
        for(const cls of [...document.body.classList])if((cls.startsWith('ds-')||cls.startsWith('rol-'))&&!['ds-app','ds-topnav-layout','ds-experience-pilot'].includes(cls))document.body.classList.remove(cls);
        for(const cls of template.classes)document.body.classList.add(cls);
        prepared.apply();prepared=null;
        active=file;document.title=template.title;
        if(!pop)history.pushState({dsPilot:true},'',url.href);
        activeHref=location.href;
        for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
        start(file,mounts);window.scrollTo(0,0);
    }catch(error){console.warn('Experience route',error);if(pop||!scope){dirty=false;location.assign(url.href);return;}notify('No se pudo abrir la sección. Revisá la conexión y reintentá.');}
    finally{prepared?.cancel();oldMain.inert=false;busy=false;window.DSNavigation?.end();}
 };
 window.DSExperience={navigateLink(event,url){const file=pilotRoute(url.pathname);if(busy){event.preventDefault();notify('Cargando sección…');return true;}if(!file||url.hash||!canRoute(session.perfil,file)){if(blocked()){event.preventDefault();return true;}dirty=false;return false;}event.preventDefault();void go(url);return true;}};
 window.addEventListener('popstate',()=>void go(new URL(location.href),true));
 window.addEventListener('beforeunload',event=>{if(scope?.busy||dirty){event.preventDefault();event.returnValue='';}});
 onAuthStateChanged(auth,user=>{if(user?.uid!==uid){seq++;leave();location.replace('/login.html');}});
 window.addEventListener('pagehide',event=>{if(!event.persisted){seq++;leave();}});
 return initial();
}
