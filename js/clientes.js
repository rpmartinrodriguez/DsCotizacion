// js/clientes.js
import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    addDoc, updateDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupClientes(app) {
    const db = getFirestore(app);
    const clientesCollection = collection(db, 'clientes');

    // --- Referencias al DOM ---
    const btnCrearCliente = document.getElementById('btn-crear-cliente');
    const clientesContainer = document.getElementById('lista-clientes-container');
    const buscadorInput = document.getElementById('buscador-clientes');
    
    const modal = document.getElementById('cliente-modal-overlay');
    const modalTitle = document.getElementById('cliente-modal-title');
    const nombreInput = document.getElementById('cliente-nombre-input');
    const telefonoInput = document.getElementById('cliente-telefono-input');
    const emailInput = document.getElementById('cliente-email-input');
    const notasInput = document.getElementById('cliente-notas-input');
    const btnGuardarCliente = document.getElementById('cliente-modal-btn-guardar');
    const btnCancelarCliente = document.getElementById('cliente-modal-btn-cancelar');
    
    let todosLosClientes = [];
    let editandoId = null;

    // --- Lógica de la Modal ---
    const openModal = (cliente = null) => {
        if (cliente) {
            editandoId = cliente.id;
            modalTitle.textContent = 'Editar Cliente';
            nombreInput.value = cliente.data.nombre;
            telefonoInput.value = cliente.data.telefono || '';
            emailInput.value = cliente.data.email || '';
            notasInput.value = cliente.data.notas || '';
        } else {
            editandoId = null;
            modalTitle.textContent = 'Añadir Nuevo Cliente';
            form.reset(); // Usamos form.reset() en un formulario
        }
        modal.classList.add('visible');
    };
    
    const form = modal.querySelector('.form-modern');
    const closeModal = () => modal.classList.remove('visible');

    btnCrearCliente.addEventListener('click', () => openModal());
    btnCancelarCliente.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });

    btnGuardarCliente.addEventListener('click', async () => {
        const nombre = nombreInput.value.trim();
        if (!nombre) {
            alert('El nombre del cliente es obligatorio.');
            return;
        }

        const clienteData = {
            nombre: nombre,
            telefono: telefonoInput.value.trim(),
            email: emailInput.value.trim(),
            notas: notasInput.value.trim(),
        };

        try {
            if (editandoId) {
                await updateDoc(doc(db, 'clientes', editandoId), clienteData);
                alert('¡Cliente actualizado!');
            } else {
                await addDoc(clientesCollection, clienteData);
                alert('¡Cliente añadido!');
            }
            closeModal();
        } catch (error) {
            console.error("Error al guardar cliente:", error);
        }
    });

    // --- Renderizar Tarjetas de Clientes ---
    const renderizarClientes = (datos) => {
        clientesContainer.innerHTML = '';
        if (datos.length === 0) {
            clientesContainer.innerHTML = '<p>No se encontraron clientes.</p>';
            return;
        }
        datos.forEach(clienteConId => {
            const cliente = clienteConId.data;
            const id = clienteConId.id;
            const card = document.createElement('div');
            card.className = 'cliente-card';
            card.innerHTML = `
                <div class="cliente-card__info">
                    <h3>${cliente.nombre}</h3>
                    <p>${cliente.telefono ? `📞 ${cliente.telefono}` : ''}</p>
                    <p>${cliente.email ? `✉️ ${cliente.email}` : ''}</p>
                </div>
                <div class="cliente-card__actions">
                    <button class="btn-editar-cliente" data-id="${id}">Editar</button>
                    <button class="btn-borrar-cliente" data-id="${id}">🗑️</button>
                </div>
            `;
            clientesContainer.appendChild(card);
        });
    };

    // --- Listeners Principales ---
    onSnapshot(query(clientesCollection, orderBy('nombre')), (snapshot) => {
        todosLosClientes = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        buscadorInput.dispatchEvent(new Event('input')); // Actualiza el filtro
    });

    buscadorInput.addEventListener('input', (e) => {
        const termino = e.target.value.toLowerCase();
        const filtrados = todosLosClientes.filter(c => c.data.nombre.toLowerCase().includes(termino));
        renderizarClientes(filtrados);
    });

    clientesContainer.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('btn-editar-cliente')) {
            const id = target.dataset.id;
            const cliente = todosLosClientes.find(c => c.id === id);
            openModal(cliente);
        }
        if (target.classList.contains('btn-borrar-cliente')) {
            const id = target.dataset.id;
            if (confirm('¿Estás seguro de que quieres eliminar este cliente? Se borrará de forma permanente.')) {
                deleteDoc(doc(db, 'clientes', id));
            }
        }
    });
}
