import { Router } from "express";
import {
  buildExpiredSessionCookie,
  buildExpiredThemeCookie,
  buildSessionCookie,
  buildThemeCookie,
  getRequestSession,
  getSessionIdFromRequest,
} from "../security/sessions.js";
import { authService } from "../services/auth.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";

const authRoutes = Router();

authRoutes.post("/login", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const result = await authService.login(payload);

  response.setHeader("Set-Cookie", [
    buildSessionCookie(result.session.sessionId, result.session.maxAgeSeconds),
    buildThemeCookie(result.themeMode),
  ]);
  response.status(200).json({ user: result.user });
}));

authRoutes.post("/logout", asyncRoute(async (request, response) => {
  const session = await getRequestSession(request);
  const result = await authService.logout(getSessionIdFromRequest(request), session);

  response.setHeader("Set-Cookie", [
    buildExpiredSessionCookie(),
    buildExpiredThemeCookie(),
  ]);
  response.status(200).json(result);
}));

authRoutes.get("/session", asyncRoute(async (request, response) => {
  const session = await getRequestSession(request);
  const result = await authService.readSession(session);

  response.status(200).json(result);
}));

authRoutes.post("/session/workspace", asyncRoute(async (request, response) => {
  const session = await getRequestSession(request);
  const payload = await readJsonBody(request);
  const result = await authService.switchWorkspace(getSessionIdFromRequest(request), session, payload);

  response.status(200).json(result);
}));

export { authRoutes };
