const $=id=>document.getElementById('p-'+id),token=location.hash.slice(1);
const status=t=>{$('status').textContent=t;};
async function api(action,data={}){const r=await fetch('/.netlify/functions/fidelizacion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...data})});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.message||'No se pudo completar.');return j;}
function show(d){$('register').hidden=d.state!=='pending';$('card').hidden=d.state!=='registered';$('code').textContent=d.card||'';$('google').hidden=!d.googleReady;$('optout').hidden=!d.consent;status(d.state==='pending'?'Completá tus datos para obtener tu tarjeta.':'Registro completado.');}
async function load(){show(await api('invite-status'));}
async function run(b,fn){b.disabled=true;try{await fn();}catch(e){status(e.message);}finally{b.disabled=false;}}
$('register').onsubmit=e=>{e.preventDefault();run(e.submitter||$('register').querySelector('button'),async()=>{await api('register',{name:$('name').value,email:$('email').value,phone:$('phone').value,accept:$('accept').checked,consent:$('consent').checked});await load();});};
$('google').onclick=()=>run($('google'),async()=>{const d=await api('google-link');const u=new URL(d.url);if(u.origin!=='https://pay.google.com'||!u.pathname.startsWith('/gp/v/save/'))throw Error('Enlace inválido.');location.assign(u.href);});
$('optout').onclick=()=>run($('optout'),async()=>{await api('opt-out');await load();status('Ya no recibirás promociones desde nuestro sistema.');});
if(/^[a-f0-9]{64}$/.test(token))load().catch(e=>status(e.message));else status('Solicitá tu invitación privada en Dulce Sall.');
