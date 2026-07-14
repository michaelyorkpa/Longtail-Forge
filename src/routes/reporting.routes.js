import { Router } from "express";
import { reportingService } from "../services/reporting.service.js";
import { asyncRoute } from "../utils/http.js";

const reportingRoutes = Router();

reportingRoutes.get("/reporting/catalog", asyncRoute(async (request, response) => {
  response.set("Cache-Control", "no-store");
  response.status(200).json(await reportingService.readReportCatalog(request.session));
}));

reportingRoutes.get("/reporting/reports/:reportKey/run", asyncRoute(async (request, response) => {
  response.set("Cache-Control", "no-store");
  const result = await reportingService.runReport(request.session, request.params.reportKey, request.query);
  response.status(result.statusCode).json(result.payload);
}));

export { reportingRoutes };
