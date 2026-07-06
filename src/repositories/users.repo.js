import { randomUUID } from "node:crypto";
import { db } from "../core/database.js";
import {
  normalizeDisplayName,
  normalizeOptionalEmail,
  normalizeThemeAutoSource,
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
  theme_auto_source,
  open_external_links_new_tab,
  user_status,
  protected_user,
  active_workspace_id
`;

const USER_BELONGS_TO_WORKSPACE_SQL = `
user_id = :userId
  AND (
    home_workspace_id = :workspaceId
    OR EXISTS (
      SELECT 1
      FROM user_workspaces
      WHERE user_workspaces.user_id = users.user_id
        AND user_workspaces.workspace_id = :workspaceId
    )
  )`;
const USERS_PHYSICAL_ROW_ID = db.dialect.identity.rowId({ tableAlias: "users" });
const USER_ROWS_PHYSICAL_ROW_ID = db.dialect.identity.rowId({ tableAlias: "user_rows" });

async function readByUsername(username) {
  return db.get(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE username = :username
ORDER BY username
LIMIT 1;
`, { username });
}

async function readByUsernameExcludingUser(username, userId) {
  return db.get(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE username = :username
  AND user_id != :userId
ORDER BY username
LIMIT 1;
`, { userId, username });
}

async function readByUsernameForWorkspace(workspaceId, username) {
  return db.get(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE username = :username
  AND (
    home_workspace_id = :workspaceId
    OR EXISTS (
      SELECT 1
      FROM user_workspaces
      WHERE user_workspaces.user_id = users.user_id
        AND user_workspaces.workspace_id = :workspaceId
    )
  )
LIMIT 1;
`, { username, workspaceId });
}

async function readById(workspaceId, userId) {
  return db.get(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE ${USER_BELONGS_TO_WORKSPACE_SQL}
ORDER BY ${USERS_PHYSICAL_ROW_ID}
LIMIT 1;
`, { userId, workspaceId });
}

async function readFirstByUserId(userId) {
  return db.get(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE user_id = :userId
ORDER BY ${USERS_PHYSICAL_ROW_ID}
LIMIT 1;
`, { userId });
}

async function readAll(workspaceId) {
  const rows = await db.query(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE ${USERS_PHYSICAL_ROW_ID} IN (
  SELECT MIN(${USER_ROWS_PHYSICAL_ROW_ID})
  FROM user_workspaces
  INNER JOIN users AS user_rows
    ON user_rows.user_id = user_workspaces.user_id
  WHERE user_workspaces.workspace_id = :workspaceId
  GROUP BY user_workspaces.user_id
)
ORDER BY username;
`, { workspaceId });

  return rows.map(userRowToAppValue);
}

async function create(workspaceId, profile, passwordHash) {
  const userId = randomUUID();
  const username = profile.username;
  const displayName = normalizeDisplayName(profile.displayName, username);
  const altEmail = normalizeOptionalEmail(profile.altEmail);
  const timezone = normalizeTimezone(profile.timezone);

  await db.run(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  theme_auto_source,
  open_external_links_new_tab,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  :userId,
  :workspaceId,
  :username,
  :displayName,
  :altEmail,
  :timezone,
  :passwordHash,
  'light',
  'system',
  0,
  'active',
  'no',
  :workspaceId
);
`, {
    altEmail,
    displayName,
    passwordHash,
    timezone,
    userId,
    username,
    workspaceId,
  });

  return {
    user_id: userId,
    username,
    displayName,
    altEmail,
    timezone,
    themeMode: "light",
    themeAutoSource: "system",
    openExternalLinksNewTab: false,
    userStatus: "active",
    protectedUser: false,
  };
}

async function updatePassword(workspaceId, userId, passwordHash) {
  await db.run(`
UPDATE users
SET password = :passwordHash
WHERE user_id = :userId
  AND ${USER_BELONGS_TO_WORKSPACE_SQL};
`, { passwordHash, userId, workspaceId });
}

async function updateProfile(workspaceId, userId, profile) {
  await db.run(`
UPDATE users
SET username = :username,
    display_name = :displayName,
    alt_email = :altEmail,
    timezone = :timezone
WHERE ${USER_BELONGS_TO_WORKSPACE_SQL};
`, {
    altEmail: normalizeOptionalEmail(profile.altEmail),
    displayName: normalizeDisplayName(profile.displayName, profile.username),
    timezone: normalizeTimezone(profile.timezone),
    userId,
    username: profile.username,
    workspaceId,
  });
}

async function updateThemeMode(workspaceId, userId, themeMode) {
  await db.run(`
UPDATE users
SET theme_mode = :themeMode
WHERE ${USER_BELONGS_TO_WORKSPACE_SQL};
`, { themeMode: normalizeThemeMode(themeMode), userId, workspaceId });
}

async function updateThemeAutoSource(workspaceId, userId, themeAutoSource) {
  await db.run(`
UPDATE users
SET theme_auto_source = :themeAutoSource
WHERE ${USER_BELONGS_TO_WORKSPACE_SQL};
`, { themeAutoSource: normalizeThemeAutoSource(themeAutoSource), userId, workspaceId });
}

async function updateOpenExternalLinksNewTab(workspaceId, userId, openExternalLinksNewTab) {
  await db.run(`
UPDATE users
SET open_external_links_new_tab = :openExternalLinksNewTab
WHERE ${USER_BELONGS_TO_WORKSPACE_SQL};
`, {
    openExternalLinksNewTab: openExternalLinksNewTab ? 1 : 0,
    userId,
    workspaceId,
  });
}

