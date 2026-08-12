// @ts-check
import { usersRepository } from "../repositories/users.repo.js";
import { assertPublicDemoVisitorIdentityMutable } from "../core/public-demo-identities.js";
import { assertPublicDemoCapabilityAllowed } from "../core/public-demo-enforcement.js";
import { sessionsRepository } from "../repositories/sessions.repo.js";
import { appSettingsRepository } from "../repositories/app-settings.repo.js";
import { settingsRepository } from "../repositories/settings.repo.js";
import { userWorkspacesRepository } from "../repositories/user-workspaces.repo.js";
import { accountExportRecoveryRepository } from "../repositories/account-export-recovery.repo.js";
import { workspacesRepository } from "../repositories/workspaces.repo.js";
import { modulesService } from "../core/modules/modules.service.js";
import { config } from "../config.js";
import { createGeneratedPassword, hashPassword, validatePassword } from "../security/passwords.js";
import {
  AUTHENTICATION_THROTTLE_MESSAGE,
  authenticationThrottle,
  emitAuthenticationThrottleLockout,
} from "../security/auth-throttle.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { sessionsService } from "./sessions.service.js";
import { emitPasswordResetSecurityEvent } from "../security/password-events.js";
import { securityEventsService } from "../security/security-events.js";
import { AppError } from "../utils/app-error.js";
import {
  getWorkspaceCapabilities,
  normalizeWorkspaceType,
} from "../utils/workspaces.js";
import {
  isValidEmail,
  isValidTimezone,
  normalizeBooleanPreference,
  normalizeCalendarViewPreference,
  normalizeDisplayName,
  normalizeOptionalEmail,
  normalizeProtectedUserFlag,
  normalizeThemeAutoSource,
  normalizeThemeMode,
  normalizeTimezone,
  normalizeUserLandingPage,
  normalizeUsername,
  userRowToAppValue,
} from "../utils/normalizers.js";

/** @typedef {import("../types/users-service-contracts.js").AssignableWorkspaceRow} AssignableWorkspaceRow */
/** @typedef {import("../types/users-service-contracts.js").CreatedWorkspace} CreatedWorkspace */
/** @typedef {import("../types/users-service-contracts.js").DecoratedUser} DecoratedUser */
/** @typedef {import("../types/users-service-contracts.js").EnsureWorkspaceInput} EnsureWorkspaceInput */
/** @typedef {import("../types/users-service-contracts.js").ModuleStatusChange} ModuleStatusChange */
/** @typedef {import("../types/users-service-contracts.js").OwnerTransferCandidate} OwnerTransferCandidate */
/** @typedef {import("../types/users-service-contracts.js").ReplaceMembershipsInput} ReplaceMembershipsInput */
/** @typedef {import("../types/users-service-contracts.js").RetireAccountInput} RetireAccountInput */
/** @typedef {import("../types/users-service-contracts.js").UserActionInput} UserActionInput */
/** @typedef {import("../types/users-service-contracts.js").UserListResult} UserListResult */
/** @typedef {import("../types/users-service-contracts.js").UserMutationResult} UserMutationResult */
/** @typedef {import("../types/users-service-contracts.js").UserPayload} UserPayload */
/** @typedef {import("../types/users-service-contracts.js").UserProfile} UserProfile */
/** @typedef {import("../types/users-service-contracts.js").UserRow} UserRow */
/** @typedef {import("../types/users-service-contracts.js").UserServiceContext} UserServiceContext */
/** @typedef {import("../types/users-service-contracts.js").UsersRequestSession} UsersRequestSession */
/** @typedef {import("../types/users-service-contracts.js").UserValue} UserValue */
/** @typedef {import("../types/users-service-contracts.js").UserWorkspaceMembershipRow} UserWorkspaceMembershipRow */
/** @typedef {import("../types/users-service-contracts.js").WorkspaceCreationModuleDefinition} WorkspaceCreationModuleDefinition */
/** @typedef {import("../types/users-service-contracts.js").WorkspaceCreationOptions} WorkspaceCreationOptions */
/** @typedef {import("../types/users-service-contracts.js").WorkspaceMembershipAuditInput} WorkspaceMembershipAuditInput */
/** @typedef {import("../types/users-service-contracts.js").WorkspaceMembershipRow} WorkspaceMembershipRow */
/** @typedef {import("../types/users-service-contracts.js").WorkspaceOwnershipInput} WorkspaceOwnershipInput */
/** @typedef {import("../types/users-service-contracts.js").WorkspaceValue} WorkspaceValue */
/** @typedef {Record<string, unknown>} JsonObject */

/** @param {UsersRequestSession} session @returns {Promise<UserListResult>} */
async function list(session) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "read" });
  return {
    currentUserId: session.user_id,
    users: await readUsersWithMemberships(session),
  };
}

/** @param {UsersRequestSession} session */
async function listPermissionResources(session) {
  await permissionsService.assertCan(session, "users.manage", {
    workspace_id: session.workspace_id,
    operation: "read",
  });

  return {
    resources: await modulesService.listActiveResourceDefinitions(session.workspace_id, session),
  };
}

/** @param {UsersRequestSession} session @returns {Promise<{ workspaces: WorkspaceValue[] }>} */
async function listWorkspaces(session) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "read" });

  return {
    workspaces: await readAssignableWorkspaces(session),
  };
}

/** @param {UsersRequestSession} session @param {unknown} [requestedWorkspaceId] */
async function readAddUserOptions(session, requestedWorkspaceId = "") {
  assertPublicDemoCapabilityAllowed("administration.accounts");
  const { targetSession, workspace, workspaces } = await resolveAddUserWorkspace(
    session,
    requestedWorkspaceId,
    "create",
  );
  const roleOptions = await permissionsService.listAssignableRoleOptions(targetSession);

  return {
    canAddUsers: workspace.workspaceType !== "personal",
    roles: roleOptions.roles,
    selectedWorkspaceId: workspace.workspaceId,
    workspace,
    workspaces,
  };
}

/** @param {UserPayload} payload @param {UsersRequestSession} session */
async function lookupAddUserAccount(payload, session) {
  assertPublicDemoCapabilityAllowed("administration.accounts");
  const username = normalizeCreateUsername(payload.username);
  const { targetSession, workspace } = await resolveAddUserWorkspace(
    session,
    payload.workspaceId || payload.workspace_id,
    "create",
  );
  await assertWorkspaceCanAddUser(targetSession);
  const existingUser = await usersRepository.readByUsername(username);

  if (!existingUser) {
    return {
      match: null,
      workspaceId: workspace.workspaceId,
    };
  }

  const membership = await userWorkspacesRepository.readByUserAndWorkspace(
    existingUser.user_id,
    workspace.workspaceId,
  );

  return {
    match: {
      alreadyActive: membership?.status === "active",
      displayName: normalizeDisplayName(existingUser.display_name, existingUser.username),
      username: existingUser.username,
    },
    workspaceId: workspace.workspaceId,
  };
}

