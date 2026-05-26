import { usersRepository } from "../repositories/users.repo.js";
import { createSession, deleteSession } from "../security/sessions.js";
import { hashPassword, validatePassword, verifyPassword } from "../security/passwords.js";
import { AppError } from "../utils/app-error.js";
import { normalizeThemeMode, normalizeUserStatus } from "../utils/normalizers.js";

async function login(payload) {
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "");

  if (!username || !password) {
    throw new AppError("Username and password are required.", 400);
  }

  const user = await usersRepository.readByUsername(username);

  if (!user || !verifyPassword(password, user.password)) {
    throw new AppError("Invalid username or password.", 401);
  }

  if (normalizeUserStatus(user.user_status) !== "active") {
    throw new AppError("This user is inactive.", 401);
  }

  const session = await createSession(user);

  return {
    session,
    themeMode: normalizeThemeMode(user.theme_mode),
    user: {
      organization_id: user.organization_id,
      user_id: user.user_id,
      username: user.username,
      themeMode: normalizeThemeMode(user.theme_mode),
    },
  };
}

async function logout(sessionId) {
  await deleteSession(sessionId);
  return { ok: true };
}

function readSession(session) {
  if (!session) {
    throw new AppError("Not logged in.", 401);
  }

  return {
    user: {
      organization_id: session.organization_id,
      user_id: session.user_id,
      username: session.username,
    },
  };
}

async function changePassword(payload, session) {
  const currentPassword = String(payload.currentPassword || "");
  const newPassword = String(payload.newPassword || "");

  if (!currentPassword || !newPassword) {
    throw new AppError("Current password and new password are required.", 400);
  }

  const user = await usersRepository.readById(session.organization_id, session.user_id);

  if (!user || !verifyPassword(currentPassword, user.password)) {
    throw new AppError("Current password is incorrect.", 400);
  }

  if (verifyPassword(newPassword, user.password)) {
    throw new AppError("New password must be different from the current password.", 400);
  }

  const validation = validatePassword(newPassword, user.username);

  if (!validation.valid) {
    throw new AppError(`New password must ${validation.errors.join(", ")}.`, 400);
  }

  await usersRepository.updatePassword(user.organization_id, user.user_id, hashPassword(newPassword));
  return { ok: true };
}

export const authService = {
  changePassword,
  login,
  logout,
  readSession,
};
