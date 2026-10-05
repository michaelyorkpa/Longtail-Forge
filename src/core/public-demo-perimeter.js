import { createHash } from "node:crypto";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { config } from "../config.js";
import { securityEventsService } from "../security/security-events.js";
import { isApiRequest, sendApiError } from "./http-error-contract.js";
import { operationalLogger } from "./operational-logger.js";
import { getRequestContext } from "./request-context.js";
import { AppError } from "../utils/app-error.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const OPERATIONAL_PATHS = new Set(["/healthz", "/readyz", "/api/app-info"]);
const GENERIC_LIMIT_MESSAGE = "Too many requests. Try again later.";

/** @typedef {import("express").Request & { rateLimit?: { limit?: number, resetTime?: Date } }} PerimeterRequest */
/** @typedef {import("express").Response} PerimeterResponse */
/** @typedef {(error?: unknown) => void} PerimeterNext */
/** @typedef {{ windowSeconds: number, maxBodyBytes: number, globalRequestLimit: number, clientRequestLimit: number, mutationLimit: number, searchLimit: number }} PublicDemoPerimeterSettings */
/** @typedef {(event: Record<string, unknown>) => unknown | Promise<unknown>} SecurityEventRecorder */
/** @typedef {{ demoEnabled?: boolean, settings?: Partial<PublicDemoPerimeterSettings>, logger?: Pick<typeof operationalLogger, "warn">, recordSecurityEvent?: SecurityEventRecorder }} PublicDemoPerimeterOptions */
/** @typedef {{ keyGenerator: (request: PerimeterRequest) => string, limit: number, skip: (request: PerimeterRequest) => boolean, legacyHeaders: boolean, passOnStoreError: boolean, standardHeaders: "draft-8", windowMs: number }} PublicDemoLimiterOptions */
/** @typedef {{ logger: Pick<typeof operationalLogger, "warn">, recordSecurityEvent: SecurityEventRecorder, settings: PublicDemoPerimeterSettings }} PublicDemoEvidenceOptions */

/** @param {PublicDemoPerimeterOptions} [options] */
function createPublicDemoPerimeterMiddlewares(options = {}) {
  const demoEnabled = options.demoEnabled ?? config.demo.enabled;
  const settings = /** @type {PublicDemoPerimeterSettings} */ (Object.freeze({
    ...(config.demo.perimeter || {}),
    ...(options.settings || {}),
  }));
  const logger = options.logger || operationalLogger;
  const recordSecurityEvent = options.recordSecurityEvent
    || ((event) => securityEventsService.record(event));
  const common = {
    legacyHeaders: false,
    passOnStoreError: false,
    skip: (/** @type {PerimeterRequest} */ request) => !demoEnabled || isOperationalRequest(request),
    standardHeaders: /** @type {const} */ ("draft-8"),
    windowMs: settings.windowSeconds * 1000,
  };

  return [
    createDeclaredBodyLimit({ demoEnabled, maxBodyBytes: settings.maxBodyBytes }),
    createLimiter("global_request", {
      ...common,
      keyGenerator: () => "public-demo",
      limit: settings.globalRequestLimit,
    }, { logger, recordSecurityEvent, settings }),
    createLimiter("client_request", {
      ...common,
      keyGenerator: clientIpKey,
      limit: settings.clientRequestLimit,
    }, { logger, recordSecurityEvent, settings }),
    createLimiter("mutation", {
      ...common,
      keyGenerator: sessionOrClientKey,
      limit: settings.mutationLimit,
      skip: (/** @type {PerimeterRequest} */ request) => common.skip(request) || SAFE_METHODS.has(normalizeMethod(request.method)),
    }, { logger, recordSecurityEvent, settings }),
    createLimiter("search", {
      ...common,
      keyGenerator: sessionOrClientKey,
      limit: settings.searchLimit,
      skip: (/** @type {PerimeterRequest} */ request) => common.skip(request) || !isSearchRequest(request),
    }, { logger, recordSecurityEvent, settings }),
  ];
}

/** @param {{ demoEnabled: boolean, maxBodyBytes: number }} options */
function createDeclaredBodyLimit({ demoEnabled, maxBodyBytes }) {
  /** @param {PerimeterRequest} request @param {unknown} _response @param {PerimeterNext} next */
  return function publicDemoDeclaredBodyLimit(request, _response, next) {
    if (!demoEnabled || isOperationalRequest(request)) {
      next();
      return;
    }

    const declaredBytes = Number.parseInt(request.get?.("content-length") || "", 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBodyBytes) {
      next(new AppError("The request is too large.", 413));
      return;
    }
    next();
  };
}

