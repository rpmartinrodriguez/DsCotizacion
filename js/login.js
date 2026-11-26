import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, indexedDBLocalPersistence 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupLogin(app) {
    const auth = getAuth(app);
    const db = getFirestore(app);

    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const btnSubmit = document.getElementById('btn-submit');
    const errorMessage = document.getElementById('error-message');
    const retry=document.getElementById('retry-session'),switchAccount=document.getElementById('switch-account');
    let busy=false;
    // Firebase almacena su propia sesión, no la contraseña.
    const persist=async()=>{
        try{await setPersistence(auth,indexedDBLocalPersistence);}
        catch(first){await setPersistence(auth,browserLocalPersistence);}
    };
    const ready=()=>new Promise((resolve,reject)=>{let stop;stop=onAuthStateChanged(auth,user=>{stop?.();resolve(user);},error=>{stop?.();reject(error);});});
    const loading=(label)=>{busy=true;btnSubmit.disabled=true;btnSubmit.textContent=label;errorMessage.style.display='none';retry.hidden=true;switchAccount.hidden=true;};
    const idle=()=>{busy=false;btnSubmit.disabled=false;btnSubmit.textContent='Ingresar';};
    const resumeError=(msg)=>{showError(msg);retry.hidden=false;switchAccount.hidden=!auth.currentUser;idle();};
    const cacheProfile=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};


    const showError = (msg) => {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Ingresar';
    };

    async function verificarAccesoUsuario(user) {
        try {
            const docRef = doc(db, 'usuarios', user.uid);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                await signOut(auth);
                showError("Tu usuario no está habilitado en Dulce App. Contactá al administrador.");
                return;
            }

            const perfil = docSnap.data();

            if (perfil.estado !== 'activo') {
                await signOut(auth);
                showError("Tu cuenta está inactiva o bloqueada. Contactá al administrador.");
                return;
            }

            const permisos = perfil.permisos || {};
            const rol = perfil.rol || 'empleado';

            // Estos valores quedan únicamente como caché de interfaz.
            // La autorización real debe validarse con Firebase/Firestore.
            cacheProfile('userPermisos', JSON.stringify(permisos));
            cacheProfile('userName', perfil.nombre || user.email);
            cacheProfile('userRol', rol);

            if (rol === 'master') {
                window.location.href = 'index.html';
                return;
            }

            if (permisos.mostrador) window.location.href = 'pos.html';
            else if (permisos.indicadores) window.location.href = 'index.html';
            else if (permisos.stock) window.location.href = 'stock.html';
            else if (permisos.recetas) window.location.href = 'recetas.html';
            else if (permisos.presupuestos) window.location.href = 'presupuesto.html';
            else if (permisos.cajas) window.location.href = 'cajas.html';
            else if (permisos.clientes) window.location.href = 'clientes.html';
            else if (permisos.precios) window.location.href = 'precios.html';
            else if (permisos.finanzas) window.location.href = 'finanzas.html';
            else if (permisos.historial) window.location.href = 'historial.html';
            else if (permisos.compras) window.location.href = 'compras.html';
            else if (permisos.compras_lista) window.location.href = 'compras-lista.html';
            else if (permisos.agenda) window.location.href = 'agenda.html';
            else if (permisos.modelos) window.location.href = 'modelos.html';
            else if (permisos.configuracion) window.location.href = 'usuarios.html';
            else {
                await signOut(auth);
                showError("No tenés ningún módulo asignado. Contactá al administrador.");
            }
        } catch (error) {
            console.error("Error al verificar perfil:", error);
            // Un fallo transitorio de red no es una solicitud de cierre de sesión.
            resumeError('No se pudo verificar tu cuenta. La sesión se conserva. Comprobá la conexión y reintentá.');
        }
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if(busy)return;

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showError("Por favor, completá todos los campos.");
            return;
        }

        loading('Ingresando…');

        try {
            await persist();
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            await verificarAccesoUsuario(userCredential.user);
        } catch (error) {
            console.error("Error de autenticación:", error);

            let msg = "No pudimos iniciar sesión. Verificá el correo y la contraseña.";
            if (error.code === 'auth/invalid-email') msg = "El correo electrónico no es válido.";
            if (error.code === 'auth/too-many-requests') msg = "Hubo demasiados intentos. Probá nuevamente más tarde.";

            if(error.code==='auth/web-storage-unsupported')msg='El navegador no permite guardar la sesión. Revisá sus permisos de almacenamiento.';
            showError(msg);
        }finally{idle();}
    });
    const restore=async()=>{
        if(busy)return;
        loading('Recuperando sesión…');
        try{
            const user=await ready();
            if(user&&!user.isAnonymous){
                // No descartar un usuario restaurado aunque falle migrar su almacenamiento.
                try{await persist();}catch(e){console.warn('No se pudo cambiar la persistencia de Firebase',e);}
                await verificarAccesoUsuario(user);
            }
        }catch(e){console.error('Restauración de sesión',e);resumeError('No pudimos recuperar la sesión. Reintentá con conexión.');}
        finally{idle();}
    };
    retry.addEventListener('click',restore);
    switchAccount.addEventListener('click',async()=>{if(busy)return;loading('Cerrando sesión…');try{await signOut(auth);idle();}catch(e){resumeError('No se pudo cerrar la sesión. Reintentá.');}});
    void restore();
}
