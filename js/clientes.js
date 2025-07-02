// js/clientes.js (Nueva lógica de resumen automático)
import { 
    getFirestore, collection, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupClientes(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const container = document.getElementById('resumen-clientes-container');
    const buscadorInput = document.getElementById('buscador-clientes');

    let todosLosClientesAgrupados = {}; // Objeto para guardar los datos

    // Función para renderizar las tarjetas de resumen
    const renderizarResumen = (clientes) => {
        container.innerHTML = '';
        if (Object.keys(clientes).length === 0) {
            container.innerHTML = '<p>No se encontraron clientes en el historial de presupuestos.</p>';
            return;
        }

        // Ordenamos los clientes alfabéticamente por nombre
        const clientesOrdenados = Object.keys(clientes).sort();

        for (const nombreCliente of clientesOrdenados) {
            const data = clientes[nombreCliente];
            const card = document.createElement('div');
            card.className = 'cliente-resumen-card';
            card.innerHTML = `
                <h3>${nombreCliente}</h3>
                <div class="cliente-resumen-stats">
                    <div class="stat">
                        <span>Total Comprado</span>
                        <p>$${data.totalVendido.toLocaleString('es-AR', {minimumFractionDigits: 2})}</p>
                    </div>
                    <div class="stat">
                        <span>Ventas</span>
                        <p>${data.cantidadVentas}</p>
                    </div>
                    <div class="stat">
                        <span>Cotizaciones</span>
                        <p>${data.presupuestos.length}</p>
                    </div>
                </div>
            `;
            container.appendChild(card);
        }
    };

    // Escuchamos cambios en los presupuestos para mantener el resumen actualizado
    const q = query(presupuestosGuardadosCollection, orderBy('fecha', 'desc'));
    onSnapshot(q, (snapshot) => {
        todosLosClientesAgrupados = {}; // Reseteamos para recalcular
        snapshot.forEach(doc => {
            const presupuesto = doc.data();
            const nombre = presupuesto.nombreCliente;

            // Si el cliente no existe en nuestro objeto, lo inicializamos
            if (!todosLosClientesAgrupados[nombre]) {
                todosLosClientesAgrupados[nombre] = {
                    presupuestos: [],
                    totalVendido: 0,
                    cantidadVentas: 0,
                };
            }

            // Agregamos la data a nuestro cliente
            todosLosClientesAgrupados[nombre].presupuestos.push(presupuesto);
            if (presupuesto.esVenta) {
                todosLosClientesAgrupados[nombre].totalVendido += presupuesto.precioVenta || 0;
                todosLosClientesAgrupados[nombre].cantidadVentas += 1;
            }
        });
        
        // Disparamos un evento 'input' para que la lista se filtre con el término actual
        buscadorInput.dispatchEvent(new Event('input'));
    });

    // Listener para el buscador
    buscadorInput.addEventListener('input', (e) => {
        const termino = e.target.value.toLowerCase();
        
        // Filtramos el objeto de clientes, no un array
        const clientesFiltrados = Object.keys(todosLosClientesAgrupados)
            .filter(nombreCliente => nombreCliente.toLowerCase().includes(termino))
            .reduce((res, key) => {
                res[key] = todosLosClientesAgrupados[key];
                return res;
            }, {});

        renderizarResumen(clientesFiltrados);
    });
}
