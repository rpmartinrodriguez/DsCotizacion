import { 
    getAuth, signInWithEmailAndPassword, signOut 
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

    const showError = (msg) => {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Ingresar al Sistema';
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
            localStorage.setItem('userPermisos', JSON.stringify(permisos));
            localStorage.setItem('userName', perfil.nombre || user.email);
            localStorage.setItem('userRol', rol);

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
            else {
                await signOut(auth);
                showError("No tenés ningún módulo asignado. Contactá al administrador.");
            }
        } catch (error) {
            console.error("Error al verificar perfil:", error);
            await signOut(auth);
            showError("Hubo un error al verificar tus permisos. Reintentá.");
        }
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showError("Por favor, completá todos los campos.");
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Ingresando...';
        errorMessage.style.display = 'none';

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            await verificarAccesoUsuario(userCredential.user);
        } catch (error) {
            console.error("Error de autenticación:", error);

            let msg = "No pudimos iniciar sesión. Verificá el correo y la contraseña.";
            if (error.code === 'auth/invalid-email') msg = "El correo electrónico no es válido.";
            if (error.code === 'auth/too-many-requests') msg = "Hubo demasiados intentos. Probá nuevamente más tarde.";

            showError(msg);
        }
    });
}
