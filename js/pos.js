import { 
    getFirestore, collection, onSnapshot, query, where, doc, 
    addDoc, updateDoc, Timestamp, runTransaction, getDocs, setDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { createAuthorization } from "./core/authorization.js";
import { formatCurrency as formatMoneda, formatTimestampDateTime } from "./core/format.js";
import { calculateRecipeUnitCost, calculateRoundedSalePrice } from "./core/pricing.js";
import { drawPromoLabel, downloadCanvasPng } from "./core/labels.js";
import { escapeHtml, escapeAttribute } from "./core/html.js";
import { setupManualHistory } from "./pos/manual-history.js";
import { setupPOSInventory } from "./pos/inventory.js";

export function setupPOS(app) {
    const db = getFirestore(app);
    const auth = getAuth(app);
    const authorization = createAuthorization(app);
    
    const cajasCollection = collection(db, 'cajas');
    const ventasCollection = collection(db, 'ventasMostrador');
    const recetasCollection = collection(db, 'recetas'); 
    const materiasPrimasCollection = collection(db, 'materiasPrimas'); 
    const auditoriaCollection = collection(db, 'auditoriaMostrador');

    // ==========================================
    // REFERENCIAS DOM PRINCIPALES
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
    const gridProductos = document.getElementById('grid-productos-pos');
    const buscadorPOS = document.getElementById('buscador-pos');
    const carritoContainer = document.getElementById('carrito-pos-container');
    const posTotalMonto = document.getElementById('pos-total-monto');
    const posCobrarMonto = document.getElementById('pos-cobrar-monto');
    const posCartCount = document.getElementById('pos-cart-count');
    const btnCobrar = document.getElementById('btn-cobrar');
    const btnVaciarCarrito = document.getElementById('btn-vaciar-carrito');
    const categoryFilters = document.getElementById('pos-category-filters');
    const favoritesSection = document.getElementById('pos-favorites-section');
    const favoritesStrip = document.getElementById('pos-favorites-strip');
    const posGridTitle = document.getElementById('pos-grid-title');
    const posGridCount = document.getElementById('pos-grid-count');
    const mobileCheckout = document.getElementById('pos-mobile-checkout');
    const mobileCount = document.getElementById('pos-mobile-count');
    const mobileTotal = document.getElementById('pos-mobile-total');
    const btnCobrarMobile = document.getElementById('btn-cobrar-mobile');
    const btnVerCarritoMobile = document.getElementById('btn-ver-carrito-mobile');

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
    const btnsQuickMoney = document.querySelectorAll('.btn-quick-money'); 
    
    const modalCierre = document.getElementById('modal-cierre');
    const cierreNombreCajero = document.getElementById('cierre-nombre-cajero');
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
    const btnDesbloquearAdmin = document.getElementById('btn-desbloquear-admin');
    const btnMargenGlobal = document.getElementById('btn-margen-global');

    const btnIrPromos = document.getElementById('btn-ir-promos');
    const btnVolverMostradorPromos = document.getElementById('btn-volver-mostrador-promos');
    const selectPromoProd = document.getElementById('promo-producto-select');
    const inputPromoTipo = document.getElementById('promo-tipo');
    const inputPromoFrase = document.getElementById('promo-frase');
    const btnDescargarPromo = document.getElementById('btn-descargar-promo');


    const pantallaCargaHistorica = document.getElementById('pantalla-carga-historica');

    // ==========================================
    // VARIABLES DE ESTADO GLOBALES
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
    let totalVentaActual = 0;
    let saldoTurnoAnteriorDetectado = 0;
    let categoriaPOSActiva = 'Todos';
    let terminoBusquedaPOS = '';
    let topSellingKeys = new Set();
    let topSellingLoaded = false;

    const manualHistory = setupManualHistory({
        db,
        cajasCollection,
        ventasCollection,
        getCurrentUser: () => currentUser,
        getUserName: () => userName
    });

    const inventory = setupPOSInventory({
        db,
        auditoriaCollection,
        getCurrentUser: () => currentUser,
        getUserName: () => userName,
        getGlobalMargin: () => margenGlobal
    });

    // Funciones Helper compartidas
    const formatFecha = (timestamp) => formatTimestampDateTime(timestamp, { shortYear: true });

    // ==========================================
    // CÁLCULO DE COSTOS
    // ==========================================
    const obtenerCostoBase = (receta) => {
        return calculateRecipeUnitCost(receta, materiasPrimasMap);
    };

    const obtenerPorcentajeGananciaAplicado = (prod) => {
        const tieneMargenIndiv = prod.margenIndividual !== undefined &&
            prod.margenIndividual !== null &&
            prod.margenIndividual !== '';

        return tieneMargenIndiv
            ? parseFloat(prod.margenIndividual) || 0
            : Number(margenGlobal) || 0;
    };

    const calcularPrecioVenta = (prod) => {
        const porcentajeAplicado = obtenerPorcentajeGananciaAplicado(prod);

        return calculateRoundedSalePrice(
            prod.costoBaseCalculado || 0,
            porcentajeAplicado,
            { roundTo: 100, midpointDown: true }
        );
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

    const usuarioPuedeAdministrar = authorization.canAdminister;

    if (btnDesbloquearAdmin) {
        btnDesbloquearAdmin.addEventListener('click', async () => {
            if (document.body.classList.contains('admin-open')) {
                document.body.classList.remove('admin-open');
                btnDesbloquearAdmin.textContent = "🔑 Modo Admin";
                procesarYRenderizar();
                return;
            }

            const autorizado = await usuarioPuedeAdministrar();
            if (!autorizado) {
                alert("Tu usuario no tiene permisos de administrador.");
                return;
            }

            document.body.classList.add('admin-open');
            btnDesbloquearAdmin.textContent = "🔒 Cerrar Admin";
            procesarYRenderizar();
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
                
                if (pantallaStock && pantallaStock.style.display === 'block' || 
                   (pantallaPromociones && pantallaPromociones.style.display === 'block') ||
                   (pantallaCargaHistorica && pantallaCargaHistorica.style.display === 'block')) {
                    if (pantallaPOS) pantallaPOS.style.display = 'none';
                } else {
                    if (pantallaPOS) pantallaPOS.style.display = 'grid';
                    if (pantallaStock) pantallaStock.style.display = 'none';
                    if (pantallaPromociones) pantallaPromociones.style.display = 'none';
                    if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'none';
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
                if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'none';
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
            if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'none';
            pantallaStock.style.display = 'block';
            procesarYRenderizar();
        });
    }

    if (btnIrPromos) {
        btnIrPromos.addEventListener('click', () => {
            pantallaPOS.style.display = 'none';
            pantallaStock.style.display = 'none';
            if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'none';
            if (pantallaPromociones) {
                pantallaPromociones.style.display = 'block';
                if (selectPromoProd) {
                    selectPromoProd.innerHTML = '';
                    productosDisponibles.forEach((product) => {
                        const option = document.createElement('option');
                        option.value = product.nombreTorta || '';
                        option.textContent = product.nombreTorta || '';
                        selectPromoProd.appendChild(option);
                    });
                }
            }
        });
    }

    if (btnVolverMostrador) {
        btnVolverMostrador.addEventListener('click', () => {
            pantallaStock.style.display = 'none';
            if (pantallaPromociones) pantallaPromociones.style.display = 'none';
            if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'none';
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

    const cargarMasVendidos = async () => {
        if (topSellingLoaded) return;
        topSellingLoaded = true;

        try {
            const ventasRecientes = await getDocs(
                query(ventasCollection, orderBy('fecha', 'desc'), limit(250))
            );
            const conteo = new Map();

            ventasRecientes.forEach(ventaDoc => {
                const venta = ventaDoc.data() || {};
                const items = Array.isArray(venta.items) ? venta.items : [];

                items.forEach(item => {
                    const key = item.id
                        ? `id:${item.id}`
                        : `name:${String(item.nombre || '').trim().toLowerCase()}`;
                    if (key === 'name:') return;
                    conteo.set(key, (conteo.get(key) || 0) + (Number(item.cantidad) || 1));
                });
            });

            topSellingKeys = new Set(
                [...conteo.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([key]) => key)
            );
        } catch (error) {
            console.warn('No se pudieron calcular los más vendidos:', error);
            topSellingKeys = new Set();
        }
    };

    const obtenerCategoriasPOS = () => {
        const categorias = new Set(
            productosDisponibles
                .map(prod => String(prod.categoria || 'Otros').trim())
                .filter(Boolean)
        );

        return ['Todos', ...[...categorias].sort((a, b) => a.localeCompare(b, 'es'))];
    };

    const renderizarFiltrosCategorias = () => {
        if (!categoryFilters) return;

        categoryFilters.innerHTML = obtenerCategoriasPOS().map(categoria => `
            <button
                type="button"
                class="ds-pos-category-chip ${categoria === categoriaPOSActiva ? 'is-active' : ''}"
                data-category="${escapeAttribute(categoria)}"
            >${escapeHtml(categoria)}</button>
        `).join('');
    };

    const productoCoincideBusqueda = (producto) => {
        if (!terminoBusquedaPOS) return true;
        const termino = terminoBusquedaPOS.toLowerCase();

        return (
            String(producto.nombreTorta || '').toLowerCase().includes(termino) ||
            String(producto.categoria || '').toLowerCase().includes(termino) ||
            String(producto.codigoBarras || '').toLowerCase().includes(termino)
        );
    };

    const aplicarFiltrosPOS = () => {
        const filtrados = productosDisponibles.filter(producto => {
            const categoriaProducto = String(producto.categoria || 'Otros').trim();
            const categoriaOk = categoriaPOSActiva === 'Todos' || categoriaProducto === categoriaPOSActiva;
            return categoriaOk && productoCoincideBusqueda(producto);
        });

        if (posGridTitle) {
            posGridTitle.textContent = categoriaPOSActiva === 'Todos'
                ? (terminoBusquedaPOS ? 'Resultados' : 'Todos los productos')
                : categoriaPOSActiva;
        }

        if (posGridCount) {
            posGridCount.textContent = `${filtrados.length} ${filtrados.length === 1 ? 'producto' : 'productos'}`;
        }

        renderizarGridPOS(filtrados);
        renderizarMasVendidos();
        renderizarFiltrosCategorias();
    };

    const renderizarMasVendidos = () => {
        if (!favoritesSection || !favoritesStrip) return;

        const favoritos = productosDisponibles.filter(producto => {
            const idKey = `id:${producto.id}`;
            const nameKey = `name:${String(producto.nombreTorta || '').trim().toLowerCase()}`;
            return topSellingKeys.has(idKey) || topSellingKeys.has(nameKey);
        }).slice(0, 8);

        favoritesSection.hidden = favoritos.length === 0;

        if (!favoritos.length) {
            favoritesStrip.innerHTML = '';
            return;
        }

        favoritesStrip.innerHTML = favoritos.map(producto => `
            <button type="button" class="ds-pos-favorite" data-id="${escapeAttribute(producto.id)}">
                <span>${escapeHtml(producto.nombreTorta || 'Producto')}</span>
                <strong>${formatMoneda(producto.precioCalculado || 0)}</strong>
            </button>
        `).join('');
    };

    // ==========================================
    // CARGA Y RENDERIZADO
    // ==========================================
    const cargarDataYCostos = () => {
        cargarMasVendidos().then(() => {
            if (productosDisponibles.length) aplicarFiltrosPOS();
        });

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
            const productoCalculado = { ...receta, costoBaseCalculado: costoBase };

            return {
                ...productoCalculado,
                porcentajeGananciaAplicado: obtenerPorcentajeGananciaAplicado(productoCalculado),
                precioCalculado: calcularPrecioVenta(productoCalculado)
            };
        });

        if (pantallaPOS && pantallaPOS.style.display !== 'none') {
            aplicarFiltrosPOS();
        } 
        inventory.setProducts(productosDisponibles);
        manualHistory.setProducts(productosDisponibles);
    };

    // ==========================================
    // RENDER POS TÁCTIL
    // ==========================================
    const renderizarGridPOS = (productos) => {
        if (!gridProductos) return;
        gridProductos.innerHTML = '';

        if (!productos.length) {
            gridProductos.innerHTML = `
                <div class="ds-pos-no-results">
                    <strong>No encontramos productos</strong>
                    <span>Probá otra búsqueda o categoría.</span>
                </div>
            `;
            return;
        }
        
        productos.forEach(prod => {
            const stock = Number(prod.stockMostrador) || 0;
            const precioCalculado = Number(prod.precioCalculado) || 0;
            const categoria = String(prod.categoria || 'Otros');
            
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'producto-card';
            card.dataset.id = prod.id;
            card.setAttribute('aria-label', `Agregar ${prod.nombreTorta || 'producto'} al carrito`);
            
            card.innerHTML = `
                <div class="ds-pos-product-top">
                    <span class="ds-pos-product-category">${escapeHtml(categoria)}</span>
                    <span class="ds-pos-add-indicator">+</span>
                </div>
                <div class="prod-nombre">${escapeHtml(prod.nombreTorta || 'Producto')}</div>
                <div class="ds-pos-product-bottom">
                    <div class="prod-precio">${formatMoneda(precioCalculado)}</div>
                    <div class="prod-stock ${stock <= 0 ? 'stock-informativo' : ''}">
                        ${stock > 0 ? `${stock} registradas` : 'Stock informativo'}
                    </div>
                </div>
            `;
            gridProductos.appendChild(card);
        });
    };

    const agregarProductoAlCarrito = (prod, cantidadIngresada = 1) => {
        const existe = carritoActual.find(i => i.id === prod.id);
        if (existe) {
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

        const card = gridProductos
            ? [...gridProductos.querySelectorAll('.producto-card')].find(el => el.dataset.id === prod.id)
            : null;
        if (card) {
            card.classList.remove('is-added');
            requestAnimationFrame(() => card.classList.add('is-added'));
            setTimeout(() => card.classList.remove('is-added'), 320);
        }
    };

    // Búsqueda
    if (buscadorPOS) {
        buscadorPOS.addEventListener('input', (e) => {
            terminoBusquedaPOS = String(e.target.value || '').trim().toLowerCase();
            aplicarFiltrosPOS();
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
                terminoBusquedaPOS = '';
                categoriaPOSActiva = 'Todos';
                aplicarFiltrosPOS(); 
            }
        } else {
            scanBuffer += e.key;
        }
    });

    if (categoryFilters) {
        categoryFilters.addEventListener('click', (e) => {
            const button = e.target.closest('[data-category]');
            if (!button) return;
            categoriaPOSActiva = button.dataset.category || 'Todos';
            aplicarFiltrosPOS();
        });
    }

    if (favoritesStrip) {
        favoritesStrip.addEventListener('click', (e) => {
            const button = e.target.closest('[data-id]');
            if (!button) return;
            const prod = productosDisponibles.find(p => p.id === button.dataset.id);
            if (prod) agregarProductoAlCarrito(prod, 1);
        });
    }

    // Clic en Tarjeta (Touch POS)
    if (gridProductos) {
        gridProductos.addEventListener('click', (e) => {
            const card = e.target.closest('.producto-card');
            if (!card) return;
            
            const prod = productosDisponibles.find(p => p.id === card.dataset.id);
            if (prod) {
                agregarProductoAlCarrito(prod, 1);
            }
        });
    }

    // Renderizar Carrito compacto y controles
    const renderizarCarrito = () => {
        if (!carritoContainer) return;
        carritoContainer.innerHTML = '';

        const cantidadItems = carritoActual.reduce((sum, item) => sum + (Number(item.cantidad) || 0), 0);
        const total = carritoActual.reduce(
            (sum, item) => sum + ((Number(item.precio) || 0) * (Number(item.cantidad) || 0)),
            0
        );

        if (posTotalMonto) posTotalMonto.textContent = formatMoneda(total);
        if (posCobrarMonto) posCobrarMonto.textContent = formatMoneda(total);
        if (posCartCount) posCartCount.textContent = String(cantidadItems);
        if (mobileCount) mobileCount.textContent = `${cantidadItems} ${cantidadItems === 1 ? 'producto' : 'productos'}`;
        if (mobileTotal) mobileTotal.textContent = formatMoneda(total);

        const vacio = carritoActual.length === 0;
        if (btnCobrar) btnCobrar.disabled = vacio;
        if (btnCobrarMobile) btnCobrarMobile.disabled = vacio;
        if (btnVaciarCarrito) btnVaciarCarrito.disabled = vacio;
        if (mobileCheckout) mobileCheckout.hidden = false;

        if (vacio) {
            carritoContainer.innerHTML = `
                <div class="ds-pos-empty-cart">
                    <span>🧁</span>
                    <strong>Venta vacía</strong>
                    <p>Tocá un producto para agregarlo.</p>
                </div>
            `;
            return;
        }

        carritoActual.forEach((item, index) => {
            const subtotal = Number(item.precio) * Number(item.cantidad);

            const div = document.createElement('div');
            div.className = 'cart-item ds-pos-cart-item';
            div.innerHTML = `
                <div class="cart-item-info ds-pos-cart-item-info">
                    <h4>${escapeHtml(item.nombre)}</h4>
                    <span class="ds-pos-unit-price">${formatMoneda(item.precio)} c/u</span>
                </div>

                <div class="ds-pos-qty-control">
                    <button class="btn-restar-cant" data-index="${index}" type="button" aria-label="Restar una unidad">−</button>
                    <input
                        class="ds-pos-qty-input"
                        data-index="${index}"
                        type="number"
                        min="1"
                        step="1"
                        value="${item.cantidad}"
                        aria-label="Cantidad de ${escapeAttribute(item.nombre)}"
                    >
                    <button class="btn-sumar-cant" data-index="${index}" type="button" aria-label="Sumar una unidad">+</button>
                </div>

                <div class="cart-item-total">${formatMoneda(subtotal)}</div>
                <button class="btn-remove-cart" data-index="${index}" type="button" aria-label="Quitar ${escapeAttribute(item.nombre)}">×</button>
            `;
            carritoContainer.appendChild(div);
        });
    };

    if (carritoContainer) {
        carritoContainer.addEventListener('click', (e) => {
            const btnRemove = e.target.closest('.btn-remove-cart');
            const btnRestar = e.target.closest('.btn-restar-cant');
            const btnSumar = e.target.closest('.btn-sumar-cant');

            if (btnRemove) { 
                carritoActual.splice(Number(btnRemove.dataset.index), 1); 
                renderizarCarrito(); 
            } else if (btnRestar) {
                const idx = Number(btnRestar.dataset.index);
                if (!carritoActual[idx]) return;
                if (carritoActual[idx].cantidad > 1) carritoActual[idx].cantidad--;
                else carritoActual.splice(idx, 1);
                renderizarCarrito();
            } else if (btnSumar) {
                const idx = Number(btnSumar.dataset.index);
                if (carritoActual[idx]) carritoActual[idx].cantidad++;
                renderizarCarrito();
            }
        });

        carritoContainer.addEventListener('change', (e) => {
            const input = e.target.closest('.ds-pos-qty-input');
            if (!input) return;
            const idx = Number(input.dataset.index);
            const cantidad = Math.max(1, Math.floor(Number(input.value) || 1));
            if (carritoActual[idx]) {
                carritoActual[idx].cantidad = cantidad;
                renderizarCarrito();
            }
        });
    }

    if (btnVaciarCarrito) {
        btnVaciarCarrito.addEventListener('click', () => {
            if (!carritoActual.length) return;
            if (!window.confirm('¿Vaciar la venta actual?')) return;
            carritoActual = [];
            renderizarCarrito();
        });
    }

    if (btnVerCarritoMobile) {
        btnVerCarritoMobile.addEventListener('click', () => {
            document.querySelector('.ds-pos-cart')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // ==========================================
    // COBRO INTELIGENTE Y BILLETERA
    // ==========================================
    const abrirCobro = () => {
            if (!carritoActual.length) return;
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

            const base = Math.max(5000, Math.ceil(totalVentaActual / 5000) * 5000);
            const quickValues = ['exacto', base, base + 5000, base + 10000];
            btnsQuickMoney.forEach((button, index) => {
                const value = quickValues[index];
                if (value === undefined) return;
                button.dataset.val = String(value);
                button.textContent = value === 'exacto' ? 'Exacto' : formatMoneda(value);
            });

            if (modalCobro) {
                modalCobro.classList.add('visible');
                setTimeout(() => btnPaymentMethods[0]?.focus?.(), 30);
            }
        };

    if (btnCobrar) {
        btnCobrar.addEventListener('click', abrirCobro);
    }

    if (btnCobrarMobile) {
        btnCobrarMobile.addEventListener('click', abrirCobro);
    }

    if (btnCancelarCobro) btnCancelarCobro.addEventListener('click', () => {
        if (modalCobro) modalCobro.classList.remove('visible')
    });

    btnPaymentMethods.forEach(btn => {
        btn.setAttribute('role', 'button');
        btn.setAttribute('tabindex', '0');

        const seleccionarMetodoPago = () => {
            btnPaymentMethods.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            metodoPagoSeleccionado = btn.dataset.metodo;

            if (paymentDetailsContainer) paymentDetailsContainer.style.display = 'block';
            if (fieldMP) fieldMP.style.display = 'none';
            if (fieldEfectivo) fieldEfectivo.style.display = 'none';
            if (inputCobroMP) inputCobroMP.value = '';
            if (inputCobroEfectivo) inputCobroEfectivo.value = '';

            if (metodoPagoSeleccionado === 'MercadoPago') {
                if (paymentDetailsContainer) paymentDetailsContainer.style.display = 'none';
                calcularVuelto();
            } else if (metodoPagoSeleccionado === 'Efectivo') {
                if (fieldEfectivo) fieldEfectivo.style.display = 'block';
                calcularVuelto();
                setTimeout(() => inputCobroEfectivo?.focus(), 30);
            } else if (metodoPagoSeleccionado === 'Ambos') {
                if (fieldMP) fieldMP.style.display = 'block';
                if (fieldEfectivo) fieldEfectivo.style.display = 'block';
                if (inputCobroEfectivo) inputCobroEfectivo.value = totalVentaActual;
                calcularVuelto();
                setTimeout(() => inputCobroMP?.focus(), 30);
            }
        };

        btn.addEventListener('click', seleccionarMetodoPago);
        btn.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                seleccionarMetodoPago();
            }
        });
    });

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

    if (inputCobroMP) {
        inputCobroMP.addEventListener('input', () => {
            if (metodoPagoSeleccionado === 'Ambos' && inputCobroEfectivo) {
                const mp = Math.max(0, Math.min(totalVentaActual, Number(inputCobroMP.value) || 0));
                inputCobroEfectivo.value = Math.max(0, totalVentaActual - mp);
            }
            calcularVuelto();
        });
    }
    if (inputCobroEfectivo) inputCobroEfectivo.addEventListener('input', calcularVuelto);

    document.addEventListener('keydown', (event) => {
        const tag = document.activeElement?.tagName?.toLowerCase();
        const isTyping = ['input', 'textarea', 'select'].includes(tag);

        if (event.key === '/' && !isTyping && pantallaPOS?.style.display !== 'none') {
            event.preventDefault();
            buscadorPOS?.focus();
            buscadorPOS?.select();
        }

        if (event.key === 'F2' && pantallaPOS?.style.display !== 'none' && carritoActual.length) {
            event.preventDefault();
            abrirCobro();
        }

        if (event.key === 'Escape' && modalCobro?.classList.contains('visible')) {
            modalCobro.classList.remove('visible');
            buscadorPOS?.focus();
        }
    });

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
                    const producto = productosDisponibles.find(p => p.id === i.id);
                    const cantidad = Number(i.cantidad) || 0;
                    const precioUnitario = Number(i.precio) || 0;
                    const costoUnitarioVenta = Number(producto?.costoBaseCalculado) || 0;
                    const costoTotalItem = costoUnitarioVenta * cantidad;
                    const facturacionItem = precioUnitario * cantidad;
                    const utilidadBrutaItem = facturacionItem - costoTotalItem;
                    const margenBrutoVentaPct = facturacionItem > 0
                        ? (utilidadBrutaItem / facturacionItem) * 100
                        : 0;

                    return {
                        id: i.id,
                        nombre: i.nombre,
                        precio: precioUnitario,
                        cantidad,
                        costoUnitarioVenta,
                        costoTotalVenta: costoTotalItem,
                        utilidadBrutaVenta: utilidadBrutaItem,
                        margenBrutoVentaPct,
                        porcentajeGananciaAplicado: Number(producto?.porcentajeGananciaAplicado) || 0,
                        costoSnapshotVersion: 1
                    };
                });

                const costoTotalVenta = itemsParaGuardar.reduce(
                    (sum, item) => sum + (Number(item.costoTotalVenta) || 0),
                    0
                );
                const utilidadBrutaVenta = totalVentaActual - costoTotalVenta;
                const margenBrutoVentaPct = totalVentaActual > 0
                    ? (utilidadBrutaVenta / totalVentaActual) * 100
                    : 0;

                // Deducción de Stock
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
                            stockResultante: nuevoStock,
                            motivo: item.cantidad > stockActual
                                ? `Venta (${metodoPagoSeleccionado}) · stock informativo/no bloqueante`
                                : `Venta (${metodoPagoSeleccionado})`,
                            usuario: userName, usuarioId: currentUser.uid, fecha: Timestamp.now()
                        });
                    });
                }

                await addDoc(ventasCollection, {
                    cajaId: cajaActiva.id,
                    fecha: Timestamp.now(),
                    metodoPago: metodoPagoSeleccionado,
                    total: totalVentaActual,
                    pagoEfectivo: efectivoReal,
                    pagoMercadoPago: mpReal,
                    items: itemsParaGuardar,
                    costoTotalVenta,
                    utilidadBrutaVenta,
                    margenBrutoVentaPct,
                    costoSnapshotVersion: 1,
                    vendedor: cajaActiva.usuarioNombre || userName
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
    // CIERRE DE CAJA PARA TODOS (CON RESUMEN)
    // ==========================================
    if (btnIniciarCierre) {
        btnIniciarCierre.addEventListener('click', () => {
            if (!cajaActiva) return;
            
            if (cierreNombreCajero) {
                cierreNombreCajero.value = cajaActiva.usuarioNombre === 'Ceci' || cajaActiva.usuarioNombre === 'Eve' ? cajaActiva.usuarioNombre : '';
            }

            const fondo = cajaActiva.fondoInicial || 0;
            const efvo = cajaActiva.totalEfectivo || 0;
            const mp = cajaActiva.totalMercadoPago || 0;

            if (cierreFondo) cierreFondo.textContent = formatMoneda(fondo);
            if (cierreEfectivo) cierreEfectivo.textContent = formatMoneda(efvo);
            if (cierreMP) cierreMP.textContent = formatMoneda(mp);
            if (cierreTotalCaja) cierreTotalCaja.textContent = formatMoneda(fondo + efvo);

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
    // AUDITORÍA Y EDICIÓN DE TICKETS
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
                    const descItems = (venta.items || [])
                        .map(item => `${item.cantidad}x ${escapeHtml(item.nombre)}`)
                        .join(', ');
                    const badgeClase = venta.metodoPago === 'MercadoPago' ? 'tag-mp' : 'tag-efectivo';
                    const safeMetodo = escapeHtml(venta.metodoPago || '');
                    const safeMetodoAttr = escapeAttribute(venta.metodoPago || '');
                    const safeVentaId = escapeAttribute(venta.id);
                    
                    const div = document.createElement('div');
                    div.className = 'ticket-revision-item';
                    div.innerHTML = `
                        <div class="ticket-revision-info">
                            <div style="display:flex; justify-content:space-between;">
                                <span style="font-size: 0.85rem; color:#64748b;">${formatFecha(venta.fecha)}</span>
                                <span class="ticket-tag-metodo ${badgeClase}">${safeMetodo}</span>
                            </div>
                            <p style="margin: 0.2rem 0; font-size: 0.9rem;">${descItems}</p>
                            <span style="font-weight: bold; color: #be185d;">${formatMoneda(venta.total)}</span>
                        </div>
                        <button class="btn-editar-ticket-auditoria" data-id="${safeVentaId}" data-total="${venta.total}" data-metodo="${safeMetodoAttr}" style="background:none; border:none; cursor:pointer; font-size: 1.2rem; margin-left:1rem;" title="Editar Método de Pago">✏️</button>
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
        listaTicketsRevision.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-editar-ticket-auditoria');
            if (!btn) return;

            if (!(await usuarioPuedeAdministrar())) {
                alert("Tu usuario no tiene permisos para editar tickets.");
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
    // ETIQUETAS PROMOCIONALES
    // ==========================================
    if (btnDescargarPromo) {
        btnDescargarPromo.addEventListener('click', () => {
            const tipo = inputPromoTipo ? (inputPromoTipo.value || 'OFERTA') : 'OFERTA';
            const prod = selectPromoProd ? selectPromoProd.value : '';
            const frase = inputPromoFrase ? (inputPromoFrase.value || '') : '';

            const canvas = document.getElementById('promo-canvas-descarga');
            drawPromoLabel(canvas, {
                type: tipo,
                productName: prod,
                subtitle: frase
            });

            downloadCanvasPng(
                canvas,
                `Promo-${tipo}-${prod.substring(0,10)}.png`
            );
        });
    }


}
