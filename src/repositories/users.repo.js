// @ts-check
import { db } from "../core/database.js";
import { createRecordId } from "../core/identifiers.js";
import {
  normalizeCalendarViewPreference,
  normalizeDisplayName,
  normalizeOptionalEmail,
  normalizeThemeAutoSource,
  normalizeThemeMode,
  normalizeTimezone,
  normalizeUserLandingPage,
  normalizeUserStatus,
  userRowToAppValue,
} from "../utils/normalizers.js";

/**
 * @typedef {Record<string, unknown> & {
 *   active_workspace_id: string | null,
 *   alt_email: string | null,
 *   display_name: string | null,
 *   home_workspace_id: string | null,
 *   open_external_links_new_tab: boolean | number | string | null,
 *   password: string,
 *   password_change_required: boolean | number | string | null,
 *   preferred_calendar_view: string | null,
 *   preferred_login_landing: string | null,
 *   preferred_workspace_switch_landing: string | null,
 *   protected_user: boolean | number | string | null,
 *   theme_auto_source: string | null,
 *   theme_mode: string | null,
 *   timezone: string | null,
 *   user_id: string,
 *   user_status: string,
 *   username: string
 * }} UserRow
 */
/**
 * @typedef {Object} UserListItem
 * @property {string} user_id
 * @property {string} username
 * @property {string} displayName
 * @property {string | null} altEmail
 * @property {string} timezone
 * @property {string} themeMode
 * @property {string} themeAutoSource
 * @property {string} preferredLoginLanding
 * @property {string} preferredWorkspaceSwitchLanding
 * @property {string | null} preferredCalendarView
 * @property {boolean} openExternalLinksNewTab
 * @property {boolean} passwordChangeRequired
 * @property {string} userStatus
 * @property {boolean} protectedUser
 */
/**
 * @typedef {Object} ExactActiveMemberRow
 * @property {string} user_id
 * @property {string} username
 * @property {string | null} display_name
 */
/**
 * @typedef {Object} UserProfileInput
 * @property {string} username
 * @property {unknown} [displayName]
 * @property {unknown} [altEmail]
 * @property {unknown} [timezone]
 */
/** @typedef {{ passwordChangeRequired?: boolean }} PasswordUpdateOptions */
/** @typedef {{ preferredLoginLanding?: unknown, preferredWorkspaceSwitchLanding?: unknown }} UserLandingPreferences */
/**
 * @typedef {Object} CreatedUser
 * @property {string} user_id
 * @property {string} username
 * @property {string} displayName
 * @property {string | null} altEmail
 * @property {string} timezone
 * @property {string} themeMode
 * @property {string} themeAutoSource
 * @property {"dashboard" | "workbench" | "tasks" | "notes" | "lists"} preferredLoginLanding
 * @property {"dashboard" | "workbench" | "tasks" | "notes" | "lists"} preferredWorkspaceSwitchLanding
 * @property {string | null} preferredCalendarView
 * @property {boolean} openExternalLinksNewTab
 * @property {boolean} passwordChangeRequired
 * @property {string} userStatus
 * @property {boolean} protectedUser
 */

const USER_SELECT_COLUMNS = `
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  password_change_required,
  theme_mode,
  theme_auto_source,
  preferred_login_landing,
  preferred_workspace_switch_landing,
  preferred_calendar_view,
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

/** @param {string} username @returns {Promise<UserRow | null>} */
async function readByUsername(username) {
  return /** @type {Promise<UserRow | null>} */ (db.get(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE username = :username
ORDER BY username
LIMIT 1;
`, { username }));
}

/** @param {string} username @param {string} userId @returns {Promise<UserRow | null>} */
async function readByUsernameExcludingUser(username, userId) {
  return /** @type {Promise<UserRow | null>} */ (db.get(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE username = :username
  AND user_id != :userId
ORDER BY username
LIMIT 1;
`, { userId, username }));
}

/** @param {string} workspaceId @param {string} username @returns {Promise<UserRow | null>} */
async function readByUsernameForWorkspace(workspaceId, username) {
  return /** @type {Promise<UserRow | null>} */ (db.get(`
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
`, { username, workspaceId }));
}

/** @param {string} workspaceId @param {string} username @returns {Promise<ExactActiveMemberRow | null>} */
async function readExactActiveMemberByUsername(workspaceId, username) {
  return /** @type {Promise<ExactActiveMemberRow | null>} */ (db.get(`
SELECT
  users.user_id,
  users.username,
  users.display_name
FROM users
INNER JOIN user_workspaces
  ON user_workspaces.user_id = users.user_id
  AND user_workspaces.workspace_id = :workspaceId
  AND user_workspaces.status = 'active'
INNER JOIN workspaces
  ON workspaces.workspace_id = user_workspaces.workspace_id
  AND lower(workspaces.status) = 'active'
WHERE users.username = :username
  AND users.user_status = 'active'
LIMIT 1;
`, { username, workspaceId }));
}

/** @param {string} workspaceId @param {string} userId @returns {Promise<UserRow | null>} */
async function readById(workspaceId, userId) {
  return /** @type {Promise<UserRow | null>} */ (db.get(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE ${USER_BELONGS_TO_WORKSPACE_SQL}
ORDER BY ${USERS_PHYSICAL_ROW_ID}
LIMIT 1;
`, { userId, workspaceId }));
}

