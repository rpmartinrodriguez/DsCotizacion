import { 
    getFirestore, collection, onSnapshot, query, orderBy, getDocs, where, Timestamp, limit
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// NO importamos Chart.js aquí, ya que se carga desde el HTML. Esta era la causa del error.

export function setupDashboard(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');

    // Referencias a todos los elementos del DOM
    const filtroMesSelect = document.getElementById('filtro-mes');
    const kpiIngresos = document.getElementById('kpi-ingresos-ventas');
    const kpiValorCotizado = document.getElementById('kpi-valor-cotizado');
    const kpiGanancia = document.getElementById('kpi-ganancia-bruta');
    const kpiPresupuestos = document.getElementById('kpi-presupuestos-creados');
    const kpiValorStock = document.getElementById('kpi-valor-stock');
    const listaFaltantesContainer = document.getElementById('lista-faltantes-dashboard');
    const topClientesContainer = document.getElementById('lista-top-clientes');
    const proximasEntregasContainer = document.getElementById('lista-proximas-entregas');
    const ctx = document.getElementById('grafico-ingresos').getContext('2d');
    
    let ingresosChart = null;
    let todosLosPresupuestos = [];
    let materiasPrimasDisponibles = [];

    const formatCurrency = (value) => (value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // --- FUNCIONES DE ACTUALIZACIÓN DE LA UI ---

    function recalcularIndicadores(presupuestos) {
        let ingresosVentas = 0, valorCotizado = 0, gananciaBrutaVentas = 0;
        presupuestos.forEach(p => {
            valorCotizado += p.precioVenta || 0;
            if (p.esVenta) {
                ingresosVentas += p.precioVenta || 0;
                if (p.hasOwnProperty('precioVenta')) {
                    const costoProduccion = (p.costoMateriales || 0) + ((p.horasTrabajo || 0) * (p.costoHora || 0)) + ((p.costoMateriales || 0) * ((p.porcentajeCostosFijos || 0) / 100));
                    gananciaBrutaVentas += (p.precioVenta - costoProduccion);
                }
            }
        });
        kpiIngresos.textContent = `$${formatCurrency(ingresosVentas)}`;
        kpiValorCotizado.textContent = `$${formatCurrency(valorCotizado)}`;
        kpiGanancia.textContent = `$${formatCurrency(gananciaBrutaVentas)}`;
        kpiPresupuestos.textContent = presupuestos.length;
    }

    function actualizarGrafico() {
        if (ingresosChart) ingresosChart.destroy();
        const ventasPorMes = {};
        todosLosPresupuestos.forEach(p => {
            if (p.esVenta) {
                const fecha = p.fecha.toDate();
                const mesAnio = `${String(fecha.getMonth() + 1).padStart(2,'0')}/${fecha.getFullYear()}`;
                ventasPorMes[mesAnio] = (ventasPorMes[mesAnio] || 0) + (p.precioVenta || 0);
            }
        });
        const labels = Object.keys(ventasPorMes).sort((a,b) => {
            const [mesA, anioA] = a.split('/');
            const [mesB, anioB] = b.split('/');
            return (anioA - anioB) || (mesA - mesB);
        });
        const dataPoints = labels.map(label => ventasPorMes[label]);
        ingresosChart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Ingresos por Ventas', data: dataPoints, backgroundColor: 'rgba(255, 150, 197, 0.6)', borderColor: 'rgba(255, 150, 197, 1)', borderWidth: 1 }] }, options: { scales: { y: { beginAtZero: true } }, responsive: true, maintainAspectRatio: false }});
    }

    function actualizarWidgetsLaterales() {
        // Top Clientes
        const ventasPorCliente = {};
        todosLosPresupuestos.forEach(p => {
            if (p.esVenta && p.nombreCliente) {
                ventasPorCliente[p.nombreCliente] = (ventasPorCliente[p.nombreCliente] || 0) + (p.precioVenta || 0);
            }
        });
        const clientesOrdenados = Object.entries(ventasPorCliente).sort(([, a], [, b]) => b - a).slice(0, 5);
        topClientesContainer.innerHTML = '';
        if (clientesOrdenados.length > 0) {
            const ol = document.createElement('ol');
            ol.className = 'top-lista';
            clientesOrdenados.forEach(([nombre, total]) => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${nombre}</span> <strong>$${formatCurrency(total)}</strong>`;
                ol.appendChild(li);
            });
            topClientesContainer.appendChild(ol);
        } else {
            topClientesContainer.innerHTML = '<p>Aún no hay ventas registradas.</p>';
        }

        // Próximas Entregas
        const proximasVentas = todosLosPresupuestos
            .filter(p => p.esVenta && p.fechaEntrega && p.fechaEntrega.toDate() >= new Date())
            .sort((a, b) => a.fechaEntrega.toDate() - b.fechaEntrega.toDate())
            .slice(0, 3);
        proximasEntregasContainer.innerHTML = '';
        if (proximasVentas.length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'lista-sencilla dashboard-lista';
            proximasVentas.forEach(venta => {
                const fecha = venta.fechaEntrega.toDate();
                const li = document.createElement('li');
                li.innerHTML = `<div class="dashboard-lista-item"><strong>${venta.tituloTorta}</strong><small>Cliente: ${venta.nombreCliente}</small></div><span class="fecha-tag">${fecha.toLocaleDateString('es-AR', {day: '2-digit', month: 'short'}).replace('.','')}</span>`;
                ul.appendChild(li);
            });
            proximasEntregasContainer.appendChild(ul);
        } else {
            proximasEntregasContainer.innerHTML = '<p>No hay entregas próximas agendadas.</p>';
        }
    }
    
    function actualizarStockYFaltantes() {
        let valorTotalStock = 0;
        const stockActualMap = new Map();
        materiasPrimasDisponibles.forEach(item => {
            const stockTotal = (item.lotes || []).reduce((sum, lote) => sum + lote.stockRestante, 0);
            stockActualMap.set(item.id, stockTotal);
            if(item.lotes) item.lotes.forEach(lote => valorTotalStock += lote.stockRestante * lote.costoUnitario);
        });
        kpiValorStock.textContent = `$${formatCurrency(valorTotalStock)}`;

        const proximasVentas = todosLosPresupuestos.filter(p => p.esVenta && p.fechaEntrega && p.fechaEntrega.toDate() >= new Date()).sort((a,b) => a.fechaEntrega.toDate() - b.fechaEntrega.toDate()).slice(0, 5);
        const ingredientesNecesariosMap = new Map();
        proximasVentas.forEach(venta => {
            (venta.ingredientes || []).forEach(ing => {
                const id = ing.idMateriaPrima || ing.id;
                const cantidad = ing.cantidadTotal || ing.cantidad;
                ingredientesNecesariosMap.set(id, (ingredientesNecesariosMap.get(id) || 0) + cantidad);
            });
        });
        const listaDeCompras = [];
        for (const [id, cantidadNecesaria] of ingredientesNecesariosMap.entries()) {
            const cantidadAComprar = cantidadNecesaria - (stockActualMap.get(id) || 0);
            if (cantidadAComprar > 0) {
                const mpDoc = materiasPrimasDisponibles.find(mp => mp.id === id);
                if (mpDoc) listaDeCompras.push({ nombre: mpDoc.nombre, cantidad: cantidadAComprar, unidad: mpDoc.unidad });
            }
        }
        listaFaltantesContainer.innerHTML = '';
        if (listaDeCompras.length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'lista-sencilla dashboard-lista';
            listaDeCompras.sort((a,b) => b.cantidad - a.cantidad).slice(0, 5).forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${item.nombre}</span> <span class="faltante-cantidad">${item.cantidad.toLocaleString('es-AR')} ${item.unidad}</span>`;
                ul.appendChild(li);
            });
            if (listaDeCompras.length > 5) {
                const liMas = document.createElement('li');
                liMas.innerHTML = `<strong>y ${listaDeCompras.length - 5} más...</strong>`;
                ul.appendChild(liMas);
            }
            listaFaltantesContainer.appendChild(ul);
        } else {
            listaFaltantesContainer.innerHTML = '<p>✅ Tienes stock suficiente.</p>';
        }
    }

    // --- Carga de Datos y Listeners ---
    onSnapshot(query(presupuestosGuardadosCollection), (snapshot) => {
        todosLosPresupuestos = snapshot.docs.map(doc => doc.data());
        const mesesDisponibles = new Set();
        todosLosPresupuestos.forEach(p => {
            const fecha = p.fecha.toDate();
            mesesDisponibles.add(`${fecha.getFullYear()}-${fecha.getMonth() + 1}`);
        });
        const mesesOrdenados = Array.from(mesesDisponibles).sort((a,b)=>(new Date(b.split('-')[0],b.split('-')[1]-1))-(new Date(a.split('-')[0],a.split('-')[1]-1)));
        const valorActualFiltro = filtroMesSelect.value;
        while(filtroMesSelect.options.length > 1) filtroMesSelect.remove(1);
        mesesOrdenados.forEach(mesAnio => {
            const [anio, mes] = mesAnio.split('-').map(Number);
            const nombreMes = new Date(anio, mes - 1).toLocaleString('es-AR', { month: 'long' });
            const option = document.createElement('option');
            option.value = `${mes}-${anio}`;
            option.textContent = `${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} ${anio}`;
            filtroMesSelect.appendChild(option);
        });
        filtroMesSelect.value = valorActualFiltro;
        recalcularDashboard(filtroMesSelect.value);
        renderizarGrafico();
        actualizarTopClientes();
        if(materiasPrimasDisponibles.length > 0) actualizarListaFaltantes();
        actualizarProximasEntregas();
    });

    onSnapshot(query(materiasPrimasCollection), (snapshot) => {
        materiasPrimasDisponibles = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        calcularMetricasStock();
        if(todosLosPresupuestos.length > 0) actualizarListaFaltantes();
    });

    filtroMesSelect.addEventListener('change', (e) => {
        recalcularDashboard(e.target.value);
    });
}
