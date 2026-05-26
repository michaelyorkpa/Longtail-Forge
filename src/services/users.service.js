import { usersRepository } from "../repositories/users.repo.js";
import { createGeneratedPassword, hashPassword, validatePassword } from "../security/passwords.js";
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

  return {
    user: {
      ...userRowToAppValue(user),
      username,
    },
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

  return {
    user: {
      ...userRowToAppValue(user),
      userStatus: "inactive",
    },
    users: await usersRepository.readAll(session.organization_id),
  };
}

async function reactivate(session, userId) {
  const user = await usersRepository.readById(session.organization_id, userId);

  if (!user) {
    throw new AppError("User was not found.", 404);
  }

  await usersRepository.updateStatus(session.organization_id, userId, "active");

  return {
    user: {
      ...userRowToAppValue(user),
      userStatus: "active",
    },
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