/** @param {string} scope @param {PublicDemoLimiterOptions} limiterOptions @param {PublicDemoEvidenceOptions} evidenceOptions */
function createLimiter(scope, limiterOptions, evidenceOptions) {
  /** @type {Map<string, number>} */
  const emittedWindows = new Map();
  const keyGenerator = limiterOptions.keyGenerator;
  return rateLimit(/** @type {Parameters<typeof rateLimit>[0]} */ ({
    ...limiterOptions,
    handler: (request, response) => {
      const context = getRequestContext(request);
      const resetTime = request.rateLimit?.resetTime instanceof Date
        ? request.rateLimit.resetTime.getTime()
        : Date.now() + evidenceOptions.settings.windowSeconds * 1000;
      const evidenceKey = `${scope}:${keyGenerator(request)}:${resetTime}`;
      pruneEvidenceWindows(emittedWindows);
      if (!emittedWindows.has(evidenceKey)) {
        emittedWindows.set(evidenceKey, resetTime);
        evidenceOptions.logger.warn("public_demo.perimeter.blocked", {
          method: normalizeMethod(request.method),
          reasonClass: scope,
          requestId: context.requestId,
          routeClass: classifyRoute(request),
          statusCode: 429,
        });
        void evidenceOptions.recordSecurityEvent({
          eventType: "security.public_demo.perimeter_limited",
          ipAddress: context.ipAddress,
          metadata: {
            limit: request.rateLimit?.limit || limiterOptions.limit,
            operation: normalizeMethod(request.method).toLowerCase(),
            request_id: context.requestId,
            retry_after_seconds: Math.max(1, Math.ceil((resetTime - Date.now()) / 1000)),
            route_class: classifyRoute(request),
            scope,
            window_seconds: evidenceOptions.settings.windowSeconds,
          },
          outcome: "blocked",
          reasonClass: "rate_limited",
          session: request.session,
        });
      }

      response.setHeader("Cache-Control", "no-store");
      if (isApiRequest(request)) {
        sendApiError(request, response, { statusCode: 429 });
        return;
      }
      response.status(429).type("text").send(GENERIC_LIMIT_MESSAGE);
    },
  }));
}

/**
 * @param {PerimeterRequest} request
 */
function clientIpKey(request) {
  return `ip:${ipKeyGenerator(getRequestContext(request).ipAddress)}`;
}

/** @param {PerimeterRequest} request */
function sessionOrClientKey(request) {
  if (requestPath(request) !== "/api/login") {
    const sessionId = readCookie(request.headers?.cookie, config.cookies.sessionName);
    if (sessionId) {
      return `session:${createHash("sha256").update(sessionId).digest("hex")}`;
    }
  }
  return clientIpKey(request);
}

/** @param {unknown} header @param {string} name */
function readCookie(header, name) {
  const prefix = `${name}=`;
  const encoded = String(header || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  if (!encoded || encoded.length > 1024) return "";
  try {
    return decodeURIComponent(encoded);
  } catch {
    return "";
  }
}

/** @param {PerimeterRequest} request */
function isOperationalRequest(request) {
  return OPERATIONAL_PATHS.has(requestPath(request));
}

/** @param {PerimeterRequest} request */
function isSearchRequest(request) {
  const path = requestPath(request);
  return normalizeMethod(request.method) === "GET"
    && (path === "/api/search" || path.startsWith("/api/search/"));
}

/** @param {PerimeterRequest} request */
function requestPath(request) {
  try {
    return new URL(String(request.originalUrl || request.url || "/"), "http://localhost").pathname;
  } catch {
    return String(request.path || "/");
  }
}

/**
 * @param {import("../types/route-contracts.js").RouteRequest} request
 */
function classifyRoute(request) {
  const path = requestPath(request);
  if (path.startsWith("/api/v1/")) return "api-v1";
  if (path === "/api" || path.startsWith("/api/")) return "api-internal";
  return "public-resource";
}

/**
 * @param {string} value
 */
function normalizeMethod(value) {
  return String(value || "").trim().toUpperCase();
}

/** @param {Map<string, number>} windows */
function pruneEvidenceWindows(windows) {
  const now = Date.now();
  for (const [key, expiresAt] of windows) {
    if (expiresAt <= now) windows.delete(key);
  }
}

export {
  GENERIC_LIMIT_MESSAGE,
  createPublicDemoPerimeterMiddlewares,
};
