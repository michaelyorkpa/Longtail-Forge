import { Router } from "express";
import { settingsCatalogService } from "../services/settings-catalog.service.js";
import { settingsService } from "../services/settings.service.js";
import { workspaceBackupsService } from "../services/workspace-backups.service.js";
import { workspaceDeletionService } from "../services/workspace-deletion.service.js";
import { readJsonBody, workspaceAsyncRoute as asyncRoute } from "../utils/http.js";

const settingsRoutes = Router();

settingsRoutes.get("/settings/catalog", asyncRoute(async (request, response) => {
  const result = await settingsCatalogService.read(request.session);
  response.status(200).json(result);
}));

settingsRoutes.get("/settings", asyncRoute(async (request, response) => {
  const result = await settingsService.read(request.session);
  response.status(200).json(result);
}));

settingsRoutes.put("/settings", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await settingsService.save(payload, request.session);
  response.status(200).json(result);
}));

settingsRoutes.get("/settings/workspace-backups/latest", asyncRoute(async (request, response) => {
  const backup = await workspaceBackupsService.readLatest(request.session);
  response.status(200).json({ backup });
}));

settingsRoutes.post("/settings/workspace-backups", asyncRoute(async (request, response) => {
  const backup = await workspaceBackupsService.create(request.session);
  response.status(201).json({ backup });
}));

settingsRoutes.get("/settings/workspace-deletion", asyncRoute(async (request, response) => {
  const deletion = await workspaceDeletionService.read(request.session);
  response.status(200).json({ deletion });
}));

settingsRoutes.post("/settings/workspace-deletion/request", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const deletion = await workspaceDeletionService.request(payload, request.session);
  response.status(201).json({ deletion });
}));

settingsRoutes.post("/settings/workspace-deletion/cancel", asyncRoute(async (request, response) => {
  const deletion = await workspaceDeletionService.cancel(request.session);
  response.status(200).json({ deletion });
}));

export { settingsRoutes };
