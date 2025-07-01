// js/historial.js (Versión final, robusta y corregida)

import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupHistorial(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const historialContainer = document.getElementById('historial-container');
    const buscadorInput = document.getElementById('buscador-historial');

    // --- Referencias para la Modal de Agradecimiento ---
    const agradecimientoModal = document.getElementById('agradecimiento-modal-overlay');
    const agradecimientoTexto = document.getElementById('agradecimiento-texto');
    const btnCerrarAgradecimiento = document.getElementById('agradecimiento-modal-btn-cerrar');

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

            // Verificación para evitar errores con documentos malformados
            if (!presupuesto || !presupuesto.fecha) return;

            const fecha = presupuesto.fecha.toDate();
            const fechaFormateada = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            
            // --- LÓGICA DEFENSIVA PARA GENERAR LOS DETALLES ---
            const ingredientesHtml = (presupuesto.ingredientes || []).map(ing => {
                if (ing.lotesUtilizados && ing.lotesUtilizados.length > 0) {
                    const desgloseLotes = ing.lotesUtilizados.map(lote => {
                        const fechaLoteStr = lote.fechaLote ? lote.fechaLote.toDate().toLocaleDateString('es-AR') : 'N/A';
                        return `<li class="lote-item">${lote.cantidadUsada.toLocaleString('es-AR')} ${ing.unidad} @ $${lote.costoUnitario.toFixed(2)} c/u (Lote del ${fechaLoteStr})</li>`;
                    }).join('');
                    return `<li><strong>${ing.nombre}: ${ing.cantidadTotal.toLocaleString('es-AR')} ${ing.unidad} ($${ing.costoTotal.toFixed(2)})</strong><ul class="lote-detalle">${desgloseLotes}</ul></li>`;
                }
                return `<li>${ing.nombre}: ${(ing.cantidadTotal || ing.cantidad || 0).toLocaleString('es-AR')} ${ing.unidad} ($${(ing.costoTotal || ing.costo || 0).toFixed(2)})</li>`;
            }).join('');

            let detalleCostosHtml = '';
            if (presupuesto.hasOwnProperty('precioVenta')) {
                const costoMateriales = presupuesto.costoMateriales || 0;
                const horasTrabajo = presupuesto.horasTrabajo || 0;
                const costoHora = presupuesto.costoHora || 0;
                const porcentajeCostosFijos = presupuesto.porcentajeCostosFijos || 0;
                const porcentajeGanancia = presupuesto.porcentajeGanancia || 0;

                const costoManoObra = horasTrabajo * costoHora;
                const costoFijos = costoMateriales * (porcentajeCostosFijos / 100);
                const costoProduccion = costoMateriales + costoManoObra + costoFijos;
                const ganancia = presupuesto.precioVenta - costoProduccion;
                
                detalleCostosHtml = `
                    <h4>Desglose de Precio de Venta</h4>
                    <div class="calculo-resumen" style="margin-bottom: 1rem; gap: 0.5rem;">
                        <div class="calculo-fila"><span>Costo Materiales:</span> <span>$${costoMateriales.toFixed(2)}</span></div>
                        <div class="calculo-fila"><span>+ Mano de Obra:</span> <span>$${costoManoObra.toFixed(2)}</span></div>
                        <div class="calculo-fila"><span>+ Costos Fijos (${porcentajeCostosFijos}%):</span> <span>$${costoFijos.toFixed(2)}</span></div>
                        <div class="calculo-fila costo-produccion"><span>Costo de Producción:</span> <span>$${costoProduccion.toFixed(2)}</span></div>
                        <div class="calculo-fila"><span>+ Ganancia (${porcentajeGanancia}%):</span> <span>$${ganancia.toFixed(2)}</span></div>
                    </div>
                    <hr class="calculo-divisor" style="margin: 1rem 0;">
                `;
            }

            const botonVentaHtml = presupuesto.esVenta 
                ? `<span class="venta-confirmada-badge">✅ Venta Confirmada</span>`
                : `<button class="btn-marcar-venta" data-id="${id}">✅ Convertir a Venta</button>`;
            
            const totalMostrado = presupuesto.precioVenta ? presupuesto.precioVenta : presupuesto.costoTotal;

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
                    <div class="historial-card__total">
                        $${totalMostrado.toFixed(2)}
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
    
    const q = query(presupuestosGuardadosCollection, orderBy("fecha", "desc"));
    onSnapshot(q, (snapshot) => {
        todoElHistorial = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        // Forzamos el filtro actual cada vez que los datos cambian
        buscadorInput.dispatchEvent(new Event('input'));
    });

    buscadorInput.addEventListener('input', (e) => {
        const terminoBusqueda = e.target.value.toLowerCase();
        const datosFiltrados = todoElHistorial.filter(item => {
            const data = item.data;
            // Verificación para que no falle si un campo no existe
            const titulo = data.tituloTorta || '';
            const cliente = data.nombreCliente || '';
            return titulo.toLowerCase().includes(terminoBusqueda) || 
                   cliente.toLowerCase().includes(terminoBusqueda);
        });
        renderizarHistorial(datosFiltrados);
    });

    historialContainer.addEventListener('click', async (e) => {
        const target = e.target;
        if (target.classList.contains('btn-marcar-venta')) {
            const id = target.dataset.id;
            if (confirm('¿Estás seguro de que quieres marcar este presupuesto como una venta concretada?')) {
                try {
                    const docRef = doc(db, 'presupuestosGuardados', id);
                    await updateDoc(docRef, { esVenta: true });
                    const mensaje = `¡Gracias de corazón por elegirme! 🩷\nMe llena de alegría saber que voy a ser parte de un momento tan especial. Ya estoy con muchas ganas de empezar a hornear algo hermoso y delicioso para ustedes 🍰✨\n\nCualquier detalle que quieras ajustar o sumar, sabés que estoy a disposición. Lo importante para mí es que todo salga como lo imaginás (¡o incluso mejor!) 😄\n\nGracias por confiar,\nDulce Sal — Horneando tus mejores momentos`;
                    agradecimientoTexto.innerText = mensaje;
                    agradecimientoModal.classList.add('visible');
                } catch (error) {
                    console.error("Error al marcar como venta: ", error);
                    alert("No se pudo marcar como venta.");
                }
            }
        } else if (target.classList.contains('btn-ver-detalle')) {
            const targetId = target.dataset.target;
            const detalleDiv = document.getElementById(targetId);
            if (detalleDiv) {
                const isVisible = detalleDiv.style.display === 'block';
                detalleDiv.style.display = isVisible ? 'none' : 'block';
                target.textContent = isVisible ? 'Ver Detalle' : 'Ocultar Detalle';
            }
        } else if (target.classList.contains('btn-borrar-presupuesto')) {
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

    // Listeners para cerrar la modal de agradecimiento
    if(btnCerrarAgradecimiento) {
        btnCerrarAgradecimiento.addEventListener('click', () => {
            agradecimientoModal.classList.remove('visible');
        });
    }
    if(agradecimientoModal) {
        agradecimientoModal.addEventListener('click', (e) => {
            if (e.target === agradecimientoModal) {
                agradecimientoModal.classList.remove('visible');
            }
        });
    }
}
