import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { normalizeTimezone } from "../utils/normalizers.js";

/**
 * The session fields prepareSessionRecord actually consumes.
 *
 * Every member is optional because the helper tolerates absence, and every
 * member is `unknown` because each one is normalized on the way in rather
 * than trusted. Callers may pass a wider record - production spreads a whole
 * authenticated user row - and the extra members are simply unread.
 *
 * This replaces `Record<string, unknown>`, which was not a description of the
 * input at all: a named session interface is not assignable to an index
 * signature it does not declare, so callers holding a precise session had to
 * launder it through an object literal to satisfy a helper that wanted less
 * than they had.
 * @typedef {{
 *   active_workspace_id?: unknown,
 *   home_workspace_id?: unknown,
 *   ip_address?: unknown,
 *   session_mode?: unknown,
 *   support_session_id?: unknown,
 *   timezone?: unknown,
 *   user_id?: unknown,
 *   username?: unknown,
 * }} SessionSeed
 */
/** @typedef {{ expiresAt?: string, maxAgeSeconds?: number, rememberMe?: boolean }} PrepareSessionOptions */

const REMEMBERED_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** @param {SessionSeed} user @param {PrepareSessionOptions} [options] */
function prepareSessionRecord(user, options = {}) {
  const sessionId = randomBytes(32).toString("base64url");
  const maxAgeSeconds = resolveMaxAgeSeconds(options);
  const expiresAt = options.expiresAt
    ? new Date(options.expiresAt)
    : new Date(Date.now() + maxAgeSeconds * 1000);
  const activeWorkspaceId = nullableSessionText(user.active_workspace_id)
    ?? nullableSessionText(user.home_workspace_id);

  return {
    cookie: {
      maxAgeSeconds: Math.max(0, Math.min(
        maxAgeSeconds,
        Math.ceil((expiresAt.getTime() - Date.now()) / 1000),
      )),
      sessionId,
    },
    record: {
      session_id: sessionId,
      home_workspace_id: nullableSessionText(user.home_workspace_id) ?? activeWorkspaceId,
      workspace_id: activeWorkspaceId,
      user_id: sessionText(user.user_id),
      username: sessionText(user.username),
      timezone: normalizeTimezone(user.timezone),
      ip_address: sessionText(user.ip_address),
      active_workspace_id: activeWorkspaceId,
      session_mode: sessionText(user.session_mode) || "normal",
      support_session_id: nullableSessionText(user.support_session_id),
      expires_at: expiresAt.toISOString(),
    },
  };
}

/** @param {unknown} value @returns {string} */
function sessionText(value) {
  return value === null || value === undefined ? "" : String(value);
}

/** @param {unknown} value @returns {string | null} */
function nullableSessionText(value) {
  const normalized = sessionText(value);
  return normalized === "" ? null : normalized;
}

/** @param {PrepareSessionOptions} options @returns {number} */
function resolveMaxAgeSeconds(options) {
  const configuredMaxAge = options.maxAgeSeconds;
  if (typeof configuredMaxAge === "number" && Number.isInteger(configuredMaxAge) && configuredMaxAge > 0) {
    return configuredMaxAge;
  }
  return options.rememberMe
    ? REMEMBERED_SESSION_TTL_SECONDS
    : config.cookies.maxAgeSeconds;
}

export { REMEMBERED_SESSION_TTL_SECONDS, prepareSessionRecord };
