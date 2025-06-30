// js/stock.js
import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    updateDoc, increment 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupStock(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const tablaStockBody = document.querySelector("#tabla-stock tbody");

    const q = query(materiasPrimasCollection, orderBy("nombre"));

    onSnapshot(q, (snapshot) => {
        tablaStockBody.innerHTML = '';
        if (snapshot.empty) {
            tablaStockBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No hay materias primas.</td></tr>';
            return;
        }
        snapshot.forEach(doc => {
            const item = doc.data();
            const id = doc.id;
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>${item.nombre}</td>
                <td>${item.stockActual.toLocaleString('es-AR')} ${item.unidad}</td>
                <td class="action-buttons stock-actions">
                    <button class="btn-stock add" data-id="${id}">+</button>
                    <button class="btn-stock subtract" data-id="${id}">-</button>
                </td>
            `;
            tablaStockBody.appendChild(fila);
        });
    });

    tablaStockBody.addEventListener('click', async (e) => {
        if (!e.target.classList.contains('btn-stock')) return;

        const id = e.target.dataset.id;
        const action = e.target.classList.contains('add') ? 'agregar' : 'restar';
        const amountStr = prompt(`¿Qué cantidad deseas ${action}?`);

        if (amountStr) {
            const amount = parseFloat(amountStr);
            if (!isNaN(amount) && amount > 0) {
                const docRef = doc(db, 'materiasPrimas', id);
                const updateAmount = action === 'agregar' ? amount : -amount;
                try {
                    // Usamos 'increment' de Firebase para evitar problemas de concurrencia
                    await updateDoc(docRef, {
                        stockActual: increment(updateAmount)
                    });
                } catch (error) {
                    console.error("Error al actualizar stock: ", error);
                    alert("No se pudo actualizar el stock.");
                }
            } else {
                alert("Por favor, ingresa un número válido y positivo.");
            }
        }
    });
}
