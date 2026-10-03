import {
    getFirestore,
    collection,
    getDocs,
    query,
    doc,
    getDoc,
    updateDoc,
    Timestamp,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { calculateRecipeUnitCost, calculateRoundedSalePrice, getEffectiveUnitCost } from "./core/pricing.js";
import { formatCurrency } from "./core/format.js";
import { escapeHtml, escapeAttribute } from "./core/html.js";

export function setupPrecios(app) {
    const db = getFirestore(app);
    const recetasCollection = collection(db, 'recetas');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const ventasCollection = collection(db, 'ventasMostrador');

    const container = document.getElementById('lista-precios-container');
    const inputMayorista = document.getElementById('porcentaje-mayorista');
    const inputMinorista = document.getElementById('porcentaje-minorista');
    const btnPdfCosto = document.getElementById('btn-pdf-costo');
    const btnPdfMayorista = document.getElementById('btn-pdf-mayorista');
    const btnPdfMinorista = document.getElementById('btn-pdf-minorista');

    const reviewBody = document.getElementById('revision-precios-body');
    const reviewTargetInput = document.getElementById('revision-margen-objetivo');
    const reviewDropInput = document.getElementById('revision-caida-alerta');
    const reviewSearch = document.getElementById('revision-busqueda');
    const reviewFilters = document.getElementById('revision-filtros');
    const reviewCorrect = document.getElementById('revision-kpi-correctos');
    const reviewReview = document.getElementById('revision-kpi-revisar');
    const reviewCritical = document.getElementById('revision-kpi-criticos');
    const reviewImpact = document.getElementById('revision-kpi-impacto');

    const reviewModal = document.getElementById('revision-precio-modal');
    const reviewModalClose = document.getElementById('revision-modal-cerrar');
    const reviewModalProduct = document.getElementById('revision-modal-producto');
    const reviewModalCategory = document.getElementById('revision-modal-categoria');
    const reviewModalPrice = document.getElementById('revision-modal-precio');
    const reviewModalCost = document.getElementById('revision-modal-costo');
    const reviewModalCurrentMargin = document.getElementById('revision-modal-margen-actual');
    const reviewModalHistoricalMargin = document.getElementById('revision-modal-margen-historico');
    const reviewModalSuggested = document.getElementById('revision-modal-sugerido');
    const reviewModalDifference = document.getElementById('revision-modal-diferencia');
    const reviewModalTarget = document.getElementById('revision-modal-objetivo');
    const reviewModalMaterials = document.getElementById('revision-modal-insumos');
    const reviewModalSales = document.getElementById('revision-modal-ventas');
    const reviewLastDecision = document.getElementById('revision-modal-ultima-decision');
    const reviewBtnKeep = document.getElementById('revision-btn-mantener');
    const reviewBtnCustom = document.getElementById('revision-btn-personalizado');
    const reviewBtnApply = document.getElementById('revision-btn-aplicar');

    const REVIEW_TARGET_KEY = 'dsPriceReviewTargetMargin';
    const REVIEW_DROP_KEY = 'dsPriceReviewDropThreshold';

    let recetasConCosto = [];
    let materiasPrimasMap = new Map();
    let ventasRecientes = [];
    let margenGlobal = 0;
    let reviewRows = [];
    let reviewFilter = 'todos';
    let selectedReviewId = null;
    let logoDataUrlCache = null;

    const normalizarTexto = (value) =>
        String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();

    const timestampMillis = (value) => {
        if (!value) return 0;
        if (typeof value.toMillis === 'function') return value.toMillis();
        if (value.seconds !== undefined) return Number(value.seconds) * 1000;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    };

    const formatPercent = (value, digits = 1) =>
        Number.isFinite(Number(value))
            ? `${Number(value).toLocaleString('es-AR', {
                minimumFractionDigits: digits,
                maximumFractionDigits: digits
            })}%`
            : '—';

    const formatPoints = (value) => {
        if (!Number.isFinite(Number(value))) return '—';
        const numeric = Number(value);
        return `${numeric > 0 ? '+' : ''}${numeric.toLocaleString('es-AR', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        })} pts`;
    };

    const getReviewTarget = () => {
        const value = Number(reviewTargetInput?.value);
        return Number.isFinite(value) && value > 0 && value < 100 ? value : 40;
    };

    const getReviewDropThreshold = () => {
        const value = Number(reviewDropInput?.value);
        return Number.isFinite(value) && value > 0 ? value : 5;
    };

    const roundRetailPrice = (rawPrice) =>
        calculateRoundedSalePrice(rawPrice, 0, { roundTo: 100, midpointDown: true });

    const grossMarginPercent = (price, cost) => {
        const salePrice = Number(price) || 0;
        const unitCost = Number(cost) || 0;
        return salePrice > 0 ? ((salePrice - unitCost) / salePrice) * 100 : null;
    };

    const targetPriceForMargin = (cost, targetMargin) => {
        const unitCost = Number(cost) || 0;
        const target = Number(targetMargin) || 0;
        if (unitCost <= 0 || target <= 0 || target >= 100) return 0;

        return roundRetailPrice(unitCost / (1 - target / 100));
    };

    const markupForPrice = (cost, price) => {
        const unitCost = Number(cost) || 0;
        const salePrice = Number(price) || 0;
        if (unitCost <= 0 || salePrice <= 0) return 0;
        return ((salePrice / unitCost) - 1) * 100;
    };

    const calculateCurrentPrice = (recipe) => {
        const hasIndividual = recipe?.margenIndividual !== undefined
            && recipe?.margenIndividual !== null
            && recipe?.margenIndividual !== '';

        const markup = hasIndividual
            ? Number(recipe.margenIndividual) || 0
            : Number(margenGlobal) || 0;

        return calculateRoundedSalePrice(
            Number(recipe.costoCalculado) || 0,
            markup,
            { roundTo: 100, midpointDown: true }
        );
    };

    const cargarLogoDataUrl = async () => {
        if (logoDataUrlCache) return logoDataUrlCache;

        try {
            const response = await fetch('assets/logo.png', { cache: 'force-cache' });
            if (!response.ok) throw new Error(`No se pudo cargar el logo: ${response.status}`);

            const blob = await response.blob();
            logoDataUrlCache = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            return logoDataUrlCache;
        } catch (error) {
            console.warn("El PDF se generará sin marca de agua:", error);
            return null;
        }
    };

    const calcularCostoUnitarioReceta = (receta) => {
        return calculateRecipeUnitCost(receta, materiasPrimasMap);
    };

    const renderizarListaPrecios = (recetas) => {
        if (!container) return;
        container.innerHTML = '';

        if (recetas.length === 0) {
            container.textContent = 'No hay recetas creadas.';
            return;
        }

        const porCategoria = {};

        recetas.forEach((receta) => {
            const categoria = receta.categoria || 'Sin categoría';
            if (!porCategoria[categoria]) porCategoria[categoria] = [];
            porCategoria[categoria].push(receta);
        });

        Object.keys(porCategoria).sort().forEach((categoria) => {
            const titulo = document.createElement('h3');
            titulo.className = 'card__subtitle';
            titulo.textContent = categoria;
            container.appendChild(titulo);

            const lista = document.createElement('ul');
            lista.className = 'lista-sencilla';

            porCategoria[categoria]
                .sort((a, b) => String(a.nombreTorta || '').localeCompare(String(b.nombreTorta || ''), 'es'))
                .forEach((receta) => {
                    const item = document.createElement('li');

                    const nombre = document.createElement('span');
                    nombre.textContent = `${receta.nombreTorta} (x unidad)`;

                    const costo = document.createElement('strong');
                    costo.style.color = 'var(--primary-color)';
                    costo.style.fontSize = '1.1rem';
                    costo.textContent = formatCurrency(receta.costoCalculado);

                    item.append(nombre, costo);
                    lista.appendChild(item);
                });

            container.appendChild(lista);
        });
    };

    const indexarVentasRecientes = () => {
        const byId = new Map();
        const byName = new Map();
        const ahora = Date.now();
        const hace30Dias = ahora - (30 * 24 * 60 * 60 * 1000);

        const add = (map, key, payload) => {
            if (!key) return;
            if (!map.has(key)) {
                map.set(key, {
                    unidades: 0,
                    facturacion: 0,
                    costoSnapshot: 0,
                    facturacionSnapshot: 0,
                    unidadesSnapshot: 0,
                    tickets: new Set(),
                    ultimaVentaMs: 0
                });
            }

            const target = map.get(key);
            target.unidades += payload.unidades;
            target.facturacion += payload.facturacion;
            target.costoSnapshot += payload.costoSnapshot;
            target.facturacionSnapshot += payload.facturacionSnapshot;
            target.unidadesSnapshot += payload.unidadesSnapshot;
            target.tickets.add(payload.ticketId);
            target.ultimaVentaMs = Math.max(target.ultimaVentaMs, payload.fechaMs);
        };

        ventasRecientes.forEach((venta) => {
            const fechaMs = timestampMillis(venta.fecha);
            if (!fechaMs || fechaMs < hace30Dias) return;

            const items = Array.isArray(venta.items) ? venta.items : [];
            items.forEach((item) => {
                const unidades = Number(item.cantidad) || 0;
                const precio = Number(item.precio) || 0;
                const facturacion = precio * unidades;
                const tieneSnapshot =
                    Number(item.costoSnapshotVersion) >= 1
                    && Number.isFinite(Number(item.costoTotalVenta));

                const payload = {
                    unidades,
                    facturacion,
                    costoSnapshot: tieneSnapshot ? Number(item.costoTotalVenta) : 0,
                    facturacionSnapshot: tieneSnapshot ? facturacion : 0,
                    unidadesSnapshot: tieneSnapshot ? unidades : 0,
                    ticketId: venta.id,
                    fechaMs
                };

                if (item.id) add(byId, String(item.id), payload);
                const nameKey = normalizarTexto(item.nombre);
                if (nameKey) add(byName, nameKey, payload);
            });
        });

        return { byId, byName };
    };

    const buildMaterialDrivers = (recipe) => {
        const yieldAmount = Number(recipe.rendimiento) || 1;
        const ingredients = Array.isArray(recipe.ingredientes) ? recipe.ingredientes : [];

        return ingredients
            .map((ingredient) => {
                const material = materiasPrimasMap.get(ingredient.idMateriaPrima);
                if (!material) return null;

                const unitCost = getEffectiveUnitCost(material);
                const quantity = Number(ingredient.cantidad) || 0;
                const contribution = (unitCost * quantity) / yieldAmount;
                const variation = Number(material.proveedorVariacionPct);

                return {
                    id: ingredient.idMateriaPrima,
                    nombre: material.nombre || ingredient.nombreMateriaPrima || 'Materia prima',
                    unidad: material.unidad || ingredient.unidad || '',
                    unitCost,
                    contribution,
                    variation: Number.isFinite(variation) ? variation : null,
                    checkedAt: material.proveedorUltimaConsulta || null
                };
            })
            .filter(Boolean)
            .sort((a, b) => {
                const aVar = Math.abs(Number(a.variation) || 0);
                const bVar = Math.abs(Number(b.variation) || 0);
                if (aVar !== bVar) return bVar - aVar;
                return b.contribution - a.contribution;
            });
    };

    const buildReviewRows = () => {
        const target = getReviewTarget();
        const dropThreshold = getReviewDropThreshold();
        const salesIndex = indexarVentasRecientes();

        reviewRows = recetasConCosto.map((recipe) => {
            const currentCost = Number(recipe.costoCalculado) || 0;
            const currentPrice = calculateCurrentPrice(recipe);
            const currentMargin = grossMarginPercent(currentPrice, currentCost);

            const sales = salesIndex.byId.get(String(recipe.id))
                || salesIndex.byName.get(normalizarTexto(recipe.nombreTorta))
                || {
                    unidades: 0,
                    facturacion: 0,
                    costoSnapshot: 0,
                    facturacionSnapshot: 0,
                    unidadesSnapshot: 0,
                    tickets: new Set(),
                    ultimaVentaMs: 0
                };

            const historicalMargin = sales.facturacionSnapshot > 0
                ? ((sales.facturacionSnapshot - sales.costoSnapshot) / sales.facturacionSnapshot) * 100
                : null;

            const lossPoints = Number.isFinite(historicalMargin) && Number.isFinite(currentMargin)
                ? historicalMargin - currentMargin
                : null;

            const targetPrice = targetPriceForMargin(currentCost, target);
            const suggestedPrice = Math.max(currentPrice, targetPrice);
            const suggestedDelta = suggestedPrice - currentPrice;
            const suggestedDeltaPct = currentPrice > 0
                ? (suggestedDelta / currentPrice) * 100
                : null;

            const comparisonMargin = Number.isFinite(historicalMargin)
                ? historicalMargin
                : target;
            const marginGap = Number.isFinite(currentMargin)
                ? Math.max(0, comparisonMargin - currentMargin)
                : 0;
            const monthlyImpact = currentPrice > 0
                ? currentPrice * (marginGap / 100) * sales.unidades
                : 0;

            let status = 'good';
            const criticalByMargin = Number.isFinite(currentMargin) && currentMargin < (target - 10);
            const criticalByLoss = Number.isFinite(lossPoints) && lossPoints >= Math.max(10, dropThreshold * 2);
            const reviewByMargin = Number.isFinite(currentMargin) && currentMargin < target;
            const reviewByLoss = Number.isFinite(lossPoints) && lossPoints >= dropThreshold;

            if (criticalByMargin || criticalByLoss) status = 'critical';
            else if (reviewByMargin || reviewByLoss) status = 'review';

            return {
                ...recipe,
                currentCost,
                currentPrice,
                currentMargin,
                historicalMargin,
                lossPoints,
                suggestedPrice,
                suggestedDelta,
                suggestedDeltaPct,
                monthlyImpact,
                sales,
                status,
                materialDrivers: buildMaterialDrivers(recipe)
            };
        });

        reviewRows.sort((a, b) => {
            const order = { critical: 0, review: 1, good: 2 };
            const statusDiff = order[a.status] - order[b.status];
            if (statusDiff !== 0) return statusDiff;
            if (b.monthlyImpact !== a.monthlyImpact) return b.monthlyImpact - a.monthlyImpact;
            return String(a.nombreTorta || '').localeCompare(String(b.nombreTorta || ''), 'es');
        });
    };

    const renderReviewKpis = () => {
        const correct = reviewRows.filter(row => row.status === 'good').length;
        const review = reviewRows.filter(row => row.status === 'review').length;
        const critical = reviewRows.filter(row => row.status === 'critical').length;
        const impact = reviewRows.reduce((sum, row) => sum + (Number(row.monthlyImpact) || 0), 0);

        if (reviewCorrect) reviewCorrect.textContent = correct;
        if (reviewReview) reviewReview.textContent = review;
        if (reviewCritical) reviewCritical.textContent = critical;
        if (reviewImpact) reviewImpact.textContent = formatCurrency(impact);
    };

    const renderReviewTable = () => {
        if (!reviewBody) return;

        const searchTerm = normalizarTexto(reviewSearch?.value);
        const visible = reviewRows.filter((row) => {
            const matchesFilter = reviewFilter === 'todos' || row.status === reviewFilter;
            const matchesSearch = !searchTerm
                || normalizarTexto(`${row.nombreTorta} ${row.categoria || ''}`).includes(searchTerm);
            return matchesFilter && matchesSearch;
        });

        if (!visible.length) {
            reviewBody.innerHTML = '<tr><td colspan="7" class="ds-review-empty">No hay productos que coincidan con este filtro.</td></tr>';
            return;
        }

        reviewBody.innerHTML = visible.map((row) => {
            const statusLabel = row.status === 'critical'
                ? 'Crítico'
                : row.status === 'review'
                    ? 'Revisar'
                    : 'Correcto';

            const historicalHtml = Number.isFinite(row.historicalMargin)
                ? formatPercent(row.historicalMargin)
                : '<span class="ds-review-muted">Sin snapshot suficiente</span>';

            const changeHtml = Number.isFinite(row.lossPoints)
                ? `<span class="ds-review-change ${row.lossPoints > 0 ? 'is-loss' : 'is-gain'}">${row.lossPoints > 0 ? '↓ ' : row.lossPoints < 0 ? '↑ ' : ''}${formatPoints(Math.abs(row.lossPoints))}</span>`
                : '<span class="ds-review-muted">—</span>';

            return `
                <tr class="is-${row.status}">
                    <td>
                        <div class="ds-review-product">
                            <strong>${escapeHtml(row.nombreTorta || 'Producto')}</strong>
                            <span>${escapeHtml(row.categoria || 'Sin categoría')}</span>
                            <small class="ds-review-status is-${row.status}">${statusLabel}</small>
                        </div>
                    </td>
                    <td>
                        <strong>${formatCurrency(row.currentPrice)}</strong>
                        <small class="ds-review-secondary">Costo ${formatCurrency(row.currentCost)}</small>
                    </td>
                    <td>${historicalHtml}</td>
                    <td><strong>${formatPercent(row.currentMargin)}</strong></td>
                    <td>${changeHtml}</td>
                    <td>
                        <strong>${row.monthlyImpact > 0 ? '-' + formatCurrency(row.monthlyImpact) : formatCurrency(0)}</strong>
                        <small class="ds-review-secondary">${row.sales.unidades.toLocaleString('es-AR')} u. / 30d</small>
                    </td>
                    <td>
                        <button type="button" class="ds-review-open-btn" data-review-id="${escapeAttribute(row.id)}">Revisar</button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    const renderReview = () => {
        buildReviewRows();
        renderReviewKpis();
        renderReviewTable();

        if (selectedReviewId && reviewModal?.classList.contains('visible')) {
            openReviewModal(selectedReviewId);
        }
    };

    const renderLastDecision = (row) => {
        if (!reviewLastDecision) return;
        const history = Array.isArray(row.historialCambiosPrecio)
            ? row.historialCambiosPrecio
            : [];
        const last = history[0];

        if (!last) {
            reviewLastDecision.hidden = true;
            reviewLastDecision.innerHTML = '';
            return;
        }

        reviewLastDecision.hidden = false;
        const action = last.accion === 'mantener'
            ? 'Se mantuvo el precio'
            : last.accion === 'personalizado'
                ? 'Se definió otro precio'
                : 'Se aplicó una sugerencia';
        const date = timestampMillis(last.fecha)
            ? new Date(timestampMillis(last.fecha)).toLocaleString('es-AR')
            : '';

        reviewLastDecision.innerHTML = `
            <strong>Última decisión: ${escapeHtml(action)}</strong>
            <span>${escapeHtml(date)} · ${formatCurrency(Number(last.precioAnterior) || 0)} → ${formatCurrency(Number(last.precioNuevo) || 0)}</span>
        `;
    };

    const openReviewModal = (id) => {
        const row = reviewRows.find(item => String(item.id) === String(id));
        if (!row || !reviewModal) return;

        selectedReviewId = row.id;

        reviewModalProduct.textContent = row.nombreTorta || 'Producto';
        reviewModalCategory.textContent = row.categoria || 'Sin categoría';
        reviewModalPrice.textContent = formatCurrency(row.currentPrice);
        reviewModalCost.textContent = formatCurrency(row.currentCost);
        reviewModalCurrentMargin.textContent = formatPercent(row.currentMargin);
        reviewModalHistoricalMargin.textContent = Number.isFinite(row.historicalMargin)
            ? formatPercent(row.historicalMargin)
            : 'Sin historial suficiente';
        reviewModalSuggested.textContent = formatCurrency(row.suggestedPrice);
        reviewModalTarget.textContent = `Objetivo ${formatPercent(getReviewTarget(), 0)}`;

        if (reviewModalDifference) {
            if (row.suggestedDelta > 0) {
                reviewModalDifference.textContent = `+${formatCurrency(row.suggestedDelta)} · +${Number(row.suggestedDeltaPct || 0).toFixed(1)}% sobre el precio actual`;
            } else if (row.suggestedDelta < 0) {
                reviewModalDifference.textContent = `${formatCurrency(row.suggestedDelta)} · el precio actual supera el objetivo`;
            } else {
                reviewModalDifference.textContent = 'El precio actual ya coincide con el objetivo.';
            }
        }

        if (reviewModalMaterials) {
            const drivers = row.materialDrivers.slice(0, 6);
            reviewModalMaterials.innerHTML = drivers.length
                ? drivers.map((material) => {
                    const variation = material.variation;
                    const variationClass = Number(variation) >= 10
                        ? 'is-alert'
                        : Number(variation) > 0
                            ? 'is-up'
                            : Number(variation) < 0
                                ? 'is-down'
                                : 'is-same';
                    const variationText = Number.isFinite(variation)
                        ? `${variation > 0 ? '+' : ''}${variation.toFixed(1)}%`
                        : 'Sin variación';

                    return `
                        <div class="ds-review-material">
                            <div>
                                <strong>${escapeHtml(material.nombre)}</strong>
                                <span>Aporta ${formatCurrency(material.contribution)} al costo unitario</span>
                            </div>
                            <span class="ds-cost-change ${variationClass}">${variationText}</span>
                        </div>
                    `;
                }).join('')
                : '<p class="ds-review-muted">No hay ingredientes con información de costo.</p>';
        }

        if (reviewModalSales) {
            const marginHistoryText = Number.isFinite(row.historicalMargin)
                ? formatPercent(row.historicalMargin)
                : 'Sin snapshot suficiente';

            reviewModalSales.innerHTML = `
                <div><span>Unidades / 30 días</span><strong>${row.sales.unidades.toLocaleString('es-AR')}</strong></div>
                <div><span>Facturación / 30 días</span><strong>${formatCurrency(row.sales.facturacion)}</strong></div>
                <div><span>Margen histórico</span><strong>${marginHistoryText}</strong></div>
                <div><span>Ventas con costo histórico</span><strong>${row.sales.unidadesSnapshot.toLocaleString('es-AR')} u.</strong></div>
                <div><span>Impacto estimado</span><strong>${row.monthlyImpact > 0 ? '-' + formatCurrency(row.monthlyImpact) : formatCurrency(0)}</strong></div>
            `;
        }

        renderLastDecision(row);

        reviewBtnApply.disabled = row.currentCost <= 0 || row.suggestedPrice <= 0;
        reviewBtnCustom.disabled = row.currentCost <= 0;

        reviewModal.classList.add('visible');
    };

    const closeReviewModal = () => {
        reviewModal?.classList.remove('visible');
        selectedReviewId = null;
    };

    const persistPriceDecision = async (row, {
        action,
        newPrice = row.currentPrice,
        newMarkup = null
    }) => {
        const ref = doc(db, 'recetas', row.id);
        const snapshot = await getDoc(ref);
        if (!snapshot.exists()) throw new Error('La receta ya no existe.');

        const currentData = snapshot.data();
        const previousHistory = Array.isArray(currentData.historialCambiosPrecio)
            ? currentData.historialCambiosPrecio
            : [];

        const target = getReviewTarget();
        const now = Timestamp.now();
        const effectiveMarkup = newMarkup !== null
            ? Number(newMarkup)
            : Number(currentData.margenIndividual);

        const entry = {
            accion: action,
            fecha: now,
            precioAnterior: row.currentPrice,
            precioNuevo: newPrice,
            costoActual: row.currentCost,
            margenBrutoAnterior: row.currentMargin,
            margenBrutoHistorico: row.historicalMargin,
            margenBrutoObjetivo: target,
            margenIndividualAnterior: currentData.margenIndividual ?? null,
            margenIndividualNuevo: Number.isFinite(effectiveMarkup) ? effectiveMarkup : null,
            impactoMensualEstimado: row.monthlyImpact,
            unidadesUltimos30Dias: row.sales.unidades,
            origen: 'revision-precios'
        };

        const update = {
            historialCambiosPrecio: [entry, ...previousHistory].slice(0, 50),
            ultimaRevisionPrecio: now,
            ultimaDecisionPrecio: action
        };

        if (newMarkup !== null) {
            update.margenIndividual = Number(newMarkup);
        }

        await updateDoc(ref, update);

        const localRecipe = recetasConCosto.find(recipe => recipe.id === row.id);
        if (localRecipe) {
            Object.assign(localRecipe, update);
            if (newMarkup !== null) localRecipe.margenIndividual = Number(newMarkup);
        }

        renderReview();
        openReviewModal(row.id);
    };

    const applySuggestedPrice = async () => {
        const row = reviewRows.find(item => item.id === selectedReviewId);
        if (!row) return;

        const markup = markupForPrice(row.currentCost, row.suggestedPrice);
        const confirmed = window.confirm(
            `¿Aplicar ${formatCurrency(row.suggestedPrice)} a "${row.nombreTorta}"?\n\n`
            + `Costo actual: ${formatCurrency(row.currentCost)}\n`
            + `Margen actual: ${formatPercent(row.currentMargin)}\n`
            + `Margen objetivo: ${formatPercent(getReviewTarget(), 0)}\n\n`
            + 'La app guardará el porcentaje necesario sobre costo para mantener esta lógica en ventas futuras.'
        );

        if (!confirmed) return;

        reviewBtnApply.disabled = true;
        const original = reviewBtnApply.textContent;
        reviewBtnApply.textContent = 'Aplicando…';

        try {
            await persistPriceDecision(row, {
                action: 'sugerencia',
                newPrice: row.suggestedPrice,
                newMarkup: markup
            });
        } catch (error) {
            console.error('Error aplicando precio sugerido:', error);
            alert('No se pudo aplicar el nuevo precio.');
        } finally {
            reviewBtnApply.textContent = original;
            reviewBtnApply.disabled = false;
        }
    };

    const keepCurrentPrice = async () => {
        const row = reviewRows.find(item => item.id === selectedReviewId);
        if (!row) return;

        try {
            await persistPriceDecision(row, {
                action: 'mantener',
                newPrice: row.currentPrice,
                newMarkup: null
            });
        } catch (error) {
            console.error('Error registrando revisión de precio:', error);
            alert('No se pudo registrar la decisión.');
        }
    };

    const defineCustomPrice = async () => {
        const row = reviewRows.find(item => item.id === selectedReviewId);
        if (!row) return;

        const response = window.prompt(
            `Nuevo precio para ${row.nombreTorta}:\nCosto actual: ${formatCurrency(row.currentCost)}\nPrecio actual: ${formatCurrency(row.currentPrice)}`,
            String(Math.round(row.suggestedPrice || row.currentPrice))
        );

        if (response === null) return;

        const sanitized = String(response).replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.');
        const rawPrice = Number(sanitized);

        if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
            alert('Ingresá un precio válido.');
            return;
        }

        const newPrice = roundRetailPrice(rawPrice);
        const newMargin = grossMarginPercent(newPrice, row.currentCost);

        if (Number.isFinite(newMargin) && newMargin < 0) {
            const confirmed = window.confirm(
                `El precio ${formatCurrency(newPrice)} queda por debajo del costo actual (${formatCurrency(row.currentCost)}). ¿Querés continuar de todos modos?`
            );
            if (!confirmed) return;
        }

        const markup = markupForPrice(row.currentCost, newPrice);

        try {
            await persistPriceDecision(row, {
                action: 'personalizado',
                newPrice,
                newMarkup: markup
            });
        } catch (error) {
            console.error('Error guardando precio personalizado:', error);
            alert('No se pudo guardar el nuevo precio.');
        }
    };

    const generarPDF = async (titulo, porcentajeGanancia) => {
        if (recetasConCosto.length === 0) {
            alert("No hay recetas para generar la lista.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();
        const logoDataUrl = await cargarLogoDataUrl();

        if (logoDataUrl) {
            try {
                pdf.saveGraphicsState();
                pdf.setGState(new pdf.GState({ opacity: 0.08 }));
                pdf.addImage(logoDataUrl, 'PNG', 55, 90, 100, 100, 'dulce-sall-logo', 'FAST');
                pdf.restoreGraphicsState();
            } catch (error) {
                console.warn("No se pudo agregar la marca de agua al PDF:", error);
            }
        }

        pdf.setFontSize(21);
        pdf.text(titulo, 105, 20, { align: 'center' });
        pdf.setFontSize(10);
        pdf.setTextColor(110, 102, 110);
        pdf.text(
            `Dulce Sall · Generado el ${new Date().toLocaleDateString('es-AR')}`,
            105,
            28,
            { align: 'center' }
        );
        pdf.setTextColor(0, 0, 0);

        const filas = [];
        const porCategoria = {};

        recetasConCosto.forEach((receta) => {
            const categoria = receta.categoria || 'Sin categoría';
            if (!porCategoria[categoria]) porCategoria[categoria] = [];
            porCategoria[categoria].push(receta);
        });

        Object.keys(porCategoria).sort().forEach((categoria) => {
            porCategoria[categoria]
                .sort((a, b) => String(a.nombreTorta || '').localeCompare(String(b.nombreTorta || ''), 'es'))
                .forEach((receta) => {
                    const precioFinal = receta.costoCalculado * (1 + porcentajeGanancia / 100);

                    filas.push([
                        categoria,
                        receta.nombreTorta,
                        formatCurrency(precioFinal)
                    ]);
                });
        });

        pdf.autoTable({
            head: [['Categoría', 'Producto', 'Precio por unidad']],
            body: filas,
            startY: 36,
            theme: 'grid',
            headStyles: { fillColor: [217, 86, 145] },
            styles: { fontSize: 9, cellPadding: 3 }
        });

        pdf.save(`${titulo.replace(/\s+/g, '_')}.pdf`);
    };

    const setPdfButtonsDisabled = (disabled) => {
        [btnPdfCosto, btnPdfMayorista, btnPdfMinorista].forEach((button) => {
            if (button) button.disabled = disabled;
        });
    };

    const ejecutarGeneracion = async (button, titulo, porcentaje) => {
        const originalText = button.textContent;

        try {
            setPdfButtonsDisabled(true);
            button.textContent = 'Generando…';
            await generarPDF(titulo, porcentaje);
        } finally {
            setPdfButtonsDisabled(false);
            button.textContent = originalText;
        }
    };

    const setupEventListeners = () => {
        btnPdfCosto?.addEventListener('click', () => {
            ejecutarGeneracion(btnPdfCosto, 'Lista de Precios de Costo', 0);
        });

        btnPdfMayorista?.addEventListener('click', () => {
            const porcentaje = parseFloat(inputMayorista.value) || 0;
            ejecutarGeneracion(btnPdfMayorista, 'Lista de Precios Mayorista', porcentaje);
        });

        btnPdfMinorista?.addEventListener('click', () => {
            const porcentaje = parseFloat(inputMinorista.value) || 0;
            ejecutarGeneracion(btnPdfMinorista, 'Lista de Precios Minorista', porcentaje);
        });

        reviewTargetInput?.addEventListener('change', () => {
            const value = getReviewTarget();
            reviewTargetInput.value = value;
            localStorage.setItem(REVIEW_TARGET_KEY, String(value));
            renderReview();
        });

        reviewDropInput?.addEventListener('change', () => {
            const value = getReviewDropThreshold();
            reviewDropInput.value = value;
            localStorage.setItem(REVIEW_DROP_KEY, String(value));
            renderReview();
        });

        reviewSearch?.addEventListener('input', renderReviewTable);

        reviewFilters?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-review-filter]');
            if (!button) return;

            reviewFilter = button.dataset.reviewFilter || 'todos';
            reviewFilters.querySelectorAll('[data-review-filter]').forEach(item => {
                item.classList.toggle('is-active', item === button);
            });
            renderReviewTable();
        });

        reviewBody?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-review-id]');
            if (!button) return;
            openReviewModal(button.dataset.reviewId);
        });

        reviewModalClose?.addEventListener('click', closeReviewModal);
        reviewModal?.addEventListener('click', (event) => {
            if (event.target === reviewModal) closeReviewModal();
        });
        reviewBtnApply?.addEventListener('click', applySuggestedPrice);
        reviewBtnKeep?.addEventListener('click', keepCurrentPrice);
        reviewBtnCustom?.addEventListener('click', defineCustomPrice);
    };

    const init = async () => {
        try {
            const storedTarget = Number(localStorage.getItem(REVIEW_TARGET_KEY));
            const storedDrop = Number(localStorage.getItem(REVIEW_DROP_KEY));

            if (reviewTargetInput && storedTarget > 0 && storedTarget < 100) {
                reviewTargetInput.value = storedTarget;
            }

            if (reviewDropInput && storedDrop > 0) {
                reviewDropInput.value = storedDrop;
            }

            const configPromise = getDoc(doc(db, 'config', 'mostrador'))
                .catch((error) => {
                    console.warn('No se pudo leer el margen global del mostrador:', error);
                    return null;
                });

            const salesPromise = getDocs(
                query(ventasCollection, orderBy('fecha', 'desc'), limit(500))
            ).catch((error) => {
                console.warn('No se pudo leer el historial de ventas para revisión de precios:', error);
                return null;
            });

            const [snapshotRecetas, snapshotMateriasPrimas, configSnap, snapshotVentas] = await Promise.all([
                getDocs(query(recetasCollection)),
                getDocs(query(materiasPrimasCollection)),
                configPromise,
                salesPromise
            ]);

            const todasLasRecetas = snapshotRecetas.docs.map((recipeDoc) => ({
                id: recipeDoc.id,
                ...recipeDoc.data()
            }));

            materiasPrimasMap = new Map(
                snapshotMateriasPrimas.docs.map((materialDoc) => [materialDoc.id, {
                    id: materialDoc.id,
                    ...materialDoc.data()
                }])
            );

            margenGlobal = configSnap?.exists?.()
                ? Number(configSnap.data().margenGlobal) || 0
                : 0;

            ventasRecientes = snapshotVentas
                ? snapshotVentas.docs.map((saleDoc) => ({ id: saleDoc.id, ...saleDoc.data() }))
                : [];

            recetasConCosto = todasLasRecetas.map((receta) => ({
                ...receta,
                costoCalculado: calcularCostoUnitarioReceta(receta)
            }));

            renderizarListaPrecios(recetasConCosto);
            renderReview();
            setupEventListeners();
        } catch (error) {
            console.error("Error al cargar la lista de precios:", error);
            if (container) container.textContent = 'No se pudieron calcular los precios.';
            if (reviewBody) {
                reviewBody.innerHTML = '<tr><td colspan="7" class="ds-review-empty">No se pudo cargar el análisis de precios.</td></tr>';
            }
        }
    };

    init();
}
