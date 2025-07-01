// js/presupuesto.js (Versión final con mensaje restaurado)

import { 
    getFirestore, collection, getDocs, query, orderBy, addDoc, 
    Timestamp, doc, runTransaction 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupPresupuesto(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');

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
                    <input type="number" min="0" step="any" placeholder="Cant." title="Stock disponible: ${stockTotal}" disabled>
                </div>
            `;
            ingredientesContainer.appendChild(itemDiv);
        });

        ingredientesContainer.addEventListener('change', actualizarPresupuesto);
        ingredientesContainer.addEventListener('input', actualizarPresupuesto);
    };

    const calcularCostoFIFO = (materiaPrima, cantidadRequerida) => {
        let costoAcumulado = 0;
        let cantidadRestante = cantidadRequerida;
        const lotesOrdenados = materiaPrima.lotes.sort((a, b) => a.fechaCompra.toMillis() - b.fechaCompra.toMillis());
        for (const lote of lotesOrdenados) {
            if (cantidadRestante <= 0) break;
            const cantidadAUsar = Math.min(lote.stockRestante, cantidadRestante);
            costoAcumulado += cantidadAUsar * lote.costoUnitario;
            cantidadRestante -= cantidadAUsar;
        }
        return costoAcumulado;
    };

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
                const costoIngrediente = calcularCostoFIFO(materiaPrima, cantidadRequerida);
                presupuestoActual.push({
                    id: checkbox.id,
                    nombre: materiaPrima.nombre,
                    cantidad: cantidadRequerida,
                    unidad: materiaPrima.unidad,
                    costo: costoIngrediente,
                });
                costoTotal += costoIngrediente;
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
                fila.innerHTML = `<td>${item.nombre}</td><td>${item.cantidad.toLocaleString('es-AR')} ${item.unidad}</td><td>$${item.costo.toFixed(2)}</td>`;
                tablaPresupuestoBody.appendChild(fila);
            });
        }
        costoTotalSpan.textContent = `$${total.toFixed(2)}`;
        btnFinalizar.disabled = total <= 0;
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
                    let cantidadADescontar = ingrediente.cantidad;
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
                    transaction.update(ingredienteRef, {
