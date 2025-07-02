// js/agenda.js
import { 
    getFirestore, collection, onSnapshot, query, where, orderBy 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupAgenda(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const agendaContainer = document.getElementById('agenda-container');

    // Consulta para traer solo las ventas confirmadas con fecha de entrega futura, ordenadas por la más próxima
    const q = query(
        presupuestosGuardadosCollection, 
        where("esVenta", "==", true),
        where("fechaEntrega", ">=", new Date()),
        orderBy("fechaEntrega", "asc")
    );

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            agendaContainer.innerHTML = '<p>No tienes entregas pendientes en la agenda.</p>';
            return;
        }

        agendaContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const venta = doc.data();
            const fecha = venta.fechaEntrega.toDate();
            const opcionesFecha = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            const fechaFormateada = fecha.toLocaleDateString('es-AR', opcionesFecha);

            const card = document.createElement('div');
            card.className = 'agenda-card';
            card.innerHTML = `
                <div class="agenda-fecha">${fechaFormateada}</div>
                <div class="agenda-info">
                    <h3>${venta.tituloTorta}</h3>
                    <p>Cliente: ${venta.nombreCliente}</p>
                </div>
            `;
            agendaContainer.appendChild(card);
        });
    });
}
