import { usersRepository } from "../repositories/users.repo.js";
import { sessionsRepository } from "../repositories/sessions.repo.js";
import { appSettingsRepository } from "../repositories/app-settings.repo.js";
import { settingsRepository } from "../repositories/settings.repo.js";
import { userWorkspacesRepository } from "../repositories/user-workspaces.repo.js";
import { workspacesRepository } from "../repositories/workspaces.repo.js";
import { modulesService } from "../core/modules/modules.service.js";
import { config } from "../config.js";
import { createGeneratedPassword, hashPassword, validatePassword } from "../security/passwords.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { AppError } from "../utils/app-error.js";
import {
  getWorkspaceCapabilities,
  normalizeWorkspaceType,
} from "../utils/workspaces.js";
import {
  isValidEmail,
  isValidTimezone,
  normalizeDisplayName,
  normalizeOptionalEmail,
  normalizeProtectedUserFlag,
  normalizeThemeMode,
  normalizeTimezone,
  normalizeUsername,
  userRowToAppValue,
} from "../utils/normalizers.js";

async function list(session) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "read" });
  return { users: await readUsersWithMemberships(session) };
}

async function listWorkspaces(session) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "read" });

  return {
    workspaces: await readAssignableWorkspaces(session),
  };
}

async function create(payload, session) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "create" });
  const username = normalizeUsername(payload.username);

  if (!username) {
    throw new AppError("Email address is required.", 400);
  }

  if (!isValidEmail(username)) {
    throw new AppError("Enter a valid email address for the username.", 400);
  }

  const existingUser = await usersRepository.readByUsername(username);

  if (existingUser) {
    throw new AppError("A user with that email address already exists.", 409);
  }

  await assertWorkspaceCanAddUser(session);

  const initialPassword = createGeneratedPassword();
  const validation = validatePassword(initialPassword, username);

  if (!validation.valid) {
    throw new AppError("Generated password did not meet password requirements.", 500);
  }

  const user = await usersRepository.create(
    session.workspace_id,
    {
      username,
      displayName: normalizeDisplayName(payload.displayName, username),
      altEmail: normalizeOptionalEmail(payload.altEmail),
      timezone: normalizeTimezone(payload.timezone),
    },
    hashPassword(initialPassword),
  );
  const membership = await userWorkspacesRepository.upsert({
    userId: user.user_id,
    workspaceId: session.workspace_id,
    status: "active",
  });
  await auditService.record({
    session,
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
  await recordWorkspaceMembershipChange({
    session,
    action: "workspace_membership_added",
    changeType: "create",
    user,
    previousValue: null,
    newValue: membership,
  });

  if (Array.isArray(payload.assignments) && payload.assignments.length > 0) {
    await permissionsService.replaceUserAssignments(session, user.user_id, {
      assignments: payload.assignments,
    });
  }

  const users = await readUsersWithMemberships(session);

  return {
    user: await decorateUserWithMemberships(user),
    users,
    initialPassword,
  };
}

async function action({ payload = {}, session, userId, action: userAction }) {
  if (!userId || !userAction) {
    throw new AppError("User action was not found.", 404);
  }

  if (userAction === "reset-password") {
    return resetPassword(session, userId);
  }

  if (userAction === "update") {
    return update(payload, session, userId);
  }

  if (userAction === "deactivate") {
    return deactivate(session, userId);
  }

  if (userAction === "reactivate") {
    return reactivate(session, userId);
  }

  throw new AppError("User action was not found.", 404);
}

async function update(payload, session, userId) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "update" });
  const user = await usersRepository.readById(session.workspace_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  const profile = normalizeUserProfilePayload(payload, user);

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
      requestedWorkspaceIds: payload.workspaceMemberships,
    });
  }

  return {
    user: await decorateUserWithMemberships(updatedUser),
    users: await readUsersWithMemberships(session),
  };
}

