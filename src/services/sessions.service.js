import { createHmac, randomBytes } from "node:crypto";
import { internalEventBus } from "../core/events/event-bus.js";
import { assertPublicDemoVisitorIdentityMutable } from "../core/public-demo-identities.js";
import { sessionsRepository } from "../repositories/sessions.repo.js";
import { usersRepository } from "../repositories/users.repo.js";
import { AppError } from "../utils/app-error.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";

/** @typedef {import("../types/http-contracts.js").RequestSession} RequestSession */
/** @typedef {RequestSession & { workspace_id: string }} WorkspaceRequestSession */
/** @typedef {import("../repositories/sessions.repo.js").StoredSessionListRow} StoredSessionListRow */
/**
 * @typedef {Object} SessionRevocationTargetUser
 * @property {string} user_id
 * @property {string} username
 * @property {string | null} home_workspace_id
 */
/**
 * @typedef {Object} SessionRevocationInput
 * @property {WorkspaceRequestSession | null} [actorSession]
 * @property {string} [currentSessionId]
 * @property {string} reason
 * @property {SessionRevocationTargetUser} targetUser
 * @property {string} [workspaceId]
 */
/**
 * The preserved session is mandatory: callers that intend to revoke every
 * session must use revokeAllForUser instead of weakening this exception.
 *
 * @typedef {SessionRevocationInput & { preservedSessionId: string }} RevokeAllForUserExceptInput
 */
/** @typedef {{ revokedCount: number }} SessionRevocationResult */
/**
 * @typedef {SessionRevocationInput & {
 *   scope: "single" | "all" | "all_except_current" | "workspace"
 * }} SessionRevocationContext
 */

const SESSION_REFERENCE_SECRET = randomBytes(32);

/** @param {WorkspaceRequestSession} session @param {string} userId @param {string} [currentSessionId] */
async function listManagedUserSessions(session, userId, currentSessionId = "") {
  const targetUser = await assertCanManageUserSessions(session, userId, "read");
  await sessionsRepository.removeExpired();
  const sessions = await sessionsRepository.listForUserInWorkspace(targetUser.user_id, session.workspace_id);

  return {
    sessions: sessions.map((row) => toManagedSession(row, currentSessionId)),
    user: toTargetUser(targetUser),
  };
}

/** @param {WorkspaceRequestSession} session @param {string} userId @param {string} sessionReference @param {string} [currentSessionId] */
async function revokeManagedSession(session, userId, sessionReference, currentSessionId = "") {
  const targetUser = await assertCanManageUserSessions(session, userId, "update");
  const normalizedReference = normalizeReference(sessionReference);
  await sessionsRepository.removeExpired();
  const candidates = await sessionsRepository.listForUserInWorkspace(targetUser.user_id, session.workspace_id);
  const targetSession = candidates.find((row) => createSessionReference(row.session_id) === normalizedReference);

  if (!targetSession) {
    throw new AppError("Session was not found.", 404);
  }

  const revokedCount = await sessionsRepository.remove(targetSession.session_id);
  await recordRevocations(revokedCount ? [targetSession] : [], {
    actorSession: session,
    currentSessionId,
    reason: "managed_single_session",
    scope: "single",
    targetUser,
    workspaceId: session.workspace_id,
  });

  return { ok: true, revokedCount };
}

/** @param {WorkspaceRequestSession} session @param {string} userId @param {string} [currentSessionId] */
async function revokeManagedUserSessions(session, userId, currentSessionId = "") {
  const targetUser = await assertCanManageUserSessions(session, userId, "update");
  await sessionsRepository.removeExpired();
  const candidates = await sessionsRepository.listForUserInWorkspace(targetUser.user_id, session.workspace_id);
  const revokedCount = await sessionsRepository.removeAllForUserInWorkspace(targetUser.user_id, session.workspace_id);
  await recordRevocations(candidates.slice(0, revokedCount), {
    actorSession: session,
    currentSessionId,
    reason: "managed_workspace_sessions",
    scope: "workspace",
    targetUser,
    workspaceId: session.workspace_id,
  });

  return { ok: true, revokedCount };
}

/** @param {SessionRevocationInput & { sessionId: string }} input @returns {Promise<SessionRevocationResult>} */
async function revokeSessionById({ actorSession = null, currentSessionId = "", reason, sessionId, targetUser, workspaceId = "" }) {
  if (!sessionId) {
    return { revokedCount: 0 };
  }

  const candidates = await sessionsRepository.listForUser(targetUser.user_id);
  const targetSession = candidates.find((row) => row.session_id === sessionId);
  const revokedCount = await sessionsRepository.remove(sessionId);
  await recordRevocations(revokedCount && targetSession ? [targetSession] : [], {
    actorSession,
    currentSessionId,
    reason,
    scope: "single",
    targetUser,
    workspaceId,
  });
  return { revokedCount };
}