/** @param {UserPayload} payload @param {UsersRequestSession} session */
async function create(payload, session) {
  assertPublicDemoCapabilityAllowed("administration.accounts");
  const { targetSession, workspace } = await resolveAddUserWorkspace(
    session,
    payload.workspaceId || payload.workspace_id,
    "create",
  );
  const username = normalizeCreateUsername(payload.username);
  const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];
  await assertWorkspaceCanAddUser(targetSession);
  if (assignments.length > 0) {
    await permissionsService.validateUserAssignments(targetSession, assignments);
  }

  const existingUser = await usersRepository.readByUsername(username);
  const previousMembership = existingUser
    ? await userWorkspacesRepository.readByUserAndWorkspace(existingUser.user_id, workspace.workspaceId)
    : null;

  if (previousMembership?.status === "active") {
    throw new AppError("That account already belongs to the selected workspace.", 409);
  }

  let accountCreated = false;
  let initialPassword = "";
  let user;

  if (existingUser) {
    user = userRowToAppValue(existingUser);
  } else {
    initialPassword = createGeneratedPassword();
    const validation = validatePassword(initialPassword, username);

    if (!validation.valid) {
      throw new AppError("Generated password did not meet password requirements.", 500);
    }

    user = await usersRepository.create(
      workspace.workspaceId,
      {
        username,
        displayName: normalizeDisplayName(payload.displayName, username),
        altEmail: normalizeOptionalEmail(payload.altEmail),
        timezone: normalizeTimezone(payload.timezone),
      },
      await hashPassword(initialPassword),
    );
    accountCreated = true;
  }

  const previousActiveMemberships = existingUser
    ? await userWorkspacesRepository.readActiveForUser(user.user_id)
    : [];
  const membership = await userWorkspacesRepository.upsert({
    userId: user.user_id,
    workspaceId: workspace.workspaceId,
    status: "active",
  });

  if (existingUser && previousActiveMemberships.length === 0) {
    await usersRepository.updateActiveWorkspace(user.user_id, workspace.workspaceId);
    await sessionsRepository.updateActiveWorkspaceForUser(user.user_id, workspace.workspaceId);
  }

  if (accountCreated) {
    await auditService.record({
      session: targetSession,
      action: "user_created",
      changeType: "create",
      recordType: "user",
      recordId: user.user_id,
      recordLabel: user.username,
      recordUrl: "user-admin.html",
      previousValue: null,
      newValue: user,
      metadata: {
        created_user_id: user.user_id,
        created_username: user.username,
      },
    });
  }
  await recordWorkspaceMembershipChange({
    session: targetSession,
    action: previousMembership ? "workspace_membership_reactivated" : "workspace_membership_added",
    changeType: previousMembership ? "restore" : "create",
    user,
    previousValue: previousMembership,
    newValue: membership,
  });

  if (assignments.length > 0) {
    await permissionsService.replaceUserAssignments(targetSession, user.user_id, {
      assignments,
    });
  }

  const users = await readUsersWithMemberships(session);

  return {
    accountCreated,
    user: await decorateUserForWorkspace(user, workspace.workspaceId),
    users,
    initialPassword,
  };
}

/** @param {UserActionInput} input */
async function action({ payload = {}, session, userId, action: userAction, context = {} }) {
  if (!userId || !userAction) {
    throw new AppError("User action was not found.", 404);
  }

  if (userAction === "reset-password") {
    return resetPassword(session, userId, context);
  }

  if (userAction === "update") {
    return update(payload, session, userId);
  }

  if (userAction === "deactivate") {
    return deactivate(session, userId, context);
  }

  if (userAction === "reactivate") {
    return reactivate(session, userId);
  }

  throw new AppError("User action was not found.", 404);
}

/** @param {UserPayload} payload @param {UsersRequestSession} session @param {string} userId @returns {Promise<UserMutationResult>} */
async function update(payload, session, userId) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "update" });
  const user = await usersRepository.readById(session.workspace_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  const profile = normalizeUserProfilePayload(payload, user);
  if (
    profile.username !== normalizeUsername(user.username)
    || profile.altEmail !== normalizeOptionalEmail(user.alt_email)
    || Object.hasOwn(payload, "workspaceMemberships")
  ) {
    assertPublicDemoVisitorIdentityMutable(userId);
  }

  const existingUser = await usersRepository.readByUsernameExcludingUser(profile.username, userId);

  if (existingUser && existingUser.user_id !== userId) {
    throw new AppError("A user with that email address already exists.", 409);
  }

  await usersRepository.updateProfile(session.workspace_id, userId, profile);
  await sessionsRepository.updateUsernameForUser(session.workspace_id, userId, profile.username);
  await sessionsRepository.updateTimezoneForUser(session.workspace_id, userId, profile.timezone);
  const updatedUser = {
    ...userRowToAppValue(user),
    username: profile.username,
    displayName: profile.displayName,
    altEmail: profile.altEmail,
    timezone: profile.timezone,
  };

  await auditService.record({
    session,
    action: "user_profile_updated",
    changeType: "update",
    recordType: "user",
    recordId: userId,
    recordLabel: profile.username,
    recordUrl: "user-admin.html",
    previousValue: userRowToAppValue(user),
    newValue: updatedUser,
    metadata: {
      old_username: user.username,
      new_username: profile.username,
      old_display_name: user.display_name,
      new_display_name: profile.displayName,
      old_alt_email: user.alt_email,
      new_alt_email: profile.altEmail,
      old_timezone: user.timezone,
      new_timezone: profile.timezone,
    },
  });

  if (Object.hasOwn(payload, "workspaceMemberships")) {
    await replaceWorkspaceMemberships({
      session,
      user: updatedUser,
      requestedWorkspaceIds: payload.workspaceMemberships || [],
    });
  }

  return {
    user: await decorateUserWithMemberships(updatedUser),
    users: await readUsersWithMemberships(session),
  };
}

/** @param {UsersRequestSession} session @param {string} userId @param {UserServiceContext} [context] */
async function resetPassword(session, userId, context = {}) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "update" });
  const user = await usersRepository.readById(session.workspace_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  assertPublicDemoVisitorIdentityMutable(userId);

  const throttleContext = {
    actorUserId: session.user_id,
    ipAddress: context.ipAddress || session.ip_address,
    scope: "admin-password-reset",
    username: user.username,
    workspaceId: session.workspace_id,
  };

  if ((await authenticationThrottle.check(throttleContext)).blocked) {
    throw new AppError(AUTHENTICATION_THROTTLE_MESSAGE, 429);
  }

  const initialPassword = createGeneratedPassword();
  const validation = validatePassword(initialPassword, user.username);

  if (!validation.valid) {
    throw new AppError("Generated password did not meet password requirements.", 500);
  }

  await usersRepository.updatePassword(session.workspace_id, userId, await hashPassword(initialPassword), {
    passwordChangeRequired: true,
  });
  const revocation = await sessionsService.revokeAllForUser({
    actorSession: session,
    currentSessionId: context.currentSessionId,
    reason: "password_reset",
    targetUser: user,
    workspaceId: session.workspace_id,
  });
  await auditService.record({
    session,
    action: "user_password_reset",
    changeType: "update",
    recordType: "user",
    recordId: userId,
    recordLabel: user.username,
    recordUrl: "user-admin.html",
    previousValue: { password_reset_at: null },
    newValue: { password_reset_at: new Date().toISOString() },
    metadata: {
      reset_user_id: userId,
      reset_username: user.username,
      revoked_sessions: revocation.revokedCount,
      password_change_required: true,
    },
  });
  await emitPasswordResetSecurityEvent({
    revokedSessionCount: revocation.revokedCount,
    session,
    targetUser: user,
  });
  const throttleResult = await authenticationThrottle.recordSensitiveAction(throttleContext);
  await emitAuthenticationThrottleLockout(throttleContext, throttleResult);

  return {
    user: {
      ...userRowToAppValue(user),
      passwordChangeRequired: true,
    },
    users: await readUsersWithMemberships(session),
    initialPassword,
  };
}