/** @param {string} userId @returns {Promise<UserRow | null>} */
async function readFirstByUserId(userId) {
  return /** @type {Promise<UserRow | null>} */ (db.get(`
SELECT
${USER_SELECT_COLUMNS}
FROM users
WHERE user_id = :userId
ORDER BY ${USERS_PHYSICAL_ROW_ID}
LIMIT 1;
`, { userId }));
}

/** @param {string} workspaceId @returns {Promise<UserListItem[]>} */
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
    AND user_workspaces.status = 'active'
    AND user_rows.user_status = 'active'
  GROUP BY user_workspaces.user_id
)
ORDER BY username;
`, { workspaceId });

  return rows.map(userRowToAppValue);
}

/**
 * @param {string} workspaceId
 * @param {UserProfileInput} profile
 * @param {string} passwordHash
 * @returns {Promise<CreatedUser>}
 */
async function create(workspaceId, profile, passwordHash) {
  const userId = createRecordId();
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
    preferredLoginLanding: "dashboard",
    preferredWorkspaceSwitchLanding: "dashboard",
    preferredCalendarView: null,
    openExternalLinksNewTab: false,
    passwordChangeRequired: false,
    userStatus: "active",
    protectedUser: false,
  };
}

/** @param {string} workspaceId @param {string} userId @param {string} passwordHash @param {PasswordUpdateOptions} [options] @returns {Promise<void>} */
async function updatePassword(workspaceId, userId, passwordHash, options = {}) {
  await db.run(`
UPDATE users
SET password = :passwordHash,
    password_change_required = :passwordChangeRequired
WHERE user_id = :userId
  AND ${USER_BELONGS_TO_WORKSPACE_SQL};
`, {
    passwordChangeRequired: options.passwordChangeRequired ? 1 : 0,
    passwordHash,
    userId,
    workspaceId,
  });
}

/** @param {string} userId @param {string} passwordHash @param {PasswordUpdateOptions} [options] @returns {Promise<void>} */
async function updatePasswordByUserId(userId, passwordHash, options = {}) {
  await db.run(`
UPDATE users
SET password = :passwordHash,
    password_change_required = :passwordChangeRequired
WHERE user_id = :userId;
`, {
    passwordChangeRequired: options.passwordChangeRequired ? 1 : 0,
    passwordHash,
    userId,
  });
}

/** @param {string} userId @param {string} workspaceId @returns {Promise<void>} */
async function clearWorkspaceReferences(userId, workspaceId) {
  await db.run(`
UPDATE users
SET home_workspace_id = CASE WHEN home_workspace_id = :workspaceId THEN NULL ELSE home_workspace_id END,
    active_workspace_id = CASE WHEN active_workspace_id = :workspaceId THEN NULL ELSE active_workspace_id END
WHERE user_id = :userId;
`, { userId, workspaceId });
}

/** @param {string} workspaceId @param {string} userId @param {UserProfileInput} profile @returns {Promise<void>} */
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

/** @param {string} workspaceId @param {string} userId @param {unknown} themeMode @returns {Promise<void>} */
async function updateThemeMode(workspaceId, userId, themeMode) {
  await db.run(`
UPDATE users
SET theme_mode = :themeMode
WHERE ${USER_BELONGS_TO_WORKSPACE_SQL};
`, { themeMode: normalizeThemeMode(themeMode), userId, workspaceId });
}

/** @param {string} workspaceId @param {string} userId @param {unknown} themeAutoSource @returns {Promise<void>} */
async function updateThemeAutoSource(workspaceId, userId, themeAutoSource) {
  await db.run(`
