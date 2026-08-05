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
import { supportViewService } from "../services/support-view.service.js";
import { asyncRoute, readJsonBody } from "../utils/http.js";
import { getRequestContext } from "../core/request-context.js";
import { enforceSupportViewRequest } from "../middleware/support-view-request-gate.js";
import { AppError } from "../utils/app-error.js";

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

authRoutes.post("/support-view/exit", asyncRoute(async (request, response) => {
  const session = await getRequestSession(request);
  applyRequestSessionRotation(request, response);
  request.session = session;
  if (!session) {
    throw new AppError("Not logged in.", 401);
  }
  if (!session.support_view) {
    response.status(200).json({ ok: true, supportViewActive: false });
    return;
  }

  const result = await supportViewService.exit(
    session,
    getSessionIdFromRequest(request),
    { requestId: getRequestContext(request).requestId },
  );
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Set-Cookie", buildSessionCookie(
    result.session.sessionId,
    result.session.maxAgeSeconds,
    request,
  ));
  response.status(200).json({ ok: true, supportViewActive: false });
}));

authRoutes.post("/logout", asyncRoute(async (request, response) => {
  const session = await getRequestSession(request);
  request.session = session;
  const currentSessionId = request.sessionRotation?.sessionId || getSessionIdFromRequest(request);
  let logoutSession = session;
  if (session?.support_view) {
    const ended = await supportViewService.endForLogout(session, currentSessionId, {
      requestId: getRequestContext(request).requestId,
    });
    logoutSession = ended.actorSession;
  }
  const result = await authService.logout(currentSessionId, logoutSession);

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
  applyRequestSessionRotation(request, response);
  request.session = session;
  if (session?.support_view && !(await enforceSupportViewRequest(request, response))) {
    return;
  }
  const result = await authService.readSession(session);

  response.status(200).json(result);
}));

authRoutes.post("/session/workspace", asyncRoute(async (request, response) => {
  const session = await getRequestSession(request);
  applyRequestSessionRotation(request, response);
  request.session = session;
  if (session?.support_view && !(await enforceSupportViewRequest(request, response))) {
    return;
  }
  const payload = await readJsonBody(request);
  const result = await authService.switchWorkspace(
    request.sessionRotation?.sessionId || getSessionIdFromRequest(request),
    session,
    payload,
  );

  response.status(200).json(result);
}));

function applyRequestSessionRotation(request, response) {
  if (request.sessionRotation) {
    response.append("Set-Cookie", buildSessionCookie(
      request.sessionRotation.sessionId,
      request.sessionRotation.maxAgeSeconds,
      request,
    ));
    return;
  }
  if (request.sessionInvalidated) {
    response.append("Set-Cookie", buildExpiredSessionCookie(request));
  }
}

export { authRoutes };
