// js/presupuesto.js

// --- INICIALIZACIÓN DE FIREBASE ---
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const materiasPrimasCollection = db.collection('materiasPrimas');

// --- REFERENCIAS A ELEMENTOS DEL DOM ---
const form = document.getElementById('form-presupuesto');
const selector = document.getElementById('selector-materia-prima');
const cantidadInput = document.getElementById('cantidad-necesaria');
const tablaPresupuestoBody = document.querySelector("#tabla-presupuesto tbody");
const costoTotalSpan = document.getElementById('costo-total');
const agregarBtn = document.getElementById('btn-agregar');

// --- ESTADO DE LA APLICACIÓN ---
let materiasPrimasDisponibles = []; // Almacenará todos los ingredientes de la DB
let presupuestoActual = []; // Almacenará los ingredientes agregados al presupuesto

// --- LÓGICA PRINCIPAL ---

// 1. CARGAR MATERIAS PRIMAS DESDE FIRESTORE AL INICIAR
document.addEventListener('DOMContentLoaded', async () => {
    agregarBtn.textContent = 'Cargando...';
    agregarBtn.disabled = true;

    try {
        const snapshot = await materiasPrimasCollection.orderBy('nombre').get();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            // La lógica clave: calculamos el precio por unidad para usarlo después
            const precioPorUnidad = data.precio / data.cantidad;
            
            materiasPrimasDisponibles.push({
                id: doc.id,
                nombre: data.nombre,
                unidad: data.unidad,
                precioPorUnidad: precioPorUnidad // Guardamos el costo unitario
            });
        });

        // Llenar el <select> con las opciones
        selector.innerHTML = '<option value="" disabled selected>-- Elige un ingrediente --</option>';
        materiasPrimasDisponibles.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.nombre} (${item.unidad})`;
            selector.appendChild(option);
        });

    } catch (error) {
        console.error("Error al cargar materias primas: ", error);
        selector.innerHTML = '<option disabled>Error al cargar datos</option>';
    } finally {
        agregarBtn.textContent = 'Agregar al Presupuesto';
        agregarBtn.disabled = false;
    }
});

// 2. MANEJAR EL ENVÍO DEL FORMULARIO PARA AGREGAR UN INGREDIENTE
form.addEventListener('submit', (e) => {
    e.preventDefault();

    const selectedId = selector.value;
    const cantidadNecesaria = parseFloat(cantidadInput.value);

    if (!selectedId || isNaN(cantidadNecesaria) || cantidadNecesaria <= 0) {
        alert('Por favor, selecciona un ingrediente y una cantidad válida.');
        return;
    }

    // Encontrar el ingrediente completo en nuestro array
    const ingredienteSeleccionado = materiasPrimasDisponibles.find(item => item.id === selectedId);

    // Calcular el costo para este ingrediente
    const costoIngrediente = ingredienteSeleccionado.precioPorUnidad * cantidadNecesaria;

    // Agregar al array del presupuesto
    presupuestoActual.push({
        nombre: ingredienteSeleccionado.nombre,
        cantidad: cantidadNecesaria,
        unidad: ingredienteSeleccionado.unidad,
        costo: costoIngrediente
    });

    // Actualizar la tabla y el total
    renderizarPresupuesto();
    form.reset();
    selector.focus();
});


// 3. RENDERIZAR LA TABLA DE PRESUPUESTO Y EL COSTO TOTAL
function renderizarPresupuesto() {
    tablaPresupuestoBody.innerHTML = '';
    let total = 0;

    presupuestoActual.forEach(item => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${item.nombre}</td>
            <td>${item.cantidad.toLocaleString('es-AR')} ${item.unidad}</td>
            <td>$${item.costo.toFixed(2)}</td>
        `;
        tablaPresupuestoBody.appendChild(fila);
        total += item.costo;
    });

    costoTotalSpan.textContent = `$${total.toFixed(2)}`;
}
