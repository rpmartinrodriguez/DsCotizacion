const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");

const PROJECT_ID = "dscotizacion";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const base64UrlDecode = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
};

const parseJwt = (token) => {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Token inválido.");
  const header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8"));
  const payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8"));
  return { parts, header, payload };
};

let certCache = { expiresAt: 0, certs: null };

const getFirebaseCerts = async () => {
  if (certCache.certs && Date.now() < certCache.expiresAt) return certCache.certs;

  const response = await fetch(CERTS_URL, { redirect: "error" });
  if (!response.ok) throw new Error("No se pudo validar la sesión.");

  const cacheControl = response.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 300;
  const certs = await response.json();

  certCache = {
    certs,
    expiresAt: Date.now() + Math.max(60, maxAgeSeconds - 30) * 1000,
  };

  return certs;
};

const verifyFirebaseIdToken = async (token) => {
  const { parts, header, payload } = parseJwt(token);

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Token Firebase no válido.");
  }

  const certs = await getFirebaseCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error("No se pudo validar la firma de la sesión.");

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();

  const isValid = verifier.verify(cert, base64UrlDecode(parts[2]));
  if (!isValid) throw new Error("Firma de sesión inválida.");

  const now = Math.floor(Date.now() / 1000);

  if (payload.aud !== PROJECT_ID) throw new Error("Sesión destinada a otro proyecto.");
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) throw new Error("Emisor de sesión inválido.");
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("Sesión sin usuario.");
  if (!payload.exp || payload.exp <= now) throw new Error("La sesión expiró.");
  if (payload.iat && payload.iat > now + 60) throw new Error("Fecha de sesión inválida.");

  return payload;
};

const firestoreGet = async (path, token) => {
  const response = await fetch(`${FIRESTORE_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore respondió ${response.status}: ${text.slice(0, 180)}`);
  }

  return response.json();
};

const fieldString = (fields, key, fallback = "") =>
  fields?.[key]?.stringValue ?? fallback;

const fieldBool = (fields, key, fallback = false) =>
  fields?.[key]?.booleanValue ?? fallback;

const assertStockPermission = async (uid, token) => {
  const userDoc = await firestoreGet(`usuarios/${encodeURIComponent(uid)}`, token);
  if (!userDoc?.fields) throw new Error("No existe un perfil autorizado.");

  const fields = userDoc.fields;
  const estado = fieldString(fields, "estado", "inactivo");
  const rol = fieldString(fields, "rol", "empleado");
  const permisoStock =
    fields?.permisos?.mapValue?.fields?.stock?.booleanValue === true;

  if (estado !== "activo") throw new Error("El usuario está inactivo.");
  if (rol !== "master" && !permisoStock) {
    throw new Error("El usuario no tiene permiso de Stock.");
  }
};

const isPrivateIpv4 = (ip) => {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n))) return true;
  const [a, b, c] = octets;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && b === 18) return true;
  if (a === 198 && b === 19) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;

  return false;
};

const isPrivateIpv6 = (ip) => {
  const normalized = ip.toLowerCase();

  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("2001:db8")) return true;

  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);

  return false;
};

const assertPublicHttpsUrl = async (rawUrl) => {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("La URL del proveedor no es válida.");
  }

  if (url.protocol !== "https:") {
    throw new Error("La URL del proveedor debe usar HTTPS.");
  }

  if (url.username || url.password) {
    throw new Error("La URL del proveedor no puede contener credenciales.");
  }

  if (url.port && url.port !== "443") {
    throw new Error("La URL del proveedor usa un puerto no permitido.");
  }

  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    throw new Error("El dominio del proveedor no es válido.");
  }

  if (net.isIP(url.hostname)) {
    const privateIp =
      net.isIP(url.hostname) === 4
        ? isPrivateIpv4(url.hostname)
        : isPrivateIpv6(url.hostname);

    if (privateIp) throw new Error("La dirección del proveedor no es pública.");
  } else {
    const resolved = await dns.lookup(url.hostname, { all: true, verbatim: true });
    if (!resolved.length) throw new Error("No se pudo resolver el dominio del proveedor.");

    const unsafe = resolved.some(({ address, family }) =>
      family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address)
    );

    if (unsafe) throw new Error("El dominio del proveedor resuelve a una red no permitida.");
  }

  return url;
};

