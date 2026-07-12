import { 
    getFirestore, collection, onSnapshot, query, where, orderBy, doc, 
    addDoc, updateDoc, Timestamp, runTransaction, getDocs, setDoc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

/* ===================================================================== */
/* SERVICIO NIIMBOT PRINTER (Web Bluetooth BLE y Web Serial API USB)     */
/* ===================================================================== */
class NiimbotPrinter {
    constructor() {
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.port = null;
        this.connectionType = null; // 'ble' o 'usb'
        // UUID principal de la Niimbot
        this.SERVICE_UUID = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';
        this.onDisconnectCallback = null;
    }

    async connectBLE() {
        if (!navigator.bluetooth) throw new Error("Web Bluetooth no es compatible en este navegador.");
        
        try {
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'B1' }, { namePrefix: 'B2' }, { namePrefix: 'B3' }, { namePrefix: 'D11' }, { namePrefix: 'NIIMBOT' }],
                optionalServices: [this.SERVICE_UUID]
            });

            this.device.addEventListener('gattserverdisconnected', () => this.disconnect());

            this.server = await this.device.gatt.connect();
            const service = await this.server.getPrimaryService(this.SERVICE_UUID);
            
            // BUSCADOR AUTOMÁTICO DE CANAL DE ESCRITURA:
            const characteristics = await service.getCharacteristics();
            for (let char of characteristics) {
                if (char.properties.write || char.properties.writeWithoutResponse) {
                    this.characteristic = char;
                    break;
                }
            }

            if (!this.characteristic) {
                throw new Error("No se encontró un canal de escritura compatible en esta impresora.");
            }
            
            this.connectionType = 'ble';
            return true;
        } catch (error) {
            console.error("Error BLE:", error);
            throw error;
        }
    }

    async connectUSB() {
        if (!navigator.serial) throw new Error("Web Serial API (USB) no es compatible en este navegador (usá Chrome/Edge en PC).");
        
        try {
            this.port = await navigator.serial.requestPort();
            // Las térmicas suelen usar 115200 de baud rate por defecto
            await this.port.open({ baudRate: 115200 });
            this.connectionType = 'usb';
            return true;
        } catch (error) {
            console.error("Error USB:", error);
            throw error;
        }
    }

    disconnect() {
        if (this.connectionType === 'ble' && this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        if (this.connectionType === 'usb' && this.port) {
            this.port.close();
        }
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.port = null;
        this.connectionType = null;
        if (this.onDisconnectCallback) this.onDisconnectCallback();
    }

    isConnected() {
        return (this.connectionType === 'ble' && this.characteristic) || (this.connectionType === 'usb' && this.port);
    }

    // Calcula el Checksum (XOR estricto Protocolo V4)
    _calculateChecksum(type, cmd, data) {
        let cs = type ^ cmd ^ data.length;
        for (let i = 0; i < data.length; i++) cs ^= data[i];
        return cs;
    }

    _createPacket(type, cmd, data = []) {
        const payload = new Uint8Array(data);
        const buffer = new Uint8Array(payload.length + 7);
        buffer[0] = 0x55;
        buffer[1] = 0x55;
        buffer[2] = type;
        buffer[3] = cmd;
        buffer[4] = payload.length;
        buffer.set(payload, 5);
        buffer[buffer.length - 2] = this._calculateChecksum(type, cmd, payload);
        buffer[buffer.length - 1] = 0xAA;
        return buffer;
    }

    async _sendPacket(type, cmd, data = []) {
        if (!this.isConnected()) throw new Error("Impresora desconectada");
        const packet = this._createPacket(type, cmd, data);
        
        if (this.connectionType === 'ble') {
            // Fragmentar envío BLE (MTU seguro de 20 bytes)
            const chunkSize = 20;
            for (let i = 0; i < packet.length; i += chunkSize) {
                const chunk = packet.slice(i, i + chunkSize);
                await this.characteristic.writeValueWithoutResponse(chunk);
                await new Promise(r => setTimeout(r, 20)); // Aumentado a 20ms para evitar saturación de buffer
            }
        } else if (this.connectionType === 'usb') {
            const writer = this.port.writable.getWriter();
            await writer.write(packet);
            writer.releaseLock();
            await new Promise(r => setTimeout(r, 20));
        }
    }

    async printImage(canvas) {
        if (!this.isConnected()) throw new Error("Conectá la impresora primero (Bluetooth o USB).");

        // willReadFrequently soluciona el warning de la consola en Chrome
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const width = canvas.width;   
        const height = canvas.height; 
        const imgData = ctx.getImageData(0, 0, width, height).data;

        // Comandos de inicialización Niimbot (Protocolo V4 Completo)
        await this._sendPacket(1, 0x01, [0x01]); // Iniciar tarea (1 copia)
        await this._sendPacket(1, 0x13, [0x03]); // Densidad (1 a 5, 3 es medio)
        await this._sendPacket(1, 0x2C, [0x01]); // Tipo papel: Etiqueta normal
        await this._sendPacket(1, 0x03);         // Iniciar Página de Impresión

        for (let y = 0; y < height; y++) {
            const byteWidth = Math.ceil(width / 8); 
            const rowData = new Uint8Array(byteWidth);

            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = imgData[idx];
                const g = imgData[idx + 1];
                const b = imgData[idx + 2];
                const a = imgData[idx + 3];
                // Blanco y negro (Umbral estricto para térmica)
                const isBlack = (r * 0.299 + g * 0.587 + b * 0.114) < 128 && a > 128;
                
                if (isBlack) {
                    rowData[Math.floor(x / 8)] |= (0x80 >> (x % 8));
                }
            }

            const payload = new Uint8Array(rowData.length + 2);
            payload[0] = (y >> 8) & 0xFF; // Fila High Byte
            payload[1] = y & 0xFF;        // Fila Low Byte
            payload.set(rowData, 2);

            await this._sendPacket(2, 0x85, payload);
        }

        await this._sendPacket(1, 0x04); // Fin de Página
        await this._sendPacket(1, 0x02); // Comando de fin de impresión y avance
    }
}

