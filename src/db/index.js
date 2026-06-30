import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { normalizeSettings } from "../utils/normalizers.js";
import { DEFAULT_TIMEZONE, normalizeUtcIso } from "../utils/timezones.js";
import { DEFAULT_WORKSPACE_TYPE } from "../utils/workspaces.js";
import { hashPassword, createGeneratedPassword, validatePassword } from "../security/passwords.js";
import { modulesService } from "../core/modules/modules.service.js";
import { appSettingsRepository } from "../repositories/app-settings.repo.js";
import { runMigrations } from "./migrations.js";
import {
  closeDatabase,
  db,
  formatDatabaseHealth,
  getLastDatabaseHealth,
  getSql,
  initializeDatabaseRuntime,
  querySql,
  readDatabaseHealth,
  runSql,
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
} from "./provider.js";

const DEFAULT_WORKSPACE_NAME = config.bootstrap.initialWorkspaceName;
const REDACTED_SEED_USERNAME = "[REDACTED]";
const DEFAULT_SUPER_ADMIN_USERNAME = config.bootstrap.superAdminUsername;
const DEFAULT_SUPER_ADMIN_DISPLAY_NAME = config.bootstrap.superAdminDisplayName;
const SUPER_ADMIN_PASSWORD_ENV = "SUPER_ADMIN_PASSWORD";

async function initializeDatabase() {
  return ensureDatabase();
}

async function ensureDatabase() {
  const databaseHealth = await initializeDatabaseRuntime();
  await runSchemaStartupMaintenance();
  await runAppStartupMaintenance();
  return databaseHealth;
}

async function runSchemaStartupMaintenance() {
  await runMigrations();
}

async function runAppStartupMaintenance() {
  await ensureFrameworkModuleRecord();
  await standardizeStoredTimesToUtc();
  await appSettingsRepository.ensureDefaults();
  await protectFirstUser();

  const workspaceId = await ensureDefaultWorkspace();
  await ensureWorkspaceSettings(workspaceId);
  await modulesService.syncModuleRegistry(workspaceId);
  await repairRedactedSeedUsers(workspaceId);
  await seedSuperAdminUser(workspaceId);
  await ensureWorkspaceMemberships(workspaceId);
  await repairDuplicateWorkspaceUserRows();
  await repairUserActiveWorkspaces();
  await ensureWorkspaceType(workspaceId);
  await ensureWorkspacePermissionContracts();
  await repairPersonalWorkspaceMemberships();
  await ensureProtectedUserRoles(workspaceId);
}

async function ensureFrameworkModuleRecord() {
  if (!(await tableExists("modules"))) {
    return;
  }

  const now = new Date().toISOString();
  await runSql(`
INSERT INTO modules (module_id, name, description, category, status, version, created_at, updated_at)
VALUES (
  'framework',
  'Framework',
  'Core framework services, Help, Search, Files, settings, and shared runtime behavior.',
  'framework-service',
  'active',
  ${sqlText(config.version)},
  ${sqlText(now)},
  ${sqlText(now)}
)
ON CONFLICT(module_id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  status = excluded.status,
  version = excluded.version,
  updated_at = excluded.updated_at;
`);
}

