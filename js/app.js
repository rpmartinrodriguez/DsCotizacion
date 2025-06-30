// js/app.js

// 1. Importar funciones de Firebase y la configuración local
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import { 
    getFirestore, collection, onSnapshot, addDoc, 
    deleteDoc, doc, getDoc, updateDoc, query, orderBy 
} from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

// 2. Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const materiasPrimasCollection = collection(db, 'materiasPrimas');

// --- REFERENCIAS A ELEMENTOS DEL DOM ---
const form = document.getElementById('form-materia-prima');
const tablaBody = document.querySelector("#tabla-materias-primas tbody");
const editIdInput = document.getElementById('edit-id');
const guardarBtn = document.getElementById('btn-guardar');

let modoEdicion = false;

// --- LÓGICA PRINCIPAL ---

// 1. RENDERIZAR LA TABLA CON DATOS DE FIRESTORE
const renderizarTabla = (snapshot) => {
    tablaBody.innerHTML = '';
    snapshot.forEach(doc => {
        const item = doc.data();
        const id = doc.id;
        const precioPorUnidad = (item.precio / item.cantidad).toFixed(2);
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${item.nombre}</td>
            <td>$${item.precio} / ${item.cantidad} ${item.unidad}</td>
            <td>$${precioPorUnidad} por ${item.unidad}</td>
            <td class="action-buttons">
                <button class="btn-edit" data-id="${id}">✏️</button>
                <button class="btn-delete" data-id="${id}">🗑️</button>
            </td>
        `;
        tablaBody.appendChild(fila);
    });
};

// 2. ESCUCHAR CAMBIOS EN TIEMPO REAL
const q = query(materiasPrimasCollection, orderBy("nombre"));
onSnapshot(q, renderizarTabla);

// 3. MANEJAR EL ENVÍO DEL FORMULARIO (CREAR O ACTUALIZAR)
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const materiaPrima = {
        nombre: form.nombre.value,
        precio: parseFloat(form.precio.value),
        cantidad: parseFloat(form.cantidad.value),
        unidad: form.unidad.value,
    };

    try {
        if (modoEdicion) {
            const docRef = doc(db, 'materiasPrimas', editIdInput.value);
            await updateDoc(docRef, materiaPrima);
        } else {
            await addDoc(materiasPrimasCollection, materiaPrima);
        }
        resetFormulario();
    } catch (error) {
        console.error("Error al guardar: ", error);
    }
});

// 4. MANEJAR CLICS EN BOTONES DE EDITAR Y BORRAR
tablaBody.addEventListener('click', async (e) => {
    const id = e.target.dataset.id;
    if (!id) return;

    const docRef = doc(db, 'materiasPrimas', id);

    if (e.target.classList.contains('btn-delete')) {
        if (confirm('¿Estás seguro de que quieres eliminar esta materia prima?')) {
            await deleteDoc(docRef);
        }
    }

    if (e.target.classList.contains('btn-edit')) {
        const docSnap = await getDoc(docRef);
        const item = docSnap.data();
        
        form.nombre.value = item.nombre;
        form.precio.value = item.precio;
        form.cantidad.value = item.cantidad;
        form.unidad.value = item.unidad;
        editIdInput.value = id;

        modoEdicion = true;
        guardarBtn.textContent = 'Actualizar Materia Prima';
        window.scrollTo(0, 0);
    }
});

function resetFormulario() {
    form.reset();
    editIdInput.value = '';
    modoEdicion = false;
    guardarBtn.textContent = 'Guardar Materia Prima';
}
