import { usersRepository } from "../repositories/users.repo.js";
import { createGeneratedPassword, hashPassword, validatePassword } from "../security/passwords.js";
import { auditService } from "./audit.service.js";
import { AppError } from "../utils/app-error.js";
import {
  normalizeProtectedUserFlag,
  normalizeThemeMode,
  normalizeUsername,
  userRowToAppValue,
} from "../utils/normalizers.js";

async function list(session) {
  const users = await usersRepository.readAll(session.organization_id);
  return { users };
}

async function create(payload, session) {
  const username = normalizeUsername(payload.username);

  if (!username) {
    throw new AppError("Username is required.", 400);
  }

  const existingUser = await usersRepository.readByUsernameForOrganization(session.organization_id, username);

  if (existingUser) {
    throw new AppError("A user with that username already exists.", 409);
  }

  const initialPassword = createGeneratedPassword();
  const validation = validatePassword(initialPassword, username);

  if (!validation.valid) {
    throw new AppError("Generated password did not meet password requirements.", 500);
  }

  const user = await usersRepository.create(session.organization_id, username, hashPassword(initialPassword));
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
  const username = normalizeUsername(payload.username);
  const user = await usersRepository.readById(session.organization_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  if (!username) {
    throw new AppError("Username is required.", 400);
  }

  const existingUser = await usersRepository.readByUsernameForOrganization(session.organization_id, username);

  if (existingUser && existingUser.user_id !== userId) {
    throw new AppError("A user with that username already exists.", 409);
  }

  await usersRepository.updateUsername(session.organization_id, userId, username);
  const updatedUser = {
    ...userRowToAppValue(user),
    username,
  };

  await auditService.record({
    session,
    action: "user_username_updated",
    changeType: "update",
    recordType: "user",
    recordId: userId,
    recordLabel: username,
    recordUrl: "user-admin.html",
    previousValue: userRowToAppValue(user),
    newValue: updatedUser,
    metadata: {
      old_username: user.username,
      new_username: username,
    },
  });

  return {
    user: updatedUser,
    users: await usersRepository.readAll(session.organization_id),
  };
}

async function resetPassword(session, userId) {
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
  const user = await usersRepository.readById(session.organization_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  if (normalizeProtectedUserFlag(user.protected_user)) {
    throw new AppError("Protected users cannot be deactivated.", 400);
  }

  await usersRepository.updateStatus(session.organization_id, userId, "inactive");
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

  return {
    user: updatedUser,
    users: await usersRepository.readAll(session.organization_id),
  };
}

async function reactivate(session, userId) {
  const user = await usersRepository.readById(session.organization_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  await usersRepository.updateStatus(session.organization_id, userId, "active");
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

  return {
    user: updatedUser,
    users: await usersRepository.readAll(session.organization_id),
  };
}

async function remove(session, userId) {
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

  return { users: await usersRepository.readAll(session.organization_id) };
}

async function readSettings(session) {
  const user = await usersRepository.readById(session.organization_id, session.user_id);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  return { themeMode: normalizeThemeMode(user.theme_mode) };
}

async function saveSettings(payload, session) {
  const themeMode = normalizeThemeMode(payload.themeMode);

  await usersRepository.updateThemeMode(session.organization_id, session.user_id, themeMode);
  await auditService.record({
    session,
    action: "user_settings_updated",
    changeType: "settings_change",
    recordType: "user",
    recordId: session.user_id,
    recordLabel: session.username,
    recordUrl: "user-settings.html",
    previousValue: null,
    newValue: { themeMode },
    metadata: {
      setting_group: "user",
      setting_name: "themeMode",
    },
  });

  return { themeMode };
}

export const usersService = {
  action,
  create,
  delete: remove,
  list,
  readSettings,
  saveSettings,
};
