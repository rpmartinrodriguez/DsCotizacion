import { getFirestore, collection, getDocs, doc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";

export async function setupUsuarios(app, firebaseConfig) {
    const db = getFirestore(app);
    
    // Lista exacta de los 15 permisos
    const listaPermisos = ['mostrador', 'indicadores', 'recetas', 'stock', 'presupuestos', 'precios', 'cajas', 'finanzas', 'historial', 'compras', 'compras_lista', 'clientes', 'agenda', 'modelos', 'configuracion'];

    const tabla = document.getElementById('tabla-usuarios');
    const modal = document.getElementById('modal-usuario');
    const btnNuevo = document.getElementById('btn-nuevo-usuario');
    const btnGuardar = document.getElementById('btn-guardar-usuario');
    const btnCancelar = document.getElementById('btn-cancelar-usuario');

    let modoEdicion = true;

    async function cargarUsuarios() {
        tabla.innerHTML = '<tr><td colspan="5" style="text-align: center;">Cargando...</td></tr>';
        try {
            const snap = await getDocs(collection(db, 'usuarios'));
            tabla.innerHTML = '';
            snap.forEach(docSnap => {
                const u = docSnap.data();
                const id = docSnap.id;
                tabla.innerHTML += `
                    <tr>
                        <td><strong>${u.nombre || 'Sin nombre'}</strong></td>
                        <td>${u.email}</td>
                        <td><span class="user-role ${u.rol === 'master' ? 'role-master' : ''}">${u.rol}</span></td>
                        <td><span class="user-status status-${u.estado}">${u.estado}</span></td>
                        <td style="text-align: center;">
                            <button class="btn-secondary btn-editar" data-id="${id}" data-user='${JSON.stringify(u)}'>✏️ Editar</button>
                        </td>
                    </tr>`;
            });

            document.querySelectorAll('.btn-editar').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.target.getAttribute('data-id');
                    const u = JSON.parse(e.target.getAttribute('data-user'));
                    abrirModalEdicion(id, u);
                });
            });
        } catch(e) { console.error(e); }
    }

    function abrirModalEdicion(id, u) {
        modoEdicion = true;
        document.getElementById('modal-titulo').textContent = 'Editar Empleado';
        document.getElementById('campos-creacion').style.display = 'none';
        
        document.getElementById('edit-user-id').value = id;
        document.getElementById('edit-user-nombre').value = u.nombre || '';
        document.getElementById('edit-user-estado').value = u.estado || 'activo';

        // Tildar las casillas de la base de datos
        listaPermisos.forEach(p => {
            const checkbox = document.getElementById(`perm-${p}`);
            if(checkbox) checkbox.checked = u.permisos?.[p] || false;
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

        // Desmarcar todo
        listaPermisos.forEach(p => document.getElementById(`perm-${p}`).checked = false);

        modal.classList.add('active');
    });

    btnCancelar.addEventListener('click', () => modal.classList.remove('active'));

    btnGuardar.addEventListener('click', async () => {
        const id = document.getElementById('edit-user-id').value;
        const nombre = document.getElementById('edit-user-nombre').value;
        const estado = document.getElementById('edit-user-estado').value;
        
        // Recolectar las 15 casillas
        const permisosGuardar = {};
        listaPermisos.forEach(p => {
            permisosGuardar[p] = document.getElementById(`perm-${p}`).checked;
        });

        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Guardando...';

        try {
            if (modoEdicion) {
                await updateDoc(doc(db, 'usuarios', id), { nombre, estado, permisos: permisosGuardar });
                alert("Permisos actualizados con éxito.");
            } else {
                const email = document.getElementById('edit-user-email').value;
                const pass = document.getElementById('edit-user-pass').value;
                if(!email || !pass) throw new Error("Falta email o contraseña");

                // App secundaria para no desloguear al Admin
                const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
                const secondaryAuth = getAuth(secondaryApp);
                const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
                
                await setDoc(doc(db, 'usuarios', userCred.user.uid), {
                    email: email, nombre: nombre, estado: estado, rol: 'empleado', permisos: permisosGuardar
                });
                
                secondaryAuth.signOut();
                alert("Empleado creado con éxito.");
            }
            modal.classList.remove('active');
            cargarUsuarios();
        } catch(e) {
            console.error(e);
            alert("Error al guardar: " + e.message);
        } finally {
            btnGuardar.disabled = false;
            btnGuardar.textContent = 'Guardar Cambios';
        }
    });

    cargarUsuarios();
}
