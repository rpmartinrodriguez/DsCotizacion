import {
    getFirestore, collection, getDocs, query
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export function setupPrecios(app) {
    const db = getFirestore(app);
    const recetasCollection = collection(db, 'recetas');
    const materiasPrimasCollection = collection(db, 'materiasPrimas');

    const container = document.getElementById('lista-precios-container');
    const inputMayorista = document.getElementById('porcentaje-mayorista');
    const inputMinorista = document.getElementById('porcentaje-minorista');
    const btnPdfCosto = document.getElementById('btn-pdf-costo');
    const btnPdfMayorista = document.getElementById('btn-pdf-mayorista');
    const btnPdfMinorista = document.getElementById('btn-pdf-minorista');

    let recetasConCosto = [];
    let logoDataUrlCache = null;

    const cargarLogoDataUrl = async () => {
        if (logoDataUrlCache) return logoDataUrlCache;

        try {
            const response = await fetch('assets/logo.png', { cache: 'force-cache' });
            if (!response.ok) throw new Error(`No se pudo cargar el logo: ${response.status}`);

            const blob = await response.blob();
            logoDataUrlCache = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            return logoDataUrlCache;
        } catch (error) {
            console.warn("El PDF se generará sin marca de agua:", error);
            return null;
        }
    };

    const calcularCostoUnitarioReceta = (receta, materiasPrimasMap) => {
        let costoTotal = 0;
        if (!receta.ingredientes) return 0;

        receta.ingredientes.forEach((ing) => {
            const mp = materiasPrimasMap.get(ing.idMateriaPrima);

            if (mp && mp.lotes && mp.lotes.length > 0) {
                const ultimoLote = [...mp.lotes]
                    .sort((a, b) => b.fechaCompra.seconds - a.fechaCompra.seconds)[0];

                costoTotal += (ultimoLote.costoUnitario || 0) * ing.cantidad;
            }
        });

        return receta.rendimiento > 0 ? costoTotal / receta.rendimiento : costoTotal;
    };

    const renderizarListaPrecios = (recetas) => {
        container.innerHTML = '';

        if (recetas.length === 0) {
            container.textContent = 'No hay recetas creadas.';
            return;
        }

        const porCategoria = {};

        recetas.forEach((receta) => {
            const categoria = receta.categoria || 'Sin categoría';
            if (!porCategoria[categoria]) porCategoria[categoria] = [];
            porCategoria[categoria].push(receta);
        });

        Object.keys(porCategoria).sort().forEach((categoria) => {
            const titulo = document.createElement('h3');
            titulo.className = 'card__subtitle';
            titulo.textContent = categoria;
            container.appendChild(titulo);

            const lista = document.createElement('ul');
            lista.className = 'lista-sencilla';

            porCategoria[categoria]
                .sort((a, b) => a.nombreTorta.localeCompare(b.nombreTorta))
                .forEach((receta) => {
                    const item = document.createElement('li');

                    const nombre = document.createElement('span');
                    nombre.textContent = `${receta.nombreTorta} (x unidad)`;

                    const costo = document.createElement('strong');
                    costo.style.color = 'var(--primary-color)';
                    costo.style.fontSize = '1.1rem';
                    costo.textContent = `$${receta.costoCalculado.toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}`;

                    item.append(nombre, costo);
                    lista.appendChild(item);
                });

            container.appendChild(lista);
        });
    };

    const generarPDF = async (titulo, porcentajeGanancia) => {
        if (recetasConCosto.length === 0) {
            alert("No hay recetas para generar la lista.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();

        const logoDataUrl = await cargarLogoDataUrl();

        if (logoDataUrl) {
            try {
                pdf.saveGraphicsState();
                pdf.setGState(new pdf.GState({ opacity: 0.08 }));
                pdf.addImage(logoDataUrl, 'PNG', 55, 90, 100, 100, 'dulce-sall-logo', 'FAST');
                pdf.restoreGraphicsState();
            } catch (error) {
                console.warn("No se pudo agregar la marca de agua al PDF:", error);
            }
        }

        pdf.setFontSize(21);
        pdf.text(titulo, 105, 20, { align: 'center' });
        pdf.setFontSize(10);
        pdf.setTextColor(110, 102, 110);
        pdf.text(
            `Dulce Sall · Generado el ${new Date().toLocaleDateString('es-AR')}`,
            105,
            28,
            { align: 'center' }
        );
        pdf.setTextColor(0, 0, 0);

        const filas = [];
        const porCategoria = {};

        recetasConCosto.forEach((receta) => {
            const categoria = receta.categoria || 'Sin categoría';
            if (!porCategoria[categoria]) porCategoria[categoria] = [];
            porCategoria[categoria].push(receta);
        });

        Object.keys(porCategoria).sort().forEach((categoria) => {
            porCategoria[categoria]
                .sort((a, b) => a.nombreTorta.localeCompare(b.nombreTorta))
                .forEach((receta) => {
                    const precioFinal = receta.costoCalculado * (1 + porcentajeGanancia / 100);

                    filas.push([
                        categoria,
                        receta.nombreTorta,
                        `$${precioFinal.toLocaleString('es-AR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}`
                    ]);
                });
        });

        pdf.autoTable({
            head: [['Categoría', 'Producto', 'Precio por unidad']],
            body: filas,
            startY: 36,
            theme: 'grid',
            headStyles: { fillColor: [217, 86, 145] },
            styles: { fontSize: 9, cellPadding: 3 }
        });

        pdf.save(`${titulo.replace(/\s+/g, '_')}.pdf`);
    };

    const setPdfButtonsDisabled = (disabled) => {
        [btnPdfCosto, btnPdfMayorista, btnPdfMinorista].forEach((button) => {
            if (button) button.disabled = disabled;
        });
    };

    const ejecutarGeneracion = async (button, titulo, porcentaje) => {
        const originalText = button.textContent;

        try {
            setPdfButtonsDisabled(true);
            button.textContent = 'Generando…';
            await generarPDF(titulo, porcentaje);
        } finally {
            setPdfButtonsDisabled(false);
            button.textContent = originalText;
        }
    };

    const setupEventListeners = () => {
        btnPdfCosto.addEventListener('click', () => {
            ejecutarGeneracion(btnPdfCosto, 'Lista de Precios de Costo', 0);
        });

        btnPdfMayorista.addEventListener('click', () => {
            const porcentaje = parseFloat(inputMayorista.value) || 0;
            ejecutarGeneracion(btnPdfMayorista, 'Lista de Precios Mayorista', porcentaje);
        });

        btnPdfMinorista.addEventListener('click', () => {
            const porcentaje = parseFloat(inputMinorista.value) || 0;
            ejecutarGeneracion(btnPdfMinorista, 'Lista de Precios Minorista', porcentaje);
        });
    };

    const init = async () => {
        try {
            const [snapshotRecetas, snapshotMateriasPrimas] = await Promise.all([
                getDocs(query(recetasCollection)),
                getDocs(query(materiasPrimasCollection))
            ]);

            const todasLasRecetas = snapshotRecetas.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));

            const materiasPrimasMap = new Map(
                snapshotMateriasPrimas.docs.map((doc) => [doc.id, doc.data()])
            );

            recetasConCosto = todasLasRecetas.map((receta) => ({
                ...receta,
                costoCalculado: calcularCostoUnitarioReceta(receta, materiasPrimasMap)
            }));

            renderizarListaPrecios(recetasConCosto);
            setupEventListeners();
        } catch (error) {
            console.error("Error al cargar la lista de precios:", error);
            container.textContent = 'No se pudieron calcular los precios.';
        }
    };

    init();
}
