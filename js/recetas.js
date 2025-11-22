import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    setDoc, getDocs, deleteDoc, addDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
// Importamos las funciones del carrito que acabamos de crear
import { addToCart, updateCartIcon } from './cart.js';

export function setupRecetas(app) {
    const db = getFirestore(app);
    const recetasCollection = collection(db, 'recetas');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const categoriasCollection = collection(db, 'categorias');

    // --- Referencias al DOM ---
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

    // Gestión de Categorías
    const formCategoria = document.getElementById('form-categoria');
    const inputNuevaCategoria = document.getElementById('nueva-categoria-nombre');
    const listaCategoriasContainer = document.getElementById('lista-categorias-container');

    // --- Modal de Porciones (EL QUE NO TE APARECÍA) ---
    const modalPorciones = document.getElementById('modal-porciones');
    const porcionesRecetaNombre = document.getElementById('porciones-receta-nombre');
    const porcionesRendimientoTotal = document.getElementById('porciones-rendimiento-total');
    const inputCantidadPorciones = document.getElementById('input-cantidad-porciones');
    const porcionesCostoEstimado = document.getElementById('porciones-costo-estimado');
    const btnConfirmarPorciones = document.getElementById('btn-confirmar-porciones');
    const btnCancelarPorciones = document.getElementById('btn-cancelar-porciones');

    // Variables de Estado
    let materiasPrimasDisponibles = [];
    let todasLasRecetas = [];
    let ingredientesRecetaActual = [];
    let editandoId = null;
    
    // Variables para el cálculo del carrito
    let recetaSeleccionadaParaCarrito = null; 
    let costoUnitarioCalculado = 0;

    // ------------------------------------------------------------------
    // 1. GESTIÓN DE CATEGORÍAS
    // ------------------------------------------------------------------
    onSnapshot(query(categoriasCollection, orderBy("nombre")), (snapshot) => {
        const categorias = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Llenar select del modal
        categoriaSelect.innerHTML = '<option value="" disabled selected>Selecciona una categoría...</option>';
        categorias.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.nombre;
            option.textContent = cat.nombre;
            categoriaSelect.appendChild(option);
        });

        // Llenar lista de gestión
        listaCategoriasContainer.innerHTML = '';
        if (categorias.length === 0) {
            listaCategoriasContainer.innerHTML = '<p>Aún no has creado categorías.</p>';
        } else {
            categorias.forEach(cat => {
                const catTag = document.createElement('div');
                catTag.className = 'categoria-tag';
                catTag.innerHTML = `<span>${cat.nombre}</span><button class="btn-delete-cat" data-id="${cat.id}" title="Eliminar">×</button>`;
                listaCategoriasContainer.appendChild(catTag);
            });
        }

        // Listeners para borrar categorías
        document.querySelectorAll('.btn-delete-cat').forEach(button => {
            button.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm('¿Eliminar esta categoría?')) {
                    await deleteDoc(doc(db, 'categorias', id));
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

    // ------------------------------------------------------------------
    // 2. GESTIÓN DE RECETAS (Carga y Guardado)
    // ------------------------------------------------------------------
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
            console.error("Error:", error);
        } finally {
            btnCrearReceta.disabled = false;
            btnCrearReceta.textContent = 'Crear Nueva Receta';
        }
    };

    // Función clave: Calcula cuánto cuesta hacer la receta completa hoy
    const calcularCostoTotalReceta = (recetaData) => {
        let costoTotal = 0;
        if (!recetaData.ingredientes) return 0;
        
        recetaData.ingredientes.forEach(ing => {
            const materiaPrima = materiasPrimasDisponibles.find(mp => mp.id === ing.idMateriaPrima);
            if (materiaPrima && materiaPrima.lotes && materiaPrima.lotes.length > 0) {
                // Usamos el precio del último lote comprado
                const lotesOrdenados = [...materiaPrima.lotes].sort((a, b) => b.fechaCompra.seconds - a.fechaCompra.seconds);
                const costoUnitarioMP = lotesOrdenados[0].costoUnitario || 0;
                costoTotal += costoUnitarioMP * ing.cantidad;
            }
        });
        return costoTotal;
    };

    // ------------------------------------------------------------------
    // 3. LÓGICA DEL CARRITO Y PORCIONES (Lo que pediste)
    // ------------------------------------------------------------------

    const actualizarCostoEstimado = () => {
        const cantidad = parseFloat(inputCantidadPorciones.value) || 0;
        // Cálculo: (Costo Unitario) * (Cantidad Seleccionada)
        const total = costoUnitarioCalculado * cantidad;
        porcionesCostoEstimado.textContent = `$${total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const abrirModalPorciones = (receta) => {
        recetaSeleccionadaParaCarrito = receta;
        
        // 1. Calculamos costo TOTAL de la receta (ej: $10.000)
        const costoTotalReceta = calcularCostoTotalReceta(receta.data);
        
        // 2. Obtenemos el rendimiento declarado (ej: 10 porciones)
        const rendimiento = receta.data.rendimiento || 1; 
        
        // 3. Calculamos costo UNITARIO (ej: $1.000)
        costoUnitarioCalculado = costoTotalReceta / rendimiento;

        // 4. Preparamos el modal visualmente
        porcionesRecetaNombre.textContent = receta.data.nombreTorta;
        porcionesRendimientoTotal.textContent = rendimiento;
        
        // Por defecto sugerimos 1 unidad
        inputCantidadPorciones.value = 1; 
        
        actualizarCostoEstimado(); // Muestra el precio inicial (ej: $1.000)
        modalPorciones.classList.add('visible');
    };

    const cerrarModalPorciones = () => {
        modalPorciones.classList.remove('visible');
        recetaSeleccionadaParaCarrito = null;
        costoUnitarioCalculado = 0;
    };

    const confirmarAnadirAlCarrito = () => {
        if (!recetaSeleccionadaParaCarrito) return;

        const cantidad = parseFloat(inputCantidadPorciones.value);
        if (isNaN(cantidad) || cantidad <= 0) {
            alert("Por favor, ingresa una cantidad válida.");
            return;
        }

        // Calculamos el precio final para el carrito (ej: 8 * 1000 = 8000)
        const precioFinalParaCarrito = costoUnitarioCalculado * cantidad;

        const itemParaCarrito = {
            id: recetaSeleccionadaParaCarrito.id, 
            name: `${recetaSeleccionadaParaCarrito.data.nombreTorta} (${cantidad} porciones/u.)`, 
            price: precioFinalParaCarrito, 
            type: 'receta_fraccionada'
        };

        addToCart(itemParaCarrito); // Función importada de cart.js
        cerrarModalPorciones();
    };

    // Listeners del modal de porciones
    inputCantidadPorciones.addEventListener('input', actualizarCostoEstimado);
    btnCancelarPorciones.addEventListener('click', cerrarModalPorciones);
    btnConfirmarPorciones.addEventListener('click', confirmarAnadirAlCarrito);


    // ------------------------------------------------------------------
    // 4. RENDERIZADO DE LA LISTA Y EVENTOS
    // ------------------------------------------------------------------
    
    const mostrarRecetas = (recetas) => {
        listaRecetasContainer.innerHTML = '';
        const recetasPorCategoria = {};
        recetas.forEach(receta => {
            const categoria = receta.data.categoria || 'Sin Categoría';
            if (!recetasPorCategoria[categoria]) recetasPorCategoria[categoria] = [];
            recetasPorCategoria[categoria].push(receta);
        });

        if (recetas.length === 0) {
            listaRecetasContainer.innerHTML = '<p>No tienes recetas guardadas. ¡Crea la primera!</p>';
            return;
        }

        Object.keys(recetasPorCategoria).sort().forEach(categoria => {
            const listaDeRecetas = recetasPorCategoria[categoria];
            if (listaDeRecetas.length > 0) {
                const acordeonItem = document.createElement('div');
                acordeonItem.className = 'categoria-acordeon';
                
                const contenidoHtml = listaDeRecetas.map(receta => `
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

    // Manejo de Clics en la Lista (Delegación de Eventos)
    listaRecetasContainer.addEventListener('click', (e) => {
        // Abrir/Cerrar Acordeón
        const header = e.target.closest('.categoria-acordeon__header');
        if (header) {
            header.parentElement.classList.toggle('active');
            return;
        }
        
        // Editar Receta
        const targetEditar = e.target.closest('.btn-editar-receta');
        if (targetEditar) {
            const id = targetEditar.dataset.id;
            const receta = todasLasRecetas.find(r => r.id === id);
            if (receta) openModalReceta(receta);
            return;
        }
        
        // Borrar Receta
        const targetBorrar = e.target.closest('.btn-borrar-receta');
        if (targetBorrar) {
            const id = targetBorrar.dataset.id;
            if (confirm('¿Estás seguro de borrar esta receta?')) {
                deleteDoc(doc(db, 'recetas', id));
            }
            return;
        }

        // AÑADIR AL CARRITO (Aquí se activa tu lógica)
        const targetAnadir = e.target.closest('.btn-anadir-cotizacion');
        if(targetAnadir) {
            const id = targetAnadir.dataset.id;
            const receta = todasLasRecetas.find(r => r.id === id);
            if (receta) {
                abrirModalPorciones(receta); // Abre el modal que no te salía
            }
            return;
        }
    });

    // --- Lógica del Modal de Crear/Editar (Standard) ---
    const openModalReceta = (receta = null) => {
        if (receta) {
            editandoId = receta.id;
            modalTitle.textContent = `Editar: ${receta.data.nombreTorta}`;
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

    const renderizarIngredientesEnReceta = () => {
        ingredientesEnRecetaContainer.innerHTML = '';
        if (ingredientesRecetaActual.length === 0) {
            ingredientesEnRecetaContainer.innerHTML = '<p>Sin ingredientes.</p>';
            return;
        }
        const ul = document.createElement('ul');
        ul.className = 'lista-sencilla';
        ingredientesRecetaActual.forEach((ing, index) => {
            const li = document.createElement('li');
            li.innerHTML = `${ing.nombreMateriaPrima} <span>${ing.cantidad} ${ing.unidad}</span> <button class="btn-quitar-ingrediente" data-index="${index}">🗑️</button>`;
            ul.appendChild(li);
        });
        ingredientesEnRecetaContainer.appendChild(ul);
    };

    ingredientesEnRecetaContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-quitar-ingrediente')) {
            ingredientesRecetaActual.splice(e.target.dataset.index, 1);
            renderizarIngredientesEnReceta();
        }
    });

    btnAnadirIngrediente.addEventListener('click', anadirIngrediente);
    btnCrearReceta.addEventListener('click', () => openModalReceta(null));
    btnCancelarReceta.addEventListener('click', closeModal);
    
    btnGuardarReceta.addEventListener('click', async () => {
        const nombre = recetaNombreInput.value.trim();
        const cat = categoriaSelect.value;
        const rend = parseInt(rendimientoInput.value);
        if (!nombre || !cat || !rend || ingredientesRecetaActual.length === 0) {
            alert('Completa todos los campos.'); return;
        }
        const data = { nombreTorta: nombre, categoria: cat, rendimiento: rend, ingredientes: ingredientesRecetaActual };
        const id = editandoId || doc(collection(db, 'recetas')).id;
        await setDoc(doc(db, 'recetas', id), data);
        closeModal();
    });

    cargarMateriasPrimas();
    updateCartIcon();
}
