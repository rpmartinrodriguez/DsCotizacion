import {createSign} from 'node:crypto';
import {readServiceAccount} from './push-admin.mjs';
const base='https://walletobjects.googleapis.com/walletobjects/v1';
const fail=(message,status=503)=>Object.assign(new Error(message),{status});
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
function sign(claims,key){
 const s=encode({alg:'RS256',typ:'JWT'})+'.'+encode(claims);
 return s+'.'+createSign('RSA-SHA256').update(s).end().sign(key).toString('base64url');
}
export function googleClass(production){
 const id=process.env[production?'DS_WALLET_GOOGLE_CLASS_ID':'DS_WALLET_GOOGLE_TEST_CLASS_ID']||'';
 return /^\d+\.[A-Za-z0-9_.-]+$/.test(id)?id:null;
}
export async function googleWallet(production){
 const classId=googleClass(production);
 if(!classId)throw fail('Google Wallet pendiente de configurar.');
 if(!production && classId===googleClass(true))throw fail('La clase de prueba debe ser distinta de producción.');
 const account=readServiceAccount(), now=Math.floor(Date.now()/1000);
 const assertion=sign({iss:account.clientEmail,scope:'https://www.googleapis.com/auth/wallet_object.issuer',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600},account.privateKey);
 const auth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(7000)});
 const token=(await auth.json()).access_token;
 if(!auth.ok||!token)throw fail('No se pudo autenticar Google Wallet.');
 async function request(path,method='GET',body){
  const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(7000)});
  if(!r.ok)throw fail('Google Wallet rechazó la operación (HTTP '+r.status+').',r.status===404?404:503);
  return r.json();
 }
 const objectId=card=>classId.split('.')[0]+'.ds_'+(production?'live_':'test_')+card;
 const path=card=>'/loyaltyObject/'+encodeURIComponent(objectId(card));
 return {
  async issue(member,origin){
   const id=objectId(member.card);
   const obj={id,classId,state:'ACTIVE',accountId:member.card,accountName:member.name,barcode:{type:'QR_CODE',value:member.card,alternateText:member.card}};
   let existing;
   try{existing=await request(path(member.card));}catch(e){if(e.status!==404)throw e;}
   if(!existing)await request('/loyaltyObject','POST',obj);
   else if(existing.classId!==classId)throw fail('La tarjeta pertenece a otra clase.');
   const jwt=sign({iss:account.clientEmail,aud:'google',typ:'savetowallet',iat:now,origins:[new URL(origin).hostname],payload:{loyaltyObjects:[{id}]}},account.privateKey);
   return 'https://pay.google.com/gp/v/save/'+jwt;
  },
  status:async card=>{try{const o=await request(path(card));return {issued:true,saved:o.hasUsers===true};}catch(e){if(e.status===404)return {issued:false,saved:false};throw e;}},
  async notify(card,title,body){
   return request(path(card)+'/addMessage','POST',{message:{header:title,body,messageType:'TEXT_AND_NOTIFY'}});
  }
 };
}
