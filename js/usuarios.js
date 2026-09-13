import { 
    getFirestore, collection, onSnapshot, doc, updateDoc, query, orderBy 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

export function setupUsuarios(app) {
    const db = getFirestore(app);
    const auth = getAuth(app);
    const usuariosCollection = collection(db, 'usuarios');

    const tablaUsuarios = document.getElementById('tabla-usuarios');
    const modalUsuario = document.getElementById('modal-usuario');
    const btnCancelar = document.getElementById('btn-cancelar-usuario');
    const btnGuardar = document.getElementById('btn-guardar-usuario');

    // Campos del Modal
    const editId = document.getElementById('edit-user-id');
    const editNombre = document.getElementById('edit-user-nombre');
    const editEstado = document.getElementById('edit-user-estado');
    
    // Checkboxes de permisos
    const permMostrador = document.getElementById('perm-mostrador');
    const permStock = document.getElementById('perm-stock');
    const permRecetas = document.getElementById('perm-recetas');
    const permCajas = document.getElementById('perm-cajas');
    const permFinanzas = document.getElementById('perm-finanzas');
    const permConfig = document.getElementById('perm-configuracion');

    let todosLosUsuarios = [];

    // --- BARRERA DE SEGURIDAD PARA LA PÁGINA ---
    onAuthStateChanged(auth, user => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        // Verificamos en el LocalStorage si tiene el permiso "configuracion" (Admin)
        try {
            const permisosLocal = JSON.parse(localStorage.getItem('userPermisos') || '{}');
            if (permisosLocal.configuracion !== true) {
                alert("Acceso denegado. No tenés permisos de Administrador para ver esta página.");
                window.location.href = 'pos.html'; // Lo echamos al mostrador
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

    // --- ABRIR MODAL PARA EDITAR ---
    if (tablaUsuarios) {
        tablaUsuarios.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-editar-usuario');
            if (!btn) return;

            const user = todosLosUsuarios.find(u => u.id === btn.dataset.id);
            if (!user) return;

            editId.value = user.id;
            editNombre.value = user.nombre || '';
            editEstado.value = user.estado || 'inactivo';

            // Cargar checkboxes
            const p = user.permisos || {};
            permMostrador.checked = p.mostrador === true;
            permStock.checked = p.stock === true;
            permRecetas.checked = p.recetas === true;
            permCajas.checked = p.cajas === true;
            permFinanzas.checked = p.finanzas === true;
            permConfig.checked = p.configuracion === true;

            // Protección contra suicidio digital: 
            // Si te estás editando a vos mismo (el Master), no te dejamos quitarte el permiso de Admin
            if (user.rol === 'master') {
                permConfig.disabled = true;
                editEstado.disabled = true; // No te podés auto-desactivar
            } else {
                permConfig.disabled = false;
                editEstado.disabled = false;
            }

            modalUsuario.classList.add('visible');
        });
    }

    if (btnCancelar) {
        btnCancelar.addEventListener('click', () => modalUsuario.classList.remove('visible'));
    }

    // --- GUARDAR CAMBIOS ---
    if (btnGuardar) {
        btnGuardar.addEventListener('click', async () => {
            const id = editId.value;
            if (!id) return;

            btnGuardar.disabled = true;
            btnGuardar.textContent = 'Guardando...';

            try {
                const userRef = doc(db, 'usuarios', id);
                
                // Si estaba disabled (porque es el master), forzamos a que siga siendo true y activo
                const esConfigChecked = permConfig.disabled ? true : permConfig.checked;
                const estadoFinal = editEstado.disabled ? 'activo' : editEstado.value;

                await updateDoc(userRef, {
                    nombre: editNombre.value.trim(),
                    estado: estadoFinal,
                    permisos: {
                        mostrador: permMostrador.checked,
                        stock: permStock.checked,
                        recetas: permRecetas.checked,
                        cajas: permCajas.checked,
                        finanzas: permFinanzas.checked,
                        configuracion: esConfigChecked
                    }
                });

                modalUsuario.classList.remove('visible');
                
                // Si el admin se editó su propio nombre, actualizamos el localStorage
                if (id === auth.currentUser.uid) {
                    localStorage.setItem('userName', editNombre.value.trim());
                }

            } catch (error) {
                console.error("Error al actualizar usuario:", error);
                alert("Hubo un error al guardar los permisos.");
            }

            btnGuardar.disabled = false;
            btnGuardar.textContent = 'Guardar Cambios';
        });
    }
}
