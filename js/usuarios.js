import { 
    getFirestore, collection, onSnapshot, doc, updateDoc, setDoc, query, orderBy 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { 
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { createAuthorization } from "./core/authorization.js";
import { escapeHtml, escapeAttribute } from "./core/html.js";

export function setupUsuarios(app, firebaseConfig) {
    const db = getFirestore(app);
    const auth = getAuth(app);
    const authorization = createAuthorization(app);
    const usuariosCollection = collection(db, 'usuarios');

    // App secundaria para crear usuarios sin cerrar la sesión del administrador.
    const secondaryApp = getApps().find(candidate => candidate.name === 'SecondaryApp')
        || initializeApp(firebaseConfig, 'SecondaryApp');
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
    let isCreateMode = false,master=false,unsubscribe=null,busy=false;
    const search=document.getElementById('usuarios-buscar'),summary=document.getElementById('usuarios-resumen');
    const api=async(action,uid,extra={})=>{if(!master||!auth.currentUser)throw Error('Sólo el administrador principal puede gestionar cuentas.');const response=await fetch('/.netlify/functions/users-admin',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await auth.currentUser.getIdToken()},body:JSON.stringify({action,uid,...extra})});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw Error(data?.message||'No se pudo completar la operación.');return data;};
    const protectedUser=u=>!u||u.rol==='master'||u.id===auth.currentUser?.uid;
    const run=async(fn)=>{if(busy)return;busy=true;try{await fn();}catch(e){alert(e.message||'No se pudo completar la operación.');}finally{busy=false;}};

    btnNuevoUsuario.hidden=true;
    onAuthStateChanged(auth,async user=>{
        unsubscribe?.();unsubscribe=null;master=false;btnNuevoUsuario.hidden=true;
        if(!user||user.isAnonymous){window.location.replace('login.html');return;}
        const profile=await authorization.getActiveProfile();
        if(!profile||auth.currentUser?.uid!==user.uid)return;
        master=profile.rol==='master';
        if(!master&&profile.permisos?.configuracion!==true){window.location.replace('pos.html');return;}
        btnNuevoUsuario.hidden=!master;
        unsubscribe=onSnapshot(usuariosCollection,snapshot=>{
            todosLosUsuarios=snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.rol==='master')-(a.rol==='master')||String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
            renderizarTabla();
        },()=>{tablaUsuarios.textContent='No se pudo cargar la lista de usuarios.';});
    });
    search?.addEventListener('input',renderizarTabla);
    function renderizarTabla() {
        if (!tablaUsuarios) return;
        tablaUsuarios.innerHTML = '';

        if (todosLosUsuarios.length === 0) {
            tablaUsuarios.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay usuarios registrados.</td></tr>';
            return;
        }

        const term=String(search?.value||'').trim().toLowerCase();
        if(summary)summary.textContent=todosLosUsuarios.length+' cuentas · '+todosLosUsuarios.filter(u=>u.estado==='activo').length+' activas';
        const visible=todosLosUsuarios.filter(u=>String((u.nombre||'')+' '+(u.email||'')).toLowerCase().includes(term));
        if(!visible.length){tablaUsuarios.innerHTML='<tr><td colspan="5">No se encontraron usuarios.</td></tr>';return;}
        visible.forEach(u => {
            const estadoClase = u.estado === 'activo' ? 'status-activo' : 'status-inactivo';
            const estadoTexto = u.eliminacionPendiente?'Eliminación pendiente':u.estado === 'activo' ? 'Activo' : 'Inactivo';
            const rolClase = u.rol === 'master' ? 'role-master' : '';
            const rolTexto = u.rol === 'master' ? '👑 Master Admin' : '👤 Empleado';

            const tr = document.createElement('tr');
            const safeNombre = escapeHtml(u.nombre || 'Sin nombre');
            const safeEmail = escapeHtml(u.email || '');
            const safeId = escapeAttribute(u.id);
            tr.innerHTML = `
                <td data-label="Nombre"><strong>${safeNombre}</strong></td>
                <td data-label="Email" style="color: #64748b;">${safeEmail}</td>
                <td data-label="Rol"><span class="user-role ${rolClase}">${rolTexto}</span></td>
                <td data-label="Estado"><span class="user-status ${estadoClase}">${estadoTexto}</span></td>
                <td data-label="Acciones" style="text-align: center;">
                    ${protectedUser(u)?'<span class="ds-user-protected">Cuenta protegida</span>':!master?'<span>Solo lectura</span>':`<div class="ds-user-actions">${u.eliminacionPendiente?'':`<button type="button" class="btn-editar-usuario btn-secondary" data-id="${safeId}">Editar</button><button type="button" class="btn-reset-usuario btn-secondary" data-id="${safeId}">Regenerar clave</button>`}<button type="button" class="btn-borrar-usuario btn-secondary" data-id="${safeId}">Eliminar</button></div>`}
                </td>
            `;
            tablaUsuarios.appendChild(tr);
        });
    }

    const pwDialog=document.getElementById('ds-password-dialog'),pwField=document.getElementById('ds-generated-password');
    document.getElementById('ds-copy-password').onclick=async()=>{try{await navigator.clipboard.writeText(pwField.value);document.getElementById('ds-password-feedback').textContent='Copiada';}catch{pwField.select();}};
    document.getElementById('ds-close-password').onclick=()=>pwDialog.close();
    pwDialog.addEventListener('close',()=>{pwField.value='';document.getElementById('ds-password-feedback').textContent='';});
    // --- ABRIR MODAL PARA NUEVO USUARIO ---
    if (btnNuevoUsuario) {
        btnNuevoUsuario.addEventListener('click', () => {
            if(!master||busy)return;
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
            const action=e.target.closest('.btn-reset-usuario,.btn-borrar-usuario');
            if(action){const u=todosLosUsuarios.find(x=>x.id===action.dataset.id);if(!master||protectedUser(u))return;void run(async()=>{if(action.classList.contains('btn-reset-usuario')){if(!confirm('¿Regenerar la contraseña de '+u.nombre+'? La anterior dejará de funcionar.'))return;const result=await api('reset',u.id);const d=document.getElementById('ds-password-dialog'),field=document.getElementById('ds-generated-password');field.value=result.password;d.showModal();}else{if(!confirm('¿Eliminar definitivamente el acceso de '+u.nombre+'? Sus ventas e historial se conservan.'))return;await api('delete',u.id,{confirm:u.id});alert('Cuenta eliminada.');}});return;}
            const btn = e.target.closest('.btn-editar-usuario');
            if (!btn) return;

            const user = todosLosUsuarios.find(u => u.id === btn.dataset.id);
            if (!master||protectedUser(user)||user.eliminacionPendiente||busy) return;

            isCreateMode = false;
            modalTitulo.textContent = "Editar usuario";
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
            if(!master||busy)return;
            const profile=await authorization.getActiveProfile();
            const autorizado=profile?.rol==='master';
            if (!autorizado) {
                alert("Tu sesión ya no tiene permisos de administrador.");
                window.location.replace('pos.html');
                return;
            }

            const nombreIngresado = editNombre.value.trim();
            const emailIngresado = editEmail.value.trim();
            const passIngresada = editPass.value;

            if (!nombreIngresado) return alert("Tenés que ponerle un nombre al usuario.");

            busy=true;btnGuardar.disabled = true;
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
                        busy=false;btnGuardar.disabled = false;
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

                    const target=todosLosUsuarios.find(u=>u.id===id);
                    if(protectedUser(target))throw Error('La cuenta administradora está protegida.');
                    await api('edit',id,{nombre:nombreIngresado,estado:estadoFinal,permisos:permisosAsignados});
                }

                modalUsuario.classList.remove('visible');
            } catch (error) {
                console.error("Error:", error);
                if (error.code === 'auth/email-already-in-use') {
                    alert("Ese correo electrónico ya está registrado.");
                } else {
                    alert(error.message || "Hubo un error al procesar el usuario.");
                }
            }

            busy=false;btnGuardar.disabled = false;
            btnGuardar.textContent = 'Guardar Cambios';
        });
    }
}
