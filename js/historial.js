import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    deleteDoc, updateDoc, Timestamp, writeBatch, runTransaction, getDocs
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupHistorial(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const movimientosStockCollection = collection(db, 'movimientosStock');
    
    // Referencias al DOM
    const historialContainer = document.getElementById('historial-container');
    const buscadorInput = document.getElementById('buscador-historial');
    
    // Referencias a Modales
    const agradecimientoModal = document.getElementById('agradecimiento-modal-overlay');
    const agradecimientoTexto = document.getElementById('agradecimiento-texto');
    const btnCerrarAgradecimiento = document.getElementById('agradecimiento-modal-btn-cerrar');
    const btnCopiarAgradecimiento = document.getElementById('agradecimiento-modal-btn-copiar');
    const copiadoFeedback = document.getElementById('copiado-feedback-historial');

    const confirmVentaModal = document.getElementById('confirm-venta-modal-overlay');
    const fechaEntregaInput = document.getElementById('fecha-entrega-input');
    const btnConfirmarVenta = document.getElementById('confirm-venta-modal-btn-confirmar');
    const btnCancelarVenta = document.getElementById('confirm-venta-modal-btn-cancelar');

    const confirmDeleteModal = document.getElementById('confirm-delete-modal-overlay');
    const btnConfirmarDelete = document.getElementById('confirm-delete-modal-btn-confirmar');
    const btnCancelarDelete = document.getElementById('confirm-delete-modal-btn-cancelar');

    // Variables de Estado
    let todoElHistorial = [];
    let materiasPrimasDisponibles = [];

    // Cargamos las materias primas para poder verificar el stock antes de descontar
    const cargarMateriasPrimas = async () => {
        const snapshot = await getDocs(materiasPrimasCollection);
        materiasPrimasDisponibles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    };

    // --- Funciones para manejar las modales ---
    const showConfirmVentaModal = () => {
        return new Promise((resolve, reject) => {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            fechaEntregaInput.min = `${yyyy}-${mm}-${dd}`;
            fechaEntregaInput.value = `${yyyy}-${mm}-${dd}`;
            confirmVentaModal.classList.add('visible');
            const close = (didConfirm) => {
                confirmVentaModal.classList.remove('visible');
                btnConfirmarVenta.onclick = null; btnCancelarVenta.onclick = null;
                didConfirm ? resolve(fechaEntregaInput.value) : reject(new Error('Venta cancelada por usuario.'));
            };
            btnConfirmarVenta.onclick = () => {
                if (!fechaEntregaInput.value) { alert('Por favor, selecciona una fecha de entrega.'); return; }
                close(true);
            };
            btnCancelarVenta.onclick = () => close(false);
        });
    };

    const showConfirmDeleteModal = () => {
        return new Promise((resolve, reject) => {
            confirmDeleteModal.classList.add('visible');
            const close = (didConfirm) => {
                confirmDeleteModal.classList.remove('visible');
                btnConfirmarDelete.onclick = null; btnCancelarDelete.onclick = null;
                if (didConfirm) resolve(); else reject(new Error('Borrado cancelado por usuario.'));
            };
            btnConfirmarDelete.onclick = () => close(true);
            btnCancelarDelete.onclick = () => close(false);
        });
    };

    const renderizarHistorial = (datos) => {
        historialContainer.innerHTML = '';
        if (datos.length === 0) {
            historialContainer.innerHTML = '<p>No se encontraron presupuestos que coincidan con la búsqueda.</p>';
            return;
        }
        datos.forEach(pConId => {
            try {
                const presupuesto = pConId.data;
                const id = pConId.id;
                if (!presupuesto || !presupuesto.fecha || typeof presupuesto.fecha.toDate !== 'function') return;
                const fecha = presupuesto.fecha.toDate();
                const fechaFormateada = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const ingredientesHtml = (presupuesto.ingredientes || []).map(ing => `<li>${(ing.cantidadTotal || 0).toLocaleString('es-AR')} ${ing.unidad} - ${ing.nombre}</li>`).join('');
                const botonVentaHtml = presupuesto.esVenta ? `<span class="venta-confirmada-badge">✅ Venta Confirmada</span>` : `<button class="btn-marcar-venta" data-id="${id}">✅ Convertir a Venta</button>`;
                const totalMostrado = (presupuesto.precioVenta || presupuesto.costoTotal || 0).toFixed(2);
                const card = document.createElement('div');
                card.className = 'historial-card';
                if (presupuesto.esVenta) card.classList.add('es-venta');
                card.innerHTML = `<div class="historial-card__header"><div class="historial-card__info"><h3>${presupuesto.tituloTorta || 'Sin Título'}</h3><p><strong>Cliente:</strong> ${presupuesto.nombreCliente || 'Sin Nombre'}</p><p class="fecha">${fechaFormateada} hs</p></div><div class="historial-card__total">$${totalMostrado}</div></div><div class="historial-card__detalle" id="detalle-${id}" style="display: none;"><h4>Ingredientes:</h4><ul>${ingredientesHtml}</ul></div><div class="historial-card__actions"><button class="btn-ver-detalle" data-target="detalle-${id}">Ver Detalle</button>${botonVentaHtml}<button class="btn-borrar-presupuesto" data-id="${id}">🗑️ Borrar</button></div>`;
                historialContainer.appendChild(card);
            } catch (error) {
                console.error(`Error al renderizar el presupuesto ID: ${pConId.id}.`, error);
            }
        });
    };
    
    onSnapshot(query(presupuestosGuardadosCollection, orderBy("fecha", "desc")), (snapshot) => {
        todoElHistorial = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        buscadorInput.dispatchEvent(new Event('input'));
    });

    buscadorInput.addEventListener('input', (e) => {
        const termino = e.target.value.toLowerCase();
        const filtrados = todoElHistorial.filter(p => ((p.data.tituloTorta || '').toLowerCase().includes(termino) || (p.data.nombreCliente || '').toLowerCase().includes(termino)));
        renderizarHistorial(filtrados);
    });

    historialContainer.addEventListener('click', async (e) => {
        const target = e.target.closest('.btn-marcar-venta, .btn-borrar-presupuesto, .btn-ver-detalle');
        if (!target) return;
        const id = target.dataset.id;
        if (!id && !target.classList.contains('btn-ver-detalle')) return;

        if (target.classList.contains('btn-marcar-venta')) {
            const presupuestoSeleccionado = todoElHistorial.find(p => p.id === id);
            if (!presupuestoSeleccionado) return;
            try {
                const fechaEntregaStr = await showConfirmVentaModal();
                const fechaEntrega = new Date(`${fechaEntregaStr}T00:00:00`);
                
                await runTransaction(db, async (transaction) => {
                    const refs = presupuestoSeleccionado.data.ingredientes.map(ing => doc(db, 'materiasPrimas', ing.idMateriaPrima || ing.id));
                    const docs = await Promise.all(refs.map(ref => transaction.get(ref)));
                    
                    docs.forEach((mpDoc, i) => {
                        const ing = presupuestoSeleccionado.data.ingredientes[i];
                        if (!mpDoc.exists()) throw new Error(`El ingrediente "${ing.nombre}" ya no existe.`);
                        const stockTotal = (mpDoc.data().lotes || []).reduce((sum, lote) => sum + lote.stockRestante, 0);
                        if (stockTotal < ing.cantidadTotal) throw new Error(`¡Stock insuficiente de "${ing.nombre}"!`);
                    });
                    
                    docs.forEach((mpDoc, i) => {
                        const ing = presupuestoSeleccionado.data.ingredientes[i];
                        let data = mpDoc.data();
                        let cantidadADescontar = ing.cantidadTotal;
                        let lotesActualizados = data.lotes.sort((a, b) => a.fechaCompra.seconds - b.fechaCompra.seconds);
                        for (const lote of lotesActualizados) {
                            if (cantidadADescontar <= 0) break;
                            const descontar = Math.min(lote.stockRestante, cantidadADescontar);
                            lote.stockRestante -= descontar;
                            cantidadADescontar -= descontar;
                        }
                        lotesActualizados = lotesActualizados.filter(lote => lote.stockRestante > 0);
                        transaction.update(mpDoc.ref, { lotes: lotesActualizados });
                    });
                });
                
                const batch = writeBatch(db);
                const presupuestoRef = doc(db, 'presupuestosGuardados', id);
                batch.update(presupuestoRef, { esVenta: true, fechaEntrega: Timestamp.fromDate(fechaEntrega) });
                
                presupuestoSeleccionado.data.ingredientes.forEach(ing => {
                    const movRef = doc(collection(db, 'movimientosStock'));
                    batch.set(movRef, { materiaPrimaId: ing.idMateriaPrima || ing.id, materiaPrimaNombre: ing.nombreMateriaPrima || ing.nombre, tipo: 'Venta', cantidad: -ing.cantidadTotal, fecha: new Date(), descripcion: `Venta de "${presupuestoSeleccionado.data.tituloTorta}"` });
                });
                await batch.commit();

                const mensaje = `¡Gracias de corazón por elegirme! 🩷\nMe llena de alegría saber que voy a ser parte de un momento tan especial. Ya estoy con muchas ganas de empezar a hornear algo hermoso y delicioso para ustedes 🍰✨\n\nCualquier detalle que quieras ajustar o sumar, sabés que estoy a disposición. Lo importante para mí es que todo salga como lo imaginás (¡o incluso mejor!) 😄\n\nGracias por confiar,\nDulce Sal — Horneando tus mejores momentos`;
                agradecimientoTexto.innerText = mensaje;
                agradecimientoModal.classList.add('visible');

            } catch (error) {
                if (error?.message.includes("cancelada")) console.log(error.message);
                else {
                    console.error("Error al confirmar la venta:", error);
                    alert(`No se pudo completar la venta: ${error.message}`);
                }
            }
        } else if (target.classList.contains('btn-borrar-presupuesto')) {
            try {
                await showConfirmDeleteModal();
                await deleteDoc(doc(db, 'presupuestosGuardados', id));
            } catch (error) {
                if(error?.message.includes("cancelado")) console.log("Borrado cancelado.");
                else console.error("Error al eliminar:", error);
            }
        } else if (target.classList.contains('btn-ver-detalle')) {
            const targetId = target.dataset.target;
            const detalleDiv = document.getElementById(targetId);
            if (detalleDiv) {
                const isVisible = detalleDiv.style.display === 'block';
                detalleDiv.style.display = isVisible ? 'none' : 'block';
                target.textContent = isVisible ? 'Ocultar Detalle' : 'Ver Detalle';
            }
        }
    });

    if (btnCerrarAgradecimiento) btnCerrarAgradecimiento.addEventListener('click', () => agradecimientoModal.classList.remove('visible'));
    if (btnCopiarAgradecimiento) btnCopiarAgradecimiento.addEventListener('click', () => {
        navigator.clipboard.writeText(agradecimientoTexto.innerText).then(() => {
            copiadoFeedback.textContent = '¡Copiado!';
            setTimeout(() => { copiadoFeedback.textContent = ''; }, 2000);
        }).catch(err => console.error('Error al copiar: ', err));
    });
    
    // Carga inicial
    cargarMateriasPrimas();
}
