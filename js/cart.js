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

    // Creamos un objeto estándar para el carrito para evitar datos vacíos
    const cartItem = {
        // Generamos un ID Único combinando el ID de la receta y la hora actual.
        // Esto es CLAVE para poder borrar este ítem específico después sin borrar otros iguales.
        cartId: item.cartId || `${item.id}-${Date.now()}`,
        
        recetaId: item.id,
        
        // Datos de visualización: Normalizamos el nombre
        // Si viene de recetas.js nuevo, usa 'item.name'. Si es viejo, 'item.data.nombreTorta'.
        nombre: item.name || (item.data ? item.data.nombreTorta : 'Producto sin nombre'),
        
        // Precio: Si viene fraccionado, es el precio total calculado. 
        precio: item.price !== undefined ? item.price : 0,
        
        cantidad: item.cantidad || 1,
        
        // Guardamos detalles extra para mostrar en el carrito
        detalle: item.cantidadPorciones ? `${item.cantidadPorciones} porciones/u.` : 'Unidad entera'
    };

    items.push(cartItem);
    saveCartItems(items);
    
    // Feedback visual simple
    const precioMsg = cartItem.precio > 0 
        ? ` - $${cartItem.precio.toLocaleString('es-AR', {minimumFractionDigits: 2})}` 
        : '';
        
    alert(`"${cartItem.nombre}" se añadió al presupuesto${precioMsg}.`);
}

// Eliminar un ítem del carrito usando su ID único
export function removeFromCart(cartId) {
    let items = getCartItems();
    // Filtramos para quitar SOLO el que coincida con el ID único
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
