import { 
    getFirestore, collection, onSnapshot, query, where, doc, 
    setDoc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupClientes(app) {
    const db = getFirestore(app);
    const presupuestosCollection = collection(db, 'presupuestosGuardados');
    const clientesCollection = collection(db, 'clientes');

    const container = document.getElementById('resumen-clientes-container');
    const buscadorInput = document.getElementById('buscador-clientes');

    // Referencias de la Modal de Edición
    const modal = document.getElementById('cliente-modal-overlay');
    const modalTitle = document.getElementById('cliente-modal-title');
    const nombreDisplay = document.getElementById('cliente-nombre-display');
    const telefonoInput = document.getElementById('cliente-telefono-input');
    const emailInput = document.getElementById('cliente-email-input');
    const notasInput = document.getElementById('cliente-notas-input');
    const btnGuardar = document.getElementById('cliente-modal-btn-guardar');
    const btnCancelar = document.getElementById('cliente-modal-btn-cancelar');

    let clientesAgrupados = {};
    let editandoId = null;

    const renderizarResumen = (clientes) => {
        container.innerHTML = '';
        if (Object.keys(clientes).length === 0) {
            container.innerHTML = '<p>No se encontraron clientes en el historial.</p>';
            return;
        }
        const clientesOrdenados = Object.values(clientes).sort((a,b) => a.nombre.localeCompare(b.nombre));

        clientesOrdenados.forEach(cliente => {
            const card = document.createElement('div');
            card.className = 'cliente-resumen-card';
            const telefonoHtml = cliente.telefono ? `<p class="cliente-card__contact">📞 ${cliente.telefono}</p>` : '';
            const emailHtml = cliente.email ? `<p class="cliente-card__contact">✉️ ${cliente.email}</p>` : '';
            card.innerHTML = `
                <div class="cliente-card__info">
                    <h3>${cliente.nombre}</h3>
                    ${telefonoHtml}
                    ${emailHtml}
                </div>
                <div class="cliente-resumen-stats">
                    <div class="stat"><span>Total Comprado</span><p>$${(cliente.totalVendido || 0).toLocaleString('es-AR')}</p></div>
                    <div class="stat"><span>Ventas</span><p>${cliente.cantidadVentas || 0}</p></div>
                    <div class="stat"><span>Cotizaciones</span><p>${cliente.presupuestos.length || 0}</p></div>
                </div>
                <div class="historial-card__actions" style="justify-content: flex-end; border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1rem;">
                     <button class="btn-secondary btn-editar-cliente" data-id="${cliente.id}">Editar Datos</button>
                </div>`;
            container.appendChild(card);
        });
    };
    
    const sincronizarYRenderizar = async () => {
        const presupuestosSnap = await getDocs(query(presupuestosCollection));
        const clientesSnap = await getDocs(query(clientesCollection));
        
        const presupuestos = presupuestosSnap.docs.map(doc => doc.data());
        const clientesData = {};
        clientesSnap.forEach(doc => {
            clientesData[doc.id] = doc.data();
        });

        const clientesTemp = {};

        presupuestos.forEach(p => {
            const nombre = p.nombreCliente;
            if (!nombre) return;
            
            const clienteId = nombre.replace(/\s+/g, '-').toLowerCase();
            if (!clientesTemp[nombre]) {
                clientesTemp[nombre] = { 
                    nombre: nombre, 
                    id: clienteId, 
                    presupuestos: [], 
                    totalVendido: 0, 
                    cantidadVentas: 0,
                    ...clientesData[clienteId] // Añadimos los datos de contacto si existen
                };
            }
            clientesTemp[nombre].presupuestos.push(p);
            if (p.esVenta) {
                clientesTemp[nombre].totalVendido += p.precioVenta || 0;
                clientesTemp[nombre].cantidadVentas += 1;
            }
        });

        for (const nombreCliente in clientesTemp) {
            const clienteId = clientesTemp[nombreCliente].id;
            if (!clientesData[clienteId]) {
                try {
                    await setDoc(doc(db, 'clientes', clienteId), { nombre: nombreCliente });
                } catch(e) { console.error("Error creando ficha de cliente:", e)}
            }
        }
        clientesAgrupados = clientesTemp;
        buscadorInput.dispatchEvent(new Event('input'));
    };

    buscadorInput.addEventListener('input', (e) => {
        const termino = e.target.value.toLowerCase();
        const filtrados = Object.fromEntries(
            Object.entries(clientesAgrupados).filter(([_, cliente]) => 
                cliente.nombre.toLowerCase().includes(termino)
            )
        );
        renderizarResumen(filtrados);
    });

    const openModal = (cliente) => {
        editandoId = cliente.id;
        modalTitle.textContent = `Editar datos de ${cliente.nombre}`;
        nombreDisplay.value = cliente.nombre;
        telefonoInput.value = cliente.telefono || '';
        emailInput.value = cliente.email || '';
        notasInput.value = cliente.notas || '';
        modal.classList.add('visible');
    };
    
    const closeModal = () => modal.classList.remove('visible');

    container.addEventListener('click', e => {
        const target = e.target.closest('.btn-editar-cliente');
        if (target) {
            const id = target.dataset.id;
            const cliente = Object.values(clientesAgrupados).find(c => c.id === id);
            if (cliente) openModal(cliente);
        }
    });

    btnGuardar.addEventListener('click', async () => {
        if (!editandoId) return;
        const clienteRef = doc(db, 'clientes', editandoId);
        const nuevosDatos = {
            telefono: telefonoInput.value.trim(),
            email: emailInput.value.trim(),
            notas: notasInput.value.trim()
        };
        try {
            await updateDoc(clienteRef, nuevosDatos);
            alert('¡Datos del cliente actualizados!');
            closeModal();
            sincronizarYRenderizar(); // Forzamos la actualización de la vista
        } catch (error) {
            console.error("Error al guardar datos del cliente:", error);
        }
    });

    btnCancelar.addEventListener('click', closeModal);

    // Carga inicial
    sincronizarYRenderizar();
}
