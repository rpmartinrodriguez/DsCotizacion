import {
    getFirestore, collection, onSnapshot, query, addDoc, doc,
    deleteDoc, orderBy, getDocs
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const modelosCollection = collection(db, 'modelos3D');
const recetasCollection = collection(db, 'recetas');

const form = document.getElementById('form-modelo');
const listaContainer = document.getElementById('lista-modelos-container');
const recetaNombreInput = document.getElementById('receta-nombre');
const modeloUrlInput = document.getElementById('modelo-url');
const datalistRecetas = document.getElementById('lista-recetas-existentes');

let unsubscribeModelos = null;

const normalizarUrl = (value) => {
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        return url.toString();
    } catch {
        return null;
    }
};

const cargarRecetasExistentes = async () => {
    try {
        const snapshot = await getDocs(query(recetasCollection, orderBy('nombreTorta')));
        datalistRecetas.innerHTML = '';

        snapshot.forEach((documento) => {
            const receta = documento.data();
            const option = document.createElement('option');
            option.value = receta.nombreTorta || '';
            datalistRecetas.appendChild(option);
        });
    } catch (error) {
        console.error("Error al cargar recetas:", error);
    }
};

const crearTablaModelos = (modelos) => {
    listaContainer.innerHTML = '';

    if (modelos.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'No hay links asociados todavía.';
        listaContainer.appendChild(empty);
        return;
    }

    const table = document.createElement('table');
    table.className = 'table-clean';

    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Nombre de la receta</th>
            <th>URL del visor</th>
            <th>Acciones</th>
        </tr>
    `;

    const tbody = document.createElement('tbody');

    modelos.forEach((modelo) => {
        const tr = document.createElement('tr');

        const recetaCell = document.createElement('td');
        recetaCell.dataset.label = 'Receta';
        recetaCell.textContent = modelo.data.nombreReceta || 'Sin nombre';

        const urlCell = document.createElement('td');
        urlCell.dataset.label = 'URL';

        const url = normalizarUrl(modelo.data.urlVisor || '');
        if (url) {
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = 'Abrir visor';
            link.title = url;
            urlCell.appendChild(link);
        } else {
            urlCell.textContent = 'URL inválida';
        }

        const actionsCell = document.createElement('td');
        actionsCell.className = 'action-buttons stock-actions';

        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn-stock subtract btn-delete';
        deleteButton.dataset.id = modelo.id;
        deleteButton.title = 'Eliminar';
        deleteButton.type = 'button';
        deleteButton.textContent = '🗑️';
        actionsCell.appendChild(deleteButton);

        tr.append(recetaCell, urlCell, actionsCell);
        tbody.appendChild(tr);
    });

    table.append(thead, tbody);
    listaContainer.appendChild(table);
};

const startListeners = () => {
    if (unsubscribeModelos) return;

    unsubscribeModelos = onSnapshot(
        query(modelosCollection, orderBy('nombreReceta')),
        (snapshot) => {
            const modelos = snapshot.docs.map((documento) => ({
                id: documento.id,
                data: documento.data()
            }));
            crearTablaModelos(modelos);
        },
        (error) => {
            console.error("Error al cargar modelos 3D:", error);
            listaContainer.textContent = 'No se pudieron cargar los links.';
        }
    );
};

listaContainer.addEventListener('click', async (event) => {
    const button = event.target.closest('.btn-delete');
    if (!button) return;

    if (!auth.currentUser) {
        window.location.replace('login.html');
        return;
    }

    if (!confirm('¿Querés eliminar este link?')) return;

    try {
        await deleteDoc(doc(db, 'modelos3D', button.dataset.id));
    } catch (error) {
        console.error("Error al eliminar el link:", error);
        alert('No se pudo eliminar el link.');
    }
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!auth.currentUser || auth.currentUser.isAnonymous) {
        window.location.replace('login.html');
        return;
    }

    const nombreReceta = recetaNombreInput.value.trim();
    const urlVisor = normalizarUrl(modeloUrlInput.value.trim());

    if (!nombreReceta || !urlVisor) {
        alert('Completá una receta y una URL http/https válida.');
        return;
    }

    try {
        await addDoc(modelosCollection, {
            nombreReceta,
            urlVisor
        });
        form.reset();
    } catch (error) {
        console.error("Error al guardar el link:", error);
        alert('No se pudo guardar el link.');
    }
});

onAuthStateChanged(auth, (user) => {
    if (!user || user.isAnonymous) {
        window.location.replace('login.html');
        return;
    }

    startListeners();
    cargarRecetasExistentes();
});
