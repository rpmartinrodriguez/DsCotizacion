import {randomBytes} from 'node:crypto';
import {admin,authorize} from './lib/push-admin.mjs';
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const permissions=['mostrador','indicadores','recetas','stock','presupuestos','precios','cajas','finanzas','historial','compras','compras_lista','clientes','agenda','modelos','configuracion'];
const allowed=origin=>origin==='https://dulce-app.netlify.app'||/^https:\/\/[a-z0-9-]+--dulce-app\.netlify\.app$/.test(origin);
const deny=(status,message)=>{throw Object.assign(new Error(message),{status});};
export async function manageUser({svc,actor,body,authTime}){
 if(actor.profile.rol!=='master')deny(403,'Sólo el administrador principal puede gestionar cuentas.');
 const caller=await svc.auth.lookup(actor.uid);
 if(!caller||caller.disabled||Number(caller.validSince||0)>authTime)deny(401,'La sesión ya no es válida. Volvé a ingresar.');
 const uid=body?.uid,action=body?.action;
 if(typeof uid!=='string'||!uid||uid.length>128||uid.includes('/')||uid===actor.uid)deny(400,'No se puede modificar la cuenta administradora.');
 if(!['edit','reset','delete'].includes(action))deny(400,'Acción inválida.');
 const ref=svc.db.collection('usuarios').doc(uid),snap=await ref.get();
 if(!snap.exists)deny(404,'El usuario no existe.');
 if(snap.data().rol==='master')deny(403,'La cuenta administradora está protegida.');
 if(action==='edit'){
  const nombre=String(body.nombre||'').trim(),estado=body.estado;
  if(!nombre||nombre.length>120||!['activo','inactivo'].includes(estado))deny(400,'Nombre o estado inválido.');
  if(snap.data().eliminacionPendiente)deny(409,'La eliminación está pendiente. Finalizala antes de editar.');
  const permisos=Object.fromEntries(permissions.map(p=>[p,body.permisos?.[p]===true]));
  await svc.db.runTransaction(async tx=>{const current=await tx.get(ref);if(!current.exists||current.data().rol==='master'||current.data().eliminacionPendiente)deny(409,'La cuenta cambió. Actualizá la lista.');tx.set(ref,{nombre,estado,permisos},{merge:true});});
  return {ok:true};
 }
 if(action==='reset'){
  if(snap.data().eliminacionPendiente)deny(409,'La cuenta está pendiente de eliminación.');
  const target=await svc.auth.lookup(uid);if(!target)deny(404,'No existe una cuenta de acceso asociada.');
  const password='Ds!'+randomBytes(18).toString('base64url')+'7a';
  await svc.auth.updateAccount(uid,{password,validSince:String(Math.floor(Date.now()/1000))});
  return {ok:true,password};
 }
 if(body.confirm!==uid)deny(400,'Confirmación inválida.');
 // Primero bloquear el perfil para que los tokens existentes no permitan operar.
 // Si Auth falla, el registro queda visible como pendiente y puede reintentarse.
 await svc.db.runTransaction(async tx=>{const current=await tx.get(ref);if(!current.exists||current.data().rol==='master')deny(409,'La cuenta cambió. Actualizá la lista.');tx.set(ref,{estado:'inactivo',eliminacionPendiente:true},{merge:true});});
 const target=await svc.auth.lookup(uid);
 if(target){await svc.auth.updateAccount(uid,{disableUser:true});await svc.auth.deleteAccount(uid);}
 await ref.delete();
 return {ok:true};
}
export default async function(request){
 try{
  if(request.method!=='POST')return json(405,{ok:false,message:'Método no permitido.'});
  const origin=new URL(request.url).origin;
  if(!allowed(origin)||(request.headers.get('origin')&&request.headers.get('origin')!==origin))return json(403,{ok:false,message:'Origen no autorizado.'});
  const token=request.headers.get('authorization')||'';
  if(!token.startsWith('Bearer '))return json(401,{ok:false,message:'Iniciá sesión.'});
  let body;try{body=await request.json();}catch{return json(400,{ok:false,message:'Solicitud inválida.'});}
  const svc=admin(),actor=await authorize({headers:{authorization:token}},svc),verified=await svc.auth.verifyIdToken(token.slice(7));
  return json(200,await manageUser({svc,actor,body,authTime:verified.authTime}));
 }catch(e){console.error('users-admin',{code:e.code||e.publicCode||null,status:e.status||null});return json(e.status||503,{ok:false,message:e.status?e.message:'No se completó la operación. Revisá la conexión y los permisos de Firebase Authentication; si eliminabas una cuenta, verificá su estado y reintentá.'});}
}