async function repairDuplicateWorkspaceUserRows() {
  if (
    !(await tableExists("users")) ||
    !(await tableExists("user_workspaces"))
  ) {
    return;
  }

  const duplicateRows = await querySql(`
SELECT
  rowid,
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
FROM users
WHERE user_id IN (
  SELECT user_id
  FROM users
  GROUP BY user_id
  HAVING COUNT(1) > 1
)
ORDER BY user_id, rowid;
`);

  const rowsByUserId = duplicateRows.reduce((groups, row) => {
    if (!groups.has(row.user_id)) {
      groups.set(row.user_id, []);
    }

    groups.get(row.user_id).push(row);
    return groups;
  }, new Map());

  for (const rows of rowsByUserId.values()) {
    const canonical = rows[0];
    const activeMemberships = await querySql(`
SELECT workspace_id
FROM user_workspaces
WHERE user_id = ${sqlText(canonical.user_id)}
  AND status = 'active'
ORDER BY created_at, workspace_id;
`);
    const activeWorkspaceIds = new Set(activeMemberships.map((membership) => membership.workspace_id));
    const activeWorkspaceId = activeWorkspaceIds.has(canonical.active_workspace_id)
      ? canonical.active_workspace_id
      : activeMemberships[0]?.workspace_id || canonical.active_workspace_id || canonical.home_workspace_id;
    const preferredTheme = rows.some((row) => row.theme_mode === "dark") ? "dark" : canonical.theme_mode || "light";
    const protectedUser = rows.some((row) => row.protected_user === "yes") ? "yes" : canonical.protected_user || "no";
    const activeStatus = rows.some((row) => row.user_status === "active") ? "active" : canonical.user_status || "inactive";
    const duplicateRowIds = rows.slice(1).map((row) => row.rowid);

    await runSql(`
UPDATE users
SET
  theme_mode = ${sqlText(preferredTheme)},
  user_status = ${sqlText(activeStatus)},
  protected_user = ${sqlText(protectedUser)},
  active_workspace_id = ${sqlText(activeWorkspaceId)}
WHERE rowid = ${sqlInteger(canonical.rowid)};

DELETE FROM users
WHERE rowid IN (${duplicateRowIds.map((rowid) => sqlInteger(rowid)).join(", ")});
`);
  }

  await runSql(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_user_id
ON users (user_id);
`);
}

async function ensureWorkspacePermissionContracts() {
  if (!(await tableExists("role_permissions"))) {
    return;
  }

  await runSql(`
DELETE FROM role_permissions
WHERE role_id IN ('client_admin', 'project_admin')
  AND permission_id = 'users.manage';

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
VALUES ('project_admin', 'roles.assign');
`);
}

async function repairRedactedSeedUsers(workspaceId) {
  if (!(await tableExists("users"))) {
    return;
  }

  const redactedUsers = await querySql(`
SELECT user_id
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND username = ${sqlText(REDACTED_SEED_USERNAME)};
`);

  if (redactedUsers.length === 0) {
    return;
  }

  const defaultUsers = await querySql(`
SELECT user_id
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND username = ${sqlText(DEFAULT_SUPER_ADMIN_USERNAME)}
LIMIT 1;
`);
  const now = new Date().toISOString();

  if (defaultUsers.length === 0) {
    await runSql(`
UPDATE users
SET username = ${sqlText(DEFAULT_SUPER_ADMIN_USERNAME)},
    display_name = ${sqlText(DEFAULT_SUPER_ADMIN_DISPLAY_NAME)}
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND username = ${sqlText(REDACTED_SEED_USERNAME)};

UPDATE sessions
SET username = ${sqlText(DEFAULT_SUPER_ADMIN_USERNAME)}
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND username = ${sqlText(REDACTED_SEED_USERNAME)};
`);
    return;
  }

  const statements = redactedUsers.map((user, index) => {
    const retiredUsername = `retired-placeholder-${index + 1}-${user.user_id}@longtailforge.local`;

    return `
UPDATE users
SET username = ${sqlText(retiredUsername)},
    display_name = 'Retired Placeholder User',
    user_status = 'inactive',
    protected_user = 'no'
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(user.user_id)}
  AND username = ${sqlText(REDACTED_SEED_USERNAME)};

DELETE FROM sessions
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(user.user_id)};

