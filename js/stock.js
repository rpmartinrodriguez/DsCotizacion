// js/stock.js
import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    updateDoc, getDoc, runTransaction 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupStock(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const tablaStockBody = document.querySelector("#tabla-stock tbody");
    const buscadorInput = document.getElementById('buscador-stock');

    const lotesModalOverlay = document.getElementById('edit-lotes-modal-overlay');
    const lotesModalTitle = document.getElementById('lotes-modal-title');
    const lotesEditorContainer = document.getElementById('lotes-editor-container');
    const lotesModalBtnGuardar = document.getElementById('lotes-modal-btn-guardar');
    const lotesModalBtnCancelar = document.getElementById('lotes-modal-btn-cancelar');
    let currentEditingDocId = null;

    let todoElStock = [];

    const renderizarTabla = (datos) => {
        tablaStockBody.innerHTML = '';
        if (datos.length === 0) {
            tablaStockBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No se encontraron productos.</td></tr>';
            return;
        }
        datos.forEach(itemConId => {
            const item = itemConId.data;
            const id = itemConId.id;

            if (!item.lotes || !Array.isArray(item.lotes)) return;
            
            const stockTotal = item.lotes.reduce((sum, lote) => sum + lote.stockRestante, 0);
            const valorTotalStock = item.lotes.reduce((sum, lote) => sum + (lote.stockRestante * lote.costoUnitario), 0);
            const precioPromedio = stockTotal > 0 ? valorTotalStock / stockTotal : 0;

            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td data-label="Nombre">${item.nombre}</td>
                <td data-label="Stock Actual">${stockTotal.toLocaleString('es-AR')} ${item.unidad}</td>
                <td data-label="Precio Promedio">$${precioPromedio.toFixed(2)} / ${item.unidad}</td>
                <td class="action-buttons stock-actions">
                    <a href="compras.html" class="btn-stock-link add" title="Registrar Nueva Compra">+</a>
                    <button class="btn-stock subtract" data-id="${id}" title="Dar de baja stock">-</button>
                    <button class="btn-stock-link edit" data-id="${id}" title="Editar Precios de Lotes">💲</button>
                </td>
            `;
            tablaStockBody.appendChild(fila);
        });
    };
    
    const q = query(materiasPrimasCollection, orderBy("nombre"));
    onSnapshot(q, (snapshot) => {
        todoElStock = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        const terminoBusqueda = buscadorInput.value.toLowerCase();
        const datosFiltrados = todoElStock.filter(item => item.data.nombre && item.data.nombre.toLowerCase().includes(terminoBusqueda));
        renderizarTabla(datosFiltrados);
    });

    buscadorInput.addEventListener('input', (e) => {
        const terminoBusqueda = e.target.value.toLowerCase();
        const datosFiltrados = todoElStock.filter(item => item.data.nombre && item.data.nombre.toLowerCase().includes(terminoBusqueda));
        renderizarTabla(datosFiltrados);
    });

    const openLotesEditor = async (docId) => {
        currentEditingDocId = docId;
        const docRef = doc(db, 'materiasPrimas', docId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            alert("El producto no existe.");
            return;
        }
        const producto = docSnap.data();
        lotesModalTitle.textContent = `Editar Lotes de: ${producto.nombre}`;
        lotesEditorContainer.innerHTML = '';

        producto.lotes.forEach((lote, index) => {
            const fecha = lote.fechaCompra.toDate().toLocaleDateString('es-AR');
            const loteDiv = document.createElement('div');
            loteDiv.className = 'lote-editor-item';
            loteDiv.innerHTML = `
                <span class="fecha-lote">Lote del ${fecha}</span>
                <div class="form-group">
                    <label>Precio Compra ($)</label>
                    <input type="number" value="${lote.precioCompra}" data-lote-index="${index}" data-field="precioCompra" step="any">
                </div>
                <div class="form-group">
                    <label>Cant. Comprada</label>
                    <input type="number" value="${lote.cantidadComprada}" data-lote-index="${index}" data-field="cantidadComprada" step="any">
                </div>
                <div class="form-group">
                    <label>Stock Restante</label>
                    <input type="number" value="${lote.stockRestante}" data-lote-index="${index}" data-field="stockRestante" step="any">
                </div>
            `;
            lotesEditorContainer.appendChild(loteDiv);
        });
        lotesModalOverlay.classList.add('visible');
    };

    const closeLotesEditor = () => {
        lotesModalOverlay.classList.remove('visible');
        currentEditingDocId = null;
    };
    
    lotesModalBtnGuardar.addEventListener('click', async () => {
        if (!currentEditingDocId) return;

        const inputs = lotesEditorContainer.querySelectorAll('input[data-lote-index]');
        const docRef = doc(db, 'materiasPrimas', currentEditingDocId);
        
        try {
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) throw new Error("El documento fue eliminado.");

            let producto = docSnap.data();
            let lotesActualizados = JSON.parse(JSON.stringify(producto.lotes));

            const inputsPorLote = {};
            inputs.forEach(input => {
                const index = input.dataset.loteIndex;
                if (!inputsPorLote[index]) inputsPorLote[index] = {};
                inputsPorLote[index][input.dataset.field] = parseFloat(input.value);
            });

            for (const index in inputsPorLote) {
                const nuevosValores = inputsPorLote[index];
                const loteAActualizar = lotesActualizados[index];
                
                loteAActualizar.precioCompra = nuevosValores.precioCompra;
                loteAActualizar.cantidadComprada = nuevosValores.cantidadComprada;
                loteAActualizar.stockRestante = nuevosValores.stockRestante;

                if (loteAActualizar.cantidadComprada > 0) {
                    loteAActualizar.costoUnitario = loteAActualizar.precioCompra / loteAActualizar.cantidadComprada;
                } else {
                    loteAActualizar.costoUnitario = 0;
                }
            }
            
            await updateDoc(docRef, { lotes: lotesActualizados });
            alert("Lotes actualizados con éxito.");
            closeLotesEditor();

        } catch (error) {
            console.error("Error al actualizar los lotes:", error);
            alert("No se pudieron guardar los cambios.");
        }
    });

    lotesModalBtnCancelar.addEventListener('click', closeLotesEditor);

    tablaStockBody.addEventListener('click', async (e) => {
        const target = e.target.closest('.btn-stock, .btn-stock-link');
        if (!target) return;
        
        const id = target.dataset.id;

        if (target.classList.contains('edit')) {
            openLotesEditor(id);
        }
        
        if (target.classList.contains('add')) {
            e.preventDefault();
            window.location.href = 'compras.html';
        }

        if (target.classList.contains('subtract')) {
            const amountStr = prompt("¿Qué cantidad de stock deseas dar de baja?");
            if (amountStr) {
                const cantidadADescontar = parseFloat(amountStr);
                if (!isNaN(cantidadADescontar) && cantidadADescontar > 0) {
                    try {
                        await runTransaction(db, async (transaction) => {
                            const docRef = doc(db, 'materiasPrimas', id);
                            const ingredienteDoc = await transaction.get(docRef);
                            if (!ingredienteDoc.exists()) throw "Este producto ya no existe.";

                            let data = ingredienteDoc.data();
                            let lotesActualizados = data.lotes.sort((a, b) => a.fechaCompra.toMillis() - b.fechaCompra.toMillis());
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
                        });
                        alert("Stock actualizado.");
                    } catch (error) {
                        console.error("Error al dar de baja stock: ", error);
                        alert(`No se pudo actualizar: ${error}`);
                    }
                } else {
                    alert("Por favor, ingresa un número válido.");
                }
            }
        }
    });
}
