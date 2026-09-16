import { getFirestore, collection, getDocs, doc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";

export async function setupUsuarios(app, firebaseConfig) {
    const db = getFirestore(app);
    
    // Lista exacta de los 15 permisos, coincidiendo con los IDs del HTML
    const listaPermisos = [
        'mostrador', 'indicadores', 'recetas', 'stock', 'presupuestos', 
        'precios', 'cajas', 'finanzas', 'historial', 'compras', 
        'compras_lista', 'clientes', 'agenda', 'modelos', 'configuracion'
    ];

    const tabla = document.getElementById('tabla-usuarios');
    const modal = document.getElementById('modal-usuario');
    const btnNuevo = document.getElementById('btn-nuevo-usuario');
    const btnGuardar = document.getElementById('btn-guardar-usuario');
    const btnCancelar = document.getElementById('btn-cancelar-usuario');

    let modoEdicion = true;
    let memoriaUsuarios = {}; // <-- NUEVO: Guardamos los usuarios acá para no romper el HTML

    async function cargarUsuarios() {
        tabla.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">Cargando usuarios...</td></tr>';
        try {
            const snap = await getDocs(collection(db, 'usuarios'));
            tabla.innerHTML = '';
            memoriaUsuarios = {}; // Limpiamos la memoria
            
            if (snap.empty) {
                tabla.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No hay usuarios registrados.</td></tr>';
                return;
            }

            snap.forEach(docSnap => {
                const u = docSnap.data();
                const id = docSnap.id;
                
                // Guardamos el usuario en nuestra memoria segura usando su ID
                memoriaUsuarios[id] = u; 
                
                const rolClass = u.rol === 'master' ? 'role-master' : '';
                const estadoClass = u.estado === 'activo' ? 'status-activo' : 'status-inactivo';
                const estadoTexto = u.estado === 'activo' ? 'Activo' : 'Inactivo';

                tabla.innerHTML += `
                    <tr>
                        <td><strong>${u.nombre || 'Sin nombre'}</strong></td>
                        <td>${u.email}</td>
                        <td><span class="user-role ${rolClass}">${u.rol.toUpperCase()}</span></td>
                        <td><span class="user-status ${estadoClass}">${estadoTexto}</span></td>
                        <td style="text-align: center;">
                            <button class="btn-secondary btn-editar" data-id="${id}">✏️ Editar</button>
                        </td>
                    </tr>`;
            });

            // Asignar eventos a los botones de forma segura
            document.querySelectorAll('.btn-editar').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id'); // Obtenemos el ID directamente del botón
                    const usuarioSeleccionado = memoriaUsuarios[id]; // Buscamos sus datos en la memoria
                    abrirModalEdicion(id, usuarioSeleccionado);
                });
            });
        } catch(error) { 
            console.error("Error al cargar usuarios:", error);
            tabla.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: red;">Error al cargar la lista de usuarios.</td></tr>';
        }
    }

    function abrirModalEdicion(id, u) {
        modoEdicion = true;
        document.getElementById('modal-titulo').textContent = 'Editar Empleado';
        document.getElementById('campos-creacion').style.display = 'none';
        
        document.getElementById('edit-user-id').value = id;
        document.getElementById('edit-user-nombre').value = u.nombre || '';
        document.getElementById('edit-user-estado').value = u.estado || 'activo';

        // Tildar o destildar las casillas según los permisos guardados
        listaPermisos.forEach(p => {
            const checkbox = document.getElementById(`perm-${p}`);
            if (checkbox) {
                checkbox.checked = (u.permisos && u.permisos[p] === true) ? true : false;
            }
        });

        modal.classList.add('active');
    }

    btnNuevo.addEventListener('click', () => {
        modoEdicion = false;
        document.getElementById('modal-titulo').textContent = 'Crear Nuevo Empleado';
        document.getElementById('campos-creacion').style.display = 'flex';
        
        document.getElementById('edit-user-id').value = '';
        document.getElementById('edit-user-email').value = '';
        document.getElementById('edit-user-pass').value = '';
        document.getElementById('edit-user-nombre').value = '';
        document.getElementById('edit-user-estado').value = 'activo';

        // Desmarcar todos los permisos por defecto para un usuario nuevo
        listaPermisos.forEach(p => {
            const checkbox = document.getElementById(`perm-${p}`);
            if (checkbox) checkbox.checked = false;
        });

        modal.classList.add('active');
    });

    btnCancelar.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    btnGuardar.addEventListener('click', async () => {
        const id = document.getElementById('edit-user-id').value;
        const nombre = document.getElementById('edit-user-nombre').value.trim();
        const estado = document.getElementById('edit-user-estado').value;
        
        if (!nombre) {
            alert("Por favor, ingresá el nombre del empleado.");
            return;
        }

        // Recolectar el estado exacto de las 15 casillas
        const permisosGuardar = {};
        listaPermisos.forEach(p => {
            const checkbox = document.getElementById(`perm-${p}`);
            permisosGuardar[p] = checkbox ? checkbox.checked : false;
        });

        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Guardando...';

        try {
            if (modoEdicion) {
                // Actualizar usuario existente en Firestore
                await updateDoc(doc(db, 'usuarios', id), { 
                    nombre: nombre, 
                    estado: estado, 
                    permisos: permisosGuardar 
                });
                alert("Permisos actualizados con éxito.");
            } else {
                // Crear usuario nuevo
                const email = document.getElementById('edit-user-email').value.trim();
                const pass = document.getElementById('edit-user-pass').value;
                
                if (!email || !pass) {
                    throw new Error("Falta email o contraseña para crear el usuario.");
                }
                if (pass.length < 6) {
                    throw new Error("La contraseña debe tener al menos 6 caracteres.");
                }

                // App secundaria para registrar al usuario sin desloguearte a vos (el Admin)
                const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
                const secondaryAuth = getAuth(secondaryApp);
                
                const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
                
                await setDoc(doc(db, 'usuarios', userCred.user.uid), {
                    email: email, 
                    nombre: nombre, 
                    estado: estado, 
                    rol: 'empleado', 
                    fechaCreacion: new Date(),
                    permisos: permisosGuardar
                });
                
                await signOut(secondaryAuth);
                alert("Empleado creado con éxito.");
            }
            
            modal.classList.remove('active');
            cargarUsuarios(); // Recargar la tabla para mostrar los cambios
            
        } catch(error) {
            console.error("Error al guardar usuario:", error);
            if (error.code === 'auth/email-already-in-use') {
                alert("El correo electrónico ya está registrado en el sistema.");
            } else {
                alert("Error al guardar: " + error.message);
            }
        } finally {
            btnGuardar.disabled = false;
            btnGuardar.textContent = 'Guardar Cambios';
        }
    });

    // Cargar la lista automáticamente al abrir la página
    cargarUsuarios();
}
