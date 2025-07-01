// js/dashboard.js (Versión con filtro por mes y cálculos correctos)
import { 
    getFirestore, collection, getDocs, query, where, Timestamp
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupDashboard(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');

    // Referencias a los elementos del DOM
    const filtroMesSelect = document.getElementById('filtro-mes');
    const kpiIngresos = document.getElementById('kpi-ingresos-ventas');
    const kpiValorCotizado = document.getElementById('kpi-valor-cotizado'); // Nuevo
    const kpiGanancia = document.getElementById('kpi-ganancia-bruta');
    const kpiPresupuestos = document.getElementById('kpi-presupuestos-creados');
    const kpiValorStock = document.getElementById('kpi-valor-stock');
    const listaBajoStock = document.getElementById('lista-bajo-stock');
    const ctx = document.getElementById('grafico-ingresos').getContext('2d');
    let ingresosChart = null;

    const UMBRAL_BAJO_STOCK = 100;
    let todosLosPresupuestos = []; // Guardamos los presupuestos para no pedirlos de nuevo

    const formatCurrency = (value) => value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const recalcularDashboard = (mesFiltro) => {
        let presupuestosFiltrados = todosLosPresupuestos;

        if (mesFiltro !== "todos") {
            const [mes, anio] = mesFiltro.split('-').map(Number);
            presupuestosFiltrados = todosLosPresupuestos.filter(p => {
                const fecha = p.fecha.toDate();
                return fecha.getFullYear() === anio && fecha.getMonth() === (mes - 1);
            });
        }

        let ingresosVentas = 0;
        let valorCotizado = 0;
        let gananciaBrutaVentas = 0;

        presupuestosFiltrados.forEach(p => {
            valorCotizado += p.precioVenta || 0;
            if (p.esVenta) {
                ingresosVentas += p.precioVenta || 0;
                if (p.hasOwnProperty('precioVenta')) {
                    const costoManoObra = (p.horasTrabajo || 0) * (p.costoHora || 0);
                    const costoFijos = (p.costoMateriales || 0) * ((p.porcentajeCostosFijos || 0) / 100);
                    const costoProduccion = p.costoMateriales + costoManoObra + costoFijos;
                    gananciaBrutaVentas += (p.precioVenta - costoProduccion);
                }
            }
        });

        kpiIngresos.textContent = `$${formatCurrency(ingresosVentas)}`;
        kpiValorCotizado.textContent = `$${formatCurrency(valorCotizado)}`;
        kpiGanancia.textContent = `$${formatCurrency(gananciaBrutaVentas)}`;
        kpiPresupuestos.textContent = presupuestosFiltrados.length;
    };

    const calcularMetricasStock = async () => {
        const snapshot = await getDocs(query(materiasPrimasCollection));
        let valorTotalStock = 0;
        const productosBajoStock = [];

        snapshot.forEach(doc => {
            const item = doc.data();
            if (item.lotes && Array.isArray(item.lotes)) {
                let stockTotalProducto = 0;
                item.lotes.forEach(lote => {
                    valorTotalStock += lote.stockRestante * lote.costoUnitario;
                    stockTotalProducto += lote.stockRestante;
                });
                if (stockTotalProducto < UMBRAL_BAJO_STOCK && item.unidad !== 'unidad') {
                    productosBajoStock.push({ nombre: item.nombre, stock: stockTotalProducto, unidad: item.unidad });
                }
            }
        });

        kpiValorStock.textContent = `$${formatCurrency(valorTotalStock)}`;
        listaBajoStock.innerHTML = '';
        if (productosBajoStock.length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'lista-sencilla';
            productosBajoStock.sort((a,b) => a.stock - b.stock).forEach(p => {
                const li = document.createElement('li');
                li.innerHTML = `${p.nombre} <span>${p.stock.toLocaleString('es-AR')} ${p.unidad}</span>`;
                ul.appendChild(li);
            });
            listaBajoStock.appendChild(ul);
        } else {
            listaBajoStock.innerHTML = '<p>¡Todo en orden! No hay productos con bajo stock.</p>';
        }
    };

    const renderizarGrafico = () => {
        if (ingresosChart) ingresosChart.destroy();
        
        const ventasPorMes = {};
        todosLosPresupuestos.forEach(p => {
            if (p.esVenta) {
                const fecha = p.fecha.toDate();
                const mesAnio = `${fecha.getMonth() + 1}/${String(fecha.getFullYear()).slice(-2)}`;
                if (!ventasPorMes[mesAnio]) ventasPorMes[mesAnio] = 0;
                ventasPorMes[mesAnio] += p.precioVenta || 0;
            }
        });

        const labels = Object.keys(ventasPorMes).reverse();
        const dataPoints = Object.values(ventasPorMes).reverse();

        ingresosChart = new Chart(ctx, { /* ... (la configuración del gráfico no cambia) ... */ });
    };

    const initialLoad = async () => {
        const snapshot = await getDocs(query(presupuestosGuardadosCollection));
        todosLosPresupuestos = snapshot.docs.map(doc => doc.data());

        // Llenar el filtro de meses
        const mesesDisponibles = new Set();
        todosLosPresupuestos.forEach(p => {
            const fecha = p.fecha.toDate();
            // Formato 'YYYY-M' para poder ordenar fácil, ej: '2025-7'
            mesesDisponibles.add(`${fecha.getFullYear()}-${fecha.getMonth() + 1}`);
        });

        const mesesOrdenados = Array.from(mesesDisponibles).sort((a,b) => {
            const [anioA, mesA] = a.split('-').map(Number);
            const [anioB, mesB] = b.split('-').map(Number);
            return anioB - anioA || mesB - mesA;
        });

        mesesOrdenados.forEach(mesAnio => {
            const [anio, mes] = mesAnio.split('-').map(Number);
            const nombreMes = new Date(anio, mes - 1).toLocaleString('es-AR', { month: 'long' });
            const option = document.createElement('option');
            option.value = `${mes}-${anio}`;
            option.textContent = `${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} ${anio}`;
            filtroMesSelect.appendChild(option);
        });

        filtroMesSelect.addEventListener('change', (e) => {
            recalcularDashboard(e.target.value);
        });

        recalcularDashboard('todos'); // Carga inicial con todos los datos
        calcularMetricasStock();
        renderizarGrafico(); // El gráfico siempre muestra la tendencia general
    };

    initialLoad();
}