/** @param {UsersRequestSession} session @param {string} userId @param {UserServiceContext} [context] @returns {Promise<UserMutationResult>} */
async function deactivate(session, userId, context = {}) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "update" });
  const user = await usersRepository.readById(session.workspace_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  assertPublicDemoVisitorIdentityMutable(userId);

  if (normalizeProtectedUserFlag(user.protected_user)) {
    throw new AppError("Protected users cannot be deactivated.", 400);
  }

  await transferOrBlockWorkspaceOwnership({
    session,
    workspaceId: session.workspace_id,
    ownerUserId: userId,
    action: "deactivate",
  });

  await usersRepository.updateStatus(session.workspace_id, userId, "inactive");
  const revocation = await sessionsService.revokeAllForUser({
    actorSession: session,
    currentSessionId: context.currentSessionId,
    reason: "user_deactivated",
    targetUser: user,
    workspaceId: session.workspace_id,
  });
  const previousMembership = await userWorkspacesRepository.readByUserAndWorkspace(userId, session.workspace_id);
  const nextMembership = await userWorkspacesRepository.updateStatus(userId, session.workspace_id, "inactive");
  await reconcilePrivateCalendarSubscriptions(session.workspace_id, userId, session);
  const updatedUser = {
    ...userRowToAppValue(user),
    userStatus: "inactive",
  };

  await auditService.record({
    session,
    action: "user_deactivated",
    changeType: "archive",
    recordType: "user",
    recordId: userId,
    recordLabel: user.username,
    recordUrl: "user-admin.html",
    previousValue: userRowToAppValue(user),
    newValue: updatedUser,
    metadata: {
      old_status: user.user_status,
      new_status: "inactive",
      revoked_sessions: revocation.revokedCount,
    },
  });
  await securityEventsService.record({
    actorUserId: session.user_id,
    actorUserName: session.username,
    eventType: "security.user.deactivated",
    ipAddress: session.ip_address,
    metadata: {
      revoked_session_count: revocation.revokedCount,
      target_user_id: userId,
    },
    outcome: "success",
    reasonClass: "user_deactivated",
    recordId: userId,
    session,
    workspaceId: session.workspace_id,
  });
  await recordWorkspaceMembershipChange({
    session,
    action: "workspace_membership_deactivated",
    changeType: "archive",
    user: updatedUser,
    previousValue: previousMembership,
    newValue: nextMembership,
  });

  return {
    user: updatedUser,
    users: await readUsersWithMemberships(session),
  };
}

/** @param {UsersRequestSession} session @param {string} userId @returns {Promise<UserMutationResult>} */
async function reactivate(session, userId) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "update" });
  const user = await usersRepository.readById(session.workspace_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  assertPublicDemoVisitorIdentityMutable(userId);

  await usersRepository.updateStatus(session.workspace_id, userId, "active");
  const previousMembership = await userWorkspacesRepository.readByUserAndWorkspace(userId, session.workspace_id);
  const nextMembership = await userWorkspacesRepository.upsert({
    userId,
    workspaceId: session.workspace_id,
    status: "active",
  });
  const updatedUser = {
    ...userRowToAppValue(user),
    userStatus: "active",
  };

  await auditService.record({
    session,
    action: "user_reactivated",
    changeType: "restore",
    recordType: "user",
    recordId: userId,
    recordLabel: user.username,
    recordUrl: "user-admin.html",
    previousValue: userRowToAppValue(user),
    newValue: updatedUser,
    metadata: {
      old_status: user.user_status,
      new_status: "active",
    },
  });
  await recordWorkspaceMembershipChange({
    session,
    action: "workspace_membership_reactivated",
    changeType: "restore",
    user: updatedUser,
    previousValue: previousMembership,
    newValue: nextMembership,
  });

  return {
    user: updatedUser,
    users: await readUsersWithMemberships(session),
  };
}

/** @param {UsersRequestSession} session @param {string} userId @param {UserServiceContext} [context] */
async function remove(session, userId, context = {}) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "delete" });
  if (!userId) {
    throw new AppError("User was not found.", 404);
  }

  if (userId === session.user_id) {
    throw new AppError("Delete your own account from User Settings.", 400);
  }

  const user = await usersRepository.readById(session.workspace_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  assertPublicDemoVisitorIdentityMutable(userId);

  if (normalizeProtectedUserFlag(user.protected_user)) {
    throw new AppError("Protected users cannot be deleted.", 400);
  }

  const exportRecoveryEligible = await accountExportRecoveryRepository.recordWorkspaceAccessLoss({
    source: "membership_loss",
    userId,
    workspaceId: session.workspace_id,
  });
  await transferOrBlockWorkspaceOwnership({
    session,
    workspaceId: session.workspace_id,
    ownerUserId: userId,
    action: "remove",
  });
  const previousMembership = await userWorkspacesRepository.readByUserAndWorkspace(userId, session.workspace_id);
  const nextMembership = await userWorkspacesRepository.deactivateAccess(userId, session.workspace_id);
  await reconcilePrivateCalendarSubscriptions(session.workspace_id, userId, session);
  const activeMemberships = await userWorkspacesRepository.readActiveForUser(userId);

  if (activeMemberships.length === 0) {
    if (exportRecoveryEligible) {
      const revocation = await sessionsService.revokeAllForUser({
        actorSession: session,
        currentSessionId: context.currentSessionId,
        reason: "account_export_recovery_qualified",
        targetUser: user,
        workspaceId: session.workspace_id,
      });
      await usersRepository.clearWorkspaceReferences(userId, session.workspace_id);
      await auditService.record({
        session,
        action: "user_removed_to_account_export_recovery",
        changeType: "archive",
        recordType: "user",
        recordId: userId,
        recordLabel: user.username,
        recordUrl: "user-admin.html",
        previousValue: userRowToAppValue(user),
        newValue: userRowToAppValue(user),
        metadata: {
          attribution_retained: true,
          portable_account_export_only: true,
          revoked_sessions: revocation.revokedCount,
        },
      });
      await recordWorkspaceMembershipChange({
        session,
        action: "workspace_membership_deactivated",
        changeType: "archive",
        user: userRowToAppValue(user),
        previousValue: previousMembership,
        newValue: nextMembership,
      });
    } else {
      await retireAccount({
        actorSession: session,
        context,
        targetUser: user,
        selfService: false,
      });
    }
  } else {
    await ensureUserHasActiveWorkspace({
      session,
      userId,
      reason: "user_removed_from_workspace",
    });
    await auditService.record({
      session,
      action: "user_removed_from_workspace",
      changeType: "archive",
      recordType: "user",
      recordId: userId,
      recordLabel: user.username,
      recordUrl: "user-admin.html",
      previousValue: userRowToAppValue(user),
      newValue: userRowToAppValue(user),
      metadata: {
        attribution_retained: true,
        remaining_active_memberships: activeMemberships.length,
      },
    });
    await recordWorkspaceMembershipChange({
      session,
      action: "workspace_membership_deactivated",
      changeType: "archive",
      user: userRowToAppValue(user),
      previousValue: previousMembership,
      newValue: nextMembership,
    });
  }

  return { users: await readUsersWithMemberships(session) };
}

