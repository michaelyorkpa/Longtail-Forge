import { Router } from "express";
import { reportingService } from "../services/reporting.service.js";
import { asyncRoute } from "../utils/http.js";
import { sendApiError } from "../core/http-error-contract.js";

const reportingRoutes = Router();

reportingRoutes.get("/reporting/catalog", asyncRoute(async (request, response) => {
  response.set("Cache-Control", "no-store");
  response.status(200).json(await reportingService.readReportCatalog(request.session));
}));

reportingRoutes.get("/reporting/reports/:reportKey/run", asyncRoute(async (request, response) => {
  response.set("Cache-Control", "no-store");
  const result = await reportingService.runReport(request.session, request.params.reportKey, request.query);
  if (result.statusCode >= 400) {
    sendApiError(request, response, {
      code: result.payload.error.code,
      message: result.payload.error.message,
      statusCode: result.statusCode,
    });
    return;
  }
  response.status(result.statusCode).json(result.payload);
}));

export { reportingRoutes };
