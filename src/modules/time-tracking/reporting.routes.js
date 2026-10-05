import { Router } from "express";
import { asyncRoute } from "../../core/http.js";
import { AppError } from "../../core/errors.js";
import { timeTrackingBillingService } from "./time-tracking-billing.service.js";

/** @typedef {import("../../types/time-tracking-contracts.d.ts").TimeTrackingSession} TimeTrackingSession */

const timeTrackingReportingRoutes = Router();

timeTrackingReportingRoutes.get("/reporting/bootstrap", asyncRoute(async (request, response) => {
  response.set("Cache-Control", "no-store");
  response.status(200).json(await timeTrackingBillingService.readReportingBootstrap(readTimeTrackingSession(request)));
}));

timeTrackingReportingRoutes.get("/reporting/project-summary", asyncRoute(async (request, response) => {
  response.set("Cache-Control", "no-store");
  response.status(200).json(await timeTrackingBillingService.readProjectSummary(readTimeTrackingSession(request), request.query));
}));

/** @param {Express.Request} request @returns {TimeTrackingSession} */
function readTimeTrackingSession(request) {
  if (!request.session?.workspace_id) {
    throw new AppError("Time Tracking route requires an active workspace session.", 401);
  }
  return /** @type {TimeTrackingSession} */ (request.session);
}

export { timeTrackingReportingRoutes };
