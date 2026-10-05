import { db } from "../core/database.js";

/** @typedef {import("../types/database-contracts.js").DatabaseRow} DatabaseRow */
/** @typedef {import("../types/database-contracts.js").TransactionClient} TransactionClient */

/** @typedef {DatabaseRow & {
 *   session_id: string,
 *   home_workspace_id: string | null,
 *   active_workspace_id: string | null,
 *   user_id: string,
 *   username: string,
 *   timezone: string,
 *   ip_address: string | null,
 *   session_mode: string | null,
 *   support_session_id: string | null,
 *   expires_at: string,
 *   password_change_required?: boolean | number | string | null,
 * }} StoredSession */
/** @typedef {DatabaseRow & {
 *   session_id: string,
 *   home_workspace_id: string | null,
 *   active_workspace_id: string | null,
 *   user_id: string,
 *   ip_address: string | null,
 *   expires_at: string,
 *   created_at: string,
 *   updated_at: string,
 * }} StoredSessionListRow */
/**
 * @typedef {Object} SessionCreateInput
 * @property {string} session_id
 * @property {string} user_id
 * @property {string} username
 * @property {string} timezone
 * @property {string} expires_at
 * @property {string | null | undefined} [workspace_id]
 * @property {string | null | undefined} [home_workspace_id]
 * @property {string | null | undefined} [active_workspace_id]
 * @property {string | null | undefined} [ip_address]
 * @property {string | null | undefined} [session_mode]
 * @property {string | null | undefined} [support_session_id]
 */
/** @typedef {DatabaseRow & { session_count: unknown }} SessionCountRow */

/** @param {SessionCreateInput} session @param {TransactionClient} [database] @returns {Promise<void>} */
async function create(session, database = db) {
  const now = new Date().toISOString();

  await database.run(`
INSERT INTO sessions (
  session_id,
  home_workspace_id,
  active_workspace_id,
  user_id,
  username,
  timezone,
  ip_address,
  session_mode,
  support_session_id,
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
  :supportSessionId,
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
    supportSessionId: session.support_session_id || null,
    sessionId: session.session_id,
    timezone: session.timezone,
    updatedAt: now,
    userId: session.user_id,
    username: session.username,
  });
}

/** @param {string} sessionId @param {TransactionClient} [database] @returns {Promise<StoredSession | null>} */
async function readById(sessionId, database = db) {
  return /** @type {Promise<StoredSession | null>} */ (database.get(`
SELECT
  sessions.session_id,
  sessions.home_workspace_id,
  sessions.active_workspace_id,
  sessions.user_id,
  sessions.username,
  sessions.timezone,
  sessions.ip_address,
  sessions.session_mode,
  sessions.support_session_id,
  sessions.expires_at,
  users.password_change_required
FROM sessions
INNER JOIN users
  ON users.user_id = sessions.user_id
WHERE sessions.session_id = :sessionId
LIMIT 1;
`, { sessionId }));
}

/** @param {string} userId @returns {Promise<StoredSessionListRow[]>} */
async function listForUser(userId) {
  return /** @type {Promise<StoredSessionListRow[]>} */ (db.query(`
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
`, { userId }));
}

/** @param {string} userId @param {string} workspaceId @returns {Promise<StoredSessionListRow[]>} */
async function listForUserInWorkspace(userId, workspaceId) {
  return /** @type {Promise<StoredSessionListRow[]>} */ (db.query(`
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
`, { userId, workspaceId }));
}

/** @param {string} sessionId @param {TransactionClient} [database] @returns {Promise<number>} */
async function remove(sessionId, database = db) {
  const existing = database === db ? await readById(sessionId) : true;
  await database.run(`
DELETE FROM sessions
WHERE session_id = :sessionId;
`, { sessionId });
  return existing ? 1 : 0;
}

/** @param {string} userId @returns {Promise<number>} */
async function removeAllForUser(userId) {
  const count = /** @type {SessionCountRow | null} */ (await db.get(`
SELECT COUNT(*) AS session_count
FROM sessions
WHERE user_id = :userId;
`, { userId }));
  await db.run(`
DELETE FROM sessions
WHERE user_id = :userId;
`, { userId });
  return Number(count?.session_count || 0);
}

/** @param {string} userId @param {string} excludedSessionId @returns {Promise<number>} */
async function removeAllForUserExcept(userId, excludedSessionId) {
  const count = /** @type {SessionCountRow | null} */ (await db.get(`
SELECT COUNT(*) AS session_count
FROM sessions
WHERE user_id = :userId
  AND session_id != :excludedSessionId;
`, { excludedSessionId, userId }));
  await db.run(`
DELETE FROM sessions
WHERE user_id = :userId
  AND session_id != :excludedSessionId;
`, { excludedSessionId, userId });
  return Number(count?.session_count || 0);
}

/** @param {string} userId @param {string} workspaceId @returns {Promise<number>} */
async function removeAllForUserInWorkspace(userId, workspaceId) {
  const count = /** @type {SessionCountRow | null} */ (await db.get(`
SELECT COUNT(*) AS session_count
FROM sessions
WHERE user_id = :userId
  AND (
    home_workspace_id = :workspaceId
    OR active_workspace_id = :workspaceId
  );
`, { userId, workspaceId }));
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

/** @param {Date} [now] @returns {Promise<void>} */
async function removeExpired(now = new Date()) {
  await db.run(`
DELETE FROM sessions
WHERE expires_at <= :now
  AND support_session_id IS NULL;
`, { now: now.toISOString() });
}

/** @param {string} workspaceId @param {string} userId @param {string} username @returns {Promise<void>} */
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

/** @param {string} workspaceId @param {string} userId @param {string} timezone @returns {Promise<void>} */
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

/** @param {string} sessionId @param {string | null} workspaceId @returns {Promise<void>} */
async function updateActiveWorkspace(sessionId, workspaceId) {
  await db.run(`
UPDATE sessions
SET active_workspace_id = :workspaceId,
    updated_at = :updatedAt
WHERE session_id = :sessionId;
`, { sessionId, updatedAt: new Date().toISOString(), workspaceId });
}

/** @param {string} userId @param {string | null} workspaceId @returns {Promise<void>} */
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
