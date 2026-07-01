import { Router } from "express";
import { runtimeDiagnosticsService } from "../services/runtime-diagnostics.service.js";
import { asyncRoute } from "../utils/http.js";

const runtimeDiagnosticsRoutes = Router();

runtimeDiagnosticsRoutes.get("/runtime-diagnostics", asyncRoute(async (request, response) => {
  const diagnostics = await runtimeDiagnosticsService.read(request.session);

  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({ diagnostics });
}));

export { runtimeDiagnosticsRoutes };
