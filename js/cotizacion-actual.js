import { 
    getFirestore, collection, getDocs, query, addDoc, Timestamp 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getCartItems, removeFromCart, clearCart, updateCartIcon, updateCartItemQuantity } from './cart.js';

export function setupCotizacion(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');

    // --- Referencias al DOM ---
    const itemsContainer = document.getElementById('lista-carrito-container'); // ID corregido según tu HTML nuevo
    const vacioMsg = document.getElementById('carrito-vacio-msg');
    
    // Inputs de cálculo
    const horasTrabajoInput = document.getElementById('horas-trabajo');
    const costoHoraInput = document.getElementById('costo-hora');
    const costosFijosPorcInput = document.getElementById('costos-fijos-porcentaje');
    const gananciaPorcInput = document.getElementById('ganancia-porcentaje');
    
    // Spans de resultados
    const resumenCostoMaterialesSpan = document.getElementById('resumen-costo-materiales');
    const subtotalManoObraSpan = document.getElementById('subtotal-mano-obra');
    const subtotalCostosFijosSpan = document.getElementById('subtotal-costos-fijos');
    const costoProduccionSpan = document.getElementById('costo-produccion');
    const totalGananciaSpan = document.getElementById('total-ganancia');
    const precioVentaSugeridoSpan = document.getElementById('precio-venta-sugerido');

    // Sección de Guardado
    const clienteInput = document.getElementById('cotizacion-nombre-cliente');
    const tituloInput = document.getElementById('cotizacion-titulo');
    const datalistClientes = document.getElementById('lista-clientes-existentes');
    const btnFinalizar = document.getElementById('btn-finalizar-cotizacion');
    const btnVaciar = document.getElementById('btn-vaciar-carrito');

    // Modal de Resumen
    const resumenModal = document.getElementById('resumen-cotizacion-modal');
    const resumenTexto = document.getElementById('resumen-cotizacion-texto');
    const btnCerrarResumen = document.getElementById('resumen-cotizacion-btn-cerrar');
    const btnCopiarResumen = document.getElementById('resumen-cotizacion-btn-copiar');
    const feedbackCopiado = document.getElementById('copiado-feedback-cotizacion');

    let materiasPrimas = [];
    let costoTotalMateriales = 0;

    // Helpers
    const formatCurrency = (value) => (value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatCurrencyForParse = (value) => (value || '0').replace(/\$|\./g, '').replace(',', '.');

    // ------------------------------------------------------
    // CÁLCULOS DE COSTOS
    // ------------------------------------------------------

    // Calcular costo para recetas "viejas" (enteras) basadas en ingredientes
    const calcularCostoFIFO = (materiaPrima, cantidadRequerida) => {
        if (!materiaPrima || !materiaPrima.lotes) return { costo: 0 };
        
        let costo = 0;
        let restante = cantidadRequerida;
        // Lotes ordenados por fecha (FIFO)
        const lotes = [...(materiaPrima.lotes || [])].sort((a,b) => (a.fechaCompra?.seconds || 0) - (b.fechaCompra?.seconds || 0));
        
        for(const lote of lotes) {
            if(restante <= 0) break;
            const usar = Math.min(lote.stockRestante, restante);
            costo += usar * lote.costoUnitario;
            restante -= usar;
        }
        // Si falta stock, usamos el precio del último lote
        if(restante > 0 && lotes.length > 0) {
            const ultimoLote = lotes[lotes.length - 1];
            costo += restante * ultimoLote.costoUnitario;
        }
        return { costo };
    };
    
    // Calcular el precio final de venta sugerido
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

        // Actualizar DOM
        resumenCostoMaterialesSpan.textContent = `$${formatCurrency(costoTotalMateriales)}`;
        subtotalManoObraSpan.textContent = `$${formatCurrency(subtotalManoObra)}`;
        subtotalCostosFijosSpan.textContent = `$${formatCurrency(subtotalCostosFijos)}`;
        costoProduccionSpan.textContent = `$${formatCurrency(costoProduccion)}`;
        totalGananciaSpan.textContent = `$${formatCurrency(totalGanancia)}`;
        precioVentaSugeridoSpan.textContent = `$${formatCurrency(precioVenta)}`;
    };

    // ------------------------------------------------------
    // RENDERIZADO DEL CARRITO
    // ------------------------------------------------------

    const renderCart = () => {
        const items = getCartItems();
        updateCartIcon();
        itemsContainer.innerHTML = '';
        
        // Manejo de estado vacío
        if (items.length === 0) {
            vacioMsg.style.display = 'block';
            // Ocultamos secciones de cálculo si está vacío
            document.getElementById('calculo-precio-venta').style.display = 'none';
            if(btnFinalizar) btnFinalizar.parentElement.style.display = 'none'; // Oculta sección de guardar
            if(btnVaciar) btnVaciar.style.display = 'none';
            costoTotalMateriales = 0;
            return;
        }

        // Mostramos secciones si hay datos
        vacioMsg.style.display = 'none';
        document.getElementById('calculo-precio-venta').style.display = 'block';
        if(btnFinalizar) btnFinalizar.parentElement.style.display = 'block';
        if(btnVaciar) btnVaciar.style.display = 'inline-block';

        let subtotalGeneral = 0;

        items.forEach(item => {
            let costoItem = 0;

            // CASO A: Ítem NUEVO (Porciones con precio ya calculado)
            if (item.precio !== undefined && item.precio > 0) {
                costoItem = item.precio;
            } 
            // CASO B: Ítem VIEJO (Receta entera, calcular desde ingredientes)
            else if (item.ingredientes) {
                (item.ingredientes || []).forEach(ing => {
                    const mp = materiasPrimas.find(m => m.id === ing.idMateriaPrima);
                    if (mp) {
                        const { costo } = calcularCostoFIFO(mp, ing.cantidad);
                        costoItem += costo;
                    }
                });
            }

            // Si el ítem tiene cantidad > 1 (ej: 2 cajas de 8 porciones), multiplicamos
            const cantidadBultos = item.cantidad || 1;
            const costoTotalLinea = costoItem * cantidadBultos; // costoItem ya trae el precio del bloque de porciones
            
            subtotalGeneral += costoTotalLinea;

            const itemDiv = document.createElement('div');
            itemDiv.className = 'cart-item';
            
            // Usamos item.cartId para identificar unívocamente
            itemDiv.innerHTML = `
                <div class="cart-item__info">
                    <h4>${item.nombre || item.nombreTorta}</h4>
                    <p style="font-size: 0.9rem; color: var(--text-light);">${item.detalle || ''}</p>
                    <p class="precio" style="color: var(--primary-color); font-weight: bold;">
                        $${formatCurrency(costoTotalLinea)}
                    </p>
                </div>
                <div class="cart-item__actions">
                    <!-- Input para cambiar cantidad de bultos/cajas -->
                    <label>Cant:</label>
                    <input type="number" class="item-quantity-input" data-cart-id="${item.cartId}" value="${cantidadBultos}" min="1" style="width: 50px;">
                    
                    <button class="btn-remove-item" data-cart-id="${item.cartId}" title="Eliminar">
                        🗑️
                    </button>
                </div>
            `;
            itemsContainer.appendChild(itemDiv);
        });

        costoTotalMateriales = subtotalGeneral;
        calcularPrecioVenta();
    };

    // ------------------------------------------------------
    // GENERACIÓN DE RESUMEN Y GUARDADO
    // ------------------------------------------------------

    const generarMensajeResumen = (cliente, titulo, items, total) => {
        const precioVentaTotal = parseFloat(formatCurrencyForParse(precioVentaSugeridoSpan.textContent));
        
        // Prorrateo simple del precio de venta basado en el costo de cada ítem
        let detalleItems = items.map(item => {
            let costoItem = item.precio || 0; // Intenta usar el precio directo
            
            // Si es viejo y no tiene precio directo, calcúlalo
            if (costoItem === 0 && item.ingredientes) {
                (item.ingredientes || []).forEach(ing => {
                    const mp = materiasPrimas.find(m => m.id === ing.idMateriaPrima);
                    if(mp) costoItem += calcularCostoFIFO(mp, ing.cantidad).costo;
                });
            }
            
            const costoTotalLinea = costoItem * (item.cantidad || 1);
            const proporcion = costoTotalMateriales > 0 ? costoTotalLinea / costoTotalMateriales : 0;
            const precioVentaItem = precioVentaTotal * proporcion;
            
            const nombreMostrar = item.nombre || item.nombreTorta;
            const detalleMostrar = item.detalle ? ` (${item.detalle})` : '';
            
            return `* ${item.cantidad}x ${nombreMostrar}${detalleMostrar}: $${formatCurrency(precioVentaItem)}`;
        }).join('\n');
        
        return `¡Hola ${cliente}! 👋\n\nAquí tienes la cotización para "${titulo}":\n\n${detalleItems}\n\n**TOTAL: $${formatCurrency(total)}**\n\n¡Gracias! 🎂`;
    };

    // Listener Guardar
    btnFinalizar.addEventListener('click', async () => {
        btnFinalizar.disabled = true;
        btnFinalizar.textContent = 'Guardando...';
        
        const cliente = clienteInput.value.trim();
        const titulo = tituloInput.value.trim();
        
        if (!cliente || !titulo) {
            alert('Ingresa cliente y título.');
            btnFinalizar.disabled = false;
            btnFinalizar.textContent = 'Guardar Cotización en Historial';
            return;
        }
        
        const items = getCartItems();
        const precioVentaFinal = parseFloat(formatCurrencyForParse(precioVentaSugeridoSpan.textContent));

        const presupuestoGuardado = {
            tituloTorta: titulo,
            nombreCliente: cliente,
            fecha: Timestamp.now(),
            costoMateriales: costoTotalMateriales,
            precioVenta: precioVentaFinal,
            esVenta: false,
            // Guardamos los productos simplificados
            productos: items.map(i => ({
                nombre: i.nombre || i.nombreTorta,
                detalle: i.detalle || '',
                cantidad: i.cantidad || 1,
                precioCostoSnapshot: i.precio || 0
            }))
        };

        try {
            await addDoc(presupuestosGuardadosCollection, presupuestoGuardado);
            
            const mensaje = generarMensajeResumen(cliente, titulo, items, precioVentaFinal);
            resumenTexto.value = mensaje; // Usamos .value para textarea
            resumenModal.classList.add('visible');
            
        } catch (error) {
            console.error("Error:", error);
            alert("Error al guardar.");
            btnFinalizar.disabled = false;
        }
    });

    // ------------------------------------------------------
    // LISTENERS GENERALES
    // ------------------------------------------------------

    // Cambios en cantidades del carrito
    itemsContainer.addEventListener('change', e => {
        if (e.target.classList.contains('item-quantity-input')) {
            const cartId = e.target.dataset.cartId; // ID Único
            const newQuantity = parseInt(e.target.value, 10);
            if (newQuantity > 0) {
                updateCartItemQuantity(cartId, newQuantity); // Función de cart.js
                renderCart();
            }
        }
    });

    // Borrar ítem
    itemsContainer.addEventListener('click', e => {
        const target = e.target.closest('.btn-remove-item');
        if (target) {
            const cartId = target.dataset.cartId; // ID Único
            if (confirm('¿Quitar este ítem?')) {
                removeFromCart(cartId);
                renderCart();
            }
        }
    });
    
    // Vaciar
    btnVaciar.addEventListener('click', () => {
        if(confirm('¿Vaciar todo?')) {
            clearCart();
            renderCart();
        }
    });

    // Recálculo de precios al escribir
    [horasTrabajoInput, costoHoraInput, costosFijosPorcInput, gananciaPorcInput].forEach(input => {
        input.addEventListener('input', calcularPrecioVenta);
    });

    // Botones del modal resumen
    btnCerrarResumen.addEventListener('click', () => {
        resumenModal.classList.remove('visible');
        clearCart();
        window.location.href = 'historial.html';
    });

    btnCopiarResumen.addEventListener('click', () => {
        navigator.clipboard.writeText(resumenTexto.value).then(() => {
            feedbackCopiado.textContent = '¡Copiado!';
            setTimeout(() => feedbackCopiado.textContent = '', 2000);
        });
    });

    // ------------------------------------------------------
    // INICIALIZACIÓN
    // ------------------------------------------------------
    const loadInitialData = async () => {
        try {
            // Cargamos materias primas para poder calcular costos de recetas viejas si las hubiera
            const [materiasPrimasSnap, presSnap] = await Promise.all([
                getDocs(query(materiasPrimasCollection)),
                getDocs(query(presupuestosGuardadosCollection))
            ]);
            
            materiasPrimas = materiasPrimasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Cargar clientes para el autocompletado
            const nombres = new Set();
            presSnap.forEach(doc => {
                if (doc.data().nombreCliente) nombres.add(doc.data().nombreCliente);
            });
            datalistClientes.innerHTML = '';
            nombres.forEach(nombre => datalistClientes.innerHTML += `<option value="${nombre}">`);
            
            renderCart();
        } catch (error) {
            console.error("Error loading data:", error);
        }
    };

    loadInitialData();
}
