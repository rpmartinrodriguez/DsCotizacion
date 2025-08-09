import { 
    getFirestore, collection, onSnapshot, query, addDoc, doc, deleteDoc, orderBy
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { app } from './firebase-init.js'; // Importante: Asegúrate de tener este archivo con la inicialización de Firebase

// --- Inicialización de Firestore ---
const db = getFirestore(app);
const modelosCollection = collection(db, 'modelos3D');

// --- Referencias al DOM ---
const form = document.getElementById('form-modelo');
const listaContainer = document.getElementById('lista-modelos-container');
const recetaNombreInput = document.getElementById('receta-nombre');
const modeloUrlInput = document.getElementById('modelo-url');

// --- Función para renderizar la lista de modelos ---
const renderModelos = (modelos) => {
    listaContainer.innerHTML = ''; // Limpiamos el contenedor
    if (modelos.length === 0) {
        listaContainer.innerHTML = '<p>No hay links asociados todavía.</p>';
        return;
    }
    
    // Creamos la estructura de la tabla
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

    // Llenamos la tabla con los datos de Firebase
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

    // Añadimos los listeners a los botones de borrar
    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm('¿Estás seguro de que quieres eliminar este link?')) {
                try {
                    await deleteDoc(doc(db, 'modelos3D', id));
                    // Opcional: mostrar una notificación de éxito
                } catch (error) {
                    console.error("Error al eliminar el link:", error);
                    alert('No se pudo eliminar el link.');
                }
            }
        });
    });
};

// --- Listener de Firebase ---
// Escuchamos los cambios en la colección 'modelos3D' en tiempo real
const q = query(modelosCollection, orderBy("nombreReceta"));
onSnapshot(q, (snapshot) => {
    const modelos = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    renderModelos(modelos);
});

// --- Listener del Formulario ---
// Manejamos el evento de envío del formulario para guardar nuevos links
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombreReceta = recetaNombreInput.value;
    const urlVisor = modeloUrlInput.value;

    if (!nombreReceta.trim() || !urlVisor.trim()) {
        alert('Por favor, completa ambos campos.');
        return;
    }

    try {
        // Añadimos un nuevo documento a la colección
        await addDoc(modelosCollection, {
            nombreReceta: nombreReceta.trim(),
            urlVisor: urlVisor.trim()
        });
        form.reset();
        // Opcional: mostrar una notificación de éxito
    } catch (error) {
        console.error("Error al guardar el link:", error);
        alert('No se pudo guardar el link.');
    }
});
