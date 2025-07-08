import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    updateDoc, getDoc
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupStock(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const tablaStockBody = document.querySelector("#tabla-stock tbody");
    const buscadorInput = document.getElementById('buscador-stock');

    const modal = document.getElementById('edit-producto-modal-overlay');
    const modalTitle = document.getElementById('producto-modal-title');
    const nombreInput = document.getElementById('producto-nombre-input');
    const unidadSelect = document.getElementById('producto-unidad-select');
    const precioLoteInput = document.getElementById('lote-precio-input');
    const cantidadLoteInput = document.getElementById('lote-cantidad-input');
    const btnGuardar = document.getElementById('producto-modal-btn-guardar');
    const btnCancelar = document.getElementById('producto-modal-btn-cancelar');
    
    let editandoId = null;
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

            if (!item.lotes || !Array.isArray(item.lotes) || item.lotes.length === 0) {
                return;
            }
            
            const stockTotal = item.lotes.reduce((sum, lote) => sum + (lote.stockRestante || 0), 0);
            
            const lotesOrdenados = [...item.lotes].sort((a, b) => {
                const fechaA = a.fechaCompra?.seconds || 0;
                const fechaB = b.fechaCompra?.seconds || 0;
                return fechaB - fechaA;
            });
            const ultimoLote = lotesOrdenados[0];
            
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td data-label="Nombre">${item.nombre}</td>
                <td data-label="Stock Actual">${stockTotal.toLocaleString('es-AR')} ${item.unidad}</td>
                <td data-label="Precio Base">$${(ultimoLote.precioCompra || 0).toLocaleString('es-AR')} / ${(ultimoLote.cantidadComprada || 0)} ${item.unidad}</td>
                <td class="action-buttons stock-actions">
                    <button class="btn-stock-link edit" data-id="${id}" title="Editar Producto">✏️</button>
                    <button class="btn-stock-link history" data-id="${id}" title="Ver Historial (Próximamente)" disabled>📜</button>
                </td>
            `;
            tablaStockBody.appendChild(fila);
        });
    };
    
    const q = query(materiasPrimasCollection, orderBy("nombre"));
    onSnapshot(q, (snapshot) => {
        todoElStock = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        buscadorInput.dispatchEvent(new Event('input'));
    });

    buscadorInput.addEventListener('input', (e) => {
        const terminoBusqueda = e.target.value.toLowerCase();
        const datosFiltrados = todoElStock.filter(item => item.data.nombre && item.data.nombre.toLowerCase().includes(terminoBusqueda));
        renderizarTabla(datosFiltrados);
    });

    const openModalParaEditar = async (id) => {
        editandoId = id;
        const docRef = doc(db, 'materiasPrimas', id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists() || !docSnap.data().lotes || docSnap.data().lotes.length === 0) {
            alert("El producto no tiene compras registradas para editar.");
            return;
        }
        const producto = docSnap.data();
        const ultimoLote = [...producto.lotes].sort((a,b) => b.fechaCompra.seconds - a.fechaCompra.seconds)[0];
        
        modalTitle.textContent = `Editar: ${producto.nombre}`;
        nombreInput.value = producto.nombre;
        unidadSelect.value = producto.unidad;
        precioLoteInput.value = ultimoLote.precioCompra;
        cantidadLoteInput.value = ultimoLote.cantidadComprada;
        modal.classList.add('visible');
    };

    const closeModal = () => {
        modal.classList.remove('visible');
        editandoId = null;
    };
    
    btnGuardar.addEventListener('click', async () => {
        if (!editandoId) return;
        
        const docRef = doc(db, 'materiasPrimas', editandoId);
        try {
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) throw new Error("El documento fue eliminado.");

            const producto = docSnap.data();
            let lotesActualizados = producto.lotes.map(lote => ({ ...lote, fechaCompra: lote.fechaCompra }));
            
            const ultimoLoteTimestamp = Math.max(...lotesActualizados.map(lote => lote.fechaCompra.seconds));
            const indiceUltimoLote = lotesActualizados.findIndex(lote => lote.fechaCompra.seconds === ultimoLoteTimestamp);

            if (indiceUltimoLote > -1) {
                lotesActualizados[indiceUltimoLote].precioCompra = parseFloat(precioLoteInput.value);
                lotesActualizados[indiceUltimoLote].cantidadComprada = parseFloat(cantidadLoteInput.value);
                
                if (lotesActualizados[indiceUltimoLote].cantidadComprada > 0) {
                    lotesActualizados[indiceUltimoLote].costoUnitario = lotesActualizados[indiceUltimoLote].precioCompra / lotesActualizados[indiceUltimoLote].cantidadComprada;
                } else {
                    lotesActualizados[indiceUltimoLote].costoUnitario = 0;
                }
            }

            const datosParaActualizar = {
                nombre: nombreInput.value.trim(),
                unidad: unidadSelect.value,
                lotes: lotesActualizados
            };

            await updateDoc(docRef, datosParaActualizar);
            alert('¡Producto actualizado con éxito!');
            closeModal();
        } catch (error) {
            console.error("Error al actualizar el producto:", error);
            alert("No se pudieron guardar los cambios.");
        }
    });

    btnCancelar.addEventListener('click', closeModal);
    
    tablaStockBody.addEventListener('click', (e) => {
        const target = e.target.closest('.edit');
        if (target) {
            openModalParaEditar(target.dataset.id);
        }
    });
}