/** @param {UsersRequestSession} session @param {UserServiceContext} [context] */
async function retireOwnAccount(session, context = {}) {
  assertPublicDemoVisitorIdentityMutable(session.user_id);
  const user = await usersRepository.readFirstByUserId(session.user_id);

  if (!user || user.user_status !== "active") {
    throw new AppError("These credentials do not have access to this installation.", 401);
  }

  await retireAccount({
    actorSession: session,
    context,
    targetUser: user,
    selfService: true,
  });

  return { accountRetired: true };
}

/** @param {RetireAccountInput} input @returns {Promise<void>} */
async function retireAccount({ actorSession, context, targetUser, selfService }) {
  assertPublicDemoVisitorIdentityMutable(targetUser.user_id);
  const memberships = await userWorkspacesRepository.readForUser(targetUser.user_id);

  for (const membership of memberships) {
    await transferOrBlockWorkspaceOwnership({
      session: actorSession,
      workspaceId: membership.workspace_id,
      ownerUserId: targetUser.user_id,
      action: "account_retirement",
    });
  }

  const revocation = await sessionsService.revokeAllForUser({
    actorSession,
    currentSessionId: context.currentSessionId,
    reason: selfService ? "self_account_retired" : "user_account_retired",
    targetUser,
    workspaceId: actorSession.workspace_id,
  });
  const retiredPasswordHash = await hashPassword(createGeneratedPassword());
  await usersRepository.retireAccount(targetUser.user_id, retiredPasswordHash);
  for (const membership of memberships) {
    await reconcilePrivateCalendarSubscriptions(membership.workspace_id, targetUser.user_id, actorSession);
  }
  const previousUser = userRowToAppValue(targetUser);
  const retiredUser = {
    ...previousUser,
    userStatus: "inactive",
  };

  await auditService.record({
    session: actorSession,
    action: selfService ? "user_account_self_retired" : "user_account_retired",
    changeType: "archive",
    recordType: "user",
    recordId: targetUser.user_id,
    recordLabel: targetUser.username,
    recordUrl: selfService ? "user-settings.html" : "user-admin.html",
    previousValue: previousUser,
    newValue: retiredUser,
    metadata: {
      attribution_retained: true,
      membership_count: memberships.length,
      revoked_sessions: revocation.revokedCount,
      self_service: selfService,
    },
  });
  await securityEventsService.record({
    actorUserId: actorSession.user_id,
    actorUserName: actorSession.username,
    eventType: selfService ? "security.user.self_retired" : "security.user.retired",
    ipAddress: context.ipAddress || actorSession.ip_address,
    metadata: {
      attribution_retained: true,
      membership_count: memberships.length,
      revoked_session_count: revocation.revokedCount,
      target_user_id: targetUser.user_id,
    },
    outcome: "success",
    reasonClass: selfService ? "self_account_retired" : "user_account_retired",
    recordId: targetUser.user_id,
    session: actorSession,
    workspaceId: actorSession.workspace_id,
  });
}

/** @param {UsersRequestSession} session */
async function readSettings(session) {
  const user = await usersRepository.readById(session.workspace_id, session.user_id);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  const appUser = userRowToAppValue(user);

  return {
    username: appUser.username,
    displayName: appUser.displayName,
    altEmail: appUser.altEmail,
    timezone: appUser.timezone,
    themeMode: appUser.themeMode,
    themeAutoSource: appUser.themeAutoSource,
    preferredLoginLanding: appUser.preferredLoginLanding,
    preferredWorkspaceSwitchLanding: appUser.preferredWorkspaceSwitchLanding,
    preferredCalendarView: appUser.preferredCalendarView,
    openExternalLinksNewTab: appUser.openExternalLinksNewTab,
    canEnterAccountExportRecovery: await permissionsService.isWorkspaceAdministrator(session),
    workspaceCreation: await readWorkspaceCreationOptions(session),
    activeWorkspaceId: session.active_workspace_id || session.workspace_id,
    workspaces: await workspacesRepository.readForUser(session.user_id),
  };
}

/** @param {UserPayload} payload @param {UsersRequestSession} session @param {string} [sessionId] */
async function createWorkspace(payload, session, sessionId = "") {
  assertPublicDemoCapabilityAllowed("administration.workspace_lifecycle");
  const workspaceType = normalizeWorkspaceType(payload.workspaceType || payload.workspace_type);
  const options = await readWorkspaceCreationOptions(session);

  if (!options.availableTypes.some((type) => type.workspaceType === workspaceType)) {
    throw new AppError("That workspace type is not available for this account.", 403);
  }

  const ownerUser = await usersRepository.readById(session.workspace_id, session.user_id);

  if (!ownerUser) {
    throw new AppError("User was not found.", 404);
  }

  const capabilities = getWorkspaceCapabilities(workspaceType);
  const workspaceName = String(payload.workspaceName || payload.workspace_name || capabilities.defaultName || "Workspace").trim();

  if (!workspaceName) {
    throw new AppError("Workspace name is required.", 400);
  }

  const existingWorkspaceNames = await workspacesRepository.readForUser(session.user_id);

  if (existingWorkspaceNames.some((workspace) =>
    String(workspace.workspace_name || "").trim().toLowerCase() === workspaceName.toLowerCase()
  )) {
    throw new AppError("Workspace name already exists.", 409);
  }

  const workspace = await workspacesRepository.createWorkspace({
    ownerUser,
    workspaceName,
    workspaceType,
  });
  const creationSession = {
    ...session,
    workspace_id: workspace.workspaceId,
    active_workspace_id: workspace.workspaceId,
  };
  const moduleStatusChanges = resolveCreateWorkspaceModuleStatusChanges(payload, workspaceType);

  for (const change of moduleStatusChanges) {
    await modulesService.setModuleStatus(workspace.workspaceId, change.moduleId, change.enabled, {
      session: creationSession,
    });
  }

  if (sessionId) {
    await sessionsRepository.updateActiveWorkspace(sessionId, workspace.workspaceId);
  }

  await auditService.record({
    session: creationSession,
    action: "workspace_created",
    changeType: "create",
    recordType: "workspace",
    recordId: workspace.workspaceId,
    recordLabel: workspace.workspaceName,
    recordUrl: "workspace-settings.html",
    previousValue: null,
    newValue: workspace,
    metadata: {
      created_from_workspace_id: session.workspace_id,
      workspace_type: workspace.workspaceType,
      module_statuses: moduleStatusChanges.reduce((statuses, change) => {
        statuses[change.moduleId] = change.enabled ? "enabled" : "disabled";
        return statuses;
      }, {}),
      time_tracking_enabled: moduleStatusChanges.find((change) => change.moduleId === "time-tracking")?.enabled,
    },
  });

  return {
    workspace,
    active_workspace_id: workspace.workspaceId,
    workspaces: await workspacesRepository.readForUser(session.user_id),
  };
}

