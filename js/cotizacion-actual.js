import { 
    getFirestore, collection, getDocs, query, addDoc, Timestamp 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getCartItems, updateCartItemQuantity, removeFromCart, clearCart } from './cart.js';

export function setupCotizacion(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');

    const itemsContainer = document.getElementById('cart-items-container');
    const btnFinalizar = document.getElementById('btn-finalizar-cotizacion');
    const clienteInput = document.getElementById('cotizacion-nombre-cliente');
    const tituloInput = document.getElementById('cotizacion-titulo');
    const datalistClientes = document.getElementById('lista-clientes-existentes');
    const horasTrabajoInput = document.getElementById('horas-trabajo');
    const costoHoraInput = document.getElementById('costo-hora');
    const costosFijosPorcInput = document.getElementById('costos-fijos-porcentaje');
    const gananciaPorcInput = document.getElementById('ganancia-porcentaje');
    const resumenCostoMaterialesSpan = document.getElementById('resumen-costo-materiales');
    const subtotalManoObraSpan = document.getElementById('subtotal-mano-obra');
    const subtotalCostosFijosSpan = document.getElementById('subtotal-costos-fijos');
    const costoProduccionSpan = document.getElementById('costo-produccion');
    const totalGananciaSpan = document.getElementById('total-ganancia');
    const precioVentaSugeridoSpan = document.getElementById('precio-venta-sugerido');
    const resumenModal = document.getElementById('resumen-cotizacion-modal');
    const resumenTexto = document.getElementById('resumen-cotizacion-texto');
    const btnCerrarResumen = document.getElementById('resumen-cotizacion-btn-cerrar');
    const btnCopiarResumen = document.getElementById('resumen-cotizacion-btn-copiar');
    const feedbackCopiado = document.getElementById('copiado-feedback-cotizacion');

    let materiasPrimas = [];
    let costoTotalMateriales = 0;

    const formatCurrency = (value) => (value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatCurrencyForParse = (value) => (value || '0').replace(/\$|\./g, '').replace(',', '.');

    const calcularCostoFIFO = (materiaPrima, cantidadRequerida) => {
        let costo = 0;
        let desglose = [];
        let restante = cantidadRequerida;
        const lotes = [...(materiaPrima.lotes || [])].sort((a, b) => (a.fechaCompra?.seconds || 0) - (b.fechaCompra?.seconds || 0));
        for (const lote of lotes) {
            if (restante <= 0) break;
            const usar = Math.min(lote.stockRestante, restante);
            costo += usar * lote.costoUnitario;
            desglose.push({ cantidadUsada: usar, costoUnitario: lote.costoUnitario, fechaLote: lote.fechaCompra });
            restante -= usar;
        }
        if (restante > 0 && lotes.length > 0) {
            const ultimoLote = lotes[lotes.length - 1];
            costo += restante * ultimoLote.costoUnitario;
            desglose.push({ cantidadUsada: restante, costoUnitario: ultimoLote.costoUnitario, fechaLote: null, esProyectado: true });
        }
        return { costo, desglose };
    };

    const calcularPrecioVenta = () => {
        const horasTrabajo = parseFloat(horasTrabajoInput.value) || 0;
        const costoHora = parseFloat(costoHoraInput.value) || 0;
        const costosFijosPorc = parseFloat(costosFijosPorcInput.value) || 0;
        const gananciaPorc = parseFloat(gananciaPorcInput.value) || 0;
        const subtotalManoObra = horasTrabajo * costoHora;
        const subtotalCostosFijos = costoTotalMateriales * (costosFijosPorc / 100);
        const costoProduccion = costoTotalMateriales + subtotalManoObra + subtotalCostosFijos;
        const totalGanancia = costoProduccion * (gananciaPorc / 100);
        const precioVenta = costoProduccion + totalGanancia;
        resumenCostoMaterialesSpan.textContent = `$${formatCurrency(costoTotalMateriales)}`;
        subtotalManoObraSpan.textContent = `$${formatCurrency(subtotalManoObra)}`;
        subtotalCostosFijosSpan.textContent = `$${formatCurrency(subtotalCostosFijos)}`;
        costoProduccionSpan.textContent = `$${formatCurrency(costoProduccion)}`;
        totalGananciaSpan.textContent = `$${formatCurrency(totalGanancia)}`;
        precioVentaSugeridoSpan.textContent = `$${formatCurrency(precioVenta)}`;
    };

    const renderCart = () => {
        const items = getCartItems();
        itemsContainer.innerHTML = '';
        if (items.length === 0) {
            itemsContainer.innerHTML = '<p>Tu cotización está vacía. Ve a la sección de "Postres" para añadir productos.</p>';
            costoTotalMateriales = 0;
            calcularPrecioVenta();
            if(btnFinalizar) btnFinalizar.disabled = true;
            return;
        }
        let subtotal = 0;
        items.forEach(item => {
            let costoItem = 0;
            (item.ingredientes || []).forEach(ing => {
                const mp = materiasPrimas.find(m => m.id === ing.idMateriaPrima);
                if (mp) {
                    const { costo } = calcularCostoFIFO(mp, ing.cantidad);
                    costoItem += costo;
                }
            });
            const costoTotalItem = costoItem * item.cantidad;
            subtotal += costoTotalItem;
            const itemDiv = document.createElement('div');
            itemDiv.className = 'cart-item';
            itemDiv.innerHTML = `<div class="cart-item__info"><h4>${item.nombreTorta}</h4><p>$${formatCurrency(costoTotalItem)}</p></div><div class="cart-item__actions"><label>Cant:</label><input type="number" class="item-quantity-input" data-id="${item.id}" value="${item.cantidad}" min="1"><button class="btn-remove-item" data-id="${item.id}">🗑️</button></div>`;
            itemsContainer.appendChild(itemDiv);
        });
        costoTotalMateriales = subtotal;
        calcularPrecioVenta();
        if(btnFinalizar) btnFinalizar.disabled = false;
    };

    const generarMensajeResumen = (cliente, titulo, items, total) => {
        let detalleItems = items.map(item => {
            let costoItem = 0;
            (item.ingredientes || []).forEach(ing => {
                const mp = materiasPrimas.find(m => m.id === ing.idMateriaPrima);
                if(mp) costoItem += calcularCostoFIFO(mp, ing.cantidad).costo;
            });
            const costoTotalItem = costoItem * item.cantidad;
            const precioVentaTotal = parseFloat(formatCurrencyForParse(precioVentaSugeridoSpan.textContent));
            const totalItemsEnCarrito = items.reduce((acc, i) => acc + i.cantidad, 0);
            const precioVentaItem = (precioVentaTotal / totalItemsEnCarrito) * item.cantidad;
            return `* ${item.cantidad} x ${item.nombreTorta}: $${formatCurrency(precioVentaItem)}`;
        }).join('\n');
        return `¡Hola ${cliente}! 👋\n\nUn placer prepararte la cotización para "${titulo}". Aquí te dejo el detalle:\n\n${detalleItems}\n\n**TOTAL FINAL: $${formatCurrency(total)}**\n\nCualquier duda, estoy a tu disposición.\n\n¡Gracias por tu confianza!\nDulce App — Horneando tus mejores momentos`;
    };

    if (btnFinalizar) {
        btnFinalizar.addEventListener('click', async () => {
            btnFinalizar.disabled = true;
            btnFinalizar.textContent = 'Guardando...';
            const cliente = clienteInput.value.trim();
            const titulo = tituloInput.value.trim();
            if (!cliente || !titulo) {
                alert('Por favor, ingresa un nombre de cliente y un título para la cotización.');
                btnFinalizar.disabled = false;
                btnFinalizar.textContent = 'Guardar Cotización en Historial';
                return;
            }
            const items = getCartItems();
            if (items.length === 0) {
                alert('El carrito está vacío.');
                btnFinalizar.disabled = false;
                btnFinalizar.textContent = 'Guardar Cotización en Historial';
                return;
            }
            const ingredientesConsolidados = {};
            items.forEach(item => {
                (item.ingredientes || []).forEach(ing => {
                    const id = ing.idMateriaPrima;
                    if (!ingredientesConsolidados[id]) {
                        ingredientesConsolidados[id] = { ...ing, cantidadTotal: 0 };
                    }
                    ingredientesConsolidados[id].cantidadTotal += ing.cantidad * item.cantidad;
                });
            });
            let costoFinalReal = 0;
            const ingredientesParaGuardar = Object.values(ingredientesConsolidados).map(ing => {
                const mp = materiasPrimas.find(m => m.id === ing.idMateriaPrima);
                const { costo, desglose } = calcularCostoFIFO(mp, ing.cantidadTotal);
                costoFinalReal += costo;
                return { ...ing, costoTotal: costo, lotesUtilizados: desglose };
            });
            const presupuestoGuardado = {
                tituloTorta: titulo,
                nombreCliente: cliente,
                fecha: Timestamp.now(),
                costoMateriales: costoFinalReal,
                horasTrabajo: parseFloat(horasTrabajoInput.value) || 0,
                costoHora: parseFloat(costoHoraInput.value) || 0,
                porcentajeCostosFijos: parseFloat(costosFijosPorcInput.value) || 0,
                porcentajeGanancia: parseFloat(gananciaPorcInput.value) || 0,
                precioVenta: parseFloat(formatCurrencyForParse(precioVentaSugeridoSpan.textContent)),
                ingredientes: ingredientesParaGuardar,
                esVenta: false,
                fechaEntrega: null
            };
            try {
                await addDoc(presupuestosGuardadosCollection, presupuestoGuardado);
                const totalFinal = presupuestoGuardado.precioVenta;
                const mensaje = generarMensajeResumen(cliente, titulo, items, totalFinal);
                resumenTexto.innerText = mensaje;
                resumenModal.classList.add('visible');
            } catch (error) {
                console.error("Error al guardar la cotización: ", error);
                alert("Hubo un error al guardar la cotización.");
                btnFinalizar.disabled = false;
                btnFinalizar.textContent = 'Guardar Cotización en Historial';
            }
        });
    }

    if (itemsContainer) {
        itemsContainer.addEventListener('change', e => {
            if (e.target.classList.contains('item-quantity-input')) {
                const itemId = e.target.dataset.id;
                const newQuantity = parseInt(e.target.value, 10);
                if (newQuantity > 0) {
                    updateCartItemQuantity(itemId, newQuantity);
                    renderCart();
                }
            }
        });
        itemsContainer.addEventListener('click', e => {
            const target = e.target.closest('.btn-remove-item');
            if (target) {
                const itemId = target.dataset.id;
                if (confirm('¿Quitar este producto de la cotización?')) {
                    removeFromCart(itemId);
                    renderCart();
                }
            }
        });
    }

    [horasTrabajoInput, costoHoraInput, costosFijosPorcInput, gananciaPorcInput].forEach(input => {
        if(input) input.addEventListener('input', calcularPrecioVenta);
    });

    const loadInitialData = async () => {
        try {
            const [materiasPrimasSnap, presSnap] = await Promise.all([
                getDocs(query(materiasPrimasCollection)),
                getDocs(query(presupuestosGuardadosCollection))
            ]);
            materiasPrimas = materiasPrimasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const nombres = new Set();
            presSnap.forEach(doc => {
                if (doc.data().nombreCliente) nombres.add(doc.data().nombreCliente);
            });
            datalistClientes.innerHTML = '';
            nombres.forEach(nombre => datalistClientes.innerHTML += `<option value="${nombre}">`);
            renderCart();
        } catch (error) {
            console.error("Error al cargar datos iniciales:", error);
            if(itemsContainer) itemsContainer.innerHTML = '<p style="color:red;">Error al cargar los datos necesarios para cotizar.</p>';
        }
    };
    
    if (btnCerrarResumen) {
        btnCerrarResumen.addEventListener('click', () => {
            resumenModal.classList.remove('visible');
            clearCart();
            window.location.href = 'historial.html';
        });
    }

    if (btnCopiarResumen) {
        btnCopiarResumen.addEventListener('click', () => {
            navigator.clipboard.writeText(resumenTexto.innerText).then(() => {
                feedbackCopiado.textContent = '¡Copiado!';
                setTimeout(() => { feedbackCopiado.textContent = ''; }, 2000);
            }).catch(err => console.error('Error al copiar: ', err));
        });
    }

    loadInitialData();
}
