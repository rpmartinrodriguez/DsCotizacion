import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    setDoc, getDocs, deleteDoc, addDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { addToCart, updateCartIcon } from './cart.js';

export function setupRecetas(app) {
    const db = getFirestore(app);
    const recetasCollection = collection(db, 'recetas');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');

    // Referencias al DOM
    const listaRecetasContainer = document.getElementById('lista-recetas-container');
    const btnCrearReceta = document.getElementById('btn-crear-receta');
    
    // Referencias de la Modal
    const modal = document.getElementById('receta-modal-overlay');
    const modalTitle = document.getElementById('receta-modal-title');
    const recetaNombreInput = document.getElementById('receta-nombre-input');
    const categoriaSelect = document.getElementById('receta-categoria-select');
    const ingredienteInput = document.getElementById('selector-ingrediente-receta');
    const ingredientesDatalist = document.getElementById('lista-materias-primas-receta');
    const cantidadIngredienteInput = document.getElementById('cantidad-ingrediente-receta');
    const btnAnadirIngrediente = document.getElementById('btn-anadir-ingrediente');
    const ingredientesEnRecetaContainer = document.getElementById('ingredientes-en-receta-container');
    const btnGuardarReceta = document.getElementById('receta-modal-btn-guardar');
    const btnCancelarReceta = document.getElementById('receta-modal-btn-cancelar');

    // Variables de Estado
    let materiasPrimasDisponibles = [];
    let todasLasRecetas = [];
    let ingredientesRecetaActual = [];
    let editandoId = null;
    const ordenDeCategorias = ['Tortas', 'Tartas', 'Alfajores', 'Budines', "Mix D's", 'Sin TACC', 'Sin Categoría'];

    const cargarMateriasPrimas = async () => {
        btnCrearReceta.disabled = true;
        btnCrearReceta.textContent = 'Cargando...';
        try {
            const snapshot = await getDocs(query(materiasPrimasCollection, orderBy('nombre')));
            materiasPrimasDisponibles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            ingredientesDatalist.innerHTML = '';
            materiasPrimasDisponibles.forEach(mp => {
                if (mp.lotes && mp.lotes.length > 0) {
                    const option = document.createElement('option');
                    option.value = mp.nombre;
                    ingredientesDatalist.appendChild(option);
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
            modalTitle.textContent = `Editar Receta: ${receta.data.nombreTorta}`;
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
        ingredientesRecetaActual.forEach((ing, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                ${ing.nombreMateriaPrima} <span>${ing.cantidad.toLocaleString('es-AR')} ${ing.unidad}</span>
                <button class="btn-quitar-ingrediente" data-index="${index}">🗑️</button>
            `;
            ul.appendChild(li);
        });
        ingredientesEnRecetaContainer.appendChild(ul);
    };

    const anadirIngrediente = () => {
        const nombreIngrediente = ingredienteInput.value;
        const cantidad = parseFloat(cantidadIngredienteInput.value);

        if (!nombreIngrediente || isNaN(cantidad) || cantidad <= 0) {
            alert('Escribe o selecciona un ingrediente y una cantidad válida.');
            return;
        }
        const materiaPrima = materiasPrimasDisponibles.find(mp => mp.nombre === nombreIngrediente);
        if (!materiaPrima) {
            alert('Ingrediente no encontrado. Por favor, selecciónalo de la lista o verifica el nombre.');
            return;
        }
        if (ingredientesRecetaActual.some(ing => ing.idMateriaPrima === materiaPrima.id)) {
            alert('Este ingrediente ya está en la receta.');
            return;
        }
        ingredientesRecetaActual.push({
            idMateriaPrima: materiaPrima.id,
            nombreMateriaPrima: materiaPrima.nombre,
            cantidad: cantidad,
            unidad: materiaPrima.unidad
        });
        renderizarIngredientesEnReceta();
        ingredienteInput.value = '';
        cantidadIngredienteInput.value = '';
    };

    const guardarReceta = async () => {
        const nombreTorta = recetaNombreInput.value.trim();
        const categoria = categoriaSelect.value;
        if (!nombreTorta || !categoria || ingredientesRecetaActual.length === 0) {
            alert('Por favor, completa el nombre, selecciona una categoría y añade al menos un ingrediente.');
            return;
        }
        const id = editandoId || doc(collection(db, 'recetas')).id;
        const recetaData = { nombreTorta, categoria, ingredientes: ingredientesRecetaActual };
        try {
            await setDoc(doc(db, 'recetas', id), recetaData);
            alert(editandoId ? '¡Receta actualizada con éxito!' : '¡Receta creada con éxito!');
            closeModal();
        } catch (error) {
            console.error("Error al guardar receta:", error);
            alert("Hubo un error al guardar la receta.");
        }
    };
    
    const mostrarRecetas = (recetas) => {
        listaRecetasContainer.innerHTML = '';
        const recetasPorCategoria = {};
        ordenDeCategorias.forEach(cat => recetasPorCategoria[cat] = []);

        recetas.forEach(receta => {
            const categoria = receta.data.categoria || 'Sin Categoría';
            if (!recetasPorCategoria[categoria]) {
                recetasPorCategoria[categoria] = [];
            }
            recetasPorCategoria[categoria].push(receta);
        });

        if (recetas.length === 0) {
            listaRecetasContainer.innerHTML = '<p>No tienes recetas guardadas. ¡Crea la primera!</p>';
            return;
        }

        ordenDeCategorias.forEach(categoria => {
            const listaDeRecetas = recetasPorCategoria[categoria];
            if (listaDeRecetas && listaDeRecetas.length > 0) {
                const acordeonItem = document.createElement('div');
                acordeonItem.className = 'categoria-acordeon';
                const contenidoHtml = listaDeRecetas.map(receta => `
                    <div class="receta-card">
                        <div class="receta-card__info">
                            <h3>${receta.data.nombreTorta}</h3>
                            <p>${receta.data.ingredientes.length} ingrediente(s)</p>
                        </div>
                        <div class="receta-card__actions">
                            <button class="btn-secondary btn-editar-receta" data-id="${receta.id}">Editar</button>
                            <button class="btn-secondary btn-anadir-cotizacion" data-id="${receta.id}">Añadir 🛒</button>
                            <a href="presupuesto.html?recetaId=${receta.id}" class="btn-primary">Presupuestar</a>
                        </div>
                    </div>
                `).join('');
                
                acordeonItem.innerHTML = `
                    <button class="categoria-acordeon__header">
                        <span class="categoria-acordeon__titulo">${categoria}</span>
                        <span class="acordeon-icono">+</span>
                    </button>
                    <div class="categoria-acordeon__content">${contenidoHtml}</div>
                `;
                listaRecetasContainer.appendChild(acordeonItem);
            }
        });
    };
    
    onSnapshot(query(recetasCollection, orderBy('nombreTorta')), (snapshot) => {
        todasLasRecetas = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        mostrarRecetas(todasLasRecetas);
    });

    listaRecetasContainer.addEventListener('click', (e) => {
        const header = e.target.closest('.categoria-acordeon__header');
        if (header) {
            header.parentElement.classList.toggle('active');
            return;
        }
        
        const targetEditar = e.target.closest('.btn-editar-receta');
        if (targetEditar) {
            const id = targetEditar.dataset.id;
            const recetaParaEditar = todasLasRecetas.find(r => r.id === id);
            if (recetaParaEditar) openModal(recetaParaEditar);
            return;
        }
        
        const targetAnadir = e.target.closest('.btn-anadir-cotizacion');
        if(targetAnadir) {
            const id = targetAnadir.dataset.id;
            const recetaParaAnadir = todasLasRecetas.find(r => r.id === id);
            if (recetaParaAnadir) {
                addToCart(recetaParaAnadir);
            }
            return;
        }

        const targetBorrar = e.target.closest('.btn-borrar-receta');
        if (targetBorrar) {
            const id = targetBorrar.dataset.id;
            if (confirm('¿Estás seguro de que quieres borrar esta receta? Esta acción no se puede deshacer.')) {
                deleteDoc(doc(db, 'recetas', id));
            }
        }
    });

    ingredientesEnRecetaContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-quitar-ingrediente')) {
            const index = parseInt(e.target.dataset.index, 10);
            ingredientesRecetaActual.splice(index, 1);
            renderizarIngredientesEnReceta();
        }
    });
    
    btnCrearReceta.addEventListener('click', () => openModal(null));
    btnCancelarReceta.addEventListener('click', closeModal);
    btnGuardarReceta.addEventListener('click', guardarReceta);
    btnAnadirIngrediente.addEventListener('click', anadirIngrediente);
    
    // Carga inicial
    cargarMateriasPrimas();
    updateCartIcon();
}
