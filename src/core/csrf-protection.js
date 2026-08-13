import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { getRequestContext } from "./request-context.js";
import { AppError } from "../utils/app-error.js";

const CSRF_HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const MULTIPART_PATHS = new Set(["/api/files/upload", "/api/files/upload/batch"]);
const TOKEN_SECRET = randomBytes(32);

/** @typedef {import("./request-context.js").RequestContextRequest & { method?: string, path?: string, cookies?: Record<string, unknown>, get(name: string): string | undefined }} CsrfRequest */

function createCsrfProtectionMiddleware() {
  return (/** @type {CsrfRequest} */ request, /** @type {unknown} */ _response, /** @type {(error?: unknown) => void} */ next) => {
    try {
      enforceCsrfProtection(request);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function createCsrfToken() {
  const nonce = randomBytes(24).toString("base64url");
  return `${nonce}.${signNonce(nonce)}`;
}

/**
 * @param {CsrfRequest} request
 */
function enforceCsrfProtection(request) {
  const method = String(request.method || "GET").toUpperCase();
  const requestPath = request.path || "";
  if (SAFE_METHODS.has(method) || !requestPath.startsWith("/api/") || requestPath.startsWith("/api/v1/")) {
    return;
  }

  enforceContentType(request, requestPath);

  const allowedOrigins = resolveAllowedOrigins(request);
  const origin = normalizeOriginHeader(request.get("origin"));
  if (origin.present) {
    if (!origin.value || !allowedOrigins.has(origin.value)) {
      throw new AppError("Cross-site request blocked.", 403);
    }
    return;
  }

  const referer = normalizeRefererOrigin(request.get("referer"));
  if (referer.present) {
    if (!referer.value || !allowedOrigins.has(referer.value)) {
      throw new AppError("Cross-site request blocked.", 403);
    }
    return;
  }

  if (normalizeText(request.get("sec-fetch-site")).toLowerCase() === "cross-site") {
    throw new AppError("Cross-site request blocked.", 403);
  }

  const headerToken = normalizeText(request.get(CSRF_HEADER_NAME));
  const cookieToken = normalizeText(request.cookies?.[config.cookies.csrfName]);
  const tokenWasSupplied = Boolean(headerToken || cookieToken);
  if (tokenWasSupplied && !tokensMatchAndVerify(headerToken, cookieToken)) {
    throw new AppError("Invalid CSRF token.", 403);
  }

  if (isBrowserRequest(request) && !tokensMatchAndVerify(headerToken, cookieToken)) {
    throw new AppError("CSRF token is required.", 403);
  }
}

/**
 * @param {CsrfRequest} request
 * @param {string} requestPath
 */
function enforceContentType(request, requestPath) {
  const contentType = normalizeText(request.get("content-type")).toLowerCase().split(";", 1)[0];
  const hasBody = requestHasBody(request);
  if (!contentType && !hasBody) {
    return;
  }

  if (contentType === "application/json") {
    return;
  }

  if (contentType === "multipart/form-data" && MULTIPART_PATHS.has(requestPath)) {
    return;
  }

  throw new AppError("Unsupported content type for this request.", 415);
}

/**
 * @param {CsrfRequest} request
 */
function requestHasBody(request) {
  const contentLength = Number.parseInt(request.get("content-length") || "0", 10);
  return contentLength > 0 || Boolean(request.get("transfer-encoding"));
}

/**
 * @param {import("./request-context.js").RequestContextRequest} request
 */
function resolveAllowedOrigins(request) {
  const origins = new Set();
  const requestOrigin = getRequestContext(request).origin;
  if (requestOrigin) {
    origins.add(requestOrigin);
  }
  if (config.publicUrl) {
    origins.add(new URL(config.publicUrl).origin);
  }
  return origins;
}

/**
 * @param {unknown} value
 */
function normalizeOriginHeader(value) {
  const text = normalizeText(value);
  if (!text) {
    return { present: false, value: "" };
  }
  try {
    const parsed = new URL(text);
    return { present: true, value: text === parsed.origin ? parsed.origin : "" };
  } catch {
    return { present: true, value: "" };
  }
}

/**
 * @param {unknown} value
 */
function normalizeRefererOrigin(value) {
  const text = normalizeText(value);
  if (!text) {
    return { present: false, value: "" };
  }
  try {
    return { present: true, value: new URL(text).origin };
  } catch {
    return { present: true, value: "" };
  }
}

/**
 * @param {CsrfRequest} request
 */
function isBrowserRequest(request) {
  const fetchSite = normalizeText(request.get("sec-fetch-site")).toLowerCase();
  if (fetchSite) {
    return true;
  }
  return /\b(?:mozilla|chrome|safari|firefox|edg)\b/i.test(normalizeText(request.get("user-agent")));
}

/**
 * @param {string} headerToken
 * @param {string} cookieToken
 */
function tokensMatchAndVerify(headerToken, cookieToken) {
  return Boolean(headerToken)
    && headerToken === cookieToken
    && verifyCsrfToken(headerToken);
}

/**
 * @param {unknown} token
 */
function verifyCsrfToken(token) {
  const [nonce, signature, ...extra] = normalizeText(token).split(".");
  if (!nonce || !signature || extra.length || nonce.length > 64 || signature.length > 128) {
    return false;
  }

  const expected = Buffer.from(signNonce(nonce));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * @param {string | NodeJS.ArrayBufferView} nonce
 */
function signNonce(nonce) {
  return createHmac("sha256", TOKEN_SECRET).update(nonce).digest("base64url");
}

/**
 * @param {unknown} value
 */
function normalizeText(value) {
  return String(value || "").trim();
}

export {
  CSRF_HEADER_NAME,
  createCsrfProtectionMiddleware,
  createCsrfToken,
  enforceCsrfProtection,
  verifyCsrfToken,
};
