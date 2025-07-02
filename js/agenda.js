import { 
    getFirestore, collection, onSnapshot, query, where, orderBy 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupAgenda(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const agendaContainer = document.getElementById('agenda-container');

    const q = query(
        presupuestosGuardadosCollection, 
        where("esVenta", "==", true),
        where("fechaEntrega", ">=", new Date()),
        orderBy("fechaEntrega", "asc")
    );

    onSnapshot(q, 
        (snapshot) => {
            if (snapshot.empty) {
                agendaContainer.innerHTML = '<p>No tienes entregas pendientes en la agenda.</p>';
                return;
            }

            agendaContainer.innerHTML = '';
            snapshot.forEach(doc => {
                const venta = doc.data();
                const fecha = venta.fechaEntrega.toDate();
                const opcionesFecha = { weekday: 'long', day: 'numeric', month: 'long' };
                const fechaFormateada = fecha.toLocaleDateString('es-AR', opcionesFecha);

                const card = document.createElement('div');
                card.className = 'agenda-card';
                card.innerHTML = `
                    <div class="agenda-fecha">
                        <span>${fecha.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase()}</span>
                        <strong>${fecha.getDate()}</strong>
                    </div>
                    <div class="agenda-info">
                        <h3>${venta.tituloTorta}</h3>
                        <p>Cliente: ${venta.nombreCliente}</p>
                    </div>
                    <div class="agenda-fecha-completa">
                        ${fechaFormateada}
                    </div>
                `;
                agendaContainer.appendChild(card);
            });
        },
        (error) => {
            console.error("Error al obtener datos de la agenda: ", error);
            agendaContainer.innerHTML = `<p style="color: var(--danger-color);">Error al cargar la agenda. Revisa la consola para más detalles (probablemente necesites crear un índice en Firebase).</p>`;
        }
    );
}
