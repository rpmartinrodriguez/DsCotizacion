// js/cart.js

export function getCartItems() {
    const items = localStorage.getItem('cotizacionActual');
    return items ? JSON.parse(items) : [];
}

function saveCartItems(items) {
    localStorage.setItem('cotizacionActual', JSON.stringify(items));
    updateCartIcon();
    // Disparamos un evento para que si la página del carrito está abierta, se actualice sola
    window.dispatchEvent(new Event('storage'));
}

export function addToCart(item) {
    const items = getCartItems();

    // Creamos un objeto estándar para el carrito
    const cartItem = {
        // ID Único para poder borrar este ítem específico después
        cartId: item.cartId || `${item.id}-${Date.now()}`,
        recetaId: item.id,
        
        // Datos de visualización
        nombre: item.name || item.data.nombreTorta, // Normalizamos el nombre
        
        // Precio: Si viene fraccionado, es el precio total calculado. 
        // Si no, asumimos 0 o el que venga.
        precio: item.price !== undefined ? item.price : 0,
        
        cantidad: item.cantidad || 1,
        
        // Guardamos detalles extra por si acaso
        detalle: item.cantidadPorciones ? `${item.cantidadPorciones} porciones` : 'Unidad entera'
    };

    items.push(cartItem);
    saveCartItems(items);
    
    alert(`"${cartItem.nombre}" añadido al presupuesto.`);
}

export function removeFromCart(cartId) {
    let items = getCartItems();
    // Filtramos para quitar el que coincida con el ID único
    items = items.filter(item => item.cartId !== cartId);
    saveCartItems(items);
}

export function clearCart() {
    localStorage.removeItem('cotizacionActual');
    updateCartIcon();
    window.dispatchEvent(new Event('storage'));
}

export function updateCartIcon() {
    const items = getCartItems();
    const cartCount = document.getElementById('cart-count');
    if (cartCount) {
        cartCount.textContent = items.length;
        cartCount.style.display = items.length > 0 ? 'flex' : 'none';
    }
}