async function resetPassword(session, userId) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "update" });
  const user = await usersRepository.readById(session.workspace_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  const initialPassword = createGeneratedPassword();
  const validation = validatePassword(initialPassword, user.username);

  if (!validation.valid) {
    throw new AppError("Generated password did not meet password requirements.", 500);
  }

  await usersRepository.updatePassword(session.workspace_id, userId, hashPassword(initialPassword));
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
    },
  });

  return {
    user: userRowToAppValue(user),
    users: await readUsersWithMemberships(session),
    initialPassword,
  };
}

async function deactivate(session, userId) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "update" });
  const user = await usersRepository.readById(session.workspace_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

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
  const previousMembership = await userWorkspacesRepository.readByUserAndWorkspace(userId, session.workspace_id);
  const nextMembership = await userWorkspacesRepository.updateStatus(userId, session.workspace_id, "inactive");
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
    },
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

async function reactivate(session, userId) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "update" });
  const user = await usersRepository.readById(session.workspace_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

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

async function remove(session, userId) {
  await permissionsService.assertCan(session, "users.manage", { workspace_id: session.workspace_id, operation: "delete" });
  if (!userId) {
    throw new AppError("User was not found.", 404);
  }

  const user = await usersRepository.readById(session.workspace_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  if (normalizeProtectedUserFlag(user.protected_user)) {
    throw new AppError("Protected users cannot be deleted.", 400);
  }

  await transferOrBlockWorkspaceOwnership({
    session,
    workspaceId: session.workspace_id,
    ownerUserId: userId,
    action: "remove",
  });

  const previousMembership = await userWorkspacesRepository.readByUserAndWorkspace(userId, session.workspace_id);
  await userWorkspacesRepository.remove(userId, session.workspace_id);
  await ensureUserHasActiveWorkspace({
    session,
    userId,
    reason: "user_removed_from_workspace",
  });
  await usersRepository.remove(session.workspace_id, userId);
  await auditService.record({
    session,
    action: "user_deleted",
    changeType: "delete",
    recordType: "user",
    recordId: userId,
    recordLabel: user.username,
    recordUrl: "user-admin.html",
    previousValue: userRowToAppValue(user),
    newValue: null,
    metadata: {
      deleted_user_id: userId,
      deleted_username: user.username,
    },
  });
  await recordWorkspaceMembershipChange({
    session,
    action: "workspace_membership_removed",
    changeType: "delete",
    user: userRowToAppValue(user),
    previousValue: previousMembership,
    newValue: null,
  });

  return { users: await readUsersWithMemberships(session) };
}

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
    workspaceCreation: await readWorkspaceCreationOptions(session),
    activeWorkspaceId: session.active_workspace_id || session.workspace_id,
    workspaces: await workspacesRepository.readForUser(session.user_id),
  };
}

