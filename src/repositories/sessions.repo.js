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
  :expiresAt,
  :createdAt,
  :updatedAt
);
`, {
    activeWorkspaceId: session.active_workspace_id || session.workspace_id || session.home_workspace_id,
    createdAt: now,
    expiresAt: session.expires_at,
    homeWorkspaceId: session.home_workspace_id || session.workspace_id,
    ipAddress: session.ip_address || null,
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
  session_id,
  home_workspace_id,
  active_workspace_id,
  user_id,
  username,
  timezone,
  ip_address,
  expires_at
FROM sessions
WHERE session_id = :sessionId
LIMIT 1;
`, { sessionId });
}

async function remove(sessionId) {
  await db.run(`
DELETE FROM sessions
WHERE session_id = :sessionId;
`, { sessionId });
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
  readById,
  remove,
  removeExpired,
  updateActiveWorkspace,
  updateActiveWorkspaceForUser,
  updateTimezoneForUser,
  updateUsernameForUser,
};
