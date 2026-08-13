import { modulesService } from "./modules.service.js";
import { AppError } from "../../utils/app-error.js";

/** @typedef {import("../../types/http-contracts.js").ApiSession | import("../../types/http-contracts.js").WorkspaceRequestSession} ModuleAccessSession */
/** @typedef {import("../../types/route-contracts.js").RouteRequest & { session?: ModuleAccessSession, apiSession?: ModuleAccessSession }} ModuleAccessRequest */
/** @typedef {import("../../types/route-contracts.js").RouteResponse} RouteResponse */
/** @typedef {import("../../types/route-contracts.js").RouteNext} RouteNext */
/** @typedef {{ route?: { methods?: Record<string, boolean> }, match?: (path: string) => boolean }} RouterLayer */
/** @typedef {import("../../types/route-contracts.js").RouterContract & { stack?: RouterLayer[] }} RouterWithStack */

/**
 * @param {ModuleAccessSession | undefined} session
 * @param {string} moduleId
 */
async function assertModuleWriteEnabled(session, moduleId) {
  const workspaceId = session?.workspace_id;
  if (workspaceId && await modulesService.canWriteModule(workspaceId, moduleId)) {
    return;
  }

  throw new AppError("This module is disabled for this workspace.", 403);
}

/** @param {string} moduleId */
function requireModuleWriteEnabled(moduleId) {
  /** @param {ModuleAccessRequest} request @param {RouteResponse} response @param {RouteNext} next */
  return async (request, response, next) => {
    try {
      await assertModuleWriteEnabled(request.session, moduleId);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** @param {string} moduleId @param {(request: ModuleAccessRequest) => ModuleAccessSession | undefined} sessionReader */
function requireModuleWriteEnabledForRoute(moduleId, sessionReader) {
  /** @param {ModuleAccessRequest} request @param {RouteResponse} response @param {RouteNext} next */
  return async (request, response, next) => {
    try {
      if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
        next();
        return;
      }

      await assertModuleWriteEnabled(sessionReader(request), moduleId);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** @param {string} moduleId */
function requireModuleBrowserWritesEnabled(moduleId) {
  return requireModuleWriteEnabledForRoute(moduleId, (request) => request.session);
}

/**
 * @param {string} moduleId
 * @param {RouterWithStack} router
 */
function requireModuleBrowserWritesEnabledForRouter(moduleId, router) {
  /** @param {ModuleAccessRequest} request @param {RouteResponse} response @param {RouteNext} next */
  return async (request, response, next) => {
    try {
      if (!isWriteRequest(request) || !routerMatchesRequest(router, request)) {
        next();
        return;
      }

      await assertModuleWriteEnabled(request.session, moduleId);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** @param {string} moduleId */
function requireModulePublicApiWritesEnabled(moduleId) {
  return requireModuleWriteEnabledForRoute(moduleId, (request) => request.apiSession);
}

/**
 * @param {{ method: string; }} request
 */
function isWriteRequest(request) {
  return !["GET", "HEAD", "OPTIONS"].includes(request.method);
}

/** @param {RouterWithStack} router @param {ModuleAccessRequest} request */
function routerMatchesRequest(router, request) {
  return (router?.stack || []).some((layer) => {
    if (!layer.route || typeof layer.match !== "function") {
      return false;
    }

    const method = String(request.method || "").toLowerCase();
    return layer.route.methods?.[method] === true && layer.match(request.path);
  });
}

export {
  assertModuleWriteEnabled,
  requireModuleBrowserWritesEnabled,
  requireModuleBrowserWritesEnabledForRouter,
  requireModulePublicApiWritesEnabled,
  requireModuleWriteEnabled,
};
