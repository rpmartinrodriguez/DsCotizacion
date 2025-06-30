// =================================================================================
// 1. IMPORTACIONES DE FIREBASE
// =================================================================================
// Importamos los módulos necesarios de Firebase para la base de datos y la autenticación.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// =================================================================================
// 2. CONFIGURACIÓN E INICIALIZACIÓN
// =================================================================================

// --- Elementos del DOM ---
// Obtenemos referencias a todos los elementos HTML con los que vamos a interactuar.
const tabs = {
    materiasPrimas: document.getElementById('tab-materias-primas'),
    presupuesto: document.getElementById('tab-presupuesto')
};
const contents = {
    materiasPrimas: document.getElementById('content-materias-primas'),
    presupuesto: document.getElementById('content-presupuesto')
};
const formMateriaPrima = document.getElementById('form-materia-prima');
const listaMateriasPrimasContainer = document.getElementById('lista-materias-primas');
const listaPresupuestoContainer = document.getElementById('lista-presupuesto');
const totalPresupuestoEl = document.getElementById('total-presupuesto');
const userInfoEl = document.getElementById('user-info');

// --- Estado de la Aplicación ---
let userId = null;
let materialsCache = []; // Un caché local para no tener que consultar el DOM constantemente.
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

// Inicializamos Firebase con tu configuración
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// =================================================================================
// 3. MANEJO DE LA INTERFAZ (PESTAÑAS)
// =================================================================================

function setupTabNavigation() {
    tabs.materiasPrimas.addEventListener('click', () => switchTab('materiasPrimas'));
    tabs.presupuesto.addEventListener('click', () => switchTab('presupuesto'));
}

function switchTab(activeTab) {
    // Recorremos las pestañas para activar la correcta y ocultar el contenido de las otras.
    Object.keys(tabs).forEach(tabKey => {
        const isTabActive = tabKey === activeTab;
        tabs[tabKey].classList.toggle('tab-active', isTabActive);
        tabs[tabKey].classList.toggle('border-transparent', !isTabActive);
        tabs[tabKey].classList.toggle('text-gray-500', !isTabActive);
        contents[tabKey].classList.toggle('hidden', !isTabActive);
    });
}

// =================================================================================
// 4. LÓGICA DE DATOS (FIRESTORE - MATERIAS PRIMAS)
// =================================================================================

function setupAuthListener() {
    // Escuchamos cambios en el estado de autenticación.
    onAuthStateChanged(auth, user => {
        if (user) {
            // Si el usuario está autenticado (incluso anónimamente).
            userId = user.uid;
            userInfoEl.textContent = `ID de sesión: ${userId}`;
            // Creamos la referencia a su colección personal de materias primas.
            rawMaterialsCollectionRef = collection(db, `users/${userId}/rawMaterials`);
            listenForMaterials(); // Empezamos a escuchar los datos.
        } else {
            // Si no hay usuario, intentamos un inicio de sesión anónimo.
            signInAnonymously(auth).catch(error => console.error("Error al iniciar sesión anónimamente:", error));
        }
    });
}

function listenForMaterials() {
    if (!rawMaterialsCollectionRef) return;
    const q = query(rawMaterialsCollectionRef);
    // onSnapshot crea un listener en tiempo real. Se ejecuta cada vez que los datos cambian.
    onSnapshot(q, (snapshot) => {
        materialsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        materialsCache.sort((a, b) => a.name.localeCompare(b.name)); // Ordenamos alfabéticamente.
        renderAll(); // Volvemos a dibujar todo con los nuevos datos.
    });
}

async function addMaterial(name, price, unit) {
    if (!rawMaterialsCollectionRef) return;
    try {
        await addDoc(rawMaterialsCollectionRef, { name, price, unit, createdAt: new Date() });
    } catch (error) {
        console.error("Error al agregar el documento: ", error);
        // En una app real, mostraríamos un mensaje de error al usuario.
    }
}

