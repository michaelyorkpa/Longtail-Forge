// @ts-check

import { Router } from "express";
import { createWorkspacePermissionResource } from "../core/permission-resource.js";
import { auditService } from "../services/audit.service.js";
import { permissionsService } from "../services/permissions.service.js";
import { workspaceAsyncRoute as asyncRoute } from "../utils/http.js";

const auditRoutes = Router();

auditRoutes.get("/audit-logs", asyncRoute(async (request, response) => {
  await permissionsService.assertCan(
    request.session,
    "audit_logs.view",
    createWorkspacePermissionResource(request.session.workspace_id, "read"),
  );
  const result = await auditService.list(request.session, request.query);
  response.status(200).json(result);
}));

auditRoutes.get("/audit-logs/export.csv", asyncRoute(async (request, response) => {
  await permissionsService.assertCan(
    request.session,
    "audit_logs.view",
    createWorkspacePermissionResource(request.session.workspace_id, "read"),
  );
  const csv = await auditService.exportCsv(request.session, request.query);

  response.writeHead(200, {
    "Content-Disposition": "attachment; filename=\"longtail-forge-audit-log.csv\"",
    "Content-Type": "text/csv; charset=utf-8",
  });
  response.end(csv);
}));

auditRoutes.get("/security-events", asyncRoute(async (request, response) => {
  await assertCanViewSecurityEvents(request.session);
  const result = await auditService.listSecurityEvents(request.session, request.query);
  response.status(200).json(result);
}));

auditRoutes.get("/security-events/export.csv", asyncRoute(async (request, response) => {
  await assertCanViewSecurityEvents(request.session);
  const csv = await auditService.exportSecurityEventsCsv(request.session, request.query);

  response.writeHead(200, {
    "Content-Disposition": "attachment; filename=\"longtail-forge-security-events.csv\"",
    "Content-Type": "text/csv; charset=utf-8",
  });
  response.end(csv);
}));

/** @param {import("../types/http-contracts.js").WorkspaceRequestSession} session @returns {Promise<void>} */
async function assertCanViewSecurityEvents(session) {
  const resource = createWorkspacePermissionResource(session.workspace_id, "read");
  await permissionsService.assertCan(session, "audit_logs.view", resource);
  await permissionsService.assertCan(session, "workspace_settings.manage", resource);
}

export { auditRoutes };
