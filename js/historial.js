// Reemplaza el contenido de js/historial.js
import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupHistorial(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const historialContainer = document.getElementById('historial-container');
    const buscadorInput = document.getElementById('buscador-historial');

    let todoElHistorial = []; // Array para guardar todos los presupuestos

    // --- Nueva función para renderizar el historial ---
    const renderizarHistorial = (datos) => {
        if (datos.length === 0) {
            historialContainer.innerHTML = '<p>No se encontraron presupuestos que coincidan con la búsqueda.</p>';
            return;
        }

        historialContainer.innerHTML = '';
        datos.forEach(presupuestoConId => {
            const presupuesto = presupuestoConId.data;
            const id = presupuestoConId.id;

            const fecha = presupuesto.fecha.toDate();
            const fechaFormateada = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            
            // ... (el resto de la lógica para generar el HTML del detalle no cambia)
            const detalleIngredientesHtml = presupuesto.ingredientes.map(ing => { /* ... */ }).join('');
            let detalleCostosHtml = '';
            if (presupuesto.hasOwnProperty('precioVenta')) { /* ... */ }

            const card = document.createElement('div');
            card.className = 'historial-card';
            card.innerHTML = `
                <div class="historial-card__header">
                    <div class="historial-card__info">
                        <h3>${presupuesto.tituloTorta}</h3>
                        <p><strong>Cliente:</strong> ${presupuesto.nombreCliente}</p>
                        <p class="fecha">${fechaFormateada} hs</p>
                    </div>
                    <div class="historial-card__total">
                        ${presupuesto.hasOwnProperty('precioVenta') ? `$${presupuesto.precioVenta.toFixed(2)}` : `$${presupuesto.costoTotal.toFixed(2)}`}
                    </div>
                </div>
                <div class="historial-card__detalle" id="detalle-${id}" style="display: none;">
                    </div>
                <div class="historial-card__actions">
                    <button class="btn-ver-detalle" data-target="detalle-${id}">Ver Detalle</button>
                    <button class="btn-borrar-presupuesto" data-id="${id}">🗑️ Borrar</button>
                </div>
            `;
            // Llenamos los detalles que omitimos arriba para no duplicar código
            const detalleContainer = card.querySelector('.historial-card__detalle');
            detalleContainer.innerHTML = `${detalleCostosHtml}<h4>Ingredientes Utilizados:</h4><ul>${detalleIngredientesHtml}</ul>`;

            historialContainer.appendChild(card);
        });
    };
    
    // onSnapshot ahora guarda los datos y llama a renderizar
    const q = query(presupuestosGuardadosCollection, orderBy("fecha", "desc"));
    onSnapshot(q, (snapshot) => {
        todoElHistorial = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        
        const terminoBusqueda = buscadorInput.value.toLowerCase();
        const datosFiltrados = todoElHistorial.filter(item => {
            const data = item.data;
            return data.tituloTorta.toLowerCase().includes(terminoBusqueda) || 
                   data.nombreCliente.toLowerCase().includes(terminoBusqueda);
        });
        renderizarHistorial(datosFiltrados);
    });

    // Listener para el campo de búsqueda
    buscadorInput.addEventListener('input', (e) => {
        const terminoBusqueda = e.target.value.toLowerCase();
        const datosFiltrados = todoElHistorial.filter(item => {
            const data = item.data;
            return data.tituloTorta.toLowerCase().includes(terminoBusqueda) || 
                   data.nombreCliente.toLowerCase().includes(terminoBusqueda);
        });
        renderizarHistorial(datosFiltrados);
    });

    // La lógica para borrar y ver detalle no cambia
    historialContainer.addEventListener('click', async (e) => {
        const target = e.target;
        if (target.classList.contains('btn-ver-detalle')) {
            const targetId = target.dataset.target;
            const detalleDiv = document.getElementById(targetId);
            if (detalleDiv) {
                const isVisible = detalleDiv.style.display === 'block';
                detalleDiv.style.display = isVisible ? 'none' : 'block';
                target.textContent = isVisible ? 'Ver Detalle' : 'Ocultar Detalle';
            }
        }
        if (target.classList.contains('btn-borrar-presupuesto')) {
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
}
