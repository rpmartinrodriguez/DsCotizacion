// js/historial.js (Versión con detalle de costos de venta)
import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupHistorial(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const historialContainer = document.getElementById('historial-container');

    const q = query(presupuestosGuardadosCollection, orderBy("fecha", "desc"));

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            historialContainer.innerHTML = '<p>No hay presupuestos guardados todavía.</p>';
            return;
        }

        historialContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const presupuesto = doc.data();
            const id = doc.id;

            const fecha = presupuesto.fecha.toDate();
            const fechaFormateada = fecha.toLocaleDateString('es-AR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            
            // Lógica para generar el detalle de ingredientes
            const ingredientesHtml = presupuesto.ingredientes.map(ing => {
                if (ing.lotesUtilizados && ing.lotesUtilizados.length > 0) {
                    const desgloseLotes = ing.lotesUtilizados.map(lote => {
                        const fechaLote = lote.fechaLote.toDate().toLocaleDateString('es-AR');
                        return `<li class="lote-item">${lote.cantidadUsada} ${ing.unidad} @ $${lote.costoUnitario.toFixed(2)} c/u (Lote del ${fechaLote})</li>`;
                    }).join('');
                    return `<li><strong>${ing.nombre}: ${ing.cantidadTotal} ${ing.unidad} ($${ing.costoTotal.toFixed(2)})</strong><ul class="lote-detalle">${desgloseLotes}</ul></li>`;
                }
                return `<li>${ing.nombre}: ${ing.cantidadTotal || ing.cantidad} ${ing.unidad} ($${(ing.costoTotal || ing.costo).toFixed(2)})</li>`;
            }).join('');

            // Lógica para generar el nuevo detalle de costos de venta
            let detalleCostosHtml = '';
            // Verificamos si es un presupuesto nuevo con los datos de precio de venta
            if (presupuesto.hasOwnProperty('precioVenta')) {
                const costoManoObra = (presupuesto.horasTrabajo || 0) * (presupuesto.costoHora || 0);
                const costoFijos = (presupuesto.costoMateriales || 0) * ((presupuesto.porcentajeCostosFijos || 0) / 100);
                const costoProduccion = presupuesto.costoMateriales + costoManoObra + costoFijos;
                const ganancia = presupuesto.precioVenta - costoProduccion;

                detalleCostosHtml = `
                    <h4>Desglose de Precio de Venta</h4>
                    <div class="calculo-resumen" style="margin-bottom: 0;">
                        <div class="calculo-fila"><span>Costo Materiales:</span> <span>$${presupuesto.costoMateriales.toFixed(2)}</span></div>
                        <div class="calculo-fila"><span>+ Mano de Obra:</span> <span>$${costoManoObra.toFixed(2)}</span></div>
                        <div class="calculo-fila"><span>+ Costos Fijos:</span> <span>$${costoFijos.toFixed(2)}</span></div>
                        <div class="calculo-fila costo-produccion"><span>Costo de Producción:</span> <span>$${costoProduccion.toFixed(2)}</span></div>
                        <div class="calculo-fila"><span>+ Ganancia:</span> <span>$${ganancia.toFixed(2)}</span></div>
                    </div>
                    <hr class="calculo-divisor">
                `;
            }

            const card = document.createElement('div');
            card.className = 'historial-card';
            card.innerHTML = `
                <div class="historial-card__header">
                    <div class="historial-card__info">
                        <h3>${presupuesto.tituloTorta}</h3>
                        <p><strong>Cliente:</strong> ${presupuesto.nombreCliente}</p>
                        <p class="fecha">${fechaFormateada} hs</p>
                    </div>
                    <div class="historial-card__total">
                        ${presupuesto.hasOwnProperty('precioVenta') ? `$${presupuesto.precioVenta.toFixed(2)}` : `$${presupuesto.costoTotal.toFixed(2)}`}
                    </div>
                </div>
                <div class="historial-card__detalle" id="detalle-${id}" style="display: none;">
                    ${detalleCostosHtml}
                    <h4>Ingredientes Utilizados:</h4>
                    <ul>${ingredientesHtml}</ul>
                </div>
                <div class="historial-card__actions">
                    <button class="btn-ver-detalle" data-target="detalle-${id}">Ver Detalle</button>
                    <button class="btn-borrar-presupuesto" data-id="${id}">🗑️ Borrar</button>
                </div>
            `;
            historialContainer.appendChild(card);
        });
    });

    // La lógica para borrar y ver detalle no cambia
    historialContainer.addEventListener('click', async (e) => {
        const target = e.target;
        if (target.classList.contains('btn-ver-detalle')) {
            const targetId = target.dataset.target;
            const detalleDiv = document.getElementById(targetId);
            if (detalleDiv) {
                const isVisible = detalleDiv.style.display === 'block';
                detalleDiv.style.display = isVisible ? 'none' : 'block';
                target.textContent = isVisible ? 'Ver Detalle' : 'Ocultar Detalle';
            }
        }
        if (target.classList.contains('btn-borrar-presupuesto')) {
            const id = target.dataset.id;
            if (confirm('¿Estás seguro de que quieres eliminar este presupuesto de forma permanente?')) {
                try {
                    await deleteDoc(doc(db, 'presupuestosGuardados', id));
                } catch (error) {
                    console.error("Error al eliminar el presupuesto: ", error);
                }
            }
        }
    });
}
