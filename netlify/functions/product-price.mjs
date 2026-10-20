import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { buildCommercialPricing } from "../../shared/pricing-core.mjs";

const allowedOrigins = new Set([
    "https://dulcesall.com",
    "https://www.dulcesall.com",
    "https://dulce-app.netlify.app"
]);

const corsHeaders = request => {
    const origin = request.headers.get("origin") || "";
    const netlifyPreview = /^https:\/\/[-a-z0-9]+--dulce-app\.netlify\.app$/i.test(origin);
    const allowed = allowedOrigins.has(origin) || netlifyPreview;
    return {
        "Access-Control-Allow-Origin": allowed ? origin : "https://dulcesall.com",
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    };
};

const json = (request, status, body) =>
    new Response(JSON.stringify(body), {
        status,
        headers: corsHeaders(request)
    });

const getAdminApp = () => {
    if (getApps().length) return getApps()[0];

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
        throw new Error("SERVER_CONFIG_MISSING");
    }

    return initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId
    });
};

const latestUpdateIso = snapshots => {
    let latest = null;
    snapshots.forEach(snapshot => {
        const date = snapshot?.updateTime?.toDate?.();
        if (date && (!latest || date > latest)) latest = date;
    });
    return latest ? latest.toISOString() : null;
};

export default async (request) => {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== "GET") {
        return json(request, 405, { error: "METHOD_NOT_ALLOWED" });
    }

    const url = new URL(request.url);
    const code = String(url.searchParams.get("code") || "").trim();

    if (!/^[A-Za-z0-9_-]{6,160}$/.test(code)) {
        return json(request, 400, { error: "INVALID_PRODUCT_CODE" });
    }

    try {
        const app = getAdminApp();
        const db = getFirestore(app);

        const productRef = db.collection("recetas").doc(code);
        const configRef = db.collection("config").doc("mostrador");
        const [productSnap, configSnap] = await Promise.all([
            productRef.get(),
            configRef.get()
        ]);

        if (!productSnap.exists || productSnap.data()?.precioWebHabilitado !== true) {
            return json(request, 404, { error: "PRODUCT_NOT_AVAILABLE" });
        }

        const product = { id: productSnap.id, ...productSnap.data() };
        const ingredientIds = [...new Set(
            (Array.isArray(product.ingredientes) ? product.ingredientes : [])
                .map(item => item?.idMateriaPrima)
                .filter(Boolean)
        )];

        const ingredientRefs = ingredientIds.map(id =>
            db.collection("materiasPrimas").doc(String(id))
        );
        const ingredientSnaps = ingredientRefs.length
            ? await db.getAll(...ingredientRefs)
            : [];

        const ingredientMap = new Map();
        ingredientSnaps.forEach(snapshot => {
            if (snapshot.exists) ingredientMap.set(snapshot.id, snapshot.data());
        });

        const globalMargin = Number(configSnap.data()?.margenGlobal) || 0;
        const pricing = buildCommercialPricing({
            product,
            ingredientMap,
            globalMargin
        });

        const updatedAt = latestUpdateIso([
            productSnap,
            configSnap,
            ...ingredientSnaps
        ]);

        return json(request, 200, {
            codigo: product.id,
            identificador: product.id,
            nombre: String(product.nombreTorta || ""),
            presentacion: product.presentacionVenta || null,
            precioVigente: pricing.unitPrice,
            porcionesTortaEntera: pricing.wholeCakePortions,
            precioTortaEntera: pricing.wholeCakeCurrentPrice,
            origenPrecioTortaEntera: pricing.wholeCakePriceSource,
            actualizadoAt: updatedAt
        });
    } catch (error) {
        if (error?.message === "SERVER_CONFIG_MISSING") {
            return json(request, 503, {
                error: "SERVER_NOT_CONFIGURED",
                message: "La consulta de prueba necesita credenciales de Firebase configuradas en Netlify."
            });
        }
        console.error("product-price function failed", error);
        return json(request, 500, { error: "PRICE_LOOKUP_FAILED" });
    }
};

export const config = {
    path: "/api/precio-producto"
};
