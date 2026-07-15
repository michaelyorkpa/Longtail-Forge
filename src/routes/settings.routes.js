import { Router } from "express";
import { settingsCatalogService } from "../services/settings-catalog.service.js";
import { settingsService } from "../services/settings.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

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

export { settingsRoutes };
