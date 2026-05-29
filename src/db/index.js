import { randomUUID } from "node:crypto";
import { normalizeSettings } from "../utils/normalizers.js";
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
const DEFAULT_SUPER_ADMIN_USERNAME = "sadmin";
const SUPER_ADMIN_PASSWORD_ENV = "SUPER_ADMIN_PASSWORD";

async function initializeDatabase() {
  await ensureDatabase();
}

async function ensureDatabase() {
  await runMigrations();
  await protectFirstUser();

  const organizationId = await ensureDefaultOrganization();
  await ensureOrganizationSettings(organizationId);
  await modulesService.syncModuleRegistry(organizationId);
  await seedSuperAdminUser(organizationId);
  await ensureProtectedUserRoles(organizationId);
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
INSERT INTO users (user_id, organization_id, username, password, theme_mode, user_status, protected_user)
VALUES (
  ${sqlText(userId)},
  ${sqlText(organizationId)},
  ${sqlText(DEFAULT_SUPER_ADMIN_USERNAME)},
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
