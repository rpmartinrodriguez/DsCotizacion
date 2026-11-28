const $=id=>document.getElementById('p-'+id);let token=location.hash.slice(1);const publicEntry=!token;const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
const status=t=>{$('status').textContent=t;};
const dateParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
$('birthdate').max=dateParts.year+'-'+dateParts.month+'-'+dateParts.day;
let walletUrl='',walletReady=false,preparing=false;
async function api(action,data={}){const r=await fetch('/.netlify/functions/fidelizacion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...data})});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.message||'No se pudo completar.');return j;}
function show(d){$('stamps').textContent=(d.stamps||0)+' sellos';$('purchases').textContent=(d.purchaseCount||0)+' compras';const registered=d.state==='registered';$('register').hidden=registered;$('card').hidden=!registered;$('code').textContent=d.card||'';if(d.qr)$('qr').src=d.qr;walletReady=d.googleReady===true;$('google').hidden=!walletReady;$('optout').hidden=!d.consent;status(registered?'¡Tu tarjeta está lista!':'Completá tus datos para obtener tu tarjeta.');if(registered&&!walletReady)$('wallet-status').textContent='Tu tarjeta digital ya está generada. Google Wallet todavía no está habilitada.';}
async function prepareWallet(){
 if(!walletReady||walletUrl||preparing)return;
 preparing=true;$('google').disabled=true;$('wallet-status').textContent='Preparando tu tarjeta para Google Wallet…';
 try{const d=await api('google-link'),u=new URL(d.url);if(u.origin!=='https://pay.google.com'||!u.pathname.startsWith('/gp/v/save/'))throw Error('Enlace inválido.');walletUrl=u.href;$('wallet-status').textContent='Ya podés guardar tu tarjeta en Google Wallet.';}
 catch(e){$('wallet-status').textContent='Tu registro está guardado. '+e.message+' Podés reintentar con el botón.';}
 finally{preparing=false;$('google').disabled=false;}
}
async function load(){show(await api('invite-status'));if(!$('card').hidden)await prepareWallet();}
async function run(b,fn){b.disabled=true;try{await fn();}catch(e){status(e.message);}finally{b.disabled=false;}}
$('register').onsubmit=e=>{e.preventDefault();run(e.submitter||$('register').querySelector('button'),async()=>{if(publicEntry&&!token)token=randomToken();const d=await api(publicEntry?'public-register':'register',{name:$('name').value,phone:$('phone').value,birthdate:$('birthdate').value,dni:$('dni').value,accept:$('accept').checked,consent:$('consent').checked});if(publicEntry)history.replaceState(null,'',location.pathname+'#'+token);show(d);await prepareWallet();});};
$('google').onclick=async()=>{if(!walletUrl){await prepareWallet();if(!walletUrl)return;}location.assign(walletUrl);};
$('optout').onclick=()=>run($('optout'),async()=>{await api('opt-out');await load();status('Ya no recibirás promociones desde nuestro sistema.');});
$('refresh').onclick=()=>run($('refresh'),load);
if(publicEntry){$('register').hidden=false;status('Completá tus datos para obtener tu tarjeta.');}else if(/^[a-f0-9]{64}$/.test(token))load().catch(e=>status(e.message));else status('Enlace privado inválido.');
