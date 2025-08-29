import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    updateDoc, getDoc, runTransaction, where, addDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupStock(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const movimientosStockCollection = collection(db, 'movimientosStock');
    
    // Referencias DOM principales
    const tablaStockBody = document.querySelector("#tabla-stock tbody");
    const buscadorInput = document.getElementById('buscador-stock');

    // Referencias Modal Edición Completa
    const modalCompleto = document.getElementById('edit-producto-completo-modal-overlay');
    const modalCompletoTitle = document.getElementById('producto-completo-modal-title');
    const nombreCompletoInput = document.getElementById('producto-nombre-completo-input');
    const unidadCompletoSelect = document.getElementById('producto-unidad-completo-select');
    const lotesEditorContainer = document.getElementById('lotes-editor-container');
    const btnGuardarCompleto = document.getElementById('producto-completo-modal-btn-guardar');
    const btnCancelarCompleto = document.getElementById('producto-completo-modal-btn-cancelar');
    
    // Referencias para el Modal de Ajuste Rápido
    const modalAjuste = document.getElementById('ajustar-stock-modal-overlay');
    const ajusteNombreProducto = document.getElementById('ajustar-stock-nombre-producto');
    const stockCalculadoInput = document.getElementById('stock-actual-calculado');
    const nuevoStockInput = document.getElementById('nuevo-stock-real');
    const btnGuardarAjuste = document.getElementById('ajustar-stock-btn-guardar');
    const btnCancelarAjuste = document.getElementById('ajustar-stock-btn-cancelar');

    // Referencias Modal Historial
    const historialModal = document.getElementById('historial-movimientos-modal-overlay');
    const historialModalTitle = document.getElementById('movimientos-modal-title');
    const historialListaContainer = document.getElementById('movimientos-lista-container');
    const btnCerrarHistorial = document.getElementById('movimientos-modal-btn-cerrar');

    let editandoId = null;
    let todoElStock = [];
    let unsubHistorial = null;

    const renderizarTabla = (datos) => {
        tablaStockBody.innerHTML = '';
        if (datos.length === 0) {
            tablaStockBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No se encontraron productos.</td></tr>';
            return;
        }
        datos.forEach(itemConId => {
            try {
                const item = itemConId.data;
                const id = itemConId.id;

                if (!item.lotes || !Array.isArray(item.lotes) || item.lotes.length === 0) return;
                
                const stockTotal = item.lotes.reduce((sum, lote) => sum + (lote.stockRestante || 0), 0);
                
                const lotesOrdenados = [...item.lotes].sort((a, b) => b.fechaCompra.seconds - a.fechaCompra.seconds);
                const ultimoLote = lotesOrdenados[0];

                let fechaUltimaCarga = 'N/A';
                if (ultimoLote && ultimoLote.fechaCompra && typeof ultimoLote.fechaCompra.toDate === 'function') {
                    fechaUltimaCarga = ultimoLote.fechaCompra.toDate().toLocaleDateString('es-AR');
                }
                
                const fila = document.createElement('tr');
                fila.innerHTML = `
                    <td data-label="Nombre">${item.nombre}</td>
                    <td data-label="Stock Actual">${stockTotal.toLocaleString('es-AR')} ${item.unidad}</td>
                    <td data-label="Precio Base">$${(ultimoLote.precioCompra || 0).toLocaleString('es-AR')} / ${(ultimoLote.cantidadComprada || 0)} ${item.unidad}</td>
                    <td data-label="Última Carga">${fechaUltimaCarga}</td>
                    <td class="action-buttons stock-actions">
                        <button class="btn-stock-link ajustar" data-id="${id}" title="Ajustar Stock Total">⚖️</button>
                        <button class="btn-stock-link edit" data-id="${id}" title="Editar Producto y Lotes">✏️</button>
                        <button class="btn-stock-link history" data-id="${id}" data-nombre="${item.nombre}" title="Ver Historial de Movimientos">📜</button>
                    </td>
                `;
                tablaStockBody.appendChild(fila);
            } catch (error) {
                console.error(`Error al renderizar el producto: ${itemConId.data.nombre || 'Desconocido'}.`, error);
            }
        });
    };
    
    const openModalParaEdicionCompleta = async (id) => {
        editandoId = id;
        try {
            const docRef = doc(db, 'materiasPrimas', id);
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) {
                alert("Este producto ya no existe.");
                return;
            }
            const producto = docSnap.data();
            
            modalCompletoTitle.textContent = `Editando: ${producto.nombre}`;
            nombreCompletoInput.value = producto.nombre;
            unidadCompletoSelect.value = producto.unidad;

            lotesEditorContainer.innerHTML = '';
            if (producto.lotes && producto.lotes.length > 0) {
                const lotesOrdenados = [...producto.lotes].sort((a,b) => b.fechaCompra.seconds - a.fechaCompra.seconds);
                lotesOrdenados.forEach((lote, index) => {
                    const fechaCompra = lote.fechaCompra.toDate().toISOString().split('T')[0];
                    const loteDiv = document.createElement('div');
                    loteDiv.className = 'lote-editor-item';
                    const originalIndex = producto.lotes.indexOf(lote);
                    loteDiv.innerHTML = `
                        <p class="fecha-lote">Lote #${index + 1} (Compra del ${lote.fechaCompra.toDate().toLocaleDateString('es-AR')})</p>
                        <div class="form-group"><label>Fecha Compra</label><input type="date" value="${fechaCompra}" data-lote-index="${originalIndex}" data-field="fechaCompra" class="form-control"></div>
                        <div class="form-group"><label>Precio Compra ($)</label><input type="number" value="${lote.precioCompra}" data-lote-index="${originalIndex}" data-field="precioCompra" step="any" class="form-control"></div>
                        <div class="form-group"><label>Cant. Comprada</label><input type="number" value="${lote.cantidadComprada}" data-lote-index="${originalIndex}" data-field="cantidadComprada" step="any" class="form-control"></div>
                        <div class="form-group"><label>Stock Restante</label><input type="number" value="${lote.stockRestante}" data-lote-index="${originalIndex}" data-field="stockRestante" step="any" class="form-control"></div>
                    `;
                    lotesEditorContainer.appendChild(loteDiv);
                });
            } else {
                lotesEditorContainer.innerHTML = '<p>Este producto no tiene lotes de compra registrados.</p>';
            }
            modalCompleto.classList.add('visible');
        } catch (error) {
            console.error("Error al abrir modal de edición completa:", error);
            alert("No se pudo cargar la información para editar.");
        }
    };

    const closeModalCompleta = () => {
        modalCompleto.classList.remove('visible');
        editandoId = null;
    };
    
    const guardarCambiosCompletos = async () => {
        if (!editandoId) return;
        const docRef = doc(db, 'materiasPrimas', editandoId);
        btnGuardarCompleto.disabled = true;
        btnGuardarCompleto.textContent = 'Guardando...';
        try {
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) throw new Error("El producto fue eliminado mientras se editaba.");
            const productoOriginal = docSnap.data();
            const nuevosLotes = new Array(productoOriginal.lotes.length);
            const loteItems = lotesEditorContainer.querySelectorAll('.lote-editor-item');
            loteItems.forEach(loteItem => {
                const index = parseInt(loteItem.querySelector('input').dataset.loteIndex, 10);
                const fechaInput = loteItem.querySelector(`[data-lote-index="${index}"][data-field="fechaCompra"]`).value;
                const [year, month, day] = fechaInput.split('-');
                const fecha = new Date(year, month - 1, day);
                const precio = parseFloat(loteItem.querySelector(`[data-lote-index="${index}"][data-field="precioCompra"]`).value);
                const cantidad = parseFloat(loteItem.querySelector(`[data-lote-index="${index}"][data-field="cantidadComprada"]`).value);
                const restante = parseFloat(loteItem.querySelector(`[data-lote-index="${index}"][data-field="stockRestante"]`).value);
                if (isNaN(precio) || isNaN(cantidad) || isNaN(restante)) throw new Error(`Hay valores numéricos inválidos en uno de los lotes.`);
                if (!fechaInput) throw new Error(`La fecha es inválida en uno de los lotes.`);
                nuevosLotes[index] = {
                    fechaCompra: Timestamp.fromDate(fecha),
                    precioCompra: precio,
                    cantidadComprada: cantidad,
                    stockRestante: restante,
                    costoUnitario: cantidad > 0 ? precio / cantidad : 0
                };
            });
            const datosParaActualizar = {
                nombre: nombreCompletoInput.value.trim(),
                unidad: unidadCompletoSelect.value,
                lotes: nuevosLotes
            };
            await updateDoc(docRef, datosParaActualizar);
            alert('¡Producto actualizado con éxito!');
            closeModalCompleta();
        } catch (error) {
            console.error("Error al guardar cambios completos:", error);
            alert(`No se pudieron guardar los cambios: ${error.message}`);
        } finally {
            btnGuardarCompleto.disabled = false;
            btnGuardarCompleto.textContent = 'Guardar Cambios';
        }
    };

    btnGuardarCompleto.addEventListener('click', guardarCambiosCompletos);
    btnCancelarCompleto.addEventListener('click', closeModalCompleta);

    const openModalParaAjustar = (id) => {
        editandoId = id;
        const producto = todoElStock.find(p => p.id === id);
        if (!producto) return;
        const stockTotal = producto.data.lotes.reduce((sum, lote) => sum + (lote.stockRestante || 0), 0);
        ajusteNombreProducto.textContent = producto.data.nombre;
        stockCalculadoInput.value = `${stockTotal.toLocaleString('es-AR')} ${producto.data.unidad}`;
        nuevoStockInput.value = '';
        modalAjuste.classList.add('visible');
    };

    const closeModalAjuste = () => {
        modalAjuste.classList.remove('visible');
        editandoId = null;
    };

    const guardarAjusteStock = async () => {
        if (!editandoId) return;
        const productoData = todoElStock.find(p => p.id === editandoId).data;
        const stockActual = productoData.lotes.reduce((sum, lote) => sum + (lote.stockRestante || 0), 0);
        const nuevoStock = parseFloat(nuevoStockInput.value);
        if (isNaN(nuevoStock) || nuevoStock < 0) {
            alert("Por favor, ingresa un número válido para el nuevo stock.");
            return;
        }
        const diferencia = nuevoStock - stockActual;
        if (diferencia === 0) {
            closeModalAjuste();
            return;
        }
        btnGuardarAjuste.disabled = true;
        btnGuardarAjuste.textContent = 'Ajustando...';
        const docRef = doc(db, 'materiasPrimas', editandoId);
        try {
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(docRef);
                if (!docSnap.exists()) throw "El producto ya no existe.";
                let data = docSnap.data();
                let lotesActualizados = [...data.lotes];
                let cantidadAjustada = Math.abs(diferencia);
                if (diferencia < 0) {
                    lotesActualizados.sort((a, b) => a.fechaCompra.seconds - b.fechaCompra.seconds);
                    for (const lote of lotesActualizados) {
                        if (cantidadAjustada <= 0) break;
                        const aDescontar = Math.min(lote.stockRestante, cantidadAjustada);
                        lote.stockRestante -= aDescontar;
                        cantidadAjustada -= aDescontar;
                    }
                } else {
                    lotesActualizados.sort((a, b) => b.fechaCompra.seconds - a.fechaCompra.seconds);
                    if (lotesActualizados.length > 0) {
                        lotesActualizados[0].stockRestante += cantidadAjustada;
                    } else {
                        throw "No hay lotes para ajustar. Registra una compra primero.";
                    }
                }
                transaction.update(docRef, { lotes: lotesActualizados });
            });
            await addDoc(movimientosStockCollection, {
                materiaPrimaId: editandoId,
                materiaPrimaNombre: productoData.nombre,
                tipo: 'Ajuste de Inventario',
                cantidad: diferencia,
                fecha: new Date(),
                descripcion: `Ajuste manual de ${stockActual.toLocaleString('es-AR')} a ${nuevoStock.toLocaleString('es-AR')}`
            });
            alert("Stock ajustado y movimiento registrado con éxito.");
            closeModalAjuste();
        } catch (error) {
            console.error("Error al ajustar stock:", error);
            alert(`No se pudo realizar el ajuste: ${error}`);
        } finally {
            btnGuardarAjuste.disabled = false;
            btnGuardarAjuste.textContent = 'Confirmar Ajuste';
        }
    };

    btnGuardarAjuste.addEventListener('click', guardarAjusteStock);
    btnCancelarAjuste.addEventListener('click', closeModalAjuste);

    const openHistorialModal = (productoId, productoNombre) => {
        historialModalTitle.textContent = `Historial de: ${productoNombre}`;
        historialListaContainer.innerHTML = '<p>Cargando...</p>';
        historialModal.classList.add('visible');
        const q = query(movimientosStockCollection, where("materiaPrimaId", "==", productoId), orderBy("fecha", "desc"));
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
                itemDiv.innerHTML = `<div class="movimiento-info"><span class="movimiento-fecha">${fecha}</span><strong class="movimiento-descripcion">${mov.descripcion}</strong></div><div class="movimiento-cantidad ${esEntrada ? 'entrada' : 'salida'}">${esEntrada ? '+' : ''}${mov.cantidad.toLocaleString('es-AR')}</div>`;
                historialListaContainer.appendChild(itemDiv);
            });
        }, (error) => {
            console.error("Error al cargar historial:", error);
            historialListaContainer.innerHTML = `<p style="color:var(--danger-color);">Error al cargar. Revisa la consola.</p>`;
        });
    };

    const closeHistorialModal = () => {
        if (unsubHistorial) unsubHistorial();
        historialModal.classList.remove('visible');
    };

    btnCerrarHistorial.addEventListener('click', closeHistorialModal);
    
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
        const target = e.target.closest('.ajustar, .edit, .history');
        if (!target) return;
        const id = target.dataset.id;
        
        if (target.classList.contains('ajustar')) {
            openModalParaAjustar(id);
        } else if (target.classList.contains('edit')) {
            openModalParaEdicionCompleta(id);
        } else if (target.classList.contains('history')) {
            openHistorialModal(id, target.dataset.nombre);
        }
    });
}
