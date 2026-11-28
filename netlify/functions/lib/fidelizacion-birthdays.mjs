import {dispatchOnce} from './push-admin.mjs';
const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'});
export function argentinaDate(now=new Date()){
 const parts=Object.fromEntries(localDate.formatToParts(now).map(x=>[x.type,x.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
export function validBirthdate(value,now=new Date()){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>argentinaDate(now))return false;
 const d=new Date(value+'T00:00:00Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function birthdayKeys(day){
 const keys=[day.slice(5)];
 const y=Number(day.slice(0,4));
 if(day.slice(5)==='02-28'&&new Date(Date.UTC(y,1,29)).getUTCMonth()!==1)keys.push('02-29');
 return keys;
}
export async function birthdays(svc,origin,production,day=argentinaDate()){
 const col=svc.db.collection('dsLoyaltyMembers'+(production?'Live':'Test'));
 const batches=await Promise.all(birthdayKeys(day).map(key=>col.where('birthdayKey','==',key).get()));
 return batches.flatMap(s=>s.docs).map(d=>d.data()).filter(m=>m.origin===origin&&m.state==='registered'&&m.birthdayReminder===true&&validBirthdate(m.birthdate)&&birthdayKeys(day).includes(m.birthdate.slice(5))).map(m=>({name:m.name,card:m.card,birthdate:m.birthdate}));
}
export async function remindBirthdays(svc,origin,production){
 const day=argentinaDate(),people=await birthdays(svc,origin,production,day);
 if(!people.length)return {count:0};
 const n=people.length;
 const result=await dispatchOnce(svc,origin,{id:'loyalty-birthday-'+day,title:'Dulce Sall · Cumpleaños de clientes',body:n===1?'Hoy cumple años un cliente. Entrá en Fidelización para preparar su regalo.':'Hoy cumplen años '+n+' clientes. Entrá en Fidelización para preparar sus regalos.',path:'/fidelizacion.html'});
 return {count:n,...result};
}
