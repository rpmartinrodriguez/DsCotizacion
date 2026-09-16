import { 
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut 
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

    // Habilitar el botón de registro en la pantalla
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
            if (isRegisterMode) {
                // 1. CREAR CUENTA NUEVA
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await procesarNuevoUsuario(userCredential.user);
            } else {
                // 2. INGRESAR (LOGIN)
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
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

            // Si es el primer usuario, le damos permisos totales en los 15 módulos
            // Si no, lo creamos Inactivo y sin permisos para que el Admin lo configure
            const nuevoPerfil = {
                email: user.email,
                nombre: user.email.split('@')[0], // Nombre temporal
                estado: isFirstUser ? 'activo' : 'inactivo',
                rol: isFirstUser ? 'master' : 'empleado',
                fechaCreacion: new Date(),
                permisos: {
                    mostrador: isFirstUser,
                    indicadores: isFirstUser,
                    recetas: isFirstUser,
                    stock: isFirstUser,
                    presupuestos: isFirstUser,
                    precios: isFirstUser,
                    cajas: isFirstUser,
                    finanzas: isFirstUser,
                    historial: isFirstUser,
                    compras: isFirstUser,
                    compras_lista: isFirstUser,
                    clientes: isFirstUser,
                    agenda: isFirstUser,
                    modelos: isFirstUser,
                    configuracion: isFirstUser
                }
            };

            await setDoc(doc(db, 'usuarios', user.uid), nuevoPerfil);

            if (isFirstUser) {
                // Guardamos los datos en localStorage antes de redirigir
                localStorage.setItem('userPermisos', JSON.stringify(nuevoPerfil.permisos));
                localStorage.setItem('userName', nuevoPerfil.nombre);
                localStorage.setItem('userRol', nuevoPerfil.rol);

                alert("¡Bienvenido! Al ser el primer usuario, se te han asignado permisos de Administrador Maestro.");
                window.location.href = 'index.html'; // Lo mandamos al dashboard
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
                await procesarNuevoUsuario(user);
                return;
            }

            const perfil = docSnap.data();

            if (perfil.estado !== 'activo') {
                await signOut(auth);
                showError("Tu cuenta está inactiva o bloqueada. Contactá al Administrador.");
                return;
            }

            // Guardamos los permisos en la sesión local para el "Patovica" (menu.js)
            localStorage.setItem('userPermisos', JSON.stringify(perfil.permisos || {}));
            localStorage.setItem('userName', perfil.nombre || user.email);
            localStorage.setItem('userRol', perfil.rol);

            // REDIRECCIÓN INTELIGENTE
            if (perfil.rol === 'master') {
                window.location.href = 'index.html'; // El dueño siempre al Dashboard
            } else {
                // Buscamos a qué pantalla mandarlo según su primer permiso válido
                const p = perfil.permisos || {};
                
                if (p.mostrador) window.location.href = 'pos.html';
                else if (p.indicadores) window.location.href = 'index.html';
                else if (p.stock) window.location.href = 'stock.html';
                else if (p.recetas) window.location.href = 'recetas.html';
                else if (p.presupuestos) window.location.href = 'presupuesto.html';
                else if (p.cajas) window.location.href = 'cajas.html';
                else if (p.clientes) window.location.href = 'clientes.html';
                else {
                    // Si no tiene nada tildado, lo pateamos
                    await signOut(auth);
                    showError("No tenés ningún módulo asignado. Hablá con el Administrador.");
                }
            }

        } catch (error) {
            console.error("Error al verificar perfil:", error);
            showError("Hubo un error al verificar tus permisos. Reintentá.");
            await signOut(auth);
        }
    }
}
