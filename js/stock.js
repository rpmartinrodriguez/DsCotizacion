import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { 
    getFirestore, collection, onSnapshot, query, orderBy, doc, 
    setDoc, addDoc, deleteDoc, updateDoc, Timestamp, getDoc 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';
import { updateCartIcon } from './cart.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const materiasPrimasCollection = collection(db, 'materiasPrimas');

// Referencias DOM
const listaMateriasPrimas = document.getElementById('lista-materias-primas');
const btnCrearMP = document.getElementById('btn-crear-mp');
const modalMP = document.getElementById('modal-materia-prima');
const btnGuardarMP = document.getElementById('mp-btn-guardar');
const btnCancelarMP = document.getElementById('mp-btn-cancelar');

// Inputs del Modal
const mpIdInput = { value: null }; // Referencia virtual
const mpNombreInput = document.getElementById('mp-nombre-input');
const mpCategoriaInput = document.getElementById('mp-categoria-input');
const mpUnidadSelect = document.getElementById('mp-unidad-select');
const mpStockMinimoInput = document.getElementById('mp-stock-minimo-input');
const mpUrlInput = document.getElementById('mp-url-input'); // Nuevo

// Elementos Actualización Web
const btnActualizarWeb = document.getElementById('btn-actualizar-precios-web');
const modalActualizacion = document.getElementById('modal-actualizacion-web');
const textoActualizacion = document.getElementById('actualizacion-estado-texto');
const btnCerrarActualizacion = document.getElementById('btn-cerrar-actualizacion');

let todasLasMateriasPrimas = [];

// =========================================================
// 1. RENDERIZADO DE LA TABLA
// =========================================================

const renderTabla = (materiasPrimas) => {
    listaMateriasPrimas.innerHTML = '';
    
    if (materiasPrimas.length === 0) {
        listaMateriasPrimas.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay materias primas registradas.</td></tr>';
        return;
    }

    materiasPrimas.forEach(mp => {
        let stockTotal = 0;
        if (mp.lotes && mp.lotes.length > 0) {
            stockTotal = mp.lotes.reduce((sum, lote) => sum + (lote.stockRestante || 0), 0);
        }

        const tr = document.createElement('tr');
        if (stockTotal <= (mp.stockMinimo || 0)) {
            tr.style.backgroundColor = '#fef2f2'; // Fondo rojizo si hay poco stock
        }

        // Indicador visual si tiene link
        const linkIcono = mp.urlProveedor 
            ? `<a href="${mp.urlProveedor}" target="_blank" title="Ver en tienda" style="color:#3b82f6; text-decoration:none;">🔗 Link Activo</a>` 
            : `<span style="color:var(--text-light); font-size:0.8rem;">Sin link</span>`;

        tr.innerHTML = `
            <td data-label="Nombre"><strong>${mp.nombre}</strong></td>
            <td data-label="Categoría">${mp.categoria || '-'}</td>
            <td data-label="Stock Total" style="font-weight:bold; color: ${stockTotal <= mp.stockMinimo ? 'var(--danger-color)' : 'inherit'}">
                ${stockTotal.toLocaleString('es-AR')} ${mp.unidad}
            </td>
            <td data-label="Link Web">${linkIcono}</td>
            <td data-label="Acciones" class="stock-actions">
                <button class="btn-stock edit btn-editar" data-id="${mp.id}" title="Editar M. Prima">✏️</button>
                <button class="btn-stock subtract btn-borrar" data-id="${mp.id}" title="Borrar M. Prima">🗑️</button>
            </td>
        `;
        listaMateriasPrimas.appendChild(tr);
    });
};

onSnapshot(query(materiasPrimasCollection, orderBy('nombre')), (snapshot) => {
    todasLasMateriasPrimas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTabla(todasLasMateriasPrimas);
});

// =========================================================
// 2. CREAR Y EDITAR MATERIA PRIMA
// =========================================================

const abrirModalMP = (mp = null) => {
    if (mp) {
        mpIdInput.value = mp.id;
        document.getElementById('mp-modal-title').textContent = 'Editar Materia Prima';
        mpNombreInput.value = mp.nombre;
        mpCategoriaInput.value = mp.categoria || '';
        mpUnidadSelect.value = mp.unidad;
        mpStockMinimoInput.value = mp.stockMinimo || 0;
        mpUrlInput.value = mp.urlProveedor || '';
    } else {
        mpIdInput.value = null;
        document.getElementById('mp-modal-title').textContent = 'Nueva Materia Prima';
        mpNombreInput.value = '';
        mpCategoriaInput.value = '';
        mpUnidadSelect.value = 'kg';
        mpStockMinimoInput.value = 0;
        mpUrlInput.value = '';
    }
    modalMP.classList.add('visible');
};

btnGuardarMP.addEventListener('click', async () => {
    const nombre = mpNombreInput.value.trim();
    const unidad = mpUnidadSelect.value;
    const stockMinimo = parseFloat(mpStockMinimoInput.value) || 0;
    const categoria = mpCategoriaInput.value.trim();
    const urlProveedor = mpUrlInput.value.trim();

    if (!nombre) { alert("El nombre es obligatorio."); return; }

    const mpData = { nombre, unidad, stockMinimo, categoria, urlProveedor };
    
    try {
        if (mpIdInput.value) {
            await updateDoc(doc(db, 'materiasPrimas', mpIdInput.value), mpData);
        } else {
            // Si es nueva, inicializamos los lotes vacíos
            mpData.lotes = [];
            await addDoc(materiasPrimasCollection, mpData);
        }
        modalMP.classList.remove('visible');
    } catch (error) {
        console.error("Error al guardar: ", error);
        alert("Error al guardar.");
    }
});

btnCancelarMP.addEventListener('click', () => modalMP.classList.remove('visible'));

listaMateriasPrimas.addEventListener('click', async (e) => {
    const btnEditar = e.target.closest('.btn-editar');
    if (btnEditar) {
        const mp = todasLasMateriasPrimas.find(m => m.id === btnEditar.dataset.id);
        if (mp) abrirModalMP(mp);
    }
    
    const btnBorrar = e.target.closest('.btn-borrar');
    if (btnBorrar) {
        if(confirm("¿Seguro que deseas eliminar esta materia prima y todo su historial de stock?")) {
            await deleteDoc(doc(db, 'materiasPrimas', btnBorrar.dataset.id));
        }
    }
});

btnCrearMP.addEventListener('click', () => abrirModalMP(null));

// =========================================================
// 3. ACTUALIZACIÓN AUTOMÁTICA DE PRECIOS WEB
// =========================================================

// Scraper con AllOrigins
async function consultarPrecioRazzetto(urlProducto) {
    try {
        // Usamos encodeURIComponent para que la URL viaje segura por internet
        const urlPuente = `https://api.allorigins.win/get?url=${encodeURIComponent(urlProducto)}`;
        const respuesta = await fetch(urlPuente);
        const data = await respuesta.json();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(data.contents, "text/html");
        
        // WooCommerce usa .price
        const cajaPrecio = doc.querySelector('.price');
        if (!cajaPrecio) return null;

        // Busca precio oferta (<ins>) o precio normal
        let elementoPrecio = cajaPrecio.querySelector('ins .woocommerce-Price-amount bdi') || 
                             cajaPrecio.querySelector('.woocommerce-Price-amount bdi');
                           
        if (!elementoPrecio) return null;
        
        let textoPrecio = elementoPrecio.innerText; 
        // Limpia formato: "$ 18.600,50" -> "18600.50"
        textoPrecio = textoPrecio.replace('$', '').replace(/\./g, '').replace(',', '.').trim();
        
        return parseFloat(textoPrecio);
        
    } catch (error) {
        console.error(`Error al consultar URL: ${urlProducto}`, error);
        return null;
    }
}

btnActualizarWeb.addEventListener('click', async () => {
    // Filtramos cuáles tienen link configurado
    const mpsConLink = todasLasMateriasPrimas.filter(mp => mp.urlProveedor && mp.urlProveedor.includes('http'));
    
    if (mpsConLink.length === 0) {
        alert("No tienes materias primas con enlaces web configurados. Edita una materia prima y agrega su link primero.");
        return;
    }

    modalActualizacion.classList.add('visible');
    btnCerrarActualizacion.style.display = 'none';
    
    let actualizados = 0;
    let fallidos = 0;

    for (let i = 0; i < mpsConLink.length; i++) {
        const mp = mpsConLink[i];
        textoActualizacion.textContent = `Consultando ${i + 1}/${mpsConLink.length}: ${mp.nombre}...`;
        
        const nuevoPrecio = await consultarPrecioRazzetto(mp.urlProveedor);
        
        if (nuevoPrecio && !isNaN(nuevoPrecio)) {
            // Evaluamos si necesitamos guardar este precio
            let guardarNuevoLote = false;
            
            if (!mp.lotes || mp.lotes.length === 0) {
                guardarNuevoLote = true;
            } else {
                // Comparamos con el precio del último lote registrado
                const lotesOrdenados = [...mp.lotes].sort((a,b) => b.fechaCompra.seconds - a.fechaCompra.seconds);
                const ultimoPrecio = lotesOrdenados[0].costoUnitario;
                // Si el precio cambió más de 1 peso, actualizamos
                if (Math.abs(ultimoPrecio - nuevoPrecio) > 1) {
                    guardarNuevoLote = true;
                }
            }

            if (guardarNuevoLote) {
                const nuevosLotes = mp.lotes ? [...mp.lotes] : [];
                // Creamos un lote VIRTUAL: No suma stock real, pero marca el nuevo precio actual
                nuevosLotes.push({
                    fechaCompra: Timestamp.now(),
                    proveedor: 'Actualización Web (Razzetto)',
                    cantidadComprada: 0, // No altera el inventario físico
                    precioCompra: 0,
                    costoUnitario: nuevoPrecio,
                    stockRestante: 0 // Se agota de inmediato, pero cotizacion.js lo usará como referencia proyectada
                });

                await updateDoc(doc(db, 'materiasPrimas', mp.id), { lotes: nuevosLotes });
                actualizados++;
            }
        } else {
            fallidos++;
        }
        
        // Pequeña pausa para no saturar al servidor y que no nos bloqueen
        await new Promise(r => setTimeout(r, 1000)); 
    }

    textoActualizacion.innerHTML = `<strong>¡Proceso terminado!</strong><br>
                                   Actualizados/Verificados: ${actualizados} <br>
                                   Fallidos/Sin Cambios: ${fallidos}`;
    btnCerrarActualizacion.style.display = 'inline-block';
});

btnCerrarActualizacion.addEventListener('click', () => {
    modalActualizacion.classList.remove('visible');
});

// Inicializar ícono de carrito
updateCartIcon();
