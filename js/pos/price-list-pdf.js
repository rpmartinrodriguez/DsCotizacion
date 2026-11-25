// Cargar jsPDF sólo cuando el administrador pide el archivo: evita peso extra en cada venta.
let libraryPromise = null;
export const loadPriceListPdfLibrary = () => {
    if (globalThis.jspdf?.jsPDF) return Promise.resolve(globalThis.jspdf.jsPDF);
    if (!libraryPromise) {
        libraryPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.async = true;
            script.onload = () => {
                if (globalThis.jspdf?.jsPDF) resolve(globalThis.jspdf.jsPDF);
                else reject(new Error('La librería PDF no se inicializó.'));
            };
            script.onerror = () => reject(new Error('No se pudo descargar el generador de PDF. Revisá la conexión.'));
            document.head.appendChild(script);
        }).catch(error => {
            libraryPromise = null;
            throw error;
        });
    }
    return libraryPromise;
};

// Exportaciones A4 separadas. La lista de precios no depende de códigos de barras.
// El catálogo permanente usa sólo códigos previamente persistidos en Recetas.
const displayPrice = value => '$ ' + Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
});

const barcodeImage = (code, drawBarcode, canvasFactory) => {
    const canvas = canvasFactory();
    const opts = {
        width: 3, height: 100, displayValue: true,
        // Zona blanca reservada alrededor de la imagen en la tarjeta.
        margin: 0, fontSize: 19, textMargin: 2, lineColor: '#111111',
        background: '#ffffff'
    };
    try {
        drawBarcode(canvas, String(code), { ...opts, format: 'EAN13' });
    } catch {
        drawBarcode(canvas, String(code), { ...opts, format: 'CODE128' });
    }
    return {
        data: canvas.toDataURL('image/png'),
        aspect: canvas.width / canvas.height
    };
};

export function createPriceListPdf(products, options = {}) {
    return createCatalogPdf(products, options, false);
}

export function createBarcodeCatalogPdf(products, options = {}) {
    return createCatalogPdf(products, options, true);
}

const categoryOf = product => String(product.categoria || 'Otros').trim() || 'Otros';

