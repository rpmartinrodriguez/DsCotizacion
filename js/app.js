// js/app.js

// --- INICIALIZACIÓN DE FIREBASE (asume que firebaseConfig ya está cargado) ---
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const materiasPrimasCollection = db.collection('materiasPrimas');

// --- REFERENCIAS A ELEMENTOS DEL DOM ---
const form = document.getElementById('form-materia-prima');
const tablaBody = document.querySelector("#tabla-materias-primas tbody");
const editIdInput = document.getElementById('edit-id');
const guardarBtn = document.getElementById('btn-guardar');

let modoEdicion = false;

// --- LÓGICA PRINCIPAL ---

// 1. RENDERIZAR LA TABLA CON DATOS DE FIRESTORE
const renderizarTabla = (snapshot) => {
    tablaBody.innerHTML = ''; // Limpiar la tabla antes de dibujar
    snapshot.forEach(doc => {
        const item = doc.data();
        const id = doc.id;
        
        // Calcular el precio por unidad para mostrarlo
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
materiasPrimasCollection.orderBy("nombre").onSnapshot(renderizarTabla);

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
            // Actualizar documento existente
            const id = editIdInput.value;
            await materiasPrimasCollection.doc(id).update(materiaPrima);
            console.log('¡Materia prima actualizada!');
        } else {
            // Crear nuevo documento
            await materiasPrimasCollection.add(materiaPrima);
            console.log('¡Materia prima guardada!');
        }
        resetFormulario();
    } catch (error) {
        console.error("Error al guardar: ", error);
    }
});

// 4. MANEJAR CLICS EN BOTONES DE EDITAR Y BORRAR (Delegación de eventos)
tablaBody.addEventListener('click', async (e) => {
    const id = e.target.dataset.id;

    if (!id) return; // Salir si el clic no fue en un botón con data-id

    // Botón de Borrar
    if (e.target.classList.contains('btn-delete')) {
        if (confirm('¿Estás seguro de que quieres eliminar esta materia prima?')) {
            try {
                await materiasPrimasCollection.doc(id).delete();
                console.log('¡Materia prima eliminada!');
            } catch (error) {
                console.error("Error al eliminar: ", error);
            }
        }
    }

    // Botón de Editar
    if (e.target.classList.contains('btn-edit')) {
        try {
            const doc = await materiasPrimasCollection.doc(id).get();
            const item = doc.data();
            
            form.nombre.value = item.nombre;
            form.precio.value = item.precio;
            form.cantidad.value = item.cantidad;
            form.unidad.value = item.unidad;
            editIdInput.value = id;

            modoEdicion = true;
            guardarBtn.textContent = 'Actualizar Materia Prima';
            window.scrollTo(0, 0);
        } catch (error) {
            console.error("Error al obtener para editar: ", error);
        }
    }
});

// --- FUNCIONES AUXILIARES ---
function resetFormulario() {
    form.reset();
    editIdInput.value = '';
    modoEdicion = false;
    guardarBtn.textContent = 'Guardar Materia Prima';
}
