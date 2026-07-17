import { db } from "../core/database.js";

async function create(session) {
  const now = new Date().toISOString();

  await db.run(`
INSERT INTO sessions (
  session_id,
  home_workspace_id,
  active_workspace_id,
  user_id,
  username,
  timezone,
  ip_address,
  session_mode,
  expires_at,
  created_at,
  updated_at
)
VALUES (
  :sessionId,
  :homeWorkspaceId,
  :activeWorkspaceId,
  :userId,
  :username,
  :timezone,
  :ipAddress,
  :sessionMode,
  :expiresAt,
  :createdAt,
  :updatedAt
);
`, {
    activeWorkspaceId: session.active_workspace_id ?? session.workspace_id ?? session.home_workspace_id ?? null,
    createdAt: now,
    expiresAt: session.expires_at,
    homeWorkspaceId: session.home_workspace_id ?? session.workspace_id ?? null,
    ipAddress: session.ip_address || null,
    sessionMode: session.session_mode || "normal",
    sessionId: session.session_id,
    timezone: session.timezone,
    updatedAt: now,
    userId: session.user_id,
    username: session.username,
  });
}

async function readById(sessionId) {
  return db.get(`
SELECT
  sessions.session_id,
  sessions.home_workspace_id,
  sessions.active_workspace_id,
  sessions.user_id,
  sessions.username,
  sessions.timezone,
  sessions.ip_address,
  sessions.session_mode,
  sessions.expires_at,
  users.password_change_required
FROM sessions
INNER JOIN users
  ON users.user_id = sessions.user_id
WHERE sessions.session_id = :sessionId
LIMIT 1;
`, { sessionId });
}

async function listForUser(userId) {
  return db.query(`
SELECT
  session_id,
  home_workspace_id,
  active_workspace_id,
  user_id,
  ip_address,
  expires_at,
  created_at,
  updated_at
FROM sessions
WHERE user_id = :userId
ORDER BY created_at DESC, session_id;
`, { userId });
}

async function listForUserInWorkspace(userId, workspaceId) {
  return db.query(`
SELECT
  session_id,
  home_workspace_id,
  active_workspace_id,
  user_id,
  ip_address,
  expires_at,
  created_at,
  updated_at
FROM sessions
WHERE user_id = :userId
  AND (
    home_workspace_id = :workspaceId
    OR active_workspace_id = :workspaceId
  )
ORDER BY created_at DESC, session_id;
`, { userId, workspaceId });
}

async function remove(sessionId) {
  const existing = await readById(sessionId);
  await db.run(`
DELETE FROM sessions
WHERE session_id = :sessionId;
`, { sessionId });
  return existing ? 1 : 0;
}

async function removeAllForUser(userId) {
  const count = await db.get(`
SELECT COUNT(*) AS session_count
FROM sessions
WHERE user_id = :userId;
`, { userId });
  await db.run(`
DELETE FROM sessions
WHERE user_id = :userId;
`, { userId });
  return Number(count?.session_count || 0);
}

async function removeAllForUserExcept(userId, excludedSessionId) {
  const count = await db.get(`
SELECT COUNT(*) AS session_count
FROM sessions
WHERE user_id = :userId
  AND session_id != :excludedSessionId;
`, { excludedSessionId, userId });
  await db.run(`
DELETE FROM sessions
WHERE user_id = :userId
  AND session_id != :excludedSessionId;
`, { excludedSessionId, userId });
  return Number(count?.session_count || 0);
}

async function removeAllForUserInWorkspace(userId, workspaceId) {
  const count = await db.get(`
SELECT COUNT(*) AS session_count
FROM sessions
WHERE user_id = :userId
  AND (
    home_workspace_id = :workspaceId
    OR active_workspace_id = :workspaceId
  );
`, { userId, workspaceId });
  await db.run(`
DELETE FROM sessions
WHERE user_id = :userId
  AND (
    home_workspace_id = :workspaceId
    OR active_workspace_id = :workspaceId
  );
`, { userId, workspaceId });
  return Number(count?.session_count || 0);
}

async function removeExpired(now = new Date()) {
  await db.run(`
DELETE FROM sessions
WHERE expires_at <= :now;
`, { now: now.toISOString() });
}

async function updateUsernameForUser(workspaceId, userId, username) {
  await db.run(`
UPDATE sessions
SET username = :username
WHERE user_id = :userId
  AND (
    home_workspace_id = :workspaceId
    OR active_workspace_id = :workspaceId
  );
`, { userId, username, workspaceId });
}

async function updateTimezoneForUser(workspaceId, userId, timezone) {
  await db.run(`
UPDATE sessions
SET timezone = :timezone
WHERE user_id = :userId
  AND (
    home_workspace_id = :workspaceId
    OR active_workspace_id = :workspaceId
  );
`, { timezone, userId, workspaceId });
}

async function updateActiveWorkspace(sessionId, workspaceId) {
  await db.run(`
UPDATE sessions
SET active_workspace_id = :workspaceId,
    updated_at = :updatedAt
WHERE session_id = :sessionId;
`, { sessionId, updatedAt: new Date().toISOString(), workspaceId });
}

async function updateActiveWorkspaceForUser(userId, workspaceId) {
  await db.run(`
UPDATE sessions
SET active_workspace_id = :workspaceId,
    updated_at = :updatedAt
WHERE user_id = :userId;
`, { updatedAt: new Date().toISOString(), userId, workspaceId });
}

export const sessionsRepository = {
  create,
  listForUser,
  listForUserInWorkspace,
  readById,
  remove,
  removeAllForUser,
  removeAllForUserExcept,
  removeAllForUserInWorkspace,
  removeExpired,
  updateActiveWorkspace,
  updateActiveWorkspaceForUser,
  updateTimezoneForUser,
  updateUsernameForUser,
};
