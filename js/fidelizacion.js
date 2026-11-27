import {initializeApp} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {firebaseConfig} from './firebase-config.js';
const auth=getAuth(initializeApp(firebaseConfig)), $=id=>document.getElementById('loyal-'+id);
let rows=[],next=null,invite='',selected=null,ready=false;
const status=t=>{$('status').textContent=t;};
async function api(action,fields={}){
 const user=auth.currentUser;if(!user)throw Error('Iniciá sesión.');
 const r=await fetch('/.netlify/functions/fidelizacion',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({action,...fields})});
 const data=await r.json();if(!r.ok||!data.ok)throw Error(data.message||'Error de conexión');return data;
}
async function run(button,fn){if(button.disabled)return;button.disabled=true;try{await fn();}catch(e){status(e.message);}finally{button.disabled=false;}}
function node(tag,text){const e=document.createElement(tag);e.textContent=text;return e;}
function render(){
 const q=$('search').value.toLowerCase();$('members').replaceChildren();
 for(const m of rows.filter(m=>[m.name,m.email,m.phone,m.card].join(' ').toLowerCase().includes(q))){
  const el=node('article','');el.className='loyal-panel';
  el.append(node('h3',m.name||'Invitación pendiente'),node('p',m.card),node('p',[m.email,m.phone].filter(Boolean).join(' · ')),node('p',m.state==='registered'?(m.consent?'Promociones autorizadas':'Sin autorización comercial'):'Sin registrar'),node('p','Google: '+(m.googleSaved?'Guardada (última consulta)':m.googleIssued?'Emitida, sin guardar o sin confirmar':'Sin confirmar')),node('p',m.lastPushStatus?'Último envío: '+m.lastPushStatus:'Sin envíos'));
  if(m.state==='registered'&&ready){
   const refresh=node('button','Consultar Wallet');refresh.onclick=()=>run(refresh,async()=>{const s=await api('refresh-google',{id:m.id});m.googleSaved=s.saved;m.googleIssued=s.issued;render();status('Estado consultado.');});el.append(refresh);
   if(m.consent&&m.googleSaved){const send=node('button','Preparar push');send.onclick=()=>{selected=m;$('recipient').textContent=m.name+' · '+m.card;$('form').reset();$('send').hidden=false;$('send').scrollIntoView({behavior:'smooth'});};el.append(send);}
  }
  $('members').append(el);
 }
 if(!$('members').children.length)$('members').append(node('p','No hay registros para mostrar.'));
}
async function load(append=false){const d=await api('list',append?{after:next}:{});rows=append?[...rows,...d.rows]:d.rows;next=d.next;ready=d.googleReady;$('config').textContent=(d.production?'Producción':'Rama de prueba: datos separados')+' · Google Wallet: '+(ready?'credenciales de clase declaradas; validar conexión':'pendiente de configurar');$('next').hidden=!next;render();$('admin').hidden=false;status('');}
onAuthStateChanged(auth,user=>{if(user)load().catch(e=>status(e.message));else{$('admin').hidden=true;status('Iniciá sesión para continuar.');}});
$('search').oninput=render;
$('reload').onclick=()=>run($('reload'),()=>load());
$('next').onclick=()=>run($('next'),()=>load(true));
$('invite').onclick=()=>run($('invite'),async()=>{const d=await api('invite');invite=d.url;$('qr').src=d.qr;$('invitation').hidden=false;status('Invitación generada.');});
$('copy').onclick=()=>run($('copy'),async()=>{await navigator.clipboard.writeText(invite);status('Enlace copiado.');});
$('cancel').onclick=()=>{$('send').hidden=true;selected=null;};
$('form').onsubmit=e=>{e.preventDefault();if(!selected)return;const b=e.submitter||$('form').querySelector('button');run(b,async()=>{const d=await api('send-google',{id:selected.id,title:$('title').value,message:$('message').value,confirm:$('confirm').checked});$('send').hidden=true;selected=null;await load();status(d.message);});};
