import { Router } from "express";
import { reportingService } from "../services/reporting.service.js";
import { asyncRoute } from "../utils/http.js";

const reportingRoutes = Router();

reportingRoutes.get("/reporting/bootstrap", asyncRoute(async (request, response) => {
  response.status(200).json(await reportingService.readReportingBootstrap(request.session));
}));

reportingRoutes.get("/reporting/project-summary", asyncRoute(async (request, response) => {
  response.status(200).json(await reportingService.readProjectSummary(request.session, request.query));
}));

reportingRoutes.get("/dashboard", asyncRoute(async (request, response) => {
  response.status(200).json(await reportingService.readDashboard(request.session));
}));

export { reportingRoutes };
