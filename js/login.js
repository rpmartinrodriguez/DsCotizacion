import { 
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, setDoc, collection, getDocs, limit, query 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupLogin(app) {
    const auth = getAuth(app);
    const db = getFirestore(app);

    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const btnSubmit = document.getElementById('btn-submit');
    const errorMessage = document.getElementById('error-message');
    
    // Modo Registro vs Modo Login
    const registroContainer = document.getElementById('registro-container');
    const btnRegistrar = document.getElementById('btn-registrar');
    let isRegisterMode = false;

    // Habilitar el botón de registro por si necesitan crear cuentas
    registroContainer.style.display = 'block';

    btnRegistrar.addEventListener('click', (e) => {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        if (isRegisterMode) {
            btnSubmit.textContent = 'Crear Cuenta Nueva';
            btnRegistrar.textContent = 'Ya tengo cuenta, ingresar';
        } else {
            btnSubmit.textContent = 'Ingresar al Sistema';
            btnRegistrar.textContent = 'Crear cuenta nueva';
        }
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
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showError("Por favor, completa todos los campos.");
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Procesando...';
        errorMessage.style.display = 'none';

        try {
            let userCredential;

            if (isRegisterMode) {
                // 1. CREAR CUENTA NUEVA
                userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await procesarNuevoUsuario(userCredential.user);
            } else {
                // 2. INGRESAR (LOGIN)
                userCredential = await signInWithEmailAndPassword(auth, email, password);
                await verificarAccesoUsuario(userCredential.user);
            }
            
        } catch (error) {
            console.error("Error de Autenticación:", error);
            let msg = "Error al ingresar. Verificá tus datos.";
            if (error.code === 'auth/wrong-password') msg = "Contraseña incorrecta.";
            if (error.code === 'auth/user-not-found') msg = "No existe una cuenta con este correo.";
            if (error.code === 'auth/email-already-in-use') msg = "Este correo ya está registrado.";
            if (error.code === 'auth/weak-password') msg = "La contraseña debe tener al menos 6 caracteres.";
            showError(msg);
        }
    });

    // Función para manejar la base de datos cuando se registra un usuario
    async function procesarNuevoUsuario(user) {
        try {
            // Verificamos si la colección de usuarios está vacía
            const usuariosSnapshot = await getDocs(query(collection(db, 'usuarios'), limit(1)));
            const isFirstUser = usuariosSnapshot.empty;

            // Si es el primer usuario, le damos permisos totales (Master Admin)
            // Si no, lo creamos como "Cajero" pero Inactivo, para que el Admin lo habilite
            const nuevoPerfil = {
                email: user.email,
                nombre: user.email.split('@')[0], // Nombre temporal
                estado: isFirstUser ? 'activo' : 'inactivo',
                rol: isFirstUser ? 'master' : 'empleado',
                fechaCreacion: new Date(),
                // PERMISOS GRANULARES
                permisos: {
                    mostrador: isFirstUser,      // Caja
                    recetas: isFirstUser,        // Ver recetas
                    stock: isFirstUser,          // Módulo de stock
                    cajas: isFirstUser,          // Historial de cajas
                    finanzas: isFirstUser,       // Indicadores y rentabilidad
                    configuracion: isFirstUser   // Crear/Editar Usuarios (Panel Admin)
                }
            };

            await setDoc(doc(db, 'usuarios', user.uid), nuevoPerfil);

            if (isFirstUser) {
                alert("¡Bienvenido! Al ser el primer usuario, se te han asignado permisos de Administrador Maestro.");
                window.location.href = 'pos.html'; // Lo mandamos al mostrador
            } else {
                alert("Cuenta creada con éxito. Tu usuario está inactivo. Pedile al Administrador que te habilite y asigne tus permisos.");
                await signOut(auth); // Lo deslogueamos porque está inactivo
                window.location.reload();
            }

        } catch (error) {
            console.error("Error al crear perfil en base de datos:", error);
            showError("La cuenta se creó, pero hubo un error al asignar los permisos.");
        }
    }

    // Función para verificar si el usuario que ingresa tiene permiso de entrar
    async function verificarAccesoUsuario(user) {
        try {
            const docRef = doc(db, 'usuarios', user.uid);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                // Raro que pase, pero por si un usuario se borró de la DB pero no de Auth
                await procesarNuevoUsuario(user);
                return;
            }

            const perfil = docSnap.data();

            if (perfil.estado !== 'activo') {
                await signOut(auth);
                showError("Tu cuenta está inactiva o bloqueada. Contactá al Administrador.");
                return;
            }

            // Guardamos los permisos en la sesión local (localStorage) para que el Menú los lea rápido
            localStorage.setItem('userPermisos', JSON.stringify(perfil.permisos));
            localStorage.setItem('userName', perfil.nombre || user.email);
            localStorage.setItem('userRol', perfil.rol);

            // Login exitoso -> Redirigir a la app
            // Si tiene permiso de mostrador, va al mostrador, sino al dashboard de finanzas u otro.
            if (perfil.permisos.mostrador) {
                window.location.href = 'pos.html';
            } else {
                window.location.href = 'index.html';
            }

        } catch (error) {
            console.error("Error al verificar perfil:", error);
            showError("Hubo un error al verificar tus permisos. Reintentá.");
            await signOut(auth);
        }
    }
}
