import { getAuth, getIdToken } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import {
    collection,
    addDoc,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    updateDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { formatCurrency } from "../core/format.js";
import { escapeHtml } from "../core/html.js";

const getLotSeconds = (lote) => {
    if (lote?.fechaCompra?.seconds !== undefined) return lote.fechaCompra.seconds;
    if (typeof lote?.fechaCompra?.toMillis === 'function') return Math.floor(lote.fechaCompra.toMillis() / 1000);
    return 0;
};

const getLatestLot = (producto) => {
    const lotes = Array.isArray(producto?.lotes) ? producto.lotes : [];
    if (!lotes.length) return null;
    return [...lotes].sort((a, b) => getLotSeconds(b) - getLotSeconds(a))[0] || null;
};

const getLotUnitCost = (lote) => {
    if (!lote) return 0;
    const stored = Number(lote.costoUnitario);
    if (Number.isFinite(stored) && stored > 0) return stored;

    const price = Number(lote.precioCompra) || 0;
    const quantity = Number(lote.cantidadComprada) || 0;
    return quantity > 0 ? price / quantity : 0;
};

const formatPercent = (value) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    const number = Number(value);
    const sign = number > 0 ? '+' : '';
    return `${sign}${number.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

const formatDateTime = (timestamp) => {
    if (!timestamp) return 'Nunca';
    try {
        const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return 'Nunca';
    }
};

export function setupSupplierPricing(app, db, { getStock }) {
    const auth = getAuth(app);
    const historyCollection = collection(db, 'historialPreciosProveedor');

    const bulkButton = document.getElementById('btn-actualizar-precios-proveedor');
    const urlInput = document.getElementById('proveedor-url-input');
    const quantityInput = document.getElementById('proveedor-cantidad-input');
    const unitSelect = document.getElementById('proveedor-unidad-select');
    const currentPriceEl = document.getElementById('proveedor-precio-actual');
    const referenceCostEl = document.getElementById('proveedor-costo-referencia');
    const lastCheckEl = document.getElementById('proveedor-ultima-consulta');
    const statusEl = document.getElementById('proveedor-status');
    const queryOneButton = document.getElementById('btn-consultar-precio-proveedor');
    const historyButton = document.getElementById('btn-ver-historial-precios');

    const resultsModal = document.getElementById('supplier-results-modal-overlay');
    const resultsSummary = document.getElementById('supplier-results-summary');
    const resultsList = document.getElementById('supplier-results-list');
    const resultsClose = document.getElementById('supplier-results-close');

    const historyModal = document.getElementById('supplier-history-modal-overlay');
    const historyTitle = document.getElementById('supplier-history-title');
    const historyList = document.getElementById('supplier-history-list');
    const historyClose = document.getElementById('supplier-history-close');

    let activeProductId = null;
    let activeProductName = '';

    const normalizeUnit = (unit) => {
        const value = String(unit || '').toLowerCase().trim();
        if (['g', 'gr', 'grs', 'gramo', 'gramos'].includes(value)) return 'gr';
        if (['kg', 'kilo', 'kilos'].includes(value)) return 'kg';
        if (['l', 'lt', 'lts', 'litro', 'litros'].includes(value)) return 'l';
        if (['ml'].includes(value)) return 'ml';
        if (['cc'].includes(value)) return 'cc';
        if (['u', 'un', 'uni', 'unidad', 'unidades'].includes(value)) return 'unidad';
        return '';
    };

    const unitMeta = {
        gr: { dimension: 'mass', factor: 1 },
        kg: { dimension: 'mass', factor: 1000 },
        ml: { dimension: 'volume', factor: 1 },
        cc: { dimension: 'volume', factor: 1 },
        l: { dimension: 'volume', factor: 1000 },
        unidad: { dimension: 'unit', factor: 1 }
    };

    const convertQuantity = (quantity, fromUnit, toUnit) => {
        const from = unitMeta[normalizeUnit(fromUnit)];
        const to = unitMeta[normalizeUnit(toUnit)];
        const numericQuantity = Number(quantity);

        if (!from || !to || !Number.isFinite(numericQuantity) || numericQuantity <= 0) {
            throw new Error('La presentación del proveedor no tiene una unidad válida.');
        }

        if (from.dimension !== to.dimension) {
            throw new Error(`No puedo convertir ${fromUnit} a ${toUnit}. Revisá la unidad de esta materia prima.`);
        }

        return numericQuantity * from.factor / to.factor;
    };

    const isSignificantVariation = (variation) =>
        Number.isFinite(Number(variation)) && Math.abs(Number(variation)) >= 10;

    const setStatus = (text, kind = '') => {
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.className = `ds-supplier-status${kind ? ` is-${kind}` : ''}`;
    };

    const getEditorFields = () => {
        const rawUrl = (urlInput?.value || '').trim();
        const quantity = Number(quantityInput?.value || 0);
        const unit = normalizeUnit(unitSelect?.value || '');

        if (!rawUrl) {
            return {
                proveedorUrl: '',
                proveedorPresentacionCantidad: null,
                proveedorPresentacionUnidad: ''
            };
        }

        let parsed;
        try {
            parsed = new URL(rawUrl);
        } catch {
            throw new Error('La URL del proveedor no es válida.');
        }

        if (parsed.protocol !== 'https:') {
            throw new Error('La URL del proveedor debe comenzar con https://');
        }

        const hasQuantity = Number.isFinite(quantity) && quantity > 0;
        const hasUnit = Boolean(unit);

        if (hasQuantity !== hasUnit) {
            throw new Error('Completá cantidad y unidad de presentación, o dejá ambos vacíos para detectarlos automáticamente.');
        }

        return {
            proveedorUrl: parsed.toString(),
            proveedorPresentacionCantidad: hasQuantity ? quantity : null,
            proveedorPresentacionUnidad: hasUnit ? unit : ''
        };
    };

    const loadProduct = (producto, id) => {
        activeProductId = id;
        activeProductName = producto?.nombre || '';

        const legacyQuantity = Number(producto?.proveedorCantidad) > 0
            ? Number(producto.proveedorCantidad)
            : 0;
        const packageQuantity = Number(producto?.proveedorPresentacionCantidad) > 0
            ? Number(producto.proveedorPresentacionCantidad)
            : legacyQuantity;
        const packageUnit = normalizeUnit(
            producto?.proveedorPresentacionUnidad || (legacyQuantity > 0 ? producto?.unidad : '')
        );

        if (urlInput) urlInput.value = producto?.proveedorUrl || '';
        if (quantityInput) quantityInput.value = packageQuantity || '';
        if (unitSelect) unitSelect.value = packageUnit || '';

        if (currentPriceEl) {
            currentPriceEl.textContent = Number(producto?.proveedorPrecioActual) > 0
                ? formatCurrency(Number(producto.proveedorPrecioActual))
                : 'Sin consultar';
        }

        if (referenceCostEl) {
            const reference = Number(producto?.costoReferenciaProveedorUnitario) || 0;
            referenceCostEl.textContent = reference > 0
                ? `${formatCurrency(reference)} / ${producto?.unidad || 'unidad'}`
                : 'Sin referencia';
        }

        if (lastCheckEl) {
            lastCheckEl.textContent = formatDateTime(producto?.proveedorUltimaConsulta);
        }

        const variation = Number(producto?.proveedorVariacionPct);
        if (Number.isFinite(variation) && producto?.proveedorPrecioAnterior) {
            setStatus(
                variation > 0
                    ? `Última variación: ${formatPercent(variation)}`
                    : variation < 0
                        ? `Última variación: ${formatPercent(variation)} · se conservó el costo más alto`
                        : 'Sin cambios en la última consulta.',
                variation > 0 ? 'up' : variation < 0 ? 'down' : 'same'
            );
        } else {
            setStatus(producto?.proveedorUrl ? 'Proveedor configurado.' : 'Pegá la URL del producto para comenzar.');
        }

        if (historyButton) historyButton.disabled = !id;
        if (queryOneButton) queryOneButton.disabled = !id;
    };

    const reset = () => {
        activeProductId = null;
        activeProductName = '';
        if (urlInput) urlInput.value = '';
        if (quantityInput) quantityInput.value = '';
        if (unitSelect) unitSelect.value = '';
        if (currentPriceEl) currentPriceEl.textContent = 'Sin consultar';
        if (referenceCostEl) referenceCostEl.textContent = 'Sin referencia';
        if (lastCheckEl) lastCheckEl.textContent = 'Nunca';
        setStatus('');
    };

    const saveSupplierConfig = async (productId) => {
        if (!productId) throw new Error('No hay una materia prima seleccionada.');
        const fields = getEditorFields();

        await updateDoc(doc(db, 'materiasPrimas', productId), fields);
        return fields;
    };

    const callSupplierFunction = async (productId) => {
        const user = auth.currentUser;
        if (!user) throw new Error('Tu sesión venció. Volvé a iniciar sesión.');

        const token = await getIdToken(user);
        const response = await fetch('/.netlify/functions/supplier-price', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ materiaPrimaId: productId })
        });

        let payload = {};
        try {
            payload = await response.json();
        } catch {
            // La respuesta no era JSON.
        }

        if (!response.ok || !payload.ok) {
            const error = new Error(payload.message || `No se pudo consultar el proveedor (HTTP ${response.status}).`);
            error.code = payload.code || 'SUPPLIER_QUERY_FAILED';
            throw error;
        }

        return payload;
    };

    const persistDetectedPrice = async (productId, detection) => {
        const ref = doc(db, 'materiasPrimas', productId);
        const snapshot = await getDoc(ref);
        if (!snapshot.exists()) throw new Error('La materia prima ya no existe.');

        const data = snapshot.data();
        const latestLot = getLatestLot(data);
        const latestPurchaseUnitCost = getLotUnitCost(latestLot);

        const configuredQuantity = Number(data.proveedorPresentacionCantidad) > 0
            ? Number(data.proveedorPresentacionCantidad)
            : 0;
        const configuredUnit = normalizeUnit(data.proveedorPresentacionUnidad);

        const detectedQuantity = Number(detection.packageQuantity) > 0
            ? Number(detection.packageQuantity)
            : 0;
        const detectedUnit = normalizeUnit(detection.packageUnit);

        const legacyQuantity = Number(data.proveedorCantidad) > 0
            ? Number(data.proveedorCantidad)
            : 0;

        const packageQuantity = configuredQuantity || detectedQuantity || legacyQuantity;
        const packageUnit = configuredUnit || detectedUnit || (legacyQuantity > 0 ? normalizeUnit(data.unidad) : '');

        if (packageQuantity <= 0 || !packageUnit) {
            throw new Error('No pude detectar la presentación del proveedor. Indicá, por ejemplo, 10 kg o 500 gr.');
        }

        const providerQuantity = convertQuantity(packageQuantity, packageUnit, data.unidad);

        const newPrice = Number(detection.price);
        if (!Number.isFinite(newPrice) || newPrice <= 0) {
            throw new Error('El proveedor devolvió un precio inválido.');
        }

        const oldProviderPrice = Number(data.proveedorPrecioActual) || 0;
        const oldProviderUnitCost = Number(data.proveedorCostoUnitarioActual) || 0;
        const oldReferenceUnitCost = Number(data.costoReferenciaProveedorUnitario) || 0;
        const detectedUnitCost = newPrice / providerQuantity;

        // Regla Dulce Sall: una baja del proveedor nunca reduce automáticamente
        // el costo de referencia que usan los cálculos.
        const newReferenceUnitCost = Math.max(
            latestPurchaseUnitCost,
            oldReferenceUnitCost,
            detectedUnitCost
        );

        const variation = oldProviderUnitCost > 0
            ? ((detectedUnitCost - oldProviderUnitCost) / oldProviderUnitCost) * 100
            : null;

        const checkedAt = Timestamp.now();

        await updateDoc(ref, {
            proveedorPrecioAnterior: oldProviderPrice || null,
            proveedorPrecioActual: newPrice,
            proveedorCostoUnitarioAnterior: oldProviderUnitCost || null,
            proveedorCostoUnitarioActual: detectedUnitCost,
            proveedorVariacionPct: variation,
            proveedorPresentacionCantidad: packageQuantity,
            proveedorPresentacionUnidad: packageUnit,
            proveedorCantidadBase: providerQuantity,
            proveedorUltimaConsulta: checkedAt,
            proveedorUltimaFuente: detection.source || '',
            proveedorUltimoHost: detection.host || '',
            proveedorTituloDetectado: detection.title || '',
            costoReferenciaProveedorUnitario: newReferenceUnitCost
        });

        let historySaved = true;
        try {
            await addDoc(historyCollection, {
                materiaPrimaId: productId,
                materiaPrimaNombre: data.nombre || activeProductName || '',
                proveedorUrl: data.proveedorUrl || '',
                proveedorHost: detection.host || '',
                fuente: detection.source || '',
                precioAnterior: oldProviderPrice || null,
                precioNuevo: newPrice,
                variacionPct: variation,
                presentacionCantidad: packageQuantity,
                presentacionUnidad: packageUnit,
                cantidadProveedorBase: providerQuantity,
                unidad: data.unidad || '',
                costoUnitarioAnterior: oldProviderUnitCost || null,
                costoUnitarioDetectado: detectedUnitCost,
                costoReferenciaAnterior: Math.max(latestPurchaseUnitCost, oldReferenceUnitCost),
                costoReferenciaNuevo: newReferenceUnitCost,
                fecha: checkedAt
            });
        } catch (historyError) {
            historySaved = false;
            console.warn('Precio actualizado, pero no se pudo guardar el historial:', historyError);
        }

        let movement = 'initial';
        if (oldProviderPrice > 0) {
            if (newPrice > oldProviderPrice) movement = 'up';
            else if (newPrice < oldProviderPrice) movement = 'down';
            else movement = 'same';
        }

        return {
            id: productId,
            name: data.nombre || 'Materia prima',
            unit: data.unidad || '',
            oldPrice: oldProviderPrice,
            newPrice,
            variation,
            providerQuantity,
            packageQuantity,
            packageUnit,
            detectedUnitCost,
            oldReferenceUnitCost: Math.max(latestPurchaseUnitCost, oldReferenceUnitCost),
            newReferenceUnitCost,
            movement,
            host: detection.host || '',
            source: detection.source || '',
            historySaved
        };
    };

    const queryAndPersist = async (productId) => {
        const detection = await callSupplierFunction(productId);
        return persistDetectedPrice(productId, detection);
    };

    const renderSingleResultStatus = (result) => {
        if (currentPriceEl) currentPriceEl.textContent = formatCurrency(result.newPrice);
        if (referenceCostEl) {
            referenceCostEl.textContent = `${formatCurrency(result.newReferenceUnitCost)} / ${result.unit || 'unidad'}`;
        }
        if (lastCheckEl) lastCheckEl.textContent = new Date().toLocaleString('es-AR');
        if (quantityInput) quantityInput.value = result.packageQuantity || '';
        if (unitSelect) unitSelect.value = result.packageUnit || '';

        let message = 'Primera consulta registrada.';
        let kind = 'same';

        if (result.movement === 'up') {
            message = `Aumentó ${formatPercent(result.variation)}. El costo de referencia fue actualizado.`;
            kind = 'up';
        } else if (result.movement === 'down') {
            message = `Bajó ${formatPercent(result.variation)}. Se conserva el costo de referencia más alto.`;
            kind = 'down';
        } else if (result.movement === 'same') {
            message = 'El precio no cambió.';
        }

        if (isSignificantVariation(result.variation)) {
            message = `⚠ Variación importante: ${formatPercent(result.variation)}. ${message}`;
            kind = 'alert';
        }

        if (!result.historySaved) {
            message += ' Precio actualizado; el historial requiere habilitar la regla nueva de Firestore.';
        }

        setStatus(message, kind);
    };

    const queryActiveProduct = async () => {
        if (!activeProductId) return;

        queryOneButton.disabled = true;
        const previousText = queryOneButton.textContent;
        queryOneButton.textContent = 'Consultando…';
        setStatus('Guardando configuración y consultando al proveedor…');

        try {
            await saveSupplierConfig(activeProductId);
            const result = await queryAndPersist(activeProductId);
            renderSingleResultStatus(result);
        } catch (error) {
            console.error('Error consultando proveedor:', error);
            setStatus(error.message || 'No se pudo consultar el proveedor.', 'error');
        } finally {
            queryOneButton.disabled = false;
            queryOneButton.textContent = previousText;
        }
    };

    const renderResultsModal = (results) => {
        if (!resultsModal || !resultsList || !resultsSummary) return;

        const success = results.filter((item) => item.ok).map((item) => item.result);
        const errors = results.filter((item) => !item.ok);
        const ups = success.filter((item) => item.movement === 'up').length;
        const downs = success.filter((item) => item.movement === 'down').length;
        const same = success.filter((item) => item.movement === 'same').length;
        const initial = success.filter((item) => item.movement === 'initial').length;

        resultsSummary.innerHTML = `
            <div class="ds-supplier-summary-item"><span>Consultados</span><strong>${results.length}</strong></div>
            <div class="ds-supplier-summary-item is-up"><span>Aumentaron</span><strong>${ups}</strong></div>
            <div class="ds-supplier-summary-item is-down"><span>Bajaron</span><strong>${downs}</strong></div>
            <div class="ds-supplier-summary-item"><span>Sin cambios / inicial</span><strong>${same + initial}</strong></div>
            <div class="ds-supplier-summary-item is-error"><span>Con error</span><strong>${errors.length}</strong></div>
        `;

        resultsList.innerHTML = '';

        results.forEach((entry) => {
            const item = document.createElement('article');
            item.className = 'ds-supplier-result-card';

            if (!entry.ok) {
                item.classList.add('is-error');
                item.innerHTML = `
                    <div>
                        <strong>${escapeHtml(entry.name || 'Materia prima')}</strong>
                        <p>${escapeHtml(entry.error || 'No se pudo consultar.')}</p>
                    </div>
                    <span class="ds-supplier-result-badge">Error</span>
                `;
                resultsList.appendChild(item);
                return;
            }

            const result = entry.result;
            const significant = isSignificantVariation(result.variation);
            item.classList.add(significant ? 'is-alert' : `is-${result.movement}`);

            let detail = 'Primera consulta';
            if (result.movement === 'up') detail = `Aumentó ${formatPercent(result.variation)}`;
            if (result.movement === 'down') detail = `Bajó ${formatPercent(result.variation)} · costo conservado`;
            if (result.movement === 'same') detail = 'Sin cambios';
            if (significant) detail = `⚠ Variación importante ${formatPercent(result.variation)} · ${result.movement === 'down' ? 'costo conservado' : 'revisar margen'}`;

            item.innerHTML = `
                <div class="ds-supplier-result-main">
                    <strong>${escapeHtml(result.name)}</strong>
                    <p>${escapeHtml(detail)}</p>
                    <small>${escapeHtml(result.host || '')}</small>
                </div>
                <div class="ds-supplier-result-prices">
                    <span>${result.oldPrice > 0 ? formatCurrency(result.oldPrice) : '—'}</span>
                    <b>→</b>
                    <strong>${formatCurrency(result.newPrice)}</strong>
                </div>
                <div class="ds-supplier-result-reference">
                    <span>Costo ref.</span>
                    <strong>${formatCurrency(result.newReferenceUnitCost)} / ${escapeHtml(result.unit || 'unidad')}</strong>
                </div>
            `;

            resultsList.appendChild(item);
        });

        resultsModal.classList.add('visible');
    };

    const runBulkUpdate = async () => {
        const stock = typeof getStock === 'function' ? getStock() : [];
        const configured = stock.filter((item) => (item.data?.proveedorUrl || '').trim());

        if (!configured.length) {
            alert('Todavía no hay materias primas con una URL de proveedor configurada.');
            return;
        }

        bulkButton.disabled = true;
        const originalText = bulkButton.textContent;
        const results = [];
        let nextIndex = 0;
        let completed = 0;

        const updateProgress = () => {
            bulkButton.textContent = `Actualizando ${completed}/${configured.length}…`;
        };

        updateProgress();

        const worker = async () => {
            while (nextIndex < configured.length) {
                const currentIndex = nextIndex;
                nextIndex += 1;
                const item = configured[currentIndex];

                try {
                    const result = await queryAndPersist(item.id);
                    results[currentIndex] = { ok: true, result, name: item.data?.nombre || '' };
                } catch (error) {
                    console.error(`Error actualizando ${item.data?.nombre || item.id}:`, error);
                    results[currentIndex] = {
                        ok: false,
                        name: item.data?.nombre || 'Materia prima',
                        error: error.message || 'No se pudo consultar.'
                    };
                }

                completed += 1;
                updateProgress();
            }
        };

        try {
            const concurrency = Math.min(3, configured.length);
            await Promise.all(Array.from({ length: concurrency }, () => worker()));
            renderResultsModal(results.filter(Boolean));
        } finally {
            bulkButton.disabled = false;
            bulkButton.textContent = originalText;
        }
    };

    const openHistory = async () => {
        if (!activeProductId || !historyModal || !historyList) return;

        historyTitle.textContent = `Historial de precios · ${activeProductName || 'Materia prima'}`;
        historyList.innerHTML = '<p>Cargando historial…</p>';
        historyModal.classList.add('visible');

        try {
            const snapshot = await getDocs(
                query(historyCollection, where('materiaPrimaId', '==', activeProductId))
            );

            const rows = snapshot.docs
                .map((snapshotDoc) => snapshotDoc.data())
                .sort((a, b) => {
                    const aSeconds = a.fecha?.seconds || 0;
                    const bSeconds = b.fecha?.seconds || 0;
                    return bSeconds - aSeconds;
                })
                .slice(0, 100);

            if (!rows.length) {
                historyList.innerHTML = '<p>No hay consultas de proveedor registradas todavía.</p>';
                return;
            }

            historyList.innerHTML = rows.map((row) => {
                const variation = Number(row.variacionPct);
                const cls = variation > 0 ? 'is-up' : variation < 0 ? 'is-down' : 'is-same';

                return `
                    <article class="ds-price-history-row ${cls}">
                        <div>
                            <strong>${formatCurrency(Number(row.precioNuevo) || 0)}</strong>
                            <span>${formatPercent(row.variacionPct)}</span>
                        </div>
                        <div>
                            <small>${formatDateTime(row.fecha)}</small>
                            <p>Costo de referencia: ${formatCurrency(Number(row.costoReferenciaNuevo) || 0)} / ${escapeHtml(row.unidad || 'unidad')}</p>
                        </div>
                    </article>
                `;
            }).join('');
        } catch (error) {
            console.error('Error cargando historial de precios:', error);
            historyList.innerHTML = `<p class="ds-supplier-error">${escapeHtml(error.message || 'No se pudo cargar el historial.')}</p>`;
        }
    };

    if (queryOneButton) queryOneButton.addEventListener('click', queryActiveProduct);
    if (bulkButton) bulkButton.addEventListener('click', runBulkUpdate);
    if (resultsClose) resultsClose.addEventListener('click', () => resultsModal?.classList.remove('visible'));
    if (historyButton) historyButton.addEventListener('click', openHistory);
    if (historyClose) historyClose.addEventListener('click', () => historyModal?.classList.remove('visible'));

    return {
        loadProduct,
        reset,
        getEditorFields,
        saveSupplierConfig,
        queryAndPersist
    };
}