async function createWorkspace(payload, session, sessionId = "") {
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

async function removeOwnWorkspaceMembership(session, workspaceId) {
  const targetWorkspaceId = String(workspaceId || "").trim();

  if (!targetWorkspaceId) {
    throw new AppError("Workspace is required.", 400);
  }

  if (targetWorkspaceId === session.workspace_id) {
    throw new AppError("Switch to a different workspace before removing this one.", 400);
  }

  const memberships = await workspacesRepository.readForUser(session.user_id);
  const targetMembership = memberships.find((membership) => membership.workspace_id === targetWorkspaceId);

  if (!targetMembership) {
    throw new AppError("Workspace membership was not found.", 404);
  }

  const activeMemberships = memberships.filter((membership) => membership.status === "active");

  if (targetMembership.status === "active" && activeMemberships.length <= 1) {
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

  return {
    activeWorkspaceId: session.workspace_id,
    workspaces: await workspacesRepository.readForUser(session.user_id),
  };
}

async function saveSettings(payload, session) {
  const user = await usersRepository.readById(session.workspace_id, session.user_id);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  const previousValue = userRowToAppValue(user);
  let nextValue = previousValue;
  let themeMode = previousValue.themeMode;
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
  };
}

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

async function deactivateWorkspaceMembershipWithLifecycle(session, user, workspace) {
  await transferOrBlockWorkspaceOwnership({
    session,
    workspaceId: workspace.workspaceId,
    ownerUserId: user.user_id,
    action: "deactivate",
  });

  return userWorkspacesRepository.updateStatus(user.user_id, workspace.workspaceId, "inactive");
}

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

async function ensureUserHasActiveWorkspace({ session, userId, reason }) {
  const activeMemberships = await userWorkspacesRepository.readActiveForUser(userId);

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

async function readUsersWithMemberships(session) {
  const users = await usersRepository.readAll(session.workspace_id);
  return Promise.all(users.map((user) => decorateUserWithMemberships(user)));
}

async function readAssignableWorkspaces(session) {
  const allWorkspaces = await userWorkspacesRepository.readAllWorkspaces();

  if (await permissionsService.isSuperAdmin(session)) {
    return allWorkspaces.map(workspaceToAppValue);
  }

  const currentUserMemberships = await userWorkspacesRepository.readForUser(session.user_id);
  const currentUserWorkspaceIds = new Set(
    currentUserMemberships
      .filter((membership) => membership.status !== "inactive")
      .map((membership) => membership.workspace_id),
  );
  const visibleWorkspaces = allWorkspaces.filter((workspace) => {
    if (workspace.workspace_type === "personal") {
      return workspace.owner_user_id === session.user_id || workspace.workspace_id === session.workspace_id;
    }

    if (workspace.workspace_type === "family") {
      return workspace.owner_user_id === session.user_id ||
        currentUserWorkspaceIds.has(workspace.workspace_id) ||
        workspace.workspace_id === session.workspace_id;
    }

    return true;
  });

  if (visibleWorkspaces.length > 0) {
    return visibleWorkspaces.map(workspaceToAppValue);
  }

  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  return [{
    workspaceId: session.workspace_id,
    workspaceName: settings.workspaceName,
    workspaceType: settings.workspaceType,
    ownerUserId: session.user_id,
    ownerUsername: session.username,
  }];
}

async function readWorkspaceCreationOptions(session) {
  const appSettings = await appSettingsRepository.readAll();
  const userCreationPermission = await appSettingsRepository.readWorkspaceCreationPermission(session.user_id);
  const configuredInstallMode = process.env.WORKSPACE_INSTALL_MODE || appSettings.workspace_install_mode || config.workspaceInstallMode;
  const configuredTypeLimit = process.env.WORKSPACE_TYPE_LIMIT || appSettings.workspace_type_limit || config.workspaceTypeLimit;
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

function readWorkspaceCreationModuleSettings(workspaceType) {
  return modulesService.listModuleSettingsForWorkspaceType(workspaceType)
    .map((moduleDefinition) => ({
      ...moduleDefinition,
      settings: (moduleDefinition.settings || []).filter((setting) => setting.moduleStatus === true),
    }))
    .filter((moduleDefinition) => moduleDefinition.settings.length > 0);
}

function resolveCreateWorkspaceModuleStatusChanges(payload, workspaceType) {
  const definitions = buildCreateWorkspaceModuleStatusDefinitionMap(workspaceType);
  const submittedSettings = readSubmittedCreateWorkspaceModuleSettings(payload);
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

function readSubmittedCreateWorkspaceModuleSettings(payload) {
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

      submittedSettings.get(normalizedModuleId).set(normalizedSettingId, value);
    }
  }

  return submittedSettings;
}

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

function formatWorkspaceType(workspaceType) {
  return {
    business: "Business",
    personal: "Personal",
    family: "Family",
  }[workspaceType] || "Workspace";
}

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

  const previousMemberships = await userWorkspacesRepository.readForUser(user.user_id);
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

function workspaceToAppValue(workspace) {
  return {
    workspaceId: workspace.workspace_id,
    workspaceName: workspace.workspace_name,
    workspaceType: workspace.workspace_type,
    ownerUserId: workspace.owner_user_id,
    ownerUsername: workspace.owner_username,
  };
}

async function decorateUserWithMemberships(user) {
  const memberships = await userWorkspacesRepository.readForUser(user.user_id);

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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

export const usersService = {
  action,
  create,
  createWorkspace,
  delete: remove,
  list,
  listWorkspaces,
  readSettings,
  removeOwnWorkspaceMembership,
  saveSettings,
};
