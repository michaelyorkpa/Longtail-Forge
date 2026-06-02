import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { sessionsRepository } from "../repositories/sessions.repo.js";
import { normalizeThemeMode, normalizeTimezone } from "../utils/normalizers.js";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

async function createSession(user) {
  const sessionId = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await sessionsRepository.removeExpired();
  await sessionsRepository.create({
    session_id: sessionId,
    organization_id: user.organization_id,
    user_id: user.user_id,
    username: user.username,
    timezone: normalizeTimezone(user.timezone),
    active_workspace_id: user.active_workspace_id || user.organization_id,
    expires_at: expiresAt.toISOString(),
  });

  return {
    sessionId,
    maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
  };
}

async function deleteRequestSession(request) {
  const sessionId = getSessionIdFromRequest(request);

  await deleteSession(sessionId);
}

async function deleteSession(sessionId) {
  if (!sessionId) {
    return;
  }

  await sessionsRepository.remove(sessionId);
}

async function getRequestSession(request) {
  const sessionId = getSessionIdFromRequest(request);

  if (!sessionId) {
    return null;
  }

  const session = await sessionsRepository.readById(sessionId);

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await sessionsRepository.remove(sessionId);
    return null;
  }

  const activeWorkspaceId = session.active_workspace_id || session.organization_id;

  return {
    organization_id: activeWorkspaceId,
    active_workspace_id: activeWorkspaceId,
    home_organization_id: session.organization_id,
    user_id: session.user_id,
    username: session.username,
    timezone: normalizeTimezone(session.timezone),
  };
}

function getSessionIdFromRequest(request) {
  if (request.cookies?.[config.cookies.sessionName]) {
    return request.cookies[config.cookies.sessionName];
  }

  const cookies = parseCookieHeader(request.headers.cookie || "");
  return cookies[config.cookies.sessionName] || "";
}

function parseCookieHeader(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((cookies, cookie) => {
      const separatorIndex = cookie.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const name = cookie.slice(0, separatorIndex).trim();
      const value = cookie.slice(separatorIndex + 1).trim();

      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function buildSessionCookie(sessionId, maxAgeSeconds) {
  return buildCookie(config.cookies.sessionName, sessionId, {
    httpOnly: config.cookies.httpOnly,
    maxAgeSeconds,
    sameSite: config.cookies.sameSite,
  });
}

function buildExpiredSessionCookie() {
  return buildCookie(config.cookies.sessionName, "", {
    httpOnly: config.cookies.httpOnly,
    maxAgeSeconds: 0,
    sameSite: config.cookies.sameSite,
  });
}

function buildThemeCookie(themeMode) {
  return buildCookie(config.cookies.themeName, normalizeThemeMode(themeMode), {
    maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
    sameSite: config.cookies.sameSite,
  });
}

function buildExpiredThemeCookie() {
  return buildCookie(config.cookies.themeName, "", {
    maxAgeSeconds: 0,
    sameSite: config.cookies.sameSite,
  });
}

function buildCookie(name, value, options = {}) {
  const segments = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${options.maxAgeSeconds}`,
    "Path=/",
  ];

  if (options.httpOnly) {
    segments.push("HttpOnly");
  }

  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  return segments.join("; ");
}

export {
  buildExpiredSessionCookie,
  buildExpiredThemeCookie,
  buildSessionCookie,
  buildThemeCookie,
  createSession,
  deleteSession,
  deleteRequestSession,
  getRequestSession,
  getSessionIdFromRequest,
};
