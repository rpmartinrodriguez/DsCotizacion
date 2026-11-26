// Native HTTPS implementation for the limited Firestore and FCM operations used by push.
import { createSign, createVerify } from 'node:crypto';
const OAUTH_URL='https://oauth2.googleapis.com/token';
const CERTS_URL='https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const error=(code,message)=>Object.assign(new Error(message),{code});
export class Timestamp {
    constructor(value){this.value=new Date(value).toISOString();}
    toMillis(){return Date.parse(this.value);}
    static now(){return new Timestamp(Date.now());}
    static fromMillis(value){return new Timestamp(value);}
}
export const FieldPath={documentId:()=> '__name__'};
export const FieldValue={serverTimestamp:()=>Timestamp.now()};
export function encode(value){
    if(value===null)return {nullValue:null};
    if(value instanceof Timestamp)return {timestampValue:value.value};
    if(typeof value==='string')return {stringValue:value};
    if(typeof value==='boolean')return {booleanValue:value};
    if(typeof value==='number'&&Number.isFinite(value))return Number.isSafeInteger(value)?{integerValue:String(value)}:{doubleValue:value};
    if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
    if(value&&typeof value==='object')return {mapValue:{fields:fields(value)}};
    throw error('INVALID_VALUE','Tipo de dato no admitido.');
}
const fields=obj=>Object.fromEntries(Object.entries(obj).filter(([,v])=>v!==undefined).map(([k,v])=>[k,encode(v)]));
export function decode(v){
    if(!v||'nullValue' in v)return null;
    if('timestampValue' in v)return new Timestamp(v.timestampValue);
    if('integerValue' in v)return Number(v.integerValue);
    if('doubleValue' in v)return Number(v.doubleValue);
    if('stringValue' in v)return v.stringValue;
    if('booleanValue' in v)return v.booleanValue;
    if('arrayValue' in v)return (v.arrayValue.values||[]).map(decode);
    if('mapValue' in v)return decodeFields(v.mapValue.fields);
    if('referenceValue' in v)return v.referenceValue;
    return null;
}
const decodeFields=f=>Object.fromEntries(Object.entries(f||{}).map(([k,v])=>[k,decode(v)]));
const segment=v=>{if(typeof v!=='string'||!v||v.includes('/'))throw error('INVALID_PATH','Ruta inválida.');return encodeURIComponent(v);};
const apiError=(status,payload)=>{
    const e=payload?.error;
    const code=(typeof e==='object'?e?.status:e)||'HTTP_'+status;
    const fcmCode=Array.isArray(e?.details)?e.details.find(d=>d['@type']==='type.googleapis.com/google.firebase.fcm.v1.FcmError')?.errorCode:null;
    return Object.assign(error(code,'Google API: '+code),{httpStatus:status,fcmCode});
};
async function jsonFetch(url,options={}){
    const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(10000)});
    let payload;
    try{payload=await response.json();}catch{throw error('HTTP_'+response.status,'Respuesta inválida de Google API.');}
    if(!response.ok)throw apiError(response.status,payload);
    return {payload,response};
}
let cachedToken=null,cachedCerts=null;
async function accessToken(service){
    const now=Math.floor(Date.now()/1000),key=service.clientEmail+'|'+service.projectId;
    if(cachedToken?.key===key&&cachedToken.until>now+60)return cachedToken.token;
    const unsigned=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:service.clientEmail,scope:'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',aud:OAUTH_URL,iat:now,exp:now+3600});
    const signature=createSign('RSA-SHA256').update(unsigned).sign(service.privateKey).toString('base64url');
    const {payload}=await jsonFetch(OAUTH_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature})});
    if(!payload.access_token)throw error('UNAUTHENTICATED','Google no devolvió un token de acceso.');
    cachedToken={key,token:payload.access_token,until:now+Number(payload.expires_in||3600)};
    return cachedToken.token;
}
async function verifyIdToken(token,projectId){
    const invalid=()=>error('auth/invalid-id-token','Sesión inválida.');
    let h,p,parts;
    try{
        if(typeof token!=='string'||token.length>12000)throw invalid();
        parts=token.split('.');
        if(parts.length!==3)throw invalid();
        h=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
        p=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
    }catch{throw invalid();}
    const now=Math.floor(Date.now()/1000);
    if(h.alg!=='RS256'||typeof h.kid!=='string'||p.aud!==projectId||p.iss!=='https://securetoken.google.com/'+projectId||typeof p.sub!=='string'||!p.sub||p.sub.length>128||p.sub.includes('/')||!Number.isFinite(p.exp)||p.exp<=now||!Number.isFinite(p.iat)||p.iat>now+60||!Number.isFinite(p.auth_time)||p.auth_time>now+60||p.firebase?.sign_in_provider==='anonymous')throw invalid();
    if(!cachedCerts||cachedCerts.until<=now||!Object.hasOwn(cachedCerts.values,h.kid)){
        const {payload,response}=await jsonFetch(CERTS_URL);
        const ttl=Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1]||300);
        cachedCerts={values:payload,until:now+Math.max(1,ttl-30)};
    }
    const cert=Object.hasOwn(cachedCerts.values,h.kid)?cachedCerts.values[h.kid]:null;
    if(!cert)throw invalid();
    let valid=false;try{valid=createVerify('RSA-SHA256').update(parts[0]+'.'+parts[1]).verify(cert,Buffer.from(parts[2],'base64url'));}catch{}
    if(!valid)throw invalid();
    return {uid:p.sub};
}
export function createRestServices(service){
    const root='projects/'+service.projectId+'/databases/(default)/documents';
    const base='https://firestore.googleapis.com/v1/'+root;
    const request=async(url,method='GET',body)=>{
        const token=await accessToken(service);
        return (await jsonFetch(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})).payload;
    };
    const commit=(writes,transaction)=>request(base+':commit','POST',{writes,...(transaction?{transaction}:{})});
    const snapshot=(ref,doc)=>({ref,id:ref.id,exists:Boolean(doc),data:()=>doc?decodeFields(doc.fields):undefined});
    function refFor(collection,id){
        const name=root+'/'+segment(collection)+'/'+segment(id);
        const url='https://firestore.googleapis.com/v1/'+name;
        const ref={id,name,
            async get(transaction){
                try{return snapshot(ref,await request(url+(transaction?'?transaction='+encodeURIComponent(transaction):'')));}
                catch(e){if(e.httpStatus===404)return snapshot(ref,null);throw e;}
            },
            set(data,options){return commit([writeFor(ref,data,Boolean(options?.merge))]);},
            update(data){return commit([writeFor(ref,data,true,true)]);},
            delete(){return commit([{delete:name}]);}
        };
        return ref;
    }
    function writeFor(ref,data,merge,exists){
        return {update:{name:ref.name,fields:fields(data)},...(merge?{updateMask:{fieldPaths:Object.keys(data)}}:{}),...(exists?{currentDocument:{exists:true}}:{})};
    }
    function collection(name,opts={}){
        segment(name);
        return {
            doc:id=>refFor(name,id),
            where:(field,op,value)=>collection(name,{...opts,filter:{fieldFilter:{field:{fieldPath:field},op:({'==':'EQUAL','>=':'GREATER_THAN_OR_EQUAL'})[op],value:encode(value)}}}),
            orderBy:(field,direction='asc')=>collection(name,{...opts,order:[{field:{fieldPath:field},direction:direction==='desc'?'DESCENDING':'ASCENDING'}]}),
            limit:n=>collection(name,{...opts,limit:n}),
            startAfter:id=>collection(name,{...opts,startAt:{values:[{referenceValue:refFor(name,id).name}],before:false}}),
            async get(){
                const structuredQuery={from:[{collectionId:name}],...(opts.filter?{where:opts.filter}:{}),...(opts.order?{orderBy:opts.order}:{}),...(opts.limit?{limit:opts.limit}:{}),...(opts.startAt?{startAt:opts.startAt}:{})};
                const rows=await request(base+':runQuery','POST',{structuredQuery});
                const docs=rows.filter(r=>r.document).map(r=>snapshot(refFor(name,r.document.name.split('/').at(-1)),r.document));
                return {docs,size:docs.length,empty:docs.length===0};
            }
        };
    }
    const db={collection,async runTransaction(fn){
        for(let attempt=0;attempt<4;attempt++){
            let tx;
            try{
                tx=(await request(base+':beginTransaction','POST',{options:{readWrite:{}}})).transaction;
                if(!tx)throw error('TRANSACTION_MISSING','No se pudo iniciar la transacción.');
                const writes=[];
                const result=await fn({get:ref=>ref.get(tx),set:(ref,data,opts)=>{writes.push(writeFor(ref,data,Boolean(opts?.merge)));}});
                if(writes.length)await commit(writes,tx);
                else await request(base+':rollback','POST',{transaction:tx});
                return result;
            }catch(e){
                if(tx)try{await request(base+':rollback','POST',{transaction:tx});}catch{}
                if(e.code!=='ABORTED'||attempt===3)throw e;
                await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));
            }
        }
    }};
    const messaging={async sendEachForMulticast(message){
        const {tokens,...payload}=message,responses=[];
        for(let i=0;i<tokens.length;i+=8){
            const batch=await Promise.all(tokens.slice(i,i+8).map(async token=>{
                try{
                    await request('https://fcm.googleapis.com/v1/projects/'+service.projectId+'/messages:send','POST',{message:{...payload,token}});
                    return {success:true};
                }catch(e){return {success:false,error:{code:e.fcmCode==='UNREGISTERED'?'messaging/registration-token-not-registered':e.code||'FCM_ERROR'}};}
            }));
            responses.push(...batch);
        }
        return {successCount:responses.filter(r=>r.success).length,responses};
    }};
    return {db,messaging,auth:{verifyIdToken:token=>verifyIdToken(token,service.projectId)}};
}
