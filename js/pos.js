import { 
    getFirestore, collection, onSnapshot, query, where, orderBy, doc, 
    addDoc, updateDoc, Timestamp, runTransaction 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

export function setupPOS(app) {
    const db = getFirestore(app);
    const auth = getAuth(app);
    const cajasCollection = collection(db, 'cajas');
    const ventasCollection = collection(db, 'ventasMostrador');
    const recetasCollection = collection(db, 'recetas');

    // Referencias DOM
    const pantallaApertura = document.getElementById('pantalla-apertura');
    const pantallaPOS = document.getElementById('pantalla-pos');
    
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

    let currentUser = null;
    let userName = "Usuario Mostrador";
    let cajaActiva = null; 
    let productosMostrador = [];
    let carritoActual = [];
    let metodoPagoSeleccionado = null;

    const formatMoneda = (val) => `$${(val || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
        const q = query(
            cajasCollection, 
            where('usuarioId', '==', currentUser.uid),
            where('estado', '==', 'abierta')
        );

        onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const cajaDoc = snapshot.docs[0];
                cajaActiva = { id: cajaDoc.id, ...cajaDoc.data() };
                if (pantallaApertura) pantallaApertura.style.display = 'none';
                if (pantallaPOS) pantallaPOS.style.display = 'grid';
                cargarProductos();
            } else {
                cajaActiva = null;
                if (pantallaPOS) pantallaPOS.style.display = 'none';
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
                fondoCajaInput.value = '';
                btnAbrirCaja.disabled = false;
            } catch (e) {
                console.error("Error al abrir caja:", e);
                alert("No se pudo abrir la caja.");
                btnAbrirCaja.disabled = false;
            }
        });
    }

    const cargarProductos = () => {
        onSnapshot(query(recetasCollection, orderBy('nombreTorta')), (snapshot) => {
            productosMostrador = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderizarProductos(productosMostrador);
        });
    };

    const renderizarProductos = (productos) => {
        if (!listaProductosPOS) return;
        listaProductosPOS.innerHTML = '';
        productos.forEach(prod => {
            const precio = prod.precioVenta || 0;
            const stock = prod.stockMostrador || 0;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Producto"><strong>${prod.nombreTorta}</strong></td>
                <td data-label="Stock" style="color: ${stock > 0 ? 'var(--text-main)' : 'var(--danger-color)'}">${stock} u.</td>
                <td data-label="Precio" style="color: var(--primary-color); font-weight: 500;">${formatMoneda(precio)}</td>
                <td data-label="Cantidad" style="text-align: center;">
                    <div style="display: flex; gap: 5px; align-items: center; justify-content: center;">
                        <input type="number" min="1" max="${stock}" value="1" class="producto-cantidad-input" id="cant-${prod.id}" ${stock <= 0 ? 'disabled' : ''} style="padding: 0.3rem; border: 1px solid var(--border-color); border-radius: 4px;">
                        <button class="btn-primary btn-add-cart" data-id="${prod.id}" data-nombre="${prod.nombreTorta}" data-precio="${precio}" data-stock="${stock}" style="padding: 0.3rem 0.6rem; width: auto; font-size: 0.9rem;" ${stock <= 0 || precio <= 0 ? 'disabled' : ''} title="Agregar">+</button>
                    </div>
                </td>
            `;
            listaProductosPOS.appendChild(tr);
        });
    };

    if (buscadorPOS) {
        buscadorPOS.addEventListener('input', (e) => {
            const termino = e.target.value.toLowerCase();
            const filtrados = productosMostrador.filter(p => p.nombreTorta.toLowerCase().includes(termino));
            renderizarProductos(filtrados);
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
                        const nuevoStock = (sfDoc.data().stockMostrador || 0) - item.cantidad;
                        transaction.update(docRef, { stockMostrador: nuevoStock < 0 ? 0 : nuevoStock });
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
