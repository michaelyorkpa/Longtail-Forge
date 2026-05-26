import { Router } from "express";
import { settingsService } from "../services/settings.service.js";
import { legacyRoute } from "./route-utils.js";

const settingsRoutes = Router();

settingsRoutes.get("/settings", legacyRoute((request, response) => settingsService.read(response)));

settingsRoutes.put("/settings", legacyRoute((request, response) => settingsService.save(request, response)));

export { settingsRoutes };
