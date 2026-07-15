import { Router } from "express";
import {
  buildCsrfCookie,
  buildExpiredCsrfCookie,
  buildExpiredSessionCookie,
  buildExpiredThemeAutoSourceCookie,
  buildExpiredThemeCookie,
  buildSessionCookie,
  buildThemeAutoSourceCookie,
  buildThemeCookie,
} from "../security/cookies.js";
import { createCsrfToken } from "../core/csrf-protection.js";
import { getRequestSession, getSessionIdFromRequest } from "../security/sessions.js";
import { authService } from "../services/auth.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";
import { getRequestContext } from "../core/request-context.js";

const authRoutes = Router();

authRoutes.get("/csrf-token", (request, response) => {
  const csrfToken = createCsrfToken();
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Set-Cookie", buildCsrfCookie(csrfToken, request));
  response.status(200).json({ csrfToken });
});

authRoutes.post("/login", asyncRoute(async (request, response) => {
  const payload = await readJsonBody(request);
  const requestContext = getRequestContext(request);
  const result = await authService.login(payload, {
    ipAddress: requestContext.ipAddress,
  });

  response.setHeader("Set-Cookie", [
    buildSessionCookie(result.session.sessionId, result.session.maxAgeSeconds, request),
    buildThemeCookie(result.themeMode, request),
    buildThemeAutoSourceCookie(result.themeAutoSource, request),
  ]);
  response.status(200).json({ user: result.user });
}));

authRoutes.post("/logout", asyncRoute(async (request, response) => {
  const session = await getRequestSession(request);
  const result = await authService.logout(getSessionIdFromRequest(request), session);

  response.setHeader("Set-Cookie", [
    buildExpiredCsrfCookie(request),
    buildExpiredSessionCookie(request),
    buildExpiredThemeCookie(request),
    buildExpiredThemeAutoSourceCookie(request),
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
