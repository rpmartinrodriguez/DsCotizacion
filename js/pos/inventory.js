import {
    query, where, getDocs, updateDoc, doc, runTransaction, Timestamp
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { formatCurrency, formatTimestampDateTime, dateToYMD } from "../core/format.js";
import { drawBarcodeLabel, downloadCanvasPng } from "../core/labels.js";
import { escapeHtml, escapeAttribute } from "../core/html.js";
import { calculateWholeCakePricing } from "../core/pricing.js";

export function setupPOSInventory({
    db,
    auditoriaCollection,
    getCurrentUser,
    getUserName,
    getGlobalMargin,
    canAdminister
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

    // Configuración comercial del producto terminado.
    const modalComercial = document.getElementById('modal-producto-comercial');
    const comercialId = document.getElementById('comercial-producto-id');
    const comercialNombre = document.getElementById('comercial-producto-nombre');
    const comercialCodigo = document.getElementById('comercial-producto-codigo');
    const comercialPresentacion = document.getElementById('comercial-presentacion');
    const comercialPrecioUnitario = document.getElementById('comercial-precio-unitario');
    const comercialPorciones = document.getElementById('comercial-porciones-entera');
    const comercialPrecioAutomatico = document.getElementById('comercial-precio-entera-auto');
    const comercialPrecioManual = document.getElementById('comercial-precio-entera-manual');
    const comercialPrecioVigente = document.getElementById('comercial-precio-entera-vigente');
    const comercialOrigen = document.getElementById('comercial-precio-origen');
    const comercialWebHabilitado = document.getElementById('comercial-web-habilitado');
    const comercialAviso = document.getElementById('comercial-aviso');
    const btnComercialCopiar = document.getElementById('comercial-copiar-codigo');
    const btnComercialCancelar = document.getElementById('comercial-cancelar');
    const btnComercialGuardar = document.getElementById('comercial-guardar');

    // Cualquier host que no sea producción se comporta como simulador:
    // permite validar UX/cálculo sin escribir en el Firestore real.
    const comercialSoloPrueba = window.location.hostname !== 'dulce-app.netlify.app';

    let products = [];
    let currentBarcodeProduct = null;

    const renderInventory = (items = products) => {
        if (!tablaInventario) return;

        tablaInventario.innerHTML = '';

        if (!items.length) {
            tablaInventario.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;">No hay recetas dadas de alta en el sistema.</td></tr>';
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

            const whole = calculateWholeCakePricing({
                unitPrice: product.precioCalculado,
                portions: product.porcionesTortaEntera,
                manualPrice: product.precioTortaEnteraManual
            });
            const safeCode = escapeHtml(product.id);
            const safeCodeAttr = escapeAttribute(product.id);
            const presentation = product.presentacionVenta
                ? escapeHtml(product.presentacionVenta)
                : 'Sin definir';
            const wholePriceHtml = whole.currentPrice === null
                ? '<strong class="ds-commercial-empty">Sin definir</strong><small>Opcional</small>'
                : `<strong>${formatCurrency(whole.currentPrice)}</strong>
                   <small>${whole.source === 'manual' ? 'Manual' : 'Automático'}${whole.portions ? ' · ' + whole.portions + ' porciones' : ''}</small>`;

            row.innerHTML = `
                <td data-label="Categoría"><span class="categoria-tag">${safeCategory}</span></td>
                <td data-label="Producto">
                    <strong>${safeName}</strong>
                    <div class="ds-product-code">
                        <code>${safeCode}</code>
                        <button type="button" class="btn-copy-product-code" data-code="${safeCodeAttr}" title="Copiar código">Copiar</button>
                    </div>
                    <small class="ds-product-presentation">${presentation}</small>
                </td>
                <td data-label="Costo Base">${formatCurrency(cost)}</td>
                <td class="admin-only" data-label="% Ganancia">
                    ${margin}% <small style="color:var(--text-light);">${hasIndividualMargin ? '(Indiv)' : '(Global)'}</small>
                </td>
                <td data-label="Precio porción / unidad" class="ds-commercial-price">
                    <strong>${formatCurrency(product.precioCalculado)}</strong>
                </td>
                <td data-label="Torta entera" class="ds-commercial-price">${wholePriceHtml}</td>
                <td data-label="Web futura" class="admin-only" style="text-align:center;">
                    <span class="ds-web-price-state ${product.precioWebHabilitado === true ? 'is-on' : ''}">
                        ${product.precioWebHabilitado === true ? 'Habilitado' : 'No publicado'}
                    </span>
                </td>
                <td data-label="Stock" style="text-align:center;">
                    <strong>${stock}</strong> u.
                    <small class="ds-stock-mode-note">${stock > 0 ? 'informativo' : 'sin cargar · venta habilitada'}</small>
                </td>
                <td data-label="Acciones" style="text-align:center;">
                    <div style="display:flex;gap:.5rem;justify-content:center;align-items:center;flex-wrap:wrap;">
                        <button class="btn-primary btn-editar-prod" data-id="${safeId}" style="padding:.3rem .6rem;width:auto;font-size:.85rem;">📝 Stock</button>
                        <button class="btn-secondary btn-ver-barcode" data-id="${safeId}" style="padding:.3rem .6rem;width:auto;font-size:.85rem;">🖨️ Barras</button>
                        <button class="btn-secondary btn-config-comercial admin-only" data-id="${safeId}" style="padding:.3rem .6rem;width:auto;font-size:.85rem;">💲 Comercial</button>
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

    const copyText = async value => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(String(value));
        } catch {
            const area = document.createElement('textarea');
            area.value = String(value);
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            area.remove();
        }
    };

    const getCommercialDraft = product => {
        const portionsRaw = comercialPorciones?.value.trim() || '';
        const manualRaw = comercialPrecioManual?.value.trim() || '';
        const portions = portionsRaw === '' ? null : Number(portionsRaw);
        const manualPrice = manualRaw === '' ? null : Number(manualRaw);
        return {
            presentacionVenta: comercialPresentacion?.value.trim() || null,
            porcionesTortaEntera: portions,
            precioTortaEnteraManual: manualPrice,
            precioWebHabilitado: comercialWebHabilitado?.checked === true
        };
    };

    const renderCommercialPreview = () => {
        const product = products.find(item => item.id === comercialId?.value);
        if (!product) return;
        const draft = getCommercialDraft(product);
        const whole = calculateWholeCakePricing({
            unitPrice: product.precioCalculado,
            portions: draft.porcionesTortaEntera,
            manualPrice: draft.precioTortaEnteraManual
        });

        if (comercialPrecioAutomatico) {
            comercialPrecioAutomatico.textContent = whole.automaticPrice === null
                ? 'Sin definir'
                : formatCurrency(whole.automaticPrice);
        }
        if (comercialPrecioVigente) {
            comercialPrecioVigente.textContent = whole.currentPrice === null
                ? 'Sin definir'
                : formatCurrency(whole.currentPrice);
        }
        if (comercialOrigen) {
            comercialOrigen.textContent = whole.source === 'manual'
                ? 'Manual'
                : whole.source === 'automatico'
                    ? 'Automático'
                    : 'Sin precio entero';
        }
        if (comercialAviso) {
            if (draft.precioTortaEnteraManual !== null && whole.portions === null) {
                comercialAviso.textContent =
                    'El precio manual puede guardarse, pero Mostrador no ofrecerá “Torta entera” hasta definir cuántas porciones representa.';
            } else if (whole.currentPrice === null) {
                comercialAviso.textContent =
                    'Sin configuración de torta entera. El producto seguirá vendiéndose exactamente como hasta ahora.';
            } else {
                comercialAviso.textContent =
                    whole.source === 'manual'
                        ? 'El precio manual tiene prioridad. Al borrarlo, vuelve automáticamente al cálculo por porciones.'
                        : 'Automático = precio vigente por porción × (cantidad de porciones − 1).';
            }
        }
    };

    const openCommercialModal = async product => {
        if (!product || !(await canAdminister?.())) {
            alert('Tu usuario no tiene permiso para modificar la configuración comercial.');
            return;
        }
        if (comercialId) comercialId.value = product.id;
        if (comercialNombre) comercialNombre.textContent = product.nombreTorta || 'Producto';
        if (comercialCodigo) comercialCodigo.value = product.id;
        if (comercialPresentacion) comercialPresentacion.value = product.presentacionVenta || '';
        if (comercialPrecioUnitario) comercialPrecioUnitario.value = formatCurrency(product.precioCalculado);
        if (comercialPorciones) comercialPorciones.value =
            product.porcionesTortaEntera ?? '';
        if (comercialPrecioManual) comercialPrecioManual.value =
            product.precioTortaEnteraManual ?? '';
        if (comercialWebHabilitado) comercialWebHabilitado.checked =
            product.precioWebHabilitado === true;

        if (btnComercialGuardar) {
            btnComercialGuardar.textContent = comercialSoloPrueba
                ? 'Simular configuración'
                : 'Guardar configuración';
        }
        renderCommercialPreview();
        modalComercial?.classList.add('visible');
    };

    [comercialPorciones, comercialPrecioManual].forEach(input =>
        input?.addEventListener('input', renderCommercialPreview)
    );

    btnComercialCopiar?.addEventListener('click', () =>
        copyText(comercialCodigo?.value || '')
    );
    btnComercialCancelar?.addEventListener('click', () =>
        modalComercial?.classList.remove('visible')
    );

    btnComercialGuardar?.addEventListener('click', async () => {
        const product = products.find(item => item.id === comercialId?.value);
        if (!product || !(await canAdminister?.())) {
            alert('Tu usuario no tiene permiso para modificar la configuración comercial.');
            return;
        }

        const draft = getCommercialDraft(product);
        if (draft.presentacionVenta && draft.presentacionVenta.length > 60) {
            alert('La presentación puede tener como máximo 60 caracteres.');
            return;
        }
        if (draft.porcionesTortaEntera !== null &&
            (!Number.isInteger(draft.porcionesTortaEntera) ||
             draft.porcionesTortaEntera < 2 ||
             draft.porcionesTortaEntera > 100)) {
            alert('Las porciones de torta entera deben ser un número entero entre 2 y 100.');
            return;
        }
        if (draft.precioTortaEnteraManual !== null &&
            (!Number.isFinite(draft.precioTortaEnteraManual) ||
             draft.precioTortaEnteraManual <= 0 ||
             draft.precioTortaEnteraManual > 100000000)) {
            alert('El precio manual debe ser un importe positivo válido.');
            return;
        }

        btnComercialGuardar.disabled = true;
        try {
            if (comercialSoloPrueba) {
                Object.assign(product, draft);
                renderInventory(products);
                alert('Simulación aplicada sólo en esta vista. No se modificó Firestore.');
            } else {
                await updateDoc(doc(db, 'recetas', product.id), {
                    ...draft,
                    configComercialActualizadaAt: Timestamp.now()
                });
            }
            modalComercial?.classList.remove('visible');
        } catch (error) {
            console.error('No se pudo guardar la configuración comercial:', error);
            alert('No se pudo guardar la configuración comercial.');
        } finally {
            btnComercialGuardar.disabled = false;
        }
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

    // Los códigos se asignan UNA sola vez en Firestore y nunca se generan
    // únicamente para el PDF (el lector del mostrador usa el mismo valor).
    // Reservar los códigos del catálogo evita duplicados en exportaciones
    // múltiples: Date.now() truncado a 12 dígitos puede repetirse entre productos.
    const makeBarcode = (used) => {
        let base = Number(String(Date.now()).slice(0, 12));
        for (let attempts = 0; attempts < 100000; attempts++, base++) {
            const first12 = String(base % 1000000000000).padStart(12, '0');
            let sum = 0;
            for (let i = 0; i < 12; i++) {
                sum += Number(first12[i]) * (i % 2 ? 3 : 1);
            }
            const code = first12 + ((10 - (sum % 10)) % 10);
            if (!used.has(code)) return code;
        }
        throw new Error('No quedan códigos de barras disponibles.');
    };

    const ensureBarcode = async (product, reservedCodes) => {
        const used = reservedCodes || new Set(
            products.map(p => String(p.codigoBarras || '')).filter(Boolean)
        );
        if (product.codigoBarras) {
            used.add(String(product.codigoBarras));
            return String(product.codigoBarras);
        }
        const proposed = makeBarcode(used);
        // Reservar antes de la operación async evita colisiones si la
        // exportación registra varios códigos a la vez.
        used.add(proposed);
        const ref = doc(db, 'recetas', product.id);
        try {
            const code = await runTransaction(db, async tx => {
                const snapshot = await tx.get(ref);
                if (!snapshot.exists()) throw new Error('Producto inexistente en Recetas.');
                const existing = snapshot.data().codigoBarras;
                if (existing) return String(existing);
                tx.update(ref, { codigoBarras: proposed });
                return proposed;
            });
            product.codigoBarras = code;
            used.add(code);
            return code;
        } catch (error) {
            used.delete(proposed);
            throw error;
        }
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
        const copyButton = event.target.closest('.btn-copy-product-code');
        if (copyButton) {
            await copyText(copyButton.dataset.code);
            copyButton.textContent = 'Copiado';
            window.setTimeout(() => { copyButton.textContent = 'Copiar'; }, 1200);
            return;
        }

        const commercialButton = event.target.closest('.btn-config-comercial');
        if (commercialButton) {
            const product = products.find(item => item.id === commercialButton.dataset.id);
            if (product) await openCommercialModal(product);
            return;
        }
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
        ensureBarcode,
        render: () => setProducts(products)
    };
}