INSERT INTO audit_logs (
  audit_id,
  workspace_id,
  created_at,
  actor_user_id,
  actor_user_name,
  action,
  change_type,
  record_type,
  record_id,
  record_label,
  record_url,
  previous_value_json,
  new_value_json,
  metadata_json
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(now)},
  'system',
  'system',
  'redacted_seed_user_repaired',
  'repair',
  'user',
  ${sqlText(user.user_id)},
  ${sqlText(retiredUsername)},
  'user-admin.html',
  ${sqlText(JSON.stringify({ username: REDACTED_SEED_USERNAME }))},
  ${sqlText(JSON.stringify({ username: retiredUsername, user_status: "inactive" }))},
  ${sqlText(JSON.stringify({ reason: "literal redaction placeholder was present in seed user data" }))}
);
`;
  });

  await runSql(statements.join("\n"));
}

async function standardizeStoredTimesToUtc() {
  await standardizeTableColumns("time_entries", "entry_id", [
    "start_time",
    "end_time",
    "created_at",
    "updated_at",
  ]);
  await standardizeTableColumns("audit_logs", "audit_id", ["created_at"]);

  if (await tableExists("active_work_timers")) {
    await standardizeTableColumns("active_work_timers", "active_timer_id", [
      "last_active_start_time",
      "created_at",
      "updated_at",
    ]);
  }
}

async function standardizeTableColumns(tableName, idColumn, columns) {
  if (!(await tableExists(tableName))) {
    return;
  }

  const rows = await querySql(`
SELECT rowid AS __rowid, ${[idColumn, ...columns].join(", ")}
FROM ${tableName};
`);
  const updates = rows
    .map((row) => createUtcRepairSql(tableName, idColumn, columns, row))
    .filter(Boolean);

  if (updates.length > 0) {
    await runSql(updates.join("\n"));
  }
}

function createUtcRepairSql(tableName, idColumn, columns, row) {
  const assignments = columns
    .map((column) => {
      const currentValue = row[column];
      const nextValue = normalizeStoredTime(currentValue);

      return nextValue !== currentValue ? `${column} = ${sqlText(nextValue)}` : "";
    })
    .filter(Boolean);

  if (assignments.length === 0) {
    return "";
  }

  return `
UPDATE ${tableName}
SET ${assignments.join(", ")}
WHERE ${idColumn} = ${sqlText(row[idColumn])}
  AND rowid = ${sqlText(row.__rowid)};
`;
}

function normalizeStoredTime(value) {
  const text = String(value || "").trim();

  if (!text || /z$/i.test(text)) {
    return text;
  }

  return normalizeUtcIso(text, DEFAULT_TIMEZONE);
}

async function tableExists(tableName) {
  const rows = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name = ${sqlText(tableName)}
LIMIT 1;
`);

  return rows.length > 0;
}

async function ensureDefaultWorkspace() {
  const workspaces = await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");

  if (workspaces.length > 0) {
    return workspaces[0].workspace_id;
  }

  const seedSettings = getDefaultSettings();
  const workspaceId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, ${sqlText(seedSettings.workspaceName)}, 'Active', ${sqlText(DEFAULT_WORKSPACE_TYPE)}, ${sqlText(now)}, ${sqlText(now)});
INSERT INTO workspace_settings (
  workspace_id,
  fiscal_year_start_month,
  fiscal_year_start_day,
  default_billing_rate,
  billing_period_type,
  billing_period_start_day,
  rounding_enabled,
  rounding_increment,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlInteger(seedSettings.fiscalYear.startMonth)},
  ${sqlInteger(seedSettings.fiscalYear.startDay)},
  ${sqlText(seedSettings.defaultBillingRate)},
  ${sqlText(seedSettings.billingPeriod.type)},
  ${sqlInteger(seedSettings.billingPeriod.startDay)},
  ${sqlInteger(seedSettings.billingRounding.enabled ? 1 : 0)},
  ${sqlText(seedSettings.billingRounding.increment)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return workspaceId;
}

