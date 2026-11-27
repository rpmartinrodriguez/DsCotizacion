
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {getFirestore,doc,getDoc} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
const dayNames=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
export function setupSupplierSchedule(app){
    const trigger=document.getElementById('btn-supplier-schedule');
    if(!trigger)return;
    const auth=getAuth(app),db=getFirestore(app);
    let allowed=false;
    onAuthStateChanged(auth,async user=>{
        allowed=false;trigger.hidden=true;
        if(!user||user.isAnonymous)return;
        try{
            const snap=await getDoc(doc(db,'usuarios',user.uid));
            if(auth.currentUser?.uid!==user.uid)return;
            allowed=snap.exists()&&snap.data().estado==='activo'&&snap.data().rol==='master';
            trigger.hidden=!allowed;
        }catch(error){console.warn('Permisos de consulta automática no disponibles.');}
    });
    const dialog=document.createElement('dialog');
    dialog.className='ds-supplier-schedule-dialog';
    dialog.setAttribute('aria-labelledby','supplier-schedule-title');
    dialog.innerHTML='<form class="ds-supplier-schedule-form"><div class="ds-supplier-schedule-head"><h2 id="supplier-schedule-title">Consulta automática de proveedores</h2><button type="button" data-close aria-label="Cerrar">×</button></div><p>Seleccioná los días en que se consultarán los precios de los insumos vinculados a páginas de proveedores.</p><label class="ds-supplier-schedule-toggle"><input type="checkbox" data-enabled> <strong>Consultas automáticas activadas</strong></label><fieldset data-days><legend>Días de consulta</legend><div class="ds-supplier-schedule-days">'+dayNames.map((name,i)=>'<label><input type="checkbox" value="'+(i+1)+'"> <span>'+name+'</span></label>').join('')+'</div></fieldset><label class="ds-supplier-time"><span>Horario de inicio · Argentina</span><input type="time" data-time required step="300" max="23:55" value="07:00"></label><div class="ds-supplier-schedule-info"><strong>Resumen de cada revisión</strong><p>Elegí la hora y los minutos en intervalos de 5 minutos. Se inicia a partir del horario seleccionado. Al terminar, recibirás un resumen aunque no haya cambios. Los aumentos y bajas también generan avisos. No se modifican costos automáticamente.</p><p>Una revisión por día seleccionado. Si ya terminó hoy, el nuevo horario se aplica a la próxima.</p></div><section class="ds-supplier-last" data-last aria-live="polite"></section><p data-status role="status" aria-live="polite"></p><div class="ds-supplier-schedule-actions"><button type="button" data-cancel class="btn-secondary">Cancelar</button><button type="submit" data-save class="btn-primary">Guardar configuración</button></div></form>';
    document.body.append(dialog);
    const form=dialog.querySelector('form'),enabled=dialog.querySelector('[data-enabled]'),fieldset=dialog.querySelector('[data-days]'),checks=[...fieldset.querySelectorAll('input')],status=dialog.querySelector('[data-status]'),save=dialog.querySelector('[data-save]');
    const time=dialog.querySelector('[data-time]'),last=dialog.querySelector('[data-last]');
    let loaded=false,busy=false;
    const sync=()=>{enabled.disabled=busy||!loaded;fieldset.disabled=busy||!loaded||!enabled.checked;time.disabled=busy||!loaded||!enabled.checked;save.disabled=busy||!loaded;};
    const setStatus=(text,kind='')=>{status.textContent=text;status.dataset.kind=kind;};
    const api=async(action,schedule)=>{
        if(!allowed||!auth.currentUser)throw Error('No tenés permisos para configurar las consultas.');
        const response=await fetch('/.netlify/functions/supplier-settings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await auth.currentUser.getIdToken()},body:JSON.stringify({action,...(schedule?{schedule}:{})})});
        let result;try{result=await response.json();}catch{throw Error('No se pudo consultar la configuración (HTTP '+response.status+').');}
        if(!response.ok||!result.ok)throw Error(result.message||'No se pudo guardar la configuración.');
        if(action==='get'){const r=result.lastRun;last.replaceChildren();const title=document.createElement('strong');title.textContent='Última revisión';const info=document.createElement('p');info.textContent=r?r.day+' · '+(r.done?'Finalizada':'En proceso')+' · '+r.checked+' revisados · '+r.changed+' cambios · '+r.errors+' errores':'Todavía no hay revisiones registradas.';last.append(title,info);if(r){const detail=document.createElement('p');detail.textContent=r.summarySent?(r.summaryDelivered>0?'Resumen aceptado por FCM para '+r.summaryDelivered+' dispositivo(s).':'Resumen registrado; ningún dispositivo recibió aceptación de envío. Revisá la activación push.'):r.summaryError?'Resumen pendiente de reintento: '+r.summaryError:r.done?'Sin resumen registrado.':'El resumen se enviará al finalizar.';last.append(detail);}}
        return result.schedule;
    };
    const apply=value=>{enabled.checked=value.enabled;time.value=value.time||'07:00';checks.forEach(input=>{input.checked=value.days.includes(Number(input.value));});};
    trigger.addEventListener('click',async()=>{
        if(!allowed||busy)return;
        dialog.showModal();loaded=false;busy=true;sync();setStatus('Cargando configuración…');
        try{apply(await api('get'));loaded=true;setStatus('');}catch(e){setStatus(e.message,'error');}
        finally{busy=false;sync();}
    });
    enabled.addEventListener('change',sync);
    for(const btn of dialog.querySelectorAll('[data-close],[data-cancel]'))btn.addEventListener('click',()=>{if(!busy)dialog.close();});
    dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    form.addEventListener('submit',async e=>{
        e.preventDefault();if(!loaded||busy)return;
        const value={enabled:enabled.checked,days:checks.filter(x=>x.checked).map(x=>Number(x.value)),time:time.value||'07:00'};
        if(value.enabled&&!value.days.length){setStatus('Seleccioná al menos un día o desactivá las consultas.','error');return;}
        busy=true;sync();setStatus('Guardando…');
        try{apply(await api('save',value));setStatus('Configuración guardada. Se aplicará a las próximas consultas automáticas.','success');}
        catch(e){setStatus(e.message,'error');}finally{busy=false;sync();}
    });
}
