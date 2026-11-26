
const api=async(auth,action,body={})=>{
    if(!auth?.currentUser)throw new Error('Iniciá sesión.');
    const response=await fetch('/.netlify/functions/ds-push',{method:'POST',keepalive:action==='event',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await auth.currentUser.getIdToken()},body:JSON.stringify({action,...body})});
    let result;
    try{result=await response.json();}catch{throw new Error('ds-push no respondió correctamente (HTTP '+response.status+', etapa '+action+'). Revisá el registro de Netlify.');}
    if(!response.ok||!result.ok)throw new Error((result.message||('Error de notificaciones (HTTP '+response.status+', etapa '+action+').'))+(result.code?' ['+result.code+']':''));
    return result;
};
const storageKey=auth=>'ds-push-token:'+auth.currentUser?.uid;
const sdk=()=>import('https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging.js');
export async function notifyCommittedEvent(auth,kind,id){
    try{await api(auth,'event',{kind,id});}catch(e){console.warn('La operación quedó registrada; no se pudo enviar el push:',e.message);}
}
export async function disablePush(auth){
    const key=storageKey(auth),token=localStorage.getItem(key);
    if(!token)return;
    try{await api(auth,'disable',{token});}
    finally{
        try{const m=await sdk();await m.deleteToken(m.getMessaging(auth.app));}catch{}
        localStorage.removeItem(key);
    }
}
export function mountPushControls(auth){
    if(document.getElementById('ds-push-open'))return;
    const header=document.querySelector('.header');
    if(!header)return;
    const button=document.createElement('button');button.type='button';button.id='ds-push-open';button.title='Notificaciones push';button.setAttribute('aria-label','Notificaciones push');
    button.innerHTML='<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
    try{const unread=sessionStorage.getItem('ds-inbox-unread:'+auth.currentUser?.uid);if(unread&&unread!=='0')button.dataset.unread=unread;}catch{}
    button.style.cssText='position:relative;color:#166c47;border:1px solid #d9e4de;background:white;border-radius:10px;width:38px;height:38px;display:grid;place-items:center;cursor:pointer;flex-shrink:0;';
    // El spacer heredado del menú lateral se oculta en móvil. El botón debe ser hijo directo del header.
    button.classList.add('ds-push-header-button');
    header.append(button);
    const dialog=document.createElement('dialog');
    dialog.style.cssText='box-sizing:border-box;width:min(400px,calc(100vw - 24px));max-height:calc(100dvh - 30px);overflow:auto;border:1px solid #ddd;border-radius:16px;padding:18px;color:#26232a;background:white;box-shadow:0 12px 40px #0003;';
    dialog.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0;font-size:1.15rem">Notificaciones push</h2><button type="button" data-close aria-label="Cerrar">×</button></div><p style="font-size:.88rem;color:#666">Ventas con Mercado Pago, apertura y cierre de caja, cambios de precios de proveedores.</p><p data-status role="status" style="font-size:.82rem;min-height:36px"></p><div style="display:grid;gap:8px"><button type="button" data-enable class="btn-primary">Activar en este dispositivo</button><button type="button" data-test class="btn-secondary">Enviar prueba</button><button type="button" data-disable class="btn-secondary">Desactivar</button></div>';
    document.body.append(dialog);
    const status=dialog.querySelector('[data-status]'),enable=dialog.querySelector('[data-enable]'),test=dialog.querySelector('[data-test]'),disable=dialog.querySelector('[data-disable]');
    let messaging,registration,subscribed=false,unsubscribe;
    const showStatus=(message)=>{status.textContent=message;};
    const state=active=>{subscribed=active;button.style.background=active?'#edf6f1':'white';test.disabled=!active;disable.disabled=!active;enable.disabled=active;};
    state(false);
    async function initMessaging(vapidKey){
        const m=await sdk();if(!await m.isSupported())throw new Error('Este navegador no admite push. En iPhone, instalá la app en la pantalla de inicio.');
        registration=await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        messaging=m.getMessaging(auth.app);
        if(!unsubscribe)unsubscribe=m.onMessage(messaging,payload=>{
            const d=payload.data||{};
            window.dispatchEvent(new Event('ds-push-received'));
            if(d.title&&Notification.permission==='granted')void registration.showNotification(d.title,{body:d.body||'',icon:'/assets/logo-192.png',tag:d.eventId||'dulcesall',data:{dsPush:true,path:d.path||'/index.html'}});
        });
        return m.getToken(messaging,{vapidKey,serviceWorkerRegistration:registration});
    }
    async function activate(){
        if(!('Notification' in window)||!('serviceWorker' in navigator))throw new Error('En iPhone: abrí la app desde Safari, Compartir → Agregar a inicio; luego abrila desde su icono. En Android, usá Chrome o la PWA instalada.');
        if(Notification.permission==='denied')throw new Error('Las notificaciones están bloqueadas. Habilitalas en los permisos del navegador o en Configuración del dispositivo.');
        if(await Notification.requestPermission()!=='granted')throw new Error('Permiso de notificaciones no concedido.');
        const config=await api(auth,'config'),token=await initMessaging(config.vapidKey);
        if(!token)throw new Error('No se pudo registrar el dispositivo.');
        await api(auth,'register',{token});localStorage.setItem(storageKey(auth),token);state(true);showStatus('Push activadas en este dispositivo.');
    }
    function run(fn){return async()=>{try{enable.disabled=test.disabled=disable.disabled=true;await fn();}catch(e){showStatus(e.message);}finally{state(subscribed);}};}
    const openSettings=()=>{if(!dialog.open)dialog.showModal();if(!status.textContent)showStatus(subscribed?'Push activadas en este dispositivo.':'Activá las notificaciones para recibir avisos.');};
    window.addEventListener('ds-open-push-settings',openSettings);
    const settingsButton=document.getElementById('btn-push-settings');
    if(settingsButton){settingsButton.hidden=false;settingsButton.addEventListener('click',openSettings);}
    button.addEventListener('click',()=>{if(window.dispatchEvent(new CustomEvent('ds-open-inbox',{cancelable:true})))openSettings();});
    dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
    enable.addEventListener('click',run(activate));
    test.addEventListener('click',run(async()=>{await api(auth,'test',{token:localStorage.getItem(storageKey(auth))});showStatus('Prueba aceptada por FCM. Revisá la notificación del dispositivo.');}));
    disable.addEventListener('click',run(async()=>{await disablePush(auth);state(false);showStatus('Push desactivadas.');}));
    if(localStorage.getItem(storageKey(auth))&&window.Notification?.permission==='granted'){
        (async()=>{try{const config=await api(auth,'config'),token=await initMessaging(config.vapidKey);if(token){await api(auth,'register',{token});localStorage.setItem(storageKey(auth),token);state(true);}}catch(e){showStatus(e.message);}})();
    }
}
