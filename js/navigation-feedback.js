/* Continuidad visual de navegación multipágina. Los datos guardados son exclusivamente una maqueta inerte. */
(()=>{
'use strict';
const key='ds-nav-preview-v1',pendingKey='ds-nav-pending-v1';
const pages=new Set(['index.html','pos.html','productos.html','recetas.html','stock.html','presupuesto.html','cotizacion-actual.html','precios.html','cajas.html','finanzas.html','historial.html','compras.html','compras-lista.html','clientes.html','agenda.html','modelos.html','usuarios.html']);
const categoryIcons={'Operación':'pos','Productos':'recipes','Insumos y compras':'stock','Clientes y pedidos':'clients','Administración':'finance','Herramientas':'models'};
const MENU_ICON = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 11 12 3l9 8"></path><path d="M5 10v11h14V10"></path></svg>',
    pos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 9h16l-1-5H5L4 9Z"></path><path d="M5 9v11h14V9"></path><path d="M9 14h6"></path></svg>',
    stock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 8 4-8 4-8-4 8-4Z"></path><path d="m4 12 8 4 8-4M4 17l8 4 8-4"></path></svg>',
    recipes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 3h12v18H6z"></path><path d="M9 7h6M9 11h6M9 15h4"></path></svg>',
    quote: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 2h9l4 4v16H6V2Z"></path><path d="M14 2v5h5M9 12h6M9 16h6"></path></svg>',
    prices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 13 11 22l-9-9V4h9l9 9Z"></path><circle cx="7" cy="9" r="1.5"></circle></svg>',
    clients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="8" r="4"></circle><path d="M2.5 21a6.5 6.5 0 0 1 13 0M16 7a3 3 0 1 1 0 6M18 15a5 5 0 0 1 4 5"></path></svg>',
    agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path></svg>',
    models: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"></path><path d="m4 7.5 8 4.5 8-4.5M12 12v9"></path></svg>',
    cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2"></rect><path d="M7 10h10M7 15h4"></path><circle cx="17" cy="15" r="1.5"></circle></svg>',
    finance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"></path></svg>',
    purchase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 4h2l2 11h10l2-7H7"></path><circle cx="9" cy="19" r="1.5"></circle><circle cx="17" cy="19" r="1.5"></circle><path d="M14 3v6M11 6h6"></path></svg>',
    shoppingList: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 5h13M8 12h13M8 19h13"></path><path d="m3 5 1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2"></path></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M2.5 20a5.5 5.5 0 0 1 11 0M14 20a4.5 4.5 0 0 1 8 0"></path></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"></path></svg>'
};

const header=document.querySelector('.header'),nav=document.getElementById('nav-menu');
if(!header||!nav)return;
const read=k=>{try{return JSON.parse(sessionStorage.getItem(k)||'null');}catch{return null;}};
const write=(k,v)=>{try{sessionStorage.setItem(k,JSON.stringify(v));}catch{}};
const remove=k=>{try{sessionStorage.removeItem(k);}catch{}};
const file=url=>url.pathname.split('/').pop()||'index.html';
const current=()=>file(new URL(location.href));
const make=(tag,cls)=>{const el=document.createElement(tag);el.className=cls;return el;};
let loader,delay,limit,finishTimer,visibleAt=0,ghosts=[],ready=false,outgoing=false,dataObserver;
const ghost=(className,html)=>{
 const node=make('span',className+' ds-nav-ghost');node.setAttribute('aria-hidden','true');node.innerHTML=html;header.append(node);ghosts.push(node);
 return node;
};
const validSnapshot=s=>s&&Array.isArray(s.groups)&&s.groups.every(g=>g&&Object.prototype.hasOwnProperty.call(categoryIcons,g.name)&&Array.isArray(g.pages)&&g.pages.every(p=>pages.has(p)));
const snapshot=read(key);
if(validSnapshot(snapshot)){
 // Render only known labels and fixed local SVGs, never saved HTML, hrefs or active buttons.
 nav.inert=true;nav.setAttribute('aria-hidden','true');nav.classList.add('ds-nav-preview');
 for(const g of snapshot.groups){
  const group=make('div','nav-category'),button=make('span','nav-category-btn');
  if(g.pages.includes(current()))button.classList.add('is-current');
  button.innerHTML='<span class="ds-topnav-icon">'+MENU_ICON[categoryIcons[g.name]]+'</span><span class="ds-topnav-name"></span><span class="ds-topnav-chevron">⌄</span>';
  button.querySelector('.ds-topnav-name').textContent=g.name;group.append(button);nav.append(group);
 }
 const footer=make('div','nav-menu__footer'),logout=make('span','nav-menu__logout ds-topnav-logout');
 logout.innerHTML='<span class="nav-menu__logout-icon">'+MENU_ICON.logout+'</span><span class="nav-menu__logout-label">Cerrar sesión</span>';footer.append(logout);nav.append(footer);
 if(snapshot.master)ghost('ds-nav-ghost-push','<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>');
 ghost('ds-global-search ds-nav-ghost-search','⌕');
 ghost('ds-mobile-menu-toggle ds-nav-ghost-mobile',MENU_ICON.menu+'<span>Menú</span>');
}
const createLoader=()=>{
 if(loader)return loader;
 loader=make('div','ds-navigation-loader');loader.hidden=true;loader.setAttribute('role','status');loader.setAttribute('aria-live','polite');
 loader.innerHTML='<div class="ds-navigation-loader-card"><svg class="ds-navigation-cake" viewBox="0 0 64 64" width="48" height="48" aria-hidden="true"><path d="M9 29 43 12 55 27 55 49 9 49Z" fill="#f7c5da" stroke="#78324f" stroke-width="2.2" stroke-linejoin="round"/><path d="M9 29 43 12 55 27 9 36Z" fill="#fff0f6" stroke="#78324f" stroke-width="2.2" stroke-linejoin="round"/><path d="M9 42 55 34M9 48 55 41" fill="none" stroke="#a53569" stroke-width="3" stroke-linecap="round"/><circle cx="42" cy="13" r="4.5" fill="#a53569" stroke="#78324f" stroke-width="1.4"/><path d="M42 8q2-5 6-5" fill="none" stroke="#166c47" stroke-width="2" stroke-linecap="round"/></svg><span>Cargando…</span></div>';
 document.body.append(loader);return loader;
};
const hide=(immediate=false)=>{
 dataObserver?.disconnect();dataObserver=null;clearTimeout(delay);clearTimeout(limit);clearTimeout(finishTimer);
 const finish=()=>{if(loader){loader.hidden=true;loader.classList.remove('is-slow');loader.querySelector('span').textContent='Cargando…';}visibleAt=0;};
 // Keep feedback visible briefly without delaying access to the actual loaded page.
 if(!immediate&&loader&&!loader.hidden&&visibleAt){finishTimer=setTimeout(finish,Math.max(0,500-(performance.now()-visibleAt)));}else finish();
};
const show=(isOutgoing=false,immediate=false)=>{
 hide(true);outgoing=isOutgoing;
 const display=()=>{const el=createLoader();el.hidden=false;visibleAt=performance.now();limit=setTimeout(()=>{if(isOutgoing){hide(true);outgoing=false;remove(pendingKey);}else{el.classList.add('is-slow');el.querySelector('span').textContent='La carga está demorando…';}},isOutgoing?5000:15000);};
 if(isOutgoing||immediate)display();else delay=setTimeout(display,80);
};
const clearPreview=()=>{
 nav.inert=false;nav.removeAttribute('aria-hidden');nav.classList.remove('ds-nav-preview');
};
const clearGhosts=()=>{for(const node of ghosts)node.remove();ghosts=[];};
const syncGhosts=()=>{
 const ids={'ds-nav-ghost-push':'ds-push-open','ds-nav-ghost-search':'ds-global-search','ds-nav-ghost-mobile':'ds-mobile-menu-toggle'};
 for(const node of ghosts)for(const [cls,id] of Object.entries(ids))if(node.classList.contains(cls)&&document.getElementById(id))node.remove();
 ghosts=ghosts.filter(node=>node.isConnected);
};
const observer=new MutationObserver(syncGhosts);observer.observe(header,{childList:true});
const pending=read(pendingKey);remove(pendingKey);
const transferred=Boolean(pending&&pending.path===location.pathname&&Date.now()-pending.at>=0&&Date.now()-pending.at<30000);
show(false,transferred);
// If the browser restored the document or redirected, display feedback on initial startup too.
if(!transferred)show(false,true);
window.DSNavigation={
 beforeMenu(){clearPreview();},
 begin(){show(false,true);},
 end(){hide();outgoing=false;},
 ready(groups,master){
  // Only after Firebase validates the user; no UID, tokens or financial data stored.
  const data={master:master===true,groups:groups.map(g=>({name:g.name,pages:[...new Set(g.pages.filter(p=>pages.has(p)))]})).filter(g=>Object.prototype.hasOwnProperty.call(categoryIcons,g.name))};
  write(key,data);ready=true;clearPreview();syncGhosts();
  const selectors={'stock.html':'#tabla-stock tbody','recetas.html':'#lista-recetas-container','presupuesto.html':'#lista-ingredientes'};
  const target=selectors[current()]&&document.querySelector(selectors[current()]);
  const isLoading=()=>target&&/^cargando\b/i.test(target.textContent.trim());
  if(isLoading()){
   dataObserver=new MutationObserver(()=>{if(!isLoading()&&!outgoing)hide();});
   dataObserver.observe(target,{subtree:true,childList:true,characterData:true});
  }else hide();
  // If a secondary module fails, don't leave dead decorative buttons around indefinitely.
  setTimeout(()=>{clearGhosts();observer.disconnect();},3000);
 },
 fail(){remove(key);remove(pendingKey);if(nav.classList.contains('ds-nav-preview'))nav.replaceChildren();clearPreview();clearGhosts();observer.disconnect();hide(true);},
 clear(){remove(key);remove(pendingKey);hide(true);}
};
document.addEventListener('click',event=>{
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const link=event.target.closest?.('a[href]');if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
 const url=new URL(link.href,location.href);
 if(url.origin!==location.origin||!pages.has(file(url))||!/^\/(?:[^/]+\.html)?$/.test(url.pathname)||url.pathname===location.pathname&&url.search===location.search)return;
 if(window.DSExperience?.navigateLink?.(event,url))return;
 event.preventDefault();
 if(outgoing)return;
 write(pendingKey,{at:Date.now(),path:url.pathname});show(true,true);
 // Allow at least one painted frame before native document navigation.
 // A bounded fallback avoids getting stuck if requestAnimationFrame is throttled.
 let moved=false;const go=()=>{if(moved)return;moved=true;location.assign(url.href);};
 requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(go,90)));
 setTimeout(go,220);
});
window.addEventListener('pageshow',event=>{if(event.persisted){hide(true);outgoing=false;remove(pendingKey);}else if(ready&&!outgoing&&!dataObserver)hide();});
window.addEventListener('pagehide',()=>{dataObserver?.disconnect();dataObserver=null;clearTimeout(delay);clearTimeout(limit);clearTimeout(finishTimer);});
})();