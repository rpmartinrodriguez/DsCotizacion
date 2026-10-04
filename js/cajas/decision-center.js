import {
    getDocs, collection, query, where, Timestamp
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { formatCurrency } from "../core/format.js";
import { escapeHtml } from "../core/html.js";
import { analyzeDecisionData } from "./decision-engine.js";

const formatAmount = (value) => formatCurrency(Number(value) || 0);
const formatPct = (value) =>
    Number.isFinite(value)
        ? `${value > 0 ? '+' : ''}${value.toLocaleString('es-AR', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        })}%`
        : 'Sin base comparable';

const formatMargin = (value) =>
    Number.isFinite(value)
        ? `${value.toLocaleString('es-AR', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        })}%`
        : 'Sin datos';

const WEEKDAY_NAMES = ['Dom.', 'Lun.', 'Mar.', 'Mié.', 'Jue.', 'Vie.', 'Sáb.'];

export function setupDecisionCenter(db) {
    const root = document.getElementById('section-decisiones');
    const periodSelect = document.getElementById('decision-periodo');
    const refreshButton = document.getElementById('decision-recalcular');
    const status = document.getElementById('decision-estado');
    const content = document.getElementById('decision-contenido');
    const alertsContainer = document.getElementById('decision-alertas');
    const count = document.getElementById('decision-alertas-contador');
    const productsContainer = document.getElementById('decision-top-productos');
    const concentrationText = document.getElementById('decision-concentracion');
    const weekdaysContainer = document.getElementById('decision-dias');
    const qualityContainer = document.getElementById('decision-calidad');
    const canvas = document.getElementById('decision-chart-ventas');
    const chartFallback = document.getElementById('decision-chart-fallback');

    let chartInstance = null;
    let loadedData = null;
    let requestInProgress = null;

    const setText = (id, value) => {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
    };

    const renderAlerts = (result) => {
        if (!alertsContainer || !count) return;

        count.textContent = result.alertCount
            ? `${result.alertCount} por revisar`
            : 'Sin alertas urgentes';

        alertsContainer.innerHTML = result.alerts.map((alert, index) => {
            const labels = {
                critical: 'Prioridad alta',
                review: 'Para revisar',
                info: 'Dato pendiente',
                positive: 'Sin alertas'
            };
            const link = alert.link?.href
                ? `<a href="${escapeHtml(alert.link.href)}" class="ds-decision-action">${escapeHtml(alert.link.text || 'Ir al módulo')} <span aria-hidden="true">↗</span></a>`
                : '';

            return `
                <article class="ds-decision-alert is-${alert.priority}">
                    <div class="ds-decision-alert-head">
                        <span class="ds-decision-alert-number">${String(index + 1).padStart(2, '0')}</span>
                        <span class="ds-decision-severity">${labels[alert.priority] || 'Informativo'}</span>
                    </div>
                    <h4>${escapeHtml(alert.title)}</h4>
                    <p>${escapeHtml(alert.evidence)}</p>
                    <div class="ds-decision-next"><strong>Qué haría:</strong> ${escapeHtml(alert.action)}</div>
                    ${link}
                </article>
            `;
        }).join('');
    };

    const renderChart = (result) => {
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
        if (!canvas) return;

        if (!window.Chart) {
            canvas.hidden = true;
            if (chartFallback) {
                chartFallback.hidden = false;
                chartFallback.textContent = 'El gráfico no está disponible; los indicadores y recomendaciones siguen calculándose.';
            }
            return;
        }

        canvas.hidden = false;
        if (chartFallback) chartFallback.hidden = true;

        chartInstance = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels: result.chartDays.map(day => day.label),
                datasets: [{
                    label: 'Ventas',
                    data: result.chartDays.map(day => day.value),
                    borderColor: '#cf6290',
                    backgroundColor: 'rgba(207,98,144,0.1)',
                    fill: true,
                    tension: .26,
                    borderWidth: 2,
                    pointRadius: result.days <= 7 ? 3 : 0,
                    pointHoverRadius: 4
                }]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => formatAmount(context.parsed.y)
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { maxTicksLimit: 8, color: '#887d86', font: { size: 10 } },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            maxTicksLimit: 5,
                            color: '#887d86',
                            callback: value =>
                                value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` :
                                value >= 1000 ? `${Math.round(value / 1000)}k` :
                                String(value)
                        },
                        grid: { color: '#f2edf0' }
                    }
                }
            }
        });
    };

    const renderWeekdays = (result) => {
        if (!weekdaysContainer) return;

        const max = Math.max(1, ...result.weekdays.map(day => day.avg));
        const inWeekOrder = [1, 2, 3, 4, 5, 6, 0];
        weekdaysContainer.innerHTML = inWeekOrder.map(index => {
            const day = result.weekdays[index];
            const width = Math.max(0, (day.avg / max) * 100);
            return `
                <div class="ds-decision-weekday">
                    <span>${WEEKDAY_NAMES[index]}</span>
                    <div class="ds-decision-weekday-track"><div style="width:${width.toFixed(2)}%"></div></div>
                    <strong>${formatAmount(day.avg)}</strong>
                </div>
            `;
        }).join('');
    };

    const renderProducts = (result) => {
        if (!productsContainer) return;
        if (!result.productRows.length) {
            productsContainer.innerHTML = '<p class="ds-decision-muted">No hay productos vendidos en este período.</p>';
            if (concentrationText) concentrationText.textContent = '';
            return;
        }

        const top = result.productRows.slice(0, 8);
        const max = Math.max(1, ...top.map(product => product.revenue));
        productsContainer.innerHTML = top.map((product, index) => {
            const width = product.revenue / max * 100;
            const margin = Number.isFinite(product.historicalMargin)
                ? ` · margen documentado ${formatMargin(product.historicalMargin)}`
                : '';
            return `
                <div class="ds-decision-product">
                    <div class="ds-decision-product-heading">
                        <div><span class="ds-decision-rank">${index + 1}</span><strong>${escapeHtml(product.name)}</strong></div>
                        <b>${formatAmount(product.revenue)}</b>
                    </div>
                    <div class="ds-decision-product-track"><div style="width:${width.toFixed(2)}%"></div></div>
                    <small>${product.units.toLocaleString('es-AR')} unidades${margin}</small>
                </div>
            `;
        }).join('');

        if (concentrationText) {
            concentrationText.textContent = Number.isFinite(result.revenueConcentration)
                ? `Los 3 productos principales representan ${formatMargin(result.revenueConcentration)} de la facturación detallada por producto. La concentración alta no significa por sí sola un problema.`
                : 'No hay detalle suficiente para calcular concentración.';
        }
    };

    const renderQuality = (result) => {
        if (!qualityContainer) return;
        const coverage = result.coverage;
        const coverageLabel = Number.isFinite(coverage)
            ? formatMargin(coverage)
            : 'Sin base';
        const rows = [
            ['Ventas con costos documentados', coverageLabel,
                'Porción de facturación detallada respaldada por un costo congelado mayor a cero'],
            ['Líneas con costo histórico', `${result.snapshotLines} de ${result.totalLines}`,
                'Las ventas antiguas pueden no tener el costo al momento de vender'],
            ['Productos vendidos sin costo confiable', result.dataQuality.missingRecipeCosts,
                'Hace falta revisar costos y componentes de sus recetas'],
            ['Tickets con diferencia entre pagos y total', result.dataQuality.paymentMismatch,
                'Puede deberse a ediciones o cargas antiguas; revisar manualmente'],
            ['Cajas abiertas', result.dataQuality.openBoxes,
                'Más de una caja abierta requiere comprobación'],
            ['Tickets sin detalle de productos', result.unmatchedSales,
                'Se contabilizan en ingresos, no en ranking por producto']
        ];

        qualityContainer.innerHTML = rows.map(([name, value, desc]) => `
            <div class="ds-decision-quality-row">
                <div>
                    <strong>${escapeHtml(name)}</strong>
                    <small>${escapeHtml(desc)}</small>
                </div>
                <b>${escapeHtml(String(value))}</b>
            </div>
        `).join('');
    };

    const render = () => {
        if (!loadedData) return;

        const target = Number(localStorage.getItem('dsPriceReviewTargetMargin'));
        const targetMargin = target > 0 && target < 100 ? target : 40;
        const periodDays = Number(periodSelect?.value) || 30;

        const result = analyzeDecisionData({
            sales: loadedData.sales,
            recipes: loadedData.recipes,
            materials: loadedData.materials,
            boxes: loadedData.boxes,
            periodDays,
            targetMargin
        });

        setText('decision-ventas', formatAmount(result.revenue));
        setText('decision-ventas-cambio', `${formatPct(result.revenueChange)} vs. período anterior`);
        setText('decision-tickets', result.recentCount.toLocaleString('es-AR'));
        setText('decision-tickets-cambio', `${formatPct(result.ticketChange)} vs. período anterior`);
        setText('decision-ticket-promedio', formatAmount(result.avgTicket));
        setText('decision-ticket-cambio', `${formatPct(result.avgChange)} vs. período anterior`);
        setText('decision-margen', formatMargin(result.grossMargin));
        setText('decision-cobertura', `Cobertura documentada: ${formatMargin(result.coverage)} de ventas detalladas`);

        renderAlerts(result);
        renderChart(result);
        renderWeekdays(result);
        renderProducts(result);
        renderQuality(result);

        if (status) {
            status.textContent = `Analizados ${result.recentCount} tickets de ${periodDays} días; comparados con los ${periodDays} anteriores. Margen objetivo: ${targetMargin}%. Actualizado ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}.`;
        }
        if (content) content.hidden = false;
    };

    const load = async ({ force = false } = {}) => {
        if (!root) return;
        if (requestInProgress) return requestInProgress;
        if (loadedData && !force) {
            render();
            return;
        }

        const originalText = refreshButton?.textContent;
        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.textContent = 'Analizando…';
        }
        if (status) status.textContent = 'Leyendo ventas, cajas, recetas y costos registrados…';

        requestInProgress = (async () => {
            try {
                // 90 días actuales + 90 anteriores como máximo; incluimos
                // margen adicional para horario local/verano y días parciales.
                const horizon = Timestamp.fromDate(new Date(Date.now() - 185 * 86400000));
                const [sales, boxes, recipes, materials] = await Promise.all([
                    getDocs(query(collection(db, 'ventasMostrador'), where('fecha', '>=', horizon))),
                    getDocs(collection(db, 'cajas')),
                    getDocs(collection(db, 'recetas')),
                    getDocs(collection(db, 'materiasPrimas'))
                ]);

                loadedData = {
                    sales: sales.docs.map(doc => ({ ...doc.data(), id: doc.id })),
                    boxes: boxes.docs.map(doc => ({ ...doc.data(), id: doc.id })),
                    recipes: recipes.docs.map(doc => ({ ...doc.data(), id: doc.id })),
                    materials: materials.docs.map(doc => ({ ...doc.data(), id: doc.id }))
                };

                render();
            } catch (error) {
                console.error('No se pudo cargar el Centro de decisiones:', error);
                if (status) status.textContent = 'No pudimos cargar el análisis. Verificá tu conexión y los permisos de Cajas antes de reintentar.';
                if (!loadedData && content) content.hidden = true;
            } finally {
                if (refreshButton) {
                    refreshButton.disabled = false;
                    refreshButton.textContent = originalText || 'Actualizar análisis';
                }
                requestInProgress = null;
            }
        })();

        return requestInProgress;
    };

    periodSelect?.addEventListener('change', () => {
        if (loadedData) render();
        else load();
    });
    refreshButton?.addEventListener('click', () => load({ force: true }));

    return {
        show: () => load(),
        destroy: () => {
            if (chartInstance) chartInstance.destroy();
        }
    };
}
