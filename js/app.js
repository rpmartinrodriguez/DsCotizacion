// js/app.js

import { 
    getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, 
    getDoc, updateDoc, query, orderBy 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Cambié el nombre de la función para mayor claridad
export function setupMateriasPrimas(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');

    const form = document.getElementById('form-materia-prima');
    const tablaBody = document.querySelector("#tabla-materias-primas tbody");
    const editIdInput = document.getElementById('edit-id');
    const guardarBtn = document.getElementById('btn-guardar');
    
    let modoEdicion = false;

    // LÓGICA DE RENDERIZADO CORREGIDA
    const renderizarTabla = (snapshot) => {
        tablaBody.innerHTML = '';
        if (snapshot.empty) {
            tablaBody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No hay materias primas. ¡Agrega la primera!</td></tr>`;
            return;
        }
        snapshot.forEach(doc => {
            const item = doc.data();
            const id = doc.id;
            // Cálculo del costo unitario restaurado
            const precioPorUnidad = (item.precio / item.cantidad).toFixed(2);
            const fila = document.createElement('tr');
            // Columnas de la tabla restauradas para mostrar toda la info
            fila.innerHTML = `
                <td>${item.nombre}</td>
                <td>$${Number(item.precio).toFixed(2)} / ${item.cantidad} ${item.unidad}</td>
                <td>$${precioPorUnidad} por ${item.unidad}</td>
                <td class="action-buttons">
                    <button class="btn-edit" data-id="${id}">✏️</button>
                    <button class="btn-delete" data-id="${id}">🗑️</button>
                </td>
            `;
            tablaBody.appendChild(fila);
        });
    };

    const q = query(materiasPrimasCollection, orderBy("nombre"));
    onSnapshot(q, renderizarTabla);

    // LÓGICA DE GUARDADO CORREGIDA
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Lectura del campo 'cantidad' restaurada
        const materiaPrima = {
            nombre: form.nombre.value,
            precio: parseFloat(form.precio.value),
            cantidad: parseFloat(form.cantidad.value), // <-- CORREGIDO
            unidad: form.unidad.value,
        };

        // Validar que la cantidad no sea cero para evitar divisiones por cero
        if (materiaPrima.cantidad <= 0) {
            alert("La cantidad de compra debe ser mayor que cero.");
            return;
        }

        try {
            if (modoEdicion) {
                const docRef = doc(db, 'materiasPrimas', editIdInput.value);
                await updateDoc(docRef, materiaPrima);
            } else {
                await addDoc(materiasPrimasCollection, materiaPrima);
            }
            resetFormulario();
        } catch (error) {
            console.error("Error al guardar en Firebase:", error);
        }
    });
    
    // LÓGICA DE EDICIÓN CORREGIDA
    tablaBody.addEventListener('click', async (e) => {
        const target = e.target.closest('.btn-delete, .btn-edit');
        if (!target) return;

        const id = target.dataset.id;
        const docRef = doc(db, 'materiasPrimas', id);

        if (target.classList.contains('btn-delete')) {
            if (confirm('¿Estás seguro de que quieres eliminar esta materia prima?')) {
                await deleteDoc(docRef);
            }
        }

        if (target.classList.contains('btn-edit')) {
            const docSnap = await getDoc(docRef);
            const item = docSnap.data();
            
            form.nombre.value = item.nombre;
            form.precio.value = item.precio;
            form.cantidad.value = item.cantidad; // <-- CORREGIDO
            form.unidad.value = item.unidad;
            editIdInput.value = id;
            
            modoEdicion = true;
            guardarBtn.textContent = 'Actualizar Producto';
            window.scrollTo(0, 0);
        }
    });

    function resetFormulario() {
        form.reset();
        editIdInput.value = '';
        modoEdicion = false;
        guardarBtn.textContent = 'Guardar Producto';
    }
}
