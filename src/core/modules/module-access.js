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

export { assertModuleWriteEnabled, requireModuleWriteEnabled };
