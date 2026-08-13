// @ts-check
import { usersRepository } from "../repositories/users.repo.js";
import { assertPublicDemoVisitorIdentityMutable } from "../core/public-demo-identities.js";
import { isPublicDemoVisitorIdentity } from "../core/public-demo-runtime.js";
import { sessionsRepository } from "../repositories/sessions.repo.js";
import { userWorkspacesRepository } from "../repositories/user-workspaces.repo.js";
import { accountExportRecoveryRepository } from "../repositories/account-export-recovery.repo.js";
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
import { userLandingService } from "./user-landing.service.js";
import { accountExportRecoveryService } from "./account-export-recovery.service.js";
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

/** @typedef {import("../types/http-contracts.js").RequestSession} RequestSession */
/** @typedef {RequestSession & { workspace_id: string }} WorkspaceRequestSession */
/** @typedef {NonNullable<Awaited<ReturnType<typeof usersRepository.readByUsername>>>} UserRecord */
/** @typedef {Awaited<ReturnType<typeof verifyPassword>>} PasswordVerification */
/** @typedef {{ newAlgorithm: string, previousAlgorithm: string, rehashReason: string | null }} PasswordRehash */
/** @typedef {import("../repositories/user-workspaces.repo.js").UserWorkspaceMembershipRow} UserWorkspaceMembershipRow */
/** @typedef {{ username?: unknown, password?: unknown, rememberMe?: unknown }} LoginPayload */
/** @typedef {{ workspaceId?: unknown, workspace_id?: unknown }} SwitchWorkspacePayload */
/** @typedef {{ currentPassword?: unknown, newPassword?: unknown }} ChangePasswordPayload */

const INVALID_LOGIN_MESSAGE = "These credentials do not have access to this installation.";

