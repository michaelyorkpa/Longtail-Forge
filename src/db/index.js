import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { readExistingCsv } from "../utils/app-log.js";
import { parseCsvRows, rowToObject } from "../utils/csv.js";
import {
  normalizeClientProjectData,
  normalizeSettings,
  normalizeTimeEntry,
} from "../utils/normalizers.js";
import { hashPassword, createGeneratedPassword, validatePassword } from "../security/passwords.js";
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
  await seedClientProjectData(organizationId);
  await seedSuperAdminUser(organizationId);
  await seedTimeEntryData(organizationId);
}

async function getDefaultOrganizationId() {
  const organizations = await querySql("SELECT id FROM organizations ORDER BY created_at LIMIT 1;");

  if (organizations.length === 0) {
    throw new Error("No default organization exists.");
  }

  return organizations[0].id;
}

async function ensureDefaultOrganization() {
  const organizations = await querySql("SELECT id FROM organizations ORDER BY created_at LIMIT 1;");

  if (organizations.length > 0) {
    return organizations[0].id;
  }

  const seedSettings = await readSeedSettings();
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

  const seedSettings = await readSeedSettings();
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

async function readSeedSettings() {
  try {
    const settingsJson = await fs.readFile(config.settingsFile, "utf8");
    return normalizeSettings(JSON.parse(settingsJson));
  } catch (error) {
    if (error.code === "ENOENT") {
      return normalizeSettings({ organizationName: DEFAULT_ORGANIZATION_NAME });
    }

    throw error;
  }
}

async function seedClientProjectData(organizationId) {
  const existingClients = await querySql(
    `SELECT id FROM clients WHERE organization_id = ${sqlText(organizationId)} LIMIT 1;`,
  );

  if (existingClients.length > 0) {
    return;
  }

  const seedData = await readSeedClientProjectData();

  if (seedData.clients.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const statements = [
    "BEGIN TRANSACTION;",
    `DELETE FROM projects WHERE organization_id = ${sqlText(organizationId)};`,
    `DELETE FROM clients WHERE organization_id = ${sqlText(organizationId)};`,
  ];

  seedData.clients.forEach((client) => {
    statements.push(createClientInsertSql(organizationId, client, now));
    client.projects.forEach((project) => {
      statements.push(createProjectInsertSql(organizationId, client.id, project, now));
    });
  });

  statements.push("COMMIT;");
  await runSql(statements.join("\n"));
}

async function readSeedClientProjectData() {
  try {
    const clientProjectJson = await fs.readFile(config.clientProjectFile, "utf8");
    return normalizeClientProjectData(JSON.parse(clientProjectJson));
  } catch (error) {
    if (error.code === "ENOENT") {
      return normalizeClientProjectData({});
    }

    throw error;
  }
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

async function seedTimeEntryData(organizationId) {
  const existingEntries = await querySql(
    `SELECT entry_id FROM time_entries WHERE organization_id = ${sqlText(organizationId)} LIMIT 1;`,
  );

  if (existingEntries.length > 0) {
    return;
  }

  const userId = await getDefaultUserId(organizationId);
  const entries = await readSeedTimeEntries(organizationId, userId);

  if (entries.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const statements = ["BEGIN TRANSACTION;"];

  entries.forEach((entry) => {
    statements.push(createTimeEntryInsertSql(entry, now));
  });

  statements.push("COMMIT;");
  await runSql(statements.join("\n"));
}

async function getDefaultUserId(organizationId) {
  const users = await querySql(`
SELECT user_id
FROM users
WHERE organization_id = ${sqlText(organizationId)}
  AND username = ${sqlText(DEFAULT_SUPER_ADMIN_USERNAME)}
LIMIT 1;
`);

  if (users.length === 0) {
    throw new Error("No default user exists.");
  }

  return users[0].user_id;
}

async function readSeedTimeEntries(organizationId, userId) {
  const existingCsv = await readExistingCsv(config.timeEntriesFile);
  const rows = parseCsvRows(existingCsv.trim());

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const entry = rowToObject(headers, row);

    return normalizeTimeEntry({
      ...entry,
      organization_id: organizationId,
      user_id: entry.user_id || userId,
    });
  });
}

function createClientInsertSql(organizationId, client, now) {
  const contact = client.billing_contact;

  return `
INSERT INTO clients (
  id,
  organization_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  billing_contact_name,
  billing_contact_email,
  billing_contact_alternate_name,
  billing_contact_alternate_email,
  billing_contact_phone_number,
  billing_contact_alternate_phone_number,
  billing_contact_street_address_1,
  billing_contact_street_address_2,
  billing_contact_city,
  billing_contact_state,
  billing_contact_zip_code,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(client.id)},
  ${sqlText(organizationId)},
  ${sqlText(client.name)},
  ${sqlText(client.status)},
  ${sqlText(client.billable)},
  ${sqlNullableText(client.billing_rate)},
  ${sqlNullableText(client.billing_period?.type)},
  ${sqlNullableInteger(client.billing_period?.startDay)},
  ${sqlNullableInteger(client.billing_rounding ? (client.billing_rounding.enabled ? 1 : 0) : null)},
  ${sqlNullableText(client.billing_rounding?.increment)},
  ${sqlText(contact.name)},
  ${sqlText(contact.email)},
  ${sqlText(contact.alternate_name)},
  ${sqlText(contact.alternate_email)},
  ${sqlText(contact.phone_number)},
  ${sqlText(contact.alternate_phone_number)},
  ${sqlText(contact.street_address_1)},
  ${sqlText(contact.street_address_2)},
  ${sqlText(contact.city)},
  ${sqlText(contact.state)},
  ${sqlText(contact.zip_code)},
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function createProjectInsertSql(organizationId, clientId, project, now) {
  return `
INSERT INTO projects (
  id,
  organization_id,
  client_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(project.id)},
  ${sqlText(organizationId)},
  ${sqlText(clientId)},
  ${sqlText(project.name)},
  ${sqlText(project.status)},
  ${sqlText(project.billable)},
  ${sqlNullableText(project.billing_rate)},
  ${sqlNullableText(project.billing_period?.type)},
  ${sqlNullableInteger(project.billing_period?.startDay)},
  ${sqlNullableInteger(project.billing_rounding ? (project.billing_rounding.enabled ? 1 : 0) : null)},
  ${sqlNullableText(project.billing_rounding?.increment)},
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function createTimeEntryInsertSql(entry, now) {
  return `
INSERT INTO time_entries (
  entry_id,
  organization_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(entry.entry_id)},
  ${sqlText(entry.organization_id)},
  ${sqlText(entry.user_id)},
  ${sqlText(entry.client_id)},
  ${sqlText(entry.client_name)},
  ${sqlText(entry.project_id)},
  ${sqlText(entry.project_name)},
  ${sqlText(entry.description)},
  ${sqlText(entry.start_time)},
  ${sqlText(entry.end_time)},
  ${sqlInteger(entry.duration_seconds)},
  ${sqlText(entry.duration_hours)},
  ${sqlText(entry.billable)},
  ${sqlText(entry.invoice_status)},
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

export {
  ensureDatabase,
  getDefaultOrganizationId,
  getDefaultUserId,
  initializeDatabase,
  querySql,
  runSql,
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
};
