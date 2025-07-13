import { 
    getFirestore, collection, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupFinanzas(app) {
    const db = getFirestore(app);
    const presupuestosCollection = collection(db, 'presupuestosGuardados');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');

    const filtroMesSelect = document.getElementById('filtro-mes-finanzas');
    const reporteContainer = document.getElementById('reporte-financiero-container');

    let todosLosPresupuestos = [];
    let todasLasMateriasPrimas = [];

    const formatCurrency = (value) => (value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

    const calcularYRenderizarReporte = () => {
        const mesFiltro = filtroMesSelect.value;
        let presupuestosFiltrados = todosLosPresupuestos;
        let comprasFiltradas = [];

        // Filtrar datos por mes si no es "Todos los Tiempos"
        if (mesFiltro !== "todos") {
            const [mes, anio] = mesFiltro.split('-').map(Number);
            
            presupuestosFiltrados = todosLosPresupuestos.filter(p => {
                const fecha = p.fecha.toDate();
                return fecha.getFullYear() === anio && fecha.getMonth() === (mes - 1);
            });

            todasLasMateriasPrimas.forEach(mp => {
                (mp.lotes || []).forEach(lote => {
                    const fechaLote = lote.fechaCompra.toDate();
                    if (fechaLote.getFullYear() === anio && fechaLote.getMonth() === (mes - 1)) {
                        comprasFiltradas.push(lote);
                    }
                });
            });
        } else {
            todasLasMateriasPrimas.forEach(mp => {
                comprasFiltradas.push(...(mp.lotes || []));
            });
        }

        const ventasFiltradas = presupuestosFiltrados.filter(p => p.esVenta);

        // 1. Calcular Ingresos Totales
        const ingresosTotales = ventasFiltradas.reduce((sum, venta) => sum + (venta.precioVenta || 0), 0);

        // 2. Calcular Costo de Mercadería Vendida (CMV)
        const costoMercaderiaVendida = ventasFiltradas.reduce((sum, venta) => sum + (venta.costoMateriales || 0), 0);

        // 3. Calcular Ganancia Bruta
        const gananciaBruta = ingresosTotales - costoMercaderiaVendida;

        // 4. Calcular Gastos en Compras de Stock
        const gastosEnCompras = comprasFiltradas.reduce((sum, lote) => sum + (lote.precioCompra || 0), 0);

        // 5. Calcular Ganancia Neta Final
        const gananciaNeta = gananciaBruta - gastosEnCompras;

        // Renderizar el reporte
        reporteContainer.innerHTML = `
            <div class="linea-reporte">
                <span>(+) Ingresos por Ventas</span>
                <span class="valor-positivo">${formatCurrency(ingresosTotales)}</span>
            </div>
            <div class="linea-reporte">
                <span>(-) Costo de Mercadería Vendida</span>
                <span class="valor-negativo">${formatCurrency(costoMercaderiaVendida)}</span>
            </div>
            <hr class="calculo-divisor">
            <div class="linea-reporte total-bruto">
                <span>(=) Ganancia Bruta</span>
                <span>${formatCurrency(gananciaBruta)}</span>
            </div>
            <div class="linea-reporte" style="margin-top: 1.5rem;">
                <span>(-) Gastos en Compras de Stock</span>
                <span class="valor-negativo">${formatCurrency(gastosEnCompras)}</span>
            </div>
            <hr class="calculo-divisor">
            <div class="linea-reporte total-neto">
                <span>(=) GANANCIA NETA</span>
                <span class="${gananciaNeta >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatCurrency(gananciaNeta)}</span>
            </div>
        `;
    };
    
    // Carga inicial y listeners
    onSnapshot(query(presupuestosGuardadosCollection), (snapshot) => {
        todosLosPresupuestos = snapshot.docs.map(doc => doc.data());
        
        const mesesDisponibles = new Set();
        todosLosPresupuestos.forEach(p => {
            const fecha = p.fecha.toDate();
            mesesDisponibles.add(`${fecha.getFullYear()}-${fecha.getMonth() + 1}`);
        });
        
        const mesesOrdenados = Array.from(mesesDisponibles).sort((a,b) => (new Date(b.split('-')[0],b.split('-')[1]-1)) - (new Date(a.split('-')[0],a.split('-')[1]-1)));
        
        filtroMesSelect.innerHTML = '<option value="todos">Todos los Tiempos</option>';
        mesesOrdenados.forEach(mesAnio => {
            const [anio, mes] = mesAnio.split('-').map(Number);
            const nombreMes = new Date(anio, mes - 1).toLocaleString('es-AR', { month: 'long' });
            const option = document.createElement('option');
            option.value = `${mes}-${anio}`;
            option.textContent = `${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} ${anio}`;
            filtroMesSelect.appendChild(option);
        });

        calcularYRenderizarReporte();
    });

    onSnapshot(query(materiasPrimasCollection), (snapshot) => {
        todasLasMateriasPrimas = snapshot.docs.map(doc => doc.data());
        calcularYRenderizarReporte();
    });

    filtroMesSelect.addEventListener('change', calcularYRenderizarReporte);
}
