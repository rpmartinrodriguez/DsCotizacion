// js/dashboard.js (Versión con aviso de faltantes)
import { 
    getFirestore, collection, getDocs, query, where, Timestamp, orderBy, limit, onSnapshot 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { Chart, registerables } from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.js/+esm';
Chart.register(...registerables);

export function setupDashboard(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');

    const filtroMesSelect = document.getElementById('filtro-mes');
    const kpiIngresos = document.getElementById('kpi-ingresos-ventas');
    const kpiValorCotizado = document.getElementById('kpi-valor-cotizado');
    const kpiGanancia = document.getElementById('kpi-ganancia-bruta');
    const kpiPresupuestos = document.getElementById('kpi-presupuestos-creados');
    const kpiValorStock = document.getElementById('kpi-valor-stock');
    const listaFaltantesContainer = document.getElementById('lista-faltantes-dashboard');
    const ctx = document.getElementById('grafico-ingresos').getContext('2d');
    let ingresosChart = null;

    const UMBRAL_BAJO_STOCK = 100;
    let todosLosPresupuestos = [];
    let materiasPrimasDisponibles = [];

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

    const actualizarListaFaltantes = async () => {
        try {
            const stockActualMap = new Map();
            materiasPrimasDisponibles.forEach(item => {
                const stockTotal = (item.lotes || []).reduce((sum, lote) => sum + lote.stockRestante, 0);
                stockActualMap.set(item.id, stockTotal);
            });

            const qVentas = query(presupuestosGuardadosCollection, where("esVenta", "==", true), where("fechaEntrega", ">=", new Date()), orderBy("fechaEntrega", "asc"), limit(5));
            const ventasSnap = await getDocs(qVentas);
            
            const ingredientesNecesariosMap = new Map();
            ventasSnap.forEach(doc => {
                (doc.data().ingredientes || []).forEach(ing => {
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
                ul.className = 'lista-sencilla';
                listaDeCompras.sort((a,b) => b.cantidad - a.cantidad).slice(0, 5).forEach(item => {
                    const li = document.createElement('li');
                    li.innerHTML = `${item.nombre} <span>${item.cantidad.toLocaleString('es-AR')} ${item.unidad}</span>`;
                    ul.appendChild(li);
                });
                if (listaDeCompras.length > 5) {
                    const liMas = document.createElement('li');
                    liMas.innerHTML = `<strong>y ${listaDeCompras.length - 5} más...</strong>`;
                    liMas.style.justifyContent = 'center';
                    liMas.style.color = 'var(--text-light)';
                    ul.appendChild(liMas);
                }
                listaFaltantesContainer.appendChild(ul);
            } else {
                listaFaltantesContainer.innerHTML = '<p>✅ Tienes stock suficiente para las próximas 5 ventas.</p>';
            }
        } catch (error) {
            console.error("Error calculando faltantes:", error);
            listaFaltantesContainer.innerHTML = '<p style="color:red;">Error al calcular.</p>';
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
        ingresosChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Ingresos por Ventas', data: dataPoints, backgroundColor: 'rgba(255, 150, 197, 0.6)', borderColor: 'rgba(255, 150, 197, 1)', borderWidth: 1 }] },
            options: { scales: { y: { beginAtZero: true } }, responsive: true, maintainAspectRatio: false }
        });
    };

    filtroMesSelect.addEventListener('change', (e) => {
        recalcularDashboard(e.target.value);
    });

    onSnapshot(query(presupuestosGuardadosCollection), (snapshot) => {
        todosLosPresupuestos = snapshot.docs.map(doc => doc.data());
        const mesesDisponibles = new Set();
        todosLosPresupuestos.forEach(p => {
            const fecha = p.fecha.toDate();
            mesesDisponibles.add(`${fecha.getFullYear()}-${fecha.getMonth() + 1}`);
        });
        
        // Limpiamos el select excepto la primera opción
        while(filtroMesSelect.options.length > 1) filtroMesSelect.remove(1);

        const mesesOrdenados = Array.from(mesesDisponibles).sort((a,b)=>(new Date(b.split('-')[0],b.split('-')[1]-1))-(new Date(a.split('-')[0],a.split('-')[1]-1)));
        mesesOrdenados.forEach(mesAnio => {
            const [anio, mes] = mesAnio.split('-').map(Number);
            const nombreMes = new Date(anio, mes - 1).toLocaleString('es-AR', { month: 'long' });
            const option = document.createElement('option');
            option.value = `${mes}-${anio}`;
            option.textContent = `${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} ${anio}`;
            filtroMesSelect.appendChild(option);
        });

        recalcularDashboard(filtroMesSelect.value);
        renderizarGrafico();
        actualizarListaFaltantes();
    });

    onSnapshot(query(materiasPrimasCollection), (snapshot) => {
        materiasPrimasDisponibles = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        let valorTotalStock = 0;
        materiasPrimasDisponibles.forEach(item => {
            if(item.lotes && Array.isArray(item.lotes)) {
                item.lotes.forEach(lote => valorTotalStock += lote.stockRestante * lote.costoUnitario);
            }
        });
        kpiValorStock.textContent = `$${formatCurrency(valorTotalStock)}`;
        actualizarListaFaltantes();
    });
}
