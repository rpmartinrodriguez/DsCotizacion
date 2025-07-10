import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupHistorial(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
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
                btnConfirmarVenta.onclick = null;
                btnCancelarVenta.onclick = null;
                didConfirm ? resolve(fechaEntregaInput.value) : reject();
            };
            btnConfirmarVenta.onclick = () => {
                if (!fechaEntregaInput.value) {
                    alert('Por favor, selecciona una fecha de entrega.');
                    return;
                }
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
                btnConfirmarDelete.onclick = null;
                btnCancelarDelete.onclick = null;
                didConfirm ? resolve() : reject();
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
        
        datos.forEach(presupuestoConId => {
            const presupuesto = presupuestoConId.data;
            const id = presupuestoConId.id;
            if (!presupuesto || !presupuesto.fecha) return;

            const fecha = presupuesto.fecha.toDate();
            const fechaFormateada = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            
            const ingredientesHtml = (presupuesto.ingredientes || []).map(ing => {
                if (ing.lotesUtilizados && ing.lotesUtilizados.length > 0) {
                    const desgloseLotes = ing.lotesUtilizados.map(lote => {
                        const fechaLoteStr = lote.fechaLote?.toDate().toLocaleDateString('es-AR') || 'N/A';
                        return `<li class="lote-item">${ing.cantidadUsada?.toLocaleString('es-AR') || ing.cantidadTotal.toLocaleString('es-AR')} ${ing.unidad} @ $${(lote.costoUnitario || 0).toFixed(2)} c/u (Lote del ${fechaLoteStr})</li>`;
                    }).join('');
                    return `<li><strong>${ing.nombre || ing.nombreMateriaPrima}: ${ing.cantidadTotal.toLocaleString('es-AR')} ${ing.unidad} ($${ing.costoTotal.toFixed(2)})</strong><ul class="lote-detalle">${desgloseLotes}</ul></li>`;
                }
                return `<li>${ing.nombre || ing.nombreMateriaPrima}: ${(ing.cantidadTotal || ing.cantidad || 0).toLocaleString('es-AR')} ${ing.unidad} ($${(ing.costoTotal || ing.costo || 0).toFixed(2)})</li>`;
            }).join('');

            let detalleCostosHtml = '';
            if (presupuesto.precioVenta) {
                const costoProduccion = (presupuesto.costoMateriales || 0) + ((presupuesto.horasTrabajo || 0) * (presupuesto.costoHora || 0)) + ((presupuesto.costoMateriales || 0) * ((presupuesto.porcentajeCostosFijos || 0) / 100));
                const ganancia = presupuesto.precioVenta - costoProduccion;
                detalleCostosHtml = `<h4>Desglose de Precio de Venta</h4><div class="calculo-resumen" style="margin-bottom: 1rem; gap: 0.5rem;"><div class="calculo-fila"><span>Costo Materiales:</span> <span>$${(presupuesto.costoMateriales || 0).toFixed(2)}</span></div><div class="calculo-fila"><span>+ Mano de Obra:</span> <span>$${(costoProduccion - (presupuesto.costoMateriales || 0)).toFixed(2)}</span></div><div class="calculo-fila"><span>+ Ganancia:</span> <span>$${ganancia.toFixed(2)}</span></div></div><hr class="calculo-divisor" style="margin: 1rem 0;">`;
            }

            const botonVentaHtml = presupuesto.esVenta ? `<span class="venta-confirmada-badge">✅ Venta Confirmada</span>` : `<button class="btn-marcar-venta" data-id="${id}">✅ Convertir a Venta</button>`;
            const totalMostrado = (presupuesto.precioVenta || presupuesto.costoTotal || 0).toFixed(2);
            
            const card = document.createElement('div');
            card.className = 'historial-card';
            if (presupuesto.esVenta) card.classList.add('es-venta');
            
            card.innerHTML = `
                <div class="historial-card__header">
                    <div class="historial-card__info">
                        <h3>${presupuesto.tituloTorta}</h3>
                        <p><strong>Cliente:</strong> ${presupuesto.nombreCliente}</p>
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
            const titulo = data.tituloTorta || '';
            const cliente = data.nombreCliente || '';
            return titulo.toLowerCase().includes(termino) || cliente.toLowerCase().includes(termino);
        });
        renderizarHistorial(filtrados);
    });

    historialContainer.addEventListener('click', async (e) => {
        const target = e.target.closest('.btn-marcar-venta, .btn-borrar-presupuesto, .btn-ver-detalle');
        if (!target) return;
        const id = target.dataset.id;
        
        if (target.classList.contains('btn-marcar-venta')) {
            try {
                const fechaEntregaStr = await showConfirmVentaModal();
                const fechaEntrega = new Date(`${fechaEntregaStr}T00:00:00`);
                await updateDoc(doc(db, 'presupuestosGuardados', id), { esVenta: true, fechaEntrega: Timestamp.fromDate(fechaEntrega) });
                const mensaje = `¡Gracias de corazón por elegirme! 🩷\n\n... (resto del mensaje)`;
                agradecimientoTexto.innerText = mensaje;
                agradecimientoModal.classList.add('visible');
            } catch (error) {
                if(error) console.error("Error al marcar como venta:", error);
                else console.log("Acción cancelada.");
            }
        } else if (target.classList.contains('btn-borrar-presupuesto')) {
            try {
                await showConfirmDeleteModal();
                await deleteDoc(doc(db, 'presupuestosGuardados', id));
            } catch (error) {
                if(error) console.error("Error al eliminar:", error);
                else console.log("Borrado cancelado.");
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
}