function createCatalogPdf(products, {
    Pdf = globalThis.jspdf?.jsPDF,
    drawBarcode = globalThis.JsBarcode,
    canvasFactory = () => document.createElement('canvas'),
    today = new Date()
} = {}, permanent) {
    if (typeof Pdf !== 'function') throw new Error('No se pudo cargar la librería de PDF.');
    if (permanent && typeof drawBarcode !== 'function') throw new Error('No se pudo cargar el generador de códigos de barras.');
    if (!products?.length) throw new Error('No hay productos disponibles para exportar.');

    const items = [...products]
        .filter(product => product?.id && product.nombreTorta)
        .sort((a, b) => categoryOf(a).localeCompare(categoryOf(b), 'es') || a.nombreTorta.localeCompare(b.nombreTorta, 'es'));
    if (!items.length) throw new Error('No hay productos con nombre para exportar.');

    const missingCode = permanent && items.find(item => !item.codigoBarras);
    if (missingCode) {
        throw new Error('Falta registrar el código de barras de ' + missingCode.nombreTorta);
    }

    const pdf = new Pdf({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const cols = permanent ? 4 : 2;
    const rows = permanent ? 5 : 14;
    const perPage = cols * rows;
    const gap = 3;
    const margin = 9;
    const pageWidth = 210;
    const cellSize = (pageWidth - 2 * margin - (cols - 1) * gap) / cols;
    const cellHeight = permanent ? cellSize : 15;
    const startY = 27;
    const pages = Math.ceil(items.length / perPage);
    const dateLabel = today.toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const timeLabel = today.toLocaleTimeString('es-AR', {
        hour: '2-digit', minute: '2-digit'
    });

    for (let index = 0; index < items.length; index++) {
        const pageIndex = Math.floor(index / perPage);
        const position = index % perPage;
        if (position === 0) {
            if (pageIndex) pdf.addPage();
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(15);
            pdf.setTextColor(113, 51, 80);
            pdf.text('DULCE SALL', margin, 13);
            pdf.setFontSize(9);
            pdf.setTextColor(78, 70, 78);
            pdf.text(permanent ? 'Catálogo permanente de escaneo · Sin precios' : 'Lista de precios vigentes · Uso interno', margin, 19);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.text(dateLabel + ' · ' + timeLabel, pageWidth - margin, 19, { align: 'right' });
            pdf.setDrawColor(230, 210, 220);
            pdf.line(margin, 22, pageWidth - margin, 22);
        }

        const item = items[index];
        const col = position % cols;
        const row = Math.floor(position / cols);
        const x = margin + col * (cellSize + gap);
        const y = startY + row * (cellHeight + (permanent ? gap : 2));

        pdf.setFillColor(255, 253, 254);
        pdf.setDrawColor(225, 208, 218);
        pdf.setLineWidth(0.32);
        pdf.roundedRect(x, y, cellSize, cellHeight, 1.5, 1.5, 'FD');

        if (!permanent) {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7);
            pdf.setTextColor(104, 94, 104);
            const category = pdf.splitTextToSize(categoryOf(item), cellSize - 35)[0];
            pdf.text(category, x + 3, y + 4);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.setTextColor(61, 53, 61);
            const nameLines = pdf.splitTextToSize(String(item.nombreTorta).trim(), cellSize - 35);
            const visible = nameLines.slice(0, 2);
            if (nameLines.length > 2) visible[1] = visible[1].trimEnd().slice(0, -3) + '…';
            pdf.text(visible, x + 3, y + 8.5, { lineHeightFactor: 1.08 });
            pdf.setFontSize(10);
            pdf.setTextColor(151, 53, 100);
            pdf.text(displayPrice(item.precioCalculado), x + cellSize - 3, y + 9, { align: 'right' });
            continue;
        }

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(104, 94, 104);
        pdf.text(pdf.splitTextToSize(categoryOf(item), cellSize - 6)[0], x + cellSize / 2, y + 4, { align: 'center' });

        let fontSize = 8.5;
        let lines = [];
        const name = String(item.nombreTorta || '').trim().replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
        // Hasta 16 mm para el nombre, sin invadir el código.
        do {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(fontSize);
            lines = pdf.splitTextToSize(name, cellSize - 6);
            const heightMM = lines.length * fontSize * 0.3528 * 1.08;
            if (heightMM <= 16) break;
            fontSize -= 0.4;
        } while (fontSize >= 5);
        if (lines.length * fontSize * 0.3528 * 1.08 > 16) {
            const maxLines = Math.max(1, Math.floor(16 / (fontSize * 0.3528 * 1.08)));
            lines = lines.slice(0, maxLines);
            lines[lines.length - 1] = lines[lines.length - 1].trimEnd().slice(0, -3) + '…';
        }
        pdf.setTextColor(61, 53, 61);
        pdf.text(lines, x + cellSize / 2, y + 9, {
            align: 'center', lineHeightFactor: 1.08
        });

        const barcode = barcodeImage(item.codigoBarras, drawBarcode, canvasFactory);
        // EAN13 con barras de ancho legible y márgenes de calma en ambos lados.
        const maxImageWidth = cellSize - 8;
        const maxImageHeight = 17;
        const imageWidth = Math.min(maxImageWidth, maxImageHeight * barcode.aspect);
        const imageHeight = imageWidth / barcode.aspect;
        pdf.addImage(barcode.data, 'PNG',
            x + (cellSize - imageWidth) / 2, y + 26,
            imageWidth, imageHeight
        );
    }

    for (let page = 1; page <= pages; page++) {
        pdf.setPage(page);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(104, 94, 104);
        pdf.text(permanent ? 'Códigos permanentes · El precio se consulta al escanear' : 'Precios al momento de exportación · Dulce Sall', margin, 285);
        pdf.text(page + ' / ' + pages, pageWidth - margin, 285, { align: 'right' });
    }
    const fileDate = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0')
    ].join('-');
    const fileName = (permanent ? 'DulceSall_Codigos_Permanentes_' : 'DulceSall_Lista_Precios_') + fileDate + '.pdf';
    pdf.save(fileName);
    return { total: items.length, pages, fileName };
}
