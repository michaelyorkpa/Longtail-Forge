import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { sessionsRepository } from "../repositories/sessions.repo.js";
import { normalizeBooleanPreference, normalizeTimezone } from "../utils/normalizers.js";

const REMEMBERED_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

async function createSession(user, options = {}) {
  const sessionId = randomBytes(32).toString("base64url");
  const maxAgeSeconds = options.rememberMe
    ? REMEMBERED_SESSION_TTL_SECONDS
    : config.cookies.maxAgeSeconds;
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

  await sessionsRepository.removeExpired();
  await sessionsRepository.create({
    session_id: sessionId,
    home_workspace_id: user.home_workspace_id,
    workspace_id: user.active_workspace_id ?? user.home_workspace_id ?? null,
    user_id: user.user_id,
    username: user.username,
    timezone: normalizeTimezone(user.timezone),
    ip_address: user.ip_address || "",
    active_workspace_id: user.active_workspace_id ?? user.home_workspace_id ?? null,
    session_mode: user.session_mode || "normal",
    expires_at: expiresAt.toISOString(),
  });

  return {
    sessionId,
    maxAgeSeconds,
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

  const activeWorkspaceId = session.active_workspace_id ?? session.home_workspace_id ?? null;

  return {
    workspace_id: activeWorkspaceId,
    active_workspace_id: activeWorkspaceId,
    home_workspace_id: session.home_workspace_id,
    user_id: session.user_id,
    username: session.username,
    timezone: normalizeTimezone(session.timezone),
    ip_address: session.ip_address || "",
    password_change_required: normalizeBooleanPreference(session.password_change_required),
    session_mode: session.session_mode || "normal",
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

export {
  REMEMBERED_SESSION_TTL_SECONDS,
  createSession,
  deleteSession,
  deleteRequestSession,
  getRequestSession,
  getSessionIdFromRequest,
};
