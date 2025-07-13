import { getFirestore, collection, getDocs, query } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getCartItems, updateCartItemQuantity, removeFromCart, clearCart } from './cart.js';

export function setupCotizacion(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const presupuestosGuardadosCollection = collection(db, 'presupuestosGuardados');

    const itemsContainer = document.getElementById('cart-items-container');
    const summaryContainer = document.getElementById('cart-summary-container');
    const datalistClientes = document.getElementById('lista-clientes-existentes');
    const btnFinalizar = document.getElementById('btn-finalizar-cotizacion');
    
    let materiasPrimas = [];

    const formatCurrency = (value) => (value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

    const calcularCostoItem = (item) => {
        let costoTotal = 0;
        item.ingredientes.forEach(ing => {
            const mp = materiasPrimas.find(m => m.id === ing.idMateriaPrima);
            if(mp && mp.lotes.length > 0) {
                const ultimoLote = mp.lotes.sort((a,b) => b.fechaCompra.seconds - a.fechaCompra.seconds)[0];
                costoTotal += (ultimoLote.costoUnitario || 0) * ing.cantidad;
            }
        });
        return costoTotal * item.cantidad;
    };

    const renderCart = () => {
        const items = getCartItems();
        itemsContainer.innerHTML = '';
        
        if (items.length === 0) {
            itemsContainer.innerHTML = '<p>Tu cotización está vacía. Ve a la sección de "Postres" para añadir productos.</p>';
            summaryContainer.innerHTML = '';
            btnFinalizar.disabled = true;
            return;
        }

        let subtotal = 0;

        items.forEach(item => {
            const itemCosto = calcularCostoItem(item);
            subtotal += itemCosto;

            const itemDiv = document.createElement('div');
            itemDiv.className = 'cart-item';
            itemDiv.innerHTML = `
                <div class="cart-item__info">
                    <h4>${item.nombreTorta}</h4>
                    <p>${formatCurrency(itemCosto)}</p>
                </div>
                <div class="cart-item__actions">
                    <label>Cant:</label>
                    <input type="number" class="item-quantity-input" data-id="${item.id}" value="${item.cantidad}" min="1">
                    <button class="btn-remove-item" data-id="${item.id}">🗑️</button>
                </div>
            `;
            itemsContainer.appendChild(itemDiv);
        });
        
        summaryContainer.innerHTML = `<div class="linea-reporte total-bruto"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>`;
        btnFinalizar.disabled = false;
    };

    itemsContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('item-quantity-input')) {
            const itemId = e.target.dataset.id;
            const newQuantity = parseInt(e.target.value, 10);
            if (newQuantity > 0) {
                updateCartItemQuantity(itemId, newQuantity);
                renderCart();
            }
        }
    });

    itemsContainer.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove-item')) {
            const itemId = e.target.closest('.btn-remove-item').dataset.id;
            if (confirm('¿Quitar este producto de la cotización?')) {
                removeFromCart(itemId);
                renderCart();
            }
        }
    });

    const loadInitialData = async () => {
        // Cargar materias primas para cálculo de costos
        const snapshot = await getDocs(query(materiasPrimasCollection));
        materiasPrimas = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        // Cargar clientes existentes para autocompletado
        const presSnap = await getDocs(query(presupuestosGuardadosCollection));
        const nombres = new Set();
        presSnap.forEach(doc => nombres.add(doc.data().nombreCliente));
        datalistClientes.innerHTML = '';
        nombres.forEach(nombre => datalistClientes.innerHTML += `<option value="${nombre}">`);

        renderCart();
    };

    loadInitialData();
}
