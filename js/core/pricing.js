const lotTimestamp = (lot) => {
    if (lot?.fechaCompra?.seconds !== undefined) return lot.fechaCompra.seconds;
    if (lot?.fechaCompra?.toMillis) return Math.floor(lot.fechaCompra.toMillis() / 1000);
    return 0;
};

export const getLatestLot = (lots = []) => {
    if (!Array.isArray(lots) || lots.length === 0) return null;
    return [...lots].sort((a, b) => lotTimestamp(b) - lotTimestamp(a))[0] || null;
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
        const latestLot = getLatestLot(rawMaterial?.lotes);

        if (!latestLot) return;

        const unitCost = Number(latestLot.costoUnitario) || 0;
        const quantity = Number(ingredient.cantidad) || 0;
        totalCost += unitCost * quantity;
    });

    const yieldAmount = Number(recipe.rendimiento) || 0;
    return yieldAmount > 0 ? totalCost / yieldAmount : totalCost;
};

export const calculateRoundedSalePrice = (
    cost,
    marginPercent,
    { roundTo = 10 } = {}
) => {
    const baseCost = Number(cost) || 0;
    const margin = Number(marginPercent) || 0;
    const rawPrice = baseCost * (1 + margin / 100);

    if (!roundTo || roundTo <= 0) return rawPrice;
    return Math.round(rawPrice / roundTo) * roundTo;
};
