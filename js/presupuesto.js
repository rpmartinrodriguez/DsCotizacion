// js/presupuesto.js (Versión que guarda el desglose de lotes)
import { 
    getFirestore, collection, getDocs, query, orderBy, addDoc, 
    Timestamp, doc, runTransaction 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupPresupuesto(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    // ... (referencias al DOM se mantienen igual)
    const ingredientesContainer = document.getElementById('lista-ingredientes');
    const tablaPresupuestoBody = document.querySelector("#tabla-presupuesto tbody");
    const costoTotalSpan = document.getElementById('costo-total');
    const btnFinalizar = document.getElementById('btn-finalizar');
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

    // --- LÓGICA DE CÁLCULO FIFO (ACTUALIZADA) ---
    // Ahora devuelve no solo el costo, sino también el desglose de lotes.
    const calcularCostoFIFO = (materiaPrima, cantidadRequerida) => {
        let costoAcumulado = 0;
        let cantidadRestante = cantidadRequerida;
        let desgloseLotes = []; // Aquí guardaremos el detalle

        const lotesOrdenados = materiaPrima.lotes.sort((a, b) => a.fechaCompra.toMillis() - b.fechaCompra.toMillis());

        for (const lote of lotesOrdenados) {
            if (cantidadRestante <= 0) break;

            const cantidadAUsar = Math.min(lote.stockRestante, cantidadRestante);
            costoAcumulado += cantidadAUsar * lote.costoUnitario;
            
            // Guardamos el detalle de este paso
            desgloseLotes.push({
                cantidadUsada: cantidadAUsar,
                costoUnitario: lote.costoUnitario,
                fechaLote: lote.fechaCompra
            });

            cantidadRestante -= cantidadAUsar;
        }
        
        // Devolvemos un objeto con toda la información
        return { costo: costoAcumulado, desglose: desgloseLotes };
    };

    // --- FUNCIÓN PRINCIPAL DE ACTUALIZACIÓN (ACTUALIZADA) ---
    const actualizarPresupuesto = async () => {
        presupuestoActual = [];
        let costoTotal = 0;
        
        const itemsSeleccionados = Array.from(ingredientesContainer.querySelectorAll('input[type="checkbox"]:checked'));

        for (const checkbox of itemsSeleccionados) {
            const cantidadInput = checkbox.closest('.ingrediente-item').querySelector('input[type="number"]');
            cantidadInput.disabled = false;
            const cantidadRequerida = parseFloat(cantidadInput.value) || 0;

            if (cantidadRequerida > 0) {
                const materiaPrima = materiasPrimasDisponibles.find(mp => mp.id === checkbox.id);
                
                const stockTotal = materiaPrima.lotes.reduce((sum, lote) => sum + lote.stockRestante, 0);
                if (stockTotal < cantidadRequerida) {
                    console.warn(`Stock insuficiente para ${materiaPrima.nombre}`);
                }

                // Obtenemos el costo y el desglose del cálculo FIFO
                const { costo: costoIngrediente, desglose: lotesUtilizados } = calcularCostoFIFO(materiaPrima, cantidadRequerida);

                presupuestoActual.push({
                    id: checkbox.id,
                    nombre: materiaPrima.nombre,
                    cantidadTotal: cantidadRequerida, // Renombramos para claridad
                    unidad: materiaPrima.unidad,
                    costoTotal: costoIngrediente, // Renombramos para claridad
                    lotesUtilizados: lotesUtilizados // ¡Guardamos el desglose!
                });
                costoTotal += costoIngrediente;
            }
        }
        
        // (El resto de la función se mantiene igual)
        const itemsNoSeleccionados = Array.from(ingredientesContainer.querySelectorAll('input[type="checkbox"]:not(:checked)'));
        itemsNoSeleccionados.forEach(checkbox => {
            const cantidadInput = checkbox.closest('.ingrediente-item').querySelector('input[type="number"]');
            cantidadInput.disabled = true;
            cantidadInput.value = '';
        });
        costoTotalCache = costoTotal;
        renderizarResumen(presupuestoActual, costoTotal);
    };

    // --- RENDERIZAR RESUMEN (ACTUALIZADO) ---
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
    };
    
    // El resto del archivo (cargarMateriasPrimas, showTitlePrompt, btnFinalizar, etc.) se mantiene igual.
    // La lógica de guardado ya es correcta porque 'presupuestoActual' ahora contiene toda la información detallada.
    // ... (pega aquí el resto del código de la respuesta anterior para estas funciones) ...
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
            itemDiv.innerHTML = `<div class="ingrediente-info"><input type="checkbox" id="${doc.id}"><label for="${doc.id}">${data.nombre} (${data.unidad})</label></div><div class="ingrediente-cantidad"><input type="number" min="0" step="any" placeholder="Cant." title="Stock disponible: ${stockTotal}" disabled></div>`;
            ingredientesContainer.appendChild(itemDiv);
        });
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
                    let cantidadADescontar = ingrediente.cantidadTotal; // Usamos la cantidad total
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
                tituloTorta, nombreCliente, costoTotal: costoTotalCache,
                fecha: Timestamp.now(), ingredientes: presupuestoActual // presupuestoActual ya tiene el desglose
            };
            await addDoc(presupuestosGuardadosCollection, presupuestoParaGuardar);
            alert('¡Stock descontado y presupuesto guardado con éxito!');
            const precioFinal = costoTotalSpan.textContent;
            const mensajeGenerado = `Hola! 😊 Te comparto el presupuesto de la torta que me consultaste: *${tituloTorta} - ${precioFinal}*. Está pensado con todo el cuidado y la calidad que me gusta ofrecer en cada trabajo 💛.

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
    cargarMateriasPrimas().catch(console.error);
}
