import { randomBytes } from "node:crypto";
import { sessionsRepository } from "../repositories/sessions.repo.js";
import { normalizeThemeMode } from "../utils/normalizers.js";

const SESSION_COOKIE_NAME = "time_tracker_session";
const THEME_COOKIE_NAME = "lf_theme";
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

  return {
    organization_id: session.organization_id,
    user_id: session.user_id,
    username: session.username,
  };
}

function getSessionIdFromRequest(request) {
  if (request.cookies?.[SESSION_COOKIE_NAME]) {
    return request.cookies[SESSION_COOKIE_NAME];
  }

  const cookies = parseCookieHeader(request.headers.cookie || "");
  return cookies[SESSION_COOKIE_NAME] || "";
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
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax`;
}

function buildExpiredSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
}

function buildThemeCookie(themeMode) {
  return `${THEME_COOKIE_NAME}=${encodeURIComponent(normalizeThemeMode(themeMode))}; Max-Age=${SESSION_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

function buildExpiredThemeCookie() {
  return `${THEME_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
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
