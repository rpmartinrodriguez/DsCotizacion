import {initializeApp} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {firebaseConfig} from './firebase-config.js';
const auth=getAuth(initializeApp(firebaseConfig)), $=id=>document.getElementById('loyal-'+id);
let rows=[],next=null,invite='',selected=null,ready=false,detail=null,stream=null,scanning=false;
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
 for(const m of rows.filter(m=>[m.name,m.email,m.phone,m.card,m.dni].join(' ').toLowerCase().includes(q))){
  const el=node('article','');el.className='loyal-panel';
  el.append(node('h3',m.name||'Invitación pendiente'),node('p',m.card),node('p',[m.email,m.phone].filter(Boolean).join(' · ')),node('p',m.birthdate?'Nacimiento: '+m.birthdate.split('-').reverse().join('/')+' · Recordatorio '+(m.birthdayReminder?'activo':'inactivo'):'Sin fecha de nacimiento'),node('p',m.state==='registered'?(m.consent?'Promociones autorizadas':'Sin autorización comercial'):'Sin registrar'),node('p','Google: '+(m.googleSaved?'Guardada (última consulta)':m.googleIssued?'Emitida, sin guardar o sin confirmar':'Sin confirmar')),node('p',m.lastPushStatus?'Último envío: '+m.lastPushStatus:'Sin envíos'));
  if(m.state==='registered'){el.append(node('p',(m.stamps||0)+' sellos · '+(m.purchaseCount||0)+' compras'),node('p',m.dni?'DNI: '+m.dni:'Sin DNI'));const manage=node('button','Gestionar');manage.onclick=()=>run(manage,()=>openDetail(m));el.append(manage);}
  if(m.state==='registered'&&ready){
   const refresh=node('button','Consultar Wallet');refresh.onclick=()=>run(refresh,async()=>{const s=await api('refresh-google',{id:m.id});m.googleSaved=s.saved;m.googleIssued=s.issued;render();status('Estado consultado.');});el.append(refresh);
   if(m.consent&&m.googleSaved){const send=node('button','Preparar push');send.onclick=()=>{selected=m;$('recipient').textContent=m.name+' · '+m.card;$('form').reset();$('send').hidden=false;$('send').scrollIntoView({behavior:'smooth'});};el.append(send);}
  }
  $('members').append(el);
 }
 if(!$('members').children.length)$('members').append(node('p','No hay registros para mostrar.'));
}
async function loadBirthdays(){const d=await api('birthdays');$('birthdays').replaceChildren();if(!d.people.length)$('birthdays').append(node('p','No hay cumpleaños registrados para hoy.'));for(const p of d.people)$('birthdays').append(node('p',p.name+' · '+p.birthdate.split('-').reverse().join('/')));}
async function load(append=false){const d=await api('list',append?{after:next}:{});rows=append?[...rows,...d.rows]:d.rows;next=d.next;ready=d.googleReady;$('config').textContent=(d.production?'Producción':'Rama de prueba: datos separados')+' · Google Wallet: '+(ready?'credenciales de clase declaradas; validar conexión':'pendiente de configurar');$('next').hidden=!next;render();$('admin').hidden=false;$('birthday-test').hidden=d.production;status('');if(!append)await loadBirthdays().catch(e=>{$('birthdays').textContent=e.message;});}
onAuthStateChanged(auth,user=>{if(user)load().catch(e=>status(e.message));else{$('admin').hidden=true;status('Iniciá sesión para continuar.');}});
$('birthday-test').onclick=()=>run($('birthday-test'),async()=>{const d=await api('birthday-test');status(d.count===0?'No hay cumpleaños de hoy para notificar.':d.duplicate?'El aviso de hoy ya fue registrado.':'Aviso de hoy registrado; '+(d.delivered||0)+' dispositivos aceptados por FCM.');});
$('search').oninput=render;
$('reload').onclick=()=>run($('reload'),()=>load());
$('next').onclick=()=>run($('next'),()=>load(true));
$('invite').onclick=()=>run($('invite'),async()=>{const d=await api('counter-qr');invite=d.url;$('qr').src=d.qr;$('invitation').hidden=false;status('QR permanente listo.');});
$('copy').onclick=()=>run($('copy'),async()=>{await navigator.clipboard.writeText(invite);status('Enlace copiado.');});
$('cancel').onclick=()=>{$('send').hidden=true;selected=null;};
$('form').onsubmit=e=>{e.preventDefault();if(!selected)return;const b=e.submitter||$('form').querySelector('button');run(b,async()=>{const d=await api('send-google',{id:selected.id,title:$('title').value,message:$('message').value,confirm:$('confirm').checked});$('send').hidden=true;selected=null;await load();status(d.message);});};

