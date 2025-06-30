// js/presupuesto.js (Versión con descuento de stock)

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
    const resultadoFinalContainer = document.getElementById('resultado-final');
    const mensajeFinalTextarea = document.getElementById('mensaje-final');
    const btnCopiar = document.getElementById('btn-copiar');
    const copiadoFeedback = document.getElementById('copiado-feedback');
    const modalOverlay = document.getElementById('custom-modal-overlay');
    const tortaTituloInput = document.getElementById('torta-titulo-input');
    const clienteNombreInput = document.getElementById('cliente-nombre-input');
    const modalBtnConfirmar = document.getElementById('modal-btn-confirmar');
    const modalBtnCancelar = document.getElementById('modal-btn-cancelar');

    let presupuestoActual = [];
    let costoTotalCache = 0;

    const actualizarPresupuesto = () => {
        presupuestoActual = [];
        let costoTotal = 0;
        const todosLosInputs = ingredientesContainer.querySelectorAll('.ingrediente-item');
        
        todosLosInputs.forEach(itemDiv => {
            const checkbox = itemDiv.querySelector('input[type="checkbox"]');
            const cantidadInput = itemDiv.querySelector('input[type="number"]');

            if (checkbox.checked) {
                cantidadInput.disabled = false;
                const cantidad = parseFloat(cantidadInput.value) || 0;
                const precioUnitario = parseFloat(checkbox.dataset.precioUnitario);
                const costo = cantidad * precioUnitario;
                if (cantidad > 0) {
                    presupuestoActual.push({
                        id: checkbox.id, // ID del documento, crucial para descontar stock
                        nombre: checkbox.dataset.nombre,
                        cantidad: cantidad,
                        unidad: checkbox.dataset.unidad,
                        costo: costo,
                    });
                    costoTotal += costo;
                }
            } else {
                cantidadInput.disabled = true;
                cantidadInput.value = '';
            }
        });
        costoTotalCache = costoTotal;
        renderizarResumen(presupuestoActual, costoTotal);
    };

    const renderizarResumen = (presupuesto, total) => {
        tablaPresupuestoBody.innerHTML = '';
        if (presupuesto.length === 0) {
            tablaPresupuestoBody.innerHTML = `<tr><td colspan="3" style="text-align: center;">Selecciona ingredientes para ver el resumen.</td></tr>`;
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

    const cargarMateriasPrimas = async () => {
        const q = query(materiasPrimasCollection, orderBy('nombre'));
        const snapshot = await getDocs(q);
        ingredientesContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const precioPorUnidad = data.precio / data.cantidad;
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('ingrediente-item');
            itemDiv.innerHTML = `<div class="ingrediente-info"><input type="checkbox" id="${doc.id}" data-precio-unitario="${precioPorUnidad}" data-nombre="${data.nombre}" data-unidad="${data.unidad}"><label for="${doc.id}">${data.nombre} (${data.unidad})</label></div><div class="ingrediente-cantidad"><input type="number" min="0" step="any" placeholder="Cant." disabled></div>`;
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
            
            // INICIO DE LA TRANSACCIÓN DE STOCK
            await runTransaction(db, async (transaction) => {
                const stockChecks = presupuestoActual.map(async (ingrediente) => {
                    const ingredienteRef = doc(db, 'materiasPrimas', ingrediente.id);
                    const ingredienteDoc = await transaction.get(ingredienteRef);

                    if (!ingredienteDoc.exists()) {
                        throw `El ingrediente "${ingrediente.nombre}" ya no existe.`;
                    }
                    
                    const stockActual = ingredienteDoc.data().stockActual;
                    if (stockActual < ingrediente.cantidad) {
                        throw `No hay suficiente stock de "${ingrediente.nombre}". Disponible: ${stockActual}, Necesario: ${ingrediente.cantidad}.`;
                    }
                    
                    const nuevoStock = stockActual - ingrediente.cantidad;
                    transaction.update(ingredienteRef, { stockActual: nuevoStock });
                });
                // Esperamos que todas las verificaciones y actualizaciones de la transacción terminen
                await Promise.all(stockChecks);
            });
            // FIN DE LA TRANSACCIÓN DE STOCK

            // Si la transacción fue exitosa, procedemos a guardar el presupuesto
            const presupuestoParaGuardar = {
                tituloTorta,
                nombreCliente,
                costoTotal: costoTotalCache,
                fecha: Timestamp.now(),
                ingredientes: presupuestoActual
            };
            await addDoc(presupuestosGuardadosCollection, presupuestoParaGuardar);
            alert('¡Stock descontado y presupuesto guardado con éxito!');

            // Generar y mostrar el mensaje para compartir
            const precioFinal = costoTotalSpan.textContent;
            const mensajeGenerado = `Hola! 😊 Te comparto el presupuesto de la torta que me consultaste: *${tituloTorta} - ${precioFinal}*. Está pensado con todo el cuidado y la calidad que me gusta ofrecer en cada trabajo 🩷.

Si te gusta la propuesta, quedo atenta para confirmarlo y reservar la fecha 🎂. Y si tenés alguna duda o querés ajustar algo, también estoy para ayudarte.

Gracias por considerarme, me haría mucha ilusión ser parte de un evento tan especial como el tuyo. Ojalá podamos hacerlo realidad ✨

Desde ya,
Dulce Sal — Horneando tus mejores momentos 🍰`;
            
            mensajeFinalTextarea.value = mensajeGenerado;
            resultadoFinalContainer.style.display = 'block';
            resultadoFinalContainer.scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            console.error("Error en la operación de finalización: ", error);
            alert(`No se pudo completar la operación: ${error}`);
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