/** @param {UsersRequestSession} session @param {unknown} workspaceId @param {UserServiceContext} [context] */
async function removeOwnWorkspaceMembership(session, workspaceId, context = {}) {
  assertPublicDemoVisitorIdentityMutable(session.user_id);
  const targetWorkspaceId = String(workspaceId || "").trim();

  if (!targetWorkspaceId) {
    throw new AppError("Workspace is required.", 400);
  }

  const memberships = await workspacesRepository.readForUser(session.user_id);
  const targetMembership = memberships.find((membership) => membership.workspace_id === targetWorkspaceId);

  if (!targetMembership) {
    throw new AppError("Workspace membership was not found.", 404);
  }

  const activeMemberships = memberships.filter((membership) => membership.status === "active");
  const removingLastActive = targetMembership.status === "active" && activeMemberships.length <= 1;

  if (targetWorkspaceId === session.workspace_id && !removingLastActive) {
    throw new AppError("Switch to a different workspace before removing this one.", 400);
  }

  const exportRecoveryEligible = await accountExportRecoveryRepository.recordWorkspaceAccessLoss({
    source: "membership_leave",
    userId: session.user_id,
    workspaceId: targetWorkspaceId,
  });
  if (removingLastActive && !exportRecoveryEligible) {
    throw new AppError("You must keep at least one active workspace.", 400);
  }
  await transferOrBlockWorkspaceOwnership({
    session,
    workspaceId: targetWorkspaceId,
    ownerUserId: session.user_id,
    action: "remove",
  });

  const previousMembership = await userWorkspacesRepository.readByUserAndWorkspace(session.user_id, targetWorkspaceId);
  await userWorkspacesRepository.remove(session.user_id, targetWorkspaceId);
  await auditService.record({
    session: {
      ...session,
      workspace_id: targetWorkspaceId,
    },
    action: "own_workspace_membership_removed",
    changeType: "delete",
    recordType: "workspace_membership",
    recordId: previousMembership?.user_workspace_id || `${targetWorkspaceId}:${session.user_id}`,
    recordLabel: targetMembership.workspace_name || targetWorkspaceId,
    recordUrl: "user-settings.html",
    previousValue: previousMembership,
    newValue: null,
    metadata: {
      user_id: session.user_id,
      workspace_id: targetWorkspaceId,
      removed_from_user_settings: true,
    },
  });

  if (removingLastActive) {
    const user = await usersRepository.readFirstByUserId(session.user_id);
    if (!user) {
      throw new AppError("User was not found.", 404);
    }
    await usersRepository.clearWorkspaceReferences(session.user_id, targetWorkspaceId);
    await sessionsService.revokeAllForUser({
      actorSession: session,
      currentSessionId: context.currentSessionId,
      reason: "account_export_recovery_qualified",
      targetUser: user,
      workspaceId: targetWorkspaceId,
    });
    return {
      accountExportRecovery: true,
      activeWorkspaceId: null,
      workspaces: [],
    };
  }

  return {
    activeWorkspaceId: session.workspace_id,
    workspaces: await workspacesRepository.readForUser(session.user_id),
  };
}

/** @param {UserPayload} payload @param {UsersRequestSession} session */
async function saveSettings(payload, session) {
  const user = await usersRepository.readById(session.workspace_id, session.user_id);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  if (Object.hasOwn(payload, "username") || Object.hasOwn(payload, "altEmail")) {
    const submittedProfile = normalizeUserProfilePayload(payload, user);
    if (
      submittedProfile.username !== normalizeUsername(user.username)
      || submittedProfile.altEmail !== normalizeOptionalEmail(user.alt_email)
    ) {
      assertPublicDemoVisitorIdentityMutable(session.user_id);
    }
  }

  const previousValue = userRowToAppValue(user);
  let nextValue = previousValue;
  let themeMode = previousValue.themeMode;
  let themeAutoSource = previousValue.themeAutoSource;
  let preferredLoginLanding = previousValue.preferredLoginLanding;
  let preferredWorkspaceSwitchLanding = previousValue.preferredWorkspaceSwitchLanding;
  let preferredCalendarView = previousValue.preferredCalendarView;
  let openExternalLinksNewTab = previousValue.openExternalLinksNewTab;
  /** @type {{ setting_group: string, setting_names: string[] }} */
  const metadata = {
    setting_group: "user",
    setting_names: [],
  };

  if (Object.hasOwn(payload, "themeMode")) {
    themeMode = normalizeThemeMode(payload.themeMode);
    await usersRepository.updateThemeMode(session.workspace_id, session.user_id, themeMode);
    nextValue = {
      ...nextValue,
      themeMode,
    };
    metadata.setting_names.push("themeMode");
  }

  if (Object.hasOwn(payload, "themeAutoSource")) {
    themeAutoSource = normalizeThemeAutoSource(payload.themeAutoSource);
    await usersRepository.updateThemeAutoSource(session.workspace_id, session.user_id, themeAutoSource);
    nextValue = {
      ...nextValue,
      themeAutoSource,
    };
    metadata.setting_names.push("themeAutoSource");
  }

  if (Object.hasOwn(payload, "openExternalLinksNewTab")) {
    openExternalLinksNewTab = normalizeBooleanPreference(payload.openExternalLinksNewTab);
    await usersRepository.updateOpenExternalLinksNewTab(session.workspace_id, session.user_id, openExternalLinksNewTab);
    nextValue = {
      ...nextValue,
      openExternalLinksNewTab,
    };
    metadata.setting_names.push("openExternalLinksNewTab");
  }

  if (
    Object.hasOwn(payload, "preferredLoginLanding") ||
    Object.hasOwn(payload, "preferredWorkspaceSwitchLanding")
  ) {
    preferredLoginLanding = Object.hasOwn(payload, "preferredLoginLanding")
      ? normalizeUserLandingPage(payload.preferredLoginLanding)
      : preferredLoginLanding;
    preferredWorkspaceSwitchLanding = Object.hasOwn(payload, "preferredWorkspaceSwitchLanding")
      ? normalizeUserLandingPage(payload.preferredWorkspaceSwitchLanding)
      : preferredWorkspaceSwitchLanding;
    await usersRepository.updateLandingPreferences(session.workspace_id, session.user_id, {
      preferredLoginLanding,
      preferredWorkspaceSwitchLanding,
    });
    nextValue = {
      ...nextValue,
      preferredLoginLanding,
      preferredWorkspaceSwitchLanding,
    };
    metadata.setting_names.push("landingPreferences");
  }

  if (Object.hasOwn(payload, "preferredCalendarView")) {
    preferredCalendarView = normalizeCalendarViewPreference(payload.preferredCalendarView);
    await usersRepository.updateCalendarViewPreference(session.workspace_id, session.user_id, preferredCalendarView);
    nextValue = {
      ...nextValue,
      preferredCalendarView,
    };
    metadata.setting_names.push("preferredCalendarView");
  }

  if (
    Object.hasOwn(payload, "username") ||
    Object.hasOwn(payload, "displayName") ||
    Object.hasOwn(payload, "altEmail") ||
    Object.hasOwn(payload, "timezone")
  ) {
    const profile = normalizeUserProfilePayload(payload, user);
    const existingUser = await usersRepository.readByUsernameExcludingUser(profile.username, session.user_id);

    if (existingUser && existingUser.user_id !== session.user_id) {
      throw new AppError("A user with that email address already exists.", 409);
    }

    await usersRepository.updateProfile(session.workspace_id, session.user_id, profile);
    await sessionsRepository.updateUsernameForUser(session.workspace_id, session.user_id, profile.username);
    await sessionsRepository.updateTimezoneForUser(session.workspace_id, session.user_id, profile.timezone);
    nextValue = {
      ...nextValue,
      username: profile.username,
      displayName: profile.displayName,
      altEmail: profile.altEmail,
      timezone: profile.timezone,
    };
    metadata.setting_names.push("profile");
  }

  if (metadata.setting_names.length > 0) {
    await auditService.record({
      session: {
        ...session,
        username: nextValue.username,
      },
      action: "user_settings_updated",
      changeType: "settings_change",
      recordType: "user",
      recordId: session.user_id,
      recordLabel: nextValue.username,
      recordUrl: "user-settings.html",
      previousValue,
      newValue: nextValue,
      metadata,
    });
  }

  return {
    username: nextValue.username,
    displayName: nextValue.displayName,
    altEmail: nextValue.altEmail,
    timezone: nextValue.timezone,
    themeMode,
    themeAutoSource,
    preferredLoginLanding,
    preferredWorkspaceSwitchLanding,
    preferredCalendarView,
    openExternalLinksNewTab,
  };
}