const detailStatus=t=>{$('detail-status').textContent=t;};
const money=v=>Number(v||0).toLocaleString('es-AR',{style:'currency',currency:'ARS'});
function setDetail(m){
 detail=m;$('detail-name').textContent=m.name;$('detail-summary').textContent=(m.stamps||0)+' sellos · '+(m.purchaseCount||0)+' compras · '+m.card;
 $('edit-name').value=m.name;$('edit-phone').value=m.phone;$('edit-dni').value=m.dni||'';$('edit-birthdate').value=m.birthdate||'';
 $('edit-birthday').checked=m.birthdayReminder;$('edit-consent').checked=m.consent;$('edit-consent').disabled=!m.consent;
 $('detail').hidden=false;rows=rows.map(r=>r.id===m.id?m:r);render();
}
async function historyList(){
 if(!detail)return;const id=detail.id,d=await api('history',{id});
 if(detail?.id!==id)return;
 $('history').replaceChildren();
 if(!d.items.length)$('history').append(node('p','Sin compras registradas.'));
 if(d.limited)$('history').append(node('p','Se muestran hasta 500 movimientos.'));
 for(const v of d.items){
  const row=node('div','');row.className='loyal-row loyal-movement';
  row.append(node('span',new Date(v.at).toLocaleString('es-AR')+' · '+v.reference+' · '+money(v.amount)+(v.reversed?' · Anulada':' · +1 sello')));
  if(!v.reversed){const btn=node('button','Anular');btn.onclick=()=>{if(!confirm('¿Anular esta compra y quitar su sello?'))return;run(btn,async()=>{const d=await api('reverse-purchase',{id,movementId:v.id});if(detail?.id===id){setDetail(d.member);await historyList();detailStatus(walletMessage(d.wallet,'Compra anulada.'));}});};row.append(btn);}
  $('history').append(row);
 }
}
function walletMessage(w,msg){return msg+(w==='pending'?' Google Wallet pendiente de sincronizar.':w==='updated'?' Google Wallet actualizado.':'');}
async function openDetail(m){setDetail(m);$('purchase-form').reset();detailStatus('');await historyList();$('detail').scrollIntoView({behavior:'smooth',block:'start'});}
async function lookup(value){$('lookup-status').textContent='Buscando…';try{const d=await api('lookup',{value});$('lookup-status').textContent='Cliente encontrado.';await openDetail(d.member);}catch(e){$('lookup-status').textContent=e.message;}}
$('lookup-form').onsubmit=e=>{e.preventDefault();run(e.submitter||$('lookup-form').querySelector('button'),()=>lookup($('lookup').value));};
$('close-detail').onclick=()=>{$('detail').hidden=true;detail=null;};
$('purchase-form').onsubmit=e=>{e.preventDefault();if(!detail)return;const id=detail.id;run(e.submitter||$('purchase-form').querySelector('button'),async()=>{const d=await api('purchase',{id,reference:$('reference').value,amount:Number($('amount').value)});if(detail?.id!==id)return;setDetail(d.member);$('purchase-form').reset();await historyList();detailStatus(walletMessage(d.wallet,'Compra registrada. +1 sello.'));});};
$('edit-form').onsubmit=e=>{e.preventDefault();if(!detail)return;const id=detail.id;run(e.submitter||$('edit-form').querySelector('button'),async()=>{const d=await api('edit-member',{id,name:$('edit-name').value,phone:$('edit-phone').value,dni:$('edit-dni').value,birthdate:$('edit-birthdate').value,birthdayReminder:$('edit-birthday').checked,consent:$('edit-consent').checked});if(detail?.id!==id)return;setDetail(d.member);await loadBirthdays();detailStatus(walletMessage(d.wallet,'Datos guardados.'));});};
$('history-reload').onclick=()=>run($('history-reload'),historyList);
$('sync').onclick=()=>run($('sync'),async()=>{if(!detail)return;const d=await api('sync-wallet',{id:detail.id});detailStatus(d.wallet==='updated'?'Google Wallet actualizado.':d.wallet==='pending'?'No se pudo sincronizar; revisá configuración.':'Tarjeta Google Wallet aún no emitida.');});
$('download').onclick=()=>{if(!invite)return;const a=document.createElement('a');a.href=$('qr').src;a.download='dulce-sall-qr-registro.png';a.click();};
function stopCamera(){scanning=false;stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;$('video').hidden=true;$('camera').textContent='Escanear cámara';}
$('camera').onclick=async()=>{
 if(scanning){stopCamera();return;}
 if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia){$('lookup-status').textContent='Cámara no compatible en este navegador. Usá un lector QR o ingresá el DNI.';return;}
 try{const formats=await BarcodeDetector.getSupportedFormats();if(!formats.includes('qr_code'))throw Error('Este navegador no lee QR.');const detector=new BarcodeDetector({formats:['qr_code']});stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});$('video').srcObject=stream;$('video').hidden=false;await $('video').play();scanning=true;$('camera').textContent='Cerrar cámara';
 const tick=async()=>{if(!scanning)return;try{const codes=await detector.detect($('video'));const code=codes.find(c=>/^DS-[A-F0-9]{24}$/i.test(c.rawValue));if(code){stopCamera();$('lookup').value=code.rawValue;await lookup(code.rawValue);return;}}catch(e){stopCamera();$('lookup-status').textContent='No se pudo leer la cámara.';return;}if(scanning)setTimeout(tick,200);};void tick();
 }catch(e){stopCamera();$('lookup-status').textContent='No se pudo abrir la cámara. Usá el DNI o lector QR.';}
};
window.addEventListener('pagehide',stopCamera);