const fetchSupplierPage = async (initialUrl) => {
  let currentUrl = await assertPublicHttpsUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let response;
    try {
      response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; DulceSallPriceMonitor/1.0; +https://dulce-app.netlify.app)",
          Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-AR,es;q=0.9,en;q=0.6",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("El proveedor devolvió una redirección inválida.");
      currentUrl = await assertPublicHttpsUrl(new URL(location, currentUrl).toString());
      continue;
    }

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        const error = new Error("El proveedor bloqueó o limitó la consulta automática.");
        error.code = "SUPPLIER_BLOCKED";
        throw error;
      }

      throw new Error(`El proveedor respondió HTTP ${response.status}.`);
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/json") &&
      !contentType.includes("application/ld+json")
    ) {
      throw new Error("El proveedor devolvió un formato que no se puede analizar.");
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > 2_500_000) {
      throw new Error("La página del proveedor es demasiado grande para analizar.");
    }

    const text = await response.text();
    if (text.length > 2_500_000) {
      throw new Error("La página del proveedor supera el tamaño permitido.");
    }

    return {
      text,
      finalUrl: currentUrl.toString(),
      contentType,
    };
  }

  throw new Error("Demasiadas redirecciones del proveedor.");
};

const parseLocalizedNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  let clean = value
    .replace(/\s/g, "")
    .replace(/[^\d.,-]/g, "");

  if (!clean || clean === "-" || !/\d/.test(clean)) return null;

  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      clean = clean.replace(/\./g, "").replace(",", ".");
    } else {
      clean = clean.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    const decimals = clean.length - lastComma - 1;
    if (decimals === 1 || decimals === 2) {
      clean = clean.replace(/\./g, "").replace(",", ".");
    } else {
      clean = clean.replace(/,/g, "");
    }
  } else if (lastDot !== -1) {
    const dotCount = (clean.match(/\./g) || []).length;
    const decimals = clean.length - lastDot - 1;
    if (dotCount > 1 || decimals === 3) {
      clean = clean.replace(/\./g, "");
    }
  }

  const number = Number(clean);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const walkJsonLd = (node, candidates) => {
  if (!node) return;

  if (Array.isArray(node)) {
    node.forEach((item) => walkJsonLd(item, candidates));
    return;
  }

  if (typeof node !== "object") return;

  const type = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  const isOffer = type.some((value) =>
    ["Offer", "AggregateOffer", "Product"].includes(String(value || ""))
  );

  if (isOffer) {
    const directValues = [
      node.price,
      node.lowPrice,
      node.highPrice,
      node?.priceSpecification?.price,
    ];

    directValues.forEach((value) => {
      const price = parseLocalizedNumber(value);
      if (price) candidates.push({ price, source: "json-ld" });
    });

    if (node.offers) walkJsonLd(node.offers, candidates);
  }

  Object.values(node).forEach((value) => walkJsonLd(value, candidates));
};

const extractJsonLdCandidates = (html) => {
  const candidates = [];
  const scriptRegex =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = scriptRegex.exec(html))) {
    const raw = match[1].trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      walkJsonLd(parsed, candidates);
    } catch {
      // Algunos sitios generan JSON-LD imperfecto; seguimos con otras fuentes.
    }
  }

  return candidates;
};

