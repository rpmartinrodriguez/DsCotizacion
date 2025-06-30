// js/historial.js (Versión con función de borrado)

import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupHistorial(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const historialContainer = document.getElementById('historial-container');

    const q = query(presupuestosGuardadosCollection, orderBy("fecha", "desc"));

    // onSnapshot escucha en tiempo real. Cuando borremos un documento,
    // se volverá a ejecutar y re-dibujará la lista automáticamente.
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            historialContainer.innerHTML = '<p>No hay presupuestos guardados todavía.</p>';
            return;
        }

        historialContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const presupuesto = doc.data();
            const id = doc.id;

            const fecha = presupuesto.fecha.toDate();
            const fechaFormateada = fecha.toLocaleDateString('es-AR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            const card = document.createElement('div');
            card.className = 'historial-card';
            // --- HTML TEMPLATE ACTUALIZADO CON BOTÓN DE BORRAR ---
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
                <div class="historial-card__actions">
                    <button class="btn-ver-detalle" data-target="detalle-${id}">Ver Detalle</button>
                    <button class="btn-borrar-presupuesto" data-id="${id}">🗑️ Borrar</button>
                </div>
            `;
            historialContainer.appendChild(card);
        });
    });

    // --- LISTENER ACTUALIZADO PARA MANEJAR AMBOS BOTONES ---
    historialContainer.addEventListener('click', async (e) => {
        const target = e.target;

        // Lógica para "Ver Detalle"
        if (target.classList.contains('btn-ver-detalle')) {
            const targetId = target.dataset.target;
            const detalleDiv = document.getElementById(targetId);
            if (detalleDiv) {
                const isVisible = detalleDiv.style.display === 'block';
                detalleDiv.style.display = isVisible ? 'none' : 'block';
                target.textContent = isVisible ? 'Ver Detalle' : 'Ocultar Detalle';
            }
        }

        // Lógica para "Borrar"
        if (target.classList.contains('btn-borrar-presupuesto')) {
            const id = target.dataset.id;
            
            // Pedimos confirmación antes de borrar
            if (confirm('¿Estás seguro de que quieres eliminar este presupuesto de forma permanente?')) {
                try {
                    const docRef = doc(db, 'presupuestosGuardados', id);
                    await deleteDoc(docRef);
                    // No es necesario hacer nada más, onSnapshot actualizará la UI automáticamente.
                    console.log("Presupuesto eliminado con éxito.");
                } catch (error) {
                    console.error("Error al eliminar el presupuesto: ", error);
                    alert("No se pudo eliminar el presupuesto.");
                }
            }
        }
    });
}
