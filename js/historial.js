import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    deleteDoc, updateDoc, Timestamp, writeBatch, runTransaction, getDocs, where
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { formatCurrency } from "./core/format.js";
import { escapeHtml, escapeAttribute } from "./core/html.js";

export function setupHistorial(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const movimientosStockCollection = collection(db, 'movimientosStock');
    
    // Referencias al DOM
    const historialContainer = document.getElementById('historial-container');
    const buscadorInput = document.getElementById('buscador-historial');
    const agradecimientoModal = document.getElementById('agradecimiento-modal-overlay');
    const agradecimientoTexto = document.getElementById('agradecimiento-texto');
    const btnCerrarAgradecimiento = document.getElementById('agradecimiento-modal-btn-cerrar');
    const btnCopiarAgradecimiento = document.getElementById('agradecimiento-modal-btn-copiar');
    const btnAnadirCalendario = document.getElementById('agradecimiento-modal-btn-calendario');
    const copiadoFeedback = document.getElementById('copiado-feedback-historial');
    const confirmVentaModal = document.getElementById('confirm-venta-modal-overlay');
    const fechaEntregaInput = document.getElementById('fecha-entrega-input');
    const btnConfirmarVenta = document.getElementById('confirm-venta-modal-btn-confirmar');
    const btnCancelarVenta = document.getElementById('confirm-venta-modal-btn-cancelar');
    const confirmDeleteModal = document.getElementById('confirm-delete-modal-overlay');
    const confirmDeleteModalTitle = document.getElementById('confirm-delete-modal-title');
    const confirmDeleteModalText = document.getElementById('confirm-delete-modal-text');
    const btnConfirmarDelete = document.getElementById('confirm-delete-modal-btn-confirmar');
    const btnCancelarDelete = document.getElementById('confirm-delete-modal-btn-cancelar');
    const histKpiTotal = document.getElementById('hist-kpi-total');
    const histKpiVentas = document.getElementById('hist-kpi-ventas');
    const histKpiPendientes = document.getElementById('hist-kpi-pendientes');
    const histKpiMonto = document.getElementById('hist-kpi-monto');

    // Variables de Estado
    let todoElHistorial = [];
    let materiasPrimasDisponibles = [];
    let ultimoEventoParaCalendario = null;

    const cargarMateriasPrimas = async () => {
        try {
            const snapshot = await getDocs(query(materiasPrimasCollection));
            materiasPrimasDisponibles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) { console.error("Error al cargar materias primas:", error); }
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
                btnConfirmarVenta.onclick = null;
                btnCancelarVenta.onclick = null;
                if (didConfirm) resolve(fechaEntregaInput.value); else reject(new Error('Venta cancelada por usuario.'));
            };
            btnConfirmarVenta.onclick = () => {
                if (!fechaEntregaInput.value) { alert('Por favor, selecciona una fecha de entrega.'); return; }
                close(true);
            };
            btnCancelarVenta.onclick = () => close(false);
        });
    };

    const showConfirmationModal = (title, text, confirmClass = '') => {
        return new Promise((resolve, reject) => {
            confirmDeleteModalTitle.textContent = title;
            confirmDeleteModalText.innerText = text;
            btnConfirmarDelete.className = 'btn-primary';
            if (confirmClass) btnConfirmarDelete.classList.add(confirmClass);
            
            confirmDeleteModal.classList.remove('modal-overlay--danger');
            if (confirmClass === 'danger') confirmDeleteModal.classList.add('modal-overlay--danger');
            
            confirmDeleteModal.classList.add('visible');
            const close = (didConfirm) => {
                confirmDeleteModal.classList.remove('visible');
                btnConfirmarDelete.onclick = null;
                btnCancelarDelete.onclick = null;
                if (didConfirm) resolve(); else reject(new Error('Acción cancelada por usuario.'));
            };
            btnConfirmarDelete.onclick = () => close(true);
            btnCancelarDelete.onclick = () => close(false);
        });
    };

    const generarYDescargarICS = (evento) => {
        const formatICSDate = (date) => date.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
        
        const fechaInicio = new Date(evento.fechaEntrega);
        fechaInicio.setHours(9, 0, 0, 0);
        const fechaFin = new Date(fechaInicio.getTime() + (60 * 60 * 1000));

        const cal = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
            `UID:${evento.id}@dulceapp.com`,
            `DTSTAMP:${formatICSDate(new Date())}`,
            `DTSTART:${formatICSDate(fechaInicio)}`,
            `DTEND:${formatICSDate(fechaFin)}`,
            `SUMMARY:${evento.title}`,
            `DESCRIPTION:${evento.description}`,
            'END:VEVENT', 'END:VCALENDAR'
        ].join('\n');

        const blob = new Blob([cal], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `entrega-${evento.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const actualizarResumen = () => {
        const total = todoElHistorial.length;
        const ventas = todoElHistorial.filter(item => item.data?.esVenta === true);
        const pendientes = total - ventas.length;
        const montoVendido = ventas.reduce((sum, item) => {
            const data = item.data || {};
            return sum + Number(data.precioVenta || data.costoTotal || 0);
        }, 0);

        if (histKpiTotal) histKpiTotal.textContent = total.toLocaleString('es-AR');
        if (histKpiVentas) histKpiVentas.textContent = ventas.length.toLocaleString('es-AR');
        if (histKpiPendientes) histKpiPendientes.textContent = pendientes.toLocaleString('es-AR');
        if (histKpiMonto) histKpiMonto.textContent = formatCurrency(montoVendido);
    };

    const renderizarHistorial = (datos) => {
        historialContainer.innerHTML = '';
        if (datos.length === 0) {
            historialContainer.innerHTML = '<p>No se encontraron presupuestos.</p>';
            return;
        }
        datos.forEach(pConId => {
            try {
                const presupuesto = pConId.data;
                const id = pConId.id;
                if (!presupuesto || !presupuesto.fecha?.toDate) return;
                const fecha = presupuesto.fecha.toDate();
                const fechaFormateada = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const safeId = escapeAttribute(id);
                const safeTitle = escapeHtml(presupuesto.tituloTorta || 'Sin título');
                const safeClient = escapeHtml(presupuesto.nombreCliente || 'Sin nombre');
                const botonVentaHtml = presupuesto.esVenta
                    ? `<span class="venta-confirmada-badge">Venta confirmada</span>`
                    : `<button class="btn-marcar-venta" data-id="${safeId}">Convertir a venta</button>`;

                const totalMostrado = Number(presupuesto.precioVenta || presupuesto.costoTotal || 0);
                const card = document.createElement('div');
                card.className = 'historial-card';
                if (presupuesto.esVenta) card.classList.add('es-venta');

                card.innerHTML = `
                    <div class="historial-card__header">
                        <div class="historial-card__info">
                            <h3>${safeTitle}</h3>
                            <p><strong>Cliente:</strong> ${safeClient}</p>
                            <p class="fecha">${fechaFormateada} hs</p>
                        </div>
                        <div class="historial-card__total">${formatCurrency(totalMostrado)}</div>
                    </div>

                    <div class="historial-card__detalle" id="detalle-${safeId}" style="display:none;">
                        <p>Cargando detalle…</p>
                    </div>

                    <div class="historial-card__actions">
                        <button class="btn-ver-detalle" data-id="${safeId}">Ver detalle</button>
                        ${botonVentaHtml}
                        <button class="btn-borrar-presupuesto" data-id="${safeId}">Borrar</button>
                    </div>
                `;
                historialContainer.appendChild(card);
            } catch (error) {
                console.error(`Error al renderizar el presupuesto ID: ${pConId.id}.`, error);
            }
        });
    };

    const renderizarDetalle = (id, detalleDiv) => {
        const presupuestoData = todoElHistorial.find(p => p.id === id)?.data;
        if (!presupuestoData) {
            detalleDiv.innerHTML = '<p>Error: No se encontraron los datos del presupuesto.</p>';
            return;
        }
        const ingredientesHtml = (presupuestoData.ingredientes || []).map(ing => {
            let detalleLotesHtml = '';
            if (ing.lotesUtilizados && ing.lotesUtilizados.length > 0) {
                detalleLotesHtml = '<ul class="lote-detalle">' + ing.lotesUtilizados.map(lote => {
                    const esFechaValida = lote.fechaLote && typeof lote.fechaLote.toDate === 'function';
                    const fechaLoteStr = esFechaValida ? lote.fechaLote.toDate().toLocaleDateString('es-AR') : 'Proyectado';
                    return `<li class="lote-item">${(lote.cantidadUsada || 0).toLocaleString('es-AR')} ${escapeHtml(ing.unidad || '')} @ ${(lote.costoUnitario || 0).toFixed(2)} c/u (Lote del ${escapeHtml(fechaLoteStr)})</li>`;
                }).join('') + '</ul>';
            }
            return `<li><strong>${escapeHtml(ing.nombre || ing.nombreMateriaPrima || 'Ingrediente')}: ${(ing.cantidadTotal || 0).toLocaleString('es-AR')} ${escapeHtml(ing.unidad || '')} (${(ing.costoTotal || 0).toFixed(2)})</strong>${detalleLotesHtml}</li>`;
        }).join('');
        let detalleCostosHtml = '';
        if (presupuestoData.precioVenta) {
            const costoMateriales = presupuestoData.costoMateriales || 0;
            const costoManoObra = (presupuestoData.horasTrabajo || 0) * (presupuestoData.costoHora || 0);
            const costoFijos = costoMateriales * ((presupuestoData.porcentajeCostosFijos || 0) / 100);
            const costoProduccion = costoMateriales + costoManoObra + costoFijos;
            const ganancia = presupuestoData.precioVenta - costoProduccion;
            detalleCostosHtml = `<h4>Desglose de Precio de Venta</h4><div class="calculo-resumen" style="margin-bottom: 1rem; gap: 0.5rem;"><div class="calculo-fila"><span>Costo Materiales:</span> <span>$${costoMateriales.toFixed(2)}</span></div><div class="calculo-fila"><span>+ Mano de Obra y Fijos:</span> <span>$${(costoProduccion - costoMateriales).toFixed(2)}</span></div><div class="calculo-fila"><span>+ Ganancia:</span> <span>$${ganancia.toFixed(2)}</span></div></div><hr class="calculo-divisor" style="margin: 1rem 0;">`;
        }
        detalleDiv.innerHTML = `${detalleCostosHtml}<h4>Ingredientes Utilizados:</h4><ul>${ingredientesHtml}</ul>`;
    };

    onSnapshot(query(presupuestosGuardadosCollection, orderBy("fecha", "desc")), (snapshot) => {
        todoElHistorial = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        actualizarResumen();
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
        
        if (target.classList.contains('btn-ver-detalle')) {
            const detalleDiv = document.getElementById(`detalle-${id}`);
            if (detalleDiv) {
                const isVisible = detalleDiv.style.display === 'block';
                if (!isVisible && detalleDiv.innerHTML.includes('Cargando')) {
                    renderizarDetalle(id, detalleDiv);
                }
                detalleDiv.style.display = isVisible ? 'none' : 'block';
                target.textContent = isVisible ? 'Ver Detalle' : 'Ocultar Detalle';
            }
        } else if (target.classList.contains('btn-marcar-venta')) {
            const presupuestoSeleccionado = todoElHistorial.find(p => p.id === id);
            if (!presupuestoSeleccionado) return;
            try {
                let advertenciaStock = "";
                for (const ing of presupuestoSeleccionado.data.ingredientes) {
                    const materiaPrima = materiasPrimasDisponibles.find(mp => mp.id === (ing.idMateriaPrima || ing.id));
                    if (materiaPrima) {
                        const stockTotal = (materiaPrima.lotes || []).reduce((sum, lote) => sum + lote.stockRestante, 0);
                        if (stockTotal < ing.cantidadTotal) {
                            advertenciaStock += `- ${ing.nombre || ing.nombreMateriaPrima}\n`;
                        }
                    }
                }
                if (advertenciaStock) {
                    await showConfirmationModal('⚠️ ¡Atención, stock insuficiente!', `Te falta stock de:\n${advertenciaStock}\nEl stock quedará en negativo. ¿Confirmar venta de todos modos?`, 'danger');
                }
                const fechaEntregaStr = await showConfirmVentaModal();
                const fechaEntrega = new Date(`${fechaEntregaStr}T00:00:00`);
                await runTransaction(db, async (transaction) => {
                    const refs = presupuestoSeleccionado.data.ingredientes.map(ing => doc(db, 'materiasPrimas', ing.idMateriaPrima || ing.id));
                    const docs = await Promise.all(refs.map(ref => transaction.get(ref)));
                    for (let i = 0; i < docs.length; i++) {
                        const mpDoc = docs[i];
                        const ingrediente = presupuestoSeleccionado.data.ingredientes[i];
                        if (!mpDoc.exists()) throw new Error(`El ingrediente "${ingrediente.nombre}" ya no existe.`);
                        let data = mpDoc.data();
                        let cantidadADescontar = ingrediente.cantidadTotal;
                        let lotesActualizados = data.lotes.sort((a, b) => (a.fechaCompra.seconds || 0) - (b.fechaCompra.seconds || 0));
                        for (const lote of lotesActualizados) {
                            if (cantidadADescontar <= 0) break;
                            const descontar = Math.min(lote.stockRestante, cantidadADescontar);
                            lote.stockRestante -= descontar;
                            cantidadADescontar -= descontar;
                        }
                        if (cantidadADescontar > 0 && lotesActualizados.length > 0) {
                           lotesActualizados[lotesActualizados.length - 1].stockRestante -= cantidadADescontar;
                        }
                        transaction.update(mpDoc.ref, { lotes: lotesActualizados });
                    }
                });
                const batch = writeBatch(db);
                const presupuestoRef = doc(db, 'presupuestosGuardados', id);
                batch.update(presupuestoRef, { esVenta: true, fechaEntrega: Timestamp.fromDate(fechaEntrega) });
                presupuestoSeleccionado.data.ingredientes.forEach(ing => {
                    const movRef = doc(collection(db, 'movimientosStock'));
                    batch.set(movRef, { materiaPrimaId: ing.idMateriaPrima || ing.id, materiaPrimaNombre: ing.nombreMateriaPrima || ing.nombre, tipo: 'Venta', cantidad: -ing.cantidadTotal, fecha: new Date(), descripcion: `Venta de "${presupuestoSeleccionado.data.tituloTorta}"` });
                });
                await batch.commit();
                
                ultimoEventoParaCalendario = {
                    id: id,
                    title: `Entrega: ${presupuestoSeleccionado.data.tituloTorta}`,
                    description: `Pedido para el cliente: ${presupuestoSeleccionado.data.nombreCliente}`,
                    fechaEntrega: fechaEntrega
                };

                const mensaje = `¡Gracias de corazón por elegirme! 🩷\nMe llena de alegría saber que voy a ser parte de un momento tan especial. Ya estoy con muchas ganas de empezar a hornear algo hermoso y delicioso para ustedes 🍰✨\n\nCualquier detalle que quieras ajustar o sumar, sabés que estoy a disposición. Lo importante para mí es que todo salga como lo imaginás (¡o incluso mejor!) 😄\n\nGracias por confiar,\nDulce Sal — Horneando tus mejores momentos`;
                agradecimientoTexto.innerText = mensaje;
                agradecimientoModal.classList.add('visible');
            } catch (error) {
                if (error?.message && !error.message.includes("cancelada")) { alert(`No se pudo completar la venta: ${error.message}`); } 
                else { console.log("Acción cancelada."); }
            }
        } else if (target.classList.contains('btn-borrar-presupuesto')) {
            const id = target.dataset.id;
            try {
                await showConfirmationModal('Eliminar Presupuesto', 'Esta acción es permanente. ¿Estás seguro?', 'danger');
                await deleteDoc(doc(db, 'presupuestosGuardados', id));
            } catch (error) {
                if(error?.message && !error.message.includes("cancelado")) console.error("Error al eliminar:", error);
                else console.log("Borrado cancelado.");
            }
        }
    });

    if (btnCerrarAgradecimiento) btnCerrarAgradecimiento.addEventListener('click', () => agradecimientoModal.classList.remove('visible'));
    if (btnCopiarAgradecimiento) {
        btnCopiarAgradecimiento.addEventListener('click', () => {
            navigator.clipboard.writeText(agradecimientoTexto.innerText).then(() => {
                copiadoFeedback.textContent = '¡Copiado!';
                setTimeout(() => { copiadoFeedback.textContent = ''; }, 2000);
            }).catch(err => console.error('Error al copiar: ', err));
        });
    }
    if (btnAnadirCalendario) {
        btnAnadirCalendario.addEventListener('click', () => {
            if (ultimoEventoParaCalendario) {
                generarYDescargarICS(ultimoEventoParaCalendario);
            }
        });
    }
    
    cargarMateriasPrimas();
}
