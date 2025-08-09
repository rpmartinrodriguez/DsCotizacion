import { 
    getFirestore, collection, onSnapshot, query, addDoc, doc, deleteDoc, orderBy
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { app } from './firebase-init.js'; // Asumo que tienes la inicialización de Firebase en un archivo separado

const db = getFirestore(app);
const modelosCollection = collection(db, 'modelos3D');

const form = document.getElementById('form-modelo');
const listaContainer = document.getElementById('lista-modelos-container');

// Función para renderizar la lista
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
            <td data-label="URL"><a href="${modelo.data.urlVisor}" target="_blank">Ver Link</a></td>
            <td class="action-buttons stock-actions">
                <button class="btn-stock subtract btn-delete" data-id="${modelo.id}" title="Eliminar">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    listaContainer.appendChild(table);

    // Listeners para los botones de borrar
    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm('¿Estás seguro de que quieres eliminar este link?')) {
                await deleteDoc(doc(db, 'modelos3D', id));
            }
        });
    });
};

// Escuchar cambios en la colección
onSnapshot(query(modelosCollection, orderBy("nombreReceta")), (snapshot) => {
    const modelos = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    renderModelos(modelos);
});

// Manejar el envío del formulario
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombreReceta = document.getElementById('receta-nombre').value;
    const urlVisor = document.getElementById('modelo-url').value;

    if (!nombreReceta || !urlVisor) {
        alert('Por favor, completa ambos campos.');
        return;
    }

    try {
        await addDoc(modelosCollection, {
            nombreReceta: nombreReceta.trim(),
            urlVisor: urlVisor.trim()
        });
        form.reset();
        alert('¡Link guardado con éxito!');
    } catch (error) {
        console.error("Error al guardar:", error);
        alert('No se pudo guardar el link.');
    }
});
