// =================================================================================
// 1. IMPORTACIONES DE FIREBASE
// =================================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// =================================================================================
// 2. CONFIGURACIÓN E INICIALIZACIÓN
// =================================================================================

// --- Elementos del DOM ---
// Referencias a los elementos de la página presupuesto.html
const listaPresupuestoContainer = document.getElementById('lista-presupuesto');
const totalPresupuestoEl = document.getElementById('total-presupuesto');
const userInfoEl = document.getElementById('user-info');

// --- Estado de la Aplicación ---
let userId = null;
let rawMaterialsCollectionRef = null; // Referencia a la colección de Firestore.

// --- Inicialización de Firebase ---
// Configuración de tu proyecto de Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyA33nr4_j2kMIeDJ-fyRqKLkUw9AToRnnM",
  authDomain: "dscotizacion.firebaseapp.com",
  projectId: "dscotizacion",
  storageBucket: "dscotizacion.firebasestorage.app",
  messagingSenderId: "103917274080",
  appId: "1:103917274080:web:478f18b226473a70202185"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// =================================================================================
// 3. LÓGICA DE DATOS (FIRESTORE)
// =================================================================================

function setupAuthListener() {
    onAuthStateChanged(auth, user => {
        if (user) {
            userId = user.uid;
            userInfoEl.textContent = `ID de sesión: ${userId}`;
            rawMaterialsCollectionRef = collection(db, `users/${userId}/rawMaterials`);
            listenForMaterials();
        } else {
            signInAnonymously(auth).catch(error => console.error("Error al iniciar sesión anónimamente:", error));
        }
    });
}

function listenForMaterials() {
    if (!rawMaterialsCollectionRef) return;
    const q = query(rawMaterialsCollectionRef);
    onSnapshot(q, (snapshot) => {
        const materials = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        materials.sort((a, b) => a.name.localeCompare(b.name));
        renderBudgetList(materials);
    });
}

// =================================================================================
// 4. RENDERIZADO Y LÓGICA DE PRESUPUESTO
// =================================================================================

function renderBudgetList(materials) {
    listaPresupuestoContainer.innerHTML = '';
    if (materials.length === 0) {
        listaPresupuestoContainer.innerHTML = '<p class="text-gray-500">Primero agrega materias primas en la otra pestaña.</p>';
        return;
    }
    materials.forEach(material => {
        const label = document.createElement('label');
        label.className = 'flex items-center p-3 bg-white border border-gray-200 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors';
        label.innerHTML = `
            <input type="checkbox" data-price="${material.price}" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 budget-item-checkbox">
            <div class="ml-4 flex-grow">
                <span class="font-medium text-gray-900">${material.name}</span>
            </div>
            <div class="text-right">
                 <span class="text-gray-700">$${material.price.toFixed(2)}</span>
                 <span class="text-sm text-gray-500"> / ${material.unit}</span>
            </div>
        `;
        listaPresupuestoContainer.appendChild(label);
    });
    addCheckboxChangeListeners();
}

function updateTotal() {
    const checkboxes = document.querySelectorAll('.budget-item-checkbox:checked');
    let total = 0;
    checkboxes.forEach(checkbox => {
        total += parseFloat(checkbox.dataset.price);
    });
    totalPresupuestoEl.textContent = `$${total.toFixed(2)}`;
}

// =================================================================================
// 5. MANEJADORES DE EVENTOS Y PUNTO DE ENTRADA
// =================================================================================

function addCheckboxChangeListeners() {
    document.querySelectorAll('.budget-item-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateTotal);
    });
}

function main() {
    console.log("Página de Presupuesto iniciada.");
    setupAuthListener();
}

document.addEventListener('DOMContentLoaded', main);