/** @param {string} workspaceId @param {string} userId @param {UsersRequestSession} session @returns {Promise<void>} */
async function reconcilePrivateCalendarSubscriptions(workspaceId, userId, session) {
  const { privateFeedsService } = await import("./private-feeds.service.js");
  await privateFeedsService.reconcileCalendarSubscriptions({
    session: session?.workspace_id === workspaceId ? session : undefined,
    userId,
    workspaceId,
  });
}

/** @param {WorkspaceMembershipAuditInput} input @returns {Promise<void>} */
async function recordWorkspaceMembershipChange({
  session,
  action,
  changeType,
  user,
  previousValue,
  newValue,
}) {
  await auditService.record({
    session,
    action,
    changeType,
    recordType: "workspace_membership",
    recordId: newValue?.user_workspace_id || previousValue?.user_workspace_id || `${session.workspace_id}:${user.user_id}`,
    recordLabel: user.username,
    recordUrl: "user-admin.html",
    previousValue,
    newValue,
    metadata: {
      user_id: user.user_id,
      username: user.username,
      workspace_id: session.workspace_id,
    },
  });
}

/** @param {UsersRequestSession} session @param {UserValue} user @param {WorkspaceValue} workspace @returns {Promise<UserWorkspaceMembershipRow | null>} */
async function deactivateWorkspaceMembershipWithLifecycle(session, user, workspace) {
  await transferOrBlockWorkspaceOwnership({
    session,
    workspaceId: workspace.workspaceId,
    ownerUserId: user.user_id,
    action: "deactivate",
  });

  const membership = await userWorkspacesRepository.updateStatus(user.user_id, workspace.workspaceId, "inactive");
  await reconcilePrivateCalendarSubscriptions(workspace.workspaceId, user.user_id, session);
  return membership;
}

/** @param {WorkspaceOwnershipInput} input @returns {Promise<OwnerTransferCandidate | null>} */
async function transferOrBlockWorkspaceOwnership({ session, workspaceId, ownerUserId, action }) {
  const workspace = await workspacesRepository.readById(workspaceId);

  if (!workspace || workspace.owner_user_id !== ownerUserId) {
    return null;
  }

  const candidate = await workspacesRepository.readOwnerTransferCandidate(workspaceId, ownerUserId);

  if (!candidate) {
    throw new AppError("Assign another Workspace Administrator before removing this workspace owner.", 400);
  }

  await workspacesRepository.updateOwner(workspaceId, candidate.user_id);
  await auditService.record({
    session: {
      ...session,
      workspace_id: workspaceId,
    },
    action: "workspace_owner_transferred",
    changeType: "update",
    recordType: "workspace",
    recordId: workspaceId,
    recordLabel: workspace.workspace_name,
    recordUrl: "workspace-settings.html",
    previousValue: {
      owner_user_id: ownerUserId,
    },
    newValue: {
      owner_user_id: candidate.user_id,
      owner_username: candidate.username,
    },
    metadata: {
      transfer_reason: `owner_${action}`,
      previous_owner_user_id: ownerUserId,
      next_owner_user_id: candidate.user_id,
      next_owner_username: candidate.username,
      selected_by: "oldest_active_workspace_admin_membership",
    },
  });

  return candidate;
}

/** @param {EnsureWorkspaceInput} input @returns {Promise<CreatedWorkspace | null>} */
async function ensureUserHasActiveWorkspace({ session, userId, reason }) {
  const activeMemberships = /** @type {UserWorkspaceMembershipRow[]} */ (
    await userWorkspacesRepository.readActiveForUser(userId)
  );

  if (activeMemberships.length > 0) {
    const activeWorkspaceId = activeMemberships[0].workspace_id;
    await usersRepository.updateActiveWorkspace(userId, activeWorkspaceId);
    await sessionsRepository.updateActiveWorkspaceForUser(userId, activeWorkspaceId);
    return null;
  }

  const ownerUser = await usersRepository.readFirstByUserId(userId);

  if (!ownerUser) {
    return null;
  }

  const workspace = await workspacesRepository.createWorkspace({
    ownerUser,
    workspaceName: await createPersonalWorkspaceName(userId),
    workspaceType: "personal",
  });

  await usersRepository.updateActiveWorkspace(userId, workspace.workspaceId);
  await sessionsRepository.updateActiveWorkspaceForUser(userId, workspace.workspaceId);
  await auditService.record({
    session: {
      ...session,
      workspace_id: workspace.workspaceId,
    },
    action: "personal_workspace_created_for_unassigned_user",
    changeType: "create",
    recordType: "workspace",
    recordId: workspace.workspaceId,
    recordLabel: workspace.workspaceName,
    recordUrl: "workspace-settings.html",
    previousValue: null,
    newValue: workspace,
    metadata: {
      user_id: userId,
      reason,
    },
  });

  return workspace;
}

/** @param {string} userId @returns {Promise<string>} */
async function createPersonalWorkspaceName(userId) {
  const existingNames = new Set(
    (await workspacesRepository.readForUser(userId))
      .map((workspace) => String(workspace.workspace_name || "").trim().toLowerCase())
      .filter(Boolean),
  );
  let candidate = "Personal";
  let suffix = 2;

  while (existingNames.has(candidate.toLowerCase())) {
    candidate = `Personal ${suffix}`;
    suffix += 1;
  }

  return candidate;
}

/** @param {UsersRequestSession} session @returns {Promise<DecoratedUser[]>} */
async function readUsersWithMemberships(session) {
  const users = await usersRepository.readAll(session.workspace_id);
  return Promise.all(users.map((user) => decorateUserWithMemberships(user)));
}

/** @param {UsersRequestSession} session @returns {Promise<WorkspaceValue[]>} */
async function readAssignableWorkspaces(session) {
  const allWorkspaces = await userWorkspacesRepository.readAllWorkspaces();

  if (await permissionsService.isSuperAdmin(session)) {
    return allWorkspaces.map(workspaceToAppValue);
  }

  const currentUserMemberships = /** @type {UserWorkspaceMembershipRow[]} */ (
    await userWorkspacesRepository.readForUser(session.user_id)
  );
  const currentUserWorkspaceIds = new Set(
    currentUserMemberships
      .filter((membership) => membership.status !== "inactive")
      .map((membership) => membership.workspace_id),
  );
  /** @type {WorkspaceValue[]} */
  const visibleWorkspaces = [];

  for (const workspace of allWorkspaces) {
    if (!currentUserWorkspaceIds.has(workspace.workspace_id)) {
      continue;
    }

    const targetSession = createTargetWorkspaceSession(session, workspace.workspace_id);

    if (await permissionsService.can(targetSession, "users.manage", {
      workspace_id: workspace.workspace_id,
      operation: "read",
    })) {
      visibleWorkspaces.push(workspaceToAppValue(workspace));
    }
  }

  return visibleWorkspaces;
}

