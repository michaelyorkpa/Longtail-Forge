import { AppError } from "./app-error.js";

/** @typedef {import("../types/http-contracts.js").JsonBodyRequest} JsonBodyRequest */
/** @typedef {import("../types/http-contracts.js").ReadJsonBodyOptions} ReadJsonBodyOptions */
/** @typedef {import("../types/route-contracts.js").ApiKeyAsyncRouteHandler} ApiKeyAsyncRouteHandler */
/** @typedef {import("../types/route-contracts.js").AsyncRouteHandler} AsyncRouteHandler */
/** @typedef {import("../types/route-contracts.js").AuthenticatedAsyncRouteHandler} AuthenticatedAsyncRouteHandler */
/** @typedef {import("../types/route-contracts.js").WorkspaceAsyncRouteHandler} WorkspaceAsyncRouteHandler */

/**
 * @param {AsyncRouteHandler} handler
 * @returns {AsyncRouteHandler}
 */
function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

/**
 * @param {AuthenticatedAsyncRouteHandler} handler
 * @returns {AsyncRouteHandler}
 */
function authenticatedAsyncRoute(handler) {
  return (request, response, next) => {
    if (!isAuthenticatedRouteRequest(request)) {
      next(new AppError("Login required.", 401));
      return;
    }
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

/**
 * @param {WorkspaceAsyncRouteHandler} handler
 * @returns {AsyncRouteHandler}
 */
function workspaceAsyncRoute(handler) {
  return (request, response, next) => {
    if (!isWorkspaceRouteRequest(request)) {
      next(new AppError("An active workspace is required.", 400));
      return;
    }
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

/**
 * @param {ApiKeyAsyncRouteHandler} handler
 * @returns {AsyncRouteHandler}
 */
function apiKeyAsyncRoute(handler) {
  return (request, response, next) => {
    if (!isApiKeyRouteRequest(request)) {
      next(new AppError("API key required.", 401));
      return;
    }
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

/**
 * @param {import("../types/route-contracts.js").RouteRequest} request
 * @returns {request is import("../types/route-contracts.js").AuthenticatedRouteRequest}
 */
function isAuthenticatedRouteRequest(request) {
  return Boolean(request.session);
}

/**
 * @param {import("../types/route-contracts.js").RouteRequest} request
 * @returns {request is import("../types/route-contracts.js").WorkspaceRouteRequest}
 */
function isWorkspaceRouteRequest(request) {
  return Boolean(request.session?.workspace_id);
}

/**
 * @param {import("../types/route-contracts.js").RouteRequest} request
 * @returns {request is import("../types/route-contracts.js").ApiKeyRouteRequest}
 */
function isApiKeyRouteRequest(request) {
  return Boolean(request.apiKey && request.apiSession);
}

/**
 * @param {JsonBodyRequest} request
 * @param {ReadJsonBodyOptions} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
async function readJsonObjectBody(request, options = {}) {
  const payload = await readJsonBody(request, options);
  if (!isJsonObject(payload)) {
    throw new AppError("Request body must contain a JSON object.", 400);
  }
  return payload;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isJsonObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * @param {JsonBodyRequest} request
 * @param {ReadJsonBodyOptions} [options]
 * @returns {Promise<unknown>}
 */
function readJsonBody(request, options = {}) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bodyBytes = 0;
    const maxBytes = options.maxBytes || 100000;

    request.on("data", (chunk) => {
      body += chunk;
      bodyBytes += Buffer.byteLength(chunk);

      if (bodyBytes > maxBytes) {
        request.destroy();
        reject(new AppError("Request body is too large.", 413));
      }
    });

    request.on("end", async () => {
      try {
        const payload = /** @type {unknown} */ (JSON.parse(body));
        if (typeof request.publicDemoBudgetPayloadValidator === "function") {
          await request.publicDemoBudgetPayloadValidator(payload);
        }
        resolve(payload);
      } catch (error) {
        if (error instanceof AppError) {
          reject(error);
          return;
        }
        reject(new AppError("Request body must contain valid JSON.", 400));
      }
    });
  });
}

export {
  apiKeyAsyncRoute,
  asyncRoute,
  authenticatedAsyncRoute,
  readJsonBody,
  readJsonObjectBody,
  workspaceAsyncRoute,
};