async function ensureWorkspaceSettings(workspaceId) {
  const settings = await querySql(
    `SELECT workspace_id FROM workspace_settings WHERE workspace_id = ${sqlText(workspaceId)} LIMIT 1;`,
  );

  if (settings.length > 0) {
    return;
  }

  const seedSettings = getDefaultSettings();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO workspace_settings (
  workspace_id,
  fiscal_year_start_month,
  fiscal_year_start_day,
  default_billing_rate,
  billing_period_type,
  billing_period_start_day,
  rounding_enabled,
  rounding_increment,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlInteger(seedSettings.fiscalYear.startMonth)},
  ${sqlInteger(seedSettings.fiscalYear.startDay)},
  ${sqlText(seedSettings.defaultBillingRate)},
  ${sqlText(seedSettings.billingPeriod.type)},
  ${sqlInteger(seedSettings.billingPeriod.startDay)},
  ${sqlInteger(seedSettings.billingRounding.enabled ? 1 : 0)},
  ${sqlText(seedSettings.billingRounding.increment)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

function getDefaultSettings() {
  return normalizeSettings({ workspaceName: DEFAULT_WORKSPACE_NAME });
}

async function seedSuperAdminUser(workspaceId) {
  const existingUsers = await querySql(`
SELECT user_id
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND username = ${sqlText(DEFAULT_SUPER_ADMIN_USERNAME)}
LIMIT 1;
`);

  let userId = existingUsers[0]?.user_id || "";

  if (!userId) {
    const passwordSetup = getSuperAdminPassword();
    userId = randomUUID();

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
  ${sqlText(DEFAULT_SUPER_ADMIN_USERNAME)},
  ${sqlText(DEFAULT_SUPER_ADMIN_DISPLAY_NAME)},
  NULL,
  ${sqlText(DEFAULT_TIMEZONE)},
  ${sqlText(hashPassword(passwordSetup.password))},
  'light',
  'active',
  'yes',
  ${sqlText(workspaceId)}
);
`);

    if (passwordSetup.generated) {
      console.log(
        `Created super administrator '${DEFAULT_SUPER_ADMIN_USERNAME}' with generated password: ${passwordSetup.password}`,
      );
      console.log(`Set ${SUPER_ADMIN_PASSWORD_ENV} before first launch to choose a different initial password.`);
    }
  }

  await runSql(`
UPDATE time_entries
SET user_id = ${sqlText(userId)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND (user_id = 'local_user' OR user_id = '');
`);
}

async function ensureWorkspaceMemberships(workspaceId) {
  const membershipTable = await tableExists("user_workspaces");
  const hasOwnerColumn = await columnsExist("workspaces", ["owner_user_id"]);

  if (!membershipTable) {
    return;
  }

  const users = await querySql(`
SELECT user_id, user_status
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)};
`);

  const now = new Date().toISOString();
  const membershipInserts = users.map((user) => `
INSERT OR IGNORE INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(user.user_id)},
  ${sqlText(workspaceId)},
  ${sqlText(user.user_status === "inactive" ? "inactive" : "active")},
  ${sqlText(now)},
  ${sqlText(now)}
);
`).join("\n");

  if (membershipInserts) {
    await runSql(membershipInserts);
  }

  if (!hasOwnerColumn) {
    return;
  }

  await runSql(`
UPDATE workspaces
SET owner_user_id = COALESCE(
  owner_user_id,
  (
    SELECT user_id
    FROM users
    WHERE home_workspace_id = ${sqlText(workspaceId)}
      AND protected_user = 'yes'
    ORDER BY username
    LIMIT 1
  ),
  (
    SELECT user_id
    FROM users
    WHERE home_workspace_id = ${sqlText(workspaceId)}
    ORDER BY username
    LIMIT 1
  )
)
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

async function repairUserActiveWorkspaces() {
  if (
    !(await tableExists("users")) ||
    !(await tableExists("user_workspaces")) ||
    !(await tableExists("sessions")) ||
    !(await columnsExist("users", ["active_workspace_id"])) ||
    !(await columnsExist("sessions", ["active_workspace_id"]))
  ) {
    return;
  }

  await runSql(`
UPDATE users
SET active_workspace_id = home_workspace_id
WHERE active_workspace_id IS NULL OR active_workspace_id = '';
`);

  const rows = await querySql(`
SELECT sessions.user_id, sessions.active_workspace_id
FROM sessions
INNER JOIN (
  SELECT user_id, MAX(updated_at) AS latest_updated_at
  FROM sessions
  WHERE active_workspace_id IS NOT NULL
    AND active_workspace_id != ''
  GROUP BY user_id
) AS latest_session
  ON latest_session.user_id = sessions.user_id
  AND latest_session.latest_updated_at = sessions.updated_at
INNER JOIN user_workspaces
  ON user_workspaces.user_id = sessions.user_id
  AND user_workspaces.workspace_id = sessions.active_workspace_id
  AND user_workspaces.status = 'active';
`);

  const updates = rows.map((row) => `
UPDATE users
SET active_workspace_id = ${sqlText(row.active_workspace_id)}
WHERE user_id = ${sqlText(row.user_id)};
`).join("\n");

  if (updates) {
    await runSql(updates);
  }
}

