import {
    getFirestore, collection, doc, onSnapshot
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import {
    calculateProductSalePrice,
    calculateWholeCakePricing,
    getEffectiveUnitCost
} from "./core/pricing.js";
import { formatCurrency, formatTimestampDateTime } from "./core/format.js";
import { escapeHtml, escapeAttribute } from "./core/html.js";

export function setupProductos(app) {
    const db = getFirestore(app);

    const lista = document.getElementById('productos-lista');
    const count = document.getElementById('productos-count');
    const buscar = document.getElementById('productos-buscar');
    const categoria = document.getElementById('productos-categoria');
    const vacio = document.getElementById('producto-vacio');
    const detalle = document.getElementById('producto-detalle');
    const helpBox = document.getElementById('productos-help');

    const nombre = document.getElementById('producto-nombre');
    const subtitulo = document.getElementById('producto-subtitulo');
    const costo = document.getElementById('producto-costo');
    const sugerido = document.getElementById('producto-sugerido');
    const markup = document.getElementById('producto-markup');
    const venta = document.getElementById('producto-venta');
    const origenVenta = document.getElementById('producto-origen-venta');
    const entera = document.getElementById('producto-entera');
    const enteraOrigen = document.getElementById('producto-entera-origen');
    const web = document.getElementById('producto-web');
    const stock = document.getElementById('producto-stock');

    const resumenGrid = document.getElementById('producto-resumen-grid');
    const ingredientes = document.getElementById('producto-ingredientes');
    const ventaGrid = document.getElementById('producto-venta-grid');
    const stockGrid = document.getElementById('producto-stock-grid');
    const historialGrid = document.getElementById('producto-historial-grid');

    const actionLinks = {
        editarReceta: document.getElementById('producto-editar-receta'),
        gestionar: document.getElementById('producto-gestionar-venta'),
        precios: document.getElementById('producto-ir-precios'),
        stock: document.getElementById('producto-ir-stock'),
        receta: document.getElementById('producto-ir-receta')
    };

    let recetas = [];
    let materiasMap = new Map();
    let margenGlobal = 0;
    let selectedId = new URLSearchParams(window.location.search).get('id') || null;
    let loadedRecipes = false;
    let loadedMaterials = false;

    const dataBox = (label, value, extra = '') => `
        <div class="ds-product-data">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(String(value ?? '—'))}</strong>
            ${extra ? `<small>${escapeHtml(extra)}</small>` : ''}
        </div>
    `;

    const tsToText = value => {
        if (!value) return 'Sin registro';
        try { return formatTimestampDateTime(value) || 'Sin registro'; }
        catch { return 'Sin registro'; }
    };

    const ingredientRows = recipe => {
        const rows = Array.isArray(recipe.ingredientes) ? recipe.ingredientes : [];
        if (!rows.length) return '<div class="ds-product-data"><strong>Esta receta no tiene ingredientes cargados.</strong></div>';

        return rows.map(item => {
            const material = materiasMap.get(item.idMateriaPrima);
            const unitCost = getEffectiveUnitCost(material);
            const qty = Number(item.cantidad) || 0;
            const subtotal = qty * unitCost;
            const materialName = material?.nombre || item.nombre || 'Materia prima';
            const unit = material?.unidad || '';
            return `
                <div class="ds-ingredient-row">
                    <div><strong>${escapeHtml(materialName)}</strong><small>${qty.toLocaleString('es-AR')} ${escapeHtml(unit)}</small></div>
                    <span>${formatCurrency(unitCost)} / ${escapeHtml(unit || 'u.')}</span>
                    <strong>${formatCurrency(subtotal)}</strong>
                </div>
            `;
        }).join('');
    };

    const enrich = recipe => {
        const sale = calculateProductSalePrice(recipe, materiasMap, margenGlobal);
        const whole = calculateWholeCakePricing({
            unitPrice: sale.price,
            portions: recipe.porcionesTortaEntera,
            manualPrice: recipe.precioTortaEnteraManual
        });
        const rawIngredients = Array.isArray(recipe.ingredientes) ? recipe.ingredientes : [];
        const supplierAlerts = rawIngredients.reduce((total, item) => {
            const material = materiasMap.get(item.idMateriaPrima);
            const variation = Number(material?.proveedorVariacionPct);
            return total + (Number.isFinite(variation) && Math.abs(variation) >= 10 ? 1 : 0);
        }, 0);
        const missingCosts = rawIngredients.reduce((total, item) => {
            const material = materiasMap.get(item.idMateriaPrima);
            return total + (getEffectiveUnitCost(material) <= 0 ? 1 : 0);
        }, 0);

        return {
            ...recipe,
            sale,
            whole,
            supplierAlerts,
            missingCosts,
            stock: Number(recipe.stockMostrador) || 0,
            webEnabled: recipe.precioWebHabilitado === true
        };
    };

    const filteredProducts = () => {
        const term = (buscar?.value || '').trim().toLowerCase();
        const cat = categoria?.value || '';
        return recetas
            .filter(item => !term || String(item.nombreTorta || '').toLowerCase().includes(term))
            .filter(item => !cat || String(item.categoria || 'Sin categoría') === cat)
            .sort((a,b)=>String(a.nombreTorta||'').localeCompare(String(b.nombreTorta||''),'es'));
    };

    const rebuildCategories = () => {
        if (!categoria) return;
        const current = categoria.value;
        const categories = [...new Set(recetas.map(r => String(r.categoria || 'Sin categoría')))]
            .sort((a,b)=>a.localeCompare(b,'es'));
        categoria.innerHTML = '<option value="">Todas las categorías</option>' +
            categories.map(cat => `<option value="${escapeAttribute(cat)}">${escapeHtml(cat)}</option>`).join('');
        if (categories.includes(current)) categoria.value = current;
    };

    const renderList = () => {
        if (!lista) return;
        const rows = filteredProducts();
        if (count) count.textContent = `${rows.length} de ${recetas.length} productos`;

        if (!rows.length) {
            lista.innerHTML = '<div class="ds-product-data" style="margin:10px">No hay productos para este filtro.</div>';
            return;
        }

        lista.innerHTML = rows.map(recipe => {
            const isActive = String(recipe.id) === String(selectedId);
            return `
                <button type="button" class="ds-product-row ${isActive ? 'is-active' : ''}" data-product-id="${escapeAttribute(recipe.id)}">
                    <div>
                        <strong>${escapeHtml(recipe.nombreTorta || 'Producto')}</strong>
                        <small>${escapeHtml(recipe.categoria || 'Sin categoría')} · ${escapeHtml(recipe.presentacionVenta || 'Presentación sin definir')}</small>
                    </div>
                    <div class="ds-product-row-status" aria-hidden="true">
                        <span class="ds-product-dot ${recipe.precioVentaManual ? 'is-manual' : ''}" title="Precio manual"></span>
                        <span class="ds-product-dot ${recipe.precioWebHabilitado === true ? 'is-web' : ''}" title="Web"></span>
                    </div>
                </button>
            `;
        }).join('');
    };

    const setActionLinks = product => {
        const id = encodeURIComponent(product.id);
        actionLinks.editarReceta.href = `recetas.html?producto=${id}`;
        actionLinks.receta.href = `recetas.html?producto=${id}`;
        actionLinks.gestionar.href = `pos.html?gestionarProducto=${id}`;
        actionLinks.stock.href = `pos.html?gestionarProducto=${id}`;
        actionLinks.precios.href = `precios.html?producto=${id}`;
    };

    const renderDetail = id => {
        const base = recetas.find(item => String(item.id) === String(id));
        if (!base || !loadedMaterials) {
            if (detalle) detalle.hidden = true;
            if (vacio) vacio.hidden = false;
            return;
        }
        const product = enrich(base);
        selectedId = product.id;
        const sale = product.sale;
        const whole = product.whole;
        const hasManual = sale.manualPrice !== null;

        if (vacio) vacio.hidden = true;
        if (detalle) detalle.hidden = false;
        if (nombre) nombre.textContent = product.nombreTorta || 'Producto';
        if (subtitulo) subtitulo.textContent =
            `${product.categoria || 'Sin categoría'} · ${product.presentacionVenta || 'Presentación sin definir'} · ID ${product.id}`;

        if (costo) costo.textContent = formatCurrency(sale.cost);
        if (sugerido) sugerido.textContent = formatCurrency(sale.suggestedPrice);
        if (markup) markup.textContent = `Costo + ${sale.marginPercent}% ${product.margenIndividual !== null && product.margenIndividual !== undefined && product.margenIndividual !== '' ? '· individual' : '· global'}`;
        if (venta) venta.textContent = formatCurrency(sale.price);
        if (origenVenta) origenVenta.textContent = hasManual ? 'Definido manualmente' : 'Usa sugerido';
        if (entera) entera.textContent = whole.currentPrice ? formatCurrency(whole.currentPrice) : '—';
        if (enteraOrigen) enteraOrigen.textContent = whole.source === 'manual' ? 'Precio definido' : whole.source === 'automatico' ? 'Calculado' : 'Sin configurar';
        if (web) {
            web.textContent = product.webEnabled ? '✓ Publicado' : 'No publicado';
            web.className = product.webEnabled ? 'ds-status-ok' : 'ds-status-warn';
        }
        if (stock) stock.textContent = `Stock: ${product.stock.toLocaleString('es-AR')} u.`;

        if (resumenGrid) resumenGrid.innerHTML = [
            dataBox('Presentación', product.presentacionVenta || 'Sin definir'),
            dataBox('Rendimiento de receta', product.rendimiento || 'Sin definir'),
            dataBox('Unidades por venta', sale.unitsPerSale),
            dataBox('Margen aplicado', sale.marginPercent + '%'),
            dataBox('Precio real', formatCurrency(sale.price), hasManual ? 'Manual' : 'Sugerido'),
            dataBox('Torta entera', whole.currentPrice ? formatCurrency(whole.currentPrice) : 'Sin configurar'),
            dataBox('Stock terminado', product.stock + ' u.'),
            dataBox('Web', product.webEnabled ? 'Publicado' : 'No publicado'),
            dataBox('Alertas de proveedor', product.supplierAlerts, product.supplierAlerts ? 'Variación ≥ 10%' : 'Sin alertas importantes'),
            dataBox('Ingredientes sin costo', product.missingCosts, product.missingCosts ? 'Revisar receta' : 'Completo')
        ].join('');

        if (ingredientes) ingredientes.innerHTML = ingredientRows(product);

        if (ventaGrid) ventaGrid.innerHTML = [
            dataBox('Precio sugerido', formatCurrency(sale.suggestedPrice)),
            dataBox('Precio vigente', formatCurrency(sale.price), hasManual ? 'Manual' : 'Sugerido'),
            dataBox('Margen aplicado', sale.marginPercent + '%'),
            dataBox('Costo por venta', formatCurrency(sale.cost)),
            dataBox('Porciones torta entera', whole.portions || 'Sin configurar'),
            dataBox('Torta entera vigente', whole.currentPrice ? formatCurrency(whole.currentPrice) : 'Sin configurar', whole.source === 'manual' ? 'Manual' : whole.source === 'automatico' ? 'Calculado' : ''),
            dataBox('Presentación', product.presentacionVenta || 'Sin definir'),
            dataBox('Unidades por venta', sale.unitsPerSale)
        ].join('');

        if (stockGrid) stockGrid.innerHTML = [
            dataBox('Stock terminado', product.stock + ' u.', 'Informativo: no bloquea venta'),
            dataBox('Código de barras', product.codigoBarras || 'Sin asignar'),
            dataBox('Código permanente', product.id),
            dataBox('Publicación web', product.webEnabled ? '✓ Habilitada' : 'No publicada'),
            dataBox('Precio que consulta la web', formatCurrency(sale.price)),
            dataBox('Torta entera web', whole.currentPrice ? formatCurrency(whole.currentPrice) : 'Sin configurar')
        ].join('');

        if (historialGrid) historialGrid.innerHTML = [
            dataBox('Actualización comercial', tsToText(product.configComercialActualizadaAt)),
            dataBox('Última revisión de precio', tsToText(product.revisionPrecioAt || product.ultimaRevisionPrecio)),
            dataBox('Última actualización web', tsToText(product.ultimaActualizacionPrecioWeb)),
            dataBox('Movimientos de stock', 'Abrir desde Gestionar', 'Se conserva el historial original')
        ].join('');

        setActionLinks(product);
        renderList();

        const url = new URL(window.location.href);
        url.searchParams.set('id', product.id);
        window.history.replaceState({}, '', url);
    };

    const refresh = () => {
        if (!loadedRecipes || !loadedMaterials) return;
        rebuildCategories();
        renderList();
        if (selectedId && recetas.some(item => String(item.id) === String(selectedId))) {
            renderDetail(selectedId);
        } else if (recetas.length === 1) {
            renderDetail(recetas[0].id);
        }
    };

    lista?.addEventListener('click', event => {
        const row = event.target.closest('[data-product-id]');
        if (row) renderDetail(row.dataset.productId);
    });
    buscar?.addEventListener('input', renderList);
    categoria?.addEventListener('change', renderList);

    document.querySelectorAll('.ds-product-tab').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.ds-product-tab').forEach(btn => btn.classList.toggle('is-active', btn === button));
            document.querySelectorAll('.ds-product-panel').forEach(panel => { panel.hidden = true; });
            const target = document.getElementById('producto-panel-' + button.dataset.tab);
            if (target) target.hidden = false;
        });
    });

    document.addEventListener('click', event => {
        const help = event.target.closest('[data-help]');
        if (!help || !helpBox) return;
        helpBox.textContent = help.dataset.help || '';
        helpBox.hidden = false;
        helpBox.scrollIntoView({ block: 'nearest' });
    });

    onSnapshot(doc(db, 'config', 'mostrador'), snapshot => {
        margenGlobal = snapshot.exists() ? Number(snapshot.data().margenGlobal) || 0 : 0;
        refresh();
    });

    onSnapshot(collection(db, 'materiasPrimas'), snapshot => {
        materiasMap = new Map(snapshot.docs.map(material => [material.id, { id: material.id, ...material.data() }]));
        loadedMaterials = true;
        refresh();
    });

    onSnapshot(collection(db, 'recetas'), snapshot => {
        recetas = snapshot.docs.map(recipe => ({ id: recipe.id, ...recipe.data() }));
        loadedRecipes = true;
        refresh();
    });
}
