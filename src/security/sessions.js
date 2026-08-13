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
/**
 * @typedef {Object} StoredSupportViewRow
 * @property {string} support_session_id
 * @property {string} actor_user_id
 * @property {string} actor_username
 * @property {string | null} actor_display_name
 * @property {string} effective_user_id
 * @property {string} effective_username
 * @property {string | null} effective_display_name
 * @property {string} workspace_id
 * @property {string | null} workspace_name
 * @property {string} started_at
 * @property {string} expires_at
 * @property {string | null} effective_home_workspace_id
 * @property {unknown} effective_timezone
 */
/**
 * @typedef {Object} StoredSessionRow
 * @property {string} session_id
 * @property {string | null} active_workspace_id
 * @property {string | null} home_workspace_id
 * @property {string} user_id
 * @property {string} username
 * @property {unknown} timezone
 * @property {string | null} ip_address
 * @property {unknown} password_change_required
 * @property {string | null} session_mode
 * @property {string} expires_at
 * @property {string | null} support_session_id
 * @property {StoredSupportViewRow} [support_view]
 */

/** @param {Parameters<typeof prepareSessionRecord>[0]} user @param {Parameters<typeof prepareSessionRecord>[1]} [options] */
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

/** @param {string} sessionId @returns {Promise<void>} */
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

  let session = /** @type {StoredSessionRow | null} */ (await sessionsRepository.readById(sessionId));

  if (!session) {
    return null;
  }

  if (session.support_session_id) {
    const activeSupportSession = { ...session, support_session_id: session.support_session_id };
    const resolution = await supportViewService.resolveForRequest(activeSupportSession, {
      requestId: getRequestContext(request).requestId,
    });
    session = /** @type {StoredSessionRow | null} */ (resolution.storedSession);
    if ("session" in resolution && resolution.session) {
      request.sessionRotation = resolution.session;
    }
    if (!session) {
      request.sessionInvalidated = true;
      return null;
    }
    if ("supportSession" in resolution && resolution.supportSession) {
      session.support_view = resolution.supportSession;
    }
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await sessionsRepository.remove(sessionId);
    return null;
  }

  const activeWorkspaceId = session.active_workspace_id ?? session.home_workspace_id ?? null;

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
    return {
      ...requestSession,
      actor_user_id: session.support_view.actor_user_id,
      actor_username: session.support_view.actor_username,
      effective_user_id: session.support_view.effective_user_id,
      effective_username: session.support_view.effective_username,
      effective_workspace_id: session.support_view.workspace_id,
      support_view: {
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
      },
      user_id: session.support_view.effective_user_id,
      username: session.support_view.effective_username,
      workspace_id: session.support_view.workspace_id,
      active_workspace_id: session.support_view.workspace_id,
      home_workspace_id: session.support_view.effective_home_workspace_id,
      timezone: normalizeTimezone(session.support_view.effective_timezone),
      password_change_required: false,
      session_mode: /** @type {const} */ ("normal"),
    };
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
