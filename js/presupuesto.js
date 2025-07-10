import { 
    getFirestore, collection, getDocs, query, orderBy, addDoc, 
    Timestamp, doc, runTransaction, getDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupPresupuesto(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const recetasCollection = collection(db, 'recetas');
    const movimientosStockCollection = collection(db, 'movimientosStock');

    // --- Referencias al DOM ---
    const ingredientesContainer = document.getElementById('lista-ingredientes');
    const tablaPresupuestoBody = document.querySelector("#tabla-presupuesto tbody");
    const costoTotalSpan = document.getElementById('costo-total');
    const btnFinalizar = document.getElementById('btn-finalizar');
    const datalistClientes = document.getElementById('lista-clientes-existentes');
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
    const resultadoFinalContainer = document.getElementById('resultado-final');
    const mensajeFinalTextarea = document.getElementById('mensaje-final');
    const btnCopiar = document.getElementById('btn-copiar');
    const copiadoFeedback = document.getElementById('copiado-feedback');
    const modalOverlay = document.getElementById('custom-modal-overlay');
    const tortaTituloInput = document.getElementById('torta-titulo-input');
    const clienteNombreInput = document.getElementById('cliente-nombre-input');
    const modalBtnConfirmar = document.getElementById('modal-btn-confirmar');
    const modalBtnCancelar = document.getElementById('modal-btn-cancelar');

    // --- Variables de Estado ---
    let materiasPrimasDisponibles = [];
    let presupuestoActual = [];
    let costoTotalCache = 0;

    // --- FUNCIONES ---

    const cargarClientesExistentes = async () => {
        try {
            const snapshot = await getDocs(query(presupuestosGuardadosCollection));
            const nombresClientes = new Set();
            snapshot.forEach(doc => {
                if (doc.data().nombreCliente) {
                    nombresClientes.add(doc.data().nombreCliente);
                }
            });
            datalistClientes.innerHTML = '';
            nombresClientes.forEach(nombre => {
                const option = document.createElement('option');
                option.value = nombre;
                datalistClientes.appendChild(option);
            });
        } catch (error) {
            console.error("Error al cargar clientes existentes:", error);
        }
    };

    const cargarMateriasPrimas = async () => {
        const q = query(materiasPrimasCollection, orderBy('nombre'));
        const snapshot = await getDocs(q);
        ingredientesContainer.innerHTML = '';
        materiasPrimasDisponibles = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (!data.lotes || !Array.isArray(data.lotes) || data.lotes.length === 0) return;
            materiasPrimasDisponibles.push({ id: doc.id, ...data });
            const stockTotal = data.lotes.reduce((sum, lote) => sum + (lote.stockRestante || 0), 0);
            const itemDiv = document.createElement('div');
            itemDiv.className = 'ingrediente-item';
            itemDiv.innerHTML = `<div class="ingrediente-info"><input type="checkbox" id="${doc.id}"><label for="${doc.id}">${data.nombre} (${data.unidad})</label></div><div class="ingrediente-cantidad"><input type="number" min="0" step="any" placeholder="Cant." title="Stock disponible: ${stockTotal.toLocaleString('es-AR')}" disabled></div>`;
            ingredientesContainer.appendChild(itemDiv);
        });
        if (ingredientesContainer.innerHTML === '') {
            ingredientesContainer.innerHTML = '<p>No hay productos con stock. Registra una nueva compra primero.</p>';
        }
        ingredientesContainer.addEventListener('change', actualizarPresupuesto);
        ingredientesContainer.addEventListener('input', actualizarPresupuesto);
    };

    const cargarRecetaDesdeURL = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const recetaId = urlParams.get('recetaId');
        if (!recetaId) {
            await cargarMateriasPrimas();
            return;
        }
        ingredientesContainer.innerHTML = '<p>Cargando receta seleccionada...</p>';
        const recetaRef = doc(db, 'recetas', recetaId);
        const recetaSnap = await getDoc(recetaRef);
        if (recetaSnap.exists()) {
            const receta = recetaSnap.data();
            tortaTituloInput.value = receta.nombreTorta;
            await cargarMateriasPrimas();
            receta.ingredientes.forEach(ingredienteReceta => {
                const checkbox = document.getElementById(ingredienteReceta.idMateriaPrima);
                if (checkbox) {
                    checkbox.checked = true;
                    const cantidadInput = checkbox.closest('.ingrediente-item').querySelector('input[type="number"]');
                    if (cantidadInput) cantidadInput.value = ingredienteReceta.cantidad;
                }
            });
            actualizarPresupuesto();
        } else {
            console.error("No se encontró la receta con el ID:", recetaId);
            ingredientesContainer.innerHTML = '<p style="color: red;">Error: No se pudo encontrar la receta seleccionada.</p>';
            await cargarMateriasPrimas();
        }
    };
    
    const calcularCostoFIFO = (materiaPrima, cantidadRequerida) => {
        let costoAcumulado = 0;
        let desgloseLotes = [];
        let cantidadRestante = cantidadRequerida;
        const lotesOrdenados = [...materiaPrima.lotes].sort((a, b) => (a.fechaCompra?.seconds || 0) - (b.fechaCompra?.seconds || 0));

        for (const lote of lotesOrdenados) {
            if (cantidadRestante <= 0) break;
            const cantidadAUsar = Math.min(lote.stockRestante, cantidadRestante);
            costoAcumulado += cantidadAUsar * lote.costoUnitario;
            desgloseLotes.push({ cantidadUsada: cantidadAUsar, costoUnitario: lote.costoUnitario, fechaLote: lote.fechaCompra });
            cantidadRestante -= cantidadAUsar;
        }

        if (cantidadRestante > 0 && lotesOrdenados.length > 0) {
            const ultimoLote = lotesOrdenados[lotesOrdenados.length - 1];
            const costoProyectado = cantidadRestante * ultimoLote.costoUnitario;
            costoAcumulado += costoProyectado;
            desgloseLotes.push({ cantidadUsada: cantidadRestante, costoUnitario: ultimoLote.costoUnitario, fechaLote: null, esProyectado: true });
        }
        
        return { costo: costoAcumulado, desglose: desgloseLotes };
    };

    const actualizarPresupuesto = () => {
        presupuestoActual = [];
        let costoTotal = 0;
        const itemsSeleccionados = Array.from(ingredientesContainer.querySelectorAll('input[type="checkbox"]:checked'));
        itemsSeleccionados.forEach(checkbox => {
            const cantidadInput = checkbox.closest('.ingrediente-item').querySelector('input[type="number"]');
            cantidadInput.disabled = false;
            const cantidadRequerida = parseFloat(cantidadInput.value) || 0;
            if (cantidadRequerida > 0) {
                const materiaPrima = materiasPrimasDisponibles.find(mp => mp.id === checkbox.id);
                if (materiaPrima) {
                    const { costo: costoIngrediente, desglose: lotesUtilizados } = calcularCostoFIFO(materiaPrima, cantidadRequerida);
                    presupuestoActual.push({ id: checkbox.id, nombre: materiaPrima.nombre, cantidadTotal: cantidadRequerida, unidad: materiaPrima.unidad, costoTotal: costoIngrediente, lotesUtilizados: lotesUtilizados });
                    costoTotal += costoIngrediente;
                }
            }
        });
        Array.from(ingredientesContainer.querySelectorAll('input[type="checkbox"]:not(:checked)')).forEach(checkbox => {
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
                const materiaPrimaOriginal = materiasPrimasDisponibles.find(mp => mp.id === item.id);
                const stockTotal = materiaPrimaOriginal.lotes.reduce((sum, lote) => sum + lote.stockRestante, 0);
                const advertenciaIcono = item.cantidadTotal > stockTotal ? '<span class="warning-icon" title="Stock insuficiente, el costo es una proyección.">⚠️</span>' : '';
                fila.innerHTML = `<td data-label="Ingrediente">${item.nombre} ${advertenciaIcono}</td><td data-label="Cantidad">${item.cantidadTotal.toLocaleString('es-AR')} ${item.unidad}</td><td data-label="Costo">$${item.costoTotal.toFixed(2)}</td>`;
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

    const showTitlePrompt = () => {
        cargarClientesExistentes();
        return new Promise((resolve, reject) => {
            modalOverlay.classList.add('visible');
            tortaTituloInput.focus();
            if(!tortaTituloInput.value) tortaTituloInput.value = '';
            clienteNombreInput.value = '';
            const closeModal = () => { modalOverlay.classList.remove('visible'); };
            modalBtnConfirmar.onclick = () => {
                const titulo = tortaTituloInput.value.trim();
                const cliente = clienteNombreInput.value.trim();
                if (titulo === '' || cliente === '') { alert('Por favor, completa todos los campos.'); return; }
                resolve({ tituloTorta: titulo, nombreCliente: cliente });
                closeModal();
            };
            modalBtnCancelar.onclick = () => { reject(); closeModal(); };
        });
    };

    btnFinalizar.addEventListener('click', async () => {
        try {
            const { tituloTorta, nombreCliente } = await showTitlePrompt();
            
            // --- LÓGICA DE TRANSACCIÓN CORREGIDA ---
            const datosParaActualizar = [];

            // 1. FASE DE LECTURA Y LÓGICA (fuera de la transacción de escritura)
            for (const ingrediente of presupuestoActual) {
                const materiaPrimaOriginal = materiasPrimasDisponibles.find(mp => mp.id === ingrediente.id);
                if (!materiaPrimaOriginal) throw new Error(`Materia prima no encontrada: ${ingrediente.nombre}`);

                let data = JSON.parse(JSON.stringify(materiaPrimaOriginal)); // Copia segura
                let cantidadADescontar = ingrediente.cantidadTotal;
                let lotesActualizados = data.lotes.sort((a, b) => (a.fechaCompra.seconds || 0) - (b.fechaCompra.seconds || 0));
                const stockTotal = lotesActualizados.reduce((sum, lote) => sum + lote.stockRestante, 0);

                if (cantidadADescontar > stockTotal) {
                    if (!confirm(`⚠️ Stock insuficiente para "${ingrediente.nombre}". Se usará el stock disponible (${stockTotal} ${ingrediente.unidad}) y se registrará la venta. ¿Continuar?`)) {
                        throw new Error("Operación cancelada por el usuario.");
                    }
                    cantidadADescontar = stockTotal;
                }

                let restante = cantidadADescontar;
                for (const lote of lotesActualizados) {
                    if (restante <= 0) break;
                    const descontar = Math.min(lote.stockRestante, restante);
                    lote.stockRestante -= descontar;
                    restante -= descontar;
                }
                lotesActualizados = lotesActualizados.filter(lote => lote.stockRestante > 0);
                
                datosParaActualizar.push({ id: ingrediente.id, lotes: lotesActualizados });
            }

            // 2. FASE DE ESCRITURA (Transacción + Batch)
            const batch = writeBatch(db);
            
            // Escribimos los cambios en el stock
            datosParaActualizar.forEach(d => {
                const docRef = doc(db, 'materiasPrimas', d.id);
                batch.update(docRef, { lotes: d.lotes });
            });

            // Escribimos el nuevo presupuesto
            const presupuestoParaGuardar = { tituloTorta, nombreCliente, fecha: Timestamp.now(), costoMateriales: costoTotalCache, horasTrabajo: parseFloat(horasTrabajoInput.value) || 0, costoHora: parseFloat(costoHoraInput.value) || 0, porcentajeCostosFijos: parseFloat(costosFijosPorcInput.value) || 0, porcentajeGanancia: parseFloat(gananciaPorcInput.value) || 0, precioVenta: parseFloat(precioVentaSugeridoSpan.textContent.replace('$', '')), ingredientes: presupuestoActual };
            const nuevoPresupuestoRef = doc(collection(db, 'presupuestosGuardados'));
            batch.set(nuevoPresupuestoRef, presupuestoParaGuardar);

            // Escribimos los movimientos de stock
            presupuestoActual.forEach(ingrediente => {
                const nuevoMovimientoRef = doc(collection(db, 'movimientosStock'));
                batch.set(nuevoMovimientoRef, { materiaPrimaId: ingrediente.id, materiaPrimaNombre: ingrediente.nombre, tipo: 'Venta', cantidad: -ingrediente.cantidadTotal, fecha: new Date(), descripcion: `Uso para "${tituloTorta}"` });
            });
            
            // Ejecutamos todas las escrituras a la vez
            await batch.commit();

            alert('¡Stock descontado, movimientos registrados y presupuesto guardado!');
            
            const precioFinalParaMensaje = precioVentaSugeridoSpan.textContent;
            const mensajeGenerado = `Hola! 😊 Te comparto el presupuesto de la torta que me consultaste: *${tituloTorta} - ${precioFinalParaMensaje}*.\n\nSi te gusta la propuesta, quedo atenta para confirmarlo y reservar la fecha 🎂. Y si tenés alguna duda o querés ajustar algo, también estoy para ayudarte.\n\nGracias por considerarme, me haría mucha ilusión ser parte de un evento tan especial como el tuyo. Ojalá podamos hacerlo realidad ✨\n\nDesde ya,\nDulce Sal — Horneando tus mejores momentos 🍰`;
            
            mensajeFinalTextarea.value = mensajeGenerado;
            resultadoFinalContainer.style.display = 'block';
            resultadoFinalContainer.scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            if (error) {
               console.error("Error en la operación de finalización: ", error);
               alert(`No se pudo completar la operación: ${error.message}`);
            } else {
               console.log("El usuario canceló la acción.");
            }
        }
    });

    btnCopiar.addEventListener('click', () => {
        navigator.clipboard.writeText(mensajeFinalTextarea.value).then(() => {
            copiadoFeedback.textContent = '¡Copiado!';
            setTimeout(() => { copiadoFeedback.textContent = ''; }, 2000);
        }).catch(err => console.error('Error al copiar: ', err));
    });

    [horasTrabajoInput, costoHoraInput, costosFijosPorcInput, gananciaPorcInput].forEach(input => {
        input.addEventListener('input', calcularPrecioVenta);
    });

    cargarRecetaDesdeURL();
}
