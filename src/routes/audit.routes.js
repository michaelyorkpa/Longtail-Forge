import { Router } from "express";
import { auditService } from "../services/audit.service.js";
import { permissionsService } from "../services/permissions.service.js";
import { asyncRoute } from "../utils/http.js";

const auditRoutes = Router();

auditRoutes.get("/audit-logs", asyncRoute(async (request, response) => {
  await permissionsService.assertCan(request.session, "audit_logs.view", {
    workspace_id: request.session.workspace_id,
    operation: "read",
  });
  const result = await auditService.list(request.session, request.query);
  response.status(200).json(result);
}));

auditRoutes.get("/audit-logs/export.csv", asyncRoute(async (request, response) => {
  await permissionsService.assertCan(request.session, "audit_logs.view", {
    workspace_id: request.session.workspace_id,
    operation: "read",
  });
  const csv = await auditService.exportCsv(request.session, request.query);

  response.writeHead(200, {
    "Content-Disposition": "attachment; filename=\"longtail-forge-audit-log.csv\"",
    "Content-Type": "text/csv; charset=utf-8",
  });
  response.end(csv);
}));

export { auditRoutes };
