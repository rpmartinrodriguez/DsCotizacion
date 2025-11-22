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
    
    // Contenedores Principales
    const listaRecetasContainer = document.getElementById('lista-recetas-container');
    const btnCrearReceta = document.getElementById('btn-crear-receta');
    
    // Modal de Crear/Editar Receta
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

    // Sección de Gestión de Categorías
    const formCategoria = document.getElementById('form-categoria');
    const inputNuevaCategoria = document.getElementById('nueva-categoria-nombre');
    const listaCategoriasContainer = document.getElementById('lista-categorias-container');

    // Modal de Selección de Porciones (Nuevo)
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
    
    // Variables temporales para el flujo del carrito
    let recetaSeleccionadaParaCarrito = null; 
    let costoUnitarioCalculado = 0;

    // ==================================================================
    // 3. LÓGICA DE GESTIÓN DE CATEGORÍAS
    // ==================================================================

    // Escuchar cambios en la colección de categorías
    onSnapshot(query(categoriasCollection, orderBy("nombre")), (snapshot) => {
        const categorias = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // A. Actualizar el select del modal de recetas
        // Guardamos la selección actual si existe para no perderla al actualizar
        const seleccionActual = categoriaSelect.value;
        
        categoriaSelect.innerHTML = '<option value="" disabled selected>Selecciona una categoría...</option>';
        categorias.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.nombre;
            option.textContent = cat.nombre;
            categoriaSelect.appendChild(option);
        });

        if (seleccionActual) {
            categoriaSelect.value = seleccionActual;
        }

        // B. Actualizar la lista visual de gestión de categorías
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

        // Listeners para borrar categorías
        document.querySelectorAll('.btn-delete-cat').forEach(button => {
            button.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm('¿Estás seguro de que quieres eliminar esta categoría?')) {
                    try {
                        await deleteDoc(doc(db, 'categorias', id));
                    } catch (error) {
                        console.error("Error al eliminar categoría:", error);
                    }
                }
            });
        });
    });

    // Listener para crear nueva categoría
    formCategoria.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombreCategoria = inputNuevaCategoria.value.trim();
        if (nombreCategoria) {
            try {
                await addDoc(categoriasCollection, { nombre: nombreCategoria });
                inputNuevaCategoria.value = '';
            } catch (error) {
                console.error("Error al crear categoría:", error);
                alert("No se pudo crear la categoría.");
            }
        }
    });

    // ==================================================================
    // 4. GESTIÓN DE RECETAS (CRUD)
    // ==================================================================

    // Cargar materias primas para el autocompletado
    const cargarMateriasPrimas = async () => {
        btnCrearReceta.disabled = true;
        btnCrearReceta.textContent = 'Cargando...';
        try {
            const snapshot = await getDocs(query(materiasPrimasCollection, orderBy('nombre')));
            materiasPrimasDisponibles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            ingredientesDatalist.innerHTML = '';
            materiasPrimasDisponibles.forEach(mp => {
                // Solo mostramos materias primas que tengan lotes cargados (opcional, pero recomendado)
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

    // Función auxiliar: Calcular costo total de una receta (para uso interno)
    const calcularCostoTotalReceta = (recetaData) => {
        let costoTotal = 0;
        if (!recetaData.ingredientes || recetaData.ingredientes.length === 0) return 0;
        
        recetaData.ingredientes.forEach(ing => {
            // Buscamos la materia prima en el stock actual por ID
            const materiaPrima = materiasPrimasDisponibles.find(mp => mp.id === ing.idMateriaPrima);
            
            if (materiaPrima && materiaPrima.lotes && materiaPrima.lotes.length > 0) {
                // Usamos el costo del último lote comprado para el cálculo
                const lotesOrdenados = [...materiaPrima.lotes].sort((a, b) => b.fechaCompra.seconds - a.fechaCompra.seconds);
                const ultimoLote = lotesOrdenados[0];
                
                // Intentamos obtener el costo unitario. Si no existe la propiedad, la calculamos.
                let costoUnitarioMP = ultimoLote.costoUnitario;
                
                // Validación extra por si costoUnitario es undefined
                if (typeof costoUnitarioMP !== 'number') {
                    if (ultimoLote.cantidadComprada > 0) {
                        costoUnitarioMP = ultimoLote.precioCompra / ultimoLote.cantidadComprada;
                    } else {
                        costoUnitarioMP = 0;
                    }
                }

                costoTotal += costoUnitarioMP * ing.cantidad;
            }
        });
        return costoTotal;
    };

    // Abrir modal para crear o editar
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

    // Renderizar lista de ingredientes dentro del modal
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

    // Añadir ingrediente a la receta temporal
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
        // Verificar si ya existe para no duplicar
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

    // Guardar receta en Firebase
    const guardarReceta = async () => {
        const nombreTorta = recetaNombreInput.value.trim();
        const categoria = categoriaSelect.value;
        const rendimiento = parseInt(rendimientoInput.value, 10);

        if (!nombreTorta || !categoria || !rendimiento || isNaN(rendimiento) || rendimiento <= 0 || ingredientesRecetaActual.length === 0) {
            alert('Por favor, completa el nombre, selecciona una categoría, un rendimiento válido y añade al menos un ingrediente.');
            return;
        }
        
        const id = editandoId || doc(collection(db, 'recetas')).id;
        const recetaData = { 
            nombreTorta, 
            categoria, 
            rendimiento, 
            ingredientes: ingredientesRecetaActual 
        };
        try {
            await setDoc(doc(db, 'recetas', id), recetaData);
            alert(editandoId ? '¡Receta actualizada con éxito!' : '¡Receta creada con éxito!');
            closeModal();
        } catch (error) {
            console.error("Error al guardar receta:", error);
            alert("Hubo un error al guardar la receta.");
        }
    };
    
    // Mostrar lista de recetas agrupadas por categoría
    const mostrarRecetas = (recetas) => {
        listaRecetasContainer.innerHTML = '';
        const recetasPorCategoria = {};

        // Agrupamos por categoría
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

        // Ordenamos y renderizamos
        Object.keys(recetasPorCategoria).sort().forEach(categoria => {
            const listaDeRecetas = recetasPorCategoria[categoria];
            if (listaDeRecetas && listaDeRecetas.length > 0) {
                const acordeonItem = document.createElement('div');
                acordeonItem.className = 'categoria-acordeon';
                
                const contenidoHtml = listaDeRecetas.map(receta => `
                    <div class="receta-card">
                        <div class="receta-card__info">
                            <h3>${receta.data.nombreTorta}</h3>
                            <p>${receta.data.ingredientes.length} ingrediente(s) - Rinde: ${receta.data.rendimiento || 'N/A'} u.</p>
                        </div>
                        <div class="receta-card__actions">
                            <button class="btn-secondary btn-editar-receta" data-id="${receta.id}">Editar</button>
                            <button class="btn-secondary btn-borrar-receta" data-id="${receta.id}">Borrar</button>
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
        
        // 2. Obtener rendimiento declarado
        const rendimiento = parseFloat(receta.data.rendimiento) || 1;
        
        // 3. Calcular costo unitario
        costoUnitarioCalculado = costoTotalReceta / rendimiento;
        
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
    // 6. LISTENERS Y PUNTO DE ENTRADA
    // ==================================================================

    // Listener Principal de Recetas
    onSnapshot(query(recetasCollection, orderBy('nombreTorta')), (snapshot) => {
        todasLasRecetas = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        mostrarRecetas(todasLasRecetas);
    });

    // Listener de la lista principal (Delegación de eventos)
    listaRecetasContainer.addEventListener('click', (e) => {
        // Acordeón
        const header = e.target.closest('.categoria-acordeon__header');
        if (header) {
            header.parentElement.classList.toggle('active');
            return;
        }
        
        // Editar
        const targetEditar = e.target.closest('.btn-editar-receta');
        if (targetEditar) {
            const id = targetEditar.dataset.id;
            const recetaParaEditar = todasLasRecetas.find(r => r.id === id);
            if (recetaParaEditar) openModal(recetaParaEditar);
            return;
        }
        
        // Borrar
        const targetBorrar = e.target.closest('.btn-borrar-receta');
        if (targetBorrar) {
            const id = targetBorrar.dataset.id;
            const recetaParaBorrar = todasLasRecetas.find(r => r.id === id);
            if (recetaParaBorrar && confirm(`¿Estás seguro de que quieres borrar la receta "${recetaParaBorrar.data.nombreTorta}"? Esta acción no se puede deshacer.`)) {
                deleteDoc(doc(db, 'recetas', id)).then(() => {
                    // OK
                }).catch(err => console.error(err));
            }
            return;
        }
        
        // Añadir al Carrito
        const targetAnadir = e.target.closest('.btn-anadir-cotizacion');
        if(targetAnadir) {
            const id = targetAnadir.dataset.id;
            const recetaParaAnadir = todasLasRecetas.find(r => r.id === id);
            if (recetaParaAnadir) {
                abrirModalPorciones(recetaParaAnadir);
            }
            return;
        }
    });

    // Listeners del modal de ingredientes
    ingredientesEnRecetaContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-quitar-ingrediente')) {
            const index = parseInt(e.target.dataset.index, 10);
            ingredientesRecetaActual.splice(index, 1);
            renderizarIngredientesEnReceta();
        }
    });
    
    // Listeners de botones del modal
    btnCrearReceta.addEventListener('click', () => openModal(null));
    btnCancelarReceta.addEventListener('click', closeModal);
    btnGuardarReceta.addEventListener('click', guardarReceta);
    btnAnadirIngrediente.addEventListener('click', anadirIngrediente);
    
    // Inicialización
    cargarMateriasPrimas();
    updateCartIcon();
}
