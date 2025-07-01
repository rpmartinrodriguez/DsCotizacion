// js/historial.js (Versión final con corrección en "Marcar como Venta")

import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    deleteDoc, updateDoc, limit, startAfter, getDocs 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupHistorial(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const historialContainer = document.getElementById('historial-container');
    const buscadorInput = document.getElementById('buscador-historial');
    const btnCargarMas = document.getElementById('btn-cargar-mas');
    const cargarMasContainer = document.getElementById('cargar-mas-container');
    
    const agradecimientoModal = document.getElementById('agradecimiento-modal-overlay');
    const agradecimientoTexto = document.getElementById('agradecimiento-texto');
    const btnCerrarAgradecimiento = document.getElementById('agradecimiento-modal-btn-cerrar');

    let todoElHistorial = [];
    let ultimoDocumentoVisible = null;
    let estaCargando = false;
    const LIMITE_POR_PAGINA = 10;
    
    const renderizarHistorial = (datos) => {
        historialContainer.innerHTML = '';
        if (datos.length === 0) {
            historialContainer.innerHTML = '<p>No se encontraron presupuestos.</p>';
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
                        const fechaLoteStr = lote.fechaLote ? lote.fechaLote.toDate().toLocaleDateString('es-AR') : 'N/A';
                        return `<li class="lote-item">${lote.cantidadUsada.toLocaleString('es-AR')} ${ing.unidad} @ $${lote.costoUnitario.toFixed(2)} c/u (Lote del ${fechaLoteStr})</li>`;
                    }).join('');
                    return `<li><strong>${ing.nombre}: ${ing.cantidadTotal.toLocaleString('es-AR')} ${ing.unidad} ($${ing.costoTotal.toFixed(2)})</strong><ul class="lote-detalle">${desgloseLotes}</ul></li>`;
                }
                return `<li>${ing.nombre}: ${(ing.cantidadTotal || ing.cantidad || 0).toLocaleString('es-AR')} ${ing.unidad} ($${(ing.costoTotal || ing.costo || 0).toFixed(2)})</li>`;
            }).join('');

            let detalleCostosHtml = '';
            if (presupuesto.hasOwnProperty('precioVenta')) {
                const costoManoObra = (presupuesto.horasTrabajo || 0) * (presupuesto.costoHora || 0);
                const costoFijos = (presupuesto.costoMateriales || 0) * ((presupuesto.porcentajeCostosFijos || 0) / 100);
                const costoProduccion = presupuesto.costoMateriales + costoManoObra + costoFijos;
                const ganancia = presupuesto.precioVenta - costoProduccion;
                detalleCostosHtml = `<h4>Desglose de Precio de Venta</h4><div class="calculo-resumen" style="margin-bottom: 1rem; gap: 0.5rem;"><div class="calculo-fila"><span>Costo Materiales:</span> <span>$${presupuesto.costoMateriales.toFixed(2)}</span></div><div class="calculo-fila"><span>+ Mano de Obra:</span> <span>$${costoManoObra.toFixed(2)}</span></div><div class="calculo-fila"><span>+ Costos Fijos (${presupuesto.porcentajeCostosFijos || 0}%):</span> <span>$${costoFijos.toFixed(2)}</span></div><div class="calculo-fila costo-produccion"><span>Costo de Producción:</span> <span>$${costoProduccion.toFixed(2)}</span></div><div class="calculo-fila"><span>+ Ganancia (${presupuesto.porcentajeGanancia || 0}%):</span> <span>$${ganancia.toFixed(2)}</span></div></div><hr class="calculo-divisor" style="margin: 1rem 0;">`;
            }
            
            const botonVentaHtml = presupuesto.esVenta ? `<span class="venta-confirmada-badge">✅ Venta Confirmada</span>` : `<button class="btn-marcar-venta" data-id="${id}">✅ Convertir a Venta</button>`;
            const totalMostrado = presupuesto.precioVenta ? presupuesto.precioVenta.toFixed(2) : (presupuesto.costoTotal || 0).toFixed(2);
            
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
    
    const cargarPresupuestos = async (inicial = false) => {
        if (estaCargando) return;
        estaCargando = true;
        btnCargarMas.textContent = 'Cargando...';
        btnCargarMas.disabled = true;

        if (inicial) {
            historialContainer.innerHTML = '<p>Cargando historial...</p>';
            ultimoDocumentoVisible = null;
            todoElHistorial = [];
        }

        try {
            let q;
            const constraints = [orderBy("fecha", "desc"), limit(LIMITE_POR_PAGINA)];
            if (ultimoDocumentoVisible && !inicial) {
                constraints.push(startAfter(ultimoDocumentoVisible));
            }
            q = query(presupuestosGuardadosCollection, ...constraints);

            const querySnapshot = await getDocs(q);
            const docs = querySnapshot.docs;
            
            if(inicial) historialContainer.innerHTML = '';

            if (docs.length > 0) {
                ultimoDocumentoVisible = docs[docs.length - 1];
                const nuevosPresupuestos = docs.map(doc => ({ id: doc.id, data: doc.data() }));
                todoElHistorial = todoElHistorial.concat(nuevosPresupuestos); // Acumulamos los datos
                renderizarHistorial(todoElHistorial); // Siempre renderizamos la lista completa
            }

            if (docs.length < LIMITE_POR_PAGINA) {
                cargarMasContainer.style.display = 'none';
            } else {
                 cargarMasContainer.style.display = 'flex';
            }

            if (historialContainer.innerHTML === '') {
                historialContainer.innerHTML = '<p>No hay presupuestos guardados todavía.</p>';
            }

        } catch (error) {
            console.error("Error al cargar presupuestos:", error);
        } finally {
            estaCargando = false;
            btnCargarMas.textContent = 'Cargar Más';
            btnCargarMas.disabled = false;
        }
    };

    // Hemos quitado el buscador, por lo que este listener ya no es necesario
    // buscadorInput.addEventListener('input', ...);
    
    historialContainer.addEventListener('click', async (e) => {
        const target = e.target;
        if (target.classList.contains('btn-marcar-venta')) {
            const id = target.dataset.id;
            if (confirm('¿Estás seguro de que quieres marcar este presupuesto como una venta concretada?')) {
                try {
                    const docRef = doc(db, 'presupuestosGuardados', id);
                    await updateDoc(docRef, { esVenta: true });

                    // --- INICIO DE LA CORRECCIÓN ---
                    // Actualizamos el estado en nuestra lista local para que la UI sea consistente
                    const index = todoElHistorial.findIndex(item => item.id === id);
                    if (index > -1) {
                        todoElHistorial[index].data.esVenta = true;
                    }
                    // --- FIN DE LA CORRECCIÓN ---

                    // Reemplazamos el botón en la UI para una respuesta visual instantánea
                    const card = target.closest('.historial-card');
                    target.outerHTML = `<span class="venta-confirmada-badge">✅ Venta Confirmada</span>`;
                    card.classList.add('es-venta');
                    
                    const mensaje = `¡Gracias de corazón por elegirme! 🩷\nMe llena de alegría saber que voy a ser parte de un momento tan especial. Ya estoy con muchas ganas de empezar a hornear algo hermoso y delicioso para ustedes 🍰✨\n\nCualquier detalle que quieras ajustar o sumar, sabés que estoy a disposición. Lo importante para mí es que todo salga como lo imaginás (¡o incluso mejor!) 😄\n\nGracias por confiar,\nDulce Sal — Horneando tus mejores momentos`;
                    agradecimientoTexto.innerText = mensaje;
                    agradecimientoModal.classList.add('visible');

                } catch (error) {
                    console.error("Error al marcar como venta: ", error);
                    alert("No se pudo marcar como venta.");
                }
            }
        } else if (target.classList.contains('btn-ver-detalle')) {
            // ... (lógica sin cambios)
        } else if (target.classList.contains('btn-borrar-presupuesto')) {
            // ... (lógica sin cambios)
        }
    });

    btnCargarMas.addEventListener('click', () => cargarPresupuestos(false));

    // Listeners para cerrar la modal de agradecimiento
    if(btnCerrarAgradecimiento) {
        btnCerrarAgradecimiento.addEventListener('click', () => agradecimientoModal.classList.remove('visible'));
    }
    if(agradecimientoModal) {
        agradecimientoModal.addEventListener('click', (e) => {
            if (e.target === agradecimientoModal) agradecimientoModal.classList.remove('visible');
        });
    }

    // Carga inicial
    cargarPresupuestos(true);
}