/** @param {unknown} rawPayload @param {{ ipAddress?: unknown, requestId?: unknown }} [context] */
async function login(rawPayload, context = {}) {
  const payload = /** @type {LoginPayload} */ (rawPayload && typeof rawPayload === "object" ? rawPayload : {});
  const rememberMe = readRememberMe(payload);
  const username = normalizeUsername(payload.username);
  const password = String(payload.password || "");

  if (!username || !password) {
    throw new AppError("Email address and password are required.", 400);
  }

  const user = await usersRepository.readByUsername(username);
  const throttleContext = {
    ipAddress: context.ipAddress,
    requestId: context.requestId,
    scope: "login",
    username,
  };
  const verificationAttempt = await authenticationThrottle.runWithVerificationAdmission(
    throttleContext,
    async () => {
      const passwordVerification = await verifyPassword(password, user?.password || DUMMY_PASSWORD_HASH);
      const passwordMatches = passwordVerification.matches;

      if (!user || !passwordMatches || normalizeUserStatus(user.user_status) !== "active") {
        const failure = await authenticationThrottle.recordFailure(throttleContext);
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

      await authenticationThrottle.reset(throttleContext);
      return passwordVerification;
    },
  );

  if (verificationAttempt.blocked) {
    await recordLoginSecurityEvent({
      context,
      outcome: "blocked",
      reasonClass: "throttled",
      user,
      username,
    });
    throw new AppError(AUTHENTICATION_THROTTLE_MESSAGE, 429);
  }
  if (!("value" in verificationAttempt)) {
    throw new AppError(AUTHENTICATION_THROTTLE_MESSAGE, 429);
  }

  const authenticatedUser = /** @type {UserRecord} */ (user);
  const passwordVerification = /** @type {PasswordVerification} */ (verificationAttempt.value);
  const publicDemoVisitor = isPublicDemoVisitorIdentity(authenticatedUser.user_id);
  const workspaceMemberships = await userWorkspacesRepository.readForUser(authenticatedUser.user_id);
  const activeWorkspaceId = resolveActiveWorkspaceId(authenticatedUser, workspaceMemberships);
  if (!activeWorkspaceId) {
    const qualification = await accountExportRecoveryRepository.readForUser(authenticatedUser.user_id);
    if (qualification && !publicDemoVisitor && !normalizeBooleanPreference(authenticatedUser.password_change_required)) {
      /** @type {PasswordRehash | null} */
      let passwordRehash = null;
      if (passwordVerification.needsRehash && !publicDemoVisitor) {
        await usersRepository.updatePasswordByUserId(authenticatedUser.user_id, await hashPassword(password), {
          passwordChangeRequired: false,
        });
        passwordRehash = {
          newAlgorithm: CURRENT_PASSWORD_HASH_POLICY.algorithm,
          previousAlgorithm: passwordVerification.algorithm,
          rehashReason: passwordVerification.rehashReason,
        };
      }
      await accountExportRecoveryService.assertEligible(authenticatedUser.user_id);
      const session = await createSession({
        ...authenticatedUser,
        active_workspace_id: null,
        home_workspace_id: null,
        ip_address: normalizeIpAddress(context.ipAddress),
        session_mode: "account_export_recovery",
      }, { rememberMe });
      await recordLoginSecurityEvent({
        context,
        outcome: "success",
        reasonClass: "account_export_recovery",
        user: authenticatedUser,
        username,
      });
      if (passwordRehash) {
        await emitPasswordRehashedSecurityEvent({
          ...passwordRehash,
          session: {
            user_id: authenticatedUser.user_id,
            username: authenticatedUser.username,
            timezone: normalizeTimezone(authenticatedUser.timezone),
            ip_address: normalizeIpAddress(context.ipAddress),
          },
          targetUser: authenticatedUser,
        });
      }
      return {
        session,
        themeMode: normalizeThemeMode(authenticatedUser.theme_mode),
        themeAutoSource: normalizeThemeAutoSource(authenticatedUser.theme_auto_source),
        user: {
          displayName: authenticatedUser.display_name || authenticatedUser.username,
          username: authenticatedUser.username,
          timezone: normalizeTimezone(authenticatedUser.timezone),
          themeMode: normalizeThemeMode(authenticatedUser.theme_mode),
          themeAutoSource: normalizeThemeAutoSource(authenticatedUser.theme_auto_source),
          recoveryMode: "account_export",
          loginLandingPath: "/account-recovery.html",
        },
      };
    }
    await recordLoginSecurityEvent({
      context,
      outcome: "failure",
      reasonClass: "no_active_workspace",
      user: authenticatedUser,
      username,
    });
    throw new AppError(INVALID_LOGIN_MESSAGE, 401);
  }
  await accountExportRecoveryRepository.clear(authenticatedUser.user_id);
  /** @type {PasswordRehash | null} */
  let passwordRehash = null;

  if (passwordVerification.needsRehash && !publicDemoVisitor) {
    await usersRepository.updatePassword(activeWorkspaceId, authenticatedUser.user_id, await hashPassword(password), {
      passwordChangeRequired: normalizeBooleanPreference(authenticatedUser.password_change_required),
    });
    passwordRehash = {
      newAlgorithm: CURRENT_PASSWORD_HASH_POLICY.algorithm,
      previousAlgorithm: passwordVerification.algorithm,
      rehashReason: passwordVerification.rehashReason,
    };
  }

  const session = await createSession({
    ...authenticatedUser,
    active_workspace_id: activeWorkspaceId,
    ip_address: normalizeIpAddress(context.ipAddress),
  }, { rememberMe });
  /** @type {WorkspaceRequestSession} */
  const sessionContext = {
    workspace_id: activeWorkspaceId,
    active_workspace_id: activeWorkspaceId,
    home_workspace_id: authenticatedUser.home_workspace_id || activeWorkspaceId,
    user_id: authenticatedUser.user_id,
    username: authenticatedUser.username,
    timezone: normalizeTimezone(authenticatedUser.timezone),
    ip_address: normalizeIpAddress(context.ipAddress),
    password_change_required: normalizeBooleanPreference(authenticatedUser.password_change_required),
    session_mode: "normal",
  };
  await recordAuditWithoutBlocking({
    workspaceId: activeWorkspaceId,
    actorUserId: authenticatedUser.user_id,
    actorUserName: authenticatedUser.username,
    action: "user_login",
    changeType: "login",
    recordType: "user",
    recordId: authenticatedUser.user_id,
    recordLabel: authenticatedUser.username,
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
    user: authenticatedUser,
    username,
    workspaceId: activeWorkspaceId,
  });
  if (passwordRehash) {
    await emitPasswordRehashedSecurityEvent({
      ...passwordRehash,
      session: sessionContext,
      targetUser: authenticatedUser,
    });
  }

  return {
    session,
    themeMode: normalizeThemeMode(authenticatedUser.theme_mode),
    themeAutoSource: normalizeThemeAutoSource(authenticatedUser.theme_auto_source),
    user: {
      workspace_id: activeWorkspaceId,
      active_workspace_id: activeWorkspaceId,
      isSuperAdmin: await permissionsService.isSuperAdmin(sessionContext),
      workspaceContext: await settingsService.readWorkspaceBootstrap(sessionContext),
      workspaces: normalizeWorkspaceMemberships(workspaceMemberships),
      user_id: authenticatedUser.user_id,
      username: authenticatedUser.username,
      displayName: authenticatedUser.display_name || authenticatedUser.username,
      altEmail: normalizeOptionalEmail(authenticatedUser.alt_email),
      timezone: normalizeTimezone(authenticatedUser.timezone),
      themeMode: normalizeThemeMode(authenticatedUser.theme_mode),
      themeAutoSource: normalizeThemeAutoSource(authenticatedUser.theme_auto_source),
      passwordChangeRequired: normalizeBooleanPreference(authenticatedUser.password_change_required),
      loginLandingPath: await userLandingService.resolvePreferredLanding(
        sessionContext,
        authenticatedUser.preferred_login_landing,
      ),
    },
  };
}

/** @param {string} sessionId @param {import("../types/http-contracts.js").LogoutSession | null} [session] */
async function logout(sessionId, session = null) {
  await deleteSession(sessionId);

  if (session) {
    if (session.workspace_id) {
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
    }
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

/**
 * @param {{ context: { ipAddress?: unknown, requestId?: unknown }, outcome: string, reasonClass: string, user: UserRecord | null, username: string, workspaceId?: string | null }} input
 */
async function recordLoginSecurityEvent({ context, outcome, reasonClass, user, username, workspaceId }) {
  await securityEventsService.record({
    actorUserId: outcome === "success" ? user?.user_id : null,
    attemptedUsername: username,
    eventType: outcome === "success"
      ? "security.authentication.login_succeeded"
      : "security.authentication.login_failed",
    ipAddress: context.ipAddress,
    metadata: { request_id: context.requestId },
    outcome,
    reasonClass,
    recordId: outcome === "success" ? user?.user_id : null,
    user,
    workspaceId: workspaceId || user?.home_workspace_id,
  });
}

/** @param {Record<string, unknown>} event */
async function recordAuditWithoutBlocking(event) {
  try {
    return await auditService.record(event);
  } catch {
    console.warn("[authentication] Audit persistence failed.");
    return null;
  }
}

/** @param {RequestSession | null} session */
async function readSession(session) {
  if (!session) {
    throw new AppError("Not logged in.", 401);
  }

  if (session.session_mode === "account_export_recovery") {
    const user = await accountExportRecoveryService.assertEligible(session.user_id);
    return {
      user: {
        displayName: user.display_name || user.username,
        username: user.username,
        timezone: normalizeTimezone(user.timezone),
        themeMode: normalizeThemeMode(user.theme_mode),
        themeAutoSource: normalizeThemeAutoSource(user.theme_auto_source),
        recoveryMode: "account_export",
        loginLandingPath: "/account-recovery.html",
      },
    };
  }

  if (session.support_view) {
    return {
      user: {
        user_id: session.actor_user_id,
        username: session.actor_username,
        workspace_id: session.effective_workspace_id,
        active_workspace_id: session.effective_workspace_id,
        supportView: { ...session.support_view },
      },
    };
  }

  const workspaceSession = /** @type {WorkspaceRequestSession} */ (session);
  const workspaceMemberships = await userWorkspacesRepository.readForUser(workspaceSession.user_id);
  const workspaceContext = await settingsService.readWorkspaceBootstrap(workspaceSession);
  const user = await usersRepository.readById(
    workspaceSession.home_workspace_id || workspaceSession.workspace_id,
    workspaceSession.user_id,
  );

  return {
    user: {
      workspace_id: workspaceSession.workspace_id,
      active_workspace_id: workspaceSession.active_workspace_id || workspaceSession.workspace_id,
      isSuperAdmin: await permissionsService.isSuperAdmin(workspaceSession),
      workspaceContext,
      workspaces: normalizeWorkspaceMemberships(workspaceMemberships),
      user_id: workspaceSession.user_id,
      username: workspaceSession.username,
      timezone: normalizeTimezone(workspaceSession.timezone),
      themeMode: normalizeThemeMode(user?.theme_mode),
      themeAutoSource: normalizeThemeAutoSource(user?.theme_auto_source),
      passwordChangeRequired: normalizeBooleanPreference(workspaceSession.password_change_required),
      loginLandingPath: await userLandingService.resolvePreferredLanding(
        workspaceSession,
        user?.preferred_login_landing,
      ),
    },
  };
}

/** @param {string} sessionId @param {RequestSession | null} session @param {unknown} rawPayload */
async function switchWorkspace(sessionId, session, rawPayload) {
  const payload = /** @type {SwitchWorkspacePayload} */ (rawPayload && typeof rawPayload === "object" ? rawPayload : {});
  if (!session) {
    throw new AppError("Not logged in.", 401);
  }

  if (session.session_mode === "account_export_recovery") {
    throw new AppError("Only account export and logout are available in recovery mode.", 403);
  }

  if (session.support_view) {
    throw new AppError("End Support View before switching workspaces.", 409);
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
  const user = await usersRepository.readFirstByUserId(session.user_id);
  const targetSession = {
    ...session,
    workspace_id: workspaceId,
    active_workspace_id: workspaceId,
  };
  await auditService.record({
    session: targetSession,
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
    landingPath: await userLandingService.resolvePreferredLanding(
      targetSession,
      user?.preferred_workspace_switch_landing,
    ),
  };
}

/** @param {unknown} rawPayload @param {WorkspaceRequestSession} session @param {{ currentSessionId?: string, ipAddress?: unknown }} [context] */
async function changePassword(rawPayload, session, context = {}) {
  const payload = /** @type {ChangePasswordPayload} */ (rawPayload && typeof rawPayload === "object" ? rawPayload : {});
  assertPublicDemoVisitorIdentityMutable(session.user_id);
  const currentSessionId = String(context.currentSessionId || "").trim();
  if (!currentSessionId) {
    throw new AppError("The current session changed. Sign in and try again.", 409);
  }
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
  const throttleStatus = await authenticationThrottle.check(throttleContext);

  if (throttleStatus.blocked) {
    throw new AppError(AUTHENTICATION_THROTTLE_MESSAGE, 429);
  }

  if (!currentPasswordMatches) {
    const failure = await authenticationThrottle.recordFailure(throttleContext);
    await emitAuthenticationThrottleLockout(throttleContext, failure);

    if (failure.blocked) {
      throw new AppError(AUTHENTICATION_THROTTLE_MESSAGE, 429);
    }

    throw new AppError("Current password is incorrect.", 400);
  }

  await authenticationThrottle.reset(throttleContext);
  const authenticatedUser = /** @type {UserRecord} */ (user);

  if ((await verifyPassword(newPassword, authenticatedUser.password)).matches) {
    throw new AppError("New password must be different from the current password.", 400);
  }

  const validation = validatePassword(newPassword, authenticatedUser.username);

  if (!validation.valid) {
    throw new AppError(`New password must ${validation.errors.join(", ")}.`, 400);
  }

  await usersRepository.updatePassword(session.workspace_id, authenticatedUser.user_id, await hashPassword(newPassword), {
    passwordChangeRequired: false,
  });
  const revocation = await sessionsService.revokeAllForUserExcept({
    actorSession: session,
    currentSessionId,
    preservedSessionId: currentSessionId,
    reason: "password_changed",
    targetUser: authenticatedUser,
    workspaceId: session.workspace_id,
  });
  await auditService.record({
    session,
    action: "user_password_changed",
    changeType: "update",
    recordType: "user",
    recordId: authenticatedUser.user_id,
    recordLabel: authenticatedUser.username,
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
    targetUser: authenticatedUser,
  });

  return { ok: true, passwordChangeRequired: false, revokedSessions: revocation.revokedCount };
}

/** @param {UserWorkspaceMembershipRow[]} memberships */
function normalizeWorkspaceMemberships(memberships) {
  return memberships
    .filter((/** @type {{ status: string; }} */ membership) => membership.status === "active")
    .map((membership) => ({
      workspace_id: membership.workspace_id,
      workspaceName: membership.workspace_name,
      status: membership.status,
    }));
}

/**
 * @param {unknown} value
 */
function normalizeIpAddress(value) {
  return String(value || "").replace(/^::ffff:/, "").trim().slice(0, 128);
}

/** @param {LoginPayload} payload */
function readRememberMe(payload) {
  if (!Object.hasOwn(payload || {}, "rememberMe")) {
    return false;
  }

  if (typeof payload.rememberMe !== "boolean") {
    throw new AppError("Remember me must be a boolean.", 400);
  }

  return payload.rememberMe;
}

/** @param {UserRecord} user @param {UserWorkspaceMembershipRow[]} memberships */
function resolveActiveWorkspaceId(user, memberships) {
  const activeMemberships = memberships.filter((membership) => membership.status === "active");
  const preferredWorkspaceId = String(user.active_workspace_id || "").trim();

  if (activeMemberships.some((/** @type {{ workspace_id: string; }} */ membership) => membership.workspace_id === preferredWorkspaceId)) {
    return preferredWorkspaceId;
  }

  if (activeMemberships.some((membership) => membership.workspace_id === user.home_workspace_id)) {
    return user.home_workspace_id;
  }

  return activeMemberships[0]?.workspace_id || null;
}

export const authService = {
  changePassword,
  login,
  logout,
  readSession,
  switchWorkspace,
};
