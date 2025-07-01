// Crea un nuevo archivo: js/recetas.js
import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    addDoc, updateDoc, deleteDoc, getDocs 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupRecetas(app) {
    const db = getFirestore(app);
    const recetasCollection = collection(db, 'recetas');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');

    // Referencias del DOM
    const btnCrearReceta = document.getElementById('btn-crear-receta');
    const recetasContainer = document.getElementById('lista-recetas-container');
    
    // Referencias de la Modal
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
    let ingredientesRecetaActual = [];
    let editandoId = null;

    // --- Cargar Datos ---
    const cargarMateriasPrimas = async () => {
        const snapshot = await getDocs(query(materiasPrimasCollection, orderBy('nombre')));
        materiasPrimasDisponibles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        selectorIngrediente.innerHTML = '<option value="">Selecciona un ingrediente</option>';
        materiasPrimasDisponibles.forEach(mp => {
            if (mp.lotes && mp.lotes.length > 0) { // Solo mostrar materias primas con lotes/stock
                const option = document.createElement('option');
                option.value = mp.id;
                option.textContent = `${mp.nombre} (${mp.unidad})`;
                selectorIngrediente.appendChild(option);
            }
        });
    };

    // --- Lógica de la Modal ---
    const openModal = (receta = null) => {
        if (receta) {
            editandoId = receta.id;
            modalTitle.textContent = 'Editar Receta';
            recetaNombreInput.value = receta.data.nombreTorta;
            ingredientesRecetaActual = [...receta.data.ingredientes];
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

    btnCrearReceta.addEventListener('click', () => openModal());
    btnCancelarReceta.addEventListener('click', closeModal);

    // --- Renderizar Tarjetas de Recetas ---
    onSnapshot(query(recetasCollection, orderBy('nombreTorta')), (snapshot) => {
        if (snapshot.empty) {
            recetasContainer.innerHTML = '<p>No tienes recetas guardadas. ¡Crea la primera!</p>';
            return;
        }
        recetasContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const receta = { id: doc.id, data: doc.data() };
            const card = document.createElement('div');
            card.className = 'receta-card';
            card.innerHTML = `
                <div class="receta-card__info">
                    <h3>${receta.data.nombreTorta}</h3>
                    <p>${receta.data.ingredientes.length} ingredientes</p>
                </div>
                <div class="receta-card__actions">
                    <button class="btn-secondary btn-editar-receta" data-id="${receta.id}">Editar</button>
                    <a href="#" class="btn-primary btn-presupuestar-receta" data-id="${receta.id}">Presupuestar</a>
                </div>
            `;
            recetasContainer.appendChild(card);
        });
    });
    
    recetasContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-editar-receta')) {
            const id = e.target.dataset.id;
            const receta = { id, data: todoElHistorial.find(r => r.id === id)?.data }; // Necesitamos cargar los datos aquí
            // Esto es un placeholder, necesitamos una forma de obtener la receta completa
        }
        if (e.target.classList.contains('btn-presupuestar-receta')) {
            // Lógica de la Fase 2
        }
    });
    
    // Carga inicial
    cargarMateriasPrimas();
}
