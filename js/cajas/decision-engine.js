import { calculateRecipeUnitCost, getEffectiveUnitCost } from "../core/pricing.js";

const asNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

export const dateMillis = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (value.seconds !== undefined) return asNumber(value.seconds) * 1000;
    if (value instanceof Date) return value.getTime();
    const number = new Date(value).getTime();
    return Number.isFinite(number) ? number : 0;
};

const normalized = (value) =>
    String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const itemKey = (item) => item?.id ? `id:${item.id}` : `name:${normalized(item?.nombre || item?.nombreTorta)}`;
const saleRevenue = (sale) => Math.max(0, asNumber(sale.total));

const grossMargin = (price, cost) =>
    price > 0 && cost > 0 ? ((price - cost) / price) * 100 : null;

const deltaPercent = (current, previous) =>
    previous > 0 ? ((current - previous) / previous) * 100 : null;

const localDay = (date) => {
    const d = new Date(date);
    const pad = (v) => String(v).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const analyzeDecisionData = ({
    sales = [],
    boxes = [],
    recipes = [],
    materials = [],
    periodDays = 30,
    targetMargin = 40,
    now = new Date()
} = {}) => {
    const days = [7, 30, 90].includes(Number(periodDays)) ? Number(periodDays) : 30;
    const clock = now instanceof Date ? now.getTime() : dateMillis(now);
    const start = clock - days * 86400000;
    const previousStart = clock - (days * 2) * 86400000;
    const excludedBoxes = new Set(boxes.filter(box => box.eliminada === true).map(box => box.id));
    const validSales = sales
        .filter(sale => !excludedBoxes.has(sale.cajaId) && sale.eliminada !== true)
        .map(sale => ({ ...sale, when: dateMillis(sale.fecha) }))
        .filter(sale => sale.when > 0 && sale.when <= clock);

    const recent = validSales.filter(sale => sale.when >= start);
    const previous = validSales.filter(sale => sale.when >= previousStart && sale.when < start);
    const currentRevenue = recent.reduce((sum, sale) => sum + saleRevenue(sale), 0);
    const previousRevenue = previous.reduce((sum, sale) => sum + saleRevenue(sale), 0);
    const currentAverage = recent.length ? currentRevenue / recent.length : 0;
    const previousAverage = previous.length ? previousRevenue / previous.length : 0;

    const materialMap = new Map(materials.map(material => [material.id, material]));
    const recipeMap = new Map();
    recipes.forEach(recipe => {
        const cost = calculateRecipeUnitCost(recipe, materialMap);
        const ingredients = Array.isArray(recipe.ingredientes) ? recipe.ingredientes : [];
        const incomplete =
            ingredients.length === 0 ||
            ingredients.some(ingredient => {
                const material = materialMap.get(ingredient.idMateriaPrima);
                return !material || getEffectiveUnitCost(material) <= 0;
            });
        const data = { ...recipe, currentCost: cost, costIncomplete: incomplete || cost <= 0 };
        if (recipe.id) recipeMap.set(`id:${recipe.id}`, data);
        if (recipe.nombreTorta) recipeMap.set(`name:${normalized(recipe.nombreTorta)}`, data);
    });

    const products = new Map();
    let coveredRevenue = 0;
    let snapshotCost = 0;
    let eligibleLineRevenue = 0;
    let snapshotLines = 0;
    let totalLines = 0;
    let unmatchedSales = 0;
    let cashRevenue = 0;
    let mpRevenue = 0;
    let paymentMismatch = 0;
    const daySales = new Map();

    recent.forEach(sale => {
        cashRevenue += asNumber(sale.pagoEfectivo);
        mpRevenue += asNumber(sale.pagoMercadoPago);
        if (Math.abs(asNumber(sale.pagoEfectivo) + asNumber(sale.pagoMercadoPago) - saleRevenue(sale)) > 1.5) {
            paymentMismatch += 1;
        }

        const dayKey = localDay(sale.when);
        daySales.set(dayKey, (daySales.get(dayKey) || 0) + saleRevenue(sale));
        const items = Array.isArray(sale.items) ? sale.items : [];

        if (!items.length) unmatchedSales += 1;

        items.forEach(item => {
            const quantity = asNumber(item.cantidad);
            const unitPrice = asNumber(item.precio);
            if (quantity <= 0 || unitPrice < 0) return;
            const revenue = unitPrice * quantity;
            totalLines += 1;
            eligibleLineRevenue += revenue;

            const recordedCost = Number(item.costoTotalVenta);
            const hasValidSnapshot =
                Number(item.costoSnapshotVersion) >= 1 &&
                Number.isFinite(recordedCost) &&
                recordedCost > 0;

            if (hasValidSnapshot) {
                coveredRevenue += revenue;
                snapshotCost += recordedCost;
                snapshotLines += 1;
            }

            const key = itemKey(item);
            if (!key || key === 'name:') return;
            if (!products.has(key)) {
                products.set(key, {
                    key,
                    name: item.nombre || 'Producto',
                    units: 0,
                    revenue: 0,
                    snapshotRevenue: 0,
                    snapshotCost: 0,
                    snapshotUnits: 0,
                    latestSale: 0,
                    latestPrice: 0
                });
            }
            const product = products.get(key);
            product.units += quantity;
            product.revenue += revenue;
            if (hasValidSnapshot) {
                product.snapshotRevenue += revenue;
                product.snapshotCost += recordedCost;
                product.snapshotUnits += quantity;
            }
            if (sale.when > product.latestSale) {
                product.latestSale = sale.when;
                product.latestPrice = unitPrice;
            }
        });
    });

    const productRows = [...products.values()].map(product => {
        const recipe = recipeMap.get(product.key) || recipeMap.get(`name:${normalized(product.name)}`);
        const currentCost = recipe?.currentCost || 0;
        const canEstimate = Boolean(recipe) && !recipe.costIncomplete && currentCost > 0 && product.latestPrice > 0;
        const estimatedMargin = canEstimate ? grossMargin(product.latestPrice, currentCost) : null;
        const requiredPrice = canEstimate && targetMargin > 0 && targetMargin < 100
            ? currentCost / (1 - targetMargin / 100)
            : 0;
        const theoreticalGap = canEstimate
            ? Math.max(0, requiredPrice - product.latestPrice) * product.units
            : 0;

        return {
            ...product,
            currentCost,
            canEstimate,
            estimatedMargin,
            theoreticalGap,
            historicalMargin: product.snapshotRevenue > 0
                ? ((product.snapshotRevenue - product.snapshotCost) / product.snapshotRevenue) * 100
                : null
        };
    }).sort((a, b) => b.revenue - a.revenue);

    const alerts = [];
    const addAlert = (priority, title, evidence, action, link = null) => {
        alerts.push({ priority, title, evidence, action, link });
    };

    const missingCost = productRows.filter(row => row.units > 0 && !row.canEstimate);
    if (missingCost.length) {
        addAlert('critical', `${missingCost.length} producto(s) vendidos sin costo confiable`,
            `Ejemplos: ${missingCost.slice(0, 3).map(row => row.name).join(', ')}. Sin receta y costos completos no es posible evaluar su rentabilidad actual.`,
            'Revisar ingredientes y costos unitarios antes de modificar precios.',
            { href: 'recetas.html', text: 'Revisar recetas' });
    }

    const lowMargin = productRows
        .filter(row => row.canEstimate && row.units >= 2 && row.estimatedMargin < targetMargin)
        .sort((a, b) => b.theoreticalGap - a.theoreticalGap);
    if (lowMargin.length) {
        const top = lowMargin.slice(0, 3);
        const gap = lowMargin.reduce((sum, row) => sum + row.theoreticalGap, 0);
        addAlert('critical',
            `${lowMargin.length} producto(s) por debajo del margen objetivo`,
            `Mayor impacto: ${top.map(row => `${row.name} (${row.estimatedMargin.toFixed(1)}%)`).join(', ')}. Brecha teórica para llegar al objetivo al volumen del período: ${gap.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })}.`,
            'Analizar el costo actual y validar el precio de venta antes de cambiarlo. Se usó el último precio realmente vendido como referencia.',
            { href: 'precios.html#revision-precios', text: 'Revisión de precios' });
    }

    if (previous.length >= 5 && recent.length >= 5) {
        const revenueChange = deltaPercent(currentRevenue, previousRevenue);
        if (Number.isFinite(revenueChange) && revenueChange <= -15) {
            addAlert('review', 'Facturación por debajo del período anterior',
                `Variación ${revenueChange.toFixed(1)}% en ${days} días: ${recent.length} tickets actuales frente a ${previous.length} anteriores.`,
                'Revisar días de menor venta, horarios y surtido; no asumir una causa sin más datos.',
                { href: 'cajas.html#estadisticas', text: 'Ver estadísticas' });
        }
        const avgChange = deltaPercent(currentAverage, previousAverage);
        if (Number.isFinite(avgChange) && avgChange <= -10) {
            addAlert('review', 'El ticket promedio está disminuyendo',
                `El promedio por venta cayó ${Math.abs(avgChange).toFixed(1)}% respecto del período anterior.`,
                'Evaluar combos, venta complementaria y cambios en la mezcla de productos.');
        }
    }

    const newProviderCosts = materials.filter(material => {
        const change = asNumber(material.proveedorVariacionPct);
        const lastChange = (Array.isArray(material.historialPreciosProveedor)
            ? material.historialPreciosProveedor.find(entry => asNumber(entry.variacionPct) >= 10)
            : null);
        const when = dateMillis(lastChange?.fecha || material.proveedorUltimaConsulta);
        return change >= 10 && when >= start && when <= clock;
    }).sort((a, b) => asNumber(b.proveedorVariacionPct) - asNumber(a.proveedorVariacionPct));
    if (newProviderCosts.length) {
        addAlert('review', `${newProviderCosts.length} insumo(s) con aumentos importantes`,
            `Últimas variaciones unitarias: ${newProviderCosts.slice(0, 3).map(item => `${item.nombre} (+${asNumber(item.proveedorVariacionPct).toFixed(1)}%)`).join(', ')}.`,
            'Verificar precios y presentación del proveedor antes de decidir un ajuste comercial.',
            { href: 'stock.html', text: 'Revisar Stock' });
    }

    const leadingThree = productRows.slice(0, 3).reduce((sum, row) => sum + row.revenue, 0);
    const revenueConcentration = eligibleLineRevenue > 0
        ? (leadingThree / eligibleLineRevenue) * 100
        : null;
    if (recent.length >= 15 && productRows.length >= 6 && revenueConcentration >= 70) {
        addAlert('review', 'Ingresos muy concentrados en tres productos',
            `Los tres productos principales representan ${revenueConcentration.toFixed(1)}% de las ventas por líneas registradas.`,
            'Evaluar continuidad de insumos críticos y oportunidades de otros productos; no eliminar los más exitosos.');
    }

    const coverage = eligibleLineRevenue > 0 ? (coveredRevenue / eligibleLineRevenue) * 100 : null;
    if (recent.length > 0 && (coverage === null || coverage < 80)) {
        addAlert('info', 'Todavía faltan costos históricos en parte de las ventas',
            `Cobertura verificable de costo guardado: ${coverage === null ? 'no medible' : coverage.toFixed(1) + '%'} de la facturación detallada del período.`,
            'Usar el margen únicamente sobre las ventas con costo documentado; mejorar la cobertura con nuevas ventas.',
            { href: 'cajas.html#estadisticas', text: 'Estadísticas' });
    }

    if (paymentMismatch > 0) {
        addAlert('review', `${paymentMismatch} ticket(s) con medios de pago por conciliar`,
            'La suma de Efectivo y Mercado Pago no coincide exactamente con el total guardado de algunos tickets.',
            'Revisar movimientos editados y diferencias antes de cerrar o facturar.',
            { href: 'cajas.html#historial', text: 'Revisar Cajas' });
    }

    const openBoxes = boxes.filter(box => box.estado === 'abierta' && box.eliminada !== true);
    if (openBoxes.length > 1) {
        addAlert('critical', `${openBoxes.length} cajas abiertas simultáneamente`,
            'La app encuentra más de una caja marcada como abierta.',
            'Validar qué turno corresponde antes de seguir operando.',
            { href: 'cajas.html#historial', text: 'Ir a Cajas' });
    }

    if (!recent.length) {
        addAlert('info', 'Sin tickets en este período',
            'No hay ventas registradas para construir tendencias confiables.',
            'Ampliar el período o confirmar que los registros estén cargados.');
    }

    if (!alerts.some(alert => alert.priority === 'critical' || alert.priority === 'review') && recent.length) {
        addAlert('positive', 'Sin alertas prioritarias con los datos disponibles',
            `Se revisaron ${recent.length} ventas, ${productRows.length} productos vendidos y ${materials.length} materias primas.`,
            'Continuar registrando costos y ventas y consultar la evolución periódicamente.');
    }

    alerts.sort((a, b) => {
        const order = { critical: 0, review: 1, info: 2, positive: 3 };
        return order[a.priority] - order[b.priority];
    });

    const chartDays = [];
    const weekdayTotals = Array(7).fill(0);
    const weekdayOccurrences = Array(7).fill(0);
    for (let offset = days - 1; offset >= 0; offset -= 1) {
        const date = new Date(clock);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - offset);
        const key = localDay(date);
        const value = daySales.get(key) || 0;
        chartDays.push({ key, label: `${date.getDate()}/${date.getMonth() + 1}`, value });
        weekdayTotals[date.getDay()] += value;
        weekdayOccurrences[date.getDay()] += 1;
    }

    const weekdays = weekdayTotals.map((total, day) => ({
        day,
        avg: weekdayOccurrences[day] ? total / weekdayOccurrences[day] : 0,
        total
    }));

    return {
        days,
        recentCount: recent.length,
        previousCount: previous.length,
        revenue: currentRevenue,
        previousRevenue,
        revenueChange: deltaPercent(currentRevenue, previousRevenue),
        avgTicket: currentAverage,
        previousAvgTicket: previousAverage,
        avgChange: deltaPercent(currentAverage, previousAverage),
        ticketChange: deltaPercent(recent.length, previous.length),
        grossMargin: coveredRevenue > 0 ? ((coveredRevenue - snapshotCost) / coveredRevenue) * 100 : null,
        coveredRevenue,
        coverage,
        snapshotLines,
        totalLines,
        unmatchedSales,
        cashRevenue,
        mpRevenue,
        alertCount: alerts.filter(alert => alert.priority === 'critical' || alert.priority === 'review').length,
        alerts,
        productRows,
        revenueConcentration,
        chartDays,
        weekdays,
        dataQuality: {
            invalidSalesDates: sales.filter(sale => !dateMillis(sale.fecha)).length,
            missingRecipeCosts: missingCost.length,
            paymentMismatch,
            openBoxes: openBoxes.length
        }
    };
};
