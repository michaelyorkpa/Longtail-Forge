import { Router } from "express";
import { permissionsService } from "../services/permissions.service.js";
import { searchIndexRebuildService } from "../services/search-index-rebuild.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

const searchIndexRoutes = Router();

searchIndexRoutes.post("/search-index/rebuild", asyncRoute(async (request, response) => {
  await permissionsService.assertCan(request.session, "workspace_settings.manage", {
    workspace_id: request.session.workspace_id,
    operation: "update",
  });

  const payload = await readJsonBody(request);
  const moduleId = String(payload.moduleId || payload.module_id || "").trim();
  const result = moduleId
    ? await searchIndexRebuildService.rebuildModule({
        audit: true,
        dryRun: payload.dryRun === true || payload.dry_run === true,
        moduleId,
        session: request.session,
        source: "admin-api",
        workspaceId: request.session.workspace_id,
      })
    : await searchIndexRebuildService.rebuildWorkspace({
        audit: true,
        dryRun: payload.dryRun === true || payload.dry_run === true,
        session: request.session,
        source: "admin-api",
        workspaceId: request.session.workspace_id,
      });

  response.status(200).json(result);
}));

export { searchIndexRoutes };
