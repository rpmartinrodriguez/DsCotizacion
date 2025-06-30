// =================================================================================
// 1. IMPORTACIONES DE FIREBASE
// =================================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, query } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// =================================================================================
// 2. CONFIGURACIÓN E INICIALIZACIÓN
// =================================================================================

// --- Elementos del DOM ---
// Referencias a los elementos de la página index.html
const formMateriaPrima = document.getElementById('form-materia-prima');
const listaMateriasPrimasContainer = document.getElementById('lista-materias-primas');
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
        renderMaterialsList(materials);
    });
}

async function addMaterial(name, price, unit) {
    if (!rawMaterialsCollectionRef) return;
    try {
        await addDoc(rawMaterialsCollectionRef, { name, price, unit, createdAt: new Date() });
    } catch (error) {
        console.error("Error al agregar el documento: ", error);
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
// 4. RENDERIZADO (DIBUJAR EN PANTALLA)
// =================================================================================

function renderMaterialsList(materials) {
    listaMateriasPrimasContainer.innerHTML = '';
    if (materials.length === 0) {
        listaMateriasPrimasContainer.innerHTML = '<p class="text-gray-500">Aún no has agregado materias primas.</p>';
        return;
    }
    materials.forEach(material => {
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
    addDeleteButtonListeners();
}

// =================================================================================
// 5. MANEJADORES DE EVENTOS Y PUNTO DE ENTRADA
// =================================================================================

async function handleMaterialFormSubmit(e) {
    e.preventDefault();
    const nombre = document.getElementById('nombre-producto').value;
    const precio = parseFloat(document.getElementById('precio-producto').value);
    const unidad = document.getElementById('unidad-producto').value;

    if (nombre && !isNaN(precio) && unidad) {
        await addMaterial(nombre, precio, unidad);
        formMateriaPrima.reset();
    }
}

function addDeleteButtonListeners() {
    document.querySelectorAll('.delete-btn').forEach(button => {
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        newButton.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            deleteMaterial(id);
        });
    });
}

function setupInitialEventListeners() {
    formMateriaPrima.addEventListener('submit', handleMaterialFormSubmit);
}

function main() {
    console.log("Página de Materias Primas iniciada.");
    setupInitialEventListeners();
    setupAuthListener();
}

document.addEventListener('DOMContentLoaded', main);
