import { AppError } from "../utils/app-error.js";
import {
  errorCodeForStatus,
  isApiRequest,
  isBrowserDocumentRequest,
  safeMessageForStatus,
  sendApiError,
  sendBrowserError,
} from "../core/http-error-contract.js";
import { operationalLogger } from "../core/operational-logger.js";
import { getRequestContext } from "../core/request-context.js";

function createErrorHandler(options = {}) {
  const logger = options.logger || operationalLogger;

  return function handleError(error, request, response, next) {
    if (response.headersSent) {
      next(error);
      return;
    }

    const expected = error instanceof AppError;
    const statusCode = expected ? normalizeStatusCode(error.statusCode) : 500;
    const expose = expected && error.expose === true;
    const code = expose && error.code
      ? error.code
      : errorCodeForStatus(statusCode);
    const message = expose
      ? error.message
      : safeMessageForStatus(statusCode);

    if (statusCode >= 500) {
      logDiagnostic(logger, error, request, statusCode);
    }

    if (isApiRequest(request)) {
      sendApiError(request, response, {
        code,
        fields: expose ? error.fields : [],
        message,
        statusCode,
      });
      return;
    }

    if (isBrowserDocumentRequest(request)) {
      sendBrowserError(request, response, {
        code,
        message,
        statusCode,
      });
      return;
    }

    response.status(statusCode).type("text").send(message);
  };
}

const errorHandler = createErrorHandler();

function logDiagnostic(logger, error, request, statusCode) {
  const requestContext = getRequestContext(request);
  const session = request.session || request.apiSession || null;
  logger.error("http.request.failed", {
    actorState: session?.user_id ? "authenticated" : "anonymous",
    component: "http",
    errorStack: safeErrorStack(error),
    errorType: safeErrorType(error),
    method: request.method,
    requestId: requestContext.requestId,
    routeClass: routeClass(request),
    statusCode,
    workspaceState: session?.workspace_id ? "scoped" : "unscoped",
  });
}

function safeErrorStack(error) {
  const lines = String(error?.stack || "").split(/\r?\n/).slice(1, 9);
  const frames = lines
    .map((line) => {
      const match = /^\s*at\s+(?:async\s+)?([^(]+?)(?:\s+\(|$)/.exec(line);
      const candidate = String(match?.[1] || "anonymous").trim();
      const frameName = /(?:[\\/]|^file:|:\d+(?::\d+)?$)/i.test(candidate)
        ? "anonymous"
        : candidate;
      return frameName
        .trim()
        .replace(/[^a-zA-Z0-9._$<>-]+/g, "_")
        .slice(0, 120);
    })
    .filter(Boolean);
  return frames.length > 0 ? frames : ["unavailable"];
}

function safeErrorType(error) {
  const errorType = String(error?.name || "Error").trim();
  return /^[a-zA-Z][a-zA-Z0-9._-]{0,79}$/.test(errorType) ? errorType : "Error";
}

function routeClass(request) {
  const path = String(request.originalUrl || request.path || "");
  if (path === "/healthz" || path === "/readyz") return "operational";
  if (path.startsWith("/api/v1/")) return "api-v1";
  if (path === "/api" || path.startsWith("/api/")) return "api-internal";
  return isBrowserDocumentRequest(request) ? "browser-document" : "public-resource";
}

function normalizeStatusCode(value) {
  const statusCode = Number.parseInt(value, 10);
  return statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
}

export { createErrorHandler, errorHandler };