UPDATE users
SET theme_auto_source = :themeAutoSource
WHERE ${USER_BELONGS_TO_WORKSPACE_SQL};
`, { themeAutoSource: normalizeThemeAutoSource(themeAutoSource), userId, workspaceId });
}

/** @param {string} workspaceId @param {string} userId @param {boolean} openExternalLinksNewTab @returns {Promise<void>} */
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

/** @param {string} workspaceId @param {string} userId @param {UserLandingPreferences} preferences @returns {Promise<void>} */
async function updateLandingPreferences(workspaceId, userId, preferences) {
  await db.run(`
UPDATE users
SET preferred_login_landing = :preferredLoginLanding,
    preferred_workspace_switch_landing = :preferredWorkspaceSwitchLanding
WHERE user_id = :userId
  AND (
    home_workspace_id = :workspaceId
    OR EXISTS (
      SELECT 1
      FROM user_workspaces
      WHERE user_workspaces.user_id = users.user_id
        AND user_workspaces.workspace_id = :workspaceId
    )
  );
`, {
    preferredLoginLanding: normalizeUserLandingPage(preferences.preferredLoginLanding),
    preferredWorkspaceSwitchLanding: normalizeUserLandingPage(preferences.preferredWorkspaceSwitchLanding),
    userId,
    workspaceId,
  });
}

/** @param {string} workspaceId @param {string} userId @param {unknown} preferredCalendarView @returns {Promise<void>} */
async function updateCalendarViewPreference(workspaceId, userId, preferredCalendarView) {
  await db.run(`
UPDATE users
SET preferred_calendar_view = :preferredCalendarView
WHERE user_id = :userId
  AND (
    home_workspace_id = :workspaceId
    OR EXISTS (
      SELECT 1
      FROM user_workspaces
      WHERE user_workspaces.user_id = users.user_id
        AND user_workspaces.workspace_id = :workspaceId
    )
  );
`, {
    preferredCalendarView: normalizeCalendarViewPreference(preferredCalendarView),
    userId,
    workspaceId,
  });
}

/** @param {string} workspaceId @param {string} userId @param {unknown} userStatus @returns {Promise<void>} */
async function updateStatus(workspaceId, userId, userStatus) {
  await db.run(`
UPDATE users
SET user_status = :userStatus
WHERE ${USER_BELONGS_TO_WORKSPACE_SQL};
`, { userId, userStatus: normalizeUserStatus(userStatus), workspaceId });
}

/** @param {string} userId @param {string | null} workspaceId @returns {Promise<void>} */
async function updateActiveWorkspace(userId, workspaceId) {
  await db.run(`
UPDATE users
SET active_workspace_id = :workspaceId
WHERE user_id = :userId;
`, { userId, workspaceId });
}

/** @param {string} userId @param {string} passwordHash @returns {Promise<void>} */
async function retireAccount(userId, passwordHash) {
  const retiredAt = new Date().toISOString();

  await db.transaction(async (transaction) => {
    await transaction.run(`
UPDATE users
SET password = :passwordHash,
    password_change_required = 0,
    user_status = 'inactive'
WHERE user_id = :userId;
`, { passwordHash, userId });
    await transaction.run(`
UPDATE user_workspaces
SET status = 'inactive',
    updated_at = :retiredAt
WHERE user_id = :userId;
`, { retiredAt, userId });
    await transaction.run("DELETE FROM user_role_assignments WHERE user_id = :userId;", { userId });
    await transaction.run("DELETE FROM user_workspace_creation_permissions WHERE user_id = :userId;", { userId });
    await transaction.run("DELETE FROM notification_subscriptions WHERE user_id = :userId;", { userId });
    await transaction.run(`
DELETE FROM api_key_scopes
WHERE api_key_id IN (
  SELECT api_key_id
  FROM api_keys
  WHERE created_by_user_id = :userId
);
`, { userId });
    await transaction.run("DELETE FROM api_keys WHERE created_by_user_id = :userId;", { userId });
    await transaction.run("DELETE FROM sessions WHERE user_id = :userId;", { userId });
    await transaction.run("DELETE FROM account_export_recovery_qualifications WHERE user_id = :userId;", { userId });
  });
}

/** @param {string} workspaceId @param {string} userId @returns {Promise<void>} */
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
  clearWorkspaceReferences,
  create,
  readAll,
  readById,
  readExactActiveMemberByUsername,
  readFirstByUserId,
  readByUsername,
  readByUsernameExcludingUser,
  readByUsernameForWorkspace,
  retireAccount,
  remove,
  updatePassword,
  updatePasswordByUserId,
  updateActiveWorkspace,
  updateLandingPreferences,
  updateCalendarViewPreference,
  updateThemeAutoSource,
  updateOpenExternalLinksNewTab,
  updateProfile,
  updateStatus,
  updateThemeMode,
};
