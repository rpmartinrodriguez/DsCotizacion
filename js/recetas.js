// js/recetas.js (Versión con botones funcionales)
import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    addDoc, updateDoc, deleteDoc, getDoc, arrayUnion 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupRecetas(app) {
    const db = getFirestore(app);
    const recetasCollection = collection(db, 'recetas');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');

    // Referencias del DOM
    const btnCrearReceta = document.getElementById('btn-crear-receta');
    const recetasContainer = document.getElementById('lista-recetas-container');
    const modal = document.getElementById('receta-modal-overlay');
    const modalTitle = document.getElementById('receta-modal-title');
    const recetaNombreInput = document.getElementById('receta-nombre-input');
    const selectorIngrediente = document.getElementById('selector-ingrediente-receta');
    const cantidadIngredienteInput = document.getElementById('cantidad-ingrediente-receta');
    const btnAnadirIngrediente = document.getElementById('btn-anadir-ingrediente');
    const ingredientesEnRecetaContainer = document.getElementById('ingredientes-en-receta-container');
    const btnGuardarReceta = document.getElementById('receta-modal-btn-guardar');
    const btnCancelarReceta = document.getElementById('receta-modal-btn-cancelar');

    let materiasPrimasDisponibles = [];
    let todasLasRecetas = []; // Guardaremos todas las recetas aquí
    let ingredientesRecetaActual = [];
    let editandoId = null;

    const cargarMateriasPrimas = async () => {
        const snapshot = await getDocs(query(materiasPrimasCollection, orderBy('nombre')));
        materiasPrimasDisponibles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        selectorIngrediente.innerHTML = '<option value="">Selecciona un ingrediente</option>';
        materiasPrimasDisponibles.forEach(mp => {
            if (mp.lotes && mp.lotes.length > 0) {
                const option = document.createElement('option');
                option.value = mp.id;
                option.textContent = `${mp.nombre} (${mp.unidad})`;
                selectorIngrediente.appendChild(option);
            }
        });
    };

    const openModal = (receta = null) => {
        if (receta && receta.data) {
            editandoId = receta.id;
            modalTitle.textContent = 'Editar Receta';
            recetaNombreInput.value = receta.data.nombreTorta;
            ingredientesRecetaActual = JSON.parse(JSON.stringify(receta.data.ingredientes));
        } else {
            editandoId = null;
            modalTitle.textContent = 'Crear Nueva Receta';
            recetaNombreInput.value = '';
            ingredientesRecetaActual = [];
        }
        renderizarIngredientesEnReceta();
        modal.classList.add('visible');
    };

    const closeModal = () => modal.classList.remove('visible');

    const renderizarIngredientesEnReceta = () => {
        if (ingredientesRecetaActual.length === 0) {
            ingredientesEnRecetaContainer.innerHTML = '<p>Aún no has añadido ingredientes.</p>';
            return;
        }
        ingredientesEnRecetaContainer.innerHTML = '';
        const ul = document.createElement('ul');
        ul.className = 'lista-sencilla';
        ingredientesRecetaActual.forEach((ing, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                ${ing.nombreMateriaPrima} <span>${ing.cantidad} ${ing.unidad}</span>
                <button class="btn-quitar-ingrediente" data-index="${index}">🗑️</button>
            `;
            ul.appendChild(li);
        });
        ingredientesEnRecetaContainer.appendChild(ul);
    };

    btnAnadirIngrediente.addEventListener('click', () => {
        const idMateriaPrima = selectorIngrediente.value;
        const cantidad = parseFloat(cantidadIngredienteInput.value);
        if (!idMateriaPrima || isNaN(cantidad) || cantidad <= 0) {
            alert('Selecciona un ingrediente y una cantidad válida.');
            return;
        }
        const materiaPrima = materiasPrimasDisponibles.find(mp => mp.id === idMateriaPrima);
        ingredientesRecetaActual.push({
            idMateriaPrima: idMateriaPrima,
            nombreMateriaPrima: materiaPrima.nombre,
            cantidad: cantidad,
            unidad: materiaPrima.unidad
        });
        renderizarIngredientesEnReceta();
        selectorIngrediente.value = '';
        cantidadIngredienteInput.value = '';
    });
    
    ingredientesEnRecetaContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-quitar-ingrediente')) {
            const index = e.target.dataset.index;
            ingredientesRecetaActual.splice(index, 1);
            renderizarIngredientesEnReceta();
        }
    });

    btnGuardarReceta.addEventListener('click', async () => {
        const nombreTorta = recetaNombreInput.value.trim();
        if (!nombreTorta || ingredientesRecetaActual.length === 0) {
            alert('La receta debe tener un nombre y al menos un ingrediente.');
            return;
        }
        const recetaData = { nombreTorta, ingredientes: ingredientesRecetaActual };

        try {
            if (editandoId) {
                await updateDoc(doc(db, 'recetas', editandoId), recetaData);
                alert('¡Receta actualizada con éxito!');
            } else {
                await addDoc(recetasCollection, recetaData);
                alert('¡Receta creada con éxito!');
            }
            closeModal();
        } catch (error) {
            console.error("Error al guardar receta:", error);
        }
    });

    onSnapshot(query(recetasCollection, orderBy('nombreTorta')), (snapshot) => {
        todasLasRecetas = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        if (todasLasRecetas.length === 0) {
            recetasContainer.innerHTML = '<p>No tienes recetas guardadas. ¡Crea la primera!</p>';
            return;
        }
        recetasContainer.innerHTML = '';
        todasLasRecetas.forEach(receta => {
            const card = document.createElement('div');
            card.className = 'receta-card';
            card.innerHTML = `
                <div class="receta-card__info">
                    <h3>${receta.data.nombreTorta}</h3>
                    <p>${receta.data.ingredientes.length} ingredientes</p>
                </div>
                <div class="receta-card__actions">
                    <button class="btn-secondary btn-editar-receta" data-id="${receta.id}">Editar</button>
                    <a href="presupuesto.html?recetaId=${receta.id}" class="btn-primary btn-presupuestar-receta" data-id="${receta.id}">Presupuestar</a>
                </div>
            `;
            recetasContainer.appendChild(card);
        });
    });
    
    recetasContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-editar-receta')) {
            const id = e.target.dataset.id;
            const recetaParaEditar = todasLasRecetas.find(r => r.id === id);
            if (recetaParaEditar) {
                openModal(recetaParaEditar);
            }
        }
        // El botón de presupuestar ahora es un enlace directo, no necesita lógica aquí.
    });
    
    btnCrearReceta.addEventListener('click', () => openModal());
    btnCancelarReceta.addEventListener('click', closeModal);
    
    cargarMateriasPrimas();
}
