import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    updateDoc, getDoc, runTransaction, where, addDoc
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupStock(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const movimientosStockCollection = collection(db, 'movimientosStock');
    
    // Referencias DOM principales
    const tablaStockBody = document.querySelector("#tabla-stock tbody");
    const buscadorInput = document.getElementById('buscador-stock');

    // Referencias Modal Edición
    const editModal = document.getElementById('edit-producto-modal-overlay');
    const modalTitle = document.getElementById('producto-modal-title');
    const nombreInput = document.getElementById('producto-nombre-input');
    const unidadSelect = document.getElementById('producto-unidad-select');
    const precioLoteInput = document.getElementById('lote-precio-input');
    const cantidadLoteInput = document.getElementById('lote-cantidad-input');
    const btnGuardar = document.getElementById('producto-modal-btn-guardar');
    const btnCancelar = document.getElementById('producto-modal-btn-cancelar');
    
    // Referencias Modal Historial
    const historialModal = document.getElementById('historial-movimientos-modal-overlay');
    const historialModalTitle = document.getElementById('movimientos-modal-title');
    const historialListaContainer = document.getElementById('movimientos-lista-container');
    const btnCerrarHistorial = document.getElementById('movimientos-modal-btn-cerrar');

    let editandoId = null;
    let todoElStock = [];
    let unsubHistorial = null; // Para cancelar la escucha del historial

    const renderizarTabla = (datos) => {
        tablaStockBody.innerHTML = '';
        if (datos.length === 0) {
            tablaStockBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No se encontraron productos.</td></tr>';
            return;
        }
        datos.forEach(itemConId => {
            const item = itemConId.data;
            const id = itemConId.id;
            if (!item.lotes || !Array.isArray(item.lotes) || item.lotes.length === 0) return;
            
            const stockTotal = item.lotes.reduce((sum, lote) => sum + (lote.stockRestante || 0), 0);
            const lotesOrdenados = [...item.lotes].sort((a, b) => (b.fechaCompra.seconds || 0) - (a.fechaCompra.seconds || 0));
            const ultimoLote = lotesOrdenados[0];
            
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td data-label="Nombre">${item.nombre}</td>
                <td data-label="Stock Actual">${stockTotal.toLocaleString('es-AR')} ${item.unidad}</td>
                <td data-label="Precio Base">$${(ultimoLote.precioCompra || 0).toLocaleString('es-AR')} / ${(ultimoLote.cantidadComprada || 0)} ${item.unidad}</td>
                <td class="action-buttons stock-actions">
                    <button class="btn-stock subtract" data-id="${id}" title="Dar de baja stock">-</button>
                    <button class="btn-stock-link edit" data-id="${id}" title="Editar Producto">✏️</button>
                    <button class="btn-stock-link history" data-id="${id}" data-nombre="${item.nombre}" title="Ver Historial de Movimientos">📜</button>
                </td>
            `;
            tablaStockBody.appendChild(fila);
        });
    };

    const openHistorialModal = (productoId, productoNombre) => {
        historialModalTitle.textContent = `Historial de: ${productoNombre}`;
        historialListaContainer.innerHTML = '<p>Cargando...</p>';
        historialModal.classList.add('visible');

        const q = query(
            movimientosStockCollection, 
            where("materiaPrimaId", "==", productoId),
            orderBy("fecha", "desc")
        );

        // Escuchamos en tiempo real los movimientos de este producto
        unsubHistorial = onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                historialListaContainer.innerHTML = '<p>No hay movimientos registrados para este producto.</p>';
                return;
            }
            historialListaContainer.innerHTML = '';
            snapshot.forEach(doc => {
                const mov = doc.data();
                const fecha = mov.fecha.toDate().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' });
                const esEntrada = mov.cantidad > 0;

                const itemDiv = document.createElement('div');
                itemDiv.className = 'movimiento-item';
                itemDiv.innerHTML = `
                    <div class="movimiento-info">
                        <span class="movimiento-fecha">${fecha}</span>
                        <strong class="movimiento-descripcion">${mov.descripcion}</strong>
                    </div>
                    <div class="movimiento-cantidad ${esEntrada ? 'entrada' : 'salida'}">
                        ${esEntrada ? '+' : ''}${mov.cantidad.toLocaleString('es-AR')}
                    </div>
                `;
                historialListaContainer.appendChild(itemDiv);
            });
        });
    };

    const closeHistorialModal = () => {
        if (unsubHistorial) {
            unsubHistorial(); // Dejamos de escuchar para ahorrar recursos
            unsubHistorial = null;
        }
        historialModal.classList.remove('visible');
    };

    // --- El resto de la lógica para editar no cambia ---
    const openModalParaEditar = async (id) => { /* ... */ };
    const closeModalEditar = () => { /* ... */ };
    btnGuardar.addEventListener('click', async () => { /* ... */ });
    
    // --- Listeners Principales ---
    onSnapshot(query(materiasPrimasCollection, orderBy("nombre")), (snapshot) => {
        todoElStock = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        buscadorInput.dispatchEvent(new Event('input'));
    });
    buscadorInput.addEventListener('input', (e) => {
        const terminoBusqueda = e.target.value.toLowerCase();
        const datosFiltrados = todoElStock.filter(item => item.data.nombre && item.data.nombre.toLowerCase().includes(terminoBusqueda));
        renderizarTabla(datosFiltrados);
    });

    tablaStockBody.addEventListener('click', (e) => {
        const target = e.target.closest('.edit, .subtract, .history');
        if (!target) return;
        const id = target.dataset.id;
        
        if (target.classList.contains('edit')) { openModalParaEditar(id); }
        
        if (target.classList.contains('history')) {
            const nombre = target.dataset.nombre;
            openHistorialModal(id, nombre);
        }

        if (target.classList.contains('subtract')) {
            const amountStr = prompt("¿Qué cantidad de stock deseas dar de baja? (Ej: rotura, uso personal)");
            if (amountStr) {
                const cantidadADescontar = parseFloat(amountStr);
                if (isNaN(cantidadADescontar) || cantidadADescontar <= 0) {
                    alert("Por favor, ingresa un número válido y positivo.");
                    return;
                }
                const docRef = doc(db, 'materiasPrimas', id);
                runTransaction(db, async (transaction) => {
                    const ingredienteDoc = await transaction.get(docRef);
                    if (!ingredienteDoc.exists()) throw "Este producto ya no existe.";
                    let data = ingredienteDoc.data();
                    let lotesActualizados = data.lotes.sort((a, b) => a.fechaCompra.seconds - b.fechaCompra.seconds);
                    const stockTotal = lotesActualizados.reduce((sum, lote) => sum + lote.stockRestante, 0);
                    if (stockTotal < cantidadADescontar) throw `Stock insuficiente. Stock actual: ${stockTotal}.`;
                    let restanteADescontar = cantidadADescontar;
                    for (const lote of lotesActualizados) {
                        if (restanteADescontar <= 0) break;
                        const descontar = Math.min(lote.stockRestante, restanteADescontar);
                        lote.stockRestante -= descontar;
                        restanteADescontar -= descontar;
                    }
                    lotesActualizados = lotesActualizados.filter(lote => lote.stockRestante > 0);
                    transaction.update(docRef, { lotes: lotesActualizados });
                }).then(() => {
                    const producto = todoElStock.find(p => p.id === id).data;
                    addDoc(movimientosStockCollection, {
                        materiaPrimaId: id,
                        materiaPrimaNombre: producto.nombre,
                        tipo: 'Ajuste Manual',
                        cantidad: -cantidadADescontar,
                        fecha: new Date(),
                        descripcion: `Ajuste manual de stock`
                    });
                    alert("Stock actualizado y movimiento registrado.");
                }).catch((error) => {
                    console.error("Error al dar de baja stock: ", error);
                    alert(`No se pudo actualizar: ${error}`);
                });
            }
        }
    });

    btnCancelar.addEventListener('click', closeModalEditar);
    btnCerrarHistorial.addEventListener('click', closeHistorialModal);
}
