// Explicit per-module lifecycle. No global patching of Firebase or DOM APIs.
export function createModuleScope(){
 const controller=new AbortController(),stops=new Set(),timers=new Set(),frames=new Set();
 let pending=0;
 const wrap=fn=>(...args)=>{
    if(controller.signal.aborted)return Promise.reject(new Error('Módulo cerrado.'));
    pending++;
    try{return Promise.resolve(fn(...args)).finally(()=>pending--);}catch(e){pending--;throw e;}
 };
 const listen=fn=>(ref,next,error,...rest)=>{
    if(controller.signal.aborted)return ()=>{};
    const stop=fn(ref,(...args)=>{if(!controller.signal.aborted)next(...args);},e=>{if(!controller.signal.aborted){if(error)error(e);else console.warn('Consulta del módulo',e);}},...rest);
    let active=true;const off=()=>{if(active){active=false;stops.delete(off);stop();}};
    stops.add(off);return off;
 };
 const frame=fn=>{if(controller.signal.aborted)return 0;const id=requestAnimationFrame(t=>{frames.delete(id);if(!controller.signal.aborted)fn(t);});frames.add(id);return id;};
 const timeout=(fn,ms,...args)=>{if(controller.signal.aborted)return 0;const id=setTimeout(()=>{timers.delete(id);if(!controller.signal.aborted)fn(...args);},ms);timers.add(id);return id;};
 const dispose=()=>{controller.abort();for(const stop of [...stops])try{stop();}catch{}for(const id of frames)cancelAnimationFrame(id);for(const id of timers)clearTimeout(id);frames.clear();timers.clear();};
 return {signal:controller.signal,wrap,listen,frame,timeout,dispose,get busy(){return pending>0;}};
}
