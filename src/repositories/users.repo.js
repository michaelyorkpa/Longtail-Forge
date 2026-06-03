import { randomUUID } from "node:crypto";
import { querySql, runSql, sqlText } from "../db/index.js";
import {
  normalizeDisplayName,
  normalizeOptionalEmail,
  normalizeThemeMode,
  normalizeTimezone,
  normalizeUserStatus,
  userRowToAppValue,
} from "../utils/normalizers.js";

const USER_SELECT_COLUMNS = `
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
`;

async function readByUsername(username) {
  const rows = await querySql(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE username = ${sqlText(username)}
ORDER BY username
LIMIT 1;
`);

  return rows[0] || null;
}

async function readByUsernameExcludingUser(username, userId) {
  const rows = await querySql(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE username = ${sqlText(username)}
  AND user_id != ${sqlText(userId)}
ORDER BY username
LIMIT 1;
`);

  return rows[0] || null;
}

async function readByUsernameForWorkspace(workspaceId, username) {
  const rows = await querySql(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE username = ${sqlText(username)}
  AND (
    home_workspace_id = ${sqlText(workspaceId)}
    OR EXISTS (
      SELECT 1
      FROM user_workspaces
      WHERE user_workspaces.user_id = users.user_id
        AND user_workspaces.workspace_id = ${sqlText(workspaceId)}
    )
  )
LIMIT 1;
`);

  return rows[0] || null;
}

async function readById(workspaceId, userId) {
  const rows = await querySql(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE ${userBelongsToWorkspaceSql(workspaceId, userId)}
ORDER BY rowid
LIMIT 1;
`);

  return rows[0] || null;
}

async function readFirstByUserId(userId) {
  const rows = await querySql(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE user_id = ${sqlText(userId)}
ORDER BY rowid
LIMIT 1;
`);

  return rows[0] || null;
}

async function readAll(workspaceId) {
  const rows = await querySql(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE rowid IN (
  SELECT MIN(user_rows.rowid)
  FROM user_workspaces
  INNER JOIN users AS user_rows
    ON user_rows.user_id = user_workspaces.user_id
  WHERE user_workspaces.workspace_id = ${sqlText(workspaceId)}
  GROUP BY user_workspaces.user_id
)
ORDER BY username;
`);

  return rows.map(userRowToAppValue);
}

async function create(workspaceId, profile, passwordHash) {
  const userId = randomUUID();
  const username = profile.username;
  const displayName = normalizeDisplayName(profile.displayName, username);
  const altEmail = normalizeOptionalEmail(profile.altEmail);
  const timezone = normalizeTimezone(profile.timezone);

  await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(username)},
  ${sqlText(displayName)},
  ${altEmail === null ? "NULL" : sqlText(altEmail)},
  ${sqlText(timezone)},
  ${sqlText(passwordHash)},
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);
`);

  return {
    user_id: userId,
    username,
    displayName,
    altEmail,
    timezone,
    themeMode: "light",
    userStatus: "active",
    protectedUser: false,
  };
}

async function updatePassword(workspaceId, userId, passwordHash) {
  await runSql(`
UPDATE users
SET password = ${sqlText(passwordHash)}
WHERE user_id = ${sqlText(userId)}
  AND ${userBelongsToWorkspaceSql(workspaceId, userId)};
`);
}

async function updateProfile(workspaceId, userId, profile) {
  const altEmail = normalizeOptionalEmail(profile.altEmail);

  await runSql(`
UPDATE users
SET username = ${sqlText(profile.username)},
    display_name = ${sqlText(normalizeDisplayName(profile.displayName, profile.username))},
    alt_email = ${altEmail === null ? "NULL" : sqlText(altEmail)},
    timezone = ${sqlText(normalizeTimezone(profile.timezone))}
WHERE ${userBelongsToWorkspaceSql(workspaceId, userId)};
`);
}

async function updateThemeMode(workspaceId, userId, themeMode) {
  await runSql(`
UPDATE users
SET theme_mode = ${sqlText(normalizeThemeMode(themeMode))}
WHERE ${userBelongsToWorkspaceSql(workspaceId, userId)};
`);
}

async function updateStatus(workspaceId, userId, userStatus) {
  await runSql(`
UPDATE users
SET user_status = ${sqlText(normalizeUserStatus(userStatus))}
WHERE ${userBelongsToWorkspaceSql(workspaceId, userId)};
`);
}

async function updateActiveWorkspace(userId, workspaceId) {
  await runSql(`
UPDATE users
SET active_workspace_id = ${sqlText(workspaceId)}
WHERE user_id = ${sqlText(userId)};
`);
}

async function remove(workspaceId, userId) {
  await runSql(`
DELETE FROM users
WHERE ${userBelongsToWorkspaceSql(workspaceId, userId)};
`);
}

function userBelongsToWorkspaceSql(workspaceId, userId) {
  return `
user_id = ${sqlText(userId)}
  AND (
    home_workspace_id = ${sqlText(workspaceId)}
    OR EXISTS (
      SELECT 1
      FROM user_workspaces
      WHERE user_workspaces.user_id = users.user_id
        AND user_workspaces.workspace_id = ${sqlText(workspaceId)}
    )
  )`;
}

export const usersRepository = {
  create,
  readAll,
  readById,
  readFirstByUserId,
  readByUsername,
  readByUsernameExcludingUser,
  readByUsernameForWorkspace,
  remove,
  updatePassword,
  updateActiveWorkspace,
  updateProfile,
  updateStatus,
  updateThemeMode,
};
