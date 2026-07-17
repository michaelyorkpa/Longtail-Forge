import { Router } from "express";
import { buildThemeAutoSourceCookie, buildThemeCookie } from "../security/cookies.js";
import { getSessionIdFromRequest } from "../security/sessions.js";
import { authService } from "../services/auth.service.js";
import { usersService } from "../services/users.service.js";
import { sessionsService } from "../services/sessions.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";
import { getRequestContext } from "../core/request-context.js";

const usersRoutes = Router();

usersRoutes.get("/users", asyncRoute(async (request, response) => {
  const result = await usersService.list(request.session);
  response.status(200).json(result);
}));

usersRoutes.get("/users/permission-resources", asyncRoute(async (request, response) => {
  const result = await usersService.listPermissionResources(request.session);
  response.status(200).json(result);
}));

usersRoutes.get("/users/add-options", asyncRoute(async (request, response) => {
  const result = await usersService.readAddUserOptions(request.session, request.query.workspaceId);
  response.status(200).json(result);
}));

usersRoutes.post("/users/lookup", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await usersService.lookupAddUserAccount(payload, request.session);
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
  const result = await usersService.removeOwnWorkspaceMembership(request.session, request.params.workspaceId, {
    currentSessionId: getSessionIdFromRequest(request),
  });
  response.status(200).json(result);
}));

usersRoutes.delete("/user/account", asyncRoute(async (request, response) => {
  const result = await usersService.retireOwnAccount(request.session, {
    currentSessionId: getSessionIdFromRequest(request),
    ipAddress: getRequestContext(request).ipAddress,
  });
  response.status(200).json(result);
}));

usersRoutes.post("/users", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await usersService.create(payload, request.session);
  response.status(result.accountCreated ? 201 : 200).json(result);
}));

usersRoutes.get("/users/:userId/sessions", asyncRoute(async (request, response) => {
  const result = await sessionsService.listManagedUserSessions(
    request.session,
    request.params.userId,
    getSessionIdFromRequest(request),
  );
  response.status(200).json(result);
}));

usersRoutes.delete("/users/:userId/sessions/:sessionReference", asyncRoute(async (request, response) => {
  const result = await sessionsService.revokeManagedSession(
    request.session,
    request.params.userId,
    request.params.sessionReference,
    getSessionIdFromRequest(request),
  );
  response.status(200).json(result);
}));

usersRoutes.delete("/users/:userId/sessions", asyncRoute(async (request, response) => {
  const result = await sessionsService.revokeManagedUserSessions(
    request.session,
    request.params.userId,
    getSessionIdFromRequest(request),
  );
  response.status(200).json(result);
}));

usersRoutes.put("/users/:userId/:action", asyncRoute(async (request, response) => {
  const payload = request.params.action === "update" ? await readJsonBody(request) : {};
  const result = await usersService.action({
    payload,
    session: request.session,
    userId: request.params.userId,
    action: request.params.action,
    context: {
      currentSessionId: getSessionIdFromRequest(request),
      ipAddress: getRequestContext(request).ipAddress,
    },
  });

  response.status(200).json(result);
}));

usersRoutes.delete("/users/:userId", asyncRoute(async (request, response) => {
  const result = await usersService.delete(request.session, request.params.userId, {
    currentSessionId: getSessionIdFromRequest(request),
    ipAddress: getRequestContext(request).ipAddress,
  });
  response.status(200).json(result);
}));

usersRoutes.get("/user/settings", asyncRoute(async (request, response) => {
  const result = await usersService.readSettings(request.session);

  response.setHeader("Set-Cookie", [
    buildThemeCookie(result.themeMode, request),
    buildThemeAutoSourceCookie(result.themeAutoSource, request),
  ]);
  response.status(200).json(result);
}));

usersRoutes.put("/user/settings", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await usersService.saveSettings(payload, request.session);

  response.setHeader("Set-Cookie", [
    buildThemeCookie(result.themeMode, request),
    buildThemeAutoSourceCookie(result.themeAutoSource, request),
  ]);
  response.status(200).json(result);
}));

usersRoutes.put("/user/password", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await authService.changePassword(payload, request.session, {
    currentSessionId: getSessionIdFromRequest(request),
    ipAddress: getRequestContext(request).ipAddress,
  });
  response.status(200).json(result);
}));

export { usersRoutes };
