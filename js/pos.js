import { 
    getFirestore, collection, onSnapshot, query, where, doc, 
    addDoc, updateDoc, Timestamp, runTransaction, getDocs, getDocFromServer, setDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { createAuthorization } from "./core/authorization.js";
import { formatCurrency as formatMoneda, formatTimestampDateTime } from "./core/format.js";
import { calculateProductSalePrice, calculateWholeCakePricing } from "./core/pricing.js";
import { drawPromoLabel, downloadCanvasPng } from "./core/labels.js";
import { escapeHtml, escapeAttribute } from "./core/html.js";
import { setupManualHistory } from "./pos/manual-history.js";
import { setupPOSInventory } from "./pos/inventory.js?v=6";
import { createPriceListPdf, createBarcodeCatalogPdf, loadPriceListPdfLibrary } from "./pos/price-list-pdf.js?v=2";
import { setupCurrentAccount } from "./pos/current-account.js?v=4";
import { savePOSCheckout, toCents } from "./pos/checkout.js?v=2";
import { notifyCommittedEvent } from "./core/push-client.js?v=2";

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
    const btnCobrar = document.getElementById('btn-cobrar');
    const posCobrarMonto = document.getElementById('pos-cobrar-monto');
    const posCartCount = document.getElementById('pos-cart-count');
    const btnVaciarCarrito = document.getElementById('btn-vaciar-carrito');
    const categoryChips = document.getElementById('pos-category-chips');
    const mobileBar = document.getElementById('pos-mobile-bar');
    const btnMobileProductos = document.getElementById('btn-mobile-productos');
    const btnMobileCarrito = document.getElementById('btn-mobile-carrito');
    const mobileCartItems = document.getElementById('pos-mobile-cart-items');
    const mobileCartSummary = document.getElementById('pos-mobile-cart-summary');

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
    const btnExportarListaPrecios = document.getElementById('btn-exportar-lista-precios');
    const btnExportarCatalogoBarras = document.getElementById('btn-exportar-catalogo-barras');
    const toolsDetails = document.getElementById('pos-tools');
    toolsDetails?.addEventListener('click',event=>{
        if(event.target.closest('.ds-pos-tools-menu button'))toolsDetails.open=false;
    });
    document.addEventListener('click',event=>{
        if(toolsDetails?.open&&!toolsDetails.contains(event.target))toolsDetails.open=false;
    });
    document.addEventListener('keydown',event=>{
        if(event.key==='Escape'&&toolsDetails?.open){toolsDetails.open=false;toolsDetails.querySelector('summary')?.focus();}
    });
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
    const gestionarProductoSolicitado = new URLSearchParams(window.location.search).get('gestionarProducto');
    let gestionarProductoAbierto = false;
    let metodoPagoSeleccionado = null;
    let margenGlobal = 0; 
    let totalVentaActual = 0;
    let saldoTurnoAnteriorDetectado = 0;
    let categoriaActivaPOS = 'todos';
    let terminoBusquedaPOS = '';
    let topVendidosKeys = new Set();
    let topVendidosCargados = false;
    let cuentaCorrienteClienteId = null;
    let pendingCheckout = null;
    let checkoutInProgress=false, dataUnsubs=[], parkingKey='', parked=[], parkedStorageError=false;
    window.DSBeforeLeave=()=>{if(checkoutInProgress||pendingCheckout){alert('Primero verificá el cobro pendiente.');return false;}if(carritoActual.length){alert('Finalizá la venta o ponela en espera antes de cambiar de sección.');return false;}return true;};
    // No perder el carrito activo ni salir durante un intento de cobro no verificado.
    window.addEventListener('beforeunload',event=>{if(checkoutInProgress||pendingCheckout||carritoActual.length){event.preventDefault();event.returnValue='';}});
    let posPreferenceLoaded=false;
    const parkedPanel=document.createElement('div');parkedPanel.className='ds-pos-smart-tools';parkedPanel.hidden=true;
    const parkBtn=document.createElement('button');parkBtn.type='button';parkBtn.className='btn-secondary';parkBtn.textContent='Poner en espera';
    const resumeBtn=document.createElement('button');resumeBtn.type='button';resumeBtn.className='btn-secondary';resumeBtn.textContent='Ventas en espera (0)';
    const suggestion=document.createElement('div');suggestion.className='ds-pos-suggestion';suggestion.hidden=true;
    const recoverPending=document.createElement('button');recoverPending.type='button';recoverPending.className='btn-secondary';recoverPending.textContent='Verificar cobro pendiente';recoverPending.hidden=true;
    parkedPanel.append(parkBtn,resumeBtn,recoverPending,suggestion);
    recoverPending.onclick=async()=>{
        if(!pendingCheckout||checkoutInProgress)return;
        if(!confirm('Consultar el servidor para verificar si el último intento de cobro se registró.'))return;
        recoverPending.disabled=true;
        try{
            const id=pendingCheckout.id,snap=await getDocFromServer(doc(ventasCollection,id));
            if(!pendingCheckout||pendingCheckout.id!==id)return;
            if(snap.exists()){pendingCheckout=null;carritoActual=[];cuentaCorrienteClienteId=null;alert('El cobro ya estaba registrado. No se volverá a cobrar.');}
            else{pendingCheckout=null;alert('No se encontró ese cobro en el servidor. Podés revisar el carrito y reintentar.');}
            renderizarCarrito();actualizarMobileBarVisibility();
        }catch(e){alert('No pudimos verificar el cobro. Conservá el carrito y reintentá con conexión.');}
        finally{recoverPending.disabled=false;}
    };
    carritoContainer?.before(parkedPanel);
    const parkingDialog=document.createElement('dialog');parkingDialog.className='ds-tools-dialog';
    parkingDialog.innerHTML='<div class="ds-tools-head"><h2>Ventas en espera</h2><button type="button" data-close aria-label="Cerrar">×</button></div><div class="ds-tools-body"><p class="ds-tools-muted">Borradores de esta caja y dispositivo. No descuentan stock ni registran cobros.</p><div data-list class="ds-tools-results"></div></div>';
    document.body.append(parkingDialog);parkingDialog.querySelector('[data-close]').onclick=()=>parkingDialog.close();
    const saveParked=next=>{if(!parkingKey||parkedStorageError)return false;try{localStorage.setItem(parkingKey,JSON.stringify(next));parked=next;return true;}catch{alert('No se pudo guardar el borrador. El carrito sigue intacto.');return false;}};
    const loadParked=()=>{
        const next=cajaActiva?.id&&currentUser?.uid?'ds-pos-parked:'+currentUser.uid+':'+cajaActiva.id:'';
        if(next===parkingKey)return;parkingKey=next;parked=[];parkedStorageError=false;
        if(next)try{const raw=JSON.parse(localStorage.getItem(next)||'[]');if(!Array.isArray(raw))throw Error('invalid');parked=raw.filter(x=>x&&Array.isArray(x.items)&&typeof x.id==='string');}catch{parkedStorageError=true;console.warn('No se pudo cargar la lista de ventas en espera.');}
    };
    const safeToPark=()=>Boolean(cajaActiva&&currentUser&&!checkoutInProgress&&!pendingCheckout&&!modalCobro?.classList.contains('visible'));
    const renderSmartTools=()=>{
        loadParked();parkedPanel.hidden=!cajaActiva;recoverPending.hidden=!pendingCheckout;parkBtn.disabled=!carritoActual.length||!safeToPark()||parkedStorageError||parked.length>=20;resumeBtn.disabled=!parked.length;resumeBtn.textContent='Ventas en espera ('+parked.length+')';
        suggestion.replaceChildren();suggestion.hidden=true;
        if(!carritoActual.length||!safeToPark())return;
        const coffee=p=>/\b(caf[eé]|espresso|cappuccino|latte|americano)\b/i.test(p||'');
        const pastry=p=>/torta|porci[oó]n|pasteler[ií]a|alfajor|brownie|cheesecake|rogel|medialuna|bud[ií]n|chocotorta/i.test(p||'');
        const hasCoffee=carritoActual.some(x=>coffee(x.nombre)),hasPastry=carritoActual.some(x=>pastry(x.nombre)||pastry(productosDisponibles.find(p=>p.id===x.id)?.categoria));
        if(hasCoffee===hasPastry)return;
        const suggested=productosDisponibles.find(p=>p.precioCalculado>0&&!carritoActual.some(x=>x.id===p.id)&&(hasPastry?coffee(p.nombreTorta):pastry(p.nombreTorta)||pastry(p.categoria)));
        if(!suggested)return;
        const label=document.createElement('span');label.textContent='Sugerencia: '+suggested.nombreTorta+' · '+formatMoneda(suggested.precioCalculado);
        const add=document.createElement('button');add.type='button';add.textContent='+ Agregar';add.className='btn-secondary';add.onclick=()=>{if(safeToPark())agregarProductoAlCarrito(suggested,1);};
        suggestion.append(label,add);suggestion.hidden=false;
    };
    const parkCurrent=()=>{
        if(!safeToPark()||!carritoActual.length||parked.length>=20)return;
        const record={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),at:Date.now(),items:carritoActual.map(x=>({...x})),clientId:cuentaCorrienteClienteId||null};
        if(!saveParked([...parked,record]))return;
        carritoActual=[];cuentaCorrienteClienteId=null;renderizarCarrito();actualizarMobileBarVisibility();setMobilePOSPanel('productos');
    };
    const renderParking=()=>{
        const list=parkingDialog.querySelector('[data-list]');list.replaceChildren();
        if(!parked.length){list.textContent='No hay ventas en espera.';return;}
        for(const draft of parked){
            const row=document.createElement('article');row.className='ds-tools-notice';
            const name=document.createElement('strong');name.textContent=new Date(draft.at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})+' · '+draft.items.map(x=>x.cantidad+'× '+x.nombre).join(', ');
            const amount=document.createElement('p');amount.textContent='Importe al guardar: '+formatMoneda(draft.items.reduce((s,x)=>s+Number(x.precio)*Number(x.cantidad),0));
            const restore=document.createElement('button');restore.type='button';restore.className='btn-primary';restore.textContent='Recuperar venta';
            restore.onclick=()=>{
                if(!safeToPark()||carritoActual.length){alert('Finalizá o poné en espera el carrito actual antes de recuperar otro.');return;}
                if(draft.clientId&&!currentAccount.currentById(draft.clientId)){alert('La cuenta corriente ya no está disponible. Revisá antes de recuperar.');return;}
                const items=[];let changed=false;
                for(const old of draft.items){
                    const product=productosDisponibles.find(p=>p.id===old.id),whole=old.modoVenta==='entera';
                    if(!product||!(Number(old.cantidad)>0)||!(Number(whole?product.precioTortaEnteraVigente:product.precioCalculado)>0)){alert('Uno de los productos ya no está disponible. El borrador sigue guardado.');return;}
                    const price=Number(whole?product.precioTortaEnteraVigente:product.precioCalculado);
                    if(price!==Number(old.precio)||Number(old.unidadesPorVenta)!==Number(product.unidadesPorVenta)||Number(old.porcionesTortaEntera)!==Number(product.porcionesTortaEntera))changed=true;
                    items.push({...old,nombre:product.nombreTorta,precio:price,precioUnidadVenta:product.precioCalculado,precioTortaEntera:product.precioTortaEnteraVigente||null,unidadesPorVenta:product.unidadesPorVenta,porcionesTortaEntera:product.porcionesTortaEntera||null});
                }
                if(changed&&!confirm('Cambió un precio o presentación. ¿Recuperar con los valores vigentes?'))return;
                if(!saveParked(parked.filter(x=>x.id!==draft.id)))return;
                carritoActual=items;cuentaCorrienteClienteId=draft.clientId||null;parkingDialog.close();renderizarCarrito();actualizarMobileBarVisibility();
            };
            const discard=document.createElement('button');discard.type='button';discard.className='btn-secondary';discard.textContent='Descartar borrador';discard.onclick=()=>{if(confirm('¿Eliminar esta venta en espera? No afecta ventas registradas.')&&saveParked(parked.filter(x=>x.id!==draft.id))){renderParking();renderSmartTools();}};
            row.append(name,amount,restore,discard);list.append(row);
        }
    };
    parkBtn.onclick=parkCurrent;resumeBtn.onclick=()=>{if(safeToPark()){renderParking();parkingDialog.showModal();}};

    const ccScreen = document.getElementById('pantalla-cuenta-corriente');
    const ccBanner = document.getElementById('cc-venta-banner');
    const ccBannerName = document.getElementById('cc-venta-cliente');
    const ccBannerBalance = document.getElementById('cc-venta-saldo');
    const ccExitMode = document.getElementById('cc-salir-modo');
    const ccPaymentInfo = document.getElementById('cc-confirmacion');
    const ccPaymentName = document.getElementById('cc-confirmar-nombre');
    const ccPaymentBalance = document.getElementById('cc-confirmar-saldo');
    const paymentMethodsContainer = document.getElementById('pos-payment-methods');
    const paymentHeading = document.getElementById('pos-payment-heading');

    const currentAccount = setupCurrentAccount({
        db,
        getCaja: () => cajaActiva,
        getUser: () => currentUser,
        getUserName: () => userName,
        onOpen: () => {
            // La consulta de saldos/historial no requiere caja abierta.
            if (pantallaApertura) pantallaApertura.style.display = 'none';
            if (pantallaPOS) pantallaPOS.style.display = 'none';
            if (pantallaStock) pantallaStock.style.display = 'none';
            if (pantallaPromociones) pantallaPromociones.style.display = 'none';
            if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'none';
            if (ccScreen) ccScreen.style.display = 'block';
            actualizarMobileBarVisibility();
        },
        onReturn: () => {
            if (ccScreen) ccScreen.style.display = 'none';
            if (pantallaPOS) pantallaPOS.style.display = cajaActiva?.id ? 'grid' : 'none';
            if (pantallaApertura) pantallaApertura.style.display = cajaActiva?.id ? 'none' : 'block';
            actualizarMobileBarVisibility();
        },
        onAccountsUpdated: () => {
            actualizarMobileBarVisibility();
            if (modalCobro?.classList.contains('visible')
                && metodoPagoSeleccionado === 'CuentaCorriente') {
                calcularVuelto();
            }
        },
        onSelectForSale: client => {
            if(checkoutInProgress||pendingCheckout){alert('Primero verificá el cobro pendiente.');return false;}
            if (carritoActual.length > 0 && cuentaCorrienteClienteId !== client.id) {
                alert('Ya existe una venta en preparación. Finalizala o vaciala antes de cambiar de cliente.');
                return false;
            }
            cuentaCorrienteClienteId = client.id;
            renderizarCarrito();
            actualizarMobileBarVisibility();
            return true;
        }
    });
    const getCuentaCorrienteActiva = () =>
        cuentaCorrienteClienteId
            ? currentAccount.currentById(cuentaCorrienteClienteId)
            : null;

    ccExitMode?.addEventListener('click', () => {
        if(checkoutInProgress||pendingCheckout){alert('Primero verificá el cobro pendiente.');return;}
        cuentaCorrienteClienteId = null;
        renderizarCarrito();
        actualizarMobileBarVisibility();
    });

    const manualHistory = setupManualHistory({
        db,
        cajasCollection,
        ventasCollection,
        getCurrentUser: () => currentUser,
        getUserName: () => userName,
        onViewChange: () => actualizarMobileBarVisibility()
    });

    const inventory = setupPOSInventory({
        db,
        auditoriaCollection,
        getCurrentUser: () => currentUser,
        getUserName: () => userName,
        getGlobalMargin: () => margenGlobal,
        canAdminister: authorization.canAdminister
    });

    // Precios: sólo lectura. Códigos permanentes: persistir los faltantes una única vez.
    const exportarCatalogoPos = async (button, permanent) => {
        const original = button.textContent;
        const exportButtons = [btnExportarListaPrecios, btnExportarCatalogoBarras].filter(Boolean);
        exportButtons.forEach(btn => { btn.disabled = true; });
        try {
            if (!currentUser || !(await authorization.canAdminister())) {
                throw new Error('Sólo el administrador puede exportar estos PDF.');
            }
            if (!productosDisponibles.length) {
                throw new Error('El catálogo todavía no está disponible. Revisá la conexión.');
            }
            button.textContent = 'Cargando PDF…';
            await loadPriceListPdfLibrary();
            const products = productosDisponibles
                .filter(product => product?.id && product.nombreTorta)
                .map(product => ({ ...product }));
            if (permanent) {
                if (typeof globalThis.JsBarcode !== 'function') {
                    throw new Error('No se pudo cargar el generador de códigos de barras.');
                }
                const usedCodes = new Set(products.map(p => String(p.codigoBarras || '')).filter(Boolean));
                const missing = products.filter(p => !p.codigoBarras);
                for (let start = 0; start < missing.length; start += 4) {
                    button.textContent = `Códigos ${Math.min(start + 4, missing.length)}/${missing.length}…`;
                    await Promise.all(
                        missing.slice(start, start + 4)
                            .map(product => inventory.ensureBarcode(product, usedCodes))
                    );
                }
            }
            button.textContent = 'Generando PDF…';
            if (permanent) createBarcodeCatalogPdf(products);
            else createPriceListPdf(products);
        } catch (error) {
            console.error('No se pudo generar el PDF:', error);
            alert('No se pudo generar el PDF: ' + (error.message || 'Revisá permisos y conexión.'));
        } finally {
            exportButtons.forEach(btn => { btn.disabled = false; });
            button.textContent = original;
        }
    };
    btnExportarListaPrecios?.addEventListener('click', () => exportarCatalogoPos(btnExportarListaPrecios, false));
    btnExportarCatalogoBarras?.addEventListener('click', () => exportarCatalogoPos(btnExportarCatalogoBarras, true));

    // Funciones Helper compartidas
    const formatFecha = (timestamp) => formatTimestampDateTime(timestamp, { shortYear: true });

    // ==========================================
    // CÁLCULO DE PRECIOS — fuente compartida con servidor
    // ==========================================
    const calcularPrecioComercial = receta =>
        calculateProductSalePrice(receta, materiasPrimasMap, margenGlobal);

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
                
                if ((pantallaStock && pantallaStock.style.display === 'block') ||
                   (pantallaPromociones && pantallaPromociones.style.display === 'block') ||
                   (pantallaCargaHistorica && pantallaCargaHistorica.style.display === 'block') ||
                   (ccScreen && ccScreen.style.display === 'block')) {
                    if (pantallaPOS) pantallaPOS.style.display = 'none';
                } else {
                    if (pantallaPOS) pantallaPOS.style.display = 'grid';
                    if (pantallaStock) pantallaStock.style.display = 'none';
                    if (pantallaPromociones) pantallaPromociones.style.display = 'none';
                    if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'none';
                }
                
                actualizarMobileBarVisibility();
                renderSmartTools();

                if (!datosCargados) {
                    cargarDataYCostos();
                    datosCargados = true;
                }
            } else {
                cajaActiva = null;
                datosCargados = false;
                dataUnsubs.forEach(unsubscribe=>unsubscribe());dataUnsubs=[];
                renderSmartTools();
                cuentaCorrienteClienteId = null;
                const viendoCuenta = ccScreen?.style.display === 'block';
                if (ccScreen && !viendoCuenta) ccScreen.style.display = 'none';
                if (pantallaPOS) pantallaPOS.style.display = 'none';
                if (pantallaStock) pantallaStock.style.display = 'none';
                if (pantallaPromociones) pantallaPromociones.style.display = 'none';
                if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'none';
                if (pantallaApertura) pantallaApertura.style.display = viendoCuenta ? 'none' : 'block';
                actualizarMobileBarVisibility();
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
                const openedDrawer = await addDoc(cajasCollection, {
                    usuarioId: currentUser.uid,
                    usuarioNombre: nombreIngresado,
                    turno: turno,
                    fechaApertura: Timestamp.now(),
                    fondoInicial: fondoTipeado,
                    totalEfectivo: 0,
                    totalMercadoPago: 0,
                    estado: 'abierta'
                });
                void notifyCommittedEvent(auth, 'drawer-open', openedDrawer.id);
                
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
            inventory.resetWorkspace?.();
            pantallaPOS.style.display = 'none';
            actualizarMobileBarVisibility();
            if (pantallaPromociones) pantallaPromociones.style.display = 'none';
            if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'none';
            pantallaStock.style.display = 'block';
            window.scrollTo(0, 0);
            procesarYRenderizar();
        });
    }

    if (btnIrPromos) {
        btnIrPromos.addEventListener('click', () => {
            pantallaPOS.style.display = 'none';
            actualizarMobileBarVisibility();
            pantallaStock.style.display = 'none';
            if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'none';
            if (pantallaPromociones) {
                pantallaPromociones.style.display = 'block';
                window.scrollTo(0, 0);
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
            inventory.resetWorkspace?.();
            pantallaStock.style.display = 'none';
            if (pantallaPromociones) pantallaPromociones.style.display = 'none';
            if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'none';
            pantallaPOS.style.display = 'grid';
            actualizarMobileBarVisibility();
            window.scrollTo(0, 0);
            procesarYRenderizar();
            if (buscadorPOS) buscadorPOS.focus();
        });
    }

    if (btnVolverMostradorPromos) {
        btnVolverMostradorPromos.addEventListener('click', () => {
            if (pantallaPromociones) pantallaPromociones.style.display = 'none';
            pantallaPOS.style.display = 'grid';
            actualizarMobileBarVisibility();
            window.scrollTo(0, 0);
            if (buscadorPOS) buscadorPOS.focus();
        });
    }

    // ==========================================
    // CARGA Y RENDERIZADO
    // ==========================================
    const normalizarTextoPOS = (value) =>
        String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();

    const claveProductoPOS = (prod) => {
        if (prod?.id) return `id:${prod.id}`;
        return `name:${normalizarTextoPOS(prod?.nombreTorta)}`;
    };

    const esTopVendido = (prod) => topVendidosKeys.has(claveProductoPOS(prod));

    const obtenerCategoriaPOS = (prod) =>
        String(prod?.categoria || 'Otros').trim() || 'Otros';

    const coincideBusquedaPOS = (prod, termino) => {
        if (!termino) return true;

        const aliases = Array.isArray(prod?.aliases)
            ? prod.aliases.join(' ')
            : String(prod?.aliases || prod?.alias || '');

        const haystack = normalizarTextoPOS([
            prod?.nombreTorta,
            prod?.codigoBarras,
            prod?.categoria,
            aliases
        ].filter(Boolean).join(' '));

        return haystack.includes(termino);
    };

    const renderizarFiltrosCategorias = () => {
        if (!categoryChips) return;

        const categorias = [...new Set(
            productosDisponibles
                .map(obtenerCategoriaPOS)
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b, 'es'));

        const botones = [
            { value: 'todos', label: 'Todos' }
        ];

        if (topVendidosKeys.size > 0) {
            botones.push({ value: 'top', label: 'Más vendidos', top: true });
        }

        categorias.forEach(categoria => {
            botones.push({ value: `cat:${categoria}`, label: categoria });
        });

        const valoresDisponibles = new Set(botones.map(item => item.value));
        if (!valoresDisponibles.has(categoriaActivaPOS)) {
            categoriaActivaPOS = 'todos';
        }

        categoryChips.innerHTML = botones.map(item => `
            <button
                type="button"
                class="ds-pos-category-chip ${item.top ? 'is-top' : ''} ${categoriaActivaPOS === item.value ? 'is-active' : ''}"
                data-pos-category="${escapeAttribute(item.value)}"
            >${escapeHtml(item.label)}</button>
        `).join('');
    };

    const obtenerProductosFiltradosPOS = () => {
        const termino = normalizarTextoPOS(terminoBusquedaPOS);

        return productosDisponibles.filter(prod => {
            const coincideCategoria =
                categoriaActivaPOS === 'todos'
                || (categoriaActivaPOS === 'top' && esTopVendido(prod))
                || (
                    categoriaActivaPOS.startsWith('cat:')
                    && obtenerCategoriaPOS(prod) === categoriaActivaPOS.slice(4)
                );

            return coincideCategoria && coincideBusquedaPOS(prod, termino);
        });
    };

    const aplicarFiltrosPOS = () => {
        if(!posPreferenceLoaded&&currentUser&&productosDisponibles.length){posPreferenceLoaded=true;try{categoriaActivaPOS=localStorage.getItem('ds-pos-category:'+currentUser.uid)||'todos';}catch{}}
        renderizarFiltrosCategorias();
        const filtered=obtenerProductosFiltradosPOS();
        if(categoriaActivaPOS==='top'){const order=[...topVendidosKeys];const rank=p=>{const i=order.indexOf('id:'+p.id);return i<0?order.indexOf('name:'+normalizarTextoPOS(p.nombreTorta)):i;};filtered.sort((a,b)=>rank(a)-rank(b));}
        renderizarGridPOS(filtered);
    };

    const cargarMasVendidos = async () => {
        try {
            const ventasSnap = await getDocs(
                query(ventasCollection, orderBy('fecha', 'desc'), limit(200))
            );

            const conteo = new Map();

            ventasSnap.forEach(ventaDoc => {
                const venta = ventaDoc.data() || {};
                if(venta.eliminada===true)return;
                const items = Array.isArray(venta.items) ? venta.items : [];

                items.forEach(item => {
                    const key = item?.id
                        ? `id:${item.id}`
                        : `name:${normalizarTextoPOS(item?.nombre)}`;

                    if (!key || key === 'name:') return;
                    conteo.set(key, (conteo.get(key) || 0) + (Number(item.cantidad) || 0));
                });
            });

            topVendidosKeys = new Set(
                [...conteo.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([key]) => key)
            );
        } catch (error) {
            console.warn('No se pudieron calcular los más vendidos:', error);
            topVendidosKeys = new Set();
        }

        if (pantallaPOS && pantallaPOS.style.display !== 'none') {
            aplicarFiltrosPOS();
        }
    };

    const setMobilePOSPanel = (panel) => {
        if (!pantallaPOS) return;
        const mostrarCarrito = panel === 'carrito';
        pantallaPOS.classList.toggle('is-mobile-cart', mostrarCarrito);
        btnMobileProductos?.classList.toggle('is-active', !mostrarCarrito);
        btnMobileCarrito?.classList.toggle('is-active', mostrarCarrito);
    };

    const actualizarMobileBarVisibility = () => {
        if (pantallaPOS) {
            const onPOS = pantallaPOS.style.display !== 'none';
            const client = getCuentaCorrienteActiva();
            if (mobileBar) mobileBar.hidden = !onPOS;
            if (ccBanner) ccBanner.hidden = !onPOS || !client;
            if (client) {
                if (ccBannerName) ccBannerName.textContent = client.nombre || 'Cliente';
                if (ccBannerBalance) ccBannerBalance.textContent =
                    `Saldo disponible: ${formatMoneda((Number(client.saldoCentavos) || 0) / 100)}`;
            }
        }
    };

    // Agrupar actualizaciones de materias primas y recetas en un solo
    // recálculo por fotograma; ambas escuchas suelen disparar al iniciar.
    let procesadoPendiente = false;
    const programarProcesamiento = () => {
        if (procesadoPendiente) return;
        procesadoPendiente = true;
        requestAnimationFrame(() => {
            procesadoPendiente = false;
            procesarYRenderizar();
        });
    };

    const cargarDataYCostos = () => {
        if (!topVendidosCargados) {
            topVendidosCargados = true;
            cargarMasVendidos();
        }

        dataUnsubs.push(onSnapshot(materiasPrimasCollection, (snapshot) => {
            materiasPrimasMap.clear();
            snapshot.forEach(doc => materiasPrimasMap.set(doc.id, doc.data()));
            programarProcesamiento();
        }));

        dataUnsubs.push(onSnapshot(recetasCollection, (snapshot) => {
            let tempArr = [];
            snapshot.forEach(doc => tempArr.push({ id: doc.id, ...doc.data() }));
            tempArr.sort((a,b) => (a.nombreTorta || "").localeCompare(b.nombreTorta || ""));
            recetasBrutas = tempArr;
            programarProcesamiento();
        }));
    };

    const procesarYRenderizar = () => {
        if (recetasBrutas.length === 0) return;

        let commercialOverrides = {};
        let recipeOverrides = {};
        if (window.location.hostname !== 'dulce-app.netlify.app') {
            try {
                commercialOverrides = JSON.parse(
                    sessionStorage.getItem('dulcesallPricingTestOverrides') || '{}'
                );
            } catch {}
            try {
                recipeOverrides = JSON.parse(
                    sessionStorage.getItem('dulcesallRecipeTestOverrides') || '{}'
                );
            } catch {}
        }

        productosDisponibles = recetasBrutas.map(recetaOriginal => {
            const receta = {
                ...recetaOriginal,
                ...(recipeOverrides[recetaOriginal.id] || {}),
                ...(commercialOverrides[recetaOriginal.id] || {})
            };
            const sale = calcularPrecioComercial(receta);
            const whole = calculateWholeCakePricing({
                unitPrice: sale.price,
                portions: receta.porcionesTortaEntera,
                manualPrice: receta.precioTortaEnteraManual
            });

            return {
                ...receta,
                codigoProducto: receta.id,
                costoBaseCalculado: sale.cost,
                costoUnidadRendimiento: sale.recipeUnitCost,
                unidadesPorVenta: sale.unitsPerSale,
                porcentajeGananciaAplicado: sale.marginPercent,
                precioSugerido: sale.suggestedPrice,
                precioVentaManual: sale.manualPrice,
                origenPrecioVenta: sale.priceSource,
                precioCalculado: sale.price,
                porcionesTortaEntera: whole.portions,
                precioTortaEnteraAutomatico: whole.automaticPrice,
                precioTortaEnteraVigente: whole.currentPrice,
                origenPrecioTortaEntera: whole.source
            };
        });

        if (pantallaPOS && pantallaPOS.style.display !== 'none') {
            aplicarFiltrosPOS();
            actualizarMobileBarVisibility();
        } 
        renderSmartTools();
        inventory.setProducts(productosDisponibles);
        manualHistory.setProducts(productosDisponibles);

        if (gestionarProductoSolicitado && !gestionarProductoAbierto) {
            const existe = productosDisponibles.some(item => String(item.id) === String(gestionarProductoSolicitado));
            if (existe) {
                gestionarProductoAbierto = true;
                if (pantallaPOS) pantallaPOS.style.display = 'none';
                if (pantallaPromociones) pantallaPromociones.style.display = 'none';
                if (pantallaCargaHistorica) pantallaCargaHistorica.style.display = 'none';
                if (pantallaStock) pantallaStock.style.display = 'block';
                actualizarMobileBarVisibility();
                inventory.openProduct?.(gestionarProductoSolicitado);
                window.scrollTo(0, 0);
            }
        }
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
                    <strong>No encontré productos</strong>
                    <span>Probá con otra búsqueda o categoría.</span>
                </div>
            `;
            return;
        }
        
        productos.forEach(prod => {
            const precioCalculado = prod.precioCalculado;
            const categoria = obtenerCategoriaPOS(prod);
            const popular = esTopVendido(prod);
            
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'producto-card';
            card.dataset.id = prod.id;
            card.setAttribute('aria-label', `Agregar ${prod.nombreTorta} por ${formatMoneda(precioCalculado)}`);
            
            card.innerHTML = `
                <div class="ds-pos-card-top">
                    <div class="prod-nombre">${escapeHtml(prod.nombreTorta)}</div>
                    ${popular ? '<span class="ds-pos-card-popular" title="Más vendido">★</span>' : ''}
                </div>
                <div>
                    <div class="prod-precio">${formatMoneda(precioCalculado)}</div>
                    ${Number(prod.unidadesPorVenta) > 1
                        ? `<span class="ds-pos-sale-pack">Venta x${prod.unidadesPorVenta} u.</span>`
                        : ''}
                    ${prod.precioTortaEnteraVigente !== null && prod.porcionesTortaEntera
                        ? `<span class="ds-pos-whole-price">Entera: ${formatMoneda(prod.precioTortaEnteraVigente)} · ${prod.porcionesTortaEntera} porciones</span>`
                        : ''}
                    <span class="ds-pos-card-category">${escapeHtml(categoria)}</span>
                </div>
            `;
            gridProductos.appendChild(card);
        });
    };

    const agregarProductoAlCarrito = (prod, cantidadIngresada = 1) => {
        if(checkoutInProgress||pendingCheckout){alert('Primero verificá el cobro pendiente.');return;}
        const existe = carritoActual.find(i => i.id === prod.id);
        if (existe) {
            existe.cantidad += cantidadIngresada;
        } else {
            const unidadesPorVenta = Math.max(1, Math.floor(Number(prod.unidadesPorVenta) || 1));
            const porcionesTorta = Number.isInteger(prod.porcionesTortaEntera)
                ? prod.porcionesTortaEntera
                : null;
            const precioEntera = Number(prod.precioTortaEnteraVigente);
            carritoActual.push({
                id: prod.id,
                nombre: prod.nombreTorta,
                precio: prod.precioCalculado,
                precioUnidadVenta: prod.precioCalculado,
                precioTortaEntera: Number.isFinite(precioEntera) && precioEntera > 0 ? precioEntera : null,
                unidadesPorVenta,
                porcionesTortaEntera: porcionesTorta,
                modoVenta: 'unidad',
                cantidad: cantidadIngresada
            });
        }
        renderizarCarrito();

        const card = gridProductos
            ? [...gridProductos.querySelectorAll('.producto-card')]
                .find(item => item.dataset.id === String(prod.id))
            : null;
        if (card) {
            card.classList.add('is-added');
            window.setTimeout(() => card.classList.remove('is-added'), 260);
        }
    };

    // Búsqueda
    if (buscadorPOS) {
        buscadorPOS.addEventListener('input', (e) => {
            terminoBusquedaPOS = e.target.value || '';
            aplicarFiltrosPOS();
        });

        buscadorPOS.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) e.preventDefault();
        });
    }

    const tieneVentaEnteraConfigurable = product =>
        Number.isInteger(product?.porcionesTortaEntera)
        && product.porcionesTortaEntera >= 2
        && Number.isFinite(Number(product?.precioTortaEnteraVigente))
        && Number(product.precioTortaEnteraVigente) > 0;

    // Escáner de Código de Barras Físico
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    document.addEventListener('keydown', (e) => {
        if (document.querySelector('dialog[open],.modal-overlay.visible')||checkoutInProgress||pendingCheckout){scanBuffer='';return;}
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
                    // Siempre entra primero como porción / unidad de venta.
                    // La conversión a torta entera se hace desde la línea del carrito.
                    agregarProductoAlCarrito(productoEncontrado, 1);
                } else {
                    alert("El código escaneado (" + codigoEscaneado + ") no existe en el sistema.");
                }
                scanBuffer = '';
                if (buscadorPOS) buscadorPOS.value = '';
                terminoBusquedaPOS = '';
                categoriaActivaPOS = 'todos';
                aplicarFiltrosPOS(); 
            }
        } else {
            scanBuffer += e.key;
        }
    });

    if (categoryChips) {
        categoryChips.addEventListener('click', (event) => {
            const button = event.target.closest('[data-pos-category]');
            if (!button) return;

            categoriaActivaPOS = button.dataset.posCategory || 'todos';
            try{localStorage.setItem('ds-pos-category:'+currentUser?.uid,categoriaActivaPOS);}catch{}
            aplicarFiltrosPOS();
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

        const cantidadItems = carritoActual.reduce(
            (sum, item) => sum + (Number(item.cantidad) || 0),
            0
        );

        let total = 0;
        carritoActual.forEach(item => {
            total += (Number(item.precio) || 0) * (Number(item.cantidad) || 0);
        });

        if (posTotalMonto) posTotalMonto.textContent = formatMoneda(total);
        if (posCobrarMonto) posCobrarMonto.textContent = formatMoneda(total);
        const chargeLabel = btnCobrar?.querySelector('span');
        if (chargeLabel) {
            chargeLabel.textContent = cuentaCorrienteClienteId ? 'Descontar saldo' : 'Cobrar';
        }
        if (posCartCount) posCartCount.textContent = cantidadItems;
        if (mobileCartSummary) mobileCartSummary.textContent = `${cantidadItems} · ${formatMoneda(total)}`;
        if (mobileCartItems) {
            if (!carritoActual.length) {
                mobileCartItems.textContent = 'Carrito vacío';
            } else {
                const visible = carritoActual.slice(0, 2).map(item =>
                    `${Number(item.cantidad) || 0}× ${item.nombre}`
                );
                const extra = carritoActual.length > 2 ? ` · +${carritoActual.length - 2} más` : '';
                mobileCartItems.textContent = visible.join(' · ') + extra;
            }
        }
        if (btnVaciarCarrito) btnVaciarCarrito.hidden = carritoActual.length === 0;
        renderSmartTools();

        if (carritoActual.length === 0) {
            carritoContainer.innerHTML = `
                <div class="ds-cart-empty">
                    <span>🧁</span>
                    <strong>Venta vacía</strong>
                    <p>Tocá un producto para agregarlo.</p>
                </div>
            `;
            if (btnCobrar) btnCobrar.disabled = true;
            return;
        }

        carritoActual.forEach((item, index) => {
            const subtotal = item.precio * item.cantidad;
            const esEntera = item.modoVenta === 'entera';
            const equivalentesPorVenta = esEntera
                ? (Number(item.porcionesTortaEntera) || 1)
                : (Number(item.unidadesPorVenta) || 1);
            const equivalentesTotales = equivalentesPorVenta * item.cantidad;
            const puedeEntera = Number.isInteger(item.porcionesTortaEntera)
                && item.porcionesTortaEntera >= 2
                && Number.isFinite(Number(item.precioTortaEntera))
                && Number(item.precioTortaEntera) > 0;
            const meta = esEntera
                ? `${formatMoneda(item.precio)} por entera · ${equivalentesPorVenta} porciones`
                : equivalentesPorVenta > 1
                    ? `${formatMoneda(item.precio)} por venta · x${equivalentesPorVenta} u.`
                    : `${formatMoneda(item.precio)} c/u`;
            const selector = puedeEntera
                ? `<button type="button" class="ds-cart-sale-mode btn-cart-whole-toggle ${esEntera ? 'is-whole' : ''}" data-index="${index}">
                       ${esEntera ? 'Porción' : 'Entera'}
                   </button>`
                : equivalentesPorVenta > 1
                    ? `<span class="ds-cart-sale-mode is-pack" title="${equivalentesTotales} unidades totales">${equivalentesPorVenta} u.</span>`
                    : '<span class="ds-cart-sale-mode is-empty" aria-hidden="true"></span>';

            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div class="cart-item-info">
                    <h4 title="${escapeAttribute(item.nombre)}">${escapeHtml(item.nombre)}</h4>
                    <span class="ds-cart-line-meta">${meta}</span>
                    ${equivalentesPorVenta > 1
                        ? `<small class="ds-cart-equivalent">${item.cantidad} venta${item.cantidad === 1 ? '' : 's'} = ${equivalentesTotales} ${esEntera ? 'porciones' : 'unidades'}</small>`
                        : ''}
                </div>
                ${selector}
                <div class="ds-cart-qty-control">
                    <button type="button" class="btn-restar-cant" data-index="${index}" aria-label="Restar unidad">−</button>
                    <input
                        class="ds-cart-qty-input"
                        type="number"
                        min="1"
                        step="1"
                        inputmode="numeric"
                        value="${item.cantidad}"
                        data-index="${index}"
                        aria-label="Cantidad de ${escapeAttribute(item.nombre)}"
                    >
                    <button type="button" class="btn-sumar-cant" data-index="${index}" aria-label="Sumar unidad">+</button>
                </div>
                <div class="cart-item-total">${formatMoneda(subtotal)}</div>
                <button type="button" class="ds-cart-remove-btn btn-remove-cart" data-index="${index}" aria-label="Quitar ${escapeAttribute(item.nombre)}">×</button>
            `;
            carritoContainer.appendChild(div);
        });

        if (btnCobrar) btnCobrar.disabled = false;
    };

    if (carritoContainer) {
        carritoContainer.addEventListener('click', (e) => {
            if(checkoutInProgress||pendingCheckout){alert('Primero verificá el cobro pendiente.');return;}
            const btnRemove = e.target.closest('.btn-remove-cart');
            const btnRestar = e.target.closest('.btn-restar-cant');
            const btnSumar = e.target.closest('.btn-sumar-cant');
            const btnWhole = e.target.closest('.btn-cart-whole-toggle');

            if (btnWhole) {
                const idx = Number(btnWhole.dataset.index);
                const item = carritoActual[idx];
                if (!item) return;
                if (item.modoVenta === 'entera') {
                    item.modoVenta = 'unidad';
                    item.precio = item.precioUnidadVenta;
                } else if (item.precioTortaEntera && item.porcionesTortaEntera) {
                    item.modoVenta = 'entera';
                    item.precio = item.precioTortaEntera;
                }
                // El contador representa ventas: 1 entera, 2 enteras, etc.
                // La equivalencia real (ej. 8 porciones) se conserva aparte.
                item.cantidad = 1;
                renderizarCarrito();
                return;
            }

            if (btnRemove) { 
                carritoActual.splice(Number(btnRemove.dataset.index), 1);
                renderizarCarrito();
            } else if (btnRestar) {
                const idx = Number(btnRestar.dataset.index);
                if (!carritoActual[idx]) return;

                if (carritoActual[idx].cantidad > 1) {
                    carritoActual[idx].cantidad--;
                } else {
                    carritoActual.splice(idx, 1);
                }
                renderizarCarrito();
            } else if (btnSumar) {
                const idx = Number(btnSumar.dataset.index);
                if (carritoActual[idx]) {
                    carritoActual[idx].cantidad++;
                }
                renderizarCarrito();
            }
        });

        carritoContainer.addEventListener('change', (e) => {
            if(checkoutInProgress||pendingCheckout){renderizarCarrito();return;}
            const input = e.target.closest('.ds-cart-qty-input');
            if (!input) return;

            const idx = Number(input.dataset.index);
            if (!carritoActual[idx]) return;

            const cantidad = Math.max(1, Math.floor(Number(input.value) || 1));
            carritoActual[idx].cantidad = cantidad;
            renderizarCarrito();
        });
    }

    if (btnVaciarCarrito) {
        btnVaciarCarrito.addEventListener('click', () => {
            if(checkoutInProgress||pendingCheckout){alert('Primero verificá el cobro pendiente.');return;}
            if (!carritoActual.length) return;

            if (window.confirm('¿Vaciar toda la venta actual?')) {
                carritoActual = [];
                renderizarCarrito();
                setMobilePOSPanel('productos');
            }
        });
    }

    if (btnMobileProductos) {
        btnMobileProductos.addEventListener('click', () => setMobilePOSPanel('productos'));
    }

    if (btnMobileCarrito) {
        btnMobileCarrito.addEventListener('click', () => setMobilePOSPanel('carrito'));
    }

    document.addEventListener('keydown', (event) => {
        if(document.querySelector('dialog[open]'))return;
        const target = event.target;
        const isTyping = target instanceof HTMLInputElement
            || target instanceof HTMLTextAreaElement
            || target instanceof HTMLSelectElement;

        if (event.key === '/' && !isTyping && pantallaPOS?.style.display !== 'none') {
            event.preventDefault();
            buscadorPOS?.focus();
            return;
        }

        if (event.key === 'F4' && pantallaPOS?.style.display !== 'none' && !document.querySelector('.modal-overlay.visible') && safeToPark()) {event.preventDefault();parkCurrent();return;}
        if (event.key === 'F2' && pantallaPOS?.style.display !== 'none') {
            event.preventDefault();
            if (btnCobrar && !btnCobrar.disabled) btnCobrar.click();
            return;
        }

        if (event.key === 'Escape') {
            if (modalCobro?.classList.contains('visible')) {
                modalCobro.classList.remove('visible');
                return;
            }

            if (window.matchMedia('(max-width: 991px)').matches && pantallaPOS?.classList.contains('is-mobile-cart')) {
                setMobilePOSPanel('productos');
            }
        }
    });

    // ==========================================
    // COBRO INTELIGENTE Y BILLETERA
    // ==========================================
    const actualizarBotonesDineroRapido = () => {
        if (!btnsQuickMoney.length || totalVentaActual <= 0) return;

        const base = Math.max(5000, (Math.floor(totalVentaActual / 5000) + 1) * 5000);
        const valores = ['exacto', base, base + 5000, base + 10000];

        btnsQuickMoney.forEach((btn, index) => {
            const valor = valores[index];
            if (valor === undefined) return;

            btn.dataset.val = String(valor);
            btn.textContent = valor === 'exacto'
                ? 'Exacto'
                : formatMoneda(valor);
        });
    };

    if (btnCobrar) {
        btnCobrar.addEventListener('click', () => {
            totalVentaActual = carritoActual.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
            if (modalCobroTotal) modalCobroTotal.textContent = formatMoneda(totalVentaActual);
            actualizarBotonesDineroRapido();
            
            const prepaidClient = getCuentaCorrienteActiva();
            metodoPagoSeleccionado = prepaidClient ? 'CuentaCorriente' : null;
            btnPaymentMethods.forEach(b => b.classList.remove('selected'));
            btnConfirmarVenta.disabled = true;

            if (ccPaymentInfo) ccPaymentInfo.hidden = !prepaidClient;
            if (paymentMethodsContainer) paymentMethodsContainer.hidden = Boolean(prepaidClient);
            if (paymentHeading) paymentHeading.hidden = Boolean(prepaidClient);
            if (prepaidClient) {
                if (ccPaymentName) ccPaymentName.textContent = prepaidClient.nombre;
                if (ccPaymentBalance) ccPaymentBalance.textContent =
                    `Saldo disponible: ${formatMoneda((Number(prepaidClient.saldoCentavos) || 0) / 100)}`;
                calcularVuelto();
            }

            
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
        if (metodoPagoSeleccionado === 'CuentaCorriente') {
            const saldo = Number(getCuentaCorrienteActiva()?.saldoCentavos || 0);
            const enough = saldo >= toCents(totalVentaActual);
            if (ccPaymentBalance) {
                ccPaymentBalance.textContent = enough
                    ? `Saldo disponible: ${formatMoneda(saldo / 100)} · Después: ${formatMoneda((saldo - toCents(totalVentaActual)) / 100)}`
                    : `Saldo insuficiente: ${formatMoneda(saldo / 100)}. Cargá un anticipo antes de continuar.`;
            }
            if (btnConfirmarVenta) {
                btnConfirmarVenta.disabled = !enough || totalVentaActual <= 0;
            }
            return;
        }
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
                const mp = Math.max(0, parseFloat(inputCobroMP.value) || 0);
                inputCobroEfectivo.value = Math.max(0, totalVentaActual - mp);
            }
            calcularVuelto();
        });
    }
    if (inputCobroEfectivo) inputCobroEfectivo.addEventListener('input', calcularVuelto);

    if (btnConfirmarVenta) {
        btnConfirmarVenta.addEventListener('click', async () => {
            if (checkoutInProgress || !metodoPagoSeleccionado || carritoActual.length === 0 || !cajaActiva) return;
            checkoutInProgress=true;

            let mpReal = 0; let efectivoReal = 0;
            if (metodoPagoSeleccionado === 'MercadoPago') { mpReal = totalVentaActual; } 
            else if (metodoPagoSeleccionado === 'Efectivo') { efectivoReal = totalVentaActual; } 
            else if (metodoPagoSeleccionado === 'Ambos') {
                let mpTipeado = parseFloat(inputCobroMP.value) || 0;
                mpReal = mpTipeado; efectivoReal = totalVentaActual - mpTipeado;
            }
            // Cuenta corriente: el efectivo/MP ya ingresó en el anticipo.
            // Su consumo no genera otro ingreso físico en caja.

            btnConfirmarVenta.disabled = true;
            btnConfirmarVenta.textContent = 'Procesando...';

            try {
                const selectedCC = metodoPagoSeleccionado === 'CuentaCorriente'
                    ? getCuentaCorrienteActiva() : null;
                if (metodoPagoSeleccionado === 'CuentaCorriente' && !selectedCC) {
                    throw new Error('El cliente ya no está seleccionado.');
                }

                const checkoutFingerprint = JSON.stringify({
                    cajaId: cajaActiva.id,
                    method: metodoPagoSeleccionado,
                    cash: efectivoReal,
                    mp: mpReal,
                    clientId: selectedCC?.id || null,
                    items: carritoActual.map(item => ({
                        id: item.id,
                        cantidad: item.cantidad,
                        precio: item.precio,
                        modoVenta: item.modoVenta || 'unidad',
                        unidadesPorVenta: item.unidadesPorVenta || 1,
                        porcionesTortaEntera: item.porcionesTortaEntera || null
                    }))
                });
                if(pendingCheckout&&pendingCheckout.fingerprint!==checkoutFingerprint)throw new Error('Primero verificá el intento de cobro anterior desde el Mostrador');
                if (!pendingCheckout) {
                    pendingCheckout = {
                        fingerprint: checkoutFingerprint,
                        id: doc(ventasCollection).id
                    };
                }

                const savedCheckout = await savePOSCheckout({
                    db,
                    cajaId: cajaActiva.id,
                    items: carritoActual,
                    products: productosDisponibles,
                    method: metodoPagoSeleccionado,
                    amountCash: efectivoReal,
                    amountMP: mpReal,
                    clientId: selectedCC?.id || null,
                    userId: currentUser.uid,
                    userName,
                    operationId: pendingCheckout.id
                });

                if (mpReal > 0 && savedCheckout?.ventaId) void notifyCommittedEvent(auth, 'mp-sale', savedCheckout.ventaId);
                pendingCheckout = null;
                checkoutInProgress=false;
                carritoActual = [];
                cuentaCorrienteClienteId = null;
                renderizarCarrito();
                actualizarMobileBarVisibility();
                setMobilePOSPanel('productos');
                if (modalCobro) modalCobro.classList.remove('visible');
                btnConfirmarVenta.textContent = 'Confirmar Venta';
                if (buscadorPOS) buscadorPOS.focus();

            } catch (error) {
                console.error("Error al procesar la venta:", error);
                alert(`No se pudo registrar la venta: ${error.message || 'revisá los datos y tu conexión'}. No se modificó la caja ni el saldo si la operación fue rechazada.`);
                checkoutInProgress=false;
                btnConfirmarVenta.disabled = false; btnConfirmarVenta.textContent = 'Confirmar Venta';
                renderSmartTools();
            }
        });
    }

    // ==========================================
    // CIERRE DE CAJA PARA TODOS (CON RESUMEN)
    // ==========================================
    if (btnIniciarCierre) {
        btnIniciarCierre.addEventListener('click', () => {
            if (!cajaActiva) return;
            if(checkoutInProgress||pendingCheckout||carritoActual.length||parked.length){alert('Finalizá las ventas activas y en espera de este dispositivo antes de cerrar la caja.');return;}
            
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
            if(checkoutInProgress||pendingCheckout||carritoActual.length||parked.length){alert('Hay ventas sin finalizar en este dispositivo.');return;}
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
                const closingDrawerId = cajaActiva.id;
                await updateDoc(doc(db, 'cajas', closingDrawerId), cierreData);
                void notifyCommittedEvent(auth, 'drawer-close', closingDrawerId);
                
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
                        ${venta.metodoPago === 'CuentaCorriente'
                            ? '<small>Cuenta corriente · inalterable</small>'
                            : `<button class="btn-editar-ticket-auditoria" data-id="${safeVentaId}" data-total="${venta.total}" data-metodo="${safeMetodoAttr}" style="background:none; border:none; cursor:pointer; font-size: 1.2rem; margin-left:1rem;" title="Editar Método de Pago">✏️</button>`
                        }
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
                    const cajaRef = doc(db, 'cajas', cajaActiva.id);
                    const ticketDoc = await transaction.get(ticketRef);
                    const cajaDoc = await transaction.get(cajaRef);
                    if (!ticketDoc.exists() || !cajaDoc.exists()) throw new Error("Ticket o caja no encontrados.");

                    const tData = ticketDoc.data();
                    if (tData.metodoPago === 'CuentaCorriente') {
                        throw new Error('No se puede cambiar el método de un consumo de cuenta corriente.');
                    }
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

                    const cajaData = cajaDoc.data();
                    const nuevaCajaEfvo = (Number(cajaData.totalEfectivo) || 0) + difEfectivo;
                    const nuevaCajaMP = (Number(cajaData.totalMercadoPago) || 0) + difMP;
                    
                    transaction.update(cajaRef, {
                        totalEfectivo: nuevaCajaEfvo,
                        totalMercadoPago: nuevaCajaMP
                    });

                    // onSnapshot actualiza la caja tras confirmar la transacción.
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
