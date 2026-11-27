import {getFirestore,doc,getDocFromServer} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {setupInicio} from '../home.js?v=7';
import {setupAgenda} from '../agenda.js?v=3';
const routes={'index.html':{permission:'indicadores',mount:setupInicio,title:'Inicio · Dulce Sall Admin'},'agenda.html':{permission:'agenda',mount:setupAgenda,title:'Agenda · Dulce Sall Admin'}};
export function pilotRoute(path){const file=path==='/'?'index.html':path.slice(1);return Object.hasOwn(routes,file)?file:null;}
const can=(profile,permission)=>profile?.rol==='master'||profile?.permisos?.[permission]===true;
const fingerprint=profile=>JSON.stringify([profile?.rol||'empleado',Object.keys(profile?.permisos||{}).filter(k=>profile.permisos[k]===true).sort()]);
export function mountExperience({session,p,closeMenu,groups}){
 if(window.DSExperience)return;
 const auth=session.auth,app=auth.app,db=getFirestore(app),uid=auth.currentUser?.uid;
 let active=pilotRoute(location.pathname),cleanup=null,busy=false,seq=0;
 if(!active||!uid)throw Error('Pantalla no autorizada.');
 const original=fingerprint(session.perfil),templates=new Map();
 const message=document.createElement('div');message.className='ds-tools-toast';message.setAttribute('role','status');message.hidden=true;document.body.append(message);
 let timer;
 const notify=text=>{message.textContent=text;message.hidden=false;clearTimeout(timer);timer=setTimeout(()=>message.hidden=true,4000);};
 const capture=(root,file)=>{
    const main=root.querySelector('main');
    if(!main)throw Error('Pantalla no disponible.');
    const modal=file==='agenda.html'?root.querySelector('#agenda-dia-modal'):null;
    if(file==='agenda.html'&&!modal)throw Error('Agenda incompleta.');
    if(main.querySelector('script')||modal?.querySelector('script'))throw Error('Plantilla inválida.');
    return {main:main.cloneNode(true),modal:modal?.cloneNode(true)||null};
 };
 templates.set(active,capture(document,active));
 const getTemplate=async file=>{
    if(templates.has(file))return templates.get(file);
    const response=await fetch('/'+file,{cache:'no-cache',credentials:'same-origin'});
    if(!response.ok||new URL(response.url,location.href).origin!==location.origin)throw Error('No se pudo cargar la pantalla.');
    const html=new DOMParser().parseFromString(await response.text(),'text/html');
    if(!html.body.classList.contains('ds-experience-pilot'))throw Error('La versión de la pantalla cambió.');
    const template=capture(html,file);templates.set(file,template);return template;
 };
 const mark=file=>{
    groups.forEach(group=>{const button=group.querySelector('.nav-category-btn'),panel=document.getElementById(button.getAttribute('aria-controls'));let selected=false;for(const link of panel?.querySelectorAll('a[href]')||[]){const yes=pilotRoute(new URL(link.href,location.href).pathname)===file;link.classList.toggle('active',yes);if(yes){link.setAttribute('aria-current','page');selected=true;}else link.removeAttribute('aria-current');}button.classList.toggle('is-current',selected);});
    for(const el of document.querySelectorAll('main [data-permission]'))el.hidden=!can(session.perfil,el.dataset.permission);
    const name=document.getElementById('ds-user-name');if(name)name.textContent=String(session.perfil.nombre||'equipo').trim().split(/\s+/)[0]||'equipo';
 };
 const start=file=>{mark(file);cleanup=routes[file].mount(app,session);if(typeof cleanup!=='function')throw Error('Módulo sin función de cierre.');};
 start(active);
 window.DSNavigation?.end();
 const leave=()=>{cleanup?.();cleanup=null;};
 const go=async(url,pop=false)=>{
    const file=pilotRoute(url.pathname);
    if(!file||url.search||url.hash||!can(session.perfil,routes[file].permission)){if(pop)location.reload();else location.assign(url.href);return;}
    if(busy){if(pop)location.reload();return;}
    if(file===active)return;
    busy=true;const ticket=++seq;window.DSNavigation?.begin();closeMenu();
    try{
        const [snap,template]=await Promise.all([getDocFromServer(doc(db,'usuarios',uid)),getTemplate(file)]);
        if(ticket!==seq)return;
        if(auth.currentUser?.uid!==uid||!snap.exists()||snap.data().estado!=='activo'){leave();location.replace('/login.html');return;}
        const profile=snap.data();
        if(fingerprint(profile)!==original||!can(profile,routes[file].permission)){location.assign(url.href);return;}
        session.perfil={...profile,uid};
        const main=template.main.cloneNode(true),modal=template.modal?.cloneNode(true);
        leave();document.querySelector('#agenda-dia-modal')?.remove();
        document.querySelector('main').replaceWith(main);
        if(modal)document.body.append(modal);
        document.body.classList.toggle('ds-content',file==='agenda.html');document.body.classList.toggle('ds-agenda',file==='agenda.html');
        active=file;document.title=routes[file].title;
        if(!pop)history.pushState({dsPilot:true},'',url.href);
        for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
        start(file);window.scrollTo(0,0);
    }catch(error){console.warn('Experience route',error);if(pop||!cleanup){location.assign(url.href);return;}notify('No se pudo abrir la sección. Revisá la conexión y reintentá.');}
    finally{busy=false;window.DSNavigation?.end();}
 };
 window.DSExperience={navigateLink(event,url){const file=pilotRoute(url.pathname);if(!file||url.search||url.hash||!can(session.perfil,routes[file].permission))return false;event.preventDefault();void go(url);return true;}};
 window.addEventListener('popstate',()=>void go(new URL(location.href),true));
 onAuthStateChanged(auth,user=>{if(user?.uid!==uid){seq++;leave();location.replace('/login.html');}});
 window.addEventListener('pagehide',event=>{if(!event.persisted)leave();});
}
