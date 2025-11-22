// js/cart.js

// Obtener los ítems actuales del carrito desde el almacenamiento local
export function getCartItems() {
    const items = localStorage.getItem('cotizacionActual');
    return items ? JSON.parse(items) : [];
}

// Guardar los ítems y notificar cambios (Función interna)
function saveCartItems(items) {
    localStorage.setItem('cotizacionActual', JSON.stringify(items));
    updateCartIcon();
    // Disparamos un evento para que si la página del carrito está abierta, se actualice sola
    window.dispatchEvent(new Event('storage'));
}

// Función principal para añadir al carrito
export function addToCart(item) {
    const items = getCartItems();

    // Creamos el objeto final que se guardará en el carrito
    let cartItem = {};

    // CASO A: Viene desde el modal de porciones (Datos ya calculados)
    if (item.type === 'receta_fraccionada') {
        cartItem = {
            cartId: item.cartId || `${item.id}-${Date.now()}`, 
            recetaId: item.id,
            nombre: item.name,
            precio: item.price,
            cantidad: item.cantidadPorciones || 1,
            detalle: 'Porciones calculadas'
        };
    } 
    // CASO B: Viene directo sin calcular (Formato antiguo)
    else if (item.data) {
        cartItem = {
            cartId: `${item.id}-${Date.now()}`,
            recetaId: item.id,
            nombre: item.data.nombreTorta,
            precio: 0, 
            cantidad: 1,
            detalle: 'Unidad entera'
        };
    } 
    // CASO C: Otros formatos
    else {
        cartItem = {
            cartId: `${item.id || 'item'}-${Date.now()}`,
            recetaId: item.id,
            nombre: item.nombre || 'Producto',
            precio: item.precio || 0,
            cantidad: 1,
            detalle: ''
        };
    }

    items.push(cartItem);
    saveCartItems(items);
    
    const precioMsg = cartItem.precio > 0 
        ? ` - $${cartItem.precio.toLocaleString('es-AR', {minimumFractionDigits: 2})}` 
        : '';
        
    alert(`Se añadió "${cartItem.nombre}" al presupuesto${precioMsg}.`);
}

// --- ESTA ES LA FUNCIÓN QUE FALTABA ---
export function updateCartItemQuantity(cartId, quantity) {
    let items = getCartItems();
    // Buscamos el ítem por su ID único y actualizamos la cantidad
    items = items.map(item => {
        if (item.cartId === cartId) {
            return { ...item, cantidad: parseFloat(quantity) };
        }
        return item;
    });
    saveCartItems(items);
}

// Función de BORRAR usando el cartId único
export function removeFromCart(cartId) {
    let items = getCartItems();
    items = items.filter(item => item.cartId !== cartId);
    saveCartItems(items);
}

// Vaciar todo el carrito
export function clearCart() {
    localStorage.removeItem('cotizacionActual');
    updateCartIcon();
    window.dispatchEvent(new Event('storage'));
}

// Actualizar el contador rojo del ícono del carrito
export function updateCartIcon() {
    const items = getCartItems();
    const cartIcon = document.getElementById('cart-icon');
    const cartCount = document.getElementById('cart-count');
    
    if (cartIcon && cartCount) {
        if (items.length > 0) {
            cartCount.textContent = items.length;
            cartCount.style.display = 'flex';
        } else {
            cartCount.style.display = 'none';
        }
    }
}
