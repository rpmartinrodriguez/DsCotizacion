// js/recetas.js (Versión con Acordeón de Categorías)
import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    setDoc, getDocs, deleteDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupRecetas(app) {
    const db = getFirestore(app);
    const recetasCollection = collection(db, 'recetas');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');

    // --- Referencias al DOM ---
    const listaRecetasContainer = document.getElementById('lista-recetas-container');
    const btnCrearReceta = document.getElementById('btn-crear-receta');
    
    // --- Referencias de la Modal (no cambian) ---
    const modal = document.getElementById('receta-modal-overlay');
    // ... (el resto de las referencias a la modal)

    let materiasPrimasDisponibles = [];
    let todasLasRecetas = [];
    let ingredientesRecetaActual = [];
    let editandoId = null;

    // --- FUNCIÓN DE RENDERIZADO (REHECHA PARA EL ACORDEÓN) ---
    const mostrarRecetas = (recetas) => {
        listaRecetasContainer.innerHTML = '';
        
        const recetasPorCategoria = {
            'Tortas': [], 'Tartas': [], 'Alfajores': [], 'Sin Categoría': []
        };

        recetas.forEach(receta => {
            const categoria = receta.data.categoria || 'Sin Categoría';
            if (!recetasPorCategoria[categoria]) {
                recetasPorCategoria[categoria] = [];
            }
            recetasPorCategoria[categoria].push(receta);
        });

        if (recetas.length === 0) {
            listaRecetasContainer.innerHTML = '<p>Aún no has creado ninguna receta.</p>';
            return;
        }

        for (const categoria in recetasPorCategoria) {
            const listaDeRecetas = recetasPorCategoria[categoria];
            if (listaDeRecetas.length > 0) {
                const acordeonItem = document.createElement('div');
                acordeonItem.className = 'categoria-acordeon';

                // Creamos el HTML para el contenido interior (las tarjetas de recetas)
                const contenidoHtml = listaDeRecetas.map(receta => `
                    <div class="receta-card">
                        <div class="receta-card__info">
                            <h3>${receta.data.nombreTorta}</h3>
                            <p>${receta.data.ingredientes.length} ingrediente(s)</p>
                        </div>
                        <div class="receta-card__actions">
                            <button class="btn-secondary btn-editar-receta" data-id="${receta.id}">Editar</button>
                            <a href="presupuesto.html?recetaId=${receta.id}" class="btn-primary">Presupuestar</a>
                        </div>
                    </div>
                `).join('');
                
                // Creamos la estructura completa del acordeón
                acordeonItem.innerHTML = `
                    <button class="categoria-acordeon__header">
                        <span class="categoria-acordeon__titulo">${categoria}</span>
                        <span class="acordeon-icono">+</span>
                    </button>
                    <div class="categoria-acordeon__content">
                        ${contenidoHtml}
                    </div>
                `;
                listaRecetasContainer.appendChild(acordeonItem);
            }
        }
    };

    // --- onSnapshot ahora guarda los datos y llama a la nueva función de renderizado ---
    onSnapshot(query(recetasCollection, orderBy('nombreTorta')), (snapshot) => {
        todasLasRecetas = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        mostrarRecetas(todasLasRecetas);
    });

    // --- NUEVO LISTENER PARA EL ACORDEÓN ---
    listaRecetasContainer.addEventListener('click', (e) => {
        const header = e.target.closest('.categoria-acordeon__header');
        if (header) {
            header.parentElement.classList.toggle('active');
        }
        
        // La lógica para editar y borrar ahora está dentro de este listener
        if (e.target.classList.contains('btn-editar-receta')) {
            const id = e.target.dataset.id;
            const recetaParaEditar = todasLasRecetas.find(r => r.id === id);
            if (recetaParaEditar) {
                openModal(recetaParaEditar);
            }
        }
        if (e.target.classList.contains('btn-borrar-receta')) {
            const id = e.target.dataset.id;
            if (confirm('¿Estás seguro de que quieres borrar esta receta? Esta acción no se puede deshacer.')) {
                deleteDoc(doc(db, 'recetas', id));
            }
        }
    });

    // --- El resto de la lógica de la modal no cambia, pero la incluyo para que el archivo esté completo ---
    const modalTitle = document.getElementById('receta-modal-title');
    const recetaNombreInput = document.getElementById('receta-nombre-input');
    const categoriaSelect = document.getElementById('receta-categoria-select');
    const selectorIngrediente = document.getElementById('selector-ingrediente-receta');
    const cantidadIngredienteInput = document.getElementById('cantidad-ingrediente-receta');
    const btnAnadirIngrediente = document.getElementById('btn-anadir-ingrediente');
    const ingredientesEnRecetaContainer = document.getElementById('ingredientes-en-receta-container');
    const btnGuardarReceta = document.getElementById('receta-modal-btn-guardar');
    const btnCancelarReceta = document.getElementById('receta-modal-btn-cancelar');

    const cargarMateriasPrimas = async () => {
        btnCrearReceta.disabled = true;
        btnCrearReceta.textContent = 'Cargando...';
        try {
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
        } catch (error) {
            console.error("Error al cargar materias primas:", error);
        } finally {
            btnCrearReceta.disabled = false;
            btnCrearReceta.textContent = 'Crear Nueva Receta';
        }
    };
    const openModal = (receta = null) => {
        if (receta && receta.data) {
            editandoId = receta.id;
            modalTitle.textContent = 'Editar Receta';
            recetaNombreInput.value = receta.data.nombreTorta;
            categoriaSelect.value = receta.data.categoria || '';
            ingredientesRecetaActual = JSON.parse(JSON.stringify(receta.data.ingredientes));
        } else {
            editandoId = null;
            modalTitle.textContent = 'Crear Nueva Receta';
            recetaNombreInput.value = '';
            categoriaSelect.value = '';
            ingredientesRecetaActual = [];
        }
        renderizarIngredientesEnReceta();
        modal.classList.add('visible');
    };
    const closeModal = () => modal.classList.remove('visible');
    const renderizarIngredientesEnReceta = () => {
        ingredientesEnRecetaContainer.innerHTML = '';
        if (ingredientesRecetaActual.length === 0) {
            ingredientesEnRecetaContainer.innerHTML = '<p>Aún no has añadido ingredientes.</p>';
            return;
        }
        const ul = document.createElement('ul');
        ul.className = 'lista-sencilla';
        ingredientesEnRecetaActual.forEach((ing, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                ${ing.nombreMateriaPrima} <span>${ing.cantidad.toLocaleString('es-AR')} ${ing.unidad}</span>
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
        const categoria = categoriaSelect.value;
        if (!nombreTorta || !categoria || ingredientesRecetaActual.length === 0) {
            alert('Por favor, completa el nombre, selecciona una categoría y añade al menos un ingrediente.');
            return;
        }
        const recetaData = { nombreTorta, categoria, ingredientes: ingredientesRecetaActual };
        try {
            if (editandoId) {
                await updateDoc(doc(db, 'recetas', editandoId), recetaData);
            } else {
                await addDoc(recetasCollection, recetaData);
            }
            closeModal();
        } catch (error) {
            console.error("Error al guardar receta:", error);
        }
    });
    btnCrearReceta.addEventListener('click', () => openModal());
    btnCancelarReceta.addEventListener('click', closeModal);
    cargarMateriasPrimas();
}
