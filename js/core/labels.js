const fitText = (ctx, text, maxWidth, {
    startSize = 28,
    minSize = 14,
    step = 2,
    fontWeight = 'bold',
    fontFamily = 'sans-serif'
} = {}) => {
    let fontSize = startSize;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

    while (ctx.measureText(text).width > maxWidth && fontSize > minSize) {
        fontSize -= step;
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    }

    return fontSize;
};

export const drawBarcodeLabel = (canvas, product) => {
    if (!canvas || !product) return;

    canvas.width = 400;
    canvas.height = 240;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';

    fitText(ctx, product.nombreTorta || '', 360, {
        startSize: 28,
        minSize: 14,
        step: 2
    });
    ctx.fillText(product.nombreTorta || '', canvas.width / 2, 45);

    const tempCanvas = document.createElement('canvas');
    const barcode = globalThis.JsBarcode;

    if (typeof barcode !== 'function') {
        throw new Error('JsBarcode no está disponible.');
    }

    try {
        barcode(tempCanvas, product.codigoBarras, {
            format: 'EAN13',
            lineColor: '#000',
            width: 3,
            height: 120,
            displayValue: true,
            fontSize: 24,
            margin: 10
        });
    } catch {
        barcode(tempCanvas, product.codigoBarras, {
            format: 'CODE128',
            lineColor: '#000',
            width: 2.5,
            height: 120,
            displayValue: true,
            fontSize: 22,
            margin: 10
        });
    }

    ctx.drawImage(tempCanvas, (canvas.width - tempCanvas.width) / 2, 60);
};

export const drawPromoLabel = (canvas, {
    type = 'OFERTA',
    productName = '',
    subtitle = ''
} = {}) => {
    if (!canvas) return;

    canvas.width = 400;
    canvas.height = 240;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'black';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'black';

    ctx.font = 'bold 60px sans-serif';
    ctx.fillText(String(type).toUpperCase(), canvas.width / 2, 85);

    fitText(ctx, productName, 380, {
        startSize: 36,
        minSize: 16,
        step: 2
    });
    ctx.fillText(productName, canvas.width / 2, 145);

    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(subtitle, canvas.width / 2, 205);
};

export const downloadCanvasPng = (canvas, fileName) => {
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = fileName;
    link.href = canvas.toDataURL('image/png');
    link.click();
};
