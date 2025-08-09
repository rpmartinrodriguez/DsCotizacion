import { 
    getFirestore, collection, onSnapshot, query, addDoc, doc, deleteDoc, orderBy
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
// --- MODIFICACIÓN: Importamos las funciones de autenticación ---
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

// --- Configuración de Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyA33nr4_j2kMIeDJ-fyRqKLkUw9AToRnnM",
  authDomain: "dscotizacion.firebaseapp.com",
  projectId: "dscotizacion",
  storageBucket: "dscotizacion.firebasestorage.app",
  messagingSenderId: "103917274080",
  appId: "1:103917274080:web:478f18b226473a70202185"
};

// --- Inicialización de Firebase ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// --- MODIFICACIÓN: Creamos la instancia de autenticación ---
const auth = getAuth(app);
const modelosCollection = collection(db, 'modelos3D');

// --- Referencias al DOM ---
const form = document.getElementById('form-modelo');
const listaContainer = document.getElementById('lista-modelos-container');
const recetaNombreInput = document.getElementById('receta-nombre');
const modeloUrlInput = document.getElementById('modelo-url');

// --- Función para renderizar la lista de modelos ---
const renderModelos = (modelos) => {
    listaContainer.innerHTML = '';
    if (modelos.length === 0) {
        listaContainer.innerHTML = '<p>No hay links asociados todavía.</p>';
        return;
    }
    
    const table = document.createElement('table');
    table.className = 'table-clean';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Nombre de la Receta</th>
                <th>URL del Visor</th>
                <th>Acciones</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    modelos.forEach(modelo => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Receta">${modelo.data.nombreReceta}</td>
            <td data-label="URL"><a href="${modelo.data.urlVisor}" target="_blank" title="${modelo.data.urlVisor}">Ver Link</a></td>
            <td class="action-buttons stock-actions">
                <button class="btn-stock subtract btn-delete" data-id="${modelo.id}" title="Eliminar">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    listaContainer.appendChild(table);

    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm('¿Estás seguro de que quieres eliminar este link?')) {
                await deleteDoc(doc(db, 'modelos3D', id));
            }
        });
    });
};

// --- Listener de Firebase ---
const startListeners = () => {
    const q = query(modelosCollection, orderBy("nombreReceta"));
    onSnapshot(q, (snapshot) => {
        const modelos = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        renderModelos(modelos);
    }, (error) => {
        console.error("Error al escuchar la colección 'modelos3D': ", error);
        listaContainer.innerHTML = '<p style="color: red;">Error al cargar los links. Revisa las reglas de seguridad de Firebase.</p>';
    });
};

// --- Listener del Formulario ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombreReceta = recetaNombreInput.value;
    const urlVisor = modeloUrlInput.value;

    if (!auth.currentUser) {
        alert("Error de autenticación. Por favor, recarga la página.");
        return;
    }

    if (!nombreReceta.trim() || !urlVisor.trim()) {
        alert('Por favor, completa ambos campos.');
        return;
    }

    try {
        await addDoc(modelosCollection, {
            nombreReceta: nombreReceta.trim(),
            urlVisor: urlVisor.trim()
        });
        form.reset();
    } catch (error) {
        console.error("Error al guardar el link:", error);
        alert('No se pudo guardar el link.');
    }
});

// --- MODIFICACIÓN: Lógica de Autenticación y Punto de Entrada ---
const main = () => {
    onAuthStateChanged(auth, user => {
        if (user) {
            console.log("Usuario anónimo autenticado:", user.uid);
            startListeners(); // Empezamos a escuchar los datos solo después de tener un usuario
        } else {
            signInAnonymously(auth).catch(error => {
                console.error("Error al iniciar sesión anónimamente:", error);
            });
        }
    });
};

// Iniciamos la aplicación cuando el contenido de la página esté cargado
document.addEventListener('DOMContentLoaded', main);
