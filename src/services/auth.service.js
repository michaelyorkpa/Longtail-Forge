import { usersRepository } from "../repositories/users.repo.js";
import { createSession, deleteSession } from "../security/sessions.js";
import { hashPassword, validatePassword, verifyPassword } from "../security/passwords.js";
import { auditService } from "./audit.service.js";
import { AppError } from "../utils/app-error.js";
import {
  normalizeOptionalEmail,
  normalizeThemeMode,
  normalizeTimezone,
  normalizeUserStatus,
  normalizeUsername,
} from "../utils/normalizers.js";

async function login(payload) {
  const username = normalizeUsername(payload.username);
  const password = String(payload.password || "");

  if (!username || !password) {
    throw new AppError("Email address and password are required.", 400);
  }

  const user = await usersRepository.readByUsername(username);

  if (!user || !verifyPassword(password, user.password)) {
    throw new AppError("Invalid email address or password.", 401);
  }

  if (normalizeUserStatus(user.user_status) !== "active") {
    throw new AppError("This user is inactive.", 401);
  }

  const session = await createSession(user);
  await auditService.record({
    organizationId: user.organization_id,
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
  });

  return {
    session,
    themeMode: normalizeThemeMode(user.theme_mode),
    user: {
      organization_id: user.organization_id,
      user_id: user.user_id,
      username: user.username,
      displayName: user.display_name || user.username,
      altEmail: normalizeOptionalEmail(user.alt_email),
      timezone: normalizeTimezone(user.timezone),
      themeMode: normalizeThemeMode(user.theme_mode),
    },
  };
}

async function logout(sessionId, session = null) {
  await deleteSession(sessionId);

  if (session) {
    await auditService.record({
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
    },
  });

  return { ok: true };
}

export const authService = {
  changePassword,
  login,
  logout,
  readSession,
};
