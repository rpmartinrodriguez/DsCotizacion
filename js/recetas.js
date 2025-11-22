import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    setDoc, getDocs, deleteDoc, addDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { addToCart, updateCartIcon } from './cart.js';

export function setupRecetas(app) {
    const db = getFirestore(app);
    const recetasCollection = collection(db, 'recetas');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const categoriasCollection = collection(db, 'categorias');

    // ==================================================================
    // 1. REFERENCIAS AL DOM
    // ==================================================================
    
    const listaRecetasContainer = document.getElementById('lista-recetas-container');
    const btnCrearReceta = document.getElementById('btn-crear-receta');
    
    // Modal de Recetas
    const modal = document.getElementById('receta-modal-overlay');
    const modalTitle = document.getElementById('receta-modal-title');
    const recetaNombreInput = document.getElementById('receta-nombre-input');
    const categoriaSelect = document.getElementById('receta-categoria-select');
    const rendimientoInput = document.getElementById('receta-rendimiento-input');
    const ingredienteInput = document.getElementById('selector-ingrediente-receta');
    const ingredientesDatalist = document.getElementById('lista-materias-primas-receta');
    const cantidadIngredienteInput = document.getElementById('cantidad-ingrediente-receta');
    const btnAnadirIngrediente = document.getElementById('btn-anadir-ingrediente');
    const ingredientesEnRecetaContainer = document.getElementById('ingredientes-en-receta-container');
    const btnGuardarReceta = document.getElementById('receta-modal-btn-guardar');
    const btnCancelarReceta = document.getElementById('receta-modal-btn-cancelar');

    // Categorías
    const formCategoria = document.getElementById('form-categoria');
    const inputNuevaCategoria = document.getElementById('nueva-categoria-nombre');
    const listaCategoriasContainer = document.getElementById('lista-categorias-container');

    // Modal de Porciones (El que calcula el precio)
    const modalPorciones = document.getElementById('modal-porciones');
    const porcionesRecetaNombre = document.getElementById('porciones-receta-nombre');
    const porcionesRendimientoTotal = document.getElementById('porciones-rendimiento-total');
    const inputCantidadPorciones = document.getElementById('input-cantidad-porciones');
    const porcionesCostoEstimado = document.getElementById('porciones-costo-estimado');
    const btnConfirmarPorciones = document.getElementById('btn-confirmar-porciones');
    const btnCancelarPorciones = document.getElementById('btn-cancelar-porciones');

    // ==================================================================
    // 2. VARIABLES DE ESTADO
    // ==================================================================
    let materiasPrimasDisponibles = [];
    let todasLasRecetas = [];
    let ingredientesRecetaActual = [];
    let editandoId = null;
    
    let recetaSeleccionadaParaCarrito = null; 
    let costoUnitarioCalculado = 0;

    // ==================================================================
    // 3. GESTIÓN DE CATEGORÍAS
    // ==================================================================
    onSnapshot(query(categoriasCollection, orderBy("nombre")), (snapshot) => {
        const categorias = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        categoriaSelect.innerHTML = '<option value="" disabled selected>Selecciona una categoría...</option>';
        categorias.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.nombre;
            option.textContent = cat.nombre;
            categoriaSelect.appendChild(option);
        });

        listaCategoriasContainer.innerHTML = '';
        if (categorias.length === 0) {
            listaCategoriasContainer.innerHTML = '<p>Aún no has creado categorías.</p>';
        } else {
            categorias.forEach(cat => {
                const catTag = document.createElement('div');
                catTag.className = 'categoria-tag';
                catTag.innerHTML = `
                    <span>${cat.nombre}</span>
                    <button class="btn-delete-cat" data-id="${cat.id}" title="Eliminar categoría">×</button>
                `;
                listaCategoriasContainer.appendChild(catTag);
            });
        }

        document.querySelectorAll('.btn-delete-cat').forEach(button => {
            button.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm('¿Estás seguro de que quieres eliminar esta categoría?')) {
                    try { await deleteDoc(doc(db, 'categorias', id)); } catch (e) { console.error(e); }
                }
            });
        });
    });

    formCategoria.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = inputNuevaCategoria.value.trim();
        if (nombre) {
            await addDoc(categoriasCollection, { nombre });
            inputNuevaCategoria.value = '';
        }
    });

    // ==================================================================
    // 4. GESTIÓN DE RECETAS
    // ==================================================================

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
            console.log("Materias primas cargadas:", materiasPrimasDisponibles.length);
        } catch (error) {
            console.error("Error al cargar materias primas:", error);
        } finally {
            btnCrearReceta.disabled = false;
            btnCrearReceta.textContent = 'Crear Nueva Receta';
        }
    };

    // --- Lógica Crítica: Cálculo de Costos ---
    const calcularCostoTotalReceta = (recetaData) => {
        let costoTotal = 0;
        if (!recetaData.ingredientes || recetaData.ingredientes.length === 0) return 0;
        
        recetaData.ingredientes.forEach(ing => {
            // Buscamos la materia prima en el stock actual por ID
            const materiaPrima = materiasPrimasDisponibles.find(mp => mp.id === ing.idMateriaPrima);
            
            if (materiaPrima && materiaPrima.lotes && materiaPrima.lotes.length > 0) {
                // Ordenamos lotes para usar el precio de la última compra
                const lotesOrdenados = [...materiaPrima.lotes].sort((a, b) => b.fechaCompra.seconds - a.fechaCompra.seconds);
                const ultimoLote = lotesOrdenados[0];
                
                // Intentamos obtener el costo unitario. Si no existe la propiedad, la calculamos.
                let costoUnitarioMP = ultimoLote.costoUnitario;
                if (costoUnitarioMP === undefined || costoUnitarioMP === null) {
                    // Fallback: Precio / Cantidad
                    if (ultimoLote.cantidadComprada > 0) {
                        costoUnitarioMP = ultimoLote.precioCompra / ultimoLote.cantidadComprada;
                    } else {
                        costoUnitarioMP = 0;
                    }
                }

                costoTotal += costoUnitarioMP * ing.cantidad;
            } else {
                console.warn(`Atención: No se encontró precio/stock para el ingrediente: ${ing.nombreMateriaPrima}`);
            }
        });
        return costoTotal;
    };

    // --- CRUD Recetas ---
    const openModal = (receta = null) => {
        if (receta && receta.data) {
            editandoId = receta.id;
            modalTitle.textContent = `Editar Receta: ${receta.data.nombreTorta}`;
            recetaNombreInput.value = receta.data.nombreTorta;
            categoriaSelect.value = receta.data.categoria || '';
            rendimientoInput.value = receta.data.rendimiento || '';
            ingredientesRecetaActual = JSON.parse(JSON.stringify(receta.data.ingredientes));
        } else {
            editandoId = null;
            modalTitle.textContent = 'Crear Nueva Receta';
            recetaNombreInput.value = '';
            categoriaSelect.value = '';
            rendimientoInput.value = '';
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
            alert('Ingresa un ingrediente válido y cantidad mayor a 0.');
            return;
        }
        const materiaPrima = materiasPrimasDisponibles.find(mp => mp.nombre === nombreIngrediente);
        if (!materiaPrima) {
            alert('Ingrediente no encontrado en el stock. Verifica el nombre.');
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
        const nombre = recetaNombreInput.value.trim();
        const cat = categoriaSelect.value;
        const rend = parseInt(rendimientoInput.value);

        if (!nombre || !cat || !rend || isNaN(rend) || ingredientesRecetaActual.length === 0) {
            alert('Completa todos los campos obligatorios.');
            return;
        }
        
        const data = { nombreTorta: nombre, categoria: cat, rendimiento: rend, ingredientes: ingredientesRecetaActual };
        const id = editandoId || doc(collection(db, 'recetas')).id;
        await setDoc(doc(db, 'recetas', id), data);
        closeModal();
    };

    // ==================================================================
    // 5. LÓGICA DEL MODAL DE PORCIONES Y CARRITO
    // ==================================================================

    const actualizarCostoEstimado = () => {
        const cantidad = parseFloat(inputCantidadPorciones.value);
        if (isNaN(cantidad) || cantidad < 0) {
            porcionesCostoEstimado.textContent = "$0.00";
            return;
        }
        
        const total = costoUnitarioCalculado * cantidad;
        porcionesCostoEstimado.textContent = `$${total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const abrirModalPorciones = (receta) => {
        recetaSeleccionadaParaCarrito = receta;
        
        // 1. Calcular costo total de la receta en base al stock actual
        const costoTotalReceta = calcularCostoTotalReceta(receta.data);
        
        console.log("Costo Total Receta:", costoTotalReceta); // Debug

        // 2. Obtener rendimiento
        const rendimiento = parseFloat(receta.data.rendimiento) || 1;
        
        // 3. Calcular costo unitario
        costoUnitarioCalculado = costoTotalReceta / rendimiento;
        
        console.log("Costo Unitario:", costoUnitarioCalculado); // Debug

        // 4. Preparar UI
        porcionesRecetaNombre.textContent = receta.data.nombreTorta;
        porcionesRendimientoTotal.textContent = rendimiento;
        inputCantidadPorciones.value = 1; 
        
        actualizarCostoEstimado();
        modalPorciones.classList.add('visible');
    };

    const confirmarAnadirAlCarrito = () => {
        if (!recetaSeleccionadaParaCarrito) return;

        const cantidad = parseFloat(inputCantidadPorciones.value);
        if (isNaN(cantidad) || cantidad <= 0) {
            alert("Ingresa una cantidad válida.");
            return;
        }

        const precioFinal = costoUnitarioCalculado * cantidad;

        const item = {
            id: recetaSeleccionadaParaCarrito.id, 
            name: `${recetaSeleccionadaParaCarrito.data.nombreTorta} (${cantidad} u.)`, 
            price: precioFinal, 
            type: 'receta_fraccionada',
            cantidadPorciones: cantidad
        };

        addToCart(item);
        modalPorciones.classList.remove('visible');
    };

    inputCantidadPorciones.addEventListener('input', actualizarCostoEstimado);
    btnCancelarPorciones.addEventListener('click', () => modalPorciones.classList.remove('visible'));
    btnConfirmarPorciones.addEventListener('click', confirmarAnadirAlCarrito);

    // ==================================================================
    // 6. RENDERIZADO DE LISTAS Y EVENTOS PRINCIPALES
    // ==================================================================

    const mostrarRecetas = (recetas) => {
        listaRecetasContainer.innerHTML = '';
        const porCategoria = {};
        recetas.forEach(r => {
            const cat = r.data.categoria || 'Sin Categoría';
            if (!porCategoria[cat]) porCategoria[cat] = [];
            porCategoria[cat].push(r);
        });

        if (recetas.length === 0) {
            listaRecetasContainer.innerHTML = '<p>No hay recetas.</p>';
            return;
        }

        Object.keys(porCategoria).sort().forEach(cat => {
            const lista = porCategoria[cat];
            const acordeonItem = document.createElement('div');
            acordeonItem.className = 'categoria-acordeon';
            
            const contenidoHtml = lista.map(receta => `
                <div class="receta-card">
                    <div class="receta-card__info">
                        <h3>${receta.data.nombreTorta}</h3>
                        <p>${receta.data.ingredientes.length} ingr. - Rinde: ${receta.data.rendimiento || '?'} u.</p>
                    </div>
                    <div class="receta-card__actions">
                        <button class="btn-secondary btn-editar-receta" data-id="${receta.id}">Editar</button>
                        <button class="btn-secondary btn-borrar-receta" data-id="${receta.id}">Borrar</button>
                        <button class="btn-secondary btn-anadir-cotizacion" data-id="${receta.id}">Añadir 🛒</button>
                    </div>
                </div>
            `).join('');
            
            acordeonItem.innerHTML = `
                <button class="categoria-acordeon__header">
                    <span class="categoria-acordeon__titulo">${cat}</span>
                    <span class="acordeon-icono">+</span>
                </button>
                <div class="categoria-acordeon__content">${contenidoHtml}</div>
            `;
            listaRecetasContainer.appendChild(acordeonItem);
        });
    };

    onSnapshot(query(recetasCollection, orderBy('nombreTorta')), (snapshot) => {
        todasLasRecetas = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        mostrarRecetas(todasLasRecetas);
    });

    listaRecetasContainer.addEventListener('click', (e) => {
        const header = e.target.closest('.categoria-acordeon__header');
        if (header) { header.parentElement.classList.toggle('active'); return; }
        
        const btnEdit = e.target.closest('.btn-editar-receta');
        if (btnEdit) {
            const r = todasLasRecetas.find(x => x.id === btnEdit.dataset.id);
            if (r) openModal(r);
            return;
        }

        const btnDel = e.target.closest('.btn-borrar-receta');
        if (btnDel) {
            if (confirm('¿Borrar receta?')) deleteDoc(doc(db, 'recetas', btnDel.dataset.id));
            return;
        }

        // AQUI SE ABRE EL MODAL DE PORCIONES
        const btnAdd = e.target.closest('.btn-anadir-cotizacion');
        if (btnAdd) {
            const r = todasLasRecetas.find(x => x.id === btnAdd.dataset.id);
            if (r) abrirModalPorciones(r);
        }
    });

    ingredientesEnRecetaContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-quitar-ingrediente')) {
            ingredientesRecetaActual.splice(e.target.dataset.index, 1);
            renderizarIngredientesEnReceta();
        }
    });
    
    btnCrearReceta.addEventListener('click', () => openModal(null));
    btnCancelarReceta.addEventListener('click', closeModal);
    btnGuardarReceta.addEventListener('click', guardarReceta);
    btnAnadirIngrediente.addEventListener('click', anadirIngrediente);
    
    cargarMateriasPrimas();
    updateCartIcon();
}