/** @param {UsersRequestSession} session @param {unknown} requestedWorkspaceId @param {string} operation */
async function resolveAddUserWorkspace(session, requestedWorkspaceId, operation) {
  const workspaces = await readAssignableWorkspaces(session);
  const workspaceId = String(requestedWorkspaceId || session.workspace_id || "").trim();
  const workspace = workspaces.find((item) => item.workspaceId === workspaceId);

  if (!workspace) {
    throw new AppError("You cannot manage users in that workspace.", 403);
  }

  const targetSession = createTargetWorkspaceSession(session, workspace.workspaceId);
  await permissionsService.assertCan(targetSession, "users.manage", {
    workspace_id: workspace.workspaceId,
    operation,
  });

  return { targetSession, workspace, workspaces };
}

/** @param {UsersRequestSession} session @param {string} workspaceId @returns {UsersRequestSession} */
function createTargetWorkspaceSession(session, workspaceId) {
  return {
    ...session,
    active_workspace_id: workspaceId,
    workspace_id: workspaceId,
  };
}

/** @param {unknown} value @returns {string} */
function normalizeCreateUsername(value) {
  const username = normalizeUsername(value);

  if (!username) {
    throw new AppError("Email address is required.", 400);
  }

  if (!isValidEmail(username)) {
    throw new AppError("Enter a valid email address for the username.", 400);
  }

  return username;
}

/** @param {UsersRequestSession} session @returns {Promise<WorkspaceCreationOptions>} */
async function readWorkspaceCreationOptions(session) {
  const appSettings = await appSettingsRepository.readAll();
  const userCreationPermission = await appSettingsRepository.readWorkspaceCreationPermission(session.user_id);
  const configuredInstallMode = config.envOverrides.workspaceInstallMode || appSettings.workspace_install_mode || config.workspaceInstallMode;
  const configuredTypeLimit = config.envOverrides.workspaceTypeLimit || appSettings.workspace_type_limit || config.workspaceTypeLimit;
  const workspaceCreationEnabled = appSettings.workspace_creation_enabled !== "false";
  const installMode = configuredInstallMode === "saas" ? "saas" : "self_hosted";
  const typeLimit = String(configuredTypeLimit || "").trim().toLowerCase();
  const baseTypes = typeLimit === "business"
    ? ["business"]
    : ["business", "personal", "family"];
  const availableTypeIds = workspaceCreationEnabled && userCreationPermission.canCreateWorkspaces && installMode === "self_hosted"
    ? baseTypes
    : workspaceCreationEnabled && userCreationPermission.canCreateWorkspaces
      ? await readSaasWorkspaceTypes(session, baseTypes)
      : [];
  const allowedByUser = new Set(userCreationPermission.allowedWorkspaceTypes);
  const filteredTypeIds = availableTypeIds.filter((workspaceType) => allowedByUser.has(workspaceType));

  return {
    installMode,
    workspaceCreationEnabled,
    canCreateWorkspaces: userCreationPermission.canCreateWorkspaces,
    availableTypes: filteredTypeIds.map((workspaceType) => ({
      workspaceType,
      label: formatWorkspaceType(workspaceType),
      defaultName: getWorkspaceCapabilities(workspaceType).defaultName || "",
      moduleSettings: readWorkspaceCreationModuleSettings(workspaceType),
    })),
  };
}

/** @param {string} workspaceType @returns {WorkspaceCreationModuleDefinition[]} */
function readWorkspaceCreationModuleSettings(workspaceType) {
  return modulesService.listModuleSettingsForWorkspaceType(workspaceType)
    .map((moduleDefinition) => ({
      ...moduleDefinition,
      settings: (moduleDefinition.settings || []).filter((setting) => setting.moduleStatus === true),
    }))
    .filter((moduleDefinition) => moduleDefinition.settings.length > 0);
}

/** @param {UserPayload} payload @param {string} workspaceType @returns {ModuleStatusChange[]} */
function resolveCreateWorkspaceModuleStatusChanges(payload, workspaceType) {
  const definitions = buildCreateWorkspaceModuleStatusDefinitionMap(workspaceType);
  const submittedSettings = readSubmittedCreateWorkspaceModuleSettings(payload);
  /** @type {ModuleStatusChange[]} */
  const changes = [];

  if (submittedSettings.size === 0) {
    if (Object.hasOwn(payload || {}, "timeTrackingEnabled")) {
      const definition = definitions.get("time-tracking.timeTrackingEnabled");
      if (definition) {
        changes.push({
          moduleId: definition.module.moduleId,
          enabled: payload.timeTrackingEnabled !== false,
        });
      }
    }
    return changes;
  }

  for (const [moduleId, settings] of submittedSettings.entries()) {
    for (const [settingId, value] of settings.entries()) {
      const definition = definitions.get(`${moduleId}.${settingId}`);

      if (!definition) {
        throw new AppError(`Unknown module setting '${moduleId}.${settingId}'.`, 400);
      }

      if (definition.setting.readOnly === true) {
        throw new AppError(`Module setting '${moduleId}.${settingId}' is read-only.`, 400);
      }

      if (definition.setting.moduleStatus !== true) {
        throw new AppError(`Module setting '${moduleId}.${settingId}' cannot be set during workspace creation.`, 400);
      }

      if (typeof value !== "boolean") {
        throw new AppError(`Module setting '${moduleId}.${settingId}' must be a boolean.`, 400);
      }

      changes.push({
        moduleId,
        enabled: value,
      });
    }
  }

  return changes;
}

/** @param {string} workspaceType */
function buildCreateWorkspaceModuleStatusDefinitionMap(workspaceType) {
  const definitions = new Map();

  for (const moduleDefinition of readWorkspaceCreationModuleSettings(workspaceType)) {
    for (const setting of moduleDefinition.settings || []) {
      definitions.set(`${moduleDefinition.moduleId}.${setting.id}`, {
        module: moduleDefinition,
        setting,
      });
    }
  }

  return definitions;
}

/** @param {UserPayload} payload @returns {Map<string, Map<string, unknown>>} */
function readSubmittedCreateWorkspaceModuleSettings(payload) {
  /** @type {Map<string, Map<string, unknown>>} */
  const submittedSettings = new Map();
  const moduleSettings = payload?.moduleSettings;

  if (moduleSettings === undefined) {
    return submittedSettings;
  }

  if (!isPlainObject(moduleSettings)) {
    throw new AppError("moduleSettings must be an object keyed by module ID.", 400);
  }

  for (const [moduleId, settings] of Object.entries(moduleSettings)) {
    if (!isPlainObject(settings)) {
      throw new AppError(`moduleSettings.${moduleId} must be an object keyed by setting ID.`, 400);
    }

    for (const [settingId, value] of Object.entries(settings)) {
      const normalizedModuleId = String(moduleId || "").trim();
      const normalizedSettingId = String(settingId || "").trim();

      if (!normalizedModuleId || !normalizedSettingId) {
        throw new AppError("Module setting IDs are required.", 400);
      }

      if (!submittedSettings.has(normalizedModuleId)) {
        submittedSettings.set(normalizedModuleId, new Map());
      }

      const submittedModuleSettings = submittedSettings.get(normalizedModuleId);
      if (submittedModuleSettings) {
        submittedModuleSettings.set(normalizedSettingId, value);
      }
    }
  }

  return submittedSettings;
}

