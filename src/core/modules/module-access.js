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

function requireModulePublicApiWritesEnabled(moduleId) {
  return requireModuleWriteEnabledForRoute(moduleId, (request) => request.apiSession);
}

export {
  assertModuleWriteEnabled,
  requireModuleBrowserWritesEnabled,
  requireModulePublicApiWritesEnabled,
  requireModuleWriteEnabled,
};
