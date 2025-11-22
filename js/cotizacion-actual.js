import { 
    getFirestore, collection, getDocs, query, addDoc, Timestamp 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
// Asegúrate de que cart.js tenga estas exportaciones. Si 'updateCartItemQuantity' no existe en tu cart.js, la función de cambiar cantidad en esta pantalla no andará, pero no romperá el resto.
import { getCartItems, removeFromCart, clearCart } from './cart.js';

export function setupCotizacion(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');

    // Referencias al DOM
    const itemsContainer = document.getElementById('cart-items-container');
    const btnFinalizar = document.getElementById('btn-finalizar-cotizacion');
    const clienteInput = document.getElementById('cotizacion-nombre-cliente');
    const tituloInput = document.getElementById('cotizacion-titulo');
    const datalistClientes = document.getElementById('lista-clientes-existentes');
    
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
    
    // Modal de Resumen
    const resumenModal = document.getElementById('resumen-cotizacion-modal');
    const resumenTexto = document.getElementById('resumen-cotizacion-texto');
    const btnCerrarResumen = document.getElementById('resumen-cotizacion-btn-cerrar');
    const btnCopiarResumen = document.getElementById('resumen-cotizacion-btn-copiar');
    const feedbackCopiado = document.getElementById('copiado-feedback-cotizacion');

    let materiasPrimas = [];
    let costoTotalMateriales = 0;

    // Helpers de formato
    const formatCurrency = (value) => (value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatCurrencyForParse = (value) => (value || '0').replace(/\$|\./g, '').replace(',', '.');

    // Función para calcular costos de recetas "viejas" o completas (basadas en stock)
    const calcularCostoFIFO = (materiaPrima, cantidadRequerida) => {
        if (!materiaPrima || !materiaPrima.lotes) {
            return { costo: 0, desglose: [] };
        }
        let costo = 0;
        let desglose = [];
        let restante = cantidadRequerida;
        // Ordenar lotes por fecha (más viejos primero)
        const lotes = [...(materiaPrima.lotes || [])].sort((a,b) => (a.fechaCompra?.seconds || 0) - (b.fechaCompra?.seconds || 0));
        
        for(const lote of lotes) {
            if(restante <= 0) break;
            const usar = Math.min(lote.stockRestante, restante);
            costo += usar * lote.costoUnitario;
            desglose.push({ cantidadUsada: usar, costoUnitario: lote.costoUnitario, fechaLote: lote.fechaCompra });
            restante -= usar;
        }
        // Si falta stock, calculamos con el precio del último lote
        if(restante > 0 && lotes.length > 0) {
            const ultimoLote = lotes[lotes.length - 1];
            costo += restante * ultimoLote.costoUnitario;
            desglose.push({ cantidadUsada: restante, costoUnitario: ultimoLote.costoUnitario, fechaLote: null, esProyectado: true });
        }
        return { costo, desglose };
    };
    
    // Función principal de cálculo de precio de venta
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

    // Renderizar el carrito en pantalla
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

        let subtotalGeneral = 0;

        items.forEach(item => {
            let costoItem = 0;

            // CASO A: Ítem con precio ya calculado (Porciones)
            if (item.precio !== undefined && item.precio > 0) {
                costoItem = item.precio;
            } 
            // CASO B: Ítem antiguo (calcular desde ingredientes)
            else if (item.ingredientes) {
                (item.ingredientes || []).forEach(ing => {
                    const mp = materiasPrimas.find(m => m.id === ing.idMateriaPrima);
                    if (mp) {
                        const { costo } = calcularCostoFIFO(mp, ing.cantidad);
                        costoItem += costo;
                    }
                });
            }

            // Multiplicamos por la cantidad de "paquetes" en el carrito (usualmente 1 si viene de porciones)
            const cantidadItem = item.cantidad || 1;
            const costoTotalItem = costoItem * cantidadItem;
            subtotalGeneral += costoTotalItem;

            const itemDiv = document.createElement('div');
            itemDiv.className = 'cart-item';
            
            // Usamos item.cartId para borrar (es el ID único generado en cart.js)
            itemDiv.innerHTML = `
                <div class="cart-item__info">
                    <h4>${item.nombre || item.nombreTorta}</h4>
                    <p style="font-size:0.9rem; color:#666;">${item.detalle || ''}</p>
                    <p style="color:var(--primary-color); font-weight:bold;">$${formatCurrency(costoTotalItem)}</p>
                </div>
                <div class="cart-item__actions">
                    <button class="btn-remove-item" data-cart-id="${item.cartId}" title="Eliminar" style="background:none; border:none; font-size:1.2rem; cursor:pointer;">🗑️</button>
                </div>
            `;
            itemsContainer.appendChild(itemDiv);
        });

        costoTotalMateriales = subtotalGeneral;
        calcularPrecioVenta();
        if(btnFinalizar) btnFinalizar.disabled = false;

        // Asignar listeners a los botones de borrar
        document.querySelectorAll('.btn-remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cartId = e.currentTarget.dataset.cartId;
                if(confirm('¿Quitar este producto de la cotización?')) {
                    removeFromCart(cartId);
                    renderCart(); // Re-renderizamos después de borrar
                }
            });
        });
    };

    // Generar el mensaje de texto para copiar
    const generarMensajeResumen = (cliente, titulo, items, total) => {
        const precioVentaTotal = parseFloat(formatCurrencyForParse(precioVentaSugeridoSpan.textContent));
        
        // Calculamos cuánto pesa cada ítem en el costo total para prorratear el precio de venta
        let detalleItems = items.map(item => {
            let costoItem = 0;
            // Lógica dual: precio directo o cálculo
            if (item.precio !== undefined && item.precio > 0) {
                costoItem = item.precio;
            } else if (item.ingredientes) {
                (item.ingredientes || []).forEach(ing => {
                    const mp = materiasPrimas.find(m => m.id === ing.idMateriaPrima);
                    if(mp) costoItem += calcularCostoFIFO(mp, ing.cantidad).costo;
                });
            }
            
            const costoTotalItem = costoItem * (item.cantidad || 1);
            
            // Regla de tres simple para asignar precio de venta proporcional al costo
            const proporcionCosto = costoTotalMateriales > 0 ? costoTotalItem / costoTotalMateriales : 0;
            const precioVentaItem = precioVentaTotal * proporcionCosto;
            
            const nombreMostrar = item.nombre || item.nombreTorta;
            return `* ${nombreMostrar}: $${formatCurrency(precioVentaItem)}`;
        }).join('\n');
        
        return `¡Hola ${cliente}! 👋\n\nUn placer prepararte la cotización para "${titulo}". Aquí te dejo el detalle:\n\n${detalleItems}\n\n**TOTAL FINAL: $${formatCurrency(total)}**\n\nCualquier duda, estoy a tu disposición.\n\n¡Gracias por tu confianza!\nDulce App — Horneando tus mejores momentos`;
    };

    // Listener del botón FINALIZAR / GUARDAR
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
                return;
            }
            
            // Preparamos el objeto para guardar en Firebase
            const presupuestoGuardado = {
                tituloTorta: titulo,
                nombreCliente: cliente,
                fecha: Timestamp.now(),
                costoMateriales: costoTotalMateriales,
                horasTrabajo: parseFloat(horasTrabajoInput.value) || 0,
                costoHora: parseFloat(costoHoraInput.value) || 0,
                porcentajeCostosFijos: parseFloat(costosFijosPorcInput.value) || 0,
                porcentajeGanancia: parseFloat(gananciaPorcInput.value) || 0,
                precioVenta: parseFloat(formatCurrencyForParse(precioVentaSugeridoSpan.textContent)),
                esVenta: false,
                fechaEntrega: null,
                esMultiProducto: true,
                // Guardamos una versión simplificada de los productos
                productos: items.map(i => ({
                    id: i.recetaId || i.id,
                    nombre: i.nombre || i.nombreTorta,
                    cantidad: i.cantidad || 1,
                    precioCostoSnapshot: i.precio || 0 // Guardamos el costo al momento de cotizar
                }))
            };

            try {
                await addDoc(presupuestosGuardadosCollection, presupuestoGuardado);
                
                const totalFinal = presupuestoGuardado.precioVenta;
                const mensaje = generarMensajeResumen(cliente, titulo, items, totalFinal);
                
                resumenTexto.innerText = mensaje;
                resumenModal.classList.add('visible');
                
                // No borramos el carrito inmediatamente por si quiere hacer cambios,
                // se borra al cerrar el modal de éxito.
            } catch (error) {
                console.error("Error al guardar la cotización: ", error);
                alert("Hubo un error al guardar la cotización en la base de datos.");
                btnFinalizar.disabled = false;
                btnFinalizar.textContent = 'Guardar Cotización en Historial';
            }
        });
    }

    // Listeners de recálculo al cambiar inputs de valores
    [horasTrabajoInput, costoHoraInput, costosFijosPorcInput, gananciaPorcInput].forEach(input => {
        if(input) input.addEventListener('input', calcularPrecioVenta);
    });

    // Carga inicial de datos
    const loadInitialData = async () => {
        try {
            const [materiasPrimasSnap, presSnap] = await Promise.all([
                getDocs(query(materiasPrimasCollection)),
                getDocs(query(presupuestosGuardadosCollection))
            ]);
            
            materiasPrimas = materiasPrimasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Llenar datalist de clientes previos
            const nombres = new Set();
            presSnap.forEach(doc => {
                if (doc.data().nombreCliente) nombres.add(doc.data().nombreCliente);
            });
            if(datalistClientes) {
                datalistClientes.innerHTML = '';
                nombres.forEach(nombre => datalistClientes.innerHTML += `<option value="${nombre}">`);
            }
            
            renderCart();
        } catch (error) {
            console.error("Error al cargar datos iniciales:", error);
            if(itemsContainer) itemsContainer.innerHTML = '<p style="color:red;">Error de conexión.</p>';
        }
    };
    
    // Botones del modal de resumen
    if (btnCerrarResumen) {
        btnCerrarResumen.addEventListener('click', () => {
            resumenModal.classList.remove('visible');
            clearCart(); // Vaciamos carrito al terminar exitosamente
            window.location.href = 'historial.html';
        });
    }

    if (btnCopiarResumen) {
        btnCopiarResumen.addEventListener('click', () => {
            if (resumenTexto) {
                navigator.clipboard.writeText(resumenTexto.innerText).then(() => {
                    if(feedbackCopiado) {
                        feedbackCopiado.textContent = '¡Copiado!';
                        setTimeout(() => { feedbackCopiado.textContent = ''; }, 2000);
                    }
                }).catch(err => console.error('Error al copiar: ', err));
            }
        });
    }

    loadInitialData();
}
