// js/compras-lista.js
import { 
    getFirestore, collection, getDocs, query, where, Timestamp 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupListaCompras(app) {
    const db = getFirestore(app);
    const presupuestosCollection = collection(db, 'presupuestosGuardados');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');

    const btnGenerar = document.getElementById('btn-generar-lista');
    const fechaDesdeInput = document.getElementById('fecha-desde');
    const fechaHastaInput = document.getElementById('fecha-hasta');
    const resultadoContainer = document.getElementById('resultado-lista-compras');
    const listaContainer = document.getElementById('lista-compras-container');

    // Seteamos fechas por defecto: desde hoy hasta dentro de 7 días
    const hoy = new Date();
    const proximaSemana = new Date();
    proximaSemana.setDate(hoy.getDate() + 7);
    fechaDesdeInput.valueAsDate = hoy;
    fechaHastaInput.valueAsDate = proximaSemana;

    let materiasPrimasDisponibles = [];
    getDocs(materiasPrimasCollection).then(snap => {
        materiasPrimasDisponibles = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
    });

    btnGenerar.addEventListener('click', async () => {
        const fechaDesde = new Date(fechaDesdeInput.value);
        const fechaHasta = new Date(fechaHastaInput.value);
        fechaHasta.setHours(23, 59, 59, 999); // Aseguramos que incluya todo el día

        if (isNaN(fechaDesde) || isNaN(fechaHasta)) {
            alert('Por favor, selecciona un rango de fechas válido.');
            return;
        }

        btnGenerar.disabled = true;
        btnGenerar.textContent = 'Calculando...';
        resultadoContainer.style.display = 'block';
        listaContainer.innerHTML = '<p>Calculando...</p>';

        try {
            // 1. OBTENER EL STOCK ACTUAL
            const stockActualMap = new Map();
            const materiasPrimasSnap = await getDocs(materiasPrimasCollection);
            materiasPrimasSnap.forEach(doc => {
                const item = doc.data();
                if (item.lotes && item.lotes.length > 0) {
                    const stockTotal = item.lotes.reduce((sum, lote) => sum + lote.stockRestante, 0);
                    stockActualMap.set(doc.id, stockTotal);
                }
            });

            // 2. OBTENER LAS VENTAS AGENDADAS EN EL RANGO DE FECHAS
            const q = query(
                presupuestosCollection,
                where("esVenta", "==", true),
                where("fechaEntrega", ">=", Timestamp.fromDate(fechaDesde)),
                where("fechaEntrega", "<=", Timestamp.fromDate(fechaHasta))
            );
            const ventasSnap = await getDocs(q);

            // 3. CALCULAR LOS INGREDIENTES NECESARIOS
            const ingredientesNecesariosMap = new Map();
            ventasSnap.forEach(doc => {
                const venta = doc.data();
                (venta.ingredientes || []).forEach(ing => {
                    const id = ing.idMateriaPrima || ing.id;
                    const cantidad = ing.cantidadTotal || ing.cantidad;
                    const totalActual = ingredientesNecesariosMap.get(id) || 0;
                    ingredientesNecesariosMap.set(id, totalActual + cantidad);
                });
            });

            // 4. CALCULAR LA LISTA DE COMPRAS FINAL
            const listaDeCompras = [];
            for (const [id, cantidadNecesaria] of ingredientesNecesariosMap.entries()) {
                const stockDisponible = stockActualMap.get(id) || 0;
                const cantidadAComprar = cantidadNecesaria - stockDisponible;

                if (cantidadAComprar > 0) {
                    const mpDoc = materiasPrimasDisponibles.find(mp => mp.id === id);
                    if (mpDoc) {
                        listaDeCompras.push({
                            nombre: mpDoc.nombre,
                            cantidad: cantidadAComprar,
                            unidad: mpDoc.unidad
                        });
                    }
                }
            }
            
            // 5. RENDERIZAR EL RESULTADO
            listaContainer.innerHTML = '';
            if (listaDeCompras.length > 0) {
                const ul = document.createElement('ul');
                ul.className = 'lista-sencilla';
                listaDeCompras.sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(item => {
                    const li = document.createElement('li');
                    li.innerHTML = `${item.nombre} <span>${item.cantidad.toLocaleString('es-AR')} ${item.unidad}</span>`;
                    ul.appendChild(li);
                });
                listaContainer.appendChild(ul);
            } else {
                listaContainer.innerHTML = '<p>¡Felicitaciones! Tienes stock suficiente para todas las entregas en este período.</p>';
            }

        } catch (error) {
            console.error("Error al generar la lista de compras:", error);
            listaContainer.innerHTML = '<p style="color:red;">Hubo un error al generar la lista. Revisa la consola.</p>';
        } finally {
            btnGenerar.disabled = false;
            btnGenerar.textContent = 'Generar Lista';
        }
    });
}
