import test from 'node:test';
import assert from 'node:assert/strict';
import {argentinaDate,validBirthdate,birthdayKeys,birthdays} from '../netlify/functions/lib/fidelizacion-birthdays.mjs';
test('fecha argentina y validación del calendario',()=>{
 const now=new Date('2026-11-28T01:00:00Z');
 assert.equal(argentinaDate(now),'2026-11-27');
 assert.equal(validBirthdate('2000-02-29',now),true);
 assert.equal(validBirthdate('2001-02-29',now),false);
 assert.equal(validBirthdate('2026-11-28',now),false);
 assert.equal(validBirthdate('2020-04-31',now),false);
});
test('cumpleaños 29 de febrero en años no bisiestos',()=>{
 assert.deepEqual(birthdayKeys('2026-02-28'),['02-28','02-29']);
 assert.deepEqual(birthdayKeys('2028-02-28'),['02-28']);
 assert.deepEqual(birthdayKeys('2028-02-29'),['02-29']);
});
test('sólo clientes registrados, del entorno y con aviso habilitado',async()=>{
 const origin='https://deploy-preview-28--dulce-app.netlify.app';
 const common={origin,state:'registered',birthdayReminder:true,birthdate:'1990-11-27',name:'Prueba',card:'DS-1'};
 const entries=[common,{...common,origin:'https://dulce-app.netlify.app'},{...common,state:'pending'},{...common,birthdayReminder:false},{...common,birthdate:'1990-11-26'}];
 const svc={db:{collection(name){assert.equal(name,'dsLoyaltyMembersTest');return {where(field,op,key){assert.equal(field,'birthdayKey');assert.equal(key,'11-27');return {async get(){return {docs:entries.map(m=>({data:()=>m}))};}};}};}}};
 const result=await birthdays(svc,origin,false,'2026-11-27');
 assert.deepEqual(result,[{name:'Prueba',card:'DS-1',birthdate:'1990-11-27'}]);
});
