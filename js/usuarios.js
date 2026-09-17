import { 
    getFirestore, collection, onSnapshot, doc, updateDoc, setDoc, query, orderBy 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { 
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";

export function setupUsuarios(app, firebaseConfig) {
    const db = getFirestore(app);
    const auth = getAuth(app);
    const usuariosCollection = collection(db, 'usuarios');

    // App Secundaria (Para crear usuarios sin expulsar al Administrador)
    const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
    const secondaryAuth = getAuth(secondaryApp);

    const tablaUsuarios = document.getElementById('tabla-usuarios');
    const modalUsuario = document.getElementById('modal-usuario');
    const modalTitulo = document.getElementById('modal-titulo');
    const btnCancelar = document.getElementById('btn-cancelar-usuario');
    const btnGuardar = document.getElementById('btn-guardar-usuario');
    const btnNuevoUsuario = document.getElementById('btn-nuevo-usuario');

    // Campos del Modal
    const editId = document.getElementById('edit-user-id');
    const editNombre = document.getElementById('edit-user-nombre');
    const editEstado = document.getElementById('edit-user-estado');
    const camposCreacion = document.getElementById('campos-creacion');
    const editEmail = document.getElementById('edit-user-email');
    const editPass = document.getElementById('edit-user-pass');
    
    // Lista completa de los 15 permisos (coinciden con los IDs del HTML)
    const listaPermisos = [
        'mostrador', 'indicadores', 'recetas', 'stock', 'presupuestos', 
        'precios', 'cajas', 'finanzas', 'historial', 'compras', 
        'compras_lista', 'clientes', 'agenda', 'modelos', 'configuracion'
    ];

    let todosLosUsuarios = [];
    let isCreateMode = false;

    // --- BARRERA DE SEGURIDAD PARA LA PÁGINA ---
    onAuthStateChanged(auth, user => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        try {
            const permisosLocal = JSON.parse(localStorage.getItem('userPermisos') || '{}');
            const rolLocal = localStorage.getItem('userRol');
            
            // Si no es master ni tiene permiso de configuracion, lo echamos
            if (rolLocal !== 'master' && permisosLocal.configuracion !== true) {
                alert("Acceso denegado. No tenés permisos de Administrador para ver esta página.");
                window.location.href = 'pos.html'; 
            }
        } catch (e) {
            window.location.href = 'pos.html';
        }
    });

    // --- ESCUCHAR Y RENDERIZAR USUARIOS ---
    onSnapshot(query(usuariosCollection, orderBy('fechaCreacion', 'asc')), (snapshot) => {
        todosLosUsuarios = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderizarTabla();
    });

    function renderizarTabla() {
        if (!tablaUsuarios) return;
        tablaUsuarios.innerHTML = '';

        if (todosLosUsuarios.length === 0) {
            tablaUsuarios.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay usuarios registrados.</td></tr>';
            return;
        }

        todosLosUsuarios.forEach(u => {
            const estadoClase = u.estado === 'activo' ? 'status-activo' : 'status-inactivo';
            const estadoTexto = u.estado === 'activo' ? 'Activo' : 'Inactivo';
            const rolClase = u.rol === 'master' ? 'role-master' : '';
            const rolTexto = u.rol === 'master' ? '👑 Master Admin' : '👤 Empleado';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Nombre"><strong>${u.nombre || 'Sin nombre'}</strong></td>
                <td data-label="Email" style="color: #64748b;">${u.email}</td>
                <td data-label="Rol"><span class="user-role ${rolClase}">${rolTexto}</span></td>
                <td data-label="Estado"><span class="user-status ${estadoClase}">${estadoTexto}</span></td>
                <td data-label="Acciones" style="text-align: center;">
                    <button class="btn-editar-usuario btn-secondary" data-id="${u.id}" style="padding: 0.3rem 0.8rem; font-size: 0.85rem;">⚙️ Gestionar</button>
                </td>
            `;
            tablaUsuarios.appendChild(tr);
        });
    }

    // --- ABRIR MODAL PARA NUEVO USUARIO ---
    if (btnNuevoUsuario) {
        btnNuevoUsuario.addEventListener('click', () => {
            isCreateMode = true;
            modalTitulo.textContent = "Crear Nuevo Empleado";
            camposCreacion.style.display = 'block';
            
            editId.value = '';
            editNombre.value = '';
            editEmail.value = '';
            editPass.value = '';
            editEstado.value = 'activo';
            editEstado.disabled = false;
            
            // Destildar las 15 casillas para un usuario nuevo
            listaPermisos.forEach(p => {
                const checkbox = document.getElementById(`perm-${p}`);
                if (checkbox) checkbox.checked = false;
            });

            // Si es un empleado nuevo, el config no está bloqueado, pero arranca destildado
            const permConfig = document.getElementById('perm-configuracion');
            if (permConfig) permConfig.disabled = false;

            modalUsuario.classList.add('visible'); // Usamos tu clase 'visible' original
        });
    }

    // --- ABRIR MODAL PARA EDITAR ---
    if (tablaUsuarios) {
        tablaUsuarios.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-editar-usuario');
            if (!btn) return;

            const user = todosLosUsuarios.find(u => u.id === btn.dataset.id);
            if (!user) return;

            isCreateMode = false;
            modalTitulo.textContent = "Editar Permisos";
            camposCreacion.style.display = 'none';

            editId.value = user.id;
            editNombre.value = user.nombre || '';
            editEstado.value = user.estado || 'inactivo';

            const p = user.permisos || {};
            
            // Tildar las 15 casillas según la base de datos
            listaPermisos.forEach(permisoStr => {
                const checkbox = document.getElementById(`perm-${permisoStr}`);
                if (checkbox) checkbox.checked = p[permisoStr] === true;
            });

            const permConfig = document.getElementById('perm-configuracion');
            if (user.rol === 'master') {
                if (permConfig) permConfig.disabled = true;
                editEstado.disabled = true;
            } else {
                if (permConfig) permConfig.disabled = false;
                editEstado.disabled = false;
            }

            modalUsuario.classList.add('visible'); // Usamos tu clase 'visible' original
        });
    }

    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => modalUsuario.classList.remove('visible'));
    }

    // --- GUARDAR O CREAR ---
    if (btnGuardar) {
        btnGuardar.addEventListener('click', async () => {
            const nombreIngresado = editNombre.value.trim();
            const emailIngresado = editEmail.value.trim();
            const passIngresada = editPass.value;

            if (!nombreIngresado) return alert("Tenés que ponerle un nombre al usuario.");

            btnGuardar.disabled = true;
            btnGuardar.textContent = isCreateMode ? 'Creando cuenta...' : 'Guardando...';

            // Recolectar el valor de las 15 casillas
            const permisosAsignados = {};
            const permConfig = document.getElementById('perm-configuracion');
            
            listaPermisos.forEach(p => {
                const checkbox = document.getElementById(`perm-${p}`);
                // Casuística especial para el Master: no le podemos sacar la configuración
                if (p === 'configuracion' && permConfig && permConfig.disabled) {
                    permisosAsignados[p] = true; 
                } else {
                    permisosAsignados[p] = checkbox ? checkbox.checked : false;
                }
            });

            try {
                if (isCreateMode) {
                    if (!emailIngresado || passIngresada.length < 6) {
                        btnGuardar.disabled = false;
                        btnGuardar.textContent = 'Guardar Cambios';
                        return alert("El email es obligatorio y la clave debe tener al menos 6 letras.");
                    }

                    // 1. Crear el usuario en Firebase Auth sin expulsar al Admin
                    const userCred = await createUserWithEmailAndPassword(secondaryAuth, emailIngresado, passIngresada);
                    const newUid = userCred.user.uid;

                    // 2. Desloguear a la app secundaria
                    await signOut(secondaryAuth);

                    // 3. Crear su perfil en Firestore
                    await setDoc(doc(db, 'usuarios', newUid), {
                        email: emailIngresado,
                        nombre: nombreIngresado,
                        estado: editEstado.value,
                        rol: 'empleado',
                        fechaCreacion: new Date(),
                        permisos: permisosAsignados
                    });
                    
                    alert(`El usuario ${nombreIngresado} fue creado exitosamente.`);
                } else {
                    // MODO EDICIÓN
                    const id = editId.value;
                    const estadoFinal = editEstado.disabled ? 'activo' : editEstado.value;

                    await updateDoc(doc(db, 'usuarios', id), {
                        nombre: nombreIngresado,
                        estado: estadoFinal,
                        permisos: permisosAsignados
                    });

                    if (id === auth.currentUser.uid) {
                        localStorage.setItem('userName', nombreIngresado);
                    }
                }

                modalUsuario.classList.remove('visible');
            } catch (error) {
                console.error("Error:", error);
                if (error.code === 'auth/email-already-in-use') {
                    alert("Ese correo electrónico ya está registrado.");
                } else {
                    alert("Hubo un error al procesar el usuario.");
                }
            }

            btnGuardar.disabled = false;
            btnGuardar.textContent = 'Guardar Cambios';
        });
    }
}
