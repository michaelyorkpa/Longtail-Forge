import { usersRepository } from "../repositories/users.repo.js";
import { sessionsRepository } from "../repositories/sessions.repo.js";
import { settingsRepository } from "../repositories/settings.repo.js";
import { userWorkspacesRepository } from "../repositories/user-workspaces.repo.js";
import { createGeneratedPassword, hashPassword, validatePassword } from "../security/passwords.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { AppError } from "../utils/app-error.js";
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
  await permissionsService.assertCan(session, "users.manage", { organization_id: session.organization_id, operation: "read" });
  const users = await usersRepository.readAll(session.organization_id);
  return { users };
}

async function create(payload, session) {
  await permissionsService.assertCan(session, "users.manage", { organization_id: session.organization_id, operation: "create" });
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
    session.organization_id,
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
    workspaceId: session.organization_id,
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

  const users = await usersRepository.readAll(session.organization_id);

  return {
    user,
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
  await permissionsService.assertCan(session, "users.manage", { organization_id: session.organization_id, operation: "update" });
  const user = await usersRepository.readById(session.organization_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  const profile = normalizeUserProfilePayload(payload, user);

  const existingUser = await usersRepository.readByUsernameExcludingUser(profile.username, userId);

  if (existingUser && existingUser.user_id !== userId) {
    throw new AppError("A user with that email address already exists.", 409);
  }

  await usersRepository.updateProfile(session.organization_id, userId, profile);
  await sessionsRepository.updateUsernameForUser(session.organization_id, userId, profile.username);
  await sessionsRepository.updateTimezoneForUser(session.organization_id, userId, profile.timezone);
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

  return {
    user: updatedUser,
    users: await usersRepository.readAll(session.organization_id),
  };
}

async function resetPassword(session, userId) {
  await permissionsService.assertCan(session, "users.manage", { organization_id: session.organization_id, operation: "update" });
  const user = await usersRepository.readById(session.organization_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  const initialPassword = createGeneratedPassword();
  const validation = validatePassword(initialPassword, user.username);

  if (!validation.valid) {
    throw new AppError("Generated password did not meet password requirements.", 500);
  }

  await usersRepository.updatePassword(session.organization_id, userId, hashPassword(initialPassword));
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
    users: await usersRepository.readAll(session.organization_id),
    initialPassword,
  };
}

async function deactivate(session, userId) {
  await permissionsService.assertCan(session, "users.manage", { organization_id: session.organization_id, operation: "update" });
  const user = await usersRepository.readById(session.organization_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  if (normalizeProtectedUserFlag(user.protected_user)) {
    throw new AppError("Protected users cannot be deactivated.", 400);
  }

  await usersRepository.updateStatus(session.organization_id, userId, "inactive");
  const previousMembership = await userWorkspacesRepository.readByUserAndWorkspace(userId, session.organization_id);
  const nextMembership = await userWorkspacesRepository.updateStatus(userId, session.organization_id, "inactive");
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
    users: await usersRepository.readAll(session.organization_id),
  };
}

async function reactivate(session, userId) {
  await permissionsService.assertCan(session, "users.manage", { organization_id: session.organization_id, operation: "update" });
  const user = await usersRepository.readById(session.organization_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  await usersRepository.updateStatus(session.organization_id, userId, "active");
  const previousMembership = await userWorkspacesRepository.readByUserAndWorkspace(userId, session.organization_id);
  const nextMembership = await userWorkspacesRepository.upsert({
    userId,
    workspaceId: session.organization_id,
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
    users: await usersRepository.readAll(session.organization_id),
  };
}

async function remove(session, userId) {
  await permissionsService.assertCan(session, "users.manage", { organization_id: session.organization_id, operation: "delete" });
  if (!userId) {
    throw new AppError("User was not found.", 404);
  }

  const user = await usersRepository.readById(session.organization_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  if (normalizeProtectedUserFlag(user.protected_user)) {
    throw new AppError("Protected users cannot be deleted.", 400);
  }

  const previousMembership = await userWorkspacesRepository.readByUserAndWorkspace(userId, session.organization_id);
  await userWorkspacesRepository.remove(userId, session.organization_id);
  await usersRepository.remove(session.organization_id, userId);
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

  return { users: await usersRepository.readAll(session.organization_id) };
}

async function readSettings(session) {
  const user = await usersRepository.readById(session.organization_id, session.user_id);

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
  };
}

async function saveSettings(payload, session) {
  const user = await usersRepository.readById(session.organization_id, session.user_id);

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
    await usersRepository.updateThemeMode(session.organization_id, session.user_id, themeMode);
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

    await usersRepository.updateProfile(session.organization_id, session.user_id, profile);
    await sessionsRepository.updateUsernameForUser(session.organization_id, session.user_id, profile.username);
    await sessionsRepository.updateTimezoneForUser(session.organization_id, session.user_id, profile.timezone);
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
    recordId: newValue?.user_workspace_id || previousValue?.user_workspace_id || `${session.organization_id}:${user.user_id}`,
    recordLabel: user.username,
    recordUrl: "user-admin.html",
    previousValue,
    newValue,
    metadata: {
      user_id: user.user_id,
      username: user.username,
      workspace_id: session.organization_id,
    },
  });
}

async function assertWorkspaceCanAddUser(session) {
  const settings = await settingsRepository.readOrganizationSettings(session.organization_id);

  if (settings.workspaceType === "personal") {
    throw new AppError("Personal workspaces cannot add other users.", 400);
  }

  if (settings.workspaceType !== "family") {
    return;
  }

  const activeMembershipCount = await userWorkspacesRepository.countActiveForWorkspace(session.organization_id);

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

export const usersService = {
  action,
  create,
  delete: remove,
  list,
  readSettings,
  saveSettings,
};
