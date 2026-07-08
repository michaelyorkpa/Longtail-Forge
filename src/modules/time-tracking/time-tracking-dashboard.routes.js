import { Router } from "express";
import { asyncRoute } from "../../core/http.js";
import { timeTrackingBillingService } from "./time-tracking-billing.service.js";

const timeTrackingDashboardRoutes = Router();

timeTrackingDashboardRoutes.get("/time-tracking/dashboard/billing-summary", asyncRoute(async (request, response) => {
  response.status(200).json(await timeTrackingBillingService.readDashboardBillingSummary(request.session));
}));

export { timeTrackingDashboardRoutes };
