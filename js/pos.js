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

    // --- Referencias DOM: Vistas de Pantalla ---
    const pantallaApertura = document.getElementById('pantalla-apertura');
    const pantallaPOS = document.getElementById('pantalla-pos');
    const pantallaStock = document.getElementById('pantalla-stock-mostrador');

    // --- Referencias DOM: Caja y Mostrador Vendedor ---
    const usuarioNombreEl = document.getElementById('usuario-activo-nombre');
    const fondoCajaInput = document.getElementById('fondo-caja-input');
    const btnAbrirCaja = document.getElementById('btn-abrir-caja');
    const btnIniciarCierre = document.getElementById('btn-iniciar-cierre');
    const listaProductosPOS = document.getElementById('lista-productos-pos');
    const buscadorPOS = document.getElementById('buscador-pos');
    const carritoContainer = document.getElementById('carrito-pos-container');
    const posTotalMonto = document.getElementById('pos-total-monto');
    const btnCobrar = document.getElementById('btn-cobrar');

    // Modales de Cobro y Cierre de Caja
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

    // --- Referencias DOM: Inventario y Reglas del Administrador ---
    const btnIrStock = document.getElementById('btn-ir-stock');
    const btnVolverMostrador = document.getElementById('btn-volver-mostrador');
    const buscadorInventario = document.getElementById('buscador-inventario');
    const tablaInventario = document.getElementById('tabla-inventario-mostrador');
    const btnDesbloquearAdmin = document.getElementById('btn-desbloquear-admin');
    const btnMargenGlobal = document.getElementById('btn-margen-global');

    // Modales de Stock y Código de Barras
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

    // Métodos Helpers para Formatos Comunes
    const formatMoneda = (val) => `$${(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatFecha = (timestamp) => {
        if (!timestamp) return '';
        const d = timestamp.toDate();
        return d.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
    };

    // FUNCIÓN MATEMÁTICA 1: Calcular Costo Base
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

    // FUNCIÓN MATEMÁTICA 2: Calcular el precio de venta final
    const calcularPrecioVenta = (prod) => {
        const costo = prod.costoBaseCalculado || 0;
        const tieneMargenIndiv = prod.margenIndividual !== undefined && prod.margenIndividual !== null && prod.margenIndividual !== '';
        const margenAplicado = tieneMargenIndiv ? parseFloat(prod.margenIndividual) : margenGlobal;
        return costo * (1 + (margenAplicado / 100));
    };

    // ==========================================
    // 1. CONFIGURACIÓN GLOBAL (MARGEN DE GANANCIAS)
    // ==========================================
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
            } else if (pass !== null) {
                alert("Contraseña incorrecta de acceso.");
            }
        });
    }

    if (btnMargenGlobal) {
        btnMargenGlobal.addEventListener('click', async () => {
            const nuevoMargen = prompt("Defina el nuevo porcentaje de Margen de Ganancia Global (%):", margenGlobal);
            if (nuevoMargen !== null && nuevoMargen.trim() !== "") {
                const margenNum = parseFloat(nuevoMargen);
                if (isNaN(margenNum) || margenNum < 0) {
                    alert("Ingrese un porcentaje numérico válido.");
                    return;
                }
                try {
                    await setDoc(doc(db, 'config', 'mostrador'), { margenGlobal: margenNum });
                } catch (e) {
                    alert("Error guardando configuraciones globales.");
                }
            }
        });
    }

    // ==========================================
    // 2. AUTENTICACIÓN Y APERTURA DE TURNOS
    // ==========================================
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
                pantallaApertura.style.display = 'none';
                
                if (pantallaStock.style.display === 'block') {
                    pantallaPOS.style.display = 'none';
                } else {
                    pantallaPOS.style.display = 'grid';
                    pantallaStock.style.display = 'none';
                }
                cargarDataYCostos();
            } else {
                cajaActiva = null;
                pantallaPOS.style.display = 'none';
                pantallaStock.style.display = 'none';
                pantallaApertura.style.display = 'block';
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
                fondoCajaInput.value = '';
                btnAbrirCaja.disabled = false;
            } catch (e) {
                console.error("Error al abrir caja:", e);
                alert("No se pudo iniciar el turno de caja.");
                btnAbrirCaja.disabled = false;
            }
        });
    }

    // ==========================================
    // 3. CARGA DE DATOS Y MATEMÁTICA AUTOMÁTICA
    // ==========================================
    if (btnIrStock) {
        btnIrStock.addEventListener('click', () => {
            pantallaPOS.style.display = 'none';
            pantallaStock.style.display = 'block';
            procesarYRenderizar();
        });
    }

    if (btnVolverMostrador) {
        btnVolverMostrador.addEventListener('click', () => {
            pantallaStock.style.display = 'none';
            pantallaPOS.style.display = 'grid';
            procesarYRenderizar();
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

        if (pantallaPOS.style.display !== 'none') {
            renderizarProductosPOS(productosDisponibles);
        } 
        if (pantallaStock.style.display !== 'none') {
            renderizarInventario(productosDisponibles);
        }
    };

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
                        const nuevoCodigo = Date.now().toString(); 
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

    // --- Modal Código de Barras 1D ---
    const abrirModalBarcode = (prod) => {
        barcodeTituloProducto.textContent = prod.nombreTorta;
        try {
            JsBarcode("#barcode-canvas", prod.codigoBarras, {
                format: "CODE128",
                lineColor: "#000",
                width: 2,
                height: 60,
                displayValue: true, 
                fontSize: 16,
                margin: 10
            });
            modalBarcode.classList.add('visible');
        } catch(error) {
            console.error("Error al generar código de barras:", error);
            alert("No se pudo generar el código de barras.");
        }
    };

    if (btnCerrarBarcode) {
        btnCerrarBarcode.addEventListener('click', () => modalBarcode.classList.remove('visible'));
    }

    if (btnImprimirBarcode) {
        btnImprimirBarcode.addEventListener('click', () => {
            document.body.classList.add('imprimiendo-barcode');
            window.print();
            setTimeout(() => {
                document.body.classList.remove('imprimiendo-barcode');
            }, 500);
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
    // 5. CAJA REGISTRADORA Y LECTURA GLOBAL DE BARRAS
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

    // --- MANEJO DEL BUSCADOR NORMAL ---
    if (buscadorPOS) {
        buscadorPOS.addEventListener('input', (e) => {
            const termino = e.target.value.toLowerCase();
            const filtrados = productosDisponibles.filter(p => 
                (p.nombreTorta && p.nombreTorta.toLowerCase().includes(termino)) ||
                (p.codigoBarras && String(p.codigoBarras).includes(termino))
            );
            renderizarProductosPOS(filtrados);
        });

        // Para evitar que la tecla Enter reinicie la página si estamos en el input
        buscadorPOS.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
            }
        });
    }

    // --- ESCUCHADOR GLOBAL DE LA PISTOLA LECTORA ---
    // Esto te permite escanear sin tener que darle clic a ninguna barra de búsqueda.
    let scanBuffer = '';
    let lastKeyTime = Date.now();

    document.addEventListener('keydown', (e) => {
        // Si no estamos en el mostrador de ventas, ignoramos el lector
        if (pantallaPOS.style.display === 'none') return;
        
        // Evitamos capturar teclas sueltas como Shift o Control
        if (e.key.length > 1 && e.key !== 'Enter') return;

        const currentTime = Date.now();
        // Las pistolas lectoras tipean cada número en menos de 50ms. Si pasa más tiempo, es un humano tipeando y reseteamos el buffer.
        if (currentTime - lastKeyTime > 50) {
            scanBuffer = '';
        }
        lastKeyTime = currentTime;

        if (e.key === 'Enter' || e.keyCode === 13) {
            // Un código de barras generado por nosotros tiene 13 caracteres
            if (scanBuffer.length >= 8) { 
                e.preventDefault();
                const codigoEscaneado = scanBuffer.trim();
                
                // Conversión ultra-segura a String para evitar problemas de tipos de datos en la validación
                const productoEncontrado = productosDisponibles.find(p => 
                    p.codigoBarras && String(p.codigoBarras) === codigoEscaneado
                );
                
                if (productoEncontrado) {
                    agregarProductoAlCarrito(productoEncontrado, 1);
                } else {
                    alert("El código escaneado (" + codigoEscaneado + ") no existe en el sistema.");
                }

                // Limpiamos todo para el siguiente escaneo
                scanBuffer = '';
                if (buscadorPOS) buscadorPOS.value = '';
                renderizarProductosPOS(productosDisponibles); // Restaurar lista visual
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
                    inputCant.value = 1;
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
                    <p>${item.cantidad} u. x ${formatMoneda(item.precio)}</p>
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
