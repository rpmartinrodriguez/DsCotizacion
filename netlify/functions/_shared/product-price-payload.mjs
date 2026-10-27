import { buildCommercialPricing } from "../../../shared/pricing-core.mjs";

export const buildPublicProductPricePayload = ({
    product,
    ingredientMap,
    globalMargin = 0,
    updatedAt = null
} = {}) => {
    const pricing = buildCommercialPricing({ product, ingredientMap, globalMargin });

    return {
        codigo: product.id,
        identificador: product.id,
        nombre: String(product.nombreTorta || ""),
        presentacion: product.presentacionVenta || null,
        unidadesPorVenta: pricing.unitsPerSale,
        precioSugerido: pricing.suggestedUnitPrice,
        precioVigente: pricing.unitPrice,
        origenPrecioVigente: pricing.unitPriceSource,
        porcionesTortaEntera: pricing.wholeCakePortions,
        precioTortaEntera: pricing.wholeCakeCurrentPrice,
        origenPrecioTortaEntera: pricing.wholeCakePriceSource,
        actualizadoAt: updatedAt
    };
};
