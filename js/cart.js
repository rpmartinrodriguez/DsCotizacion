// js/cart.js

// Obtiene los items del carrito desde el almacenamiento local
function getCartItems() {
    const items = localStorage.getItem('cotizacionActual');
    return items ? JSON.parse(items) : [];
}

// Guarda los items en el almacenamiento local
function saveCartItems(items) {
    localStorage.setItem('cotizacionActual', JSON.stringify(items));
}

// Añade una receta al carrito
export function addToCart(receta) {
    const items = getCartItems();
    // Revisa si la receta ya está en el carrito para no duplicarla
    const existe = items.find(item => item.id === receta.id);
    if (!existe) {
        items.push({
            id: receta.id,
            nombreTorta: receta.data.nombreTorta,
            ingredientes: receta.data.ingredientes,
            cantidad: 1 // Por defecto añadimos 1 unidad
        });
        saveCartItems(items);
        updateCartIcon();
        alert(`"${receta.data.nombreTorta}" se añadió a la cotización.`);
    } else {
        alert(`"${receta.data.nombreTorta}" ya está en la cotización.`);
    }
}

// Actualiza el número en el ícono del carrito
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
