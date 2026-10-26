import { cert, getApps, initializeApp } from "firebase-admin/app";
import {
  GeoPoint,
  Timestamp,
  getFirestore
} from "firebase-admin/firestore";
import { createHash, createPrivateKey, timingSafeEqual } from "node:crypto";

const EXPECTED_TARGET_PROJECT_ID = "dulcesall";
const COLLECTIONS = [
  "usuarios",
  "config",
  "categorias",
  "recetas",
  "materiasPrimas",
  "movimientosStock",
  "cajas",
  "ventasMostrador",
  "auditoriaMostrador",
  "ccClientes",
  "ccMovimientos",
  "clientes",
  "presupuestosGuardados",
  "gastosOperativos",
  "modelos3D"
];
const COLLECTION_SET = new Set(COLLECTIONS);

const allowedOrigins = new Set([
  "https://dulce-app.netlify.app",
  "http://localhost:8888",
  "http://127.0.0.1:8888"
]);

const corsHeaders = request => {
  const origin = request.headers.get("origin") || "";
  const preview = /^https:\/\/[-a-z0-9]+--dulce-app\.netlify\.app$/i.test(origin);
  const allowed = allowedOrigins.has(origin) || preview;
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Migration-Token",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
};

const json = (request, status, body) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });

const secureEqual = (a, b) => {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && timingSafeEqual(left, right);
};

const authorize = request => {
  const configured = process.env.FIREBASE_MIGRATION_TOKEN || "";
  const supplied = request.headers.get("x-migration-token") || "";
  if (!configured) throw new Error("MIGRATION_TOKEN_MISSING");
  if (!secureEqual(configured, supplied)) throw new Error("MIGRATION_UNAUTHORIZED");
};

const getCredentialDiagnostics = () => {
  const projectId = String(process.env.FIREBASE_MIGRATION_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_MIGRATION_CLIENT_EMAIL || "").trim();
  const rawPrivateKey = String(process.env.FIREBASE_MIGRATION_PRIVATE_KEY || "");
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n").trim();

  const result = {
    projectIdPresent: Boolean(projectId),
    projectIdMatches: projectId === EXPECTED_TARGET_PROJECT_ID,
    clientEmailPresent: Boolean(clientEmail),
    clientEmailLooksValid: /^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(clientEmail),
    clientEmailMatchesProject: clientEmail.endsWith("@" + EXPECTED_TARGET_PROJECT_ID + ".iam.gserviceaccount.com"),
    privateKeyPresent: Boolean(privateKey),
    privateKeyHasHeader: privateKey.startsWith("-----BEGIN PRIVATE KEY-----"),
    privateKeyHasFooter: privateKey.endsWith("-----END PRIVATE KEY-----"),
    privateKeyLength: privateKey.length,
    privateKeyParseable: false
  };

  if (privateKey) {
    try {
      createPrivateKey({ key: privateKey, format: "pem" });
      result.privateKeyParseable = true;
    } catch {}
  }

  return { projectId, clientEmail, privateKey, result };
};

const getTargetApp = () => {
  const { projectId, clientEmail, privateKey, result: diagnostics } = getCredentialDiagnostics();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("DESTINATION_CONFIG_MISSING");
  }
  if (projectId !== EXPECTED_TARGET_PROJECT_ID) {
    throw new Error("WRONG_TARGET_PROJECT");
  }
  if (!diagnostics.clientEmailLooksValid || !diagnostics.privateKeyHasHeader
      || !diagnostics.privateKeyHasFooter || !diagnostics.privateKeyParseable) {
    const error = new Error("DESTINATION_CREDENTIAL_FORMAT_INVALID");
    error.diagnostics = diagnostics;
    throw error;
  }

  const name = "dulcesall-migration-target";
  const existing = getApps().find(app => app.name === name);
  if (existing) return existing;

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId
  }, name);
};

const encodeValue = value => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return { __dsType: "number", value: "NaN" };
    if (value === Infinity) return { __dsType: "number", value: "Infinity" };
    if (value === -Infinity) return { __dsType: "number", value: "-Infinity" };
    return value;
  }
  if (value instanceof Timestamp) {
    return {
      __dsType: "timestamp",
      seconds: value.seconds,
      nanoseconds: value.nanoseconds
    };
  }
  if (value instanceof GeoPoint) {
    return {
      __dsType: "geopoint",
      latitude: value.latitude,
      longitude: value.longitude
    };
  }
  if (value && typeof value.path === "string" && value.firestore) {
    return { __dsType: "reference", path: value.path };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { __dsType: "bytes", base64: Buffer.from(value).toString("base64") };
  }
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === "object") {
    const result = {};
    for (const [key, child] of Object.entries(value)) result[key] = encodeValue(child);
    return result;
  }
  throw new Error("UNSUPPORTED_FIRESTORE_VALUE");
};