/** @param {UsersRequestSession} session @param {string[]} baseTypes @returns {Promise<string[]>} */
async function readSaasWorkspaceTypes(session, baseTypes) {
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  const personalCount = await workspacesRepository.countUserWorkspacesByType(session.user_id, "personal");

  if (settings.workspaceType === "business") {
    return baseTypes.filter((type) => type !== "personal" || personalCount === 0);
  }

  if (settings.workspaceType === "family") {
    return baseTypes.filter((type) => (
      (type === "personal" && personalCount === 0) ||
      type === "family"
    ));
  }

  return baseTypes.filter((type) => type === "personal" && personalCount === 0);
}

/** @param {unknown} workspaceType @returns {string} */
function formatWorkspaceType(workspaceType) {
  return {
    business: "Business",
    personal: "Personal",
    family: "Family",
  }[workspaceType] || "Workspace";
}

/** @param {ReplaceMembershipsInput} input @returns {Promise<void>} */
async function replaceWorkspaceMemberships({ session, user, requestedWorkspaceIds }) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "update" });

  const assignableWorkspaces = await readAssignableWorkspaces(session);
  const assignableWorkspaceIds = new Set(assignableWorkspaces.map((workspace) => workspace.workspaceId));
  const selectedWorkspaceIds = [...new Set((requestedWorkspaceIds || []).map((workspaceId) => String(workspaceId || "").trim()))]
    .filter(Boolean);

  if (selectedWorkspaceIds.some((workspaceId) => !assignableWorkspaceIds.has(workspaceId))) {
    throw new AppError("You cannot assign users to unrelated workspaces.", 403);
  }

  const invalidPersonalWorkspace = assignableWorkspaces.find((workspace) =>
    selectedWorkspaceIds.includes(workspace.workspaceId) &&
    workspace.workspaceType === "personal" &&
    workspace.ownerUserId !== user.user_id,
  );

  if (invalidPersonalWorkspace) {
    throw new AppError("Personal workspaces can only belong to their creator.", 400);
  }

  const previousMemberships = /** @type {UserWorkspaceMembershipRow[]} */ (
    await userWorkspacesRepository.readForUser(user.user_id)
  );
  const previousActiveWorkspaceIds = new Set(
    previousMemberships
      .filter((membership) => membership.status === "active")
      .map((membership) => membership.workspace_id),
  );

  for (const workspace of assignableWorkspaces) {
    const shouldBeActive = selectedWorkspaceIds.includes(workspace.workspaceId);
    const previousMembership = previousMemberships.find((membership) => membership.workspace_id === workspace.workspaceId) || null;
    const nextMembership = shouldBeActive
      ? await userWorkspacesRepository.upsert({
          userId: user.user_id,
          workspaceId: workspace.workspaceId,
          status: "active",
        })
      : previousActiveWorkspaceIds.has(workspace.workspaceId)
        ? await deactivateWorkspaceMembershipWithLifecycle(session, user, workspace)
        : previousMembership;

    if (Boolean(previousActiveWorkspaceIds.has(workspace.workspaceId)) === shouldBeActive) {
      continue;
    }

    await recordWorkspaceMembershipChange({
      session: {
        ...session,
        workspace_id: workspace.workspaceId,
      },
      action: shouldBeActive ? "workspace_membership_added" : "workspace_membership_deactivated",
      changeType: shouldBeActive ? "create" : "archive",
      user,
      previousValue: previousMembership,
      newValue: nextMembership,
    });
  }

  await ensureUserHasActiveWorkspace({
    session,
    userId: user.user_id,
    reason: "user_removed_from_all_workspaces",
  });
}

/** @param {AssignableWorkspaceRow} workspace @returns {WorkspaceValue} */
function workspaceToAppValue(workspace) {
  return {
    workspaceId: workspace.workspace_id,
    workspaceName: workspace.workspace_name,
    workspaceType: workspace.workspace_type,
    ownerUserId: workspace.owner_user_id,
    ownerUsername: workspace.owner_username,
  };
}

/** @param {UserValue} user @returns {Promise<DecoratedUser>} */
async function decorateUserWithMemberships(user) {
  const memberships = /** @type {UserWorkspaceMembershipRow[]} */ (
    await userWorkspacesRepository.readForUser(user.user_id)
  );

  return {
    ...user,
    workspaceMemberships: memberships.map((membership) => ({
      userWorkspaceId: membership.user_workspace_id,
      workspaceId: membership.workspace_id,
      workspaceName: membership.workspace_name,
      status: membership.status,
      createdAt: membership.created_at,
      updatedAt: membership.updated_at,
    })),
  };
}

/** @param {UserValue} user @param {string} workspaceId @returns {Promise<DecoratedUser>} */
async function decorateUserForWorkspace(user, workspaceId) {
  const membership = await userWorkspacesRepository.readByUserAndWorkspace(user.user_id, workspaceId);

  return {
    ...user,
    workspaceMemberships: membership ? [{
      userWorkspaceId: membership.user_workspace_id,
      workspaceId: membership.workspace_id,
      status: membership.status,
      createdAt: membership.created_at,
      updatedAt: membership.updated_at,
    }] : [],
  };
}

/** @param {UsersRequestSession} session @returns {Promise<void>} */
async function assertWorkspaceCanAddUser(session) {
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);

  if (settings.workspaceType === "personal") {
    throw new AppError("Personal workspaces cannot add other users.", 400);
  }

  if (settings.workspaceType !== "family") {
    return;
  }

  const activeMembershipCount = await userWorkspacesRepository.countActiveForWorkspace(session.workspace_id);

  if (activeMembershipCount >= 20) {
    throw new AppError("Family workspaces are limited to 20 users.", 400);
  }
}

/** @param {UserPayload} payload @param {Partial<UserRow>} [fallbackUser] @returns {UserProfile} */
function normalizeUserProfilePayload(payload, fallbackUser = {}) {
  const username = normalizeUsername(
    Object.hasOwn(payload, "username") ? payload.username : fallbackUser.username,
  );

  if (!username) {
    throw new AppError("Email address is required.", 400);
  }

  if (!isValidEmail(username)) {
    throw new AppError("Enter a valid email address for the username.", 400);
  }

  const altEmail = normalizeOptionalEmail(
    Object.hasOwn(payload, "altEmail") ? payload.altEmail : fallbackUser.alt_email,
  );

  if (altEmail && !isValidEmail(altEmail)) {
    throw new AppError("Enter a valid alternate email address or leave it blank.", 400);
  }

  const timezoneInput = Object.hasOwn(payload, "timezone") ? payload.timezone : fallbackUser.timezone;

  if (!isValidTimezone(timezoneInput)) {
    throw new AppError("Choose a valid IANA timezone.", 400);
  }

  return {
    username,
    displayName: normalizeDisplayName(
      Object.hasOwn(payload, "displayName") ? payload.displayName : fallbackUser.display_name,
      username,
    ),
    altEmail,
    timezone: normalizeTimezone(timezoneInput),
  };
}

/** @param {unknown} value @returns {value is JsonObject} */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

export const usersService = {
  action,
  create,
  createWorkspace,
  delete: remove,
  list,
  listPermissionResources,
  listWorkspaces,
  lookupAddUserAccount,
  readAddUserOptions,
  readSettings,
  retireOwnAccount,
  removeOwnWorkspaceMembership,
  saveSettings,
};
