import {admin,productionOrigin} from './lib/push-admin.mjs';
import {remindBirthdays} from './lib/fidelizacion-birthdays.mjs';
export const config={schedule:'0 12 * * *'};
export default async function(){
 if(process.env.CONTEXT!=='production')return new Response('Sin envío automático en pruebas.');
 try{const result=await remindBirthdays(admin(),productionOrigin,true);return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});}
 catch(e){console.error('loyalty birthday monitor',e.code||e.status||'error');return new Response('No se pudo procesar el aviso.',{status:503});}
}