async function deleteMaterial(id) {
    if (!rawMaterialsCollectionRef) return;
    try {
        await deleteDoc(doc(db, rawMaterialsCollectionRef.path, id));
    } catch (error) {
        console.error("Error al eliminar el documento: ", error);
    }
}

// =================================================================================
// 5. RENDERIZADO (DIBUJAR EN PANTALLA)
// =================================================================================

function renderAll() {
    // Esta función centraliza todas las actualizaciones de la interfaz.
    renderMaterialsList();
    renderBudgetList();
    updateTotal();
}

function renderMaterialsList() {
    listaMateriasPrimasContainer.innerHTML = ''; // Limpiamos la lista actual.
    if (materialsCache.length === 0) {
        listaMateriasPrimasContainer.innerHTML = '<p class="text-gray-500">Aún no has agregado materias primas.</p>';
        return;
    }
    // Creamos un elemento HTML por cada materia prima en nuestro caché.
    materialsCache.forEach(material => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-50 p-3 rounded-lg';
        div.innerHTML = `
            <div>
                <p class="font-medium text-gray-900">${material.name}</p>
                <p class="text-sm text-gray-600">$${material.price.toFixed(2)} por ${material.unit}</p>
            </div>
            <button data-id="${material.id}" class="delete-btn text-red-500 hover:text-red-700 font-semibold transition-colors">
                Eliminar
            </button>
        `;
        listaMateriasPrimasContainer.appendChild(div);
    });
    addDeleteButtonListeners(); // Volvemos a asignar los listeners a los nuevos botones.
}

function renderBudgetList() {
    listaPresupuestoContainer.innerHTML = ''; // Limpiamos la lista.
    if (materialsCache.length === 0) {
        listaPresupuestoContainer.innerHTML = '<p class="text-gray-500">Carga materias primas para poder crear un presupuesto.</p>';
        return;
    }
    // Creamos una fila con un checkbox por cada materia prima.
    materialsCache.forEach(material => {
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
    addCheckboxChangeListeners(); // Asignamos listeners a los nuevos checkboxes.
}

// =================================================================================
// 6. LÓGICA DE PRESUPUESTO
// =================================================================================

function updateTotal() {
    const checkboxes = document.querySelectorAll('.budget-item-checkbox:checked');
    let total = 0;
    checkboxes.forEach(checkbox => {
        total += parseFloat(checkbox.dataset.price);
    });
    totalPresupuestoEl.textContent = `$${total.toFixed(2)}`;
}

// =================================================================================
// 7. MANEJADORES DE EVENTOS Y PUNTO DE ENTRADA
// =================================================================================

async function handleMaterialFormSubmit(e) {
    e.preventDefault(); // Evitamos que la página se recargue.
    const nombre = document.getElementById('nombre-producto').value;
    const precio = parseFloat(document.getElementById('precio-producto').value);
    const unidad = document.getElementById('unidad-producto').value;

    if (nombre && !isNaN(precio) && unidad) {
        await addMaterial(nombre, precio, unidad);
        formMateriaPrima.reset(); // Limpiamos el formulario.
    }
}

function addDeleteButtonListeners() {
    // Asignamos el evento de borrado a cada botón con la clase 'delete-btn'.
    document.querySelectorAll('.delete-btn').forEach(button => {
        // Limpiamos listeners antiguos para evitar duplicados al re-renderizar.
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        newButton.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            deleteMaterial(id);
        });
    });
}

function addCheckboxChangeListeners() {
    // Asignamos el evento de cambio a cada checkbox del presupuesto.
     document.querySelectorAll('.budget-item-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateTotal);
    });
}

function setupInitialEventListeners() {
    formMateriaPrima.addEventListener('submit', handleMaterialFormSubmit);
}

// --- Punto de Entrada de la Aplicación ---
function main() {
    console.log("Aplicación iniciada.");
    setupTabNavigation();
    setupInitialEventListeners();
    setupAuthListener();
}

// Iniciar la aplicación una vez que el DOM esté completamente cargado.
document.addEventListener('DOMContentLoaded', main);
