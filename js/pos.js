import { 
    getFirestore, collection, onSnapshot, query, where, doc, 
    addDoc, updateDoc, Timestamp, runTransaction, getDocs, setDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

export function setupPOS(app) {
    const db = getFirestore(app);
    const auth = getAuth(app);
    
    const cajasCollection = collection(db, 'cajas');
    const ventasCollection = collection(db, 'ventasMostrador');
    const recetasCollection = collection(db, 'recetas'); 
    const materiasPrimasCollection = collection(db, 'materiasPrimas'); 
    const auditoriaCollection = collection(db, 'auditoriaMostrador');

    // ==========================================
    // REFERENCIAS DOM
    // ==========================================
    const pantallaApertura = document.getElementById('pantalla-apertura');
    const pantallaPOS = document.getElementById('pantalla-pos');
    const pantallaStock = document.getElementById('pantalla-stock-mostrador');
    const pantallaPromociones = document.getElementById('pantalla-promociones');
    
    const aperturaNombreCajero = document.getElementById('apertura-nombre-cajero');
    const aperturaTurnoSelect = document.getElementById('apertura-turno-select');
    const panelHerencia = document.getElementById('panel-herencia-saldo');
    const saldoAnteriorDetectado = document.getElementById('saldo-anterior-detectado');
    const fondoCajaInput = document.getElementById('fondo-caja-input');
    const btnAbrirCaja = document.getElementById('btn-abrir-caja');
    const radiosRetiro = document.querySelectorAll('input[name="retiro_dinero"]');
    
    const btnIniciarCierre = document.getElementById('btn-iniciar-cierre');
    const gridProductos = document.getElementById('grid-productos-pos'); // Nuevo Grid Táctil
    const buscadorPOS = document.getElementById('buscador-pos');
    const carritoContainer = document.getElementById('carrito-pos-container');
    const posTotalMonto = document.getElementById('pos-total-monto');
    const btnCobrar = document.getElementById('btn-cobrar');

    const modalCobro = document.getElementById('modal-cobro');
    const modalCobroTotal = document.getElementById('modal-cobro-total');
    const btnPaymentMethods = document.querySelectorAll('.btn-payment');
    const btnCancelarCobro = document.getElementById('btn-cancelar-cobro');
    const btnConfirmarVenta = document.getElementById('btn-confirmar-venta');
    
    const paymentDetailsContainer = document.getElementById('payment-details-container');
    const fieldMP = document.getElementById('field-mp');
    const fieldEfectivo = document.getElementById('field-efectivo');
    const inputCobroMP = document.getElementById('input-cobro-mp');
    const inputCobroEfectivo = document.getElementById('input-cobro-efectivo');
    const vueltoContainer = document.getElementById('vuelto-container');
    const modalVueltoTotal = document.getElementById('modal-vuelto-total');
    const btnsQuickMoney = document.querySelectorAll('.btn-quick-money'); // Billetera rápida
    
    const modalCierre = document.getElementById('modal-cierre');
    const cierreNombreCajero = document.getElementById('cierre-nombre-cajero');
    const cierreCiegoInput = document.getElementById('cierre-ciego-input');
    const cierreFondo = document.getElementById('cierre-fondo');
    const cierreEfectivo = document.getElementById('cierre-efectivo');
    const cierreMP = document.getElementById('cierre-mp');
    const cierreTotalCaja = document.getElementById('cierre-total-caja');
    const btnCancelarCierre = document.getElementById('btn-cancelar-cierre');
    const btnConfirmarCierre = document.getElementById('btn-confirmar-cierre');
    const btnRevisarTickets = document.getElementById('btn-revisar-tickets');

    const modalRevision = document.getElementById('modal-revision-tickets');
    const listaTicketsRevision = document.getElementById('lista-tickets-revision');
    const btnCerrarRevision = document.getElementById('btn-cerrar-revision');
    const modalEditarTicket = document.getElementById('modal-editar-ticket');
    const editarTicketMontoLabel = document.getElementById('editar-ticket-monto-label');
    const editTicketId = document.getElementById('edit-ticket-id');
    const editTicketMetodo = document.getElementById('edit-ticket-metodo');
    const btnCancelarEditTicket = document.getElementById('btn-cancelar-edit-ticket');
    const btnGuardarEditTicket = document.getElementById('btn-guardar-edit-ticket');

    const btnIrStock = document.getElementById('btn-ir-stock');
    const btnVolverMostrador = document.getElementById('btn-volver-mostrador');
    const buscadorInventario = document.getElementById('buscador-inventario');
    const tablaInventario = document.getElementById('tabla-inventario-mostrador');
    const btnDesbloquearAdmin = document.getElementById('btn-desbloquear-admin');
    const btnMargenGlobal = document.getElementById('btn-margen-global');

    const btnIrPromos = document.getElementById('btn-ir-promos');
    const btnVolverMostradorPromos = document.getElementById('btn-volver-mostrador-promos');
    const selectPromoProd = document.getElementById('promo-producto-select');
    const inputPromoTipo = document.getElementById('promo-tipo');
    const inputPromoFrase = document.getElementById('promo-frase');
    const btnDescargarPromo = document.getElementById('btn-descargar-promo');

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

    // ==========================================
    // VARIABLES DE ESTADO
    // ==========================================
    let currentUser = null;
    let userRol = 'empleado';
    let userName = "Usuario Mostrador";
    let cajaActiva = null; 
    let datosCargados = false; 
    let materiasPrimasMap = new Map(); 
    let recetasBrutas = []; 
    let productosDisponibles = []; 
    let carritoActual = [];
    let metodoPagoSeleccionado = null;
    let margenGlobal = 0; 
    let currentBarcodeProduct = null;
    let totalVentaActual = 0;
    let saldoTurnoAnteriorDetectado = 0; 

    // Funciones Helper
    const formatMoneda = (val) => `$${(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatFecha = (timestamp) => {
        if (!timestamp || !timestamp.toDate) return '';
        const d = timestamp.toDate();
        return d.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
    };
    const dateToYMD = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    // ==========================================
    // CÁLCULO DE COSTOS
    // ==========================================
    const obtenerCostoBase = (receta) => {
        if (receta.costoPorcion && receta.costoPorcion > 0) return receta.costoPorcion;
        let costoTotal = 0;
        if (!receta.ingredientes) return 0;
        receta.ingredientes.forEach(ing => {
            const mp = materiasPrimasMap.get(ing.idMateriaPrima);
            if (mp && mp.lotes && mp.lotes.length > 0) {
                const ultimoLote = [...mp.lotes].sort((a, b) => b.fechaCompra.seconds - a.fechaCompra.seconds)[0];
                costoTotal += (ultimoLote.costoUnitario || 0) * ing.cantidad;
            }
        });
        return receta.rendimiento > 0 ? costoTotal / receta.rendimiento : costoTotal;
    };

    const calcularPrecioVenta = (prod) => {
        const costo = prod.costoBaseCalculado || 0;
        const tieneMargenIndiv = prod.margenIndividual !== undefined && prod.margenIndividual !== null && prod.margenIndividual !== '';
        const margenAplicado = tieneMargenIndiv ? parseFloat(prod.margenIndividual) : margenGlobal;
        const precioCrudo = costo * (1 + (margenAplicado / 100));
        return Math.round(precioCrudo / 10) * 10;
    };

    // ==========================================
    // AUTENTICACIÓN Y SEGURIDAD (ROLES)
    // ==========================================
    onAuthStateChanged(auth, user => {
        if (!user || user.isAnonymous) {
            window.location.href = 'login.html';
            return;
        }

        currentUser = user;
        userName = localStorage.getItem('userName') || user.email.split('@')[0];
        userRol = localStorage.getItem('userRol') || 'empleado';

        if (userRol === 'master') {
            document.body.classList.remove('rol-empleado');
            document.body.classList.add('rol-master');
        } else {
            document.body.classList.add('rol-empleado');
            document.body.classList.remove('rol-master');
        }

        verificarCajaAbierta();
    });

    onSnapshot(doc(db, 'config', 'mostrador'), (docSnap) => {
        if (docSnap.exists()) {
            margenGlobal = docSnap.data().margenGlobal || 0;
        } else {
            setDoc(doc(db, 'config', 'mostrador'), { margenGlobal: 0 });
        }
        procesarYRenderizar();
    });

    if (btnDesbloquearAdmin) {
        btnDesbloquearAdmin.addEventListener('click', () => {
            if (document.body.classList.contains('admin-open')) {
                document.body.classList.remove('admin-open');
                btnDesbloquearAdmin.textContent = "🔑 Modo Admin";
                procesarYRenderizar();
                return;
            }
            const pass = prompt("Ingrese la contraseña de Administrador:");
            if (pass === "Lautaro2026") {
                document.body.classList.add('admin-open');
                btnDesbloquearAdmin.textContent = "🔒 Cerrar Admin";
                procesarYRenderizar();
            } else if (pass !== null) alert("Contraseña incorrecta de acceso.");
        });
    }

    if (btnMargenGlobal) {
        btnMargenGlobal.addEventListener('click', async () => {
            const nuevoMargen = prompt("Defina el nuevo porcentaje de Margen de Ganancia Global (%):", margenGlobal);
            if (nuevoMargen !== null && nuevoMargen.trim() !== "") {
                const margenNum = parseFloat(nuevoMargen);
                if (isNaN(margenNum) || margenNum < 0) return alert("Ingrese un porcentaje numérico válido.");
                try { await setDoc(doc(db, 'config', 'mostrador'), { margenGlobal: margenNum }); } catch (e) {}
            }
        });
    }

    // ==========================================
    // APERTURA DE CAJA
    // ==========================================
    const verificarCajaAbierta = () => {
        const q = query(cajasCollection, where('estado', '==', 'abierta'));
        onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const cajaDoc = snapshot.docs[0];
                cajaActiva = { id: cajaDoc.id, ...cajaDoc.data() };
                if (pantallaApertura) pantallaApertura.style.display = 'none';
                
                if (pantallaStock && pantallaStock.style.display === 'block' || (pantallaPromociones && pantallaPromociones.style.display === 'block')) {
                    if (pantallaPOS) pantallaPOS.style.display = 'none';
                } else {
                    if (pantallaPOS) pantallaPOS.style.display = 'grid';
                    if (pantallaStock) pantallaStock.style.display = 'none';
                    if (pantallaPromociones) pantallaPromociones.style.display = 'none';
                }
                
                if (!datosCargados) {
                    cargarDataYCostos();
                    datosCargados = true;
                }
            } else {
                cajaActiva = null;
                datosCargados = false;
                if (pantallaPOS) pantallaPOS.style.display = 'none';
                if (pantallaStock) pantallaStock.style.display = 'none';
                if (pantallaPromociones) pantallaPromociones.style.display = 'none';
                if (pantallaApertura) pantallaApertura.style.display = 'block';
                buscarSaldoTurnoAnterior(); 
            }
        });
    };

    const buscarSaldoTurnoAnterior = async () => {
        try {
            const qLast = query(cajasCollection, orderBy('fechaApertura', 'desc'), limit(1));
            const querySnap = await getDocs(qLast);
            if (!querySnap.empty) {
                const ultimaCaja = querySnap.docs[0].data();
                if (ultimaCaja.estado === 'cerrada') {
                    saldoTurnoAnteriorDetectado = (ultimaCaja.fondoInicial || 0) + (ultimaCaja.totalEfectivo || 0);
                } else {
                    saldoTurnoAnteriorDetectado = 0;
                }
            }
        } catch (err) { console.error("Error buscando saldo anterior", err); }
    };

    const actualizarEstadoFondoInput = () => {
        const retiroPlata = document.querySelector('input[name="retiro_dinero"]:checked')?.value;
        if (aperturaTurnoSelect.value === 'Tarde' && saldoTurnoAnteriorDetectado > 0 && retiroPlata === 'no') {
            fondoCajaInput.value = saldoTurnoAnteriorDetectado;
            fondoCajaInput.disabled = true;
            fondoCajaInput.style.backgroundColor = '#f1f5f9';
        } else {
            fondoCajaInput.disabled = false;
            fondoCajaInput.style.backgroundColor = '#ffffff';
            if (fondoCajaInput.value == saldoTurnoAnteriorDetectado) {
                fondoCajaInput.value = '';
            }
        }
    };

    if (radiosRetiro.length > 0) {
        radiosRetiro.forEach(radio => radio.addEventListener('change', actualizarEstadoFondoInput));
    }

    if (aperturaTurnoSelect) {
        aperturaTurnoSelect.addEventListener('change', () => {
            if (aperturaTurnoSelect.value === 'Tarde' && saldoTurnoAnteriorDetectado > 0) {
                panelHerencia.style.display = 'block';
                saldoAnteriorDetectado.textContent = formatMoneda(saldoTurnoAnteriorDetectado);
            } else {
                panelHerencia.style.display = 'none';
            }
            actualizarEstadoFondoInput();
        });
    }

    if (btnAbrirCaja) {
        btnAbrirCaja.addEventListener('click', async () => {
            const nombreIngresado = aperturaNombreCajero.value;
            if (!nombreIngresado) {
                alert("Por favor, seleccione quién abre la caja.");
                return;
            }

            const turno = aperturaTurnoSelect.value;
            let fondoTipeado = parseFloat(fondoCajaInput.value) || 0;
            
            let retiroPlata = document.querySelector('input[name="retiro_dinero"]:checked')?.value || 'si';
            if (turno === 'Tarde' && retiroPlata === 'no' && panelHerencia.style.display === 'block') {
                fondoTipeado = saldoTurnoAnteriorDetectado;
            }

            try {
                btnAbrirCaja.disabled = true;
                await addDoc(cajasCollection, {
                    usuarioId: currentUser.uid,
                    usuarioNombre: nombreIngresado,
                    turno: turno,
                    fechaApertura: Timestamp.now(),
                    fondoInicial: fondoTipeado,
                    totalEfectivo: 0,
                    totalMercadoPago: 0,
                    estado: 'abierta'
                });
                
                if (fondoCajaInput) {
                    fondoCajaInput.value = '';
                    fondoCajaInput.disabled = false;
                    fondoCajaInput.style.backgroundColor = '#ffffff';
                }
                if (aperturaNombreCajero) aperturaNombreCajero.value = '';
                btnAbrirCaja.disabled = false;
            } catch (e) {
                console.error("Error al abrir caja:", e);
                btnAbrirCaja.disabled = false;
            }
        });
    }

    // NAVEGACIÓN ENTRE PANTALLAS ADMIN
    if (btnIrStock) {
        btnIrStock.addEventListener('click', () => {
            pantallaPOS.style.display = 'none';
            if (pantallaPromociones) pantallaPromociones.style.display = 'none';
            pantallaStock.style.display = 'block';
            procesarYRenderizar();
        });
    }

    if (btnIrPromos) {
        btnIrPromos.addEventListener('click', () => {
            pantallaPOS.style.display = 'none';
            pantallaStock.style.display = 'none';
            if (pantallaPromociones) {
                pantallaPromociones.style.display = 'block';
                if (selectPromoProd) {
                    selectPromoProd.innerHTML = productosDisponibles.map(p => `<option value="${p.nombreTorta}">${p.nombreTorta}</option>`).join('');
                }
            }
        });
    }

    if (btnVolverMostrador) {
        btnVolverMostrador.addEventListener('click', () => {
            pantallaStock.style.display = 'none';
            if (pantallaPromociones) pantallaPromociones.style.display = 'none';
            pantallaPOS.style.display = 'grid';
            procesarYRenderizar();
            if (buscadorPOS) buscadorPOS.focus();
        });
    }

    if (btnVolverMostradorPromos) {
        btnVolverMostradorPromos.addEventListener('click', () => {
            if (pantallaPromociones) pantallaPromociones.style.display = 'none';
            pantallaPOS.style.display = 'grid';
            if (buscadorPOS) buscadorPOS.focus();
        });
    }

    // ==========================================
    // CARGA Y RENDERIZADO
    // ==========================================
    const cargarDataYCostos = () => {
        onSnapshot(materiasPrimasCollection, (snapshot) => {
            materiasPrimasMap.clear();
            snapshot.forEach(doc => materiasPrimasMap.set(doc.id, doc.data()));
            procesarYRenderizar();
        });

        onSnapshot(recetasCollection, (snapshot) => {
            let tempArr = [];
            snapshot.forEach(doc => tempArr.push({ id: doc.id, ...doc.data() }));
            tempArr.sort((a,b) => (a.nombreTorta || "").localeCompare(b.nombreTorta || ""));
            recetasBrutas = tempArr;
            procesarYRenderizar();
        });
    };

    const procesarYRenderizar = () => {
        if (recetasBrutas.length === 0) return;

        productosDisponibles = recetasBrutas.map(receta => {
            const costoBase = obtenerCostoBase(receta);
            return { ...receta, costoBaseCalculado: costoBase, precioCalculado: calcularPrecioVenta({ ...receta, costoBaseCalculado: costoBase }) };
        });

        if (pantallaPOS && pantallaPOS.style.display !== 'none') {
            renderizarGridPOS(productosDisponibles);
        } 
        if (pantallaStock && pantallaStock.style.display !== 'none') {
            renderizarInventario(productosDisponibles);
        }
    };

    // ==========================================
    // RENDER POS TÁCTIL
    // ==========================================
    const renderizarGridPOS = (productos) => {
        if (!gridProductos) return;
        gridProductos.innerHTML = '';
        
        productos.forEach(prod => {
            const stock = prod.stockMostrador || 0;
            const precioCalculado = prod.precioCalculado;
            
            const card = document.createElement('div');
            card.className = `producto-card ${stock <= 0 ? 'sin-stock' : ''}`;
            card.dataset.id = prod.id;
            
            card.innerHTML = `
                <div class="prod-nombre">${prod.nombreTorta}</div>
                <div>
                    <div class="prod-precio">${formatMoneda(precioCalculado)}</div>
                    <div class="prod-stock">${stock} disp.</div>
                </div>
            `;
            gridProductos.appendChild(card);
        });
    };

    const agregarProductoAlCarrito = (prod, cantidadIngresada = 1) => {
        const stockMax = prod.stockMostrador || 0;
        if (cantidadIngresada > stockMax) {
            alert(`Solo hay ${stockMax} unidades en stock de ${prod.nombreTorta}.`);
            return;
        }

        const existe = carritoActual.find(i => i.id === prod.id);
        if (existe) {
            if (existe.cantidad + cantidadIngresada > stockMax) {
                alert(`Superas el stock físico disponible (${stockMax}) de ${prod.nombreTorta}.`);
                return;
            }
            existe.cantidad += cantidadIngresada;
        } else {
            carritoActual.push({ 
                id: prod.id, 
                nombre: prod.nombreTorta, 
                precio: prod.precioCalculado, 
                cantidad: cantidadIngresada 
            });
        }
        renderizarCarrito();
    };

    // Búsqueda
    if (buscadorPOS) {
        buscadorPOS.addEventListener('input', (e) => {
            const termino = e.target.value.toLowerCase();
            const filtrados = productosDisponibles.filter(p => 
                (p.nombreTorta && p.nombreTorta.toLowerCase().includes(termino)) ||
                (p.codigoBarras && String(p.codigoBarras).includes(termino))
            );
            renderizarGridPOS(filtrados);
        });

        buscadorPOS.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) e.preventDefault();
        });
    }

    // Escáner de Código de Barras Físico
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    document.addEventListener('keydown', (e) => {
        if (pantallaPOS && pantallaPOS.style.display === 'none') return;
        if (e.key.length > 1 && e.key !== 'Enter') return;

        const currentTime = Date.now();
        if (currentTime - lastKeyTime > 50) scanBuffer = '';
        lastKeyTime = currentTime;

        if (e.key === 'Enter' || e.keyCode === 13) {
            if (scanBuffer.length >= 8) { 
                e.preventDefault();
                const codigoEscaneado = scanBuffer.trim();
                const productoEncontrado = productosDisponibles.find(p => p.codigoBarras && String(p.codigoBarras) === codigoEscaneado);
                
                if (productoEncontrado) {
                    agregarProductoAlCarrito(productoEncontrado, 1);
                } else {
                    alert("El código escaneado (" + codigoEscaneado + ") no existe en el sistema.");
                }
                scanBuffer = '';
                if (buscadorPOS) buscadorPOS.value = '';
                renderizarGridPOS(productosDisponibles); 
            }
        } else {
            scanBuffer += e.key;
        }
    });

    // Clic en Tarjeta (Touch POS)
    if (gridProductos) {
        gridProductos.addEventListener('click', (e) => {
            const card = e.target.closest('.producto-card');
            if (!card || card.classList.contains('sin-stock')) return;
            
            const prod = productosDisponibles.find(p => p.id === card.dataset.id);
            if (prod) {
                agregarProductoAlCarrito(prod, 1);
            }
        });
    }

    // Renderizar Carrito y controles +/-
    const renderizarCarrito = () => {
        if (!carritoContainer) return;
        carritoContainer.innerHTML = '';
        if (carritoActual.length === 0) {
            carritoContainer.innerHTML = '<p class="text-light" style="text-align: center; margin-top: 2rem;">Tocá un producto para agregarlo.</p>';
            if (posTotalMonto) posTotalMonto.textContent = formatMoneda(0);
            if (btnCobrar) btnCobrar.disabled = true;
            return;
        }

        let total = 0;
        carritoActual.forEach((item, index) => {
            const subtotal = item.precio * item.cantidad;
            total += subtotal;

            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div class="cart-item-info">
                    <h4>${item.nombre}</h4>
                    <div class="cantidad-control">
                        <button class="btn-restar-cant" data-index="${index}" style="padding:0.2rem 0.5rem; border:1px solid #ccc; border-radius:4px; background:#f8fafc; cursor:pointer;">-</button>
                        <span style="font-weight:bold; min-width:20px; text-align:center;">${item.cantidad}</span>
                        <button class="btn-sumar-cant" data-index="${index}" style="padding:0.2rem 0.5rem; border:1px solid #ccc; border-radius:4px; background:#f8fafc; cursor:pointer;">+</button>
                        <span class="cart-item-precio-unit" style="margin-left:0.5rem;">x ${formatMoneda(item.precio)}</span>
                    </div>
                </div>
                <div class="cart-item-total">${formatMoneda(subtotal)}</div>
                <button class="btn-remove-cart" data-index="${index}" style="background:none; border:none; color:var(--danger-color); cursor:pointer; font-size:1.2rem;">🗑️</button>
            `;
            carritoContainer.appendChild(div);
        });

        if (posTotalMonto) posTotalMonto.textContent = formatMoneda(total);
        if (btnCobrar) btnCobrar.disabled = false;
    };

    if (carritoContainer) {
        carritoContainer.addEventListener('click', (e) => {
            const btnRemove = e.target.closest('.btn-remove-cart');
            const btnRestar = e.target.closest('.btn-restar-cant');
            const btnSumar = e.target.closest('.btn-sumar-cant');

            if (btnRemove) { 
                carritoActual.splice(btnRemove.dataset.index, 1); 
                renderizarCarrito(); 
            } else if (btnRestar) {
                const idx = btnRestar.dataset.index;
                if (carritoActual[idx].cantidad > 1) {
                    carritoActual[idx].cantidad--;
                } else {
                    carritoActual.splice(idx, 1);
                }
                renderizarCarrito();
            } else if (btnSumar) {
                const idx = btnSumar.dataset.index;
                const item = carritoActual[idx];
                const prod = productosDisponibles.find(p => p.id === item.id);
                if (prod && item.cantidad < (prod.stockMostrador || 0)) {
                    carritoActual[idx].cantidad++;
                } else {
                    alert("No hay más stock físico.");
                }
                renderizarCarrito();
            }
        });
    }

    // ==========================================
    // COBRO INTELIGENTE Y BILLETERA
    // ==========================================
    if (btnCobrar) {
        btnCobrar.addEventListener('click', () => {
            totalVentaActual = carritoActual.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
            if (modalCobroTotal) modalCobroTotal.textContent = formatMoneda(totalVentaActual);
            
            metodoPagoSeleccionado = null;
            btnPaymentMethods.forEach(b => b.classList.remove('selected'));
            btnConfirmarVenta.disabled = true;
            
            if (paymentDetailsContainer) paymentDetailsContainer.style.display = 'none';
            if (fieldMP) fieldMP.style.display = 'none';
            if (fieldEfectivo) fieldEfectivo.style.display = 'none';
            if (inputCobroMP) inputCobroMP.value = '';
            if (inputCobroEfectivo) inputCobroEfectivo.value = '';
            if (vueltoContainer) vueltoContainer.style.display = 'none';

            if (modalCobro) modalCobro.classList.add('visible');
        });
    }

    if (btnCancelarCobro) btnCancelarCobro.addEventListener('click', () => {
        if (modalCobro) modalCobro.classList.remove('visible')
    });

    btnPaymentMethods.forEach(btn => {
        btn.addEventListener('click', () => {
            btnPaymentMethods.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            metodoPagoSeleccionado = btn.dataset.metodo;
            
            if (paymentDetailsContainer) paymentDetailsContainer.style.display = 'block';

            if (metodoPagoSeleccionado === 'MercadoPago') {
                if(paymentDetailsContainer) paymentDetailsContainer.style.display = 'none';
            } else if (metodoPagoSeleccionado === 'Efectivo') {
                if(fieldMP) fieldMP.style.display = 'none';
                if(fieldEfectivo) fieldEfectivo.style.display = 'block';
            } else if (metodoPagoSeleccionado === 'Ambos') {
                if(fieldMP) fieldMP.style.display = 'block';
                if(fieldEfectivo) fieldEfectivo.style.display = 'block';
            }
            if(inputCobroMP) inputCobroMP.value = '';
            if(inputCobroEfectivo) inputCobroEfectivo.value = '';
            calcularVuelto();
        });
    });

    // Billetera Rápida
    btnsQuickMoney.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const val = btn.dataset.val;
            if (val === 'exacto') {
                if (metodoPagoSeleccionado === 'Ambos') {
                    const mp = parseFloat(inputCobroMP.value) || 0;
                    inputCobroEfectivo.value = totalVentaActual - mp;
                } else {
                    inputCobroEfectivo.value = totalVentaActual;
                }
            } else {
                inputCobroEfectivo.value = val;
            }
            calcularVuelto();
        });
    });

    const calcularVuelto = () => {
        if (!metodoPagoSeleccionado) return;
        let mp = parseFloat(inputCobroMP.value) || 0;
        let efvo = parseFloat(inputCobroEfectivo.value) || 0;
        let vuelto = 0; let esValido = false;

        if (metodoPagoSeleccionado === 'MercadoPago') {
            esValido = true;
        } else if (metodoPagoSeleccionado === 'Efectivo') {
            vuelto = efvo - totalVentaActual;
            esValido = efvo >= totalVentaActual;
        } else if (metodoPagoSeleccionado === 'Ambos') {
            vuelto = (mp + efvo) - totalVentaActual;
            esValido = (mp + efvo) >= totalVentaActual && mp <= totalVentaActual; 
        }

        if (metodoPagoSeleccionado !== 'MercadoPago') {
            if (vueltoContainer) vueltoContainer.style.display = 'block';
            if (esValido) {
                if (modalVueltoTotal) {
                    modalVueltoTotal.textContent = formatMoneda(vuelto);
                    modalVueltoTotal.style.color = 'var(--success-color)';
                }
            } else {
                if (modalVueltoTotal) {
                    modalVueltoTotal.textContent = "Monto insuficiente";
                    modalVueltoTotal.style.color = 'var(--danger-color)';
                }
            }
        } else {
            if (vueltoContainer) vueltoContainer.style.display = 'none';
        }
        btnConfirmarVenta.disabled = !esValido;
    };

    if (inputCobroMP) inputCobroMP.addEventListener('input', calcularVuelto);
    if (inputCobroEfectivo) inputCobroEfectivo.addEventListener('input', calcularVuelto);

    if (btnConfirmarVenta) {
        btnConfirmarVenta.addEventListener('click', async () => {
            if (!metodoPagoSeleccionado || carritoActual.length === 0 || !cajaActiva) return;

            let mpReal = 0; let efectivoReal = 0;
            if (metodoPagoSeleccionado === 'MercadoPago') { mpReal = totalVentaActual; } 
            else if (metodoPagoSeleccionado === 'Efectivo') { efectivoReal = totalVentaActual; } 
            else if (metodoPagoSeleccionado === 'Ambos') {
                let mpTipeado = parseFloat(inputCobroMP.value) || 0;
                mpReal = mpTipeado; efectivoReal = totalVentaActual - mpTipeado;
            }

            btnConfirmarVenta.disabled = true;
            btnConfirmarVenta.textContent = 'Procesando...';

            try {
                const itemsParaGuardar = carritoActual.map(i => {
                    return { id: i.id, nombre: i.nombre, precio: i.precio, cantidad: i.cantidad };
                });

                for (const item of carritoActual) {
                    const docRef = doc(db, 'recetas', item.id);
                    await runTransaction(db, async (transaction) => {
                        const sfDoc = await transaction.get(docRef);
                        if (!sfDoc.exists()) throw "El producto no existe.";
                        
                        let stockActual = sfDoc.data().stockMostrador || 0;
                        let lotesActuales = sfDoc.data().lotes || [];
                        let nuevoStock = stockActual - item.cantidad;
                        if (nuevoStock < 0) nuevoStock = 0;
                        
                        let qtyToDeduct = item.cantidad;
                        lotesActuales.sort((a, b) => new Date(a.fechaVto) - new Date(b.fechaVto));
                        
                        let nuevosLotesPostResta = [];
                        for (let lote of lotesActuales) {
                            if (qtyToDeduct > 0) {
                                if (lote.cantidad <= qtyToDeduct) { qtyToDeduct -= lote.cantidad; } 
                                else { lote.cantidad -= qtyToDeduct; qtyToDeduct = 0; nuevosLotesPostResta.push(lote); }
                            } else { nuevosLotesPostResta.push(lote); }
                        }
                        
                        transaction.update(docRef, { stockMostrador: nuevoStock, lotes: nuevosLotesPostResta });

                        const auditRef = doc(auditoriaCollection);
                        transaction.set(auditRef, {
                            productoId: item.id, productoNombre: item.nombre, tipo: 'RESTA', cantidad: item.cantidad,
                            stockResultante: nuevoStock, motivo: `Venta (${metodoPagoSeleccionado})`,
                            usuario: userName, usuarioId: currentUser.uid, fecha: Timestamp.now()
                        });
                    });
                }

                await addDoc(ventasCollection, {
                    cajaId: cajaActiva.id, fecha: Timestamp.now(), metodoPago: metodoPagoSeleccionado,
                    total: totalVentaActual, pagoEfectivo: efectivoReal, pagoMercadoPago: mpReal,
                    items: itemsParaGuardar, vendedor: cajaActiva.usuarioNombre || userName
                });

                cajaActiva.totalEfectivo = (cajaActiva.totalEfectivo || 0) + efectivoReal;
                cajaActiva.totalMercadoPago = (cajaActiva.totalMercadoPago || 0) + mpReal;
                await updateDoc(doc(db, 'cajas', cajaActiva.id), {
                    totalEfectivo: cajaActiva.totalEfectivo,
                    totalMercadoPago: cajaActiva.totalMercadoPago
                });

                carritoActual = []; renderizarCarrito();
                if (modalCobro) modalCobro.classList.remove('visible');
                btnConfirmarVenta.textContent = 'Confirmar Venta';
                if (buscadorPOS) buscadorPOS.focus();

            } catch (error) {
                console.error("Error al procesar la venta:", error);
                alert("Hubo un error de red al procesar el cobro.");
                btnConfirmarVenta.disabled = false; btnConfirmarVenta.textContent = 'Confirmar Venta';
            }
        });
    }

    // ==========================================
    // CIERRE CIEGO (EMPLEADOS) VS MASTER
    // ==========================================
    if (btnIniciarCierre) {
        btnIniciarCierre.addEventListener('click', () => {
            if (!cajaActiva) return;
            
            if (cierreNombreCajero) {
                cierreNombreCajero.value = cajaActiva.usuarioNombre === 'Ceci' || cajaActiva.usuarioNombre === 'Eve' ? cajaActiva.usuarioNombre : '';
            }

            if (userRol === 'master') {
                const fondo = cajaActiva.fondoInicial || 0;
                const efvo = cajaActiva.totalEfectivo || 0;
                const mp = cajaActiva.totalMercadoPago || 0;

                if (cierreFondo) cierreFondo.textContent = formatMoneda(fondo);
                if (cierreEfectivo) cierreEfectivo.textContent = formatMoneda(efvo);
                if (cierreMP) cierreMP.textContent = formatMoneda(mp);
                if (cierreTotalCaja) cierreTotalCaja.textContent = formatMoneda(fondo + efvo);
            } else {
                if (cierreCiegoInput) cierreCiegoInput.value = ''; // Limpiar el input para que cuente
            }

            if (modalCierre) modalCierre.classList.add('visible');
        });
    }

    if (btnCancelarCierre) btnCancelarCierre.addEventListener('click', () => {
        if (modalCierre) modalCierre.classList.remove('visible');
    });

    if (btnConfirmarCierre) {
        btnConfirmarCierre.addEventListener('click', async () => {
            if (!cajaActiva) return;
            const quienCierra = cierreNombreCajero.value;
            if (!quienCierra) {
                alert("Por favor, seleccione quién cierra la caja.");
                return;
            }

            let cierreData = {
                estado: 'cerrada',
                fechaCierre: Timestamp.now(),
                cerradaPor: quienCierra
            };

            // Lógica de Descuadre para Empleados
            if (userRol !== 'master') {
                let plataFisicaDeclarada = parseFloat(cierreCiegoInput.value);
                if (isNaN(plataFisicaDeclarada)) {
                    return alert("Por favor, ingresá la plata física total que contaste en el cajón.");
                }
                
                const cajaTeorica = (cajaActiva.fondoInicial || 0) + (cajaActiva.totalEfectivo || 0);
                cierreData.cierreCiegoEfectivo = plataFisicaDeclarada;
                cierreData.descuadre = plataFisicaDeclarada - cajaTeorica; // Negativo = Faltante
            }

            btnConfirmarCierre.disabled = true;
            btnConfirmarCierre.textContent = 'Cerrando...';

            try {
                await updateDoc(doc(db, 'cajas', cajaActiva.id), cierreData);
                
                if (modalCierre) modalCierre.classList.remove('visible');
                btnConfirmarCierre.disabled = false;
                btnConfirmarCierre.textContent = 'Confirmar Cierre';
            } catch (error) {
                console.error("Error cerrando caja de forma definitiva:", error);
                alert("No se pudo efectuar el cierre.");
                btnConfirmarCierre.disabled = false;
                btnConfirmarCierre.textContent = 'Confirmar Cierre';
            }
        });
    }

    // ==========================================
    // AUDITORÍA Y EDICIÓN DE TICKETS (ADMIN)
    // ==========================================
    if (btnRevisarTickets) {
        btnRevisarTickets.addEventListener('click', async () => {
            if (!cajaActiva) return;
            modalRevision.classList.add('visible');
            listaTicketsRevision.innerHTML = '<p class="text-light" style="text-align: center; padding: 2rem;">Buscando tickets...</p>';
            
            try {
                const qVentas = query(ventasCollection, where('cajaId', '==', cajaActiva.id));
                const snap = await getDocs(qVentas);
                if (snap.empty) {
                    listaTicketsRevision.innerHTML = '<p class="text-light" style="text-align: center; padding: 2rem;">No hay ventas registradas en este turno.</p>';
                    return;
                }

                let ventasArr = [];
                snap.forEach(d => ventasArr.push({ id: d.id, ...d.data() }));
                ventasArr.sort((a, b) => b.fecha.seconds - a.fecha.seconds);

                listaTicketsRevision.innerHTML = '';
                ventasArr.forEach(venta => {
                    let descItems = venta.items.map(i => `${i.cantidad}x ${i.nombre}`).join(', ');
                    let badgeClase = venta.metodoPago === 'MercadoPago' ? 'tag-mp' : 'tag-efectivo';
                    
                    const div = document.createElement('div');
                    div.className = 'ticket-revision-item';
                    div.innerHTML = `
                        <div class="ticket-revision-info">
                            <div style="display:flex; justify-content:space-between;">
                                <span style="font-size: 0.85rem; color:#64748b;">${formatFecha(venta.fecha)}</span>
                                <span class="ticket-tag-metodo ${badgeClase}">${venta.metodoPago}</span>
                            </div>
                            <p style="margin: 0.2rem 0; font-size: 0.9rem;">${descItems}</p>
                            <span style="font-weight: bold; color: #be185d;">${formatMoneda(venta.total)}</span>
                        </div>
                        <button class="btn-editar-ticket-auditoria" data-id="${venta.id}" data-total="${venta.total}" data-metodo="${venta.metodoPago}" style="background:none; border:none; cursor:pointer; font-size: 1.2rem; margin-left:1rem;" title="Editar Método de Pago">✏️</button>
                    `;
                    listaTicketsRevision.appendChild(div);
                });

            } catch (err) {
                console.error("Error al cargar tickets", err);
                listaTicketsRevision.innerHTML = '<p class="text-light" style="color:red; text-align:center;">Error al cargar tickets.</p>';
            }
        });
    }

    if (btnCerrarRevision) {
        btnCerrarRevision.addEventListener('click', () => {
            modalRevision.classList.remove('visible');
            if (cierreEfectivo) cierreEfectivo.textContent = formatMoneda(cajaActiva.totalEfectivo || 0);
            if (cierreMP) cierreMP.textContent = formatMoneda(cajaActiva.totalMercadoPago || 0);
            if (cierreTotalCaja) cierreTotalCaja.textContent = formatMoneda((cajaActiva.fondoInicial || 0) + (cajaActiva.totalEfectivo || 0));
        });
    }

    if (listaTicketsRevision) {
        listaTicketsRevision.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-editar-ticket-auditoria');
            if (!btn) return;
            
            const pass = prompt("Acción protegida. Ingrese clave de administrador:");
            if (pass !== "Lautaro2026") {
                alert("Clave incorrecta. No podés editar el ticket.");
                return;
            }

            editTicketId.value = btn.dataset.id;
            editarTicketMontoLabel.textContent = formatMoneda(parseFloat(btn.dataset.total));
            editTicketMetodo.value = btn.dataset.metodo === 'Ambos' ? 'Efectivo' : btn.dataset.metodo;
            
            modalEditarTicket.classList.add('visible');
        });
    }

    if (btnCancelarEditTicket) {
        btnCancelarEditTicket.addEventListener('click', () => modalEditarTicket.classList.remove('visible'));
    }

    if (btnGuardarEditTicket) {
        btnGuardarEditTicket.addEventListener('click', async () => {
            const ticketId = editTicketId.value;
            const nuevoMetodo = editTicketMetodo.value;
            
            btnGuardarEditTicket.disabled = true;
            btnGuardarEditTicket.textContent = 'Guardando...';

            try {
                await runTransaction(db, async (transaction) => {
                    const ticketRef = doc(db, 'ventasMostrador', ticketId);
                    const ticketDoc = await transaction.get(ticketRef);
                    if (!ticketDoc.exists()) throw "Ticket no encontrado";
                    
                    const tData = ticketDoc.data();
                    if (tData.metodoPago === nuevoMetodo) throw "El método es el mismo, no hay cambios.";
                    if (tData.metodoPago === 'Ambos') throw "No se puede editar un ticket con pago mixto (Ambos). Anúlalo manualmente.";

                    const monto = tData.total;
                    let difEfectivo = 0; let difMP = 0;

                    if (nuevoMetodo === 'Efectivo' && tData.metodoPago === 'MercadoPago') {
                        difEfectivo = monto; difMP = -monto;
                    } else if (nuevoMetodo === 'MercadoPago' && tData.metodoPago === 'Efectivo') {
                        difEfectivo = -monto; difMP = monto;
                    }

                    transaction.update(ticketRef, { 
                        metodoPago: nuevoMetodo, 
                        pagoEfectivo: nuevoMetodo === 'Efectivo' ? monto : 0,
                        pagoMercadoPago: nuevoMetodo === 'MercadoPago' ? monto : 0
                    });

                    const cajaRef = doc(db, 'cajas', cajaActiva.id);
                    const nuevaCajaEfvo = (cajaActiva.totalEfectivo || 0) + difEfectivo;
                    const nuevaCajaMP = (cajaActiva.totalMercadoPago || 0) + difMP;
                    
                    transaction.update(cajaRef, {
                        totalEfectivo: nuevaCajaEfvo,
                        totalMercadoPago: nuevaCajaMP
                    });

                    cajaActiva.totalEfectivo = nuevaCajaEfvo;
                    cajaActiva.totalMercadoPago = nuevaCajaMP;
                });

                alert("Ticket corregido con éxito.");
                modalEditarTicket.classList.remove('visible');
                btnRevisarTickets.click();

            } catch (err) {
                console.error("Error editando ticket", err);
                alert(err);
            }

            btnGuardarEditTicket.disabled = false;
            btnGuardarEditTicket.textContent = 'Guardar Arreglo';
        });
    }

    // ==========================================
    // ADMINISTRACIÓN DE STOCK Y LOTES
    // ==========================================
    const renderizarInventario = (productos) => {
        if (!tablaInventario) return;
        tablaInventario.innerHTML = '';
        if (productos.length === 0) {
            tablaInventario.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem;">No hay recetas dadas de alta en el sistema.</td></tr>';
            return;
        }

        productos.forEach(prod => {
            const costo = prod.costoBaseCalculado || 0;
            const stock = prod.stockMostrador || 0;
            const tieneMargenIndiv = prod.margenIndividual !== undefined && prod.margenIndividual !== null && prod.margenIndividual !== '';
            const margenMostrado = tieneMargenIndiv ? parseFloat(prod.margenIndividual) : margenGlobal;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Categoría"><span class="categoria-tag">${prod.categoria || 'Sin Categoría'}</span></td>
                <td data-label="Producto"><strong>${prod.nombreTorta}</strong></td>
                <td data-label="Costo Base">${formatMoneda(costo)}</td>
                <td class="admin-only" data-label="% Ganancia">${margenMostrado}% <small style="color:var(--text-light);">${tieneMargenIndiv ? '(Indiv)' : '(Global)'}</small></td>
                <td data-label="Precio Venta" style="font-weight: bold; color: var(--primary-color);">${formatMoneda(prod.precioCalculado)}</td>
                <td data-label="Stock" style="text-align: center; color: ${stock > 0 ? 'var(--text-main)' : 'var(--danger-color)'}"><strong>${stock}</strong> u.</td>
                <td data-label="Acciones" style="text-align: center;">
                    <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
                        <button class="btn-primary btn-editar-prod" data-id="${prod.id}" style="padding: 0.3rem 0.6rem; width: auto; font-size: 0.85rem;">📝 Stock</button>
                        <button class="btn-secondary btn-ver-barcode" data-id="${prod.id}" style="padding: 0.3rem 0.6rem; width: auto; font-size: 0.85rem;">🖨️ Barras</button>
                        <button class="btn-secondary btn-editar-margen admin-only" data-id="${prod.id}" style="padding: 0.3rem 0.6rem; width: auto; font-size: 0.85rem; border-color: #6366f1; color: #6366f1;">⚙️ %</button>
                    </div>
                </td>
            `;
            tablaInventario.appendChild(tr);
        });
    };

    if (buscadorInventario) {
        buscadorInventario.addEventListener('input', (e) => {
            const termino = e.target.value.toLowerCase();
            renderizarInventario(productosDisponibles.filter(p => 
                (p.nombreTorta && p.nombreTorta.toLowerCase().includes(termino)) || 
                (p.categoria && p.categoria.toLowerCase().includes(termino))
            ));
        });
    }

    if (tablaInventario) {
        tablaInventario.addEventListener('click', async (e) => {
            const btnStock = e.target.closest('.btn-editar-prod');
            if (btnStock) {
                const prod = productosDisponibles.find(p => p.id === btnStock.dataset.id);
                if (prod) abrirModalStock(prod);
                return;
            }

            const btnBarcode = e.target.closest('.btn-ver-barcode');
            if (btnBarcode) {
                const prod = productosDisponibles.find(p => p.id === btnBarcode.dataset.id);
                if (prod) {
                    if (!prod.codigoBarras) {
                        let num12 = String(Date.now()).substring(0, 12); let sum = 0;
                        for(let i = 0; i < 12; i++) sum += parseInt(num12[i]) * (i % 2 === 1 ? 3 : 1);
                        const nuevoCodigo = num12 + String((10 - (sum % 10)) % 10); 
                        try { await updateDoc(doc(db, 'recetas', prod.id), { codigoBarras: nuevoCodigo }); prod.codigoBarras = nuevoCodigo; } catch(err) {}
                    }
                    abrirModalBarcode(prod);
                }
                return;
            }

            const btnMargen = e.target.closest('.btn-editar-margen');
            if (btnMargen) {
                const prod = productosDisponibles.find(p => p.id === btnMargen.dataset.id);
                if (prod) {
                    const actual = prod.margenIndividual !== undefined && prod.margenIndividual !== null ? prod.margenIndividual : '';
                    const nuevo = prompt(`Ingrese el % de ganancia para "${prod.nombreTorta}"\n(Deje vacío para usar el % Global):`, actual);
                    if (nuevo !== null) {
                        try {
                            const docRef = doc(db, 'recetas', prod.id);
                            if (nuevo.trim() === '') await updateDoc(docRef, { margenIndividual: null });
                            else {
                                const val = parseFloat(nuevo);
                                if (!isNaN(val) && val >= 0) await updateDoc(docRef, { margenIndividual: val });
                                else alert("Número inválido.");
                            }
                        } catch (err) { alert("Error al actualizar."); }
                    }
                }
            }
        });
    }

    if (modalProdTipoMov) {
        modalProdTipoMov.addEventListener('change', (e) => {
            if (loteFieldsContainer) loteFieldsContainer.style.display = e.target.value === 'SUMAR' ? 'flex' : 'none';
        });
    }

    const abrirModalStock = async (prod) => {
        if (modalProdId) modalProdId.value = prod.id;
        if (modalProdNombre) modalProdNombre.value = prod.nombreTorta;
        if (modalProdGananciaIndiv) modalProdGananciaIndiv.value = prod.margenIndividual !== undefined && prod.margenIndividual !== null ? prod.margenIndividual : '';
        if (modalProdStockActual) modalProdStockActual.textContent = prod.stockMostrador || '0';
        
        if (modalProdTipoMov) modalProdTipoMov.value = 'SUMAR';
        if (loteFieldsContainer) loteFieldsContainer.style.display = 'flex'; 
        if (modalProdCantMov) modalProdCantMov.value = '0';
        if (modalProdMotivo) modalProdMotivo.value = '';
        
        const hoy = new Date(); if (modalProdLoteElab) modalProdLoteElab.value = dateToYMD(hoy);
        const vto = new Date(); vto.setDate(vto.getDate() + 15);
        if (modalProdLoteVto) modalProdLoteVto.value = dateToYMD(vto);

        if (modalProdAuditoria) modalProdAuditoria.innerHTML = '<p class="text-light" style="text-align:center;">Cargando historial...</p>';
        await cargarAuditoriaProducto(prod.id);
        if (modalStock) modalStock.classList.add('visible');
    };

    const cargarAuditoriaProducto = async (productoId) => {
        try {
            const q = query(auditoriaCollection, where('productoId', '==', productoId));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                if (modalProdAuditoria) modalProdAuditoria.innerHTML = '<p class="text-light" style="font-size: 0.85rem; text-align: center;">Sin movimientos registrados.</p>';
                return;
            }

            let logs = [];
            querySnapshot.forEach(d => logs.push(d.data()));
            logs.sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0));

            if (modalProdAuditoria) modalProdAuditoria.innerHTML = '';
            logs.forEach(log => {
                const logDiv = document.createElement('div');
                logDiv.className = 'log-item';
                let tipoSpan = log.tipo === 'SUMA' ? `<span class="log-tipo-sumar">[+${log.cantidad}]</span>` : `<span class="log-tipo-restar">[-${log.cantidad}]</span>`;
                let infoLote = log.loteVto ? ` (Vto: ${log.loteVto})` : '';

                logDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.2rem;">
                        <span>${tipoSpan} ${log.motivo || 'Ajuste'}${infoLote}</span>
                        <span style="color: var(--text-light); font-size: 0.75rem;">${formatFecha(log.fecha)}</span>
                    </div>
                    <div style="color: var(--text-light); font-size: 0.75rem;">👤 ${log.usuario} | Stock resultante: ${log.stockResultante}</div>
                `;
                if (modalProdAuditoria) modalProdAuditoria.appendChild(logDiv);
            });
        } catch (error) {
            if (modalProdAuditoria) modalProdAuditoria.innerHTML = '<p class="text-light" style="text-align:center;">Error al cargar historial.</p>';
        }
    };

    if (btnCancelarStock) btnCancelarStock.addEventListener('click', () => modalStock.classList.remove('visible'));

    if (btnGuardarStock) {
        btnGuardarStock.addEventListener('click', async () => {
            const id = modalProdId ? modalProdId.value : null;
            const nombre = modalProdNombre ? modalProdNombre.value : 'Producto';
            const tipoMov = modalProdTipoMov ? modalProdTipoMov.value : 'SUMAR';
            const cantMov = modalProdCantMov ? parseInt(modalProdCantMov.value) : 0;
            const motivo = modalProdMotivo ? modalProdMotivo.value.trim() : '';

            if (!id || isNaN(cantMov) || cantMov <= 0) return alert("Ingrese una cantidad válida a mover.");

            btnGuardarStock.disabled = true; btnGuardarStock.textContent = 'Guardando...';

            try {
                const docRef = doc(db, 'recetas', id);
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(docRef);
                    if (!sfDoc.exists()) throw "Producto no existe";
                    
                    let stockActual = sfDoc.data().stockMostrador || 0;
                    let lotesActuales = sfDoc.data().lotes || [];
                    let nuevoStock = stockActual;

                    if (tipoMov === 'SUMAR') {
                        nuevoStock = stockActual + cantMov;
                        lotesActuales.push({
                            idLote: Date.now().toString(), cantidad: cantMov,
                            fechaElab: modalProdLoteElab ? modalProdLoteElab.value : null,
                            fechaVto: modalProdLoteVto ? modalProdLoteVto.value : null
                        });
                    } else {
                        nuevoStock = stockActual - cantMov;
                        if (nuevoStock < 0) nuevoStock = 0;
                        
                        let qtyToDeduct = cantMov;
                        lotesActuales.sort((a, b) => new Date(a.fechaVto) - new Date(b.fechaVto));
                        
                        let nuevosLotesPostResta = [];
                        for (let lote of lotesActuales) {
                            if (qtyToDeduct > 0) {
                                if (lote.cantidad <= qtyToDeduct) { qtyToDeduct -= lote.cantidad; } 
                                else { lote.cantidad -= qtyToDeduct; qtyToDeduct = 0; nuevosLotesPostResta.push(lote); }
                            } else { nuevosLotesPostResta.push(lote); }
                        }
                        lotesActuales = nuevosLotesPostResta;
                    }

                    const updates = { stockMostrador: nuevoStock, lotes: lotesActuales };
                    if (document.body.classList.contains('admin-open') && modalProdGananciaIndiv) {
                        const val = modalProdGananciaIndiv.value.trim();
                        updates.margenIndividual = val === "" ? null : parseFloat(val);
                    }

                    transaction.update(docRef, updates);

                    transaction.set(doc(auditoriaCollection), {
                        productoId: id, productoNombre: nombre, tipo: tipoMov, cantidad: cantMov, stockResultante: nuevoStock,
                        motivo: motivo || (tipoMov === 'SUMAR' ? 'Ingreso Producción' : 'Egreso/Descarte'),
                        usuario: userName, usuarioId: currentUser.uid, fecha: Timestamp.now()
                    });
                });
                
                if (modalStock) modalStock.classList.remove('visible');
            } catch (error) { alert("Hubo un error al guardar los cambios."); }

            btnGuardarStock.disabled = false; btnGuardarStock.textContent = 'Guardar Cambios';
        });
    }

    // ==========================================
    // ETIQUETAS Y BARCODE (JSBARCODE)
    // ==========================================
    const drawBarcodeCanvas = () => {
        if(!currentBarcodeProduct) return;
        const prod = currentBarcodeProduct;
        
        const canvasFinal = document.getElementById("barcode-canvas-descarga");
        canvasFinal.width = 400;
        canvasFinal.height = 240;
        const ctx = canvasFinal.getContext("2d");
        
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvasFinal.width, canvasFinal.height);
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        
        let fontSize = 28;
        ctx.font = `bold ${fontSize}px sans-serif`;
        while (ctx.measureText(prod.nombreTorta).width > 360 && fontSize > 14) {
            fontSize -= 2;
            ctx.font = `bold ${fontSize}px sans-serif`;
        }
        ctx.fillText(prod.nombreTorta, canvasFinal.width / 2, 45); 

        const tempCanvas = document.createElement("canvas");
        try {
            JsBarcode(tempCanvas, prod.codigoBarras, { format: "EAN13", lineColor: "#000", width: 3, height: 120, displayValue: true, fontSize: 24, margin: 10 });
        } catch(e) {
            JsBarcode(tempCanvas, prod.codigoBarras, { format: "CODE128", lineColor: "#000", width: 2.5, height: 120, displayValue: true, fontSize: 22, margin: 10 });
        }

        ctx.drawImage(tempCanvas, (canvasFinal.width - tempCanvas.width) / 2, 60);
    };

    const abrirModalBarcode = (prod) => {
        currentBarcodeProduct = prod;
        drawBarcodeCanvas();
        if (btnDescargarBarcode) btnDescargarBarcode.dataset.nombre = prod.nombreTorta;
        if (modalBarcode) modalBarcode.classList.add('visible');
    };

    if (btnCerrarBarcode) {
        btnCerrarBarcode.addEventListener('click', () => {
            if(modalBarcode) modalBarcode.classList.remove('visible');
        });
    }

    if (btnDescargarBarcode) {
        btnDescargarBarcode.addEventListener('click', () => {
            const canvas = document.getElementById("barcode-canvas-descarga");
            const link = document.createElement('a');
            link.download = `Etiqueta-${btnDescargarBarcode.dataset.nombre || 'etiqueta'}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    }

    if (btnDescargarPromo) {
        btnDescargarPromo.addEventListener('click', () => {
            const tipo = inputPromoTipo ? (inputPromoTipo.value || 'OFERTA') : 'OFERTA';
            const prod = selectPromoProd ? selectPromoProd.value : '';
            const frase = inputPromoFrase ? (inputPromoFrase.value || '') : '';
            
            const canvas = document.getElementById('promo-canvas-descarga');
            canvas.width = 400;  canvas.height = 240; 
            const ctx = canvas.getContext('2d');
            
            ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = "black"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
            ctx.textAlign = "center"; ctx.fillStyle = "black";
            
            ctx.font = "bold 60px sans-serif"; ctx.fillText(tipo.toUpperCase(), canvas.width / 2, 85);
            let fontSize = 36; ctx.font = `bold ${fontSize}px sans-serif`;
            while (ctx.measureText(prod).width > 380 && fontSize > 16) { fontSize -= 2; ctx.font = `bold ${fontSize}px sans-serif`; }
            ctx.fillText(prod, canvas.width / 2, 145);
            ctx.font = "bold 24px sans-serif"; ctx.fillText(frase, canvas.width / 2, 205);

            const link = document.createElement('a');
            link.download = `Promo-${tipo}-${prod.substring(0,10)}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    }
}
