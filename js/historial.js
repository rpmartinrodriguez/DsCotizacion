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

    let todoElHistorial = [];
    let materiasPrimasDisponibles = [];

    const cargarMateriasPrimas = async () => {
        const snapshot = await getDocs(materiasPrimasCollection);
        materiasPrimasDisponibles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    };

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
                if (didConfirm) resolve(fechaEntregaInput.value); else reject(new Error('Venta cancelada por usuario.'));
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
                
                const ingredientesHtml = (presupuesto.ingredientes || []).map(ing => {
                    let detalleLotesHtml = '';
                    if (ing.lotesUtilizados && ing.lotesUtilizados.length > 0) {
                        detalleLotesHtml = '<ul class="lote-detalle">' + ing.lotesUtilizados.map(lote => {
                            const fechaLoteStr = lote.fechaLote?.toDate() ? lote.fechaLote.toDate().toLocaleDateString('es-AR') : 'Proyectado';
                            return `<li class="lote-item">${(lote.cantidadUsada || 0).toLocaleString('es-AR')} ${ing.unidad} @ $${(lote.costoUnitario || 0).toFixed(2)} c/u (Lote del ${fechaLoteStr})</li>`;
                        }).join('') + '</ul>';
                    }
                    return `<li><strong>${ing.nombre || ing.nombreMateriaPrima}: ${(ing.cantidadTotal || 0).toLocaleString('es-AR')} ${ing.unidad} ($${(ing.costoTotal || 0).toFixed(2)})</strong>${detalleLotesHtml}</li>`;
                }).join('');

                let detalleCostosHtml = '';
                if (presupuesto.precioVenta) {
                    const costoMateriales = presupuesto.costoMateriales || 0;
                    const costoManoObra = (presupuesto.horasTrabajo || 0) * (presupuesto.costoHora || 0);
                    const costoFijos = costoMateriales * ((presupuesto.porcentajeCostosFijos || 0) / 100);
                    const costoProduccion = costoMateriales + costoManoObra + costoFijos;
                    const ganancia = presupuesto.precioVenta - costoProduccion;
                    detalleCostosHtml = `<h4>Desglose de Precio de Venta</h4><div class="calculo-resumen" style="margin-bottom: 1rem; gap: 0.5rem;"><div class="calculo-fila"><span>Costo Materiales:</span> <span>$${costoMateriales.toFixed(2)}</span></div><div class="calculo-fila"><span>+ Mano de Obra:</span> <span>$${costoManoObra.toFixed(2)}</span></div><div class="calculo-fila"><span>+ Costos Fijos (${presupuesto.porcentajeCostosFijos}%):</span> <span>$${costoFijos.toFixed(2)}</span></div><div class="calculo-fila costo-produccion"><span>Costo de Producción:</span> <span>$${costoProduccion.toFixed(2)}</span></div><div class="calculo-fila"><span>+ Ganancia (${presupuesto.porcentajeGanancia}%):</span> <span>$${ganancia.toFixed(2)}</span></div></div><hr class="calculo-divisor" style="margin: 1rem 0;">`;
                }
                
                const botonVentaHtml = presupuesto.esVenta ? `<span class="venta-confirmada-badge">✅ Venta Confirmada</span>` : `<button class="btn-marcar-venta" data-id="${id}">✅ Convertir a Venta</button>`;
                const totalMostrado = (presupuesto.precioVenta || presupuesto.costoTotal || 0).toFixed(2);
                
                const card = document.createElement('div');
                card.className = 'historial-card';
                if (presupuesto.esVenta) card.classList.add('es-venta');
                
                card.innerHTML = `
                    <div class="historial-card__header">
                        <div class="historial-card__info">
                            <h3>${presupuesto.tituloTorta || 'Sin Título'}</h3>
                            <p><strong>Cliente:</strong> ${presupuesto.nombreCliente || 'Sin Nombre'}</p>
                            <p class="fecha">${fechaFormateada} hs</p>
                        </div>
                        <div class="historial-card__total">$${totalMostrado}</div>
                    </div>
                    <div class="historial-card__detalle" id="detalle-${id}" style="display: none;">
                        ${detalleCostosHtml}
                        <h4>Ingredientes Utilizados:</h4>
                        <ul>${ingredientesHtml}</ul>
                    </div>
                    <div class="historial-card__actions">
                        <button class="btn-ver-detalle" data-target="detalle-${id}">Ver Detalle</button>
                        ${botonVentaHtml}
                        <button class="btn-borrar-presupuesto" data-id="${id}">🗑️ Borrar</button>
                    </div>
                `;
                historialContainer.appendChild(card);
            } catch (error) {
                console.error(`Error al renderizar el presupuesto ID: ${pConId.id}. Este presupuesto puede tener datos corruptos.`, error);
            }
        });
    };
    
    onSnapshot(query(presupuestosGuardadosCollection, orderBy("fecha", "desc")), (snapshot) => {
        todoElHistorial = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        buscadorInput.dispatchEvent(new Event('input'));
    });

    buscadorInput.addEventListener('input', (e) => {
        const termino = e.target.value.toLowerCase();
        const filtrados = todoElHistorial.filter(p => {
            const data = p.data;
            return (data.tituloTorta || '').toLowerCase().includes(termino) || (data.nombreCliente || '').toLowerCase().includes(termino);
        });
        renderizarHistorial(filtrados);
    });

    historialContainer.addEventListener('click', async (e) => {
        const target = e.target.closest('.btn-marcar-venta, .btn-borrar-presupuesto, .btn-ver-detalle');
        if (!target) return;
        const id = target.dataset.id;
        
        if (target.classList.contains('btn-marcar-venta')) {
            const presupuestoSeleccionado = todoElHistorial.find(p => p.id === id);
            if (!presupuestoSeleccionado) return;
            try {
                // ... (Lógica de Marcar Venta con advertencia y transacción) ...
            } catch (error) {
                if (error?.message.includes("cancelada")) console.log(error.message);
                else { console.error("Error al confirmar la venta:", error); alert(`No se pudo completar la venta: ${error.message}`); }
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

    // Listeners de las modales
    if (btnCerrarAgradecimiento) btnCerrarAgradecimiento.addEventListener('click', () => agradecimientoModal.classList.remove('visible'));
    if (btnCopiarAgradecimiento) {
        btnCopiarAgradecimiento.addEventListener('click', () => {
            navigator.clipboard.writeText(agradecimientoTexto.innerText).then(() => {
                copiadoFeedback.textContent = '¡Copiado!';
                setTimeout(() => { copiadoFeedback.textContent = ''; }, 2000);
            }).catch(err => console.error('Error al copiar: ', err));
        });
    }
    
    cargarMateriasPrimas();
}
