// @ts-check
import { Router } from "express";
import { buildSessionCookie } from "../security/cookies.js";
import { getSessionIdFromRequest } from "../security/sessions.js";
import { supportViewService } from "../services/support-view.service.js";
import { getRequestContext } from "../core/request-context.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";
import { AppError } from "../utils/app-error.js";

const supportViewRoutes = Router();

supportViewRoutes.get("/support-view/targets", asyncRoute(async (request, response) => {
  const result = await supportViewService.listTargets(request.session);
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json(result);
}));

supportViewRoutes.post("/support-view/start", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  if (!isJsonObject(payload) || payload.confirmedReadOnly !== true) {
    throw new AppError("Confirm the read-only Support View warning before continuing.", 400);
  }
  const context = getRequestContext(request);
  const result = await supportViewService.start(
    request.session,
    getSessionIdFromRequest(request),
    payload,
    {
      ipAddress: context.ipAddress,
      requestId: context.requestId,
    },
  );
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Set-Cookie", buildSessionCookie(
    result.session.sessionId,
    result.session.maxAgeSeconds,
    request,
  ));
  response.status(200).json({ supportView: result.supportView });
}));

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isJsonObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

supportViewRoutes.get("/support-view/audit", asyncRoute(async (request, response) => {
  const result = await supportViewService.listAudit(request.session, request.query);
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json(result);
}));

supportViewRoutes.get("/support-view/audit/export.csv", asyncRoute(async (request, response) => {
  const csv = await supportViewService.exportAuditCsv(request.session, request.query);
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Disposition": 'attachment; filename="longtail-forge-support-view-audit.csv"',
    "Content-Type": "text/csv; charset=utf-8",
  });
  response.end(csv);
}));

export { supportViewRoutes };
