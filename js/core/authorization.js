import { getAuth } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const pendingProfiles=new WeakMap();
export async function readActiveProfile(app,user=getAuth(app).currentUser){
    if(!user||user.isAnonymous)return null;
    const auth=getAuth(app),uid=user.uid;let byUid=pendingProfiles.get(app);if(!byUid){byUid=new Map();pendingProfiles.set(app,byUid);}
    if(byUid.has(uid))return byUid.get(uid);
    const task=(async()=>{const snapshot=await getDoc(doc(getFirestore(app),'usuarios',uid));if(auth.currentUser?.uid!==uid||!snapshot.exists()||snapshot.data().estado!=='activo')return null;return {...snapshot.data(),uid,email:user.email||''};})();
    byUid.set(uid,task);try{return await task;}finally{if(byUid.get(uid)===task)byUid.delete(uid);}
}
export function createAuthorization(app) {
    const auth = getAuth(app);
    const getActiveProfile=async()=>{try{return await readActiveProfile(app,auth.currentUser);}catch(error){console.error("No se pudo validar el perfil del usuario:",error);return null;}};

    const can = async (permission) => {
        const profile = await getActiveProfile();
        if (!profile) return false;
        if (profile.rol === 'master') return true;
        return profile.permisos?.[permission] === true;
    };

    const canAdminister = () => can('configuracion');

    return {
        getActiveProfile,
        can,
        canAdminister
    };
}
