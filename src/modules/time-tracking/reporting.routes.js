import { Router } from "express";
import { asyncRoute } from "../../core/http.js";
import { timeTrackingBillingService } from "./time-tracking-billing.service.js";

const timeTrackingReportingRoutes = Router();

timeTrackingReportingRoutes.get("/reporting/bootstrap", asyncRoute(async (request, response) => {
  response.set("Cache-Control", "no-store");
  response.status(200).json(await timeTrackingBillingService.readReportingBootstrap(request.session));
}));

timeTrackingReportingRoutes.get("/reporting/project-summary", asyncRoute(async (request, response) => {
  response.set("Cache-Control", "no-store");
  response.status(200).json(await timeTrackingBillingService.readProjectSummary(request.session, request.query));
}));

export { timeTrackingReportingRoutes };
