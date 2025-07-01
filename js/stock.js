// Reemplaza el contenido de js/stock.js
import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    runTransaction
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupStock(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const tablaStockBody = document.querySelector("#tabla-stock tbody");
    const buscadorInput = document.getElementById('buscador-stock'); // Referencia al buscador

    let todoElStock = []; // Array para guardar todos los datos de Firebase

    // --- Nueva función para renderizar la tabla ---
    // Ahora recibe los datos a mostrar como argumento.
    const renderizarTabla = (datos) => {
        tablaStockBody.innerHTML = '';
        if (datos.length === 0) {
            tablaStockBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No se encontraron productos.</td></tr>';
            return;
        }
        datos.forEach(itemConId => {
            const item = itemConId.data;
            const id = itemConId.id;
            
            const stockTotal = item.lotes.reduce((sum, lote) => sum + lote.stockRestante, 0);

            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>${item.nombre}</td>
                <td>${stockTotal.toLocaleString('es-AR')} ${item.unidad}</td>
                <td class="action-buttons stock-actions">
                    <a href="index.html" class="btn-stock-link add" title="Registrar Nueva Compra">+ Comprar</a>
                    <button class="btn-stock subtract" data-id="${id}" title="Dar de baja stock">- Bajar</button>
                </td>
            `;
            tablaStockBody.appendChild(fila);
        });
    };
    
    // --- onSnapshot ahora guarda los datos y llama a renderizar ---
    const q = query(materiasPrimasCollection, orderBy("nombre"));
    onSnapshot(q, (snapshot) => {
        todoElStock = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        
        // Aplicamos el filtro actual cada vez que los datos cambian
        const terminoBusqueda = buscadorInput.value.toLowerCase();
        const datosFiltrados = todoElStock.filter(item => {
            return item.data.nombre.toLowerCase().includes(terminoBusqueda);
        });
        renderizarTabla(datosFiltrados);
    });

    // --- Listener para el campo de búsqueda ---
    buscadorInput.addEventListener('input', (e) => {
        const terminoBusqueda = e.target.value.toLowerCase();
        const datosFiltrados = todoElStock.filter(item => {
            return item.data.nombre.toLowerCase().includes(terminoBusqueda);
        });
        renderizarTabla(datosFiltrados);
    });

    // La lógica para bajar stock no cambia
    tablaStockBody.addEventListener('click', async (e) => {
        if (!e.target.classList.contains('subtract')) return;
        const id = e.target.dataset.id;
        const amountStr = prompt("¿Qué cantidad de stock deseas dar de baja? (Por ej: por rotura, vencimiento, etc.)");

        if (amountStr) {
            const cantidadADescontar = parseFloat(amountStr);
            if (isNaN(cantidadADescontar) || cantidadADescontar <= 0) {
                alert("Por favor, ingresa un número válido y positivo.");
                return;
            }
            try {
                await runTransaction(db, async (transaction) => {
                    const docRef = doc(db, 'materiasPrimas', id);
                    const ingredienteDoc = await transaction.get(docRef);
                    if (!ingredienteDoc.exists()) throw "Este producto ya no existe.";
                    let data = ingredienteDoc.data();
                    let lotesActualizados = data.lotes.sort((a, b) => a.fechaCompra.toMillis() - b.fechaCompra.toMillis());
                    const stockTotal = lotesActualizados.reduce((sum, lote) => sum + lote.stockRestante, 0);
                    if (stockTotal < cantidadADescontar) {
                        throw `No hay suficiente stock para dar de baja. Stock actual: ${stockTotal}.`;
                    }
                    let cantidadRestanteADescontar = cantidadADescontar;
                    for (const lote of lotesActualizados) {
                        if (cantidadRestanteADescontar <= 0) break;
                        const descontarDeEsteLote = Math.min(lote.stockRestante, cantidadRestanteADescontar);
                        lote.stockRestante -= descontarDeEsteLote;
                        cantidadRestanteADescontar -= descontarDeEsteLote;
                    }
                    lotesActualizados = lotesActualizados.filter(lote => lote.stockRestante > 0);
                    transaction.update(docRef, { lotes: lotesActualizados });
                });
                alert("Stock actualizado con éxito.");
            } catch (error) {
                console.error("Error al dar de baja el stock: ", error);
                alert(`No se pudo actualizar el stock: ${error}`);
            }
        }
    });
}