// Instancia global de la impresora
const printer = new NiimbotPrinter();

export function setupPOS(app) {
    const db = getFirestore(app);
    const auth = getAuth(app);
    
    // --- Colecciones principales ---
    const cajasCollection = collection(db, 'cajas');
    const ventasCollection = collection(db, 'ventasMostrador');
    const recetasCollection = collection(db, 'recetas'); 
    const materiasPrimasCollection = collection(db, 'materiasPrimas'); 
    const auditoriaCollection = collection(db, 'auditoriaMostrador');

    // --- Referencias DOM: Vistas de Pantalla ---
    const pantallaApertura = document.getElementById('pantalla-apertura');
    const pantallaPOS = document.getElementById('pantalla-pos');
    const pantallaStock = document.getElementById('pantalla-stock-mostrador');
    const pantallaPromociones = document.getElementById('pantalla-promociones');

    // --- Referencias DOM: Caja y Mostrador ---
    const usuarioNombreEl = document.getElementById('usuario-activo-nombre');
    const fondoCajaInput = document.getElementById('fondo-caja-input');
    const btnAbrirCaja = document.getElementById('btn-abrir-caja');
    const btnIniciarCierre = document.getElementById('btn-iniciar-cierre');
    const listaProductosPOS = document.getElementById('lista-productos-pos');
    const buscadorPOS = document.getElementById('buscador-pos');
    const carritoContainer = document.getElementById('carrito-pos-container');
    const posTotalMonto = document.getElementById('pos-total-monto');
    const btnCobrar = document.getElementById('btn-cobrar');

    const modalCobro = document.getElementById('modal-cobro');
    const modalCobroTotal = document.getElementById('modal-cobro-total');
    const btnPaymentMethods = document.querySelectorAll('.btn-payment');
    const btnCancelarCobro = document.getElementById('btn-cancelar-cobro');
    const btnConfirmarVenta = document.getElementById('btn-confirmar-venta');
    
    const modalCierre = document.getElementById('modal-cierre');
    const cierreFondo = document.getElementById('cierre-fondo');
    const cierreEfectivo = document.getElementById('cierre-efectivo');
    const cierreMP = document.getElementById('cierre-mp');
    const cierreTotalCaja = document.getElementById('cierre-total-caja');
    const btnCancelarCierre = document.getElementById('btn-cancelar-cierre');
    const btnConfirmarCierre = document.getElementById('btn-confirmar-cierre');

    // --- Referencias DOM: Inventario y Reglas ---
    const btnIrStock = document.getElementById('btn-ir-stock');
    const btnVolverMostrador = document.getElementById('btn-volver-mostrador');
    const buscadorInventario = document.getElementById('buscador-inventario');
    const tablaInventario = document.getElementById('tabla-inventario-mostrador');
    const btnDesbloquearAdmin = document.getElementById('btn-desbloquear-admin');
    const btnMargenGlobal = document.getElementById('btn-margen-global');

    // --- Referencias DOM: Promociones e Impresión Bluetooth/USB ---
    const btnIrPromos = document.getElementById('btn-ir-promos');
    const btnVolverMostradorPromos = document.getElementById('btn-volver-mostrador-promos');
    const selectPromoProd = document.getElementById('promo-producto-select');
    const inputPromoTipo = document.getElementById('promo-tipo');
    const inputPromoFrase = document.getElementById('promo-frase');
    const btnImprimirPromo = document.getElementById('btn-imprimir-promo');
    
    const btnConectarNiimbot = document.getElementById('btn-conectar-niimbot');
    const btnConectarUsb = document.getElementById('btn-conectar-usb');
    const btStatusIndicator = document.getElementById('bt-status-indicator');

    // Modales de Stock y Barras
    const modalStock = document.getElementById('modal-stock-detalle');
    const modalProdId = document.getElementById('modal-prod-id');
    const modalProdNombre = document.getElementById('modal-prod-nombre');
    const modalProdGananciaIndiv = document.getElementById('modal-prod-ganancia-indiv');
    const modalProdStockActual = document.getElementById('modal-prod-stock-actual');
    const modalProdTipoMov = document.getElementById('modal-prod-tipo-movimiento');
    const modalProdCantMov = document.getElementById('modal-prod-cantidad-movimiento');
    const modalProdMotivo = document.getElementById('modal-prod-motivo');
    const modalProdAuditoria = document.getElementById('modal-prod-auditoria-logs');
    const btnCancelarStock = document.getElementById('btn-cerrar-modal-stock');
    const btnGuardarStock = document.getElementById('btn-guardar-modal-stock');

    const modalBarcode = document.getElementById('modal-barcode');
    const barcodeTituloProducto = document.getElementById('barcode-titulo-producto');
    const btnCerrarBarcode = document.getElementById('btn-cerrar-barcode');
    const btnImprimirBarcode = document.getElementById('btn-imprimir-barcode');

    // --- Estado General ---
    let currentUser = null;
    let userName = "Usuario Mostrador";
    let cajaActiva = null; 
    let materiasPrimasMap = new Map(); 
    let recetasBrutas = []; 
    let productosDisponibles = []; 
    let carritoActual = [];
    let metodoPagoSeleccionado = null;
    let margenGlobal = 0; 

    const formatMoneda = (val) => `$${(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatFecha = (timestamp) => {
        if (!timestamp) return '';
        const d = timestamp.toDate();
        return d.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
    };

    // --- LÓGICA DE BLUETOOTH / USB UI ---
    if (btnConectarNiimbot) {
        btnConectarNiimbot.addEventListener('click', async () => {
            if (printer.isConnected()) {
                printer.disconnect();
                return;
            }
            try {
                btnConectarNiimbot.textContent = "Conectando...";
                await printer.connectBLE();
                btStatusIndicator.className = "bt-status connected";
                btStatusIndicator.textContent = "🟢 NIIMBOT B1 (BLE)";
                btnConectarNiimbot.textContent = "Desconectar";
                if(btnConectarUsb) btnConectarUsb.style.display = 'none';
                
                printer.onDisconnectCallback = () => {
                    btStatusIndicator.className = "bt-status disconnected";
                    btStatusIndicator.textContent = "🔴 Desconectada";
                    btnConectarNiimbot.textContent = "🔵 Bluetooth";
                    if(btnConectarUsb) btnConectarUsb.style.display = 'inline-block';
                };
            } catch (error) {
                alert("Error conectando a NIIMBOT por Bluetooth: " + error.message);
                btnConectarNiimbot.textContent = "🔵 Bluetooth";
            }
        });
    }

    if (btnConectarUsb) {
        btnConectarUsb.addEventListener('click', async () => {
            if (printer.isConnected()) {
                printer.disconnect();
                return;
            }
            try {
                btnConectarUsb.textContent = "Conectando...";
                await printer.connectUSB();
                btStatusIndicator.className = "bt-status connected";
                btStatusIndicator.textContent = "🟢 NIIMBOT B1 (USB)";
                btnConectarUsb.textContent = "Desconectar";
                if(btnConectarNiimbot) btnConectarNiimbot.style.display = 'none';
                
                printer.onDisconnectCallback = () => {
                    btStatusIndicator.className = "bt-status disconnected";
                    btStatusIndicator.textContent = "🔴 Desconectada";
                    btnConectarUsb.textContent = "🔌 USB";
                    if(btnConectarNiimbot) btnConectarNiimbot.style.display = 'inline-block';
                };
            } catch (error) {
                alert("Error conectando a NIIMBOT por USB: " + error.message);
                btnConectarUsb.textContent = "🔌 USB";
            }
        });
    }

    // --- CÁLCULO DE PRECIOS Y COSTOS ---
    const obtenerCostoBase = (receta) => {
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
        return costo * (1 + (margenAplicado / 100));
    };

    // --- CONFIGURACIÓN GLOBAL ---
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
            } else if (pass !== null) alert("Contraseña incorrecta.");
        });
    }

    if (btnMargenGlobal) {
        btnMargenGlobal.addEventListener('click', async () => {
            const nuevoMargen = prompt("Defina el nuevo porcentaje de Margen de Ganancia Global (%):", margenGlobal);
            if (nuevoMargen !== null && nuevoMargen.trim() !== "") {
                const margenNum = parseFloat(nuevoMargen);
                if (isNaN(margenNum) || margenNum < 0) return alert("Porcentaje inválido.");
                try { await setDoc(doc(db, 'config', 'mostrador'), { margenGlobal: margenNum }); } catch (e) {}
            }
        });
    }

    // --- AUTENTICACIÓN Y TURNOS DE CAJA ---
    onAuthStateChanged(auth, user => {
        if (user) {
            currentUser = user;
            userName = user.displayName || user.email || `Vendedor ${user.uid.substring(0,4)}`;
            if (usuarioNombreEl) usuarioNombreEl.textContent = userName;
            verificarCajaAbierta();
        } else {
            signInAnonymously(auth);
        }
    });

    const verificarCajaAbierta = () => {
        const q = query(cajasCollection, where('usuarioId', '==', currentUser.uid), where('estado', '==', 'abierta'));
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
                cargarDataYCostos();
            } else {
                cajaActiva = null;
                if (pantallaPOS) pantallaPOS.style.display = 'none';
                if (pantallaStock) pantallaStock.style.display = 'none';
                if (pantallaPromociones) pantallaPromociones.style.display = 'none';
                if (pantallaApertura) pantallaApertura.style.display = 'block';
            }
        });
    };

    if (btnAbrirCaja) {
        btnAbrirCaja.addEventListener('click', async () => {
            const fondo = parseFloat(fondoCajaInput.value) || 0;
            try {
                btnAbrirCaja.disabled = true;
                await addDoc(cajasCollection, {
                    usuarioId: currentUser.uid,
                    usuarioNombre: userName,
                    fechaApertura: Timestamp.now(),
                    fondoInicial: fondo,
                    totalEfectivo: 0,
                    totalMercadoPago: 0,
                    estado: 'abierta'
                });
                if(fondoCajaInput) fondoCajaInput.value = '';
                btnAbrirCaja.disabled = false;
            } catch (e) {
                console.error("Error al abrir caja:", e);
                alert("No se pudo iniciar el turno de caja.");
                btnAbrirCaja.disabled = false;
            }
        });
    }

    // --- CONTROL DE NAVEGACIÓN ---
    if (btnIrStock) {
        btnIrStock.addEventListener('click', () => {
            pantallaPOS.style.display = 'none';
            if(pantallaPromociones) pantallaPromociones.style.display = 'none';
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
            if(pantallaPromociones) pantallaPromociones.style.display = 'none';
            pantallaPOS.style.display = 'grid';
            procesarYRenderizar();
            if (buscadorPOS) buscadorPOS.focus();
        });
    }

    if (btnVolverMostradorPromos) {
        btnVolverMostradorPromos.addEventListener('click', () => {
            if(pantallaPromociones) pantallaPromociones.style.display = 'none';
            pantallaPOS.style.display = 'grid';
            if (buscadorPOS) buscadorPOS.focus();
        });
    }

    // --- OBTENCIÓN DE DATOS REAL-TIME ---
    const cargarDataYCostos = () => {
        onSnapshot(materiasPrimasCollection, (snapshot) => {
            materiasPrimasMap.clear();
            snapshot.forEach(doc => materiasPrimasMap.set(doc.id, doc.data()));
            procesarYRenderizar();
        });

        onSnapshot(query(recetasCollection, orderBy('nombreTorta')), (snapshot) => {
            recetasBrutas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            procesarYRenderizar();
        });
    };

    const procesarYRenderizar = () => {
        if (recetasBrutas.length === 0) return;

        productosDisponibles = recetasBrutas.map(receta => {
            const costoBase = obtenerCostoBase(receta);
            return { ...receta, costoBaseCalculado: costoBase };
        });

        if (pantallaPOS && pantallaPOS.style.display !== 'none') {
            renderizarProductosPOS(productosDisponibles);
        } 
        if (pantallaStock && pantallaStock.style.display !== 'none') {
            renderizarInventario(productosDisponibles);
        }
    };

    // ==========================================
    // 3.5. IMPRESIÓN DE PROMOCIONES POR BLUETOOTH / USB
    // ==========================================
    if (btnImprimirPromo) {
        btnImprimirPromo.addEventListener('click', async () => {
            if (!printer.isConnected()) {
                alert("Por favor, conectá la impresora NIIMBOT usando el botón 'Bluetooth' o 'USB' arriba.");
                return;
            }

            const tipo = inputPromoTipo ? (inputPromoTipo.value || 'OFERTA') : 'OFERTA';
            const prod = selectPromoProd ? selectPromoProd.value : '';
            const frase = inputPromoFrase ? (inputPromoFrase.value || '') : '';
            
            // Dibujar la promo dinámicamente en el canvas oculto
            const canvas = document.getElementById('promo-canvas-print');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            
            // Fondo blanco
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Borde grueso
            ctx.strokeStyle = "black";
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

            // Textos centrados
            ctx.textAlign = "center";
            ctx.fillStyle = "black";
            
            ctx.font = "bold 60px sans-serif";
            ctx.fillText(tipo.toUpperCase(), canvas.width / 2, 80);
            
            ctx.font = "bold 35px sans-serif";
            ctx.fillText(prod, canvas.width / 2, 140);
            
            ctx.font = "25px sans-serif";
            ctx.fillText(frase, canvas.width / 2, 200);

            try {
                btnImprimirPromo.disabled = true;
                btnImprimirPromo.textContent = "Enviando señal...";
                await printer.printImage(canvas);
                btnImprimirPromo.textContent = "🖨️ Imprimir Promo en NIIMBOT";
                btnImprimirPromo.disabled = false;
            } catch (err) {
                alert("Fallo la impresión: " + err.message);
                btnImprimirPromo.textContent = "🖨️ Imprimir Promo en NIIMBOT";
                btnImprimirPromo.disabled = false;
            }
        });
    }

    // ==========================================
    // 4. LOGICA DE CONTROL DE STOCK E INVENTARIO
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
            const categoria = prod.categoria || 'Sin Categoría';
            
            const tieneMargenIndiv = prod.margenIndividual !== undefined && prod.margenIndividual !== null && prod.margenIndividual !== '';
            const margenMostrado = tieneMargenIndiv ? parseFloat(prod.margenIndividual) : margenGlobal;
            const tipoMargenTexto = tieneMargenIndiv ? '(Indiv)' : '(Global)';
            
            const precioVentaCalculado = calcularPrecioVenta(prod);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Categoría"><span class="categoria-tag">${categoria}</span></td>
                <td data-label="Producto"><strong>${prod.nombreTorta}</strong></td>
                <td data-label="Costo Base">${formatMoneda(costo)}</td>
                <td class="admin-only" data-label="% Ganancia">${margenMostrado}% <small style="color:var(--text-light);">${tipoMargenTexto}</small></td>
                <td data-label="Precio Venta" style="font-weight: bold; color: var(--primary-color);">${formatMoneda(precioVentaCalculado)}</td>
                <td data-label="Stock" style="text-align: center; color: ${stock > 0 ? 'var(--text-main)' : 'var(--danger-color)'}">
                    <strong>${stock}</strong> u.
                </td>
                <td data-label="Acciones" style="text-align: center;">
                    <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
                        <button class="btn-primary btn-editar-prod" data-id="${prod.id}" style="padding: 0.3rem 0.6rem; width: auto; font-size: 0.85rem;" title="Ajustar Stock y Auditoría">📝 Stock</button>
                        <button class="btn-secondary btn-ver-barcode" data-id="${prod.id}" style="padding: 0.3rem 0.6rem; width: auto; font-size: 0.85rem;" title="Imprimir Código de Barras">🖨️ Barras</button>
                        <button class="btn-secondary btn-editar-margen admin-only" data-id="${prod.id}" style="padding: 0.3rem 0.6rem; width: auto; font-size: 0.85rem; border-color: #6366f1; color: #6366f1;" title="Modificar % Individual">⚙️ %</button>
                    </div>
                </td>
            `;
            tablaInventario.appendChild(tr);
        });
    };

    if (buscadorInventario) {
        buscadorInventario.addEventListener('input', (e) => {
            const termino = e.target.value.toLowerCase();
            const filtrados = productosDisponibles.filter(p => 
                (p.nombreTorta && p.nombreTorta.toLowerCase().includes(termino)) || 
                (p.categoria && p.categoria.toLowerCase().includes(termino))
            );
            renderizarInventario(filtrados);
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
                        // CREACIÓN MATEMÁTICA DEL EAN-13 REAL
                        let num12 = String(Date.now()).substring(0, 12); 
                        let sum = 0;
                        for(let i = 0; i < 12; i++) {
                            sum += parseInt(num12[i]) * (i % 2 === 1 ? 3 : 1);
                        }
                        let checkDigit = (10 - (sum % 10)) % 10;
                        const nuevoCodigo = num12 + String(checkDigit); 
                        
                        try {
                            await updateDoc(doc(db, 'recetas', prod.id), { codigoBarras: nuevoCodigo });
                            prod.codigoBarras = nuevoCodigo; 
                        } catch(error) {
                            console.error("Error al asignar código de barras en Firebase:", error);
                        }
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
                    const nuevo = prompt(`Ingrese el % de ganancia para "${prod.nombreTorta}"\n(Deje el campo vacío si quiere volver a usar el % Global):`, actual);
                    
                    if (nuevo !== null) {
                        try {
                            const docRef = doc(db, 'recetas', prod.id);
                            if (nuevo.trim() === '') {
                                await updateDoc(docRef, { margenIndividual: null });
                            } else {
                                const val = parseFloat(nuevo);
                                if (!isNaN(val) && val >= 0) {
                                    await updateDoc(docRef, { margenIndividual: val });
                                } else {
                                    alert("Por favor ingrese un número válido mayor o igual a 0.");
                                }
                            }
                        } catch (error) {
                            alert("Error al actualizar el margen individual.");
                        }
                    }
                }
            }
        });
    }

    // --- Modal Código de Barras 1D y ENVÍO BLE/USB ---
    const abrirModalBarcode = (prod) => {
        if(barcodeTituloProducto) barcodeTituloProducto.textContent = prod.nombreTorta;
        
        const canvasPrint = document.getElementById("niimbot-canvas-print");
        const ctx = canvasPrint.getContext("2d", { willReadFrequently: true });
        
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvasPrint.width, canvasPrint.height);
        
        ctx.fillStyle = "black";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(prod.nombreTorta, canvasPrint.width / 2, 35);
        
        try {
            JsBarcode(canvasPrint, prod.codigoBarras, {
                format: "EAN13",
                lineColor: "#000",
                width: 2.5,
                height: 120,
                displayValue: true, 
                fontSize: 22,
                margin: 10,
                marginTop: 50 
            });
            if(modalBarcode) modalBarcode.classList.add('visible');
        } catch(e) {
            JsBarcode(canvasPrint, prod.codigoBarras, {
                format: "CODE128",
                lineColor: "#000",
                width: 2,
                height: 120,
                displayValue: true, 
                fontSize: 20,
                margin: 10,
                marginTop: 50
            });
            if(modalBarcode) modalBarcode.classList.add('visible');
        }
    };

    if (btnCerrarBarcode) {
        btnCerrarBarcode.addEventListener('click', () => modalBarcode.classList.remove('visible'));
    }

    if (btnImprimirBarcode) {
        btnImprimirBarcode.addEventListener('click', async () => {
            if (!printer.isConnected()) {
                alert("Por favor, conectá la impresora NIIMBOT usando el botón Bluetooth o USB de la cabecera.");
                return;
            }
            try {
                btnImprimirBarcode.disabled = true;
                btnImprimirBarcode.textContent = "Enviando datos...";
                const canvas = document.getElementById("niimbot-canvas-print");
                await printer.printImage(canvas);
                btnImprimirBarcode.textContent = "🖨️ Enviar a Impresora";
                btnImprimirBarcode.disabled = false;
            } catch (err) {
                alert("Error al imprimir: " + err.message);
                btnImprimirBarcode.textContent = "🖨️ Enviar a Impresora";
                btnImprimirBarcode.disabled = false;
            }
        });
    }

    // --- Modal Ajuste de Stock ---
    const abrirModalStock = async (prod) => {
        modalProdId.value = prod.id;
        modalProdNombre.value = prod.nombreTorta;
        if(modalProdGananciaIndiv) modalProdGananciaIndiv.value = prod.margenIndividual !== undefined && prod.margenIndividual !== null ? prod.margenIndividual : '';
        modalProdStockActual.textContent = prod.stockMostrador || '0';
        modalProdCantMov.value = '0';
        modalProdMotivo.value = '';
        modalProdAuditoria.innerHTML = '<p class="text-light" style="text-align:center;">Cargando historial...</p>';

        await cargarAuditoriaProducto(prod.id);
        modalStock.classList.add('visible');
    };

    const cargarAuditoriaProducto = async (productoId) => {
        try {
            const q = query(auditoriaCollection, where('productoId', '==', productoId), orderBy('fecha', 'desc'));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                modalProdAuditoria.innerHTML = '<p class="text-light" style="font-size: 0.85rem; text-align: center;">Sin movimientos registrados.</p>';
                return;
            }

            modalProdAuditoria.innerHTML = '';
            querySnapshot.forEach(docSnap => {
                const log = docSnap.data();
                const logDiv = document.createElement('div');
                logDiv.className = 'log-item';
                
                let tipoSpan = '';
                if (log.tipo === 'SUMA') tipoSpan = `<span class="log-tipo-sumar">[+${log.cantidad}]</span>`;
                else if (log.tipo === 'RESTA') tipoSpan = `<span class="log-tipo-restar">[-${log.cantidad}]</span>`;

                logDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.2rem;">
                        <span>${tipoSpan} ${log.motivo || 'Ajuste de inventario'}</span>
                        <span style="color: var(--text-light); font-size: 0.75rem;">${formatFecha(log.fecha)}</span>
                    </div>
                    <div style="color: var(--text-light); font-size: 0.75rem;">👤 ${log.usuario} | Stock resultante: ${log.stockResultante}</div>
                `;
                modalProdAuditoria.appendChild(logDiv);
            });
        } catch (error) {
            console.error("Error cargando logs auditoria:", error);
            modalProdAuditoria.innerHTML = '<p class="text-light" style="text-align:center;">Error al cargar historial.</p>';
        }
    };

    if (btnCancelarStock) {
        btnCancelarStock.addEventListener('click', () => modalStock.classList.remove('visible'));
    }

    if (btnGuardarStock) {
        btnGuardarStock.addEventListener('click', async () => {
            const id = modalProdId.value;
            const nombre = modalProdNombre.value;
            const tipoMov = modalProdTipoMov.value;
            const cantMov = parseInt(modalProdCantMov.value) || 0;
            const motivo = modalProdMotivo.value.trim();

            btnGuardarStock.disabled = true;
            btnGuardarStock.textContent = 'Guardando...';

            try {
                const docRef = doc(db, 'recetas', id);
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(docRef);
                    if (!sfDoc.exists()) throw "Producto no existe";
                    
                    let stockActual = sfDoc.data().stockMostrador || 0;
                    let nuevoStock = stockActual;
                    let movimientoRegistrado = false;

                    if (cantMov > 0) {
                        if (tipoMov === 'SUMAR') {
                            nuevoStock = stockActual + cantMov;
                        } else {
                            nuevoStock = stockActual - cantMov;
                            if (nuevoStock < 0) nuevoStock = 0; 
                        }
                        movimientoRegistrado = true;
                    }

                    const updates = { stockMostrador: nuevoStock };
                    
                    if (document.body.classList.contains('admin-open') && modalProdGananciaIndiv) {
                        const gananciaIndivRaw = modalProdGananciaIndiv.value.trim();
                        updates.margenIndividual = gananciaIndivRaw === "" ? null : parseFloat(gananciaIndivRaw);
                    }

                    transaction.update(docRef, updates);

                    if (movimientoRegistrado) {
                        const auditRef = doc(auditoriaCollection); 
                        transaction.set(auditRef, {
                            productoId: id,
                            productoNombre: nombre,
                            tipo: tipoMov === 'SUMAR' ? 'SUMA' : 'RESTA',
                            cantidad: cantMov,
                            stockResultante: nuevoStock,
                            motivo: motivo || (tipoMov === 'SUMAR' ? 'Ingreso manual' : 'Egreso manual'),
                            usuario: userName,
                            usuarioId: currentUser.uid,
                            fecha: Timestamp.now()
                        });
                    }
                });
                
                modalStock.classList.remove('visible');
            } catch (error) {
                console.error("Error al actualizar la ficha del producto:", error);
                alert("Hubo un error al guardar los cambios.");
            }

            btnGuardarStock.disabled = false;
            btnGuardarStock.textContent = 'Guardar Cambios';
        });
    }

    // ==========================================
    // 5. CAJA REGISTRADORA (ESCANER BARRAS Y BÚSQUEDA)
    // ==========================================
    const renderizarProductosPOS = (productos) => {
        if (!listaProductosPOS) return;
        listaProductosPOS.innerHTML = '';
        
        productos.forEach(prod => {
            const stock = prod.stockMostrador || 0;
            const precioCalculado = calcularPrecioVenta(prod);
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Producto"><strong>${prod.nombreTorta}</strong></td>
                <td data-label="Stock" style="color: ${stock > 0 ? 'var(--text-main)' : 'var(--danger-color)'}">${stock} u.</td>
                <td data-label="Precio" style="color: var(--primary-color); font-weight: 500;">${formatMoneda(precioCalculado)}</td>
                <td data-label="Cantidad" style="text-align: center;">
                    <div style="display: flex; gap: 5px; align-items: center; justify-content: center;">
                        <input type="number" min="1" max="${stock}" value="1" class="producto-cantidad-input" id="cant-${prod.id}" ${stock <= 0 ? 'disabled' : ''} style="padding: 0.3rem; border: 1px solid var(--border-color); border-radius: 4px;">
                        <button class="btn-primary btn-add-cart" data-id="${prod.id}" style="padding: 0.3rem 0.6rem; width: auto; font-size: 0.9rem;" ${stock <= 0 ? 'disabled' : ''} title="Agregar">+</button>
                    </div>
                </td>
            `;
            listaProductosPOS.appendChild(tr);
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
            const precioCalculado = calcularPrecioVenta(prod);
            carritoActual.push({ 
                id: prod.id, 
                nombre: prod.nombreTorta, 
                precio: precioCalculado, 
                cantidad: cantidadIngresada 
            });
        }
        renderizarCarrito();
    };

    if (buscadorPOS) {
        buscadorPOS.addEventListener('input', (e) => {
            const termino = e.target.value.toLowerCase();
            const filtrados = productosDisponibles.filter(p => 
                (p.nombreTorta && p.nombreTorta.toLowerCase().includes(termino)) ||
                (p.codigoBarras && String(p.codigoBarras).includes(termino))
            );
            renderizarProductosPOS(filtrados);
        });

        buscadorPOS.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
            }
        });
    }

    let scanBuffer = '';
    let lastKeyTime = Date.now();

    document.addEventListener('keydown', (e) => {
        if (pantallaPOS && pantallaPOS.style.display === 'none') return;
        
        if (e.key.length > 1 && e.key !== 'Enter') return;

        const currentTime = Date.now();
        if (currentTime - lastKeyTime > 50) {
            scanBuffer = '';
        }
        lastKeyTime = currentTime;

        if (e.key === 'Enter' || e.keyCode === 13) {
            if (scanBuffer.length >= 8) { 
                e.preventDefault();
                const codigoEscaneado = scanBuffer.trim();
                
                const productoEncontrado = productosDisponibles.find(p => 
                    p.codigoBarras && String(p.codigoBarras) === codigoEscaneado
                );
                
                if (productoEncontrado) {
                    agregarProductoAlCarrito(productoEncontrado, 1);
                } else {
                    alert("El código escaneado (" + codigoEscaneado + ") no existe en el sistema.");
                }

                scanBuffer = '';
                if (buscadorPOS) buscadorPOS.value = '';
                renderizarProductosPOS(productosDisponibles); 
            }
        } else {
            scanBuffer += e.key;
        }
    });

    if (listaProductosPOS) {
        listaProductosPOS.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-add-cart');
            if (btn) {
                const id = btn.dataset.id;
                const inputCant = document.getElementById(`cant-${id}`);
                const cantidad = parseInt(inputCant.value) || 1;
                
                const prod = productosDisponibles.find(p => p.id === id);
                if (prod) {
                    agregarProductoAlCarrito(prod, cantidad);
                    if(inputCant) inputCant.value = 1;
                }
            }
        });
    }

    const renderizarCarrito = () => {
        if (!carritoContainer) return;
        carritoContainer.innerHTML = '';
        if (carritoActual.length === 0) {
            carritoContainer.innerHTML = '<p class="text-light" style="text-align: center; margin-top: 2rem;">No hay productos en la venta actual.</p>';
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
                        <input type="number" min="1" class="cart-item-cantidad" data-index="${index}" value="${item.cantidad}">
                        <span class="cart-item-precio-unit">x ${formatMoneda(item.precio)}</span>
                    </div>
                </div>
                <div class="cart-item-total">${formatMoneda(subtotal)}</div>
                <button class="btn-remove-cart" data-index="${index}" style="background:none; border:none; color:var(--danger-color); cursor:pointer; font-size:1.2rem;">🗑️</button>
            `;
            carritoContainer.appendChild(div);
        });

        if (posTotalMonto) posTotalMonto.textContent = formatMoneda(total);
        if (modalCobroTotal) modalCobroTotal.textContent = formatMoneda(total);
        if (btnCobrar) btnCobrar.disabled = false;
    };

    if (carritoContainer) {
        carritoContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-remove-cart');
            if (btn) {
                const index = parseInt(btn.dataset.index);
                carritoActual.splice(index, 1);
                renderizarCarrito();
            }
        });

        carritoContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('cart-item-cantidad')) {
                const index = parseInt(e.target.dataset.index);
                let nuevaCantidad = parseInt(e.target.value);
                
                if (isNaN(nuevaCantidad) || nuevaCantidad < 1) {
                    nuevaCantidad = 1;
                    e.target.value = 1;
                }

                const item = carritoActual[index];
                const prod = productosDisponibles.find(p => p.id === item.id);
                const stockMax = prod ? (prod.stockMostrador || 0) : 0;

                if (nuevaCantidad > stockMax) {
                    alert(`Solo hay ${stockMax} unidades en stock de ${item.nombre}.`);
                    e.target.value = item.cantidad; 
                    return;
                }

                carritoActual[index].cantidad = nuevaCantidad;
                renderizarCarrito();
            }
        });
    }

    // ==========================================
    // 6. PROCESAMIENTO DE TRANSACCIONES Y CIERRES
    // ==========================================
    if (btnCobrar) {
        btnCobrar.addEventListener('click', () => {
            metodoPagoSeleccionado = null;
            btnPaymentMethods.forEach(b => b.classList.remove('selected'));
            btnConfirmarVenta.disabled = true;
            modalCobro.classList.add('visible');
        });
    }

    if (btnCancelarCobro) btnCancelarCobro.addEventListener('click', () => modalCobro.classList.remove('visible'));

    btnPaymentMethods.forEach(btn => {
        btn.addEventListener('click', () => {
            btnPaymentMethods.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            metodoPagoSeleccionado = btn.dataset.metodo;
            btnConfirmarVenta.disabled = false;
        });
    });

    if (btnConfirmarVenta) {
        btnConfirmarVenta.addEventListener('click', async () => {
            if (!metodoPagoSeleccionado || carritoActual.length === 0 || !cajaActiva) return;

            btnConfirmarVenta.disabled = true;
            btnConfirmarVenta.textContent = 'Procesando...';

            try {
                let totalVenta = 0;
                const itemsParaGuardar = carritoActual.map(i => {
                    totalVenta += (i.precio * i.cantidad);
                    return { id: i.id, nombre: i.nombre, precio: i.precio, cantidad: i.cantidad };
                });

                for (const item of carritoActual) {
                    const docRef = doc(db, 'recetas', item.id);
                    await runTransaction(db, async (transaction) => {
                        const sfDoc = await transaction.get(docRef);
                        if (!sfDoc.exists()) throw "El producto no existe.";
                        
                        const stockActual = sfDoc.data().stockMostrador || 0;
                        let nuevoStock = stockActual - item.cantidad;
                        if (nuevoStock < 0) nuevoStock = 0;
                        
                        transaction.update(docRef, { stockMostrador: nuevoStock });

                        const auditRef = doc(auditoriaCollection);
                        transaction.set(auditRef, {
                            productoId: item.id,
                            productoNombre: item.nombre,
                            tipo: 'RESTA',
                            cantidad: item.cantidad,
                            stockResultante: nuevoStock,
                            motivo: `Venta Mostrador (${metodoPagoSeleccionado})`,
                            usuario: userName,
                            usuarioId: currentUser.uid,
                            fecha: Timestamp.now()
                        });
                    });
                }

                await addDoc(ventasCollection, {
                    cajaId: cajaActiva.id,
                    fecha: Timestamp.now(),
                    metodoPago: metodoPagoSeleccionado,
                    total: totalVenta,
                    items: itemsParaGuardar,
                    vendedor: userName
                });

                const cajaRef = doc(db, 'cajas', cajaActiva.id);
                const actualizacionCaja = {};
                if (metodoPagoSeleccionado === 'Efectivo') {
                    actualizacionCaja.totalEfectivo = (cajaActiva.totalEfectivo || 0) + totalVenta;
                } else {
                    actualizacionCaja.totalMercadoPago = (cajaActiva.totalMercadoPago || 0) + totalVenta;
                }
                await updateDoc(cajaRef, actualizacionCaja);

                carritoActual = [];
                renderizarCarrito();
                modalCobro.classList.remove('visible');
                btnConfirmarVenta.textContent = 'Confirmar';
                
                if (buscadorPOS) buscadorPOS.focus();

            } catch (error) {
                console.error("Error al procesar la venta:", error);
                alert("Hubo un error de red al procesar el cobro.");
                btnConfirmarVenta.disabled = false;
                btnConfirmarVenta.textContent = 'Confirmar';
            }
        });
    }

    if (btnIniciarCierre) {
        btnIniciarCierre.addEventListener('click', () => {
            if (!cajaActiva) return;
            const fondo = cajaActiva.fondoInicial || 0;
            const efvo = cajaActiva.totalEfectivo || 0;
            const mp = cajaActiva.totalMercadoPago || 0;

            if (cierreFondo) cierreFondo.textContent = formatMoneda(fondo);
            if (cierreEfectivo) cierreEfectivo.textContent = formatMoneda(efvo);
            if (cierreMP) cierreMP.textContent = formatMoneda(mp);
            if (cierreTotalCaja) cierreTotalCaja.textContent = formatMoneda(fondo + efvo);

            modalCierre.classList.add('visible');
        });
    }

    if (btnCancelarCierre) btnCancelarCierre.addEventListener('click', () => modalCierre.classList.remove('visible'));

    if (btnConfirmarCierre) {
        btnConfirmarCierre.addEventListener('click', async () => {
            if (!cajaActiva) return;
            btnConfirmarCierre.disabled = true;
            btnConfirmarCierre.textContent = 'Cerrando...';

            try {
                await updateDoc(doc(db, 'cajas', cajaActiva.id), {
                    estado: 'cerrada',
                    fechaCierre: Timestamp.now()
                });
                modalCierre.classList.remove('visible');
                btnConfirmarCierre.disabled = false;
                btnConfirmarCierre.textContent = 'Cerrar Turno';
            } catch (error) {
                console.error("Error cerrando caja de forma definitiva:", error);
                alert("No se pudo efectuar el cierre.");
                btnConfirmarCierre.disabled = false;
                btnConfirmarCierre.textContent = 'Cerrar Turno';
            }
        });
    }
}
