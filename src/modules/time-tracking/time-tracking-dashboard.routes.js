import { Router } from "express";
import { asyncRoute } from "../../core/http.js";
import { AppError } from "../../core/errors.js";
import { timeTrackingBillingService } from "./time-tracking-billing.service.js";
import { timeTrackingDashboardService } from "./time-tracking-dashboard.service.js";

/** @typedef {import("../../types/time-tracking-contracts.d.ts").TimeTrackingSession} TimeTrackingSession */

const timeTrackingDashboardRoutes = Router();

timeTrackingDashboardRoutes.get("/time-tracking/dashboard/billing-summary", asyncRoute(async (request, response) => {
  response.status(200).json(await timeTrackingBillingService.readDashboardBillingSummary(readTimeTrackingSession(request)));
}));

timeTrackingDashboardRoutes.get("/time-tracking/dashboard/effort-summary", asyncRoute(async (request, response) => {
  response.status(200).json(await timeTrackingDashboardService.readDashboardEffortSummary(readTimeTrackingSession(request)));
}));

/** @param {Express.Request} request @returns {TimeTrackingSession} */
function readTimeTrackingSession(request) {
  if (!request.session?.workspace_id) {
    throw new AppError("Time Tracking route requires an active workspace session.", 401);
  }
  return /** @type {TimeTrackingSession} */ (request.session);
}

export { timeTrackingDashboardRoutes };
