// js/historial.js
import { 
    getFirestore, collection, onSnapshot, query, orderBy 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupHistorial(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const historialContainer = document.getElementById('historial-container');

    const q = query(presupuestosGuardadosCollection, orderBy("fecha", "desc"));

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            historialContainer.innerHTML = '<p>No hay presupuestos guardados todavía.</p>';
            return;
        }

        historialContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const presupuesto = doc.data();
            const id = doc.id;

            // Formatear la fecha para que sea legible
            const fecha = presupuesto.fecha.toDate();
            const fechaFormateada = fecha.toLocaleDateString('es-AR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

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
                        $${presupuesto.costoTotal.toFixed(2)}
                    </div>
                </div>
                <div class="historial-card__detalle" id="detalle-${id}" style="display: none;">
                    <h4>Detalle de Ingredientes:</h4>
                    <ul>
                        ${presupuesto.ingredientes.map(ing => `<li>${ing.nombre}: ${ing.cantidad} ${ing.unidad} ($${ing.costo.toFixed(2)})</li>`).join('')}
                    </ul>
                </div>
                <button class="btn-ver-detalle" data-target="detalle-${id}">Ver Detalle</button>
            `;
            historialContainer.appendChild(card);
        });
    });

    // Event listener para los botones "Ver Detalle"
    historialContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-ver-detalle')) {
            const targetId = e.target.dataset.target;
            const detalleDiv = document.getElementById(targetId);
            if (detalleDiv) {
                const isVisible = detalleDiv.style.display === 'block';
                detalleDiv.style.display = isVisible ? 'none' : 'block';
                e.target.textContent = isVisible ? 'Ver Detalle' : 'Ocultar Detalle';
            }
        }
    });
}