/** @param {SessionRevocationInput} input @returns {Promise<SessionRevocationResult>} */
async function revokeAllForUser({ actorSession = null, currentSessionId = "", reason, targetUser, workspaceId = "" }) {
  await sessionsRepository.removeExpired();
  const candidates = await sessionsRepository.listForUser(targetUser.user_id);
  const revokedCount = await sessionsRepository.removeAllForUser(targetUser.user_id);
  await recordRevocations(candidates.slice(0, revokedCount), {
    actorSession,
    currentSessionId,
    reason,
    scope: "all",
    targetUser,
    workspaceId,
  });
  return { revokedCount };
}

/** @param {RevokeAllForUserExceptInput} input @returns {Promise<SessionRevocationResult>} */
async function revokeAllForUserExcept({ actorSession = null, currentSessionId = "", preservedSessionId, reason, targetUser, workspaceId = "" }) {
  if (!preservedSessionId) {
    throw new AppError("The current session changed. Sign in and try again.", 409);
  }

  await sessionsRepository.removeExpired();
  const candidates = (await sessionsRepository.listForUser(targetUser.user_id))
    .filter((row) => row.session_id !== preservedSessionId);
  const revokedCount = await sessionsRepository.removeAllForUserExcept(targetUser.user_id, preservedSessionId);
  await recordRevocations(candidates.slice(0, revokedCount), {
    actorSession,
    currentSessionId,
    reason,
    scope: "all_except_current",
    targetUser,
    workspaceId,
  });
  return { revokedCount };
}

/** @param {WorkspaceRequestSession} session @param {string} userId @param {string} operation */
async function assertCanManageUserSessions(session, userId, operation) {
  await permissionsService.assertCan(session, "users.manage", {
    operation,
    workspace_id: session.workspace_id,
  });
  const targetUser = await usersRepository.readById(session.workspace_id, userId);
  if (!targetUser) {
    throw new AppError("User was not found.", 404);
  }
  assertPublicDemoVisitorIdentityMutable(targetUser.user_id);
  return targetUser;
}

/** @param {StoredSessionListRow[]} revokedSessions @param {SessionRevocationContext} context */
async function recordRevocations(revokedSessions, context) {
  if (!revokedSessions.length) {
    return;
  }

  const workspaceId = context.workspaceId || context.actorSession?.workspace_id || context.targetUser.home_workspace_id;
  const metadata = {
    reason: normalizeReason(context.reason),
    revocation_scope: context.scope,
    revoked_session_count: revokedSessions.length,
    target_user_id: context.targetUser.user_id,
  };

  for (let index = 0; index < revokedSessions.length; index += 1) {
    await internalEventBus.emit("security.session.revoked", {
      actorUserId: context.actorSession?.user_id,
      metadata: {
        ...metadata,
        revoked_session_index: index + 1,
        revoked_current_session: revokedSessions[index].session_id === context.currentSessionId,
      },
      recordId: context.targetUser.user_id,
      recordType: "user",
      session: context.actorSession,
      source: "security",
      workspaceId,
    });
  }

  await auditService.record({
    action: "security_session_revoked",
    changeType: "logout",
    force: true,
    metadata,
    newValue: { active_session_revoked: true },
    previousValue: { active_session_revoked: false },
    recordId: context.targetUser.user_id,
    recordLabel: context.targetUser.username,
    recordType: "user",
    recordUrl: "user-admin.html",
    session: context.actorSession,
    workspaceId: workspaceId || undefined,
  });
}

/** @param {StoredSessionListRow} row @param {string} currentSessionId */
function toManagedSession(row, currentSessionId) {
  return {
    sessionReference: createSessionReference(row.session_id),
    createdAt: row.created_at || "",
    expiresAt: row.expires_at,
    ipAddress: String(row.ip_address || "").slice(0, 128),
    isCurrent: row.session_id === currentSessionId,
  };
}

/** @param {SessionRevocationTargetUser & { display_name?: string | null }} user */
function toTargetUser(user) {
  return {
    displayName: user.display_name || user.username,
    userId: user.user_id,
    username: user.username,
  };
}

/** @param {string} sessionId */
function createSessionReference(sessionId) {
  return createHmac("sha256", SESSION_REFERENCE_SECRET)
    .update(String(sessionId || ""))
    .digest("base64url")
    .slice(0, 32);
}

/** @param {unknown} value */
function normalizeReference(value) {
  const reference = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{32}$/.test(reference)) {
    throw new AppError("Session was not found.", 404);
  }
  return reference;
}

/** @param {unknown} value */
function normalizeReason(value) {
  return String(value || "session_revoked")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 64) || "session_revoked";
}

export const sessionsService = {
  listManagedUserSessions,
  revokeAllForUser,
  revokeAllForUserExcept,
  revokeManagedSession,
  revokeManagedUserSessions,
  revokeSessionById,
};
