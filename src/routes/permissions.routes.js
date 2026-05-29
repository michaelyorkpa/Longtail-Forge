import { Router } from "express";
import { permissionsService } from "../services/permissions.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

const permissionsRoutes = Router();

permissionsRoutes.get("/roles", asyncRoute(async (request, response) => {
  const result = await permissionsService.listRoleOptions(request.session);
  response.status(200).json(result);
}));

permissionsRoutes.get("/users/:userId/role-assignments", asyncRoute(async (request, response) => {
  const result = await permissionsService.readUserAssignments(request.session, request.params.userId);
  response.status(200).json(result);
}));

permissionsRoutes.put("/users/:userId/role-assignments", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await permissionsService.replaceUserAssignments(request.session, request.params.userId, payload);
  response.status(200).json(result);
}));

export { permissionsRoutes };
