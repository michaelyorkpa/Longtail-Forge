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
  organization_id,
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

async function readByUsernameForOrganization(organizationId, username) {
  const rows = await querySql(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE organization_id = ${sqlText(organizationId)}
  AND username = ${sqlText(username)}
LIMIT 1;
`);

  return rows[0] || null;
}

async function readById(organizationId, userId) {
  const rows = await querySql(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE organization_id = ${sqlText(organizationId)}
  AND user_id = ${sqlText(userId)}
LIMIT 1;
`);

  return rows[0] || null;
}

async function readAll(organizationId) {
  const rows = await querySql(`
SELECT
  user_id,
  username,
  display_name,
  alt_email,
  timezone,
  theme_mode,
  user_status,
  protected_user
FROM users
WHERE organization_id = ${sqlText(organizationId)}
ORDER BY username;
`);

  return rows.map(userRowToAppValue);
}

async function create(organizationId, profile, passwordHash) {
  const userId = randomUUID();
  const username = profile.username;
  const displayName = normalizeDisplayName(profile.displayName, username);
  const altEmail = normalizeOptionalEmail(profile.altEmail);
  const timezone = normalizeTimezone(profile.timezone);

  await runSql(`
INSERT INTO users (
  user_id,
  organization_id,
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
  ${sqlText(organizationId)},
  ${sqlText(username)},
  ${sqlText(displayName)},
  ${altEmail === null ? "NULL" : sqlText(altEmail)},
  ${sqlText(timezone)},
  ${sqlText(passwordHash)},
  'light',
  'active',
  'no',
  ${sqlText(organizationId)}
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

async function updatePassword(organizationId, userId, passwordHash) {
  await runSql(`
UPDATE users
SET password = ${sqlText(passwordHash)}
WHERE organization_id = ${sqlText(organizationId)}
  AND user_id = ${sqlText(userId)};
`);
}

async function updateProfile(organizationId, userId, profile) {
  const altEmail = normalizeOptionalEmail(profile.altEmail);

  await runSql(`
UPDATE users
SET username = ${sqlText(profile.username)},
    display_name = ${sqlText(normalizeDisplayName(profile.displayName, profile.username))},
    alt_email = ${altEmail === null ? "NULL" : sqlText(altEmail)},
    timezone = ${sqlText(normalizeTimezone(profile.timezone))}
WHERE organization_id = ${sqlText(organizationId)}
  AND user_id = ${sqlText(userId)};
`);
}

async function updateThemeMode(organizationId, userId, themeMode) {
  await runSql(`
UPDATE users
SET theme_mode = ${sqlText(normalizeThemeMode(themeMode))}
WHERE organization_id = ${sqlText(organizationId)}
  AND user_id = ${sqlText(userId)};
`);
}

async function updateStatus(organizationId, userId, userStatus) {
  await runSql(`
UPDATE users
SET user_status = ${sqlText(normalizeUserStatus(userStatus))}
WHERE organization_id = ${sqlText(organizationId)}
  AND user_id = ${sqlText(userId)};
`);
}

async function updateActiveWorkspace(userId, workspaceId) {
  await runSql(`
UPDATE users
SET active_workspace_id = ${sqlText(workspaceId)}
WHERE user_id = ${sqlText(userId)};
`);
}

async function remove(organizationId, userId) {
  await runSql(`
DELETE FROM users
WHERE organization_id = ${sqlText(organizationId)}
  AND user_id = ${sqlText(userId)};
`);
}

export const usersRepository = {
  create,
  readAll,
  readById,
  readByUsername,
  readByUsernameExcludingUser,
  readByUsernameForOrganization,
  remove,
  updatePassword,
  updateActiveWorkspace,
  updateProfile,
  updateStatus,
  updateThemeMode,
};