const decodeValue = (value, db) => {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(item => decodeValue(item, db));

  if (value.__dsType === "timestamp") {
    return new Timestamp(Number(value.seconds), Number(value.nanoseconds || 0));
  }
  if (value.__dsType === "geopoint") {
    return new GeoPoint(Number(value.latitude), Number(value.longitude));
  }
  if (value.__dsType === "reference") {
    return db.doc(String(value.path));
  }
  if (value.__dsType === "bytes") {
    return Buffer.from(String(value.base64 || ""), "base64");
  }
  if (value.__dsType === "number") {
    if (value.value === "NaN") return NaN;
    if (value.value === "Infinity") return Infinity;
    if (value.value === "-Infinity") return -Infinity;
  }

  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = decodeValue(child, db);
  return result;
};

const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const result = {};
    Object.keys(value).sort().forEach(key => { result[key] = stableValue(value[key]); });
    return result;
  }
  return value;
};

const stableStringify = value => JSON.stringify(stableValue(value));
const hashDocuments = docs => createHash("sha256")
  .update(stableStringify([...docs].sort((a, b) => a.id.localeCompare(b.id))))
  .digest("hex");

const countCollection = async ref => {
  try {
    const result = await ref.count().get();
    return Number(result.data().count || 0);
  } catch {
    const snap = await ref.select().get();
    return snap.size;
  }
};

const status = async db => {
  const counts = {};
  for (const name of COLLECTIONS) {
    counts[name] = await countCollection(db.collection(name));
  }
  return {
    targetProjectId: EXPECTED_TARGET_PROJECT_ID,
    counts
  };
};

const writeDocuments = async (db, collectionName, documents) => {
  if (!COLLECTION_SET.has(collectionName)) throw new Error("COLLECTION_NOT_ALLOWED");
  if (!Array.isArray(documents) || !documents.length || documents.length > 75) {
    throw new Error("INVALID_DOCUMENT_BATCH");
  }

  const refs = documents.map(item => db.collection(collectionName).doc(String(item.id)));
  const existing = await db.getAll(...refs);
  const conflicts = [];
  const identical = [];
  const missing = [];

  existing.forEach((snapshot, index) => {
    const incoming = documents[index];
    if (!snapshot.exists) {
      missing.push(index);
      return;
    }
    const currentEncoded = encodeValue(snapshot.data());
    if (stableStringify(currentEncoded) === stableStringify(incoming.data)) {
      identical.push(String(incoming.id));
    } else {
      conflicts.push(String(incoming.id));
    }
  });

  if (conflicts.length) {
    return { ok: false, conflicts, identical, written: 0 };
  }

  if (missing.length) {
    const batch = db.batch();
    missing.forEach(index => {
      const incoming = documents[index];
      batch.create(refs[index], decodeValue(incoming.data, db));
    });
    await batch.commit();
  }

  return {
    ok: true,
    conflicts: [],
    identical,
    written: missing.length
  };
};

const verifyCollection = async (db, collectionName) => {
  if (!COLLECTION_SET.has(collectionName)) throw new Error("COLLECTION_NOT_ALLOWED");
  const snap = await db.collection(collectionName).get();
  const documents = snap.docs.map(docSnap => ({
    id: docSnap.id,
    data: encodeValue(docSnap.data())
  }));
  return {
    count: documents.length,
    hash: hashDocuments(documents)
  };
};

const normalizeAuthUserInput = body => {
  const uid = String(body?.uid || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!uid || uid.length > 128) throw new Error("AUTH_UID_INVALID");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("AUTH_EMAIL_INVALID");
  return { uid, email, password };
};

const authUserStatus = async (adminAuth, body) => {
  const { uid, email } = normalizeAuthUserInput({ ...body, password: "123456" });
  try {
    const user = await adminAuth.getUser(uid);
    return {
      exists: true,
      uidMatches: user.uid === uid,
      emailMatches: String(user.email || "").toLowerCase() === email,
      uid: user.uid,
      email: user.email || ""
    };
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }

  try {
    const byEmail = await adminAuth.getUserByEmail(email);
    return {
      exists: true,
      uidMatches: byEmail.uid === uid,
      emailMatches: true,
      uid: byEmail.uid,
      email: byEmail.email || "",
      conflict: byEmail.uid !== uid
    };
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }

  return { exists: false, uidMatches: false, emailMatches: false, uid, email };
};

const createAuthUser = async (adminAuth, db, body) => {
  const { uid, email, password } = normalizeAuthUserInput(body);
  if (password.length < 6 || password.length > 128) throw new Error("AUTH_PASSWORD_INVALID");

  const profileSnap = await db.collection("usuarios").doc(uid).get();
  const profileEmail = String(profileSnap.exists ? profileSnap.data()?.email || "" : "").trim().toLowerCase();
  if (!profileSnap.exists || !profileEmail || profileEmail !== email) {
    throw new Error("AUTH_PROFILE_MISMATCH");
  }

  const status = await authUserStatus(adminAuth, { uid, email });
  if (status.exists) {
    if (status.uidMatches && status.emailMatches) {
      return { ok: true, created: false, alreadyExists: true, uid, email };
    }
    const error = new Error("AUTH_USER_CONFLICT");
    error.authStatus = status;
    throw error;
  }

  const user = await adminAuth.createUser({
    uid,
    email,
    password,
    emailVerified: false,
    disabled: false
  });

  return {
    ok: true,
    created: true,
    alreadyExists: false,
    uid: user.uid,
    email: user.email || email
  };
};

