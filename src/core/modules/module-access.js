import { modulesService } from "./modules.service.js";
import { AppError } from "../../utils/app-error.js";

async function assertModuleWriteEnabled(session, moduleId) {
  if (await modulesService.canWriteModule(session?.workspace_id, moduleId)) {
    return;
  }

  throw new AppError("This module is disabled for this workspace.", 403);
}

function requireModuleWriteEnabled(moduleId) {
  return async (request, response, next) => {
    try {
      await assertModuleWriteEnabled(request.session, moduleId);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireModuleWriteEnabledForRoute(moduleId, sessionReader) {
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

function requireModuleBrowserWritesEnabled(moduleId) {
  return requireModuleWriteEnabledForRoute(moduleId, (request) => request.session);
}

function requireModuleBrowserWritesEnabledForRouter(moduleId, router) {
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

function requireModulePublicApiWritesEnabled(moduleId) {
  return requireModuleWriteEnabledForRoute(moduleId, (request) => request.apiSession);
}

function isWriteRequest(request) {
  return !["GET", "HEAD", "OPTIONS"].includes(request.method);
}

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
