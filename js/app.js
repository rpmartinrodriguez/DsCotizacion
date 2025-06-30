// Reemplaza el contenido de js/app.js
import { 
    getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, 
    getDoc, updateDoc, query, orderBy 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupMateriasPrimas(app) {
    const db = getFirestore(app);
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const form = document.getElementById('form-materia-prima');
    const tablaBody = document.querySelector("#tabla-materias-primas tbody");
    const editIdInput = document.getElementById('edit-id');
    const guardarBtn = document.getElementById('btn-guardar');
    const stockGroup = document.getElementById('stock-inicial-group');

    let modoEdicion = false;

    const renderizarTabla = (snapshot) => {
        // ... (esta función no necesita cambios)
        tablaBody.innerHTML = '';
        if (snapshot.empty) {
            tablaBody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No hay materias primas. ¡Agrega la primera!</td></tr>`;
            return;
        }
        snapshot.forEach(doc => {
            const item = doc.data();
            const id = doc.id;
            const precioPorUnidad = (item.precio / item.cantidad).toFixed(2);
            const fila = document.createElement('tr');
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

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const materiaPrima = {
            nombre: form.nombre.value,
            precio: parseFloat(form.precio.value),
            cantidad: parseFloat(form.cantidad.value),
            unidad: form.unidad.value,
        };

        if (materiaPrima.cantidad <= 0) {
            alert("La cantidad de compra debe ser mayor que cero.");
            return;
        }

        try {
            if (modoEdicion) {
                // En modo edición, no actualizamos el stock desde aquí.
                // Eso se maneja en la página de Stock.
                const docRef = doc(db, 'materiasPrimas', editIdInput.value);
                await updateDoc(docRef, materiaPrima);
            } else {
                // Al crear, sí guardamos el stock inicial.
                materiaPrima.stockActual = parseFloat(form.stock.value) || 0;
                await addDoc(materiasPrimasCollection, materiaPrima);
            }
            resetFormulario();
        } catch (error) {
            console.error("Error al guardar:", error);
        }
    });
    
    tablaBody.addEventListener('click', async (e) => {
        const target = e.target.closest('.btn-delete, .btn-edit');
        if (!target) return;
        const id = target.dataset.id;
        const docRef = doc(db, 'materiasPrimas', id);

        if (target.classList.contains('btn-delete')) {
            if (confirm('¿Estás seguro? Esto eliminará el producto y su stock.')) {
                await deleteDoc(docRef);
            }
        }

        if (target.classList.contains('btn-edit')) {
            const docSnap = await getDoc(docRef);
            const item = docSnap.data();
            
            form.nombre.value = item.nombre;
            form.precio.value = item.precio;
            form.cantidad.value = item.cantidad;
            form.unidad.value = item.unidad;
            editIdInput.value = id;
            
            modoEdicion = true;
            stockGroup.style.display = 'none'; // Ocultamos el campo de stock al editar
            guardarBtn.textContent = 'Actualizar Producto';
            window.scrollTo(0, 0);
        }
    });

    function resetFormulario() {
        form.reset();
        editIdInput.value = '';
        modoEdicion = false;
        stockGroup.style.display = 'flex'; // Mostramos el campo de stock al resetear
        guardarBtn.textContent = 'Guardar Producto';
    }
}