export default async request => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json(request, 405, { error: "METHOD_NOT_ALLOWED" });
  }

  try {
    authorize(request);
    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "diagnose") {
      const { result } = getCredentialDiagnostics();
      return json(request, 200, { ok: true, diagnostics: result });
    }

    const app = getTargetApp();
    const db = getFirestore(app);

    if (action === "status") {
      return json(request, 200, { ok: true, ...(await status(db)) });
    }

    if (action === "write") {
      const result = await writeDocuments(
        db,
        String(body.collection || ""),
        body.documents
      );
      return json(request, result.ok ? 200 : 409, result);
    }

    if (action === "verify") {
      const result = await verifyCollection(db, String(body.collection || ""));
      return json(request, 200, { ok: true, ...result });
    }

    if (action === "auth-status") {
      const { getAuth: getAdminAuth } = await import("firebase-admin/auth");
      const result = await authUserStatus(getAdminAuth(app), body);
      return json(request, 200, { ok: true, ...result });
    }

    if (action === "auth-create") {
      const { getAuth: getAdminAuth } = await import("firebase-admin/auth");
      const result = await createAuthUser(getAdminAuth(app), db, body);
      return json(request, 200, result);
    }

    return json(request, 400, { error: "UNKNOWN_ACTION" });
  } catch (error) {
    const rawCode = String(error?.code || "");
    const rawMessage = String(error?.message || "");
    const code = rawMessage || rawCode || "MIGRATION_FAILED";
    const known = {
      MIGRATION_TOKEN_MISSING: [503, "Falta configurar FIREBASE_MIGRATION_TOKEN en Netlify."],
      MIGRATION_UNAUTHORIZED: [401, "Token de migración incorrecto."],
      DESTINATION_CONFIG_MISSING: [503, "Faltan credenciales del Firebase nuevo en Netlify."],
      WRONG_TARGET_PROJECT: [409, "Las credenciales configuradas no pertenecen al proyecto dulcesall."],
      DESTINATION_CREDENTIAL_FORMAT_INVALID: [503, "La clave o el email del Firebase nuevo tienen un formato inválido en Netlify."],
      COLLECTION_NOT_ALLOWED: [400, "Colección no permitida por el migrador."],
      INVALID_DOCUMENT_BATCH: [400, "Lote de documentos inválido."],
      AUTH_UID_INVALID: [400, "El UID del usuario no es válido."],
      AUTH_EMAIL_INVALID: [400, "El email del usuario no es válido."],
      AUTH_PASSWORD_INVALID: [400, "La contraseña debe tener entre 6 y 128 caracteres."],
      AUTH_USER_CONFLICT: [409, "Ya existe un usuario en Authentication con ese email o UID, pero no coincide con el perfil migrado."],
      AUTH_PROFILE_MISMATCH: [409, "El UID y email no coinciden con un perfil migrado en usuarios/{UID}."]
    };

    let statusCode = known[code]?.[0] || 500;
    let message = known[code]?.[1] || "No se pudo completar la operación de migración.";
    let diagnostic = rawCode || null;

    const lowered = (rawCode + " " + rawMessage).toLowerCase();
    if (lowered.includes("private key") || lowered.includes("invalid credential") || lowered.includes("invalid_grant") || lowered.includes("credential")) {
      statusCode = 503;
      message = "La cuenta de servicio del Firebase nuevo no pudo autenticarse. Revisá FIREBASE_MIGRATION_CLIENT_EMAIL y FIREBASE_MIGRATION_PRIVATE_KEY.";
      diagnostic = "DESTINATION_CREDENTIAL_INVALID";
    } else if (lowered.includes("not found") || rawCode === "5") {
      statusCode = 503;
      message = "El proyecto dulcesall responde, pero Firestore no está disponible. Verificá que hayas creado Firestore Database en el proyecto nuevo.";
      diagnostic = "DESTINATION_FIRESTORE_NOT_READY";
    } else if (lowered.includes("permission") || lowered.includes("denied") || rawCode === "7") {
      statusCode = 503;
      message = "La cuenta de servicio pudo autenticarse, pero no tiene permiso para acceder a Firestore del proyecto dulcesall.";
      diagnostic = "DESTINATION_PERMISSION_DENIED";
    }

    console.error("firestore migration function failed", {
      code: rawCode,
      message: rawMessage,
      stack: error?.stack
    });
    return json(request, statusCode, {
      error: diagnostic || code,
      message,
      ...(error?.diagnostics ? { diagnostics: error.diagnostics } : {}),
      ...(error?.authStatus ? { authStatus: error.authStatus } : {})
    });
  }
};

export const config = {
  path: "/api/migracion-firestore"
};