async function ensureWorkspaceType(workspaceId) {
  if (!(await columnsExist("workspaces", ["workspace_type"]))) {
    return;
  }

  await runSql(`
UPDATE workspaces
SET workspace_type = ${sqlText(DEFAULT_WORKSPACE_TYPE)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND workspace_type NOT IN ('business', 'personal', 'family');
`);
}

async function repairPersonalWorkspaceMemberships() {
  if (
    !(await tableExists("user_workspaces")) ||
    !(await columnsExist("workspaces", ["owner_user_id", "workspace_type"]))
  ) {
    return;
  }

  await runSql(`
UPDATE user_workspaces
SET status = 'inactive',
    updated_at = ${sqlText(new Date().toISOString())}
WHERE status = 'active'
  AND workspace_id IN (
    SELECT workspace_id
    FROM workspaces
    WHERE workspace_type = 'personal'
      AND owner_user_id IS NOT NULL
  )
  AND user_id != (
    SELECT owner_user_id
    FROM workspaces
    WHERE workspaces.workspace_id = user_workspaces.workspace_id
  );
`);
}

async function ensureProtectedUserRoles(workspaceId) {
  await runSql(`
UPDATE user_role_assignments
SET scope_type = 'all',
    scope_id = 'all',
    updated_at = ${sqlText(new Date().toISOString())}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND role_id = 'super_admin'
  AND scope_type = 'workspace';
`);

  const rows = await querySql(`
SELECT user_id
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND protected_user = 'yes';
`);

  const now = new Date().toISOString();
  const inserts = rows.map((row) => `
INSERT OR IGNORE INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(row.user_id)},
  'super_admin',
  'all',
  'all',
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
`).join("\n");

  if (inserts) {
    await runSql(inserts);
  }
}

function getSuperAdminPassword() {
  const configuredPassword = config.bootstrap.superAdminPassword;
  const password = configuredPassword || createGeneratedPassword();
  const validation = validatePassword(password, DEFAULT_SUPER_ADMIN_USERNAME);

  if (!validation.valid) {
    throw new Error(
      `${SUPER_ADMIN_PASSWORD_ENV} does not meet password requirements: ${validation.errors.join("; ")}`,
    );
  }

  return {
    password,
    generated: !configuredPassword,
  };
}

async function protectFirstUser() {
  await runSql(`
UPDATE users
SET protected_user = 'yes'
WHERE rowid = (
  SELECT rowid
  FROM users
  ORDER BY rowid
  LIMIT 1
);
`);
}

async function columnsExist(tableName, columnNames) {
  const columns = await querySql(`PRAGMA table_info(${tableName});`);
  const existingColumnNames = new Set(columns.map((column) => column.name));

  return columnNames.every((columnName) => existingColumnNames.has(columnName));
}

export {
  closeDatabase,
  ensureDatabase,
  formatDatabaseHealth,
  getLastDatabaseHealth,
  getSql,
  initializeDatabase,
  initializeDatabaseRuntime,
  closeDatabase as closeSqlite,
  db,
  formatDatabaseHealth as formatSqliteHealth,
  getLastDatabaseHealth as getLastSqliteHealth,
  initializeDatabaseRuntime as initializeSqliteRuntime,
  querySql,
  readDatabaseHealth,
  readDatabaseHealth as readSqliteHealth,
  runSql,
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
};
