import { 
    getFirestore, collection, onSnapshot, query, where, orderBy, doc, 
    addDoc, updateDoc, Timestamp, runTransaction, getDocs, setDoc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

export function setupPOS(app) {
    const db = getFirestore(app);
    const auth = getAuth(app);
    
    // Colecciones principales de la App
    const cajasCollection = collection(db, 'cajas');
    const ventasCollection = collection(db, 'ventasMostrador');
    const recetasCollection = collection(db, 'recetas'); 
    const materiasPrimasCollection = collection(db, 'materiasPrimas'); 
    const auditoriaCollection = collection(db, 'auditoriaMostrador');

    // --- Referencias DOM ---
    const pantallaApertura = document.getElementById('pantalla-apertura');
    const pantallaPOS = document.getElementById('pantalla-pos');
    const pantallaStock = document.getElementById('pantalla-stock-mostrador');
    const pantallaPromociones = document.getElementById('pantalla-promociones');

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

    // Modales Stock / Lotes
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

    // Modales Barras (con Fechas)
    const modalBarcode = document.getElementById('modal-barcode');
    const barcodeInputElab = document.getElementById('barcode-input-elab');
    const barcodeInputVto = document.getElementById('barcode-input-vto');
    const btnCerrarBarcode = document.getElementById('btn-cerrar-barcode');
    const btnDescargarBarcode = document.getElementById('btn-descargar-barcode');

    // --- Estado General de la Aplicación ---
    let currentUser = null;
    let userName = "Usuario Mostrador";
    let cajaActiva = null; 
    let materiasPrimasMap = new Map(); 
    let recetasBrutas = []; 
    let productosDisponibles = []; 
    let carritoActual = [];
    let metodoPagoSeleccionado = null;
    let margenGlobal = 0; 
    let currentBarcodeProduct = null; // Para redibujar etiqueta cuando cambian las fechas

    // Métodos Helpers
    const formatMoneda = (val) => `$${(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatFecha = (timestamp) => {
        if (!timestamp) return '';
        const d = timestamp.toDate();
        return d.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
    };
    
    // Devuelve fecha en formato YYYY-MM-DD
    const dateToYMD = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

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
                if (fondoCajaInput) fondoCajaInput.value = '';
                btnAbrirCaja.disabled = false;
            } catch (e) {
                console.error("Error al abrir caja:", e);
                btnAbrirCaja.disabled = false;
            }
        });
    }

    // --- CONTROL DE NAVEGACIÓN ---
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
    // 3.5. DESCARGA DE ETIQUETA PROMOCIONAL (50x30)
    // ==========================================
    if (btnDescargarPromo) {
        btnDescargarPromo.addEventListener('click', () => {
            const tipo = inputPromoTipo ? (inputPromoTipo.value || 'OFERTA') : 'OFERTA';
            const prod = selectPromoProd ? selectPromoProd.value : '';
            const frase = inputPromoFrase ? (inputPromoFrase.value || '') : '';
            
            const canvas = document.getElementById('promo-canvas-descarga');
            canvas.width = 400;  
            canvas.height = 240; 
            const ctx = canvas.getContext('2d');
            
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.strokeStyle = "black";
            ctx.lineWidth = 6;
            ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

            ctx.textAlign = "center";
            ctx.fillStyle = "black";
            
            ctx.font = "bold 60px sans-serif";
            ctx.fillText(tipo.toUpperCase(), canvas.width / 2, 85);
            
            let fontSize = 36;
            ctx.font = `bold ${fontSize}px sans-serif`;
            while (ctx.measureText(prod).width > 380 && fontSize > 16) {
                fontSize -= 2;
                ctx.font = `bold ${fontSize}px sans-serif`;
            }
            ctx.fillText(prod, canvas.width / 2, 145);
            
            ctx.font = "bold 24px sans-serif";
            ctx.fillText(frase, canvas.width / 2, 205);

            const link = document.createElement('a');
            link.download = `Promo-${tipo}-${prod.substring(0,10)}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
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
                            console.error("Error al asignar código de barras:", error);
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

    // --- Modales de Fechas en Lotes ---
    if (modalProdTipoMov) {
        modalProdTipoMov.addEventListener('change', (e) => {
            if (e.target.value === 'SUMAR') {
                loteFieldsContainer.style.display = 'flex';
            } else {
                loteFieldsContainer.style.display = 'none';
            }
        });
    }

    // --- Modal Ajuste de Stock ---
    const abrirModalStock = async (prod) => {
        modalProdId.value = prod.id;
        modalProdNombre.value = prod.nombreTorta;
        if(modalProdGananciaIndiv) modalProdGananciaIndiv.value = prod.margenIndividual !== undefined && prod.margenIndividual !== null ? prod.margenIndividual : '';
        modalProdStockActual.textContent = prod.stockMostrador || '0';
        
        modalProdTipoMov.value = 'SUMAR';
        loteFieldsContainer.style.display = 'flex'; // Sumar por defecto muestra lotes
        modalProdCantMov.value = '0';
        modalProdMotivo.value = '';
        
        // Fechas por defecto: Elaboración Hoy, Vto en 15 días
        const hoy = new Date();
        modalProdLoteElab.value = dateToYMD(hoy);
        
        const vto = new Date();
        vto.setDate(vto.getDate() + 15);
        modalProdLoteVto.value = dateToYMD(vto);

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

                // Agregar info de lote si existe en el log
                let infoLote = '';
                if (log.loteVto) {
                    infoLote = ` (Vto: ${log.loteVto})`;
                }

                logDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.2rem;">
                        <span>${tipoSpan} ${log.motivo || 'Ajuste'}${infoLote}</span>
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
            const fElab = modalProdLoteElab.value;
            const fVto = modalProdLoteVto.value;

            if (cantMov <= 0) {
                alert("Ingrese una cantidad válida a mover.");
                return;
            }

            btnGuardarStock.disabled = true;
            btnGuardarStock.textContent = 'Guardando...';

            try {
                const docRef = doc(db, 'recetas', id);
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(docRef);
                    if (!sfDoc.exists()) throw "Producto no existe";
                    
                    let stockActual = sfDoc.data().stockMostrador || 0;
                    let lotesActuales = sfDoc.data().lotes || [];
                    let nuevoStock = stockActual;

                    if (tipoMov === 'SUMAR') {
                        // Creamos un lote nuevo
                        nuevoStock = stockActual + cantMov;
                        lotesActuales.push({
                            idLote: Date.now().toString(),
                            cantidad: cantMov,
                            fechaElab: fElab,
                            fechaVto: fVto
                        });
                    } else {
                        // Lógica FIFO / PEPS (Quitar de los más viejos primero)
                        nuevoStock = stockActual - cantMov;
                        if (nuevoStock < 0) nuevoStock = 0;
                        
                        let qtyToDeduct = cantMov;
                        // Ordenar por fechaVto (del más viejo al más nuevo)
                        lotesActuales.sort((a, b) => new Date(a.fechaVto) - new Date(b.fechaVto));
                        
                        let nuevosLotesPostResta = [];
                        for (let lote of lotesActuales) {
                            if (qtyToDeduct > 0) {
                                if (lote.cantidad <= qtyToDeduct) {
                                    qtyToDeduct -= lote.cantidad;
                                    // Lote consumido entero, no se pushea
                                } else {
                                    lote.cantidad -= qtyToDeduct;
                                    qtyToDeduct = 0;
                                    nuevosLotesPostResta.push(lote);
                                }
                            } else {
                                nuevosLotesPostResta.push(lote);
                            }
                        }
                        lotesActuales = nuevosLotesPostResta;
                    }

                    const updates = { 
                        stockMostrador: nuevoStock,
                        lotes: lotesActuales
                    };
                    
                    if (document.body.classList.contains('admin-open') && modalProdGananciaIndiv) {
                        const gananciaIndivRaw = modalProdGananciaIndiv.value.trim();
                        updates.margenIndividual = gananciaIndivRaw === "" ? null : parseFloat(gananciaIndivRaw);
                    }

                    transaction.update(docRef, updates);

                    // Guardar Log
                    const auditRef = doc(auditoriaCollection); 
                    transaction.set(auditRef, {
                        productoId: id,
                        productoNombre: nombre,
                        tipo: tipoMov,
                        cantidad: cantMov,
                        stockResultante: nuevoStock,
                        motivo: motivo || (tipoMov === 'SUMAR' ? 'Ingreso Producción' : 'Egreso/Descarte'),
                        loteElab: tipoMov === 'SUMAR' ? fElab : null,
                        loteVto: tipoMov === 'SUMAR' ? fVto : null,
                        usuario: userName,
                        usuarioId: currentUser.uid,
                        fecha: Timestamp.now()
                    });
                });
                
                modalStock.classList.remove('visible');
            } catch (error) {
                console.error("Error al actualizar stock/lotes:", error);
                alert("Hubo un error al guardar los cambios.");
            }

            btnGuardarStock.disabled = false;
            btnGuardarStock.textContent = 'Guardar Cambios';
        });
    }

    // --- Modal Código de Barras 1D y GENERADOR DE IMAGEN CON FECHAS (50x30) ---
    const drawBarcodeCanvas = () => {
        if(!currentBarcodeProduct) return;
        const prod = currentBarcodeProduct;
        
        const canvasFinal = document.getElementById("barcode-canvas-descarga");
        canvasFinal.width = 400;
        canvasFinal.height = 240;
        const ctx = canvasFinal.getContext("2d");
        
        // Fondo blanco total
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvasFinal.width, canvasFinal.height);
        
        // 1. Título Autoajustable
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        let fontSize = 38;
        ctx.font = `bold ${fontSize}px sans-serif`;
        
        while (ctx.measureText(prod.nombreTorta).width > 380 && fontSize > 16) {
            fontSize -= 2;
            ctx.font = `bold ${fontSize}px sans-serif`;
        }
        ctx.fillText(prod.nombreTorta, canvasFinal.width / 2, 45); 

        // 2. Código de Barras (Temporal)
        const tempCanvas = document.createElement("canvas");
        try {
            JsBarcode(tempCanvas, prod.codigoBarras, {
                format: "EAN13", lineColor: "#000", width: 3.5, height: 110, displayValue: true, fontSize: 26, margin: 0
            });
        } catch(e) {
            JsBarcode(tempCanvas, prod.codigoBarras, {
                format: "CODE128", lineColor: "#000", width: 3, height: 110, displayValue: true, fontSize: 24, margin: 0
            });
        }

        // Pegar código de barras un poco más arriba si hay fechas
        const xOffset = (canvasFinal.width - tempCanvas.width) / 2;
        const yOffset = 60; 
        ctx.drawImage(tempCanvas, xOffset, yOffset);

        // 3. Dibujar Fechas (Elab y Vto) abajo del todo
        const eVal = barcodeInputElab.value;
        const vVal = barcodeInputVto.value;

        if (eVal || vVal) {
            ctx.font = "bold 20px sans-serif";
            let dateText = "";
            
            if(eVal) {
                const [y,m,d] = eVal.split('-');
                dateText += `Elab: ${d}/${m}/${y.substring(2)}`;
            }
            if(vVal) {
                const [y,m,d] = vVal.split('-');
                dateText += (dateText ? ' - ' : '') + `Vto: ${d}/${m}/${y.substring(2)}`;
            }
            
            ctx.fillText(dateText, canvasFinal.width / 2, 225);
        }
    };

    const abrirModalBarcode = (prod) => {
        currentBarcodeProduct = prod;

        // Reset Fechas a las de hoy y +15
        const hoy = new Date();
        barcodeInputElab.value = dateToYMD(hoy);
        const vto = new Date();
        vto.setDate(vto.getDate() + 15);
        barcodeInputVto.value = dateToYMD(vto);

        drawBarcodeCanvas();

        if (btnDescargarBarcode) btnDescargarBarcode.dataset.nombre = prod.nombreTorta;
        if(modalBarcode) modalBarcode.classList.add('visible');
    };

    // Redibujar si el usuario cambia las fechas en el modal
    if (barcodeInputElab) barcodeInputElab.addEventListener('change', drawBarcodeCanvas);
    if (barcodeInputVto) barcodeInputVto.addEventListener('change', drawBarcodeCanvas);

    if (btnCerrarBarcode) {
        btnCerrarBarcode.addEventListener('click', () => {
            if(modalBarcode) modalBarcode.classList.remove('visible');
        });
    }

    if (btnDescargarBarcode) {
        btnDescargarBarcode.addEventListener('click', () => {
            const canvas = document.getElementById("barcode-canvas-descarga");
            const nombre = btnDescargarBarcode.dataset.nombre || 'etiqueta';
            const link = document.createElement('a');
            link.download = `Etiqueta-${nombre}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
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
    // 6. PROCESAMIENTO DE TRANSACCIONES PEPS Y CIERRES
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
                        
                        let stockActual = sfDoc.data().stockMostrador || 0;
                        let lotesActuales = sfDoc.data().lotes || [];
                        let nuevoStock = stockActual - item.cantidad;
                        if (nuevoStock < 0) nuevoStock = 0;
                        
                        // Sistema PEPS: Descontar primero de los lotes más viejos
                        let qtyToDeduct = item.cantidad;
                        lotesActuales.sort((a, b) => new Date(a.fechaVto) - new Date(b.fechaVto));
                        
                        let nuevosLotesPostResta = [];
                        for (let lote of lotesActuales) {
                            if (qtyToDeduct > 0) {
                                if (lote.cantidad <= qtyToDeduct) {
                                    qtyToDeduct -= lote.cantidad;
                                    // Lote vacío se desecha
                                } else {
                                    lote.cantidad -= qtyToDeduct;
                                    qtyToDeduct = 0;
                                    nuevosLotesPostResta.push(lote);
                                }
                            } else {
                                nuevosLotesPostResta.push(lote);
                            }
                        }
                        
                        transaction.update(docRef, { 
                            stockMostrador: nuevoStock,
                            lotes: nuevosLotesPostResta 
                        });

                        const auditRef = doc(auditoriaCollection);
                        transaction.set(auditRef, {
                            productoId: item.id,
                            productoNombre: item.nombre,
                            tipo: 'RESTA',
                            cantidad: item.cantidad,
                            stockResultante: nuevoStock,
                            motivo: `Venta (${metodoPagoSeleccionado})`,
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
