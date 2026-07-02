import { Router } from "express";
import { permissionsService } from "../services/permissions.service.js";
import { queueSearchIndexRebuild } from "../services/search-index-jobs.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

const searchIndexRoutes = Router();

searchIndexRoutes.post("/search-index/rebuild", asyncRoute(async (request, response) => {
  await permissionsService.assertCan(request.session, "workspace_settings.manage", {
    workspace_id: request.session.workspace_id,
    operation: "update",
  });

  const payload = await readJsonBody(request);
  const moduleId = String(payload.moduleId || payload.module_id || "").trim();
  const result = await queueSearchIndexRebuild({
    dryRun: payload.dryRun === true || payload.dry_run === true,
    moduleId,
    requestedByUserId: request.session.user_id,
    scope: "workspace",
    source: "admin-api",
    workspaceId: request.session.workspace_id,
  });

  response.status(202).json(result);
}));

export { searchIndexRoutes };