const parseTagAttributes = (tag) => {
  const attrs = {};
  const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;

  while ((match = attrRegex.exec(tag))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return attrs;
};

const extractMetaCandidates = (html) => {
  const candidates = [];

  const metaRegex = /<meta\b[^>]*>/gi;
  let match;

  while ((match = metaRegex.exec(html))) {
    const attrs = parseTagAttributes(match[0]);
    const key = String(
      attrs.property || attrs.name || attrs.itemprop || ""
    ).toLowerCase();

    if (
      [
        "product:price:amount",
        "og:price:amount",
        "price",
        "productprice",
        "sale_price",
        "saleprice",
      ].includes(key)
    ) {
      const price = parseLocalizedNumber(attrs.content);
      if (price) candidates.push({ price, source: `meta:${key}` });
    }
  }

  const itemPropRegex = /<[^>]+\bitemprop=["']price["'][^>]*>/gi;
  while ((match = itemPropRegex.exec(html))) {
    const attrs = parseTagAttributes(match[0]);
    const price = parseLocalizedNumber(attrs.content || attrs.value);
    if (price) candidates.push({ price, source: "itemprop:price" });
  }

  return candidates;
};

const extractDataPriceCandidates = (html) => {
  const candidates = [];
  const regex = /\bdata-(?:sale-)?price\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let match;

  while ((match = regex.exec(html))) {
    const price = parseLocalizedNumber(match[1] ?? match[2] ?? match[3]);
    if (price) candidates.push({ price, source: "data-price" });
  }

  return candidates;
};


const decodeHtmlText = (value) => {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&dollar;/gi, "$");
};

const stripTags = (value) =>
  decodeHtmlText(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

const extractWooCommerceCandidates = (html) => {
  const candidates = [];
  let match;

  // WooCommerce clásico:
  // <span class="woocommerce-Price-amount amount"><bdi>...10,500...</bdi></span>
  const bdiRegex =
    /woocommerce-Price-amount[^>]*>[\s\S]{0,260}?<bdi[^>]*>([\s\S]{0,220}?)<\/bdi>/gi;

  while ((match = bdiRegex.exec(html))) {
    const text = stripTags(match[1]);
    const numericMatch = text.match(/[\d][\d.,\s]{1,24}/);
    const price = parseLocalizedNumber(numericMatch ? numericMatch[0] : text);
    if (price) candidates.push({ price, source: "woocommerce:amount" });
    if (candidates.length >= 12) break;
  }

  if (candidates.length) return candidates;

  // Algunas plantillas imprimen el precio dentro de <p class="price"> sin <bdi>.
  const priceBlockRegex =
    /<(?:p|div|span)[^>]*class=["'][^"']*(?:^|\s)price(?:\s|$)[^"']*["'][^>]*>([\s\S]{0,420}?)<\/(?:p|div|span)>/gi;

  while ((match = priceBlockRegex.exec(html))) {
    const text = stripTags(match[1]);
    const numericMatch = text.match(/[\d][\d.,\s]{1,24}/);
    const price = parseLocalizedNumber(numericMatch ? numericMatch[0] : text);
    if (price) candidates.push({ price, source: "woocommerce:price-block" });
    if (candidates.length >= 12) break;
  }

  return candidates;
};

const extractVisiblePriceCandidates = (html) => {
  const candidates = [];
  const regex =
    /<[^>]*(?:class|id)=["'][^"']*(?:price|precio|amount|sale)[^"']*["'][^>]*>[\s\S]{0,160}?(?:ARS\s*|\$\s*)([\d.\s,]{2,24})/gi;

  let match;
  while ((match = regex.exec(html))) {
    const price = parseLocalizedNumber(match[1]);
    if (price) candidates.push({ price, source: "html:price" });
    if (candidates.length >= 12) break;
  }

  return candidates;
};


const normalizePackageUnit = (unit) => {
  const normalized = String(unit || "").toLowerCase().replace(/\./g, "").trim();

  if (["kg", "kilo", "kilos", "kilogramo", "kilogramos"].includes(normalized)) return "kg";
  if (["g", "gr", "grs", "gramo", "gramos"].includes(normalized)) return "gr";
  if (["l", "lt", "lts", "litro", "litros"].includes(normalized)) return "l";
  if (["ml", "cc"].includes(normalized)) return normalized === "cc" ? "cc" : "ml";
  if (["u", "un", "uni", "unidad", "unidades"].includes(normalized)) return "unidad";

  return "";
};

const extractPackageInfo = (title, finalUrl) => {
  const urlText = (() => {
    try {
      return decodeURIComponent(new URL(finalUrl).pathname)
        .replace(/[-_]+/g, " ");
    } catch {
      return "";
    }
  })();

  const text = `${String(title || "")} ${urlText}`
    .replace(/×/g, "x")
    .replace(/\s+/g, " ")
    .trim();

  // Priorizamos expresiones de presentación explícitas como "x 10 kg".
  const patterns = [
    /(?:^|\s)x\s*(\d+(?:[.,]\d+)?)\s*(kg|kilos?|kilogramos?|grs?|gramos?|g|lts?|litros?|l|ml|cc|unidades?|unidad|uni|u)(?=\s|$|\/|\))/i,
    /(?:presentaci[oó]n|contenido|peso\s*neto)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(kg|kilos?|kilogramos?|grs?|gramos?|g|lts?|litros?|l|ml|cc|unidades?|unidad|uni|u)/i,
    /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|kilogramos?|grs?|gramos?|g|lts?|litros?|l|ml|cc|unidades?|unidad|uni|u)(?=\s*$|\s*[)\-\/])/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const quantity = parseLocalizedNumber(match[1]);
    const unit = normalizePackageUnit(match[2]);

    if (quantity && unit) {
      return { quantity, unit, source: "title-or-url" };
    }
  }

  return null;
};

const extractTitle = (html) => {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) return "";
  return titleMatch[1]
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
};

