// js/compras-lista.js (Lógica Automática)
import { 
    getFirestore, collection, getDocs, query, where, Timestamp, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupListaCompras(app) {
    const db = getFirestore(app);
    const presupuestosCollection = collection(db, 'presupuestosGuardados');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');
    const listaContainer = document.getElementById('lista-compras-container');

    const generarListaAutomatica = async () => {
        listaContainer.innerHTML = '<p>Calculando...</p>';
        try {
            // 1. OBTENER STOCK ACTUAL
            const stockActualMap = new Map();
            const materiasPrimasSnap = await getDocs(materiasPrimasCollection);
            const materiasPrimasDisponibles = materiasPrimasSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
            
            materiasPrimasDisponibles.forEach(item => {
                if (item.lotes && item.lotes.length > 0) {
                    const stockTotal = item.lotes.reduce((sum, lote) => sum + lote.stockRestante, 0);
                    stockActualMap.set(item.id, stockTotal);
                }
            });

            // 2. OBTENER LAS PRÓXIMAS 5 VENTAS
            const q = query(
                presupuestosCollection,
                where("esVenta", "==", true),
                where("fechaEntrega", ">=", new Date()),
                orderBy("fechaEntrega", "asc"),
                limit(5)
            );
            const ventasSnap = await getDocs(q);

            // 3. CALCULAR INGREDIENTES NECESARIOS
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

            // 4. CALCULAR LISTA DE COMPRAS FINAL
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
            
            // 5. RENDERIZAR RESULTADO
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
                listaContainer.innerHTML = '<p>¡Felicitaciones! Tienes stock suficiente para tus próximas 5 ventas.</p>';
            }

        } catch (error) {
            console.error("Error al generar la lista de compras:", error);
            listaContainer.innerHTML = '<p style="color:red;">Hubo un error al generar la lista. Revisa la consola.</p>';
        }
    };

    generarListaAutomatica(); // Ejecutar al cargar la página
}
