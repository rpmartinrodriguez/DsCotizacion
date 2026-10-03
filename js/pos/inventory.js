import {
    query, where, getDocs, updateDoc, doc, runTransaction, Timestamp
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { formatCurrency, formatTimestampDateTime, dateToYMD } from "../core/format.js";
import { drawBarcodeLabel, downloadCanvasPng } from "../core/labels.js";
import { escapeHtml, escapeAttribute } from "../core/html.js";

export function setupPOSInventory({
    db,
    auditoriaCollection,
    getCurrentUser,
    getUserName,
    getGlobalMargin
}) {
    const buscadorInventario = document.getElementById('buscador-inventario');
    const tablaInventario = document.getElementById('tabla-inventario-mostrador');

    const modalStock = document.getElementById('modal-stock-detalle');
    const modalProdId = document.getElementById('modal-prod-id');
    const modalProdNombre = document.getElementById('modal-prod-nombre');
    const modalProdGananciaIndiv = document.getElementById('modal-prod-ganancia-indiv');
    const modalProdStockActual = document.getElementById('modal-prod-stock-actual');
    const modalProdTipoMov = document.getElementById('modal-prod-tipo-movimiento');
    const modalProdCantMov = document.getElementById('modal-prod-cantidad-movimiento');
    const loteFieldsContainer = document.getElementById('lote-fields-container');
    const modalProdLoteElab = document.getElementById('modal-prod-lote-elab');
    const modalProdLoteVto = document.getElementById('modal-prod-lote-vto');
    const modalProdMotivo = document.getElementById('modal-prod-motivo');
    const modalProdAuditoria = document.getElementById('modal-prod-auditoria-logs');
    const btnCancelarStock = document.getElementById('btn-cerrar-modal-stock');
    const btnGuardarStock = document.getElementById('btn-guardar-modal-stock');

    const modalBarcode = document.getElementById('modal-barcode');
    const btnCerrarBarcode = document.getElementById('btn-cerrar-barcode');
    const btnDescargarBarcode = document.getElementById('btn-descargar-barcode');

    let products = [];
    let currentBarcodeProduct = null;

    const renderInventory = (items = products) => {
        if (!tablaInventario) return;

        tablaInventario.innerHTML = '';

        if (!items.length) {
            tablaInventario.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;">No hay recetas dadas de alta en el sistema.</td></tr>';
            return;
        }

        items.forEach((product) => {
            const cost = Number(product.costoBaseCalculado) || 0;
            const stock = Number(product.stockMostrador) || 0;
            const hasIndividualMargin =
                product.margenIndividual !== undefined &&
                product.margenIndividual !== null &&
                product.margenIndividual !== '';

            const margin = hasIndividualMargin
                ? parseFloat(product.margenIndividual)
                : Number(getGlobalMargin?.()) || 0;

            const row = document.createElement('tr');
            const safeCategory = escapeHtml(product.categoria || 'Sin Categoría');
            const safeName = escapeHtml(product.nombreTorta || '');
            const safeId = escapeAttribute(product.id);

            row.innerHTML = `
                <td data-label="Categoría"><span class="categoria-tag">${safeCategory}</span></td>
                <td data-label="Producto"><strong>${safeName}</strong></td>
                <td data-label="Costo Base">${formatCurrency(cost)}</td>
                <td class="admin-only" data-label="% Ganancia">
                    ${margin}% <small style="color:var(--text-light);">${hasIndividualMargin ? '(Indiv)' : '(Global)'}</small>
                </td>
                <td data-label="Precio Venta" style="font-weight:bold;color:var(--primary-color);">
                    ${formatCurrency(product.precioCalculado)}
                </td>
                <td data-label="Stock" style="text-align:center;">
                    <strong>${stock}</strong> u.
                    <small class="ds-stock-mode-note">${stock > 0 ? 'informativo' : 'sin cargar · venta habilitada'}</small>
                </td>
                <td data-label="Acciones" style="text-align:center;">
                    <div style="display:flex;gap:.5rem;justify-content:center;align-items:center;">
                        <button class="btn-primary btn-editar-prod" data-id="${safeId}" style="padding:.3rem .6rem;width:auto;font-size:.85rem;">📝 Stock</button>
                        <button class="btn-secondary btn-ver-barcode" data-id="${safeId}" style="padding:.3rem .6rem;width:auto;font-size:.85rem;">🖨️ Barras</button>
                        <button class="btn-secondary btn-editar-margen admin-only" data-id="${safeId}" style="padding:.3rem .6rem;width:auto;font-size:.85rem;border-color:#6366f1;color:#6366f1;">⚙️ %</button>
                    </div>
                </td>
            `;

            tablaInventario.appendChild(row);
        });
    };

    const setProducts = (nextProducts = []) => {
        products = Array.isArray(nextProducts) ? nextProducts : [];

        const term = buscadorInventario?.value.trim().toLowerCase() || '';
        const filtered = term
            ? products.filter((product) =>
                (product.nombreTorta || '').toLowerCase().includes(term) ||
                (product.categoria || '').toLowerCase().includes(term)
            )
            : products;

        renderInventory(filtered);
    };

    buscadorInventario?.addEventListener('input', (event) => {
        const term = event.target.value.toLowerCase();

        renderInventory(products.filter((product) =>
            (product.nombreTorta || '').toLowerCase().includes(term) ||
            (product.categoria || '').toLowerCase().includes(term)
        ));
    });

    modalProdTipoMov?.addEventListener('change', (event) => {
        if (loteFieldsContainer) {
            loteFieldsContainer.style.display = event.target.value === 'SUMAR' ? 'flex' : 'none';
        }
    });

    const loadAudit = async (productId) => {
        try {
            const auditQuery = query(auditoriaCollection, where('productoId', '==', productId));
            const snapshot = await getDocs(auditQuery);

            if (snapshot.empty) {
                if (modalProdAuditoria) {
                    modalProdAuditoria.innerHTML = '<p class="text-light" style="font-size:.85rem;text-align:center;">Sin movimientos registrados.</p>';
                }
                return;
            }

            const logs = snapshot.docs
                .map((documento) => documento.data())
                .sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0));

            if (modalProdAuditoria) modalProdAuditoria.innerHTML = '';

            logs.forEach((log) => {
                const logDiv = document.createElement('div');
                logDiv.className = 'log-item';

                const typeBadge = log.tipo === 'SUMA'
                    ? `<span class="log-tipo-sumar">[+${Number(log.cantidad) || 0}]</span>`
                    : `<span class="log-tipo-restar">[-${Number(log.cantidad) || 0}]</span>`;

                const lotInfo = log.loteVto
                    ? ` (Vto: ${escapeHtml(log.loteVto)})`
                    : '';

                logDiv.innerHTML = `
                    <div style="display:flex;justify-content:space-between;margin-bottom:.2rem;">
                        <span>${typeBadge} ${escapeHtml(log.motivo || 'Ajuste')}${lotInfo}</span>
                        <span style="color:var(--text-light);font-size:.75rem;">${formatTimestampDateTime(log.fecha, { shortYear: true })}</span>
                    </div>
                    <div style="color:var(--text-light);font-size:.75rem;">
                        👤 ${escapeHtml(log.usuario || 'Usuario')} | Stock resultante: ${Number(log.stockResultante) || 0}
                    </div>
                `;

                modalProdAuditoria?.appendChild(logDiv);
            });
        } catch (error) {
            console.error('Error cargando auditoría de producto:', error);
            if (modalProdAuditoria) {
                modalProdAuditoria.innerHTML = '<p class="text-light" style="text-align:center;">Error al cargar historial.</p>';
            }
        }
    };

    const openStockModal = async (product) => {
        if (modalProdId) modalProdId.value = product.id;
        if (modalProdNombre) modalProdNombre.value = product.nombreTorta || '';
        if (modalProdGananciaIndiv) {
            modalProdGananciaIndiv.value =
                product.margenIndividual !== undefined && product.margenIndividual !== null
                    ? product.margenIndividual
                    : '';
        }
        if (modalProdStockActual) modalProdStockActual.textContent = product.stockMostrador || '0';

        if (modalProdTipoMov) modalProdTipoMov.value = 'SUMAR';
        if (loteFieldsContainer) loteFieldsContainer.style.display = 'flex';
        if (modalProdCantMov) modalProdCantMov.value = '0';
        if (modalProdMotivo) modalProdMotivo.value = '';

        const today = new Date();
        if (modalProdLoteElab) modalProdLoteElab.value = dateToYMD(today);

        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 15);
        if (modalProdLoteVto) modalProdLoteVto.value = dateToYMD(expiry);

        if (modalProdAuditoria) {
            modalProdAuditoria.innerHTML = '<p class="text-light" style="text-align:center;">Cargando historial...</p>';
        }

        await loadAudit(product.id);
        modalStock?.classList.add('visible');
    };

    const ensureBarcode = async (product) => {
        if (product.codigoBarras) return product.codigoBarras;

        const first12 = String(Date.now()).substring(0, 12);
        let sum = 0;

        for (let index = 0; index < 12; index += 1) {
            sum += parseInt(first12[index], 10) * (index % 2 === 1 ? 3 : 1);
        }

        const barcode = first12 + String((10 - (sum % 10)) % 10);
        await updateDoc(doc(db, 'recetas', product.id), { codigoBarras: barcode });
        product.codigoBarras = barcode;

        return barcode;
    };

    const openBarcodeModal = async (product) => {
        try {
            await ensureBarcode(product);
            currentBarcodeProduct = product;

            const canvas = document.getElementById('barcode-canvas-descarga');
            drawBarcodeLabel(canvas, product);

            if (btnDescargarBarcode) {
                btnDescargarBarcode.dataset.nombre = product.nombreTorta || 'etiqueta';
            }

            modalBarcode?.classList.add('visible');
        } catch (error) {
            console.error('No se pudo generar el código de barras:', error);
            alert('No se pudo generar el código de barras.');
        }
    };

    tablaInventario?.addEventListener('click', async (event) => {
        const stockButton = event.target.closest('.btn-editar-prod');
        if (stockButton) {
            const product = products.find((item) => item.id === stockButton.dataset.id);
            if (product) await openStockModal(product);
            return;
        }

        const barcodeButton = event.target.closest('.btn-ver-barcode');
        if (barcodeButton) {
            const product = products.find((item) => item.id === barcodeButton.dataset.id);
            if (product) await openBarcodeModal(product);
            return;
        }

        const marginButton = event.target.closest('.btn-editar-margen');
        if (!marginButton) return;

        const product = products.find((item) => item.id === marginButton.dataset.id);
        if (!product) return;

        const currentMargin =
            product.margenIndividual !== undefined && product.margenIndividual !== null
                ? product.margenIndividual
                : '';

        const nextMargin = prompt(
            `Ingrese el % de ganancia para "${product.nombreTorta}"\n(Deje vacío para usar el % Global):`,
            currentMargin
        );

        if (nextMargin === null) return;

        try {
            const productRef = doc(db, 'recetas', product.id);

            if (nextMargin.trim() === '') {
                await updateDoc(productRef, { margenIndividual: null });
                return;
            }

            const value = parseFloat(nextMargin);
            if (Number.isNaN(value) || value < 0) {
                alert('Número inválido.');
                return;
            }

            await updateDoc(productRef, { margenIndividual: value });
        } catch (error) {
            console.error('Error actualizando margen:', error);
            alert('Error al actualizar.');
        }
    });

    btnCancelarStock?.addEventListener('click', () => modalStock?.classList.remove('visible'));

    btnGuardarStock?.addEventListener('click', async () => {
        const productId = modalProdId?.value || null;
        const productName = modalProdNombre?.value || 'Producto';
        const movementType = modalProdTipoMov?.value || 'SUMAR';
        const movementQty = parseInt(modalProdCantMov?.value, 10) || 0;
        const reason = modalProdMotivo?.value.trim() || '';

        if (!productId || movementQty <= 0) {
            alert('Ingrese una cantidad válida a mover.');
            return;
        }

        const currentUser = getCurrentUser?.();
        if (!currentUser) {
            window.location.replace('login.html');
            return;
        }

        btnGuardarStock.disabled = true;
        btnGuardarStock.textContent = 'Guardando...';

        try {
            const productRef = doc(db, 'recetas', productId);

            await runTransaction(db, async (transaction) => {
                const snapshot = await transaction.get(productRef);
                if (!snapshot.exists()) throw new Error('Producto no existe');

                const data = snapshot.data();
                const currentStock = Number(data.stockMostrador) || 0;
                let lots = Array.isArray(data.lotes) ? [...data.lotes] : [];
                let newStock = currentStock;

                if (movementType === 'SUMAR') {
                    newStock = currentStock + movementQty;
                    lots.push({
                        idLote: Date.now().toString(),
                        cantidad: movementQty,
                        fechaElab: modalProdLoteElab?.value || null,
                        fechaVto: modalProdLoteVto?.value || null
                    });
                } else {
                    newStock = Math.max(0, currentStock - movementQty);

                    let remainingToDeduct = movementQty;
                    lots.sort((a, b) => new Date(a.fechaVto) - new Date(b.fechaVto));

                    const remainingLots = [];

                    for (const originalLot of lots) {
                        const lot = { ...originalLot };

                        if (remainingToDeduct <= 0) {
                            remainingLots.push(lot);
                            continue;
                        }

                        const lotQty = Number(lot.cantidad) || 0;

                        if (lotQty <= remainingToDeduct) {
                            remainingToDeduct -= lotQty;
                        } else {
                            lot.cantidad = lotQty - remainingToDeduct;
                            remainingToDeduct = 0;
                            remainingLots.push(lot);
                        }
                    }

                    lots = remainingLots;
                }

                const updates = {
                    stockMostrador: newStock,
                    lotes: lots
                };

                if (document.body.classList.contains('admin-open') && modalProdGananciaIndiv) {
                    const value = modalProdGananciaIndiv.value.trim();
                    updates.margenIndividual = value === '' ? null : parseFloat(value);
                }

                transaction.update(productRef, updates);

                transaction.set(doc(auditoriaCollection), {
                    productoId: productId,
                    productoNombre: productName,
                    tipo: movementType,
                    cantidad: movementQty,
                    stockResultante: newStock,
                    motivo: reason || (movementType === 'SUMAR' ? 'Ingreso Producción' : 'Egreso/Descarte'),
                    usuario: getUserName?.() || currentUser.email || 'Usuario',
                    usuarioId: currentUser.uid,
                    fecha: Timestamp.now()
                });
            });

            modalStock?.classList.remove('visible');
        } catch (error) {
            console.error('Error guardando stock:', error);
            alert('Hubo un error al guardar los cambios.');
        } finally {
            btnGuardarStock.disabled = false;
            btnGuardarStock.textContent = 'Guardar Cambios';
        }
    });

    btnCerrarBarcode?.addEventListener('click', () => {
        modalBarcode?.classList.remove('visible');
    });

    btnDescargarBarcode?.addEventListener('click', () => {
        if (!currentBarcodeProduct) return;

        const canvas = document.getElementById('barcode-canvas-descarga');
        downloadCanvasPng(
            canvas,
            `Etiqueta-${btnDescargarBarcode.dataset.nombre || 'etiqueta'}.png`
        );
    });

    return {
        setProducts,
        render: () => setProducts(products)
    };
}
