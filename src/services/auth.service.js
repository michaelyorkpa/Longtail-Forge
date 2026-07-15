import { usersRepository } from "../repositories/users.repo.js";
import { sessionsRepository } from "../repositories/sessions.repo.js";
import { userWorkspacesRepository } from "../repositories/user-workspaces.repo.js";
import { createSession, deleteSession } from "../security/sessions.js";
import {
  CURRENT_PASSWORD_HASH_POLICY,
  DUMMY_PASSWORD_HASH,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "../security/passwords.js";
import {
  AUTHENTICATION_THROTTLE_MESSAGE,
  authenticationThrottle,
  emitAuthenticationThrottleLockout,
} from "../security/auth-throttle.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { settingsService } from "./settings.service.js";
import { sessionsService } from "./sessions.service.js";
import {
  emitPasswordChangedSecurityEvent,
  emitPasswordRehashedSecurityEvent,
} from "../security/password-events.js";
import { securityEventsService } from "../security/security-events.js";
import { AppError } from "../utils/app-error.js";
import {
  normalizeBooleanPreference,
  normalizeOptionalEmail,
  normalizeThemeAutoSource,
  normalizeThemeMode,
  normalizeTimezone,
  normalizeUserStatus,
  normalizeUsername,
} from "../utils/normalizers.js";

const INVALID_LOGIN_MESSAGE = "Invalid email address or password.";
async function login(payload, context = {}) {
  const username = normalizeUsername(payload.username);
  const password = String(payload.password || "");

  if (!username || !password) {
    throw new AppError("Email address and password are required.", 400);
  }

  const user = await usersRepository.readByUsername(username);
  const passwordVerification = await verifyPassword(password, user?.password || DUMMY_PASSWORD_HASH);
  const passwordMatches = passwordVerification.matches;
  const throttleContext = {
    ipAddress: context.ipAddress,
    scope: "login",
    username,
  };
  const throttleStatus = authenticationThrottle.check(throttleContext);

  if (throttleStatus.blocked) {
    await recordLoginSecurityEvent({
      context,
      outcome: "blocked",
      reasonClass: "throttled",
      user,
      username,
    });
    throw new AppError(AUTHENTICATION_THROTTLE_MESSAGE, 429);
  }

  if (!user || !passwordMatches || normalizeUserStatus(user.user_status) !== "active") {
    const failure = authenticationThrottle.recordFailure(throttleContext);
    await emitAuthenticationThrottleLockout(throttleContext, failure);

    await recordLoginSecurityEvent({
      context,
      outcome: "failure",
      reasonClass: failure.blocked
        ? "throttled"
        : (!user || !passwordMatches ? "bad_credentials" : "inactive_user"),
      user,
      username,
    });

    if (failure.blocked) {
      throw new AppError(AUTHENTICATION_THROTTLE_MESSAGE, 429);
    }

    throw new AppError(INVALID_LOGIN_MESSAGE, 401);
  }

  authenticationThrottle.reset(throttleContext);

  const workspaceMemberships = await userWorkspacesRepository.readForUser(user.user_id);
  const activeWorkspaceId = resolveActiveWorkspaceId(user, workspaceMemberships);
  let passwordRehash = null;

  if (passwordVerification.needsRehash) {
    await usersRepository.updatePassword(activeWorkspaceId, user.user_id, await hashPassword(password), {
      passwordChangeRequired: normalizeBooleanPreference(user.password_change_required),
    });
    passwordRehash = {
      newAlgorithm: CURRENT_PASSWORD_HASH_POLICY.algorithm,
      previousAlgorithm: passwordVerification.algorithm,
      rehashReason: passwordVerification.rehashReason,
    };
  }

  const session = await createSession({
    ...user,
    active_workspace_id: activeWorkspaceId,
    ip_address: normalizeIpAddress(context.ipAddress),
  });
  const sessionContext = {
    workspace_id: activeWorkspaceId,
    active_workspace_id: activeWorkspaceId,
    user_id: user.user_id,
    username: user.username,
    timezone: normalizeTimezone(user.timezone),
    ip_address: normalizeIpAddress(context.ipAddress),
  };
  await recordAuditWithoutBlocking({
    workspaceId: activeWorkspaceId,
    actorUserId: user.user_id,
    actorUserName: user.username,
    action: "user_login",
    changeType: "login",
    recordType: "user",
    recordId: user.user_id,
    recordLabel: user.username,
    recordUrl: "user-settings.html",
    previousValue: null,
    newValue: { logged_in: true },
    metadata: {
      session_created: true,
    },
    ipAddress: normalizeIpAddress(context.ipAddress),
  });
  await recordLoginSecurityEvent({
    context,
    outcome: "success",
    reasonClass: "authenticated",
    user,
    username,
    workspaceId: activeWorkspaceId,
  });
  if (passwordRehash) {
    await emitPasswordRehashedSecurityEvent({
      ...passwordRehash,
      session: sessionContext,
      targetUser: user,
    });
  }

  return {
    session,
    themeMode: normalizeThemeMode(user.theme_mode),
    themeAutoSource: normalizeThemeAutoSource(user.theme_auto_source),
    user: {
      workspace_id: activeWorkspaceId,
      active_workspace_id: activeWorkspaceId,
      isSuperAdmin: await permissionsService.isSuperAdmin(sessionContext),
      workspaceContext: await settingsService.readWorkspaceBootstrap(sessionContext),
      workspaces: normalizeWorkspaceMemberships(workspaceMemberships),
      user_id: user.user_id,
      username: user.username,
      displayName: user.display_name || user.username,
      altEmail: normalizeOptionalEmail(user.alt_email),
      timezone: normalizeTimezone(user.timezone),
      themeMode: normalizeThemeMode(user.theme_mode),
      themeAutoSource: normalizeThemeAutoSource(user.theme_auto_source),
      passwordChangeRequired: normalizeBooleanPreference(user.password_change_required),
    },
  };
}

async function logout(sessionId, session = null) {
  await deleteSession(sessionId);

  if (session) {
    await recordAuditWithoutBlocking({
      session,
      action: "user_logout",
      changeType: "logout",
      recordType: "user",
      recordId: session.user_id,
      recordLabel: session.username,
      recordUrl: "user-settings.html",
      previousValue: { logged_in: true },
      newValue: { logged_in: false },
      metadata: {
        session_deleted: Boolean(sessionId),
      },
    });
    await securityEventsService.record({
      actorUserId: session.user_id,
      actorUserName: session.username,
      eventType: "security.authentication.logout",
      ipAddress: session.ip_address,
      outcome: "success",
      reasonClass: "logout",
      recordId: session.user_id,
      session,
      workspaceId: session.workspace_id,
    });
  }

  return { ok: true };
}

async function recordLoginSecurityEvent({ context, outcome, reasonClass, user, username, workspaceId }) {
  await securityEventsService.record({
    actorUserId: outcome === "success" ? user?.user_id : null,
    attemptedUsername: username,
    eventType: outcome === "success"
      ? "security.authentication.login_succeeded"
      : "security.authentication.login_failed",
    ipAddress: context.ipAddress,
    outcome,
    reasonClass,
    recordId: outcome === "success" ? user?.user_id : null,
    user,
    workspaceId: workspaceId || user?.home_workspace_id,
  });
}

async function recordAuditWithoutBlocking(event) {
  try {
    return await auditService.record(event);
  } catch {
    console.warn("[authentication] Audit persistence failed.");
    return null;
  }
}

async function readSession(session) {
  if (!session) {
    throw new AppError("Not logged in.", 401);
  }

  const workspaceMemberships = await userWorkspacesRepository.readForUser(session.user_id);
  const workspaceContext = await settingsService.readWorkspaceBootstrap(session);
  const user = await usersRepository.readById(session.home_workspace_id || session.workspace_id, session.user_id);

  return {
    user: {
      workspace_id: session.workspace_id,
      active_workspace_id: session.active_workspace_id || session.workspace_id,
      isSuperAdmin: await permissionsService.isSuperAdmin(session),
      workspaceContext,
      workspaces: normalizeWorkspaceMemberships(workspaceMemberships),
      user_id: session.user_id,
      username: session.username,
      timezone: normalizeTimezone(session.timezone),
      themeMode: normalizeThemeMode(user?.theme_mode),
      themeAutoSource: normalizeThemeAutoSource(user?.theme_auto_source),
      passwordChangeRequired: normalizeBooleanPreference(session.password_change_required),
    },
  };
}

async function switchWorkspace(sessionId, session, payload) {
  if (!session) {
    throw new AppError("Not logged in.", 401);
  }

  if (session.password_change_required) {
    throw new AppError("Change your password before continuing.", 403);
  }

  const workspaceId = String(payload.workspaceId || payload.workspace_id || "").trim();

  if (!workspaceId) {
    throw new AppError("Workspace is required.", 400);
  }

  const membership = await userWorkspacesRepository.readByUserAndWorkspace(session.user_id, workspaceId);

  if (!membership || membership.status !== "active") {
    throw new AppError("You cannot switch to that workspace.", 403);
  }

  await sessionsRepository.updateActiveWorkspace(sessionId, workspaceId);
  await usersRepository.updateActiveWorkspace(session.user_id, workspaceId);
  await auditService.record({
    session,
    action: "active_workspace_switched",
    changeType: "update",
    recordType: "workspace_membership",
    recordId: membership.user_workspace_id,
    recordLabel: session.username,
    recordUrl: "user-settings.html",
    previousValue: { active_workspace_id: session.active_workspace_id || session.workspace_id },
    newValue: { active_workspace_id: workspaceId },
    metadata: {
      workspace_id: workspaceId,
    },
  });

  return {
    ok: true,
    active_workspace_id: workspaceId,
  };
}

async function changePassword(payload, session, context = {}) {
  const currentPassword = String(payload.currentPassword || "");
  const newPassword = String(payload.newPassword || "");

  if (!currentPassword || !newPassword) {
    throw new AppError("Current password and new password are required.", 400);
  }

  const user = await usersRepository.readById(session.workspace_id, session.user_id);
  const throttleContext = {
    actorUserId: session.user_id,
    ipAddress: context.ipAddress || session.ip_address,
    scope: "password-change",
    username: session.username,
    workspaceId: session.workspace_id,
  };
  const currentPasswordVerification = user
    ? await verifyPassword(currentPassword, user.password)
    : { matches: false };
  const currentPasswordMatches = currentPasswordVerification.matches;
  const throttleStatus = authenticationThrottle.check(throttleContext);

  if (throttleStatus.blocked) {
    throw new AppError(AUTHENTICATION_THROTTLE_MESSAGE, 429);
  }

  if (!currentPasswordMatches) {
    const failure = authenticationThrottle.recordFailure(throttleContext);
    await emitAuthenticationThrottleLockout(throttleContext, failure);

    if (failure.blocked) {
      throw new AppError(AUTHENTICATION_THROTTLE_MESSAGE, 429);
    }

    throw new AppError("Current password is incorrect.", 400);
  }

  authenticationThrottle.reset(throttleContext);

  if ((await verifyPassword(newPassword, user.password)).matches) {
    throw new AppError("New password must be different from the current password.", 400);
  }

  const validation = validatePassword(newPassword, user.username);

  if (!validation.valid) {
    throw new AppError(`New password must ${validation.errors.join(", ")}.`, 400);
  }

  await usersRepository.updatePassword(session.workspace_id, user.user_id, await hashPassword(newPassword), {
    passwordChangeRequired: false,
  });
  const revocation = await sessionsService.revokeAllForUserExcept({
    actorSession: session,
    currentSessionId: context.currentSessionId,
    excludedSessionId: context.currentSessionId,
    reason: "password_changed",
    targetUser: user,
    workspaceId: session.workspace_id,
  });
  await auditService.record({
    session,
    action: "user_password_changed",
    changeType: "update",
    recordType: "user",
    recordId: user.user_id,
    recordLabel: user.username,
    recordUrl: "user-settings.html",
    previousValue: { password_changed_at: null },
    newValue: { password_changed_at: new Date().toISOString() },
    metadata: {
      changed_own_password: true,
      revoked_other_sessions: revocation.revokedCount,
      password_change_required: false,
    },
  });

  await emitPasswordChangedSecurityEvent({
    revokedSessionCount: revocation.revokedCount,
    session,
    targetUser: user,
  });

  return { ok: true, passwordChangeRequired: false, revokedSessions: revocation.revokedCount };
}

function normalizeWorkspaceMemberships(memberships) {
  return memberships
    .filter((membership) => membership.status === "active")
    .map((membership) => ({
      workspace_id: membership.workspace_id,
      workspaceName: membership.workspace_name,
      status: membership.status,
    }));
}

function normalizeIpAddress(value) {
  return String(value || "").replace(/^::ffff:/, "").trim().slice(0, 128);
}

function resolveActiveWorkspaceId(user, memberships) {
  const activeMemberships = memberships.filter((membership) => membership.status === "active");
  const preferredWorkspaceId = String(user.active_workspace_id || "").trim();

  if (activeMemberships.some((membership) => membership.workspace_id === preferredWorkspaceId)) {
    return preferredWorkspaceId;
  }

  if (activeMemberships.some((membership) => membership.workspace_id === user.home_workspace_id)) {
    return user.home_workspace_id;
  }

  return activeMemberships[0]?.workspace_id || user.home_workspace_id;
}

export const authService = {
  changePassword,
  login,
  logout,
  readSession,
  switchWorkspace,
};
