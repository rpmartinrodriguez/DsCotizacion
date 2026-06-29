import { 
    getFirestore, collection, onSnapshot, query, where, orderBy, doc, 
    addDoc, updateDoc, Timestamp, runTransaction, getDocs, setDoc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

export function setupPOS(app) {
    const db = getFirestore(app);
    const auth = getAuth(app);
    
    // Colecciones principales
    const cajasCollection = collection(db, 'cajas');
    const ventasCollection = collection(db, 'ventasMostrador');
    const recetasCollection = collection(db, 'recetas'); 
    const auditoriaCollection = collection(db, 'auditoriaMostrador');

    // --- Referencias DOM: Vistas ---
    const pantallaApertura = document.getElementById('pantalla-apertura');
    const pantallaPOS = document.getElementById('pantalla-pos');
    const pantallaStock = document.getElementById('pantalla-stock-mostrador');

    // --- Referencias DOM: Caja y POS ---
    const usuarioNombreEl = document.getElementById('usuario-activo-nombre');
    const fondoCajaInput = document.getElementById('fondo-caja-input');
    const btnAbrirCaja = document.getElementById('btn-abrir-caja');
    const btnIniciarCierre = document.getElementById('btn-iniciar-cierre');
    const listaProductosPOS = document.getElementById('lista-productos-pos');
    const buscadorPOS = document.getElementById('buscador-pos');
    const carritoContainer = document.getElementById('carrito-pos-container');
    const posTotalMonto = document.getElementById('pos-total-monto');
    const btnCobrar = document.getElementById('btn-cobrar');

    // Modales Caja
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

    // --- Referencias DOM: Inventario y Reglas Admin ---
    const btnIrStock = document.getElementById('btn-ir-stock');
    const btnVolverMostrador = document.getElementById('btn-volver-mostrador');
    const buscadorInventario = document.getElementById('buscador-inventario');
    const tablaInventario = document.getElementById('tabla-inventario-mostrador');
    const btnDesbloquearAdmin = document.getElementById('btn-desbloquear-admin');
    const btnMargenGlobal = document.getElementById('btn-margen-global');

    // Modal Stock
    const modalStock = document.getElementById('modal-stock-detalle');
    const modalProdId = document.getElementById('modal-prod-id');
    const modalProdNombre = document.getElementById('modal-prod-nombre');
    const modalProdPrecio = document.getElementById('modal-prod-precio'); // Queda en desuso directo, se calcula
    const modalProdGananciaIndiv = document.getElementById('modal-prod-ganancia-indiv');
    const modalProdStockActual = document.getElementById('modal-prod-stock-actual');
    const modalProdTipoMov = document.getElementById('modal-prod-tipo-movimiento');
    const modalProdCantMov = document.getElementById('modal-prod-cantidad-movimiento');
    const modalProdMotivo = document.getElementById('modal-prod-motivo');
    const modalProdAuditoria = document.getElementById('modal-prod-auditoria-logs');
    const btnCancelarStock = document.getElementById('btn-cerrar-modal-stock');
    const btnGuardarStock = document.getElementById('btn-guardar-modal-stock');

    // --- Estado de la App ---
    let currentUser = null;
    let userName = "Usuario Mostrador";
    let cajaActiva = null; 
    let productosDisponibles = [];
    let carritoActual = [];
    let metodoPagoSeleccionado = null;
    let margenGlobal = 0; // Se sincroniza desde Firebase

    // Helpers de Formato
    const formatMoneda = (val) => `$${(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatFecha = (timestamp) => {
        if (!timestamp) return '';
        const d = timestamp.toDate();
        return d.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
    };

    // Helper: Calcular Precio de Venta basado en Costo y Margen
    const calcularPrecioVenta = (receta) => {
        const costo = receta.costoTotal || receta.costoMateriaPrima || receta.costo || 0;
        
        // Si tiene margen individual asignado usa ese, sino cae en el global
        const tieneMargenIndiv = receta.margenIndividual !== undefined && receta.margenIndividual !== null && receta.margenIndividual !== '';
        const margenAplicado = tieneMargenIndiv ? parseFloat(receta.margenIndividual) : margenGlobal;
        
        return costo * (1 + (margenAplicado / 100));
    };

    // ==========================================
    // 1. CONTROL DE CONFIGURACIÓN GLOBAL (MARGEN)
    // ==========================================
    onSnapshot(doc(db, 'config', 'mostrador'), (docSnap) => {
        if (docSnap.exists()) {
            margenGlobal = docSnap.data().margenGlobal || 0;
        } else {
            setDoc(doc(db, 'config', 'mostrador'), { margenGlobal: 0 });
        }
        // Refrescar las listas si cambian los márgenes globales en vivo
        if (productosDisponibles.length > 0) {
            if (pantallaPOS.style.display !== 'none') renderizarProductosPOS(productosDisponibles);
            if (pantallaStock.style.display !== 'none') renderizarInventario(productosDisponibles);
        }
    });

    // Contraseña modo administrador
    if (btnDesbloquearAdmin) {
        btnDesbloquearAdmin.addEventListener('click', () => {
            if (document.body.classList.contains('admin-open')) {
                document.body.classList.remove('admin-open');
                btnDesbloquearAdmin.textContent = "🔑 Modo Admin";
                renderizarInventario(productosDisponibles);
                return;
            }

            const pass = prompt("Ingrese la contraseña de Administrador:");
            if (pass === "Lautaro2026") {
                document.body.classList.add('admin-open');
                btnDesbloquearAdmin.textContent = "🔒 Cerrar Admin";
                renderizarInventario(productosDisponibles);
            } else if (pass !== null) {
                alert("Contraseña incorrecta.");
            }
        });
    }

    // Modificar margen global (Admin Only)
    if (btnMargenGlobal) {
        btnMargenGlobal.addEventListener('click', async () => {
            const nuevoMargen = prompt("Ingrese el nuevo porcentaje de Margen Ganancia Global (%):", margenGlobal);
            if (nuevoMargen !== null && nuevoMargen.trim() !== "") {
                const margenNum = parseFloat(nuevoMargen);
                if (isNaN(margenNum) || margenNum < 0) {
                    alert("Por favor, ingrese un número válido.");
                    return;
                }
                try {
                    await setDoc(doc(db, 'config', 'mostrador'), { margenGlobal: margenNum });
                    alert(`Margen global actualizado al ${margenNum}% correctamente.`);
                } catch (e) {
                    alert("Error al guardar el margen global.");
                }
            }
        });
    }

    // ==========================================
    // 2. AUTENTICACIÓN Y CONTROL DE CAJA
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
                pantallaPOS.style.display = 'grid';
                cargarProductos();
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
                alert("No se pudo abrir la caja.");
                btnAbrirCaja.disabled = false;
            }
        });
    }

    // ==========================================
    // 3. NAVEGACIÓN INTERNA
    // ==========================================
    if (btnIrStock) {
        btnIrStock.addEventListener('click', () => {
            pantallaPOS.style.display = 'none';
            pantallaStock.style.display = 'block';
            renderizarInventario(productosDisponibles);
        });
    }

    if (btnVolverMostrador) {
        btnVolverMostrador.addEventListener('click', () => {
            pantallaStock.style.display = 'none';
            pantallaPOS.style.display = 'grid';
            renderizarProductosPOS(productosDisponibles);
        });
    }

    const cargarProductos = () => {
        onSnapshot(query(recetasCollection, orderBy('nombreTorta')), (snapshot) => {
            productosDisponibles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            if (pantallaPOS.style.display !== 'none') {
                renderizarProductosPOS(productosDisponibles);
            } else if (pantallaStock.style.display !== 'none') {
                renderizarInventario(productosDisponibles);
            }
        });
    };

    // ==========================================
    // 4. LÓGICA DE INVENTARIO (LISTADO INDEPENDIENTE)
    // ==========================================
    const renderizarInventario = (productos) => {
        if (!tablaInventario) return;
        tablaInventario.innerHTML = '';
        
        if (productos.length === 0) {
            tablaInventario.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem;">No hay recetas cargadas en el sistema.</td></tr>';
            return;
        }

        productos.forEach(prod => {
            const costo = prod.costoTotal || prod.costoMateriaPrima || prod.costo || 0;
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
                <td data-label="Acción" style="text-align: center;">
                    <button class="btn-primary btn-editar-prod" data-id="${prod.id}" style="padding: 0.3rem 0.8rem; width: auto; font-size: 0.85rem;">📝 Editar</button>
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
        tablaInventario.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-editar-prod');
            if (btn) {
                const prod = productosDisponibles.find(p => p.id === btn.dataset.id);
                if (prod) abrirModalStock(prod);
            }
        });
    }

    const abrirModalStock = async (prod) => {
        modalProdId.value = prod.id;
        modalProdNombre.value = prod.nombreTorta;
        modalProdGananciaIndiv.value = prod.margenIndividual !== undefined ? prod.margenIndividual : '';
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
            console.error("Error al cargar auditoría:", error);
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
            const gananciaIndivRaw = modalProdGananciaIndiv.value.trim();
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

                    // Preparar datos de actualización de la receta
                    const updates = { stockMostrador: nuevoStock };
                    
                    // Solo el administrador o la presencia de la clase guarda cambios de margen
                    if (document.body.classList.contains('admin-open')) {
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
                console.error("Error al guardar producto:", error);
                alert("Hubo un error al guardar los cambios.");
            }

            btnGuardarStock.disabled = false;
            btnGuardarStock.textContent = 'Guardar Cambios';
        });
    }

    // ==========================================
    // 5. LÓGICA DEL MOSTRADOR (P.O.S)
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
                        <button class="btn-primary btn-add-cart" data-id="${prod.id}" data-nombre="${prod.nombreTorta}" data-precio="${precioCalculated = precioCalculado}" data-stock="${stock}" style="padding: 0.3rem 0.6rem; width: auto; font-size: 0.9rem;" ${stock <= 0 ? 'disabled' : ''} title="Agregar">+</button>
                    </div>
                </td>
            `;
            listaProductosPOS.appendChild(tr);
        });
    };

    if (buscadorPOS) {
        buscadorPOS.addEventListener('input', (e) => {
            const termino = e.target.value.toLowerCase();
            const filtrados = productosDisponibles.filter(p => p.nombreTorta && p.nombreTorta.toLowerCase().includes(termino));
            renderizarProductosPOS(filtrados);
        });
    }

    if (listaProductosPOS) {
        listaProductosPOS.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-add-cart');
            if (btn) {
                const id = btn.dataset.id;
                const nombre = btn.dataset.nombre;
                const precio = parseFloat(btn.dataset.precio);
                const stockMax = parseInt(btn.dataset.stock);
                const inputCant = document.getElementById(`cant-${id}`);
                const cantidad = parseInt(inputCant.value) || 1;

                if (cantidad > stockMax) {
                    alert(`Solo hay ${stockMax} en stock.`);
                    return;
                }

                const existe = carritoActual.find(i => i.id === id);
                if (existe) {
                    if (existe.cantidad + cantidad > stockMax) {
                        alert(`Superas el stock disponible (${stockMax}).`);
                        return;
                    }
                    existe.cantidad += cantidad;
                } else {
                    carritoActual.push({ id, nombre, precio, cantidad });
                }
                
                inputCant.value = 1;
                renderizarCarrito();
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
    // 6. PROCESO DE COBRO Y CIERRE
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
                console.error("Error al procesar venta:", error);
                alert("Hubo un error al confirmar la venta.");
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
                console.error("Error cerrando caja:", error);
                alert("No se pudo cerrar la caja.");
                btnConfirmarCierre.disabled = false;
                btnConfirmarCierre.textContent = 'Cerrar Turno';
            }
        });
    }
}
