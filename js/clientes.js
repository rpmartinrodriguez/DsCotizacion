// js/clientes.js (Versión con detalle de presupuestos)
import { 
    getFirestore, collection, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupClientes(app) {
    const db = getFirestore(app);
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');
    const container = document.getElementById('resumen-clientes-container');
    const buscadorInput = document.getElementById('buscador-clientes');

    let todosLosClientesAgrupados = {};

    const renderizarResumen = (clientes) => {
        container.innerHTML = '';
        if (Object.keys(clientes).length === 0) {
            container.innerHTML = '<p>No se encontraron clientes.</p>';
            return;
        }

        const clientesOrdenados = Object.keys(clientes).sort();

        for (const nombreCliente of clientesOrdenados) {
            const data = clientes[nombreCliente];
            const card = document.createElement('div');
            card.className = 'cliente-resumen-card';

            // Generamos la lista de presupuestos para el detalle
            const detallePresupuestosHtml = data.presupuestos
                .sort((a, b) => b.fecha.toDate() - a.fecha.toDate()) // Ordenamos por fecha
                .map(p => {
                    const fecha = p.fecha.toDate().toLocaleDateString('es-AR');
                    const precio = p.precioVenta || p.costoTotal || 0;
                    const ventaBadge = p.esVenta ? `<span class="venta-confirmada-badge mini">VENTA</span>` : '';
                    return `<li class="presupuesto-item">${p.tituloTorta} - $${precio.toFixed(2)} <span>(${fecha})</span> ${ventaBadge}</li>`;
                }).join('');

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
                <div class="historial-card__actions" style="justify-content: flex-end;">
                     <button class="btn-ver-detalle" data-cliente-nombre="${nombreCliente}">Ver Historial</button>
                </div>
                <div class="cliente-historial-detalle" id="detalle-${nombreCliente.replace(/\s+/g, '-')}" style="display:none;">
                    <h4>Historial de Presupuestos</h4>
                    <ul>${detallePresupuestosHtml}</ul>
                </div>
            `;
            container.appendChild(card);
        }
    };

    const q = query(presupuestosGuardadosCollection, orderBy('fecha', 'desc'));
    onSnapshot(q, (snapshot) => {
        todosLosClientesAgrupados = {};
        snapshot.forEach(doc => {
            const presupuesto = doc.data();
            const nombre = presupuesto.nombreCliente;
            if (!todosLosClientesAgrupados[nombre]) {
                todosLosClientesAgrupados[nombre] = { presupuestos: [], totalVendido: 0, cantidadVentas: 0 };
            }
            todosLosClientesAgrupados[nombre].presupuestos.push(presupuesto);
            if (presupuesto.esVenta) {
                todosLosClientesAgrupados[nombre].totalVendido += presupuesto.precioVenta || 0;
                todosLosClientesAgrupados[nombre].cantidadVentas += 1;
            }
        });
        buscadorInput.dispatchEvent(new Event('input'));
    });
    
    buscadorInput.addEventListener('input', (e) => {
        const termino = e.target.value.toLowerCase();
        const clientesFiltrados = Object.keys(todosLosClientesAgrupados)
            .filter(nombreCliente => nombreCliente.toLowerCase().includes(termino))
            .reduce((res, key) => {
                res[key] = todosLosClientesAgrupados[key];
                return res;
            }, {});
        renderizarResumen(clientesFiltrados);
    });
    
    container.addEventListener('click', (e) => {
        if(e.target.classList.contains('btn-ver-detalle')) {
            const nombreCliente = e.target.dataset.clienteNombre;
            const detalleId = `detalle-${nombreCliente.replace(/\s+/g, '-')}`;
            const detalleDiv = document.getElementById(detalleId);
            if (detalleDiv) {
                const isVisible = detalleDiv.style.display === 'block';
                detalleDiv.style.display = isVisible ? 'none' : 'block';
                e.target.textContent = isVisible ? 'Ver Historial' : 'Ocultar Historial';
            }
        }
    });
}
