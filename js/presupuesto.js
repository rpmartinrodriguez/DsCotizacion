// js/presupuesto.js

// 1. Importar funciones de Firebase y la configuración local
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.7/firebase-app.js";
import { 
    getFirestore, collection, getDocs, query, orderBy 
} from "https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

// 2. Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const materiasPrimasCollection = collection(db, 'materiasPrimas');

// --- REFERENCIAS A ELEMENTOS DEL DOM ---
const form = document.getElementById('form-presupuesto');
const selector = document.getElementById('selector-materia-prima');
const cantidadInput = document.getElementById('cantidad-necesaria');
const tablaPresupuestoBody = document.querySelector("#tabla-presupuesto tbody");
const costoTotalSpan = document.getElementById('costo-total');
const agregarBtn = document.getElementById('btn-agregar');

let materiasPrimasDisponibles = [];
let presupuestoActual = [];

// --- LÓGICA PRINCIPAL ---

document.addEventListener('DOMContentLoaded', async () => {
    agregarBtn.textContent = 'Cargando...';
    agregarBtn.disabled = true;

    try {
        const q = query(materiasPrimasCollection, orderBy('nombre'));
        const snapshot = await getDocs(q);
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const precioPorUnidad = data.precio / data.cantidad;
            materiasPrimasDisponibles.push({
                id: doc.id,
                nombre: data.nombre,
                unidad: data.unidad,
                precioPorUnidad: precioPorUnidad
            });
        });

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

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const selectedId = selector.value;
    const cantidadNecesaria = parseFloat(cantidadInput.value);

    if (!selectedId || isNaN(cantidadNecesaria) || cantidadNecesaria <= 0) {
        alert('Por favor, selecciona un ingrediente y una cantidad válida.');
        return;
    }

    const ingredienteSeleccionado = materiasPrimasDisponibles.find(item => item.id === selectedId);
    const costoIngrediente = ingredienteSeleccionado.precioPorUnidad * cantidadNecesaria;

    presupuestoActual.push({
        nombre: ingredienteSeleccionado.nombre,
        cantidad: cantidadNecesaria,
        unidad: ingredienteSeleccionado.unidad,
        costo: costoIngrediente
    });

    renderizarPresupuesto();
    form.reset();
    selector.focus();
});

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
