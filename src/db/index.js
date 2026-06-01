import { randomUUID } from "node:crypto";
import { normalizeSettings } from "../utils/normalizers.js";
import { DEFAULT_TIMEZONE, normalizeUtcIso } from "../utils/timezones.js";
import { DEFAULT_WORKSPACE_TYPE } from "../utils/workspaces.js";
import { hashPassword, createGeneratedPassword, validatePassword } from "../security/passwords.js";
import { modulesService } from "../core/modules/modules.service.js";
import { runMigrations } from "./migrations.js";
import {
  querySql,
  runSql,
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
} from "./sqlite.js";

const DEFAULT_ORGANIZATION_NAME = "Raymond Tec";
const DEFAULT_SUPER_ADMIN_USERNAME = "[REDACTED]";
const DEFAULT_SUPER_ADMIN_DISPLAY_NAME = "Super Admin";
const SUPER_ADMIN_PASSWORD_ENV = "SUPER_ADMIN_PASSWORD";

async function initializeDatabase() {
  await ensureDatabase();
}

async function ensureDatabase() {
  await runMigrations();
  await standardizeStoredTimesToUtc();
  await protectFirstUser();

  const organizationId = await ensureDefaultOrganization();
  await ensureOrganizationSettings(organizationId);
  await modulesService.syncModuleRegistry(organizationId);
  await seedSuperAdminUser(organizationId);
  await ensureWorkspaceMemberships(organizationId);
  await ensureWorkspaceType(organizationId);
  await repairPersonalWorkspaceMemberships();
  await ensureProtectedUserRoles(organizationId);
}

async function standardizeStoredTimesToUtc() {
  await standardizeTableColumns("time_entries", "entry_id", [
    "start_time",
    "end_time",
    "created_at",
    "updated_at",
  ]);
  await standardizeTableColumns("audit_logs", "audit_id", ["created_at"]);

  if (await tableExists("active_timers")) {
    await standardizeTableColumns("active_timers", "active_timer_id", [
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

async function ensureDefaultOrganization() {
  const organizations = await querySql("SELECT id FROM organizations ORDER BY created_at LIMIT 1;");

  if (organizations.length > 0) {
    return organizations[0].id;
  }

  const seedSettings = getDefaultSettings();
  const organizationId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO organizations (id, name, status, created_at, updated_at)
VALUES (${sqlText(organizationId)}, ${sqlText(seedSettings.organizationName)}, 'Active', ${sqlText(now)}, ${sqlText(now)});
INSERT INTO organization_settings (
  organization_id,
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
  ${sqlText(organizationId)},
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

  return organizationId;
}

async function ensureOrganizationSettings(organizationId) {
  const settings = await querySql(
    `SELECT organization_id FROM organization_settings WHERE organization_id = ${sqlText(organizationId)} LIMIT 1;`,
  );

  if (settings.length > 0) {
    return;
  }

  const seedSettings = getDefaultSettings();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO organization_settings (
  organization_id,
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
  ${sqlText(organizationId)},
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
  return normalizeSettings({ organizationName: DEFAULT_ORGANIZATION_NAME });
}

async function seedSuperAdminUser(organizationId) {
  const existingUsers = await querySql(`
SELECT user_id
FROM users
WHERE organization_id = ${sqlText(organizationId)}
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
  organization_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user
)
VALUES (
  ${sqlText(userId)},
  ${sqlText(organizationId)},
  ${sqlText(DEFAULT_SUPER_ADMIN_USERNAME)},
  ${sqlText(DEFAULT_SUPER_ADMIN_DISPLAY_NAME)},
  NULL,
  ${sqlText(DEFAULT_TIMEZONE)},
  ${sqlText(hashPassword(passwordSetup.password))},
  'light',
  'active',
  'yes'
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
WHERE organization_id = ${sqlText(organizationId)}
  AND (user_id = 'local_user' OR user_id = '');
`);
}

async function ensureWorkspaceMemberships(organizationId) {
  const membershipTable = await tableExists("user_workspaces");
  const hasOwnerColumn = await columnsExist("organizations", ["owner_user_id"]);

  if (!membershipTable) {
    return;
  }

  const users = await querySql(`
SELECT user_id, user_status
FROM users
WHERE organization_id = ${sqlText(organizationId)};
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
  ${sqlText(organizationId)},
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
UPDATE organizations
SET owner_user_id = COALESCE(
  owner_user_id,
  (
    SELECT user_id
    FROM users
    WHERE organization_id = ${sqlText(organizationId)}
      AND protected_user = 'yes'
    ORDER BY username
    LIMIT 1
  ),
  (
    SELECT user_id
    FROM users
    WHERE organization_id = ${sqlText(organizationId)}
    ORDER BY username
    LIMIT 1
  )
)
WHERE id = ${sqlText(organizationId)};
`);
}

async function ensureWorkspaceType(organizationId) {
  if (!(await columnsExist("organizations", ["workspace_type"]))) {
    return;
  }

  await runSql(`
UPDATE organizations
SET workspace_type = ${sqlText(DEFAULT_WORKSPACE_TYPE)}
WHERE id = ${sqlText(organizationId)}
  AND workspace_type NOT IN ('business', 'personal', 'family');
`);
}

async function repairPersonalWorkspaceMemberships() {
  if (
    !(await tableExists("user_workspaces")) ||
    !(await columnsExist("organizations", ["owner_user_id", "workspace_type"]))
  ) {
    return;
  }

  await runSql(`
UPDATE user_workspaces
SET status = 'inactive',
    updated_at = ${sqlText(new Date().toISOString())}
WHERE status = 'active'
  AND workspace_id IN (
    SELECT id
    FROM organizations
    WHERE workspace_type = 'personal'
      AND owner_user_id IS NOT NULL
  )
  AND user_id != (
    SELECT owner_user_id
    FROM organizations
    WHERE organizations.id = user_workspaces.workspace_id
  );
`);
}

async function ensureProtectedUserRoles(organizationId) {
  await runSql(`
UPDATE user_role_assignments
SET scope_type = 'all',
    scope_id = 'all',
    updated_at = ${sqlText(new Date().toISOString())}
WHERE organization_id = ${sqlText(organizationId)}
  AND role_id = 'super_admin'
  AND scope_type = 'organization';
`);

  const rows = await querySql(`
SELECT user_id
FROM users
WHERE organization_id = ${sqlText(organizationId)}
  AND protected_user = 'yes';
`);

  const now = new Date().toISOString();
  const inserts = rows.map((row) => `
INSERT OR IGNORE INTO user_role_assignments (
  assignment_id,
  organization_id,
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
  ${sqlText(organizationId)},
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
  const configuredPassword = process.env[SUPER_ADMIN_PASSWORD_ENV];
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
  ensureDatabase,
  initializeDatabase,
  querySql,
  runSql,
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
};
