// js/presupuesto.js

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
    
    let materiasPrimasDisponibles = [];

    // --- FUNCIÓN PRINCIPAL DE CÁLCULO ---
    const actualizarPresupuesto = () => {
        let presupuestoActual = [];
        let costoTotal = 0;

        // Recorremos todos los inputs de la lista de ingredientes
        const todosLosInputs = ingredientesContainer.querySelectorAll('.ingrediente-item');

        todosLosInputs.forEach(itemDiv => {
            const checkbox = itemDiv.querySelector('input[type="checkbox"]');
            const cantidadInput = itemDiv.querySelector('input[type="number"]');

            if (checkbox.checked) {
                cantidadInput.disabled = false; // Habilitar input de cantidad

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
                cantidadInput.disabled = true; // Deshabilitar si no está chequeado
                cantidadInput.value = '';
            }
        });

        renderizarResumen(presupuestoActual, costoTotal);
    };
    
    // --- FUNCIÓN PARA RENDERIZAR EL RESUMEN ---
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
    };


    // --- CARGA INICIAL DE DATOS ---
    const cargarMateriasPrimas = async () => {
        const q = query(materiasPrimasCollection, orderBy('nombre'));
        const snapshot = await getDocs(q);
        
        ingredientesContainer.innerHTML = ''; // Limpiar el "cargando..."

        snapshot.forEach(doc => {
            const data = doc.data();
            const precioPorUnidad = data.precio / data.cantidad;

            const itemDiv = document.createElement('div');
            itemDiv.classList.add('ingrediente-item');
            itemDiv.innerHTML = `
                <div class="ingrediente-info">
                    <input type="checkbox" 
                           id="${doc.id}" 
                           data-precio-unitario="${precioPorUnidad}"
                           data-nombre="${data.nombre}"
                           data-unidad="${data.unidad}">
                    <label for="${doc.id}">${data.nombre} (${data.unidad})</label>
                </div>
                <div class="ingrediente-cantidad">
                    <input type="number" min="0" step="any" placeholder="Cant." disabled>
                </div>
            `;
            ingredientesContainer.appendChild(itemDiv);
        });

        // Añadimos un único listener al contenedor para manejar todos los cambios
        ingredientesContainer.addEventListener('change', actualizarPresupuesto);
        ingredientesContainer.addEventListener('input', actualizarPresupuesto);
    };

    cargarMateriasPrimas().catch(console.error);
}
