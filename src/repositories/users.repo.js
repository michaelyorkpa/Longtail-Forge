import { randomUUID } from "node:crypto";
import { querySql, runSql, sqlText } from "../db/index.js";
import {
  normalizeThemeMode,
  normalizeUserStatus,
  userRowToAppValue,
} from "../utils/normalizers.js";

async function readByUsername(username) {
  const rows = await querySql(`
SELECT
  user_id,
  organization_id,
  username,
  password,
  theme_mode,
  user_status,
  protected_user
FROM users
WHERE username = ${sqlText(username)}
ORDER BY username
LIMIT 1;
`);

  return rows[0] || null;
}

async function readByUsernameForOrganization(organizationId, username) {
  const rows = await querySql(`
SELECT
  user_id,
  organization_id,
  username,
  password,
  theme_mode,
  user_status,
  protected_user
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
  user_id,
  organization_id,
  username,
  password,
  theme_mode,
  user_status,
  protected_user
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
  theme_mode,
  user_status,
  protected_user
FROM users
WHERE organization_id = ${sqlText(organizationId)}
ORDER BY username;
`);

  return rows.map(userRowToAppValue);
}

async function create(organizationId, username, passwordHash) {
  const userId = randomUUID();

  await runSql(`
INSERT INTO users (user_id, organization_id, username, password, theme_mode, user_status, protected_user)
VALUES (
  ${sqlText(userId)},
  ${sqlText(organizationId)},
  ${sqlText(username)},
  ${sqlText(passwordHash)},
  'light',
  'active',
  'no'
);
`);

  return {
    user_id: userId,
    username,
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

async function updateUsername(organizationId, userId, username) {
  await runSql(`
UPDATE users
SET username = ${sqlText(username)}
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
  readByUsernameForOrganization,
  remove,
  updatePassword,
  updateStatus,
  updateThemeMode,
  updateUsername,
};
