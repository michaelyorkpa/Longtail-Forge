import { Router } from "express";
import { dashboardService } from "../services/dashboard.service.js";
import { workspaceAsyncRoute as asyncRoute } from "../utils/http.js";

const dashboardRoutes = Router();

dashboardRoutes.get("/dashboard", asyncRoute(async (request, response) => {
  response.status(200).json(await dashboardService.readDashboard(request.session));
}));

export { dashboardRoutes };
