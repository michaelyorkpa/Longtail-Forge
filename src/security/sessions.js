// @ts-check
import { config } from "../config.js";
import { sessionsRepository } from "../repositories/sessions.repo.js";
import { supportViewService } from "../services/support-view.service.js";
import { getRequestContext } from "../core/request-context.js";
import { normalizeBooleanPreference, normalizeTimezone } from "../utils/normalizers.js";
import { REMEMBERED_SESSION_TTL_SECONDS, prepareSessionRecord } from "./session-records.js";

/** @typedef {import("../types/http-contracts.js").HttpIdentityRequest} HttpIdentityRequest */
/** @typedef {import("../types/http-contracts.js").RequestSession} RequestSession */
/** @typedef {import("../types/http-contracts.js").SessionMode} SessionMode */

async function createSession(user, options = {}) {
  const prepared = prepareSessionRecord(user, options);

  await sessionsRepository.removeExpired();
  await sessionsRepository.create(prepared.record);
  return prepared.cookie;
}

/** @param {HttpIdentityRequest} request */
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

/**
 * @param {HttpIdentityRequest} request
 * @returns {Promise<RequestSession | null>}
 */
async function getRequestSession(request) {
  const sessionId = getSessionIdFromRequest(request);

  if (!sessionId) {
    return null;
  }

  let session = await sessionsRepository.readById(sessionId);

  if (!session) {
    return null;
  }

  if (session.support_session_id) {
    const resolution = await supportViewService.resolveForRequest(session, {
      requestId: getRequestContext(request).requestId,
    });
    session = resolution.storedSession;
    if (resolution.session) {
      request.sessionRotation = resolution.session;
    }
    if (!session) {
      request.sessionInvalidated = true;
      return null;
    }
    if (resolution.supportSession) {
      session.support_view = resolution.supportSession;
    }
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await sessionsRepository.remove(sessionId);
    return null;
  }

  const activeWorkspaceId = session.active_workspace_id ?? session.home_workspace_id ?? null;

  /** @type {RequestSession} */
  const requestSession = {
    workspace_id: activeWorkspaceId,
    active_workspace_id: activeWorkspaceId,
    home_workspace_id: session.home_workspace_id,
    user_id: session.user_id,
    username: session.username,
    timezone: normalizeTimezone(session.timezone),
    ip_address: session.ip_address || "",
    password_change_required: normalizeBooleanPreference(session.password_change_required),
    session_mode: /** @type {SessionMode} */ (session.session_mode || "normal"),
  };

  if (session.support_view) {
    requestSession.actor_user_id = session.support_view.actor_user_id;
    requestSession.actor_username = session.support_view.actor_username;
    requestSession.effective_user_id = session.support_view.effective_user_id;
    requestSession.effective_username = session.support_view.effective_username;
    requestSession.effective_workspace_id = session.support_view.workspace_id;
    requestSession.support_view = {
      supportSessionId: session.support_view.support_session_id,
      actorUserId: session.support_view.actor_user_id,
      actorUsername: session.support_view.actor_username,
      actorLabel: String(session.support_view.actor_display_name || session.support_view.actor_username || "Administrator"),
      effectiveUserId: session.support_view.effective_user_id,
      effectiveUsername: session.support_view.effective_username,
      effectiveUserLabel: String(session.support_view.effective_display_name || session.support_view.effective_username || "User unavailable"),
      effectiveWorkspaceId: session.support_view.workspace_id,
      effectiveWorkspaceName: String(session.support_view.workspace_name || "Workspace unavailable"),
      startedAt: session.support_view.started_at,
      expiresAt: session.support_view.expires_at,
    };
    requestSession.user_id = session.support_view.effective_user_id;
    requestSession.username = session.support_view.effective_username;
    requestSession.workspace_id = session.support_view.workspace_id;
    requestSession.active_workspace_id = session.support_view.workspace_id;
    requestSession.home_workspace_id = session.support_view.effective_home_workspace_id;
    requestSession.timezone = normalizeTimezone(session.support_view.effective_timezone);
    requestSession.password_change_required = false;
  }

  return requestSession;
}

/** @param {HttpIdentityRequest} request */
function getSessionIdFromRequest(request) {
  if (request.cookies?.[config.cookies.sessionName]) {
    return request.cookies[config.cookies.sessionName];
  }

  const cookies = parseCookieHeader(request.headers.cookie || "");
  return cookies[config.cookies.sessionName] || "";
}

/**
 * @param {string} cookieHeader
 * @returns {Record<string, string>}
 */
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
    }, /** @type {Record<string, string>} */ ({}));
}

export {
  REMEMBERED_SESSION_TTL_SECONDS,
  createSession,
  deleteSession,
  deleteRequestSession,
  getRequestSession,
  getSessionIdFromRequest,
};
