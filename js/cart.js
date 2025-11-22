// js/cart.js

// Obtener los ítems actuales del carrito (Cotización)
export function getCartItems() {
    const items = localStorage.getItem('cotizacionActual');
    return items ? JSON.parse(items) : [];
}

// Guardar los ítems en el almacenamiento local
function saveCartItems(items) {
    localStorage.setItem('cotizacionActual', JSON.stringify(items));
    updateCartIcon(); // Actualiza el ícono cada vez que se guarda
}

// Función principal para añadir al carrito
export function addToCart(item) {
    const items = getCartItems();

    // Definimos la estructura del nuevo objeto para el carrito
    let cartItem;

    // Caso 1: Viene de la nueva lógica de "Porciones/Unidades" (tiene precio calculado)
    if (item.type === 'receta_fraccionada' || item.price !== undefined) {
        cartItem = {
            // Generamos un ID único combinando el ID de la receta y la hora actual.
            // Esto permite tener "Lemon Pie (8u)" y "Lemon Pie (4u)" como ítems separados.
            cartId: `${item.id}-${Date.now()}`, 
            recetaId: item.id,
            nombreTorta: item.name, // Ya viene con el formato "Nombre (X u.)"
            precioUnitario: item.price, // Este es el precio total de las porciones seleccionadas
            cantidad: 1, // Representa "1 unidad de este cálculo"
            tipo: 'fraccionado'
        };
    } 
    // Caso 2: Soporte para la lógica antigua (por si acaso)
    else {
        cartItem = {
            cartId: `${item.id}-${Date.now()}`,
            recetaId: item.id,
            nombreTorta: item.data.nombreTorta,
            precioUnitario: 0, // Se definirá después o es costo cero
            cantidad: 1,
            tipo: 'entero'
        };
    }

    items.push(cartItem);
    saveCartItems(items);
    
    // Mostramos el precio si existe en el mensaje
    const precioMsg = cartItem.precioUnitario > 0 
        ? ` - $${cartItem.precioUnitario.toLocaleString('es-AR', {minimumFractionDigits: 2})}` 
        : '';
        
    alert(`"${cartItem.nombreTorta}" se añadió a la cotización${precioMsg}.`);
}

// Actualizar la cantidad de un ítem específico en el carrito
// (Esto multiplica el bloque de porciones. Ej: 2 cajas de 8 porciones)
export function updateCartItemQuantity(cartId, quantity) {
    let items = getCartItems();
    items = items.map(item => item.cartId === cartId ? { ...item, cantidad: parseFloat(quantity) } : item);
    saveCartItems(items);
}

// Eliminar un ítem del carrito
export function removeFromCart(cartId) {
    let items = getCartItems();
    // Filtramos usando el cartId único
    items = items.filter(item => item.cartId !== cartId);
    saveCartItems(items);
}

// Vaciar todo el carrito
export function clearCart() {
    localStorage.removeItem('cotizacionActual');
    updateCartIcon();
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