async function updateStatus(workspaceId, userId, userStatus) {
  await db.run(`
UPDATE users
SET user_status = :userStatus
WHERE ${USER_BELONGS_TO_WORKSPACE_SQL};
`, { userId, userStatus: normalizeUserStatus(userStatus), workspaceId });
}

async function updateActiveWorkspace(userId, workspaceId) {
  await db.run(`
UPDATE users
SET active_workspace_id = :workspaceId
WHERE user_id = :userId;
`, { userId, workspaceId });
}

async function remove(workspaceId, userId) {
  const deletable = await db.get(`
SELECT user_id
FROM users
WHERE ${USER_BELONGS_TO_WORKSPACE_SQL}
LIMIT 1;
`, { userId, workspaceId });

  if (!deletable) {
    return;
  }

  await db.transaction(async (transaction) => {
    for (const statement of USER_REMOVAL_STATEMENTS) {
      await transaction.run(statement, { userId });
    }

    await transaction.run(`
DELETE FROM users
WHERE ${USER_BELONGS_TO_WORKSPACE_SQL};
`, { userId, workspaceId });
  });
}

const USER_REMOVAL_STATEMENTS = [
  "DELETE FROM sessions WHERE user_id = :userId;",
  "DELETE FROM user_workspaces WHERE user_id = :userId;",
  "DELETE FROM user_workspace_creation_permissions WHERE user_id = :userId;",
  "DELETE FROM user_role_assignments WHERE user_id = :userId;",
  "DELETE FROM notification_user_preferences WHERE user_id = :userId;",
  "DELETE FROM notification_subscriptions WHERE user_id = :userId;",
  "DELETE FROM notifications WHERE recipient_user_id = :userId;",
  "UPDATE notifications SET actor_user_id = NULL WHERE actor_user_id = :userId;",
  "DELETE FROM work_resume_state WHERE user_id = :userId;",
  `
DELETE FROM api_key_scopes
WHERE api_key_id IN (
  SELECT api_key_id
  FROM api_keys
  WHERE created_by_user_id = :userId
);
`,
  "DELETE FROM api_keys WHERE created_by_user_id = :userId;",
  "UPDATE tags SET created_by_user_id = NULL WHERE created_by_user_id = :userId;",
  "UPDATE tag_assignments SET created_by_user_id = NULL WHERE created_by_user_id = :userId;",
  "UPDATE tag_assignment_suppressions SET suppressed_by_user_id = NULL WHERE suppressed_by_user_id = :userId;",
  "UPDATE files SET uploaded_by_user_id = NULL WHERE uploaded_by_user_id = :userId;",
  "UPDATE file_attachments SET attached_by_user_id = NULL WHERE attached_by_user_id = :userId;",
  "UPDATE note_links SET created_by_user_id = NULL WHERE created_by_user_id = :userId;",
  "UPDATE note_library_collections SET created_by_user_id = NULL WHERE created_by_user_id = :userId;",
  `
UPDATE lists
SET created_by_user_id = CASE WHEN created_by_user_id = :userId THEN NULL ELSE created_by_user_id END,
    updated_by_user_id = CASE WHEN updated_by_user_id = :userId THEN NULL ELSE updated_by_user_id END,
    finalized_by_user_id = CASE WHEN finalized_by_user_id = :userId THEN NULL ELSE finalized_by_user_id END
WHERE created_by_user_id = :userId
   OR updated_by_user_id = :userId
   OR finalized_by_user_id = :userId;
`,
  `
UPDATE list_items
SET assigned_user_id = CASE WHEN assigned_user_id = :userId THEN NULL ELSE assigned_user_id END,
    created_by_user_id = CASE WHEN created_by_user_id = :userId THEN NULL ELSE created_by_user_id END,
    updated_by_user_id = CASE WHEN updated_by_user_id = :userId THEN NULL ELSE updated_by_user_id END,
    checked_by_user_id = CASE WHEN checked_by_user_id = :userId THEN NULL ELSE checked_by_user_id END,
    completed_by_user_id = CASE WHEN completed_by_user_id = :userId THEN NULL ELSE completed_by_user_id END
WHERE assigned_user_id = :userId
   OR created_by_user_id = :userId
   OR updated_by_user_id = :userId
   OR checked_by_user_id = :userId
   OR completed_by_user_id = :userId;
`,
  `
UPDATE list_item_catalog
SET created_by_user_id = CASE WHEN created_by_user_id = :userId THEN NULL ELSE created_by_user_id END,
    updated_by_user_id = CASE WHEN updated_by_user_id = :userId THEN NULL ELSE updated_by_user_id END
WHERE created_by_user_id = :userId
   OR updated_by_user_id = :userId;
`,
  "UPDATE list_links SET created_by_user_id = NULL WHERE created_by_user_id = :userId;",
  `
UPDATE notes
SET linked_user_id = CASE WHEN linked_user_id = :userId THEN NULL ELSE linked_user_id END,
    owner_user_id = CASE WHEN owner_user_id = :userId THEN NULL ELSE owner_user_id END,
    created_by_user_id = CASE WHEN created_by_user_id = :userId THEN NULL ELSE created_by_user_id END,
    updated_by_user_id = CASE WHEN updated_by_user_id = :userId THEN NULL ELSE updated_by_user_id END
WHERE linked_user_id = :userId
   OR owner_user_id = :userId
   OR created_by_user_id = :userId
   OR updated_by_user_id = :userId;
`,
  "UPDATE note_revisions SET changed_by_user_id = NULL WHERE changed_by_user_id = :userId;",
];

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
  updateThemeAutoSource,
  updateOpenExternalLinksNewTab,
  updateProfile,
  updateStatus,
  updateThemeMode,
};
