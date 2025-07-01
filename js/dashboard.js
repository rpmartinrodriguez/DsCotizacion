// js/dashboard.js
import { 
    getFirestore, collection, getDocs, query, orderBy 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupDashboard(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');

    // Referencias a los elementos del DOM
    const kpiIngresos = document.getElementById('kpi-ingresos-totales');
    const kpiGanancia = document.getElementById('kpi-ganancia-bruta');
    const kpiPresupuestos = document.getElementById('kpi-presupuestos-creados');
    const kpiValorStock = document.getElementById('kpi-valor-stock');
    const listaBajoStock = document.getElementById('lista-bajo-stock');
    const ctx = document.getElementById('grafico-ingresos').getContext('2d');
    let ingresosChart = null; 

    const UMBRAL_BAJO_STOCK = 100;

    const calcularMetricasPresupuestos = async () => {
        const snapshot = await getDocs(query(presupuestosGuardadosCollection, orderBy("fecha", "desc")));
        
        let ingresosTotales = 0;
        let gananciaBrutaTotal = 0;
        const presupuestosPorMes = {};

        snapshot.forEach(doc => {
            const p = doc.data();
            ingresosTotales += p.precioVenta || 0;
            
            if (p.hasOwnProperty('precioVenta')) {
                const costoManoObra = (p.horasTrabajo || 0) * (p.costoHora || 0);
                const costoFijos = (p.costoMateriales || 0) * ((p.porcentajeCostosFijos || 0) / 100);
                const costoProduccion = p.costoMateriales + costoManoObra + costoFijos;
                gananciaBrutaTotal += (p.precioVenta - costoProduccion);
            }

            const fecha = p.fecha.toDate();
            const mesAnio = `${fecha.getMonth() + 1}/${String(fecha.getFullYear()).slice(-2)}`;
            if (!presupuestosPorMes[mesAnio]) {
                presupuestosPorMes[mesAnio] = 0;
            }
            presupuestosPorMes[mesAnio] += p.precioVenta || 0;
        });

        kpiIngresos.textContent = `$${ingresosTotales.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        kpiGanancia.textContent = `$${gananciaBrutaTotal.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        kpiPresupuestos.textContent = snapshot.size;

        renderizarGrafico(presupuestosPorMes);
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

        kpiValorStock.textContent = `$${valorTotalStock.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        
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

    const renderizarGrafico = (datos) => {
        if (ingresosChart) {
            ingresosChart.destroy();
        }
        
        const labels = Object.keys(datos).reverse();
        const dataPoints = Object.values(datos).reverse();

        ingresosChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ingresos por Mes',
                    data: dataPoints,
                    backgroundColor: 'rgba(255, 150, 197, 0.6)',
                    borderColor: 'rgba(255, 150, 197, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    y: { beginAtZero: true }
                },
                responsive: true,
                maintainAspectRatio: false
            }
        });
    };

    calcularMetricasPresupuestos();
    calcularMetricasStock();
}
