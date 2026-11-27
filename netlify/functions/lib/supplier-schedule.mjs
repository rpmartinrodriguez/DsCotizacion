
export const DEFAULT_DAYS=[1,2,3,4,5,6,7];
export const DAYS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
export const validTime=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5][05]$/.test(value);
export function normalizeSchedule(value){
    if(!value || typeof value!=='object')return {enabled:true,days:[...DEFAULT_DAYS],time:'07:00'};
    const days=Array.isArray(value.days)?[...new Set(value.days.filter(n=>Number.isInteger(n)&&n>=1&&n<=7))].sort((a,b)=>a-b):[...DEFAULT_DAYS];
    return {enabled:value.enabled!==false,days,time:validTime(value.time)?value.time:'07:00'};
}
export function validateSchedule(value){
    if(typeof value?.enabled!=='boolean'||!Array.isArray(value.days)||value.days.some(n=>!Number.isInteger(n)||n<1||n>7))throw Object.assign(new Error('Seleccioná días válidos.'),{status:400});
    if(value.time!==undefined&&!validTime(value.time))throw Object.assign(new Error('Elegí un horario de 00:00 a 23:55, en intervalos de 5 minutos.'),{status:400});
    const result=normalizeSchedule(value);
    if(result.enabled&&!result.days.length)throw Object.assign(new Error('Seleccioná al menos un día o pausá las consultas.'),{status:400});
    return result;
}
export function argentinaDay(date=new Date()){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Argentina/Cordoba',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const fields=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return {key:fields.year+'-'+fields.month+'-'+fields.day,weekday:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(fields.weekday)+1,time:fields.hour+':'+fields.minute};
}
export function shouldCheck(value,date=new Date()){
    const schedule=normalizeSchedule(value);
    const local=argentinaDay(date);
    return schedule.enabled&&schedule.days.includes(local.weekday)&&local.time>=schedule.time;
}
export function scheduleRef(db){return db.collection('dsSupplierSettings').doc('schedule');}
