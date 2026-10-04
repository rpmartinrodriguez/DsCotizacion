import { calculateRecipeUnitCost } from "../core/pricing.js";
import { dateToYMD } from "../core/format.js";

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export const EERR_CATEGORIES = Object.freeze([
    'Personal',
    'Alquiler y ocupación',
    'Servicios',
    'Impuestos y tasas',
    'Administración',
    'Comercialización',
    'Variables',
    'Otros'
]);

export const monthFromDate = date => {
    const actualDate = date?.toDate ? date.toDate() :
        date?.seconds !== undefined ? new Date(Number(date.seconds) * 1000) :
        date instanceof Date ? date : new Date(date);
    if (Number.isNaN(actualDate.getTime())) return '';
    return dateToYMD(actualDate).slice(0, 7);
};

export const calculateEERR = ({
    month,
    sales = [],
    expenses = [],
    boxes = [],
    recipes = [],
    materials = []
}) => {
    const ignoredBoxes = new Set(
        boxes.filter(box => box.eliminada === true).map(box => box.id)
    );
    const recipeMap = new Map();
    const rawMap = new Map(materials.map(item => [item.id, item]));

    recipes.forEach(recipe => {
        if (recipe.id) recipeMap.set(`id:${recipe.id}`, recipe);
        if (recipe.nombreTorta) {
            recipeMap.set(`name:${String(recipe.nombreTorta).trim().toLowerCase()}`, recipe);
        }
    });

    const salesInMonth = sales.filter(sale =>
        monthFromDate(sale.fecha) === month
        && !ignoredBoxes.has(sale.cajaId)
        && sale.eliminada !== true
    );

    let revenue = 0;
    let documentedCost = 0;
    let estimatedCost = 0;
    let accountedRevenue = 0;
    let documentedRevenue = 0;
    let missingRevenue = 0;
    let estimatedRevenue = 0;
    let salesWithUncertainCost = 0;

    for (const sale of salesInMonth) {
        const saleTotal = number(sale.total);
        revenue += saleTotal;
        const lines = Array.isArray(sale.items) ? sale.items : [];
        const lineBase = lines.reduce((sum, line) =>
            sum + number(line.precio) * number(line.cantidad), 0);

        if (!lines.length || lineBase <= 0) {
            missingRevenue += saleTotal;
            salesWithUncertainCost += 1;
            continue;
        }

        let hasMissing = false;
        for (const line of lines) {
            const units = number(line.cantidad);
            const lineRevenue = number(line.precio) * units;
            if (lineRevenue <= 0) continue;

            const adjustedRevenue = saleTotal * lineRevenue / lineBase;
            const storedCost = Number(line.costoTotalVenta);
            const snapshot = Number(line.costoSnapshotVersion) >= 1 &&
                Number.isFinite(storedCost) && storedCost > 0;
            if (snapshot) {
                documentedCost += storedCost;
                documentedRevenue += adjustedRevenue;
                accountedRevenue += adjustedRevenue;
                continue;
            }

            const recipe = recipeMap.get(`id:${line.id}`)
                || recipeMap.get(`name:${String(line.nombre || '').trim().toLowerCase()}`);
            const ingredients = recipe?.ingredientes || [];
            const validIngredients = Array.isArray(ingredients) &&
                ingredients.length > 0 &&
                ingredients.every(ingredient =>
                    rawMap.has(ingredient.idMateriaPrima)
                    && calculateRecipeUnitCost({
                        rendimiento: 1,
                        ingredientes: [ingredient]
                    }, rawMap) > 0
                );
            const storedLegacyCost = Number(recipe?.costoPorcion) > 0
                ? Number(recipe.costoPorcion)
                : Number(recipe?.costoTotal) > 0 && Number(recipe?.porcionesReceta) > 0
                    ? Number(recipe.costoTotal) / Number(recipe.porcionesReceta)
                    : 0;
            const currentCost = validIngredients
                ? calculateRecipeUnitCost(recipe, rawMap)
                : storedLegacyCost;

            if (currentCost > 0) {
                estimatedCost += currentCost * units;
                estimatedRevenue += adjustedRevenue;
                accountedRevenue += adjustedRevenue;
            } else {
                missingRevenue += adjustedRevenue;
                hasMissing = true;
            }
        }
        if (hasMissing) salesWithUncertainCost += 1;
    }

    const categoryMap = new Map();
    const expensesInMonth = expenses
        .filter(expense => expense.mes === month)
        .sort((a, b) => String(a.concepto || '').localeCompare(String(b.concepto || ''), 'es'));

    for (const expense of expensesInMonth) {
        const category = EERR_CATEGORIES.includes(expense.categoria)
            ? expense.categoria : 'Otros';
        if (!categoryMap.has(category)) {
            categoryMap.set(category, { name: category, total: 0, entries: [] });
        }
        const group = categoryMap.get(category);
        const amount = Math.max(0, number(expense.monto));
        group.total += amount;
        group.entries.push({ ...expense, monto: amount });
    }

    const categoryGroups = EERR_CATEGORIES
        .filter(name => categoryMap.has(name))
        .map(name => categoryMap.get(name));
    const expenseTotal = categoryGroups.reduce((sum, group) => sum + group.total, 0);
    const fixedExpenses = expensesInMonth
        .filter(expense => expense.tipo !== 'variable')
        .reduce((sum, expense) => sum + Math.max(0, number(expense.monto)), 0);
    const variableExpenses = expenseTotal - fixedExpenses;
    const totalCost = documentedCost + estimatedCost;
    const grossResult = revenue - totalCost;
    const operatingResult = grossResult - expenseTotal;
    const hasUnknownCost = missingRevenue > 0.01;
    const hasEstimatedCost = estimatedRevenue > 0.01;
    const dataQuality = hasUnknownCost ? 'incompleto' :
        hasEstimatedCost ? 'estimado' : 'documentado';

    return {
        month,
        revenue,
        salesCount: salesInMonth.length,
        documentedRevenue,
        documentedCost,
        estimatedCost,
        estimatedRevenue,
        accountedRevenue,
        missingRevenue,
        salesWithUncertainCost,
        grossResult: hasUnknownCost ? null : grossResult,
        operatingResult: hasUnknownCost ? null : operatingResult,
        provisionalGrossResult: grossResult,
        provisionalOperatingResult: operatingResult,
        totalCost,
        expenseTotal,
        fixedExpenses,
        variableExpenses,
        categoryGroups,
        coverage: revenue > 0 ? documentedRevenue / revenue * 100 : null,
        dataQuality,
        hasUnknownCost,
        hasEstimatedCost,
        expensesCount: expensesInMonth.length
    };
};
