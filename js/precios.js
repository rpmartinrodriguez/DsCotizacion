import { 
    getFirestore, collection, getDocs, query
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupPrecios(app) {
    const db = getFirestore(app);
    const recetasCollection = collection(db, 'recetas');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');

    const container = document.getElementById('lista-precios-container');

    // Función principal que se ejecuta al cargar la página
    const init = async () => {
        try {
            // 1. Obtenemos todas las recetas y materias primas al mismo tiempo
            const [snapshotRecetas, snapshotMateriasPrimas] = await Promise.all([
                getDocs(query(recetasCollection)),
                getDocs(query(materiasPrimasCollection))
            ]);

            const todasLasRecetas = snapshotRecetas.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Creamos un "Mapa" para buscar materias primas por su ID fácilmente
            const materiasPrimasMap = new Map(
                snapshotMateriasPrimas.docs.map(doc => [doc.id, doc.data()])
            );

            // 2. Calculamos el costo de cada receta
            const recetasConCosto = todasLasRecetas.map(receta => {
                const costoUnitario = calcularCostoUnitarioReceta(receta, materiasPrimasMap);
                return { ...receta, costoCalculado: costoUnitario };
            });

            // 3. Mostramos la lista en pantalla
            renderizarListaPrecios(recetasConCosto);

        } catch (error) {
            console.error("Error al cargar la lista de precios:", error);
            container.innerHTML = '<p style="color:var(--danger-color);">No se pudieron calcular los precios. Revisa la consola.</p>';
        }
    };

    // Función que calcula el costo DE UNA SOLA UNIDAD de la receta
    const calcularCostoUnitarioReceta = (receta, materiasPrimasMap) => {
        let costoTotalDeIngredientes = 0;
        if (!receta.ingredientes || receta.ingredientes.length === 0) {
            return 0; // Si no tiene ingredientes, el costo es 0
        }

        receta.ingredientes.forEach(ingredienteEnReceta => {
            const materiaPrima = materiasPrimasMap.get(ingredienteEnReceta.idMateriaPrima);

            if (materiaPrima && materiaPrima.lotes && materiaPrima.lotes.length > 0) {
                // Usamos el costo del último lote comprado para el cálculo
                const lotesOrdenados = [...materiaPrima.lotes].sort((a, b) => b.fechaCompra.seconds - a.fechaCompra.seconds);
                const ultimoLote = lotesOrdenados[0];
                const costoUnitarioMateriaPrima = ultimoLote.costoUnitario || 0;
                
                costoTotalDeIngredientes += costoUnitarioMateriaPrima * ingredienteEnReceta.cantidad;
            }
        });

        // --- MODIFICACIÓN CLAVE: Costo por Unidad ---
        // Dividimos el costo total de los ingredientes por la cantidad de unidades que rinde la receta.
        // Si el rendimiento no está definido (o es 0), devolvemos el costo total para evitar errores.
        if (receta.rendimiento && receta.rendimiento > 0) {
            return costoTotalDeIngredientes / receta.rendimiento;
        } else {
            return costoTotalDeIngredientes; // Fallback por si no hay rendimiento
        }
    };

    // Función que dibuja la lista en el HTML
    const renderizarListaPrecios = (recetasConCosto) => {
        container.innerHTML = '';
        if (recetasConCosto.length === 0) {
            container.innerHTML = '<p>No tienes recetas creadas para mostrar.</p>';
            return;
        }

        // Agrupamos las recetas por categoría
        const recetasPorCategoria = {};
        recetasConCosto.forEach(receta => {
            const categoria = receta.categoria || 'Sin Categoría';
            if (!recetasPorCategoria[categoria]) {
                recetasPorCategoria[categoria] = [];
            }
            recetasPorCategoria[categoria].push(receta);
        });

        // Ordenamos las categorías alfabéticamente
        const categoriasOrdenadas = Object.keys(recetasPorCategoria).sort();

        categoriasOrdenadas.forEach(categoria => {
            const tituloCategoria = document.createElement('h3');
            tituloCategoria.className = 'card__subtitle';
            tituloCategoria.textContent = categoria;
            container.appendChild(tituloCategoria);

            const lista = document.createElement('ul');
            lista.className = 'lista-sencilla';

            // Ordenamos las recetas de la categoría alfabéticamente
            const recetasDeCategoria = recetasPorCategoria[categoria].sort((a, b) => a.nombreTorta.localeCompare(b.nombreTorta));

            recetasDeCategoria.forEach(receta => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${receta.nombreTorta} (x unidad)</span>
                    <strong style="color: var(--primary-color); font-size: 1.1rem;">
                        $${receta.costoCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </strong>
                `;
                lista.appendChild(li);
            });
            container.appendChild(lista);
        });
    };

    // Iniciamos todo el proceso
    init();
}
