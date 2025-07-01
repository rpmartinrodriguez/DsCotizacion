// js/historial.js (Versión con "Marcar como Venta")

import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupHistorial(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const historialContainer = document.getElementById('historial-container');
    const buscadorInput = document.getElementById('buscador-historial');

    let todoElHistorial = [];

    const renderizarHistorial = (datos) => {
        historialContainer.innerHTML = '';
        if (datos.length === 0) {
            historialContainer.innerHTML = '<p>No se encontraron presupuestos que coincidan con la búsqueda.</p>';
            return;
        }
        
        datos.forEach(presupuestoConId => {
            const presupuesto = presupuestoConId.data;
            const id = presupuestoConId.id;

            const fecha = presupuesto.fecha.toDate();
            const fechaFormateada = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            
            // ... (La lógica para generar detalleHtml y detalleCostosHtml no cambia)
            const ingredientesHtml = presupuesto.ingredientes.map(ing => {
                if (ing.lotesUtilizados && ing.lotesUtilizados.length > 0) {
                    const desgloseLotes = ing.lotesUtilizados.map(lote => {
                        const fechaLoteStr = lote.fechaLote ? lote.fechaLote.toDate().toLocaleDateString('es-AR') : 'N/A';
                        return `<li class="lote-item">${lote.cantidadUsada.toLocaleString('es-AR')} ${ing.unidad} @ $${lote.costoUnitario.toFixed(2)} c/u (Lote del ${fechaLoteStr})</li>`;
                    }).join('');
                    return `<li><strong>${ing.nombre}: ${ing.cantidadTotal.toLocaleString('es-AR')} ${ing.unidad} ($${ing.costoTotal.toFixed(2)})</strong><ul class="lote-detalle">${desgloseLotes}</ul></li>`;
                }
                return `<li>${ing.nombre}: ${(ing.cantidadTotal || ing.cantidad).toLocaleString('es-AR')} ${ing.unidad} ($${(ing.costoTotal || ing.costo).toFixed(2)})</li>`;
            }).join('');
            let detalleCostosHtml = '';
            if (presupuesto.hasOwnProperty('precioVenta')) {
                const costoManoObra = (presupuesto.horasTrabajo || 0) * (presupuesto.costoHora || 0);
                const costoFijos = (presupuesto.costoMateriales || 0) * ((presupuesto.porcentajeCostosFijos || 0) / 100);
                const costoProduccion = presupuesto.costoMateriales + costoManoObra + costoFijos;
                const ganancia = presupuesto.precioVenta - costoProduccion;
                detalleCostosHtml = `<h4>Desglose de Precio de Venta</h4><div class="calculo-resumen" style="margin-bottom: 1rem; gap: 0.5rem;"><div class="calculo-fila"><span>Costo Materiales:</span> <span>$${presupuesto.costoMateriales.toFixed(2)}</span></div><div class="calculo-fila"><span>+ Mano de Obra:</span> <span>$${costoManoObra.toFixed(2)}</span></div><div class="calculo-fila"><span>+ Costos Fijos (${presupuesto.porcentajeCostosFijos || 0}%):</span> <span>$${costoFijos.toFixed(2)}</span></div><div class="calculo-fila costo-produccion"><span>Costo de Producción:</span> <span>$${costoProduccion.toFixed(2)}</span></div><div class="calculo-fila"><span>+ Ganancia (${presupuesto.porcentajeGanancia || 0}%):</span> <span>$${ganancia.toFixed(2)}</span></div></div><hr class="calculo-divisor" style="margin: 1rem 0;">`;
            }

            // --- LÓGICA PARA MOSTRAR BOTÓN O ETIQUETA DE VENTA ---
            const botonVentaHtml = presupuesto.esVenta 
                ? `<span class="venta-confirmada-badge">✅ Venta Confirmada</span>`
                : `<button class="btn-marcar-venta" data-id="${id}">✅ Convertir a Venta</button>`;

            const card = document.createElement('div');
            card.className = 'historial-card';
            // Aplicamos una clase si ya es venta para un posible estilo futuro
            if (presupuesto.esVenta) {
                card.classList.add('es-venta');
            }
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
                    ${botonVentaHtml} 
                    <button class="btn-borrar-presupuesto" data-id="${id}">🗑️ Borrar</button>
                </div>
            `;
            historialContainer.appendChild(card);
        });
    };
    
    // onSnapshot y buscador no cambian
    const q = query(presupuestosGuardadosCollection, orderBy("fecha", "desc"));
    onSnapshot(q, (snapshot) => {
        todoElHistorial = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        const terminoBusqueda = buscadorInput.value.toLowerCase();
        const datosFiltrados = todoElHistorial.filter(item => {
            const data = item.data;
            return data.tituloTorta.toLowerCase().includes(terminoBusqueda) || 
                   data.nombreCliente.toLowerCase().includes(terminoBusqueda);
        });
        renderizarHistorial(datosFiltrados);
    });
    buscadorInput.addEventListener('input', (e) => {
        const terminoBusqueda = e.target.value.toLowerCase();
        const datosFiltrados = todoElHistorial.filter(item => {
            const data = item.data;
            return data.tituloTorta.toLowerCase().includes(terminoBusqueda) || 
                   data.nombreCliente.toLowerCase().includes(terminoBusqueda);
        });
        renderizarHistorial(datosFiltrados);
    });

    // --- LISTENER ACTUALIZADO PARA MANEJAR EL NUEVO BOTÓN ---
    historialContainer.addEventListener('click', async (e) => {
        const target = e.target;

        // Lógica para "Marcar como Venta"
        if (target.classList.contains('btn-marcar-venta')) {
            const id = target.dataset.id;
            if (confirm('¿Estás seguro de que quieres marcar este presupuesto como una venta concretada?')) {
                try {
                    const docRef = doc(db, 'presupuestosGuardados', id);
                    // Actualizamos el documento en Firebase para añadir el campo esVenta: true
                    await updateDoc(docRef, {
                        esVenta: true
                    });

                    // Mostramos el mensaje de agradecimiento
                    const mensaje = `¡Gracias de corazón por elegirme! 🩷
Me llena de alegría saber que voy a ser parte de un momento tan especial. Ya estoy con muchas ganas de empezar a hornear algo hermoso y delicioso para ustedes 🍰✨

Cualquier detalle que quieras ajustar o sumar, sabés que estoy a disposición. Lo importante para mí es que todo salga como lo imaginás (¡o incluso mejor!) 😄

Gracias por confiar,
Dulce Sal — Horneando tus mejores momentos`;

                    alert(mensaje);
                    // onSnapshot se encargará de re-dibujar la tarjeta con la nueva etiqueta de "Venta Confirmada"
                } catch (error) {
                    console.error("Error al marcar como venta: ", error);
                    alert("No se pudo marcar como venta.");
                }
            }
        }

        // Lógica para "Ver Detalle" (no cambia)
        if (target.classList.contains('btn-ver-detalle')) {
            const targetId = target.dataset.target;
            const detalleDiv = document.getElementById(targetId);
            if (detalleDiv) {
                const isVisible = detalleDiv.style.display === 'block';
                detalleDiv.style.display = isVisible ? 'none' : 'block';
                target.textContent = isVisible ? 'Ocultar Detalle' : 'Ver Detalle';
            }
        }
        
        // Lógica para "Borrar" (no cambia)
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
