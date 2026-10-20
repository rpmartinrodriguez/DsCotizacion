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
        precioVigente: pricing.unitPrice,
        porcionesTortaEntera: pricing.wholeCakePortions,
        precioTortaEntera: pricing.wholeCakeCurrentPrice,
        origenPrecioTortaEntera: pricing.wholeCakePriceSource,
        actualizadoAt: updatedAt
    };
};
