// js/presupuesto.js (Versión Final, Corregida y Completa)

import { 
    getFirestore, collection, getDocs, query, orderBy, addDoc, 
    Timestamp, doc, runTransaction 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupPresupuesto(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');

    // --- REFERENCIAS A ELEMENTOS DEL DOM ---
    const ingredientesContainer = document.getElementById('lista-ingredientes');
    const tablaPresupuestoBody = document.querySelector("#tabla-presupuesto tbody");
    const costoTotalSpan = document.getElementById('costo-total');
    const btnFinalizar = document.getElementById('btn-finalizar');
    
    // Referencias para cálculo de precio
    const horasTrabajoInput = document.getElementById('horas-trabajo');
    const costoHoraInput = document.getElementById('costo-hora');
    const costosFijosPorcInput = document.getElementById('costos-fijos-porcentaje');
    const gananciaPorcInput = document.getElementById('ganancia-porcentaje');
    
    const resumenCostoMaterialesSpan = document.getElementById('resumen-costo-materiales');
    const subtotalManoObraSpan = document.getElementById('subtotal-mano-obra');
    const subtotalCostosFijosSpan = document.getElementById('subtotal-costos-fijos');
    const costoProduccionSpan = document.getElementById('costo-produccion');
    const totalGananciaSpan = document.getElementById('total-ganancia');
    const precioVentaSugeridoSpan = document.getElementById('precio-venta-sugerido');

    // Referencias a sección final y modal
    const resultadoFinalContainer = document.getElementById('resultado-final');
    const mensajeFinalTextarea = document.getElementById('mensaje-final');
    const btnCopiar = document.getElementById('btn-copiar');
    const copiadoFeedback = document.getElementById('copiado-feedback');
    const modalOverlay = document.getElementById('custom-modal-overlay');
    const tortaTituloInput = document.getElementById('torta-titulo-input');
    const clienteNombreInput = document.getElementById('cliente-nombre-input');
    const modalBtnConfirmar = document.getElementById('modal-btn-confirmar');
    const modalBtnCancelar = document.getElementById('modal-btn-cancelar');

    let materiasPrimasDisponibles = [];
    let presupuestoActual = [];
    let costoTotalCache = 0;

    const calcularCostoFIFO = (materiaPrima, cantidadRequerida) => {
        let costoAcumulado = 0;
        let cantidadRestante = cantidadRequerida;
        let desgloseLotes = [];
        const lotesOrdenados = materiaPrima.lotes.sort((a, b) => a.fechaCompra.toMillis() - b.fechaCompra.toMillis());

        for (const lote of lotesOrdenados) {
            if (cantidadRestante <= 0) break;
            const cantidadAUsar = Math.min(lote.stockRestante, cantidadRestante);
            costoAcumulado += cantidadAUsar * lote.costoUnitario;
            desgloseLotes.push({
                cantidadUsada: cantidadAUsar,
                costoUnitario: lote.costoUnitario,
                fechaLote: lote.fechaCompra
            });
            cantidadRestante -= cantidadAUsar;
        }
        return { costo: costoAcumulado, desglose: desgloseLotes };
    };

    const actualizarPresupuesto = () => {
        presupuestoActual = [];
        let costoTotal = 0;
        const itemsSeleccionados = Array.from(ingredientesContainer.querySelectorAll('input[type="checkbox"]:checked'));

        for (const checkbox of itemsSeleccionados) {
            const cantidadInput = checkbox.closest('.ingrediente-item').querySelector('input[type="number"]');
            cantidadInput.disabled = false;
            const cantidadRequerida = parseFloat(cantidadInput.value) || 0;
            if (cantidadRequerida > 0) {
                const materiaPrima = materiasPrimasDisponibles.find(mp => mp.id === checkbox.id);
                if (materiaPrima) {
                    const { costo: costoIngrediente, desglose: lotesUtilizados } = calcularCostoFIFO(materiaPrima, cantidadRequerida);
                    presupuestoActual.push({
                        id: checkbox.id,
                        nombre: materiaPrima.nombre,
                        cantidadTotal: cantidadRequerida,
                        unidad: materiaPrima.unidad,
                        costoTotal: costoIngrediente,
                        lotesUtilizados: lotesUtilizados
                    });
                    costoTotal += costoIngrediente;
                }
            }
        }
        
        const itemsNoSeleccionados = Array.from(ingredientesContainer.querySelectorAll('input[type="checkbox"]:not(:checked)'));
        itemsNoSeleccionados.forEach(checkbox => {
            const cantidadInput = checkbox.closest('.ingrediente-item').querySelector('input[type="number"]');
            cantidadInput.disabled = true;
            cantidadInput.value = '';
        });

        costoTotalCache = costoTotal;
        renderizarResumen(presupuestoActual, costoTotal);
    };

    const renderizarResumen = (presupuesto, total) => {
        tablaPresupuestoBody.innerHTML = '';
        if (presupuesto.length === 0) {
            tablaPresupuestoBody.innerHTML = `<tr><td colspan="3" style="text-align: center;">Selecciona ingredientes.</td></tr>`;
        } else {
            presupuesto.forEach(item => {
                const fila = document.createElement('tr');
                fila.innerHTML = `<td>${item.nombre}</td><td>${item.cantidadTotal.toLocaleString('es-AR')} ${item.unidad}</td><td>$${item.costoTotal.toFixed(2)}</td>`;
                tablaPresupuestoBody.appendChild(fila);
            });
        }
        costoTotalSpan.textContent = `$${total.toFixed(2)}`;
        btnFinalizar.disabled = total <= 0;
        calcularPrecioVenta();
    };

    const calcularPrecioVenta = () => {
        const costoMateriales = costoTotalCache;
        const horasTrabajo = parseFloat(horasTrabajoInput.value) || 0;
        const costoHora = parseFloat(costoHoraInput.value) || 0;
        const costosFijosPorc = parseFloat(costosFijosPorcInput.value) || 0;
        const gananciaPorc = parseFloat(gananciaPorcInput.value) || 0;

        const subtotalManoObra = horasTrabajo * costoHora;
        const subtotalCostosFijos = costoMateriales * (costosFijosPorc / 100);
        const costoProduccion = costoMateriales + subtotalManoObra + subtotalCostosFijos;
        const totalGanancia = costoProduccion * (gananciaPorc / 100);
        const precioVenta = costoProduccion + totalGanancia;

        resumenCostoMaterialesSpan.textContent = `$${costoMateriales.toFixed(2)}`;
        subtotalManoObraSpan.textContent = `$${subtotalManoObra.toFixed(2)}`;
        subtotalCostosFijosSpan.textContent = `$${subtotalCostosFijos.toFixed(2)}`;
        costoProduccionSpan.textContent = `$${costoProduccion.toFixed(2)}`;
        totalGananciaSpan.textContent = `$${totalGanancia.toFixed(2)}`;
        precioVentaSugeridoSpan.textContent = `$${precioVenta.toFixed(2)}`;
    };

    const cargarMateriasPrimas = async () => {
        const q = query(materiasPrimasCollection, orderBy('nombre'));
        const snapshot = await getDocs(q);
        
        ingredientesContainer.innerHTML = '';
        materiasPrimasDisponibles = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            if (!data.lotes || !Array.isArray(data.lotes) || data.lotes.length === 0) {
                console.warn(`El producto "${data.nombre}" no tiene lotes válidos y será ignorado.`);
                return;
            }
            materiasPrimasDisponibles.push({ id: doc.id, ...data });
            const stockTotal = data.lotes.reduce((sum, lote) => sum + lote.stockRestante, 0);
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('ingrediente-item');
            itemDiv.innerHTML = `
                <div class="ingrediente-info">
                    <input type="checkbox" id="${doc.id}">
                    <label for="${doc.id}">${data.nombre} (${data.unidad})</label>
                </div>
                <div class="ingrediente-cantidad">
                    <input type="number" min="0" step="any" placeholder="Cant." title="Stock disponible: ${stockTotal.toLocaleString('es-AR')}" disabled>
                </div>
            `;
            ingredientesContainer.appendChild(itemDiv);
        });

        if (ingredientesContainer.innerHTML === '') {
            ingredientesContainer.innerHTML = '<p>No se encontraron productos con stock. Registra una nueva compra primero.</p>';
        }
        
        ingredientesContainer.addEventListener('change', actualizarPresupuesto);
        ingredientesContainer.addEventListener('input', actualizarPresupuesto);
    };

    const showTitlePrompt = () => {
        return new Promise((resolve, reject) => {
            modalOverlay.classList.add('visible');
            tortaTituloInput.focus();
            tortaTituloInput.value = '';
            clienteNombreInput.value = '';
            const closeModal = () => {
                modalOverlay.classList.remove('visible');
                modalBtnConfirmar.onclick = null;
                modalBtnCancelar.onclick = null;
                modalOverlay.onclick = null;
                document.onkeydown = null;
            };
            modalBtnConfirmar.onclick = () => {
                const titulo = tortaTituloInput.value.trim();
                const cliente = clienteNombreInput.value.trim();
                if (titulo === '' || cliente === '') {
                    alert('Por favor, completa todos los campos.');
                    return;
                }
                resolve({ tituloTorta: titulo, nombreCliente: cliente });
                closeModal();
            };
            modalBtnCancelar.onclick = () => { reject(); closeModal(); };
            modalOverlay.onclick = (e) => { if (e.target === modalOverlay) { reject(); closeModal(); } };
            document.onkeydown = (e) => { if (e.key === 'Escape') { reject(); closeModal(); } };
        });
    };

    btnFinalizar.addEventListener('click', async () => {
        try {
            const { tituloTorta, nombreCliente } = await showTitlePrompt();
            
            await runTransaction(db, async (transaction) => {
                for (const ingrediente of presupuestoActual) {
                    const ingredienteRef = doc(db, 'materiasPrimas', ingrediente.id);
                    const ingredienteDoc = await transaction.get(ingredienteRef);
                    if (!ingredienteDoc.exists()) throw `El ingrediente "${ingrediente.nombre}" no existe.`;
                    
                    let data = ingredienteDoc.data();
                    let cantidadADescontar = ingrediente.cantidadTotal;
                    let lotesActualizados = data.lotes.sort((a, b) => a.fechaCompra.toMillis() - b.fechaCompra.toMillis());
                    
                    const stockTotal = lotesActualizados.reduce((sum, lote) => sum + lote.stockRestante, 0);
                    if (stockTotal < cantidadADescontar) {
                        throw `Stock insuficiente de "${ingrediente.nombre}". Disponible: ${stockTotal}, Necesario: ${cantidadADescontar}.`;
                    }
                    
                    for (const lote of lotesActualizados) {
                        if (cantidadADescontar <= 0) break;
                        const descontarDeEsteLote = Math.min(lote.stockRestante, cantidadADescontar);
                        lote.stockRestante -= descontarDeEsteLote;
                        cantidadADescontar -= descontarDeEsteLote;
                    }
                    
                    lotesActualizados = lotesActualizados.filter(lote => lote.stockRestante > 0);
                    transaction.update(ingredienteRef, { lotes: lotesActualizados });
                }
            });

            const presupuestoParaGuardar = {
                tituloTorta, nombreCliente, fecha: Timestamp.now(), 
                costoMateriales: costoTotalCache,
                horasTrabajo: parseFloat(horasTrabajoInput.value) || 0,
                costoHora: parseFloat(costoHoraInput.value) || 0,
                porcentajeCostosFijos: parseFloat(costosFijosPorcInput.value) || 0,
                porcentajeGanancia: parseFloat(gananciaPorcInput.value) || 0,
                precioVenta: parseFloat(precioVentaSugeridoSpan.textContent.replace('$', '')),
                ingredientes: presupuestoActual
            };
            await addDoc(presupuestosGuardadosCollection, presupuestoParaGuardar);
            alert('¡Stock descontado y presupuesto guardado con éxito!');

            const precioFinalParaMensaje = precioVentaSugeridoSpan.textContent;
            const mensajeGenerado = `Hola! 😊 Te comparto el presupuesto de la torta que me consultaste: *${tituloTorta} - ${precioFinalParaMensaje}*. Está pensado con todo el cuidado y la calidad que me gusta ofrecer en cada trabajo 💛.

Si te gusta la propuesta, quedo atenta para confirmarlo y reservar la fecha 🎂. Y si tenés alguna duda o querés ajustar algo, también estoy para ayudarte.

Gracias por considerarme, me haría mucha ilusión ser parte de un evento tan especial como el tuyo. Ojalá podamos hacerlo realidad ✨

Desde ya,
Dulce Sal — Horneando tus mejores momentos 🍰`;
            
            mensajeFinalTextarea.value = mensajeGenerado;
            resultadoFinalContainer.style.display = 'block';
            resultadoFinalContainer.scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            if (error) {
               console.error("Error en la operación de finalización: ", error);
               alert(`No se pudo completar la operación: ${error}`);
            } else {
               console.log("El usuario canceló la acción.");
            }
        }
    });

    btnCopiar.addEventListener('click', () => {
        navigator.clipboard.writeText(mensajeFinalTextarea.value).then(() => {
            copiadoFeedback.textContent = '¡Copiado al portapapeles!';
            setTimeout(() => { copiadoFeedback.textContent = ''; }, 2000);
        }).catch(err => { console.error('Error al copiar el texto: ', err); alert("No se pudo copiar el texto."); });
    });

    // Listeners para los nuevos inputs de cálculo de precio
    [horasTrabajoInput, costoHoraInput, costosFijosPorcInput, gananciaPorcInput].forEach(input => {
        input.addEventListener('input', calcularPrecioVenta);
    });

    cargarMateriasPrimas().catch(console.error);
}
