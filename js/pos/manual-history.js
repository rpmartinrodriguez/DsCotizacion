import {
    Timestamp, query, where, getDocs, addDoc, updateDoc, doc
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { formatCurrency, dateToYMD } from "../core/format.js";
import { escapeHtml } from "../core/html.js";

export function setupManualHistory({
    db,
    cajasCollection,
    ventasCollection,
    getCurrentUser,
    getUserName,
    onViewChange = () => {}
}) {
    const pantallaPOS = document.getElementById('pantalla-pos');
    const pantallaStock = document.getElementById('pantalla-stock-mostrador');
    const pantallaPromociones = document.getElementById('pantalla-promociones');
    const pantallaCargaHistorica = document.getElementById('pantalla-carga-historica');
    const btnIrCargaHistorica = document.getElementById('btn-ir-carga-historica');
    const btnVolverMostradorHistorico = document.getElementById('btn-volver-mostrador-historico');

    const manualFecha = document.getElementById('manual-fecha');
    const manualMetodoFila = document.getElementById('manual-metodo-fila');
    const manualProductoInput = document.getElementById('manual-producto-input');
    const listaProdManual = document.getElementById('lista-prod-manual');
    const manualPrecioSugerido = document.getElementById('manual-precio-sugerido');
    const manualCantidad = document.getElementById('manual-cantidad');
    const manualPrecioTotal = document.getElementById('manual-precio-total');
    const manualPrecio = document.getElementById('manual-precio');
    const btnAddManualItem = document.getElementById('btn-add-manual-item');
    const manualTablaBody = document.getElementById('manual-tabla-body');
    const manualTotalEfectivo = document.getElementById('manual-total-efectivo');
    const manualTotalMp = document.getElementById('manual-total-mp');
    const manualTotalGeneral = document.getElementById('manual-total-general');
    const btnGuardarManual = document.getElementById('btn-guardar-manual');
    const buscadorPOS = document.getElementById('buscador-pos');

    let products = [];
    let cart = [];

    const updateProductDatalist = () => {
        if (!listaProdManual) return;

        listaProdManual.innerHTML = '';
        products.forEach((product) => {
            const option = document.createElement('option');
            option.value = product.nombreTorta || '';
            listaProdManual.appendChild(option);
        });
    };

    const setProducts = (nextProducts = []) => {
        products = Array.isArray(nextProducts) ? nextProducts : [];
        updateProductDatalist();
    };

    const calculateFromUnit = () => {
        const unitPrice = parseFloat(manualPrecio?.value) || 0;
        const quantity = parseInt(manualCantidad?.value, 10) || 1;
        if (manualPrecioTotal) manualPrecioTotal.value = (unitPrice * quantity).toFixed(0);
    };

    const calculateFromTotal = () => {
        const total = parseFloat(manualPrecioTotal?.value) || 0;
        const quantity = parseInt(manualCantidad?.value, 10) || 1;
        if (quantity > 0 && manualPrecio) {
            manualPrecio.value = (total / quantity).toFixed(2);
        }
    };

    const renderTable = () => {
        if (!manualTablaBody) return;

        manualTablaBody.innerHTML = '';

        if (cart.length === 0) {
            manualTablaBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;color:#94a3b8;padding:2rem;">
                        No agregaste ningún movimiento a la carga todavía.
                    </td>
                </tr>
            `;

            if (manualTotalEfectivo) manualTotalEfectivo.textContent = formatCurrency(0);
            if (manualTotalMp) manualTotalMp.textContent = formatCurrency(0);
            if (manualTotalGeneral) manualTotalGeneral.textContent = formatCurrency(0);
            return;
        }

        let cashTotal = 0;
        let mpTotal = 0;

        cart.forEach((item, index) => {
            if (item.metodo === 'Efectivo') cashTotal += item.precioTotal;
            else mpTotal += item.precioTotal;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><span style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:.85rem;">${escapeHtml(item.fecha)}</span></td>
                <td><strong style="color:#4c1d95;">${escapeHtml(item.nombre)}</strong></td>
                <td style="text-align:center;">${item.cantidad}</td>
                <td style="color:#64748b;">${formatCurrency(item.precioUnitario)}</td>
                <td style="font-weight:bold;color:${item.metodo === 'Efectivo' ? '#15803d' : '#0369a1'};">${formatCurrency(item.precioTotal)}</td>
                <td>${item.metodo === 'Efectivo' ? '💵 Efectivo' : '📱 MercadoPago'}</td>
                <td style="text-align:center;">
                    <button class="btn-remove-manual-row" data-index="${index}" type="button"
                        style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#ef4444;"
                        title="Quitar fila">🗑️</button>
                </td>
            `;
            manualTablaBody.appendChild(row);
        });

        if (manualTotalEfectivo) manualTotalEfectivo.textContent = formatCurrency(cashTotal);
        if (manualTotalMp) manualTotalMp.textContent = formatCurrency(mpTotal);
        if (manualTotalGeneral) manualTotalGeneral.textContent = formatCurrency(cashTotal + mpTotal);
    };

    const resetEntryFields = () => {
        if (manualProductoInput) manualProductoInput.value = '';
        if (manualPrecioSugerido) manualPrecioSugerido.textContent = 'Precio hoy: $0.00';
        if (manualPrecioTotal) manualPrecioTotal.value = '';
        if (manualPrecio) manualPrecio.value = '';
        if (manualCantidad) manualCantidad.value = '1';
        manualProductoInput?.focus();
    };

    btnIrCargaHistorica?.addEventListener('click', () => {
        if (pantallaPOS) pantallaPOS.style.display = 'none';
        if (pantallaStock) pantallaStock.style.display = 'none';
        if (pantallaPromociones) pantallaPromociones.style.display = 'none';
        if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'block';
        onViewChange();
        window.scrollTo(0, 0);

        if (manualFecha) manualFecha.value = dateToYMD(new Date());
        cart = [];
        renderTable();
    });

    btnVolverMostradorHistorico?.addEventListener('click', () => {
        if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'none';
        if (pantallaPOS) pantallaPOS.style.display = 'grid';
        onViewChange();
        window.scrollTo(0, 0);
        buscadorPOS?.focus();
    });

    manualProductoInput?.addEventListener('input', (event) => {
        const productName = event.target.value.trim();
        const product = products.find((item) => item.nombreTorta === productName);

        if (!product) {
            if (manualPrecioSugerido) manualPrecioSugerido.textContent = 'Precio hoy: $0.00';
            return;
        }

        if (manualPrecioSugerido) {
            manualPrecioSugerido.textContent = `Precio hoy: ${formatCurrency(product.precioCalculado)}`;
        }

        if (!manualPrecio?.value && !manualPrecioTotal?.value && manualPrecio) {
            manualPrecio.value = product.precioCalculado;
            calculateFromUnit();
        }
    });

    manualPrecio?.addEventListener('input', calculateFromUnit);
    manualCantidad?.addEventListener('input', calculateFromUnit);
    manualPrecioTotal?.addEventListener('input', calculateFromTotal);

    btnAddManualItem?.addEventListener('click', () => {
        const date = manualFecha?.value || '';
        const productName = manualProductoInput?.value.trim() || '';
        const paymentMethod = manualMetodoFila?.value || 'Efectivo';

        if (!date) {
            alert('Seleccioná la fecha del movimiento.');
            return;
        }

        const product = products.find((item) => item.nombreTorta === productName);
        if (!product) {
            alert('Escribí y seleccioná un producto válido de la lista.');
            return;
        }

        const unitPrice = parseFloat(manualPrecio?.value);
        const totalPrice = parseFloat(manualPrecioTotal?.value);
        const quantity = parseInt(manualCantidad?.value, 10);

        if (Number.isNaN(unitPrice) || unitPrice < 0 || Number.isNaN(totalPrice)) {
            alert('El precio debe ser un número válido.');
            return;
        }

        if (Number.isNaN(quantity) || quantity <= 0) {
            alert('La cantidad debe ser mayor a 0.');
            return;
        }

        cart.push({
            id: product.id,
            nombre: product.nombreTorta,
            fecha: date,
            metodo: paymentMethod,
            precioUnitario: unitPrice,
            precioTotal: totalPrice,
            cantidad: quantity
        });

        resetEntryFields();
        renderTable();
    });

    manualTablaBody?.addEventListener('click', (event) => {
        const button = event.target.closest('.btn-remove-manual-row');
        if (!button) return;

        const index = Number(button.dataset.index);
        if (!Number.isInteger(index)) return;

        cart.splice(index, 1);
        renderTable();
    });

    btnGuardarManual?.addEventListener('click', async () => {
        if (cart.length === 0) {
            alert('La tabla de carga está vacía.');
            return;
        }

        const currentUser = getCurrentUser?.();
        if (!currentUser) {
            window.location.replace('login.html');
            return;
        }

        btnGuardarManual.disabled = true;
        btnGuardarManual.textContent = 'Guardando movimientos...';

        try {
            const groupedByDate = {};
            cart.forEach((item) => {
                if (!groupedByDate[item.fecha]) groupedByDate[item.fecha] = [];
                groupedByDate[item.fecha].push(item);
            });

            for (const dateString of Object.keys(groupedByDate)) {
                const items = groupedByDate[dateString];
                const [year, month, day] = dateString.split('-').map(Number);

                const dateTimestamp = Timestamp.fromDate(new Date(year, month - 1, day, 12, 0, 0));
                const startOfDay = Timestamp.fromDate(new Date(year, month - 1, day, 0, 0, 0));
                const endOfDay = Timestamp.fromDate(new Date(year, month - 1, day, 23, 59, 59));

                const cashTotal = items
                    .filter((item) => item.metodo === 'Efectivo')
                    .reduce((sum, item) => sum + item.precioTotal, 0);

                const mpTotal = items
                    .filter((item) => item.metodo === 'MercadoPago')
                    .reduce((sum, item) => sum + item.precioTotal, 0);

                const cashQuery = query(
                    cajasCollection,
                    where('fechaApertura', '>=', startOfDay),
                    where('fechaApertura', '<=', endOfDay)
                );

                const cashSnapshot = await getDocs(cashQuery);
                let historicalCashDoc = null;

                cashSnapshot.forEach((documento) => {
                    if (documento.data().turno === 'Carga Manual') {
                        historicalCashDoc = documento;
                    }
                });

                let cashId;

                if (!historicalCashDoc) {
                    const newCash = await addDoc(cajasCollection, {
                        usuarioId: currentUser.uid,
                        usuarioNombre: getUserName?.() || currentUser.email || 'Usuario',
                        turno: 'Carga Manual',
                        fechaApertura: dateTimestamp,
                        fechaCierre: dateTimestamp,
                        fondoInicial: 0,
                        totalEfectivo: cashTotal,
                        totalMercadoPago: mpTotal,
                        estado: 'cerrada',
                        cerradaPor: 'Sistema (Carga Manual)'
                    });
                    cashId = newCash.id;
                } else {
                    cashId = historicalCashDoc.id;
                    const currentData = historicalCashDoc.data();

                    await updateDoc(doc(db, 'cajas', cashId), {
                        totalEfectivo: (currentData.totalEfectivo || 0) + cashTotal,
                        totalMercadoPago: (currentData.totalMercadoPago || 0) + mpTotal
                    });
                }

                for (const item of items) {
                    await addDoc(ventasCollection, {
                        cajaId: cashId,
                        fecha: dateTimestamp,
                        metodoPago: item.metodo,
                        total: item.precioTotal,
                        pagoEfectivo: item.metodo === 'Efectivo' ? item.precioTotal : 0,
                        pagoMercadoPago: item.metodo === 'MercadoPago' ? item.precioTotal : 0,
                        items: [{
                            id: item.id,
                            nombre: item.nombre,
                            precio: item.precioUnitario,
                            cantidad: item.cantidad
                        }],
                        vendedor: 'Carga Histórica',
                        esManual: true
                    });
                }
            }

            alert('¡Todos los movimientos fueron guardados con éxito en la base de datos!');
            cart = [];
            renderTable();
        } catch (error) {
            console.error('Error al guardar venta manual:', error);
            alert('Hubo un error guardando los datos. Revisá tu conexión a internet.');
        } finally {
            btnGuardarManual.disabled = false;
            btnGuardarManual.textContent = '💾 Impactar en la Base de Datos';
        }
    });

    return {
        setProducts,
        reset: () => {
            cart = [];
            renderTable();
            resetEntryFields();
        }
    };
}
