// Exportación A4 de precios del Mostrador. Sin consultas ni cambios en Firebase.
// Los códigos deben estar previamente persistidos en cada receta.
const displayPrice = value => '$ ' + Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
});

const barcodeImage = (code, drawBarcode, canvasFactory) => {
    const canvas = canvasFactory();
    const opts = {
        width: 3, height: 55, displayValue: true,
        margin: 7, fontSize: 17, textMargin: 2, lineColor: '#111111',
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

export function createPriceListPdf(products, {
    Pdf = globalThis.jspdf?.jsPDF,
    drawBarcode = globalThis.JsBarcode,
    canvasFactory = () => document.createElement('canvas'),
    today = new Date()
} = {}) {
    if (typeof Pdf !== 'function') throw new Error('No se pudo cargar la librería de PDF.');
    if (typeof drawBarcode !== 'function') throw new Error('No se pudo cargar el generador de códigos de barras.');
    if (!products?.length) throw new Error('No hay productos disponibles para exportar.');

    const items = [...products]
        .filter(product => product?.id && product.nombreTorta)
        .sort((a, b) => a.nombreTorta.localeCompare(b.nombreTorta, 'es'));
    if (!items.length) throw new Error('No hay productos con nombre para exportar.');

    const missingCode = items.find(item => !item.codigoBarras);
    if (missingCode) {
        throw new Error('Falta registrar el código de barras de ' + missingCode.nombreTorta);
    }

    const pdf = new Pdf({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const cols = 4;
    const rows = 5;
    const perPage = cols * rows;
    const gap = 3;
    const margin = 9;
    const pageWidth = 210;
    const cellSize = (pageWidth - 2 * margin - (cols - 1) * gap) / cols;
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
            pdf.text('Lista de precios y códigos de barras', margin, 19);
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
        const y = startY + row * (cellSize + gap);

        pdf.setFillColor(255, 253, 254);
        pdf.setDrawColor(225, 208, 218);
        pdf.setLineWidth(0.32);
        pdf.roundedRect(x, y, cellSize, cellSize, 1.5, 1.5, 'FD');

        let fontSize = 8.5;
        let lines = [];
        const name = String(item.nombreTorta || '').trim().replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
        do {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(fontSize);
            lines = pdf.splitTextToSize(name, cellSize - 6);
            if (lines.length <= 4) break;
            fontSize -= 0.5;
        } while (fontSize >= 5.5);
        // Aun en productos muy extensos, no recortamos la identificación:
        // el texto se comprime para que el código y precio sigan visibles.
        if (lines.length > 4) {
            fontSize = 5.1;
            pdf.setFontSize(fontSize);
            lines = pdf.splitTextToSize(name, cellSize - 6);
        }
        pdf.setTextColor(61, 53, 61);
        pdf.text(lines, x + cellSize / 2, y + 6.5, {
            align: 'center',
            lineHeightFactor: Math.min(1.14, 4 / Math.max(lines.length, 1))
        });

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11.5);
        pdf.setTextColor(151, 53, 100);
        pdf.text(displayPrice(item.precioCalculado), x + cellSize / 2, y + 26, { align: 'center' });

        const barcode = barcodeImage(item.codigoBarras, drawBarcode, canvasFactory);
        const imageWidth = cellSize - 6;
        const imageHeight = Math.min(13.3, imageWidth / barcode.aspect);
        pdf.addImage(barcode.data, 'PNG', x + 3, y + 29.5, imageWidth, imageHeight);
    }

    for (let page = 1; page <= pages; page++) {
        pdf.setPage(page);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(104, 94, 104);
        pdf.text('Precios al momento de exportación · Dulce Sall', margin, 285);
        pdf.text(page + ' / ' + pages, pageWidth - margin, 285, { align: 'right' });
    }
    const fileDate = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0')
    ].join('-');
    const fileName = 'DulceSall_Precios_Barras_' + fileDate + '.pdf';
    pdf.save(fileName);
    return { total: items.length, pages, fileName };
}
