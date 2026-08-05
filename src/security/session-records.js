import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { normalizeTimezone } from "../utils/normalizers.js";

const REMEMBERED_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function prepareSessionRecord(user, options = {}) {
  const sessionId = randomBytes(32).toString("base64url");
  const maxAgeSeconds = resolveMaxAgeSeconds(options);
  const expiresAt = options.expiresAt
    ? new Date(options.expiresAt)
    : new Date(Date.now() + maxAgeSeconds * 1000);
  const activeWorkspaceId = user.active_workspace_id ?? user.home_workspace_id ?? null;

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
      home_workspace_id: user.home_workspace_id ?? activeWorkspaceId,
      workspace_id: activeWorkspaceId,
      user_id: user.user_id,
      username: user.username,
      timezone: normalizeTimezone(user.timezone),
      ip_address: user.ip_address || "",
      active_workspace_id: activeWorkspaceId,
      session_mode: user.session_mode || "normal",
      support_session_id: user.support_session_id || null,
      expires_at: expiresAt.toISOString(),
    },
  };
}

function resolveMaxAgeSeconds(options) {
  if (Number.isInteger(options.maxAgeSeconds) && options.maxAgeSeconds > 0) {
    return options.maxAgeSeconds;
  }
  return options.rememberMe
    ? REMEMBERED_SESSION_TTL_SECONDS
    : config.cookies.maxAgeSeconds;
}

export { REMEMBERED_SESSION_TTL_SECONDS, prepareSessionRecord };
