const lotTimestamp = (lot) => {
    if (lot?.fechaCompra?.seconds !== undefined) return lot.fechaCompra.seconds;
    if (lot?.fechaCompra?.toMillis) return Math.floor(lot.fechaCompra.toMillis() / 1000);
    return 0;
};

export const getLatestLot = (lots = []) => {
    if (!Array.isArray(lots) || lots.length === 0) return null;
    return [...lots].sort((a, b) => lotTimestamp(b) - lotTimestamp(a))[0] || null;
};

export const getEffectiveUnitCost = (rawMaterial) => {
    const latestLot = getLatestLot(rawMaterial?.lotes);

    let purchaseUnitCost = 0;
    if (latestLot) {
        purchaseUnitCost = Number(latestLot.costoUnitario) || 0;

        if (purchaseUnitCost <= 0) {
            const purchasePrice = Number(latestLot.precioCompra) || 0;
            const purchaseQuantity = Number(latestLot.cantidadComprada) || 0;
            purchaseUnitCost = purchaseQuantity > 0 ? purchasePrice / purchaseQuantity : 0;
        }
    }

    const supplierCurrentUnitCost = Number(rawMaterial?.proveedorCostoUnitarioActual) || 0;
    const supplierReference = Number(rawMaterial?.costoReferenciaProveedorUnitario) || 0;

    if (supplierCurrentUnitCost > 0) return supplierCurrentUnitCost;
    if (supplierReference > 0) return supplierReference;
    return purchaseUnitCost;
};

export const calculateRecipeUnitCost = (
    recipe,
    ingredientMap,
    { preferStoredUnitCost = false } = {}
) => {
    if (!recipe) return 0;

    if (preferStoredUnitCost && Number(recipe.costoPorcion) > 0) {
        return Number(recipe.costoPorcion);
    }

    if (!Array.isArray(recipe.ingredientes) || recipe.ingredientes.length === 0) {
        return 0;
    }

    let totalCost = 0;

    recipe.ingredientes.forEach((ingredient) => {
        const rawMaterial = ingredientMap.get(ingredient.idMateriaPrima);
        const unitCost = getEffectiveUnitCost(rawMaterial);

        if (unitCost <= 0) return;
        const quantity = Number(ingredient.cantidad) || 0;
        totalCost += unitCost * quantity;
    });

    const yieldAmount = Number(recipe.rendimiento) || 0;
    return yieldAmount > 0 ? totalCost / yieldAmount : totalCost;
};

export const calculateRoundedSalePrice = (
    cost,
    marginPercent,
    { roundTo = 10, midpointDown = false } = {}
) => {
    const baseCost = Number(cost) || 0;
    const margin = Number(marginPercent) || 0;
    const rawPrice = baseCost * (1 + margin / 100);

    if (!roundTo || roundTo <= 0) return rawPrice;

    if (midpointDown) {
        const lower = Math.floor(rawPrice / roundTo) * roundTo;
        const remainder = rawPrice - lower;
        const rounded = remainder <= (roundTo / 2)
            ? lower
            : lower + roundTo;

        if (rawPrice > 0 && rounded <= 0) return roundTo;
        return rounded;
    }

    return Math.round(rawPrice / roundTo) * roundTo;
};


export const getAppliedMarginPercent = (product, globalMargin = 0) => {
    const hasIndividual =
        product?.margenIndividual !== undefined &&
        product?.margenIndividual !== null &&
        product?.margenIndividual !== '';

    return hasIndividual
        ? (parseFloat(product.margenIndividual) || 0)
        : (Number(globalMargin) || 0);
};

export const normalizeSaleUnits = (value) => {
    if (value === null || value === undefined || value === '') return 1;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > 10000) return 1;
    return number;
};

export const calculateProductSalePrice = (
    product,
    ingredientMap,
    globalMargin = 0
) => {
    // rendimiento = cuántas unidades/porciones produce la receta.
    // unidadesPorVenta = cuántas de esas unidades forman UNA venta.
    // Ej.: Chipá rinde 300, se vende x6 => el costo/precio de Mostrador es x6.
    const recipeUnitCost = calculateRecipeUnitCost(product, ingredientMap);
    const unitsPerSale = normalizeSaleUnits(product?.unidadesPorVenta);
    const cost = recipeUnitCost * unitsPerSale;
    const marginPercent = getAppliedMarginPercent(product, globalMargin);
    const price = calculateRoundedSalePrice(
        cost,
        marginPercent,
        { roundTo: 100, midpointDown: true }
    );

    return { recipeUnitCost, unitsPerSale, cost, marginPercent, price };
};

export const normalizeWholeCakePortions = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 2 || number > 100) return null;
    return number;
};

export const normalizeManualWholeCakePrice = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    return Math.round(number * 100) / 100;
};

export const calculateWholeCakePricing = ({
    unitPrice,
    portions,
    manualPrice
} = {}) => {
    const normalizedUnitPrice = Number(unitPrice);
    const normalizedPortions = normalizeWholeCakePortions(portions);
    const normalizedManual = normalizeManualWholeCakePrice(manualPrice);

    const automaticPrice =
        normalizedPortions !== null &&
        Number.isFinite(normalizedUnitPrice) &&
        normalizedUnitPrice > 0
            ? normalizedUnitPrice * (normalizedPortions - 1)
            : null;

    if (normalizedManual !== null) {
        return {
            portions: normalizedPortions,
            automaticPrice,
            currentPrice: normalizedManual,
            source: 'manual',
            configured: true
        };
    }

    if (automaticPrice !== null) {
        return {
            portions: normalizedPortions,
            automaticPrice,
            currentPrice: automaticPrice,
            source: 'automatico',
            configured: true
        };
    }

    return {
        portions: normalizedPortions,
        automaticPrice: null,
        currentPrice: null,
        source: null,
        configured: false
    };
};

export const buildCommercialPricing = ({
    product,
    ingredientMap,
    globalMargin = 0
} = {}) => {
    const sale = calculateProductSalePrice(product, ingredientMap, globalMargin);
    const whole = calculateWholeCakePricing({
        unitPrice: sale.price,
        portions: product?.porcionesTortaEntera,
        manualPrice: product?.precioTortaEnteraManual
    });

    return {
        unitPrice: sale.price,
        unitsPerSale: sale.unitsPerSale,
        recipeUnitCost: sale.recipeUnitCost,
        saleUnitCost: sale.cost,
        wholeCakePortions: whole.portions,
        wholeCakeAutomaticPrice: whole.automaticPrice,
        wholeCakeCurrentPrice: whole.currentPrice,
        wholeCakePriceSource: whole.source,
        wholeCakeConfigured: whole.configured
    };
};
