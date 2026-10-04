import { getAuth } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function createAuthorization(app) {
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Compartir únicamente solicitudes simultáneas; no guardar permisos
    // entre navegaciones ni reutilizar perfiles obsoletos.
    let consultaEnCurso = null;
    let consultaUid = null;
    const getActiveProfile = async () => {
        const user = auth.currentUser;
        if (!user || user.isAnonymous) return null;
        if (consultaEnCurso && consultaUid === user.uid) return consultaEnCurso;

        const consultar = async () => {
        try {
            const snapshot = await getDoc(doc(db, 'usuarios', user.uid));
            if (!snapshot.exists()) return null;

            const profile = snapshot.data();
            if (profile.estado !== 'activo') return null;

            return {
                uid: user.uid,
                email: user.email || '',
                ...profile
            };
        } catch (error) {
            console.error("No se pudo validar el perfil del usuario:", error);
            return null;
        }
        };
        consultaUid = user.uid;
        const pending = consultar();
        consultaEnCurso = pending;
        try {
            return await pending;
        } finally {
            if (consultaEnCurso === pending) consultaEnCurso = null;
        }
    };

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
