import { 
    getFirestore, collection, getDocs, query
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupPrecios(app) {
    const db = getFirestore(app);
    const recetasCollection = collection(db, 'recetas');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');

    // Referencias al DOM
    const container = document.getElementById('lista-precios-container');
    const inputMayorista = document.getElementById('porcentaje-mayorista');
    const inputMinorista = document.getElementById('porcentaje-minorista');
    const inputLogoUrl = document.getElementById('logo-url');
    const btnPdfCosto = document.getElementById('btn-pdf-costo');
    const btnPdfMayorista = document.getElementById('btn-pdf-mayorista');
    const btnPdfMinorista = document.getElementById('btn-pdf-minorista');

    // Variable global para guardar los datos calculados
    let recetasConCosto = [];

    // Función principal que se ejecuta al cargar la página
    const init = async () => {
        try {
            const [snapshotRecetas, snapshotMateriasPrimas] = await Promise.all([
                getDocs(query(recetasCollection)),
                getDocs(query(materiasPrimasCollection))
            ]);

            const todasLasRecetas = snapshotRecetas.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const materiasPrimasMap = new Map(snapshotMateriasPrimas.docs.map(doc => [doc.id, doc.data()]));

            recetasConCosto = todasLasRecetas.map(receta => {
                const costoUnitario = calcularCostoUnitarioReceta(receta, materiasPrimasMap);
                return { ...receta, costoCalculado: costoUnitario };
            });

            renderizarListaPrecios(recetasConCosto);
            setupEventListeners();

        } catch (error) {
            console.error("Error al cargar la lista de precios:", error);
            container.innerHTML = '<p style="color:var(--danger-color);">No se pudieron calcular los precios.</p>';
        }
    };

    const calcularCostoUnitarioReceta = (receta, materiasPrimasMap) => {
        let costoTotalDeIngredientes = 0;
        if (!receta.ingredientes) return 0;
        receta.ingredientes.forEach(ingredienteEnReceta => {
            const materiaPrima = materiasPrimasMap.get(ingredienteEnReceta.idMateriaPrima);
            if (materiaPrima && materiaPrima.lotes && materiaPrima.lotes.length > 0) {
                const lotesOrdenados = [...materiaPrima.lotes].sort((a, b) => b.fechaCompra.seconds - a.fechaCompra.seconds);
                const ultimoLote = lotesOrdenados[0];
                const costoUnitarioMateriaPrima = ultimoLote.costoUnitario || 0;
                costoTotalDeIngredientes += costoUnitarioMateriaPrima * ingredienteEnReceta.cantidad;
            }
        });
        return receta.rendimiento > 0 ? costoTotalDeIngredientes / receta.rendimiento : costoTotalDeIngredientes;
    };

    const renderizarListaPrecios = (recetas) => {
        container.innerHTML = '';
        if (recetas.length === 0) {
            container.innerHTML = '<p>No tienes recetas creadas.</p>';
            return;
        }
        const recetasPorCategoria = {};
        recetas.forEach(receta => {
            const categoria = receta.categoria || 'Sin Categoría';
            if (!recetasPorCategoria[categoria]) recetasPorCategoria[categoria] = [];
            recetasPorCategoria[categoria].push(receta);
        });
        const categoriasOrdenadas = Object.keys(recetasPorCategoria).sort();
        categoriasOrdenadas.forEach(categoria => {
            const tituloCategoria = document.createElement('h3');
            tituloCategoria.className = 'card__subtitle';
            tituloCategoria.textContent = categoria;
            container.appendChild(tituloCategoria);
            const lista = document.createElement('ul');
            lista.className = 'lista-sencilla';
            const recetasDeCategoria = recetasPorCategoria[categoria].sort((a, b) => a.nombreTorta.localeCompare(b.nombreTorta));
            recetasDeCategoria.forEach(receta => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${receta.nombreTorta} (x unidad)</span><strong style="color: var(--primary-color); font-size: 1.1rem;">$${receta.costoCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;
                lista.appendChild(li);
            });
            container.appendChild(lista);
        });
    };

    // --- NUEVA LÓGICA PARA GENERAR PDF ---
    const generarPDF = (titulo, porcentajeGanancia, logoUrl) => {
        if (recetasConCosto.length === 0) {
            alert("No hay recetas para generar la lista.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // 1. Añadir el logo como marca de agua (si se proporcionó una URL)
        if (logoUrl) {
            try {
                const img = new Image();
                img.src = logoUrl;
                img.onload = () => {
                    doc.globalAlpha = 0.1; // Opacidad
                    doc.addImage(img, 'PNG', 50, 100, 110, 110);
                    doc.globalAlpha = 1.0; // Restaurar opacidad
                    crearContenidoPDF(doc, titulo, porcentajeGanancia);
                };
                img.onerror = () => {
                    console.warn("No se pudo cargar la imagen del logo. Se generará el PDF sin marca de agua.");
                    crearContenidoPDF(doc, titulo, porcentajeGanancia);
                }
            } catch (e) {
                console.warn("Error con la URL del logo. Se generará el PDF sin marca de agua.");
                crearContenidoPDF(doc, titulo, porcentajeGanancia);
            }
        } else {
            crearContenidoPDF(doc, titulo, porcentajeGanancia);
        }
    };
    
    const crearContenidoPDF = (doc, titulo, porcentajeGanancia) => {
        // 2. Título y fecha
        doc.setFontSize(22);
        doc.text(titulo, 105, 20, null, null, 'center');
        doc.setFontSize(12);
        doc.text(`Generado el: ${new Date().toLocaleDateString('es-AR')}`, 105, 30, null, null, 'center');

        // 3. Preparar datos para la tabla
        const head = [['Categoría', 'Producto', 'Precio por Unidad']];
        const body = [];
        
        const recetasPorCategoria = {};
        recetasConCosto.forEach(receta => {
            const categoria = receta.categoria || 'Sin Categoría';
            if (!recetasPorCategoria[categoria]) recetasPorCategoria[categoria] = [];
            recetasPorCategoria[categoria].push(receta);
        });

        Object.keys(recetasPorCategoria).sort().forEach(categoria => {
            recetasPorCategoria[categoria].sort((a,b) => a.nombreTorta.localeCompare(b.nombreTorta)).forEach(receta => {
                const precioFinal = receta.costoCalculado * (1 + (porcentajeGanancia / 100));
                body.push([
                    categoria,
                    receta.nombreTorta,
                    `$${precioFinal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                ]);
            });
        });

        // 4. Crear la tabla
        doc.autoTable({
            head: head,
            body: body,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [255, 150, 197] } // Color rosa para el encabezado
        });
        
        // 5. Guardar el archivo
        const nombreArchivo = `${titulo.replace(/ /g, '_')}.pdf`;
        doc.save(nombreArchivo);
    };

    // --- NUEVOS EVENT LISTENERS PARA LOS BOTONES DE DESCARGA ---
    const setupEventListeners = () => {
        btnPdfCosto.addEventListener('click', () => {
            generarPDF('Lista de Precios de Costo', 0, inputLogoUrl.value.trim());
        });

        btnPdfMayorista.addEventListener('click', () => {
            const porcentaje = parseFloat(inputMayorista.value) || 0;
            generarPDF('Lista de Precios Mayorista', porcentaje, inputLogoUrl.value.trim());
        });

        btnPdfMinorista.addEventListener('click', () => {
            const porcentaje = parseFloat(inputMinorista.value) || 0;
            generarPDF('Lista de Precios Minorista', porcentaje, inputLogoUrl.value.trim());
        });
    };

    // Iniciamos todo el proceso
    init();
}
