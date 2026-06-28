import { 
    getFirestore, collection, onSnapshot, query, where, orderBy, doc, 
    addDoc, updateDoc, deleteDoc, Timestamp, runTransaction, getDocs 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

export function setupPOS(app) {
    const db = getFirestore(app);
    const auth = getAuth(app);
    
    // Colecciones
    const cajasCollection = collection(db, 'cajas');
    const ventasCollection = collection(db, 'ventasMostrador');
    const productosCollection = collection(db, 'productosMostrador');
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

    // --- Referencias DOM: Inventario y Auditoría ---
    const btnIrStock = document.getElementById('btn-ir-stock');
    const btnVolverMostrador = document.getElementById('btn-volver-mostrador');
    const buscadorInventario = document.getElementById('buscador-inventario');
    const btnNuevoProducto = document.getElementById('btn-nuevo-producto-mostrador');
    const tablaInventario = document.getElementById('tabla-inventario-mostrador');

    // Modal Stock
    const modalStock = document.getElementById('modal-stock-detalle');
    const modalProdTitulo = document.getElementById('modal-prod-titulo');
    const modalProdId = document.getElementById('modal-prod-id');
    const modalProdNombre = document.getElementById('modal-prod-nombre');
    const modalProdPrecio = document.getElementById('modal-prod-precio');
    const modalProdStockActual = document.getElementById('modal-prod-stock-actual');
    const modalProdTipoMov = document.getElementById('modal-prod-tipo-movimiento');
    const modalProdCantMov = document.getElementById('modal-prod-cantidad-movimiento');
    const modalProdMotivo = document.getElementById('modal-prod-motivo');
    const modalProdAuditoria = document.getElementById('modal-prod-auditoria-logs');
    const btnEliminarProducto = document.getElementById('btn-eliminar-producto-mostrador');
    const btnCancelarStock = document.getElementById('btn-cerrar-modal-stock');
    const btnGuardarStock = document.getElementById('btn-guardar-modal-stock');

    // --- Estado de la App ---
    let currentUser = null;
    let userName = "Usuario Mostrador";
    let cajaActiva = null; 
    let productosDisponibles = [];
    let carritoActual = [];
    let metodoPagoSeleccionado = null;

    // Helpers
    const formatMoneda = (val) => `$${(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatFecha = (timestamp) => {
        if (!timestamp) return '';
        const d = timestamp.toDate();
        return d.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
    };

    // ==========================================
    // 1. AUTENTICACIÓN Y CONTROL DE CAJA
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
                pantallaStock.style.display = 'none';
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
    // 2. NAVEGACIÓN Y CARGA DE PRODUCTOS
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
        onSnapshot(query(productosCollection, orderBy('nombre')), (snapshot) => {
            productosDisponibles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Actualizar vista dependiendo de dónde esté el usuario
            if (pantallaPOS.style.display !== 'none') {
                renderizarProductosPOS(productosDisponibles);
            } else if (pantallaStock.style.display !== 'none') {
                renderizarInventario(productosDisponibles);
            }
        });
    };

    // ==========================================
    // 3. LÓGICA DE INVENTARIO Y AUDITORÍA
    // ==========================================
    const renderizarInventario = (productos) => {
        if (!tablaInventario) return;
        tablaInventario.innerHTML = '';
        
        if (productos.length === 0) {
            tablaInventario.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;">No hay productos en el inventario. Creá uno nuevo.</td></tr>';
            return;
        }

        productos.forEach(prod => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Producto"><strong>${prod.nombre}</strong></td>
                <td data-label="Precio">${formatMoneda(prod.precioVenta)}</td>
                <td data-label="Stock" style="text-align: center; color: ${prod.stock > 0 ? 'var(--text-main)' : 'var(--danger-color)'}">
                    <strong>${prod.stock}</strong> u.
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
            const filtrados = productosDisponibles.filter(p => p.nombre.toLowerCase().includes(termino));
            renderizarInventario(filtrados);
        });
    }

    if (btnNuevoProducto) {
        btnNuevoProducto.addEventListener('click', () => {
            abrirModalStock();
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

    const abrirModalStock = async (prod = null) => {
        // Limpiar campos
        modalProdId.value = prod ? prod.id : '';
        modalProdTitulo.textContent = prod ? 'Editar Producto' : 'Nuevo Producto';
        modalProdNombre.value = prod ? prod.nombre : '';
        modalProdPrecio.value = prod ? prod.precioVenta : '';
        modalProdStockActual.textContent = prod ? prod.stock : '0';
        modalProdCantMov.value = '';
        modalProdMotivo.value = '';
        modalProdAuditoria.innerHTML = '<p class="text-light" style="text-align:center;">Cargando historial...</p>';

        if (prod) {
            btnEliminarProducto.style.display = 'block';
            await cargarAuditoriaProducto(prod.id);
        } else {
            btnEliminarProducto.style.display = 'none';
            modalProdAuditoria.innerHTML = '<p class="text-light" style="text-align:center;">Guardá el producto para ver su historial.</p>';
        }

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
                if (log.tipo === 'CREACION') tipoSpan = `<span style="color: #6366f1; font-weight:bold;">[NUEVO]</span>`;
                else if (log.tipo === 'SUMA') tipoSpan = `<span class="log-tipo-sumar">[+${log.cantidad}]</span>`;
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
            const nombre = modalProdNombre.value.trim();
            const precio = parseFloat(modalProdPrecio.value) || 0;
            const tipoMov = modalProdTipoMov.value;
            const cantMov = parseInt(modalProdCantMov.value) || 0;
            const motivo = modalProdMotivo.value.trim();

            if (!nombre) return alert("El nombre es obligatorio.");
            if (precio < 0) return alert("El precio no puede ser negativo.");

            btnGuardarStock.disabled = true;
            btnGuardarStock.textContent = 'Guardando...';

            try {
                if (id) {
                    // Editar existente (Transacción para asegurar consistencia del stock)
                    const docRef = doc(db, 'productosMostrador', id);
                    await runTransaction(db, async (transaction) => {
                        const sfDoc = await transaction.get(docRef);
                        if (!sfDoc.exists()) throw "Producto no existe";
                        
                        let stockActual = sfDoc.data().stock || 0;
                        let nuevoStock = stockActual;
                        let movimientoRegistrado = false;

                        // Solo procesar movimiento si ingresó una cantidad mayor a 0
                        if (cantMov > 0) {
                            if (tipoMov === 'SUMAR') {
                                nuevoStock = stockActual + cantMov;
                            } else {
                                nuevoStock = stockActual - cantMov;
                                if (nuevoStock < 0) nuevoStock = 0; // Evitar stock negativo manual
                            }
                            movimientoRegistrado = true;
                        }

                        // Actualizar producto
                        transaction.update(docRef, {
                            nombre: nombre,
                            precioVenta: precio,
                            stock: nuevoStock
                        });

                        // Registrar auditoría si hubo cambio
                        if (movimientoRegistrado) {
                            const auditRef = doc(auditoriaCollection); // Generar ID automático
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

                } else {
                    // Crear nuevo producto
                    const nuevoProdRef = await addDoc(productosCollection, {
                        nombre: nombre,
                        precioVenta: precio,
                        stock: 0
                    });

                    // Auditoría de creación
                    await addDoc(auditoriaCollection, {
                        productoId: nuevoProdRef.id,
                        productoNombre: nombre,
                        tipo: 'CREACION',
                        cantidad: 0,
                        stockResultante: 0,
                        motivo: 'Alta de producto inicial',
                        usuario: userName,
                        usuarioId: currentUser.uid,
                        fecha: Timestamp.now()
                    });
                }
                
                modalStock.classList.remove('visible');
            } catch (error) {
                console.error("Error al guardar producto:", error);
                alert("Hubo un error al guardar.");
            }

            btnGuardarStock.disabled = false;
            btnGuardarStock.textContent = 'Actualizar';
        });
    }

    if (btnEliminarProducto) {
        btnEliminarProducto.addEventListener('click', async () => {
            const id = modalProdId.value;
            if (confirm("¿Estás seguro de eliminar este producto del mostrador? Se conservará su historial para consultas, pero desaparecerá del stock.")) {
                try {
                    await deleteDoc(doc(db, 'productosMostrador', id));
                    modalStock.classList.remove('visible');
                } catch (e) {
                    alert("Error al eliminar");
                }
            }
        });
    }

    // ==========================================
    // 4. LÓGICA DEL MOSTRADOR (P.O.S)
    // ==========================================
    const renderizarProductosPOS = (productos) => {
        if (!listaProductosPOS) return;
        listaProductosPOS.innerHTML = '';
        productos.forEach(prod => {
            const precio = prod.precioVenta || 0;
            const stock = prod.stock || 0;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Producto"><strong>${prod.nombre}</strong></td>
                <td data-label="Stock" style="color: ${stock > 0 ? 'var(--text-main)' : 'var(--danger-color)'}">${stock} u.</td>
                <td data-label="Precio" style="color: var(--primary-color); font-weight: 500;">${formatMoneda(precio)}</td>
                <td data-label="Cantidad" style="text-align: center;">
                    <div style="display: flex; gap: 5px; align-items: center; justify-content: center;">
                        <input type="number" min="1" max="${stock}" value="1" class="producto-cantidad-input" id="cant-${prod.id}" ${stock <= 0 ? 'disabled' : ''} style="padding: 0.3rem; border: 1px solid var(--border-color); border-radius: 4px;">
                        <button class="btn-primary btn-add-cart" data-id="${prod.id}" data-nombre="${prod.nombre}" data-precio="${precio}" data-stock="${stock}" style="padding: 0.3rem 0.6rem; width: auto; font-size: 0.9rem;" ${stock <= 0 || precio <= 0 ? 'disabled' : ''} title="Agregar">+</button>
                    </div>
                </td>
            `;
            listaProductosPOS.appendChild(tr);
        });
    };

    if (buscadorPOS) {
        buscadorPOS.addEventListener('input', (e) => {
            const termino = e.target.value.toLowerCase();
            const filtrados = productosDisponibles.filter(p => p.nombre.toLowerCase().includes(termino));
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
    // 5. PROCESO DE COBRO Y CIERRE
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

                // 1. Restar stock y generar auditoría usando transacciones
                for (const item of carritoActual) {
                    const docRef = doc(db, 'productosMostrador', item.id);
                    await runTransaction(db, async (transaction) => {
                        const sfDoc = await transaction.get(docRef);
                        if (!sfDoc.exists()) throw "El producto no existe.";
                        
                        const stockActual = sfDoc.data().stock || 0;
                        let nuevoStock = stockActual - item.cantidad;
                        if (nuevoStock < 0) nuevoStock = 0;
                        
                        // Actualizar producto
                        transaction.update(docRef, { stock: nuevoStock });

                        // Generar log de auditoría por venta
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

                // 2. Registrar la venta global
                await addDoc(ventasCollection, {
                    cajaId: cajaActiva.id,
                    fecha: Timestamp.now(),
                    metodoPago: metodoPagoSeleccionado,
                    total: totalVenta,
                    items: itemsParaGuardar,
                    vendedor: userName
                });

                // 3. Actualizar caja
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
