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

    let todosLosClientesAgrupados = {};
    let editandoId = null;

    // Función para crear un ID de cliente seguro y válido para Firestore
    const sanitizarId = (nombre) => {
        return nombre.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/\s+/g, '-');
    };

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
            const clienteIdSanitizado = cliente.id;
            
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
                     <button class="btn-secondary btn-ver-historial-cliente" data-id="${clienteIdSanitizado}">Ver Historial</button>
                     <button class="btn-primary btn-editar-cliente" data-id="${clienteIdSanitizado}">✏️ Editar</button>
                </div>
                <div class="cliente-historial-detalle" id="detalle-${clienteIdSanitizado}" style="display:none;">
                    <p>Cargando historial...</p>
                </div>`;
            container.appendChild(card);
        });
    };

    const renderizarDetalleCliente = (clienteId) => {
        const cliente = Object.values(todosLosClientesAgrupados).find(c => c.id === clienteId);
        const detalleDiv = document.getElementById(`detalle-${clienteId}`);
        if (!cliente || !detalleDiv) return;

        const detalleHtml = cliente.presupuestos
            .sort((a, b) => b.fecha.toDate() - a.fecha.toDate())
            .map(p => {
                const fecha = p.fecha.toDate().toLocaleDateString('es-AR');
                const precio = p.precioVenta || p.costoTotal || 0;
                const ventaBadge = p.esVenta ? `<span class="venta-confirmada-badge mini">VENTA</span>` : '';
                return `<li class="presupuesto-item"><span>${p.tituloTorta} - $${precio.toFixed(2)}</span> <span>(${fecha})</span> ${ventaBadge}</li>`;
            }).join('');

        detalleDiv.innerHTML = `<h4>Historial de Presupuestos</h4><ul>${detalleHtml}</ul>`;
    };

    const sincronizarYRenderizar = async (presupuestosDocs, clientesDocs) => {
        const presupuestos = presupuestosDocs.map(doc => doc.data());
        const clientesData = {};
        clientesDocs.forEach(doc => {
            clientesData[doc.id] = doc.data();
        });

        const clientesTemp = {};
        presupuestos.forEach(p => {
            const nombre = p.nombreCliente;
            if (!nombre) return;
            
            const clienteId = sanitizarId(nombre);
            if (!clientesTemp[nombre]) {
                clientesTemp[nombre] = { 
                    nombre: nombre, 
                    id: clienteId, 
                    presupuestos: [], 
                    totalVendido: 0, 
                    cantidadVentas: 0,
                    ...(clientesData[clienteId] || {})
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
                    await setDoc(doc(db, "clientes", clienteId), { nombre: nombreCliente });
                } catch(e) { console.error("Error creando ficha de cliente:", e)}
            }
        }
        todosLosClientesAgrupados = clientesTemp;
        buscadorInput.dispatchEvent(new Event('input'));
    };

    onSnapshot(query(presupuestosCollection), (presupuestosSnap) => {
        onSnapshot(query(clientesCollection), (clientesSnap) => {
            sincronizarYRenderizar(presupuestosSnap.docs, clientesSnap.docs);
        });
    });

    buscadorInput.addEventListener('input', (e) => {
        const termino = e.target.value.toLowerCase();
        const filtrados = Object.values(todosLosClientesAgrupados).filter(c => c.nombre.toLowerCase().includes(termino));
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
        const targetEditar = e.target.closest('.btn-editar-cliente');
        if (targetEditar) {
            const id = targetEditar.dataset.id;
            const cliente = Object.values(todosLosClientesAgrupados).find(c => c.id === id);
            if (cliente) openModal(cliente);
            return;
        }

        const targetHistorial = e.target.closest('.btn-ver-historial-cliente');
        if (targetHistorial) {
            const id = targetHistorial.dataset.id;
            const detalleDiv = document.getElementById(`detalle-${id}`);
            if (detalleDiv) {
                const isVisible = detalleDiv.style.display === 'block';
                if (!isVisible && detalleDiv.innerHTML.includes('Cargando')) {
                    renderizarDetalleCliente(id);
                }
                detalleDiv.style.display = isVisible ? 'none' : 'block';
                targetHistorial.textContent = isVisible ? 'Ver Historial' : 'Ocultar Historial';
            }
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
        } catch (error) {
            console.error("Error al guardar datos del cliente:", error);
            alert("Hubo un error al guardar los datos.");
        }
    });

    btnCancelar.addEventListener('click', closeModal);
}
