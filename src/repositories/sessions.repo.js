import { querySql, runSql, sqlNullableText, sqlText } from "../db/index.js";

async function create(session) {
  const now = new Date().toISOString();

  await runSql(`
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
  ${sqlText(session.session_id)},
  ${sqlText(session.home_workspace_id || session.workspace_id)},
  ${sqlText(session.active_workspace_id || session.workspace_id || session.home_workspace_id)},
  ${sqlText(session.user_id)},
  ${sqlText(session.username)},
  ${sqlText(session.timezone)},
  ${sqlNullableText(session.ip_address)},
  ${sqlText(session.expires_at)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

async function readById(sessionId) {
  const rows = await querySql(`
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
WHERE session_id = ${sqlText(sessionId)}
LIMIT 1;
`);

  return rows[0] || null;
}

async function remove(sessionId) {
  await runSql(`
DELETE FROM sessions
WHERE session_id = ${sqlText(sessionId)};
`);
}

async function removeExpired(now = new Date()) {
  await runSql(`
DELETE FROM sessions
WHERE expires_at <= ${sqlText(now.toISOString())};
`);
}

async function updateUsernameForUser(workspaceId, userId, username) {
  await runSql(`
UPDATE sessions
SET username = ${sqlText(username)}
WHERE user_id = ${sqlText(userId)}
  AND (
    home_workspace_id = ${sqlText(workspaceId)}
    OR active_workspace_id = ${sqlText(workspaceId)}
  );
`);
}

async function updateTimezoneForUser(workspaceId, userId, timezone) {
  await runSql(`
UPDATE sessions
SET timezone = ${sqlText(timezone)}
WHERE user_id = ${sqlText(userId)}
  AND (
    home_workspace_id = ${sqlText(workspaceId)}
    OR active_workspace_id = ${sqlText(workspaceId)}
  );
`);
}

async function updateActiveWorkspace(sessionId, workspaceId) {
  await runSql(`
UPDATE sessions
SET active_workspace_id = ${sqlText(workspaceId)},
    updated_at = ${sqlText(new Date().toISOString())}
WHERE session_id = ${sqlText(sessionId)};
`);
}

async function updateActiveWorkspaceForUser(userId, workspaceId) {
  await runSql(`
UPDATE sessions
SET active_workspace_id = ${sqlText(workspaceId)},
    updated_at = ${sqlText(new Date().toISOString())}
WHERE user_id = ${sqlText(userId)};
`);
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
