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

function createPublicDemoPerimeterMiddlewares(options = {}) {
  const demoEnabled = options.demoEnabled ?? config.demo.enabled;
  const settings = Object.freeze({
    ...(config.demo.perimeter || {}),
    ...(options.settings || {}),
  });
  const logger = options.logger || operationalLogger;
  const recordSecurityEvent = options.recordSecurityEvent
    || ((event) => securityEventsService.record(event));
  const common = {
    legacyHeaders: false,
    passOnStoreError: false,
    skip: (request) => !demoEnabled || isOperationalRequest(request),
    standardHeaders: "draft-8",
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
      skip: (request) => common.skip(request) || SAFE_METHODS.has(normalizeMethod(request.method)),
    }, { logger, recordSecurityEvent, settings }),
    createLimiter("search", {
      ...common,
      keyGenerator: sessionOrClientKey,
      limit: settings.searchLimit,
      skip: (request) => common.skip(request) || !isSearchRequest(request),
    }, { logger, recordSecurityEvent, settings }),
  ];
}

function createDeclaredBodyLimit({ demoEnabled, maxBodyBytes }) {
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

function createLimiter(scope, limiterOptions, evidenceOptions) {
  const emittedWindows = new Map();
  const keyGenerator = limiterOptions.keyGenerator;
  return rateLimit({
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
  });
}

function clientIpKey(request) {
  return `ip:${ipKeyGenerator(getRequestContext(request).ipAddress)}`;
}

function sessionOrClientKey(request) {
  if (requestPath(request) !== "/api/login") {
    const sessionId = readCookie(request.headers?.cookie, config.cookies.sessionName);
    if (sessionId) {
      return `session:${createHash("sha256").update(sessionId).digest("hex")}`;
    }
  }
  return clientIpKey(request);
}

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

function isOperationalRequest(request) {
  return OPERATIONAL_PATHS.has(requestPath(request));
}

function isSearchRequest(request) {
  const path = requestPath(request);
  return normalizeMethod(request.method) === "GET"
    && (path === "/api/search" || path.startsWith("/api/search/"));
}

function requestPath(request) {
  try {
    return new URL(String(request.originalUrl || request.url || "/"), "http://localhost").pathname;
  } catch {
    return String(request.path || "/");
  }
}

function classifyRoute(request) {
  const path = requestPath(request);
  if (path.startsWith("/api/v1/")) return "api-v1";
  if (path === "/api" || path.startsWith("/api/")) return "api-internal";
  return "public-resource";
}

function normalizeMethod(value) {
  return String(value || "").trim().toUpperCase();
}

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