const extractPrice = (html) => {
  const groups = [
    extractJsonLdCandidates(html),
    extractMetaCandidates(html),
    extractWooCommerceCandidates(html),
    extractDataPriceCandidates(html),
    extractVisiblePriceCandidates(html),
  ];

  for (const group of groups) {
    const sane = group.filter(
      (item) => Number.isFinite(item.price) && item.price > 0 && item.price < 1_000_000_000
    );

    if (!sane.length) continue;

    // Preferimos el primer valor de la fuente de mayor calidad.
    // Si el sitio expone múltiples variantes, el adaptador específico del proveedor
    // podrá refinar esta selección más adelante.
    return sane[0];
  }

  return null;
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    if (!token) {
      return json(401, { ok: false, code: "AUTH_REQUIRED", message: "Iniciá sesión nuevamente." });
    }

    const auth = await verifyFirebaseIdToken(token);
    await assertStockPermission(auth.sub, token);

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { ok: false, code: "INVALID_JSON", message: "Solicitud inválida." });
    }

    const materiaPrimaId = String(payload.materiaPrimaId || "").trim();
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(materiaPrimaId)) {
      return json(400, { ok: false, code: "INVALID_ID", message: "Materia prima inválida." });
    }

    const material = await firestoreGet(
      `materiasPrimas/${encodeURIComponent(materiaPrimaId)}`,
      token
    );

    if (!material?.fields) {
      return json(404, { ok: false, code: "NOT_FOUND", message: "La materia prima no existe." });
    }

    const supplierUrl = fieldString(material.fields, "proveedorUrl", "").trim();

    if (!supplierUrl) {
      return json(400, {
        ok: false,
        code: "SUPPLIER_URL_MISSING",
        message: "Primero guardá la URL del producto del proveedor.",
      });
    }

    const page = await fetchSupplierPage(supplierUrl);
    const detected = extractPrice(page.text);

    if (!detected) {
      return json(422, {
        ok: false,
        code: "PRICE_NOT_FOUND",
        message:
          "La página respondió correctamente, pero no pude identificar el precio automáticamente.",
        host: new URL(page.finalUrl).hostname,
        title: extractTitle(page.text),
      });
    }

    const title = extractTitle(page.text);
    const packageInfo = extractPackageInfo(title, page.finalUrl);

    return json(200, {
      ok: true,
      materiaPrimaId,
      price: detected.price,
      source: detected.source,
      finalUrl: page.finalUrl,
      host: new URL(page.finalUrl).hostname,
      title,
      packageQuantity: packageInfo?.quantity || null,
      packageUnit: packageInfo?.unit || null,
      packageSource: packageInfo?.source || null,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("supplier-price error", error);

    const code = error?.code || "SUPPLIER_QUERY_FAILED";
    const statusCode =
      code === "SUPPLIER_BLOCKED" ? 409 :
      /permiso|inactivo|sesión|token/i.test(String(error?.message || "")) ? 403 :
      500;

    return json(statusCode, {
      ok: false,
      code,
      message: error?.message || "No se pudo consultar el precio del proveedor.",
    });
  }
};
