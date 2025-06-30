// js/presupuesto.js (Versión final con modal personalizado)

import { 
    getFirestore, collection, getDocs, query, orderBy 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupPresupuesto(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');

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
    const modalBtnConfirmar = document.getElementById('modal-btn-confirmar');
    const modalBtnCancelar = document.getElementById('modal-btn-cancelar');

    const actualizarPresupuesto = () => {
        let presupuestoActual = [];
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
        renderizarResumen(presupuestoActual, costoTotal);
    };

    const renderizarResumen = (presupuesto, total) => {
        tablaPresupuestoBody.innerHTML = '';
        if (presupuesto.length === 0) {
            tablaPresupuestoBody.innerHTML = `<tr><td colspan="3" style="text-align: center;">Selecciona ingredientes para ver el resumen.</td></tr>`;
        } else {
            presupuesto.forEach(item => {
                const fila = document.createElement('tr');
                fila.innerHTML = `
                    <td>${item.nombre}</td>
                    <td>${item.cantidad.toLocaleString('es-AR')} ${item.unidad}</td>
                    <td>$${item.costo.toFixed(2)}</td>
                `;
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
            itemDiv.innerHTML = `
                <div class="ingrediente-info">
                    <input type="checkbox" id="${doc.id}" data-precio-unitario="${precioPorUnidad}" data-nombre="${data.nombre}" data-unidad="${data.unidad}">
                    <label for="${doc.id}">${data.nombre} (${data.unidad})</label>
                </div>
                <div class="ingrediente-cantidad">
                    <input type="number" min="0" step="any" placeholder="Cant." disabled>
                </div>
            `;
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

            const closeModal = () => {
                modalOverlay.classList.remove('visible');
                modalBtnConfirmar.onclick = null;
                modalBtnCancelar.onclick = null;
                modalOverlay.onclick = null;
                document.onkeydown = null;
            };

            modalBtnConfirmar.onclick = () => {
                if (tortaTituloInput.value.trim() === '') {
                    alert('Por favor, ingresa un nombre para la torta.');
                    return;
                }
                resolve(tortaTituloInput.value.trim());
                closeModal();
            };

            modalBtnCancelar.onclick = () => {
                reject();
                closeModal();
            };
            
            modalOverlay.onclick = (e) => {
                if (e.target === modalOverlay) {
                    reject();
                    closeModal();
                }
            };

            document.onkeydown = (e) => {
                if (e.key === 'Escape') {
                    reject();
                    closeModal();
                }
            };
        });
    };

    btnFinalizar.addEventListener('click', async () => {
        try {
            const tituloTorta = await showTitlePrompt();
            const precioFinal = costoTotalSpan.textContent;
            const detalle = `${tituloTorta}`;

            const mensajeGenerado = `Hola! 😊 Te comparto el presupuesto de la torta que me consultaste: *${detalle} - ${precioFinal}*. Está pensado con todo el cuidado y la calidad que me gusta ofrecer en cada trabajo 💛.

Si te gusta la propuesta, quedo atenta para confirmarlo y reservar la fecha 🎂. Y si tenés alguna duda o querés ajustar algo, también estoy para ayudarte.

Gracias por considerarme, me haría mucha ilusión ser parte de un evento tan especial como el tuyo. Ojalá podamos hacerlo realidad ✨

Desde ya,
Dulce Sal — Horneando tus mejores momentos 🍰`;
            
            mensajeFinalTextarea.value = mensajeGenerado;
            resultadoFinalContainer.style.display = 'block';
            resultadoFinalContainer.scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            console.log("El usuario canceló la acción.");
        }
    });

    btnCopiar.addEventListener('click', () => {
        navigator.clipboard.writeText(mensajeFinalTextarea.value).then(() => {
            copiadoFeedback.textContent = '¡Copiado al portapapeles!';
            setTimeout(() => {
                copiadoFeedback.textContent = '';
            }, 2000);
        }).catch(err => {
            console.error('Error al copiar el texto: ', err);
            alert("No se pudo copiar el texto.");
        });
    });

    cargarMateriasPrimas().catch(console.error);
}
