import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    deleteDoc, updateDoc, limit, startAfter, getDocs 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupHistorial(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const historialContainer = document.getElementById('historial-container');
    const btnCargarMas = document.getElementById('btn-cargar-mas');
    const cargarMasContainer = document.getElementById('cargar-mas-container');
    
    // Referencias para la Modal de Agradecimiento
    const agradecimientoModal = document.getElementById('agradecimiento-modal-overlay');
    const agradecimientoTexto = document.getElementById('agradecimiento-texto');
    const btnCerrarAgradecimiento = document.getElementById('agradecimiento-modal-btn-cerrar');

    // Estado para la paginación
    let ultimoDocumentoVisible = null;
    let estaCargando = false;
    const LIMITE_POR_PAGINA = 10;
    let primerRender = true;

    // Función para renderizar las tarjetas (ahora recibe los documentos y los añade)
    const renderizarPresupuestos = (docs) => {
        // Si es la primera carga, limpiamos el contenedor
        if (primerRender) {
            historialContainer.innerHTML = '';
            primerRender = false;
        }

        if (docs.length === 0 && historialContainer.innerHTML === '') {
             historialContainer.innerHTML = '<p>No hay presupuestos guardados todavía.</p>';
        }

        docs.forEach(doc => {
            const presupuesto = doc.data();
            const id = doc.id;
            
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

    const cargarMasPresupuestos = async () => {
        if (estaCargando) return;
        estaCargando = true;
        btnCargarMas.textContent = 'Cargando...';
        btnCargarMas.disabled = true;

        try {
            let q;
            const constraints = [orderBy("fecha", "desc"), limit(LIMITE_POR_PAGINA)];
            if (ultimoDocumentoVisible) {
                constraints.push(startAfter(ultimoDocumentoVisible));
            }
            q = query(presupuestosGuardadosCollection, ...constraints);

            const querySnapshot = await getDocs(q);
            const docs = querySnapshot.docs;

            if (docs.length > 0) {
                ultimoDocumentoVisible = docs[docs.length - 1];
                renderizarPresupuestos(docs);
            }

            if (docs.length < LIMITE_POR_PAGINA) {
                cargarMasContainer.style.display = 'none';
            }

        } catch (error) {
            console.error("Error al cargar más presupuestos:", error);
        } finally {
            estaCargando = false;
            btnCargarMas.textContent = 'Cargar Más';
            btnCargarMas.disabled = false;
        }
    };
    
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
                    // Forzamos un re-render local para no esperar a onSnapshot
                    const card = target.closest('.historial-card');
                    target.outerHTML = `<span class="venta-confirmada-badge">✅ Venta Confirmada</span>`;
                    card.classList.add('es-venta');

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
                target.textContent = isVisible ? 'Ocultar Detalle' : 'Ver Detalle';
            }
        } else if (target.classList.contains('btn-borrar-presupuesto')) {
            const id = target.dataset.id;
            if (confirm('¿Estás seguro de que quieres eliminar este presupuesto de forma permanente?')) {
                try {
                    await deleteDoc(doc(db, 'presupuestosGuardados', id));
                    // Eliminamos la tarjeta de la vista para una respuesta instantánea
                    target.closest('.historial-card').remove();
                } catch (error) {
                    console.error("Error al eliminar el presupuesto: ", error);
                }
            }
        }
    });

    btnCargarMas.addEventListener('click', cargarMasPresupuestos);

    if (btnCerrarAgradecimiento) {
        btnCerrarAgradecimiento.addEventListener('click', () => agradecimientoModal.classList.remove('visible'));
    }
    if (agradecimientoModal) {
        agradecimientoModal.addEventListener('click', (e) => {
            if (e.target === agradecimientoModal) agradecimientoModal.classList.remove('visible');
        });
    }

    // Carga inicial
    cargarMasPresupuestos();
}
