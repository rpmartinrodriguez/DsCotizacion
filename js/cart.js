// js/cart.js

// CORRECCIÓN: Añadimos 'export' para que esta función sea pública y otros archivos puedan usarla.
export function getCartItems() {
    const items = localStorage.getItem('cotizacionActual');
    return items ? JSON.parse(items) : [];
}

// Hacemos esta función interna, ya que solo la usamos dentro de este mismo archivo.
function saveCartItems(items) {
    localStorage.setItem('cotizacionActual', JSON.stringify(items));
    updateCartIcon(); // Actualiza el ícono cada vez que se guarda
}

export function addToCart(receta) {
    const items = getCartItems();
    const existe = items.find(item => item.id === receta.id);
    if (!existe) {
        items.push({
            id: receta.id,
            nombreTorta: receta.data.nombreTorta,
            ingredientes: receta.data.ingredientes,
            cantidad: 1
        });
        saveCartItems(items);
        alert(`"${receta.data.nombreTorta}" se añadió a la cotización.`);
    } else {
        alert(`"${receta.data.nombreTorta}" ya está en la cotización.`);
    }
}

export function updateCartItemQuantity(itemId, quantity) {
    let items = getCartItems();
    items = items.map(item => item.id === itemId ? { ...item, cantidad: quantity } : item);
    saveCartItems(items);
}

export function removeFromCart(itemId) {
    let items = getCartItems();
    items = items.filter(item => item.id !== itemId);
    saveCartItems(items);
}

export function clearCart() {
    localStorage.removeItem('cotizacionActual');
    updateCartIcon();
}

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
