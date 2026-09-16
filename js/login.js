import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, limit, query } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupLogin(app) {
    const auth = getAuth(app);
    const db = getFirestore(app);

    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const btnSubmit = document.getElementById('btn-submit');
    const errorMessage = document.getElementById('error-message');
    const registroContainer = document.getElementById('registro-container');
    const btnRegistrar = document.getElementById('btn-registrar');
    let isRegisterMode = false;

    registroContainer.style.display = 'block';

    btnRegistrar.addEventListener('click', (e) => {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        btnSubmit.textContent = isRegisterMode ? 'Crear Cuenta Nueva' : 'Ingresar al Sistema';
        btnRegistrar.textContent = isRegisterMode ? 'Ya tengo cuenta, ingresar' : 'Crear cuenta nueva';
        errorMessage.style.display = 'none';
    });

    const showError = (msg) => {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
        btnSubmit.disabled = false;
        btnSubmit.textContent = isRegisterMode ? 'Crear Cuenta Nueva' : 'Ingresar al Sistema';
    };

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!emailInput.value || !passwordInput.value) return showError("Completa todos los campos.");

        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Procesando...';
        errorMessage.style.display = 'none';

        try {
            if (isRegisterMode) {
                const userCredential = await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
                await procesarNuevoUsuario(userCredential.user);
            } else {
                const userCredential = await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
                await verificarAccesoUsuario(userCredential.user);
            }
        } catch (error) {
            let msg = "Error al ingresar.";
            if (error.code === 'auth/wrong-password') msg = "Contraseña incorrecta.";
            if (error.code === 'auth/user-not-found') msg = "Usuario no encontrado.";
            if (error.code === 'auth/email-already-in-use') msg = "Correo ya registrado.";
            showError(msg);
        }
    });

    async function procesarNuevoUsuario(user) {
        try {
            const isFirstUser = (await getDocs(query(collection(db, 'usuarios'), limit(1)))).empty;

            const nuevoPerfil = {
                email: user.email,
                nombre: user.email.split('@')[0],
                estado: isFirstUser ? 'activo' : 'inactivo',
                rol: isFirstUser ? 'master' : 'empleado',
                fechaCreacion: new Date(),
                permisos: {
                    mostrador: isFirstUser, indicadores: isFirstUser, recetas: isFirstUser, stock: isFirstUser,
                    presupuestos: isFirstUser, precios: isFirstUser, cajas: isFirstUser, finanzas: isFirstUser,
                    historial: isFirstUser, compras: isFirstUser, compras_lista: isFirstUser, clientes: isFirstUser,
                    agenda: isFirstUser, modelos: isFirstUser, configuracion: isFirstUser
                }
            };

            await setDoc(doc(db, 'usuarios', user.uid), nuevoPerfil);

            if (isFirstUser) {
                localStorage.setItem('userPermisos', JSON.stringify(nuevoPerfil.permisos));
                localStorage.setItem('userName', nuevoPerfil.nombre);
                localStorage.setItem('userRol', nuevoPerfil.rol);
                window.location.href = 'index.html';
            } else {
                alert("Cuenta creada. Pedile al Admin que te habilite y asigne permisos.");
                await signOut(auth);
                window.location.reload();
            }
        } catch (error) { showError("Error al crear la cuenta en la base."); }
    }

    async function verificarAccesoUsuario(user) {
        try {
            const docSnap = await getDoc(doc(db, 'usuarios', user.uid));
            if (!docSnap.exists()) return await procesarNuevoUsuario(user);

            const perfil = docSnap.data();
            if (perfil.estado !== 'activo') {
                await signOut(auth);
                return showError("Tu cuenta está bloqueada.");
            }

            localStorage.setItem('userPermisos', JSON.stringify(perfil.permisos || {}));
            localStorage.setItem('userName', perfil.nombre || user.email);
            localStorage.setItem('userRol', perfil.rol);

            if (perfil.rol === 'master') window.location.href = 'index.html';
            else {
                const p = perfil.permisos || {};
                if (p.mostrador) window.location.href = 'pos.html';
                else if (p.stock) window.location.href = 'stock.html';
                else if (p.recetas) window.location.href = 'recetas.html';
                else if (p.finanzas) window.location.href = 'index.html';
                else window.location.href = 'login.html'; // Si no tiene NADA, se queda afuera
            }
        } catch (error) {
            showError("Hubo un error. Reintentá.");
            await signOut(auth);
        }
    }
}
