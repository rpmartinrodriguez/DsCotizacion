// js/cart.js

// Obtener los ítems actuales del carrito desde el almacenamiento local
export function getCartItems() {
    const items = localStorage.getItem('cotizacionActual');
    return items ? JSON.parse(items) : [];
}

// Guardar los ítems y notificar cambios
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

    // CASO A: Viene desde el modal de porciones (Datos ya calculados en recetas.js)
    if (item.type === 'receta_fraccionada') {
        cartItem = {
            // Generamos un ID único (cartId) usando la hora exacta. 
            // Esto es VITAL para borrar: permite diferenciar "Lemon Pie (8u)" de "Lemon Pie (4u)".
            cartId: `${item.id}-${Date.now()}`, 
            recetaId: item.id,
            nombre: item.name,      // Ej: "Lemon Pie (8 u.)"
            precio: item.price,     // Ej: 8000
            cantidad: item.cantidadPorciones || 1,
            detalle: 'Porciones calculadas'
        };
    } 
    // CASO B: Viene directo sin calcular (Formato antiguo, por seguridad)
    else if (item.data) {
        cartItem = {
            cartId: `${item.id}-${Date.now()}`,
            recetaId: item.id,
            nombre: item.data.nombreTorta,
            precio: 0, // Costo 0 porque no se calculó
            cantidad: 1,
            detalle: 'Unidad entera'
        };
    } 
    // CASO C: Otros formatos posibles
    else {
        cartItem = {
            cartId: `${item.id || 'item'}-${Date.now()}`,
            recetaId: item.id,
            nombre: item.nombre || 'Producto sin nombre',
            precio: item.precio || 0,
            cantidad: 1,
            detalle: ''
        };
    }

    items.push(cartItem);
    saveCartItems(items);
    
    // Mensaje de confirmación para el usuario
    const precioFormateado = cartItem.precio > 0 
        ? `$${cartItem.precio.toLocaleString('es-AR', {minimumFractionDigits: 2})}` 
        : 'Sin precio calculado';
        
    alert(`Se añadió "${cartItem.nombre}" al presupuesto.\nValor: ${precioFormateado}`);
}

// Función de BORRAR corregida: Usa el cartId único
export function removeFromCart(cartId) {
    let items = getCartItems();
    // Borramos solo el ítem que tenga ese ID único exacto
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
