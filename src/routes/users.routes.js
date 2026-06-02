import { Router } from "express";
import { buildThemeCookie, getSessionIdFromRequest } from "../security/sessions.js";
import { authService } from "../services/auth.service.js";
import { usersService } from "../services/users.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

const usersRoutes = Router();

usersRoutes.get("/users", asyncRoute(async (request, response) => {
  const result = await usersService.list(request.session);
  response.status(200).json(result);
}));

usersRoutes.get("/workspaces", asyncRoute(async (request, response) => {
  const result = await usersService.listWorkspaces(request.session);
  response.status(200).json(result);
}));

usersRoutes.post("/workspaces", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await usersService.createWorkspace(payload, request.session, getSessionIdFromRequest(request));
  response.status(201).json(result);
}));

usersRoutes.delete("/user/workspaces/:workspaceId", asyncRoute(async (request, response) => {
  const result = await usersService.removeOwnWorkspaceMembership(request.session, request.params.workspaceId);
  response.status(200).json(result);
}));

usersRoutes.post("/users", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await usersService.create(payload, request.session);
  response.status(201).json(result);
}));

usersRoutes.put("/users/:userId/:action", asyncRoute(async (request, response) => {
  const payload = request.params.action === "update" ? await readJsonBody(request) : {};
  const result = await usersService.action({
    payload,
    session: request.session,
    userId: request.params.userId,
    action: request.params.action,
  });

  response.status(200).json(result);
}));

usersRoutes.delete("/users/:userId", asyncRoute(async (request, response) => {
  const result = await usersService.delete(request.session, request.params.userId);
  response.status(200).json(result);
}));

usersRoutes.get("/user/settings", asyncRoute(async (request, response) => {
  const result = await usersService.readSettings(request.session);

  response.setHeader("Set-Cookie", buildThemeCookie(result.themeMode));
  response.status(200).json(result);
}));

usersRoutes.put("/user/settings", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await usersService.saveSettings(payload, request.session);

  response.setHeader("Set-Cookie", buildThemeCookie(result.themeMode));
  response.status(200).json(result);
}));

usersRoutes.put("/user/password", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await authService.changePassword(payload, request.session);
  response.status(200).json(result);
}));

export { usersRoutes };
