// Small local HTTP server for Longtail Forge. It serves static files and JSON APIs.
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } = require("node:crypto");
const http = require("node:http");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 8001;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const LOG_DIR = path.join(ROOT, "logs");
const CLIENT_PROJECT_FILE = path.join(DATA_DIR, "client-project.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const DATABASE_FILE = path.join(DATA_DIR, "time-tracker.db");
const SQLITE_COMMAND = process.env.SQLITE_COMMAND || "sqlite3";
const APP_LOG_FILE = path.join(LOG_DIR, "app-events.csv");
const TIME_ENTRIES_FILE = path.join(DATA_DIR, "time-entries.csv");
const DEFAULT_ORGANIZATION_NAME = "Raymond Tec";
const DEFAULT_SUPER_ADMIN_USERNAME = "sadmin";
const SUPER_ADMIN_PASSWORD_ENV = "SUPER_ADMIN_PASSWORD";
const SESSION_COOKIE_NAME = "time_tracker_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const sessions = new Map();
// App event logs remain CSV for easy inspection while app data lives in SQLite.
const APP_LOG_HEADER =
  "timestamp,username,action,client_id,client_name,project_id,project_name,details";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`);
    const pathname = requestUrl.pathname;

    if (request.method === "POST" && pathname === "/api/login") {
      await handleLogin(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/logout") {
      await handleLogout(request, response);
      return;
    }

    if (request.method === "GET" && pathname === "/api/session") {
      await handleSessionRead(request, response);
      return;
    }

    // Public routes are handled above; everything below this point requires a session.
    const session = getRequestSession(request);

    if (!session) {
      await handleUnauthenticatedRequest(request, response, pathname);
      return;
    }

    if (request.method === "POST" && pathname === "/api/time-entries") {
      await handleTimeEntry(request, response);
      return;
    }

    if (request.method === "PUT" && pathname.startsWith("/api/time-entries/")) {
      await handleTimeEntryUpdate(request, response);
      return;
    }

    if (request.method === "GET" && pathname === "/api/time-entries") {
      await handleTimeEntriesRead(response);
      return;
    }

    if (request.method === "PUT" && pathname === "/api/client-projects") {
      await handleClientProjectsSave(request, response);
      return;
    }

    if (request.method === "GET" && pathname === "/api/client-projects") {
      await handleClientProjectsRead(response);
      return;
    }

    if (request.method === "PUT" && pathname === "/api/settings") {
      await handleSettingsSave(request, response);
      return;
    }

    if (request.method === "GET" && pathname === "/api/settings") {
      await handleSettingsRead(response);
      return;
    }

    if (request.method === "PUT" && pathname === "/api/user/password") {
      await handlePasswordChange(request, response, session);
      return;
    }

    if (request.method === "GET") {
      await serveStaticFile(request, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
});

startServer();

async function startServer() {
  try {
    await ensureDatabase();
    server.listen(PORT, HOST, () => {
      console.log(`Longtail Forge running at http://${HOST}:${PORT}/index.html`);
    });
  } catch (error) {
    console.error("The local database could not be initialized.");
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

async function handleLogin(request, response) {
  const payload = await readJsonBody(request);
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "");

  if (!username || !password) {
    sendJson(response, 400, { error: "Username and password are required." });
    return;
  }

  const user = await readUserByUsername(username);

  if (!user || !verifyPassword(password, user.password)) {
    sendJson(response, 401, { error: "Invalid username or password." });
    return;
  }

  const sessionId = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;

  sessions.set(sessionId, {
    expiresAt,
    organization_id: user.organization_id,
    user_id: user.user_id,
    username: user.username,
  });

  response.setHeader("Set-Cookie", buildSessionCookie(sessionId, SESSION_MAX_AGE_SECONDS));
  sendJson(response, 200, {
    user: {
      organization_id: user.organization_id,
      user_id: user.user_id,
      username: user.username,
    },
  });
}

async function handleLogout(request, response) {
  const sessionId = getSessionIdFromRequest(request);

  if (sessionId) {
    sessions.delete(sessionId);
  }

  response.setHeader("Set-Cookie", buildExpiredSessionCookie());
  sendJson(response, 200, { ok: true });
}

async function handleSessionRead(request, response) {
  const session = getRequestSession(request);

  if (!session) {
    sendJson(response, 401, { error: "Not logged in." });
    return;
  }

  sendJson(response, 200, {
    user: {
      organization_id: session.organization_id,
      user_id: session.user_id,
      username: session.username,
    },
  });
}

async function handlePasswordChange(request, response, session) {
  const payload = await readJsonBody(request);
  const currentPassword = String(payload.currentPassword || "");
  const newPassword = String(payload.newPassword || "");

  if (!currentPassword || !newPassword) {
    sendJson(response, 400, { error: "Current password and new password are required." });
    return;
  }

  const user = await readUserById(session.organization_id, session.user_id);

  if (!user || !verifyPassword(currentPassword, user.password)) {
    sendJson(response, 400, { error: "Current password is incorrect." });
    return;
  }

  if (verifyPassword(newPassword, user.password)) {
    sendJson(response, 400, { error: "New password must be different from the current password." });
    return;
  }

  const validation = validatePassword(newPassword, user.username);

  if (!validation.valid) {
    sendJson(response, 400, {
      error: `New password must ${validation.errors.join(", ")}.`,
    });
    return;
  }

  await updateUserPassword(user.organization_id, user.user_id, hashPassword(newPassword));
  sendJson(response, 200, { ok: true });
}

async function handleTimeEntry(request, response) {
  const entry = await readJsonBody(request);
  const organizationId = await getDefaultOrganizationId();
  const userId = entry.user_id || (await getDefaultUserId(organizationId));
  const entryId = randomUUID();
  const data = normalizeTimeEntry({
    entry_id: entryId,
    organization_id: organizationId,
    user_id: userId,
    client_id: entry.client_id,
    client_name: entry.client_name,
    project_id: entry.project_id,
    project_name: entry.project_name,
    description: entry.description,
    start_time: entry.start_time,
    end_time: entry.end_time,
    duration_seconds: entry.duration_seconds,
    duration_hours: entry.duration_hours,
    billable: entry.billable ?? "yes",
    invoice_status: entry.invoice_status || "unbilled",
  });

  await saveTimeEntry(data);
  await appendAppLog({
    action: "time_entry_created",
    client_id: entry.client_id,
    client_name: entry.client_name,
    project_id: entry.project_id,
    project_name: entry.project_name,
    details: `entry_id=${entryId};duration_seconds=${entry.duration_seconds};storage=database`,
  });
  sendJson(response, 201, { entry_id: entryId, storage: "database" });
}

async function handleTimeEntryUpdate(request, response) {
  const entryId = decodeURIComponent(request.url.split("/").pop() || "");
  const payload = await readJsonBody(request);
  const organizationId = await getDefaultOrganizationId();
  const previousEntry = await readTimeEntry(organizationId, entryId);

  if (!entryId || !previousEntry) {
    sendJson(response, 404, { error: "Time entry not found" });
    return;
  }

  const updatedEntry = normalizeTimeEntry({
    ...payload,
    entry_id: entryId,
    organization_id: organizationId,
    user_id: payload.user_id || previousEntry.user_id || (await getDefaultUserId(organizationId)),
  });

  await updateTimeEntry(updatedEntry);
  await appendAppLog({
    action: "time_entry_updated",
    client_id: updatedEntry.client_id,
    client_name: updatedEntry.client_name,
    project_id: updatedEntry.project_id,
    project_name: updatedEntry.project_name,
    details: `entry_id=${entryId};old_client_id=${previousEntry.client_id};old_project_id=${previousEntry.project_id};old_duration_seconds=${previousEntry.duration_seconds};new_duration_seconds=${updatedEntry.duration_seconds}`,
  });

  sendJson(response, 200, { entry: updatedEntry, storage: "database" });
}

async function handleTimeEntriesRead(response) {
  const entries = await readTimeEntries();
  sendJson(response, 200, { entries });
}

async function handleClientProjectsSave(request, response) {
  const payload = await readJsonBody(request);
  const data = normalizeClientProjectData(payload.data);
  const actions = Array.isArray(payload.actions) ? payload.actions : [];

  await saveClientProjectData(data);

  if (actions.length === 0) {
    await appendAppLog({
      action: "client_project_file_saved",
      details: "No action details provided",
    });
  } else {
    for (const action of actions) {
      await appendAppLog(action);
    }
  }

  sendJson(response, 200, { data });
}

async function handleClientProjectsRead(response) {
  const data = await readClientProjectData();
  sendJson(response, 200, data);
}

async function handleSettingsSave(request, response) {
  const payload = await readJsonBody(request);
  const data = normalizeSettings(payload);

  await saveOrganizationSettings(data);
  await appendAppLog({
    action: "organization_settings_updated",
    details: `organization_name=${data.organizationName};fiscal_year_start_month=${data.fiscalYear.startMonth};fiscal_year_start_day=${data.fiscalYear.startDay};default_billing_rate=${data.defaultBillingRate};billing_period_type=${data.billingPeriod.type};billing_period_start_day=${data.billingPeriod.startDay};rounding_enabled=${data.billingRounding.enabled};rounding_increment=${data.billingRounding.increment}`,
  });

  sendJson(response, 200, { data });
}

async function handleSettingsRead(response) {
  const data = await readOrganizationSettings();
  sendJson(response, 200, data);
}

async function ensureDatabase() {
  // Schema creation is idempotent so starting the server also repairs a missing database.
  await fs.mkdir(DATA_DIR, { recursive: true });
  await runSql(`
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS organization_settings (
  organization_id TEXT PRIMARY KEY,
  fiscal_year_start_month INTEGER NOT NULL,
  fiscal_year_start_day INTEGER NOT NULL,
  default_billing_rate TEXT NOT NULL,
  billing_period_type TEXT NOT NULL,
  billing_period_start_day INTEGER NOT NULL,
  rounding_enabled INTEGER NOT NULL,
  rounding_increment TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id),
  UNIQUE (organization_id, username),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  billing_rate TEXT,
  billing_period_type TEXT,
  billing_period_start_day INTEGER,
  billing_rounding_enabled INTEGER,
  billing_rounding_increment TEXT,
  billing_contact_name TEXT NOT NULL,
  billing_contact_email TEXT NOT NULL,
  billing_contact_alternate_name TEXT NOT NULL,
  billing_contact_alternate_email TEXT NOT NULL,
  billing_contact_phone_number TEXT NOT NULL,
  billing_contact_alternate_phone_number TEXT NOT NULL,
  billing_contact_street_address_1 TEXT NOT NULL,
  billing_contact_street_address_2 TEXT NOT NULL,
  billing_contact_city TEXT NOT NULL,
  billing_contact_state TEXT NOT NULL,
  billing_contact_zip_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  billing_rate TEXT,
  billing_period_type TEXT,
  billing_period_start_day INTEGER,
  billing_rounding_enabled INTEGER,
  billing_rounding_increment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (organization_id, client_id) REFERENCES clients(organization_id, id)
);
CREATE TABLE IF NOT EXISTS time_entries (
  entry_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  description TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  duration_hours TEXT NOT NULL,
  billable TEXT NOT NULL,
  invoice_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, entry_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
`);

  const organizations = await querySql("SELECT id FROM organizations ORDER BY created_at LIMIT 1;");
  let organizationId = "";

  if (organizations.length === 0) {
    // Bootstrap the first organization from legacy settings when available.
    const seedSettings = await readSeedSettings();
    const now = new Date().toISOString();
    organizationId = randomUUID();

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
  } else {
    organizationId = organizations[0].id;
  }

  const settings = await querySql(
    `SELECT organization_id FROM organization_settings WHERE organization_id = ${sqlText(organizationId)} LIMIT 1;`,
  );

  if (settings.length === 0) {
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

  await seedClientProjectData(organizationId);
  await seedSuperAdminUser(organizationId);
  await seedTimeEntryData(organizationId);
}

async function readSeedSettings() {
  try {
    const settingsJson = await fs.readFile(SETTINGS_FILE, "utf8");
    return normalizeSettings(JSON.parse(settingsJson));
  } catch (error) {
    if (error.code === "ENOENT") {
      return normalizeSettings({ organizationName: DEFAULT_ORGANIZATION_NAME });
    }

    throw error;
  }
}

async function readOrganizationSettings() {
  await ensureDatabase();
  const rows = await querySql(`
SELECT
  organizations.name AS organization_name,
  organization_settings.fiscal_year_start_month,
  organization_settings.fiscal_year_start_day,
  organization_settings.default_billing_rate,
  organization_settings.billing_period_type,
  organization_settings.billing_period_start_day,
  organization_settings.rounding_enabled,
  organization_settings.rounding_increment
FROM organizations
INNER JOIN organization_settings ON organization_settings.organization_id = organizations.id
ORDER BY organizations.created_at
LIMIT 1;
`);

  if (rows.length === 0) {
    return normalizeSettings({ organizationName: DEFAULT_ORGANIZATION_NAME });
  }

  return settingsRowToOrganizationSettings(rows[0]);
}

async function saveOrganizationSettings(settings) {
  await ensureDatabase();
  const organizations = await querySql("SELECT id FROM organizations ORDER BY created_at LIMIT 1;");

  if (organizations.length === 0) {
    throw new Error("No organization exists for organization settings.");
  }

  const organizationId = organizations[0].id;
  const now = new Date().toISOString();

  await runSql(`
UPDATE organizations
SET name = ${sqlText(settings.organizationName)}, updated_at = ${sqlText(now)}
WHERE id = ${sqlText(organizationId)};
UPDATE organization_settings
SET
  fiscal_year_start_month = ${sqlInteger(settings.fiscalYear.startMonth)},
  fiscal_year_start_day = ${sqlInteger(settings.fiscalYear.startDay)},
  default_billing_rate = ${sqlText(settings.defaultBillingRate)},
  billing_period_type = ${sqlText(settings.billingPeriod.type)},
  billing_period_start_day = ${sqlInteger(settings.billingPeriod.startDay)},
  rounding_enabled = ${sqlInteger(settings.billingRounding.enabled ? 1 : 0)},
  rounding_increment = ${sqlText(settings.billingRounding.increment)},
  updated_at = ${sqlText(now)}
WHERE organization_id = ${sqlText(organizationId)};
`);
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

  await saveClientProjectData(seedData, organizationId);
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
INSERT INTO users (user_id, organization_id, username, password)
VALUES (
  ${sqlText(userId)},
  ${sqlText(organizationId)},
  ${sqlText(DEFAULT_SUPER_ADMIN_USERNAME)},
  ${sqlText(hashPassword(passwordSetup.password))}
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

async function readSeedClientProjectData() {
  try {
    const clientProjectJson = await fs.readFile(CLIENT_PROJECT_FILE, "utf8");
    return normalizeClientProjectData(JSON.parse(clientProjectJson));
  } catch (error) {
    if (error.code === "ENOENT") {
      return normalizeClientProjectData({});
    }

    throw error;
  }
}

async function readClientProjectData() {
  await ensureDatabase();
  const organizationId = await getDefaultOrganizationId();
  const clientRows = await querySql(`
SELECT
  id,
  name,
  status,
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
  billing_contact_zip_code
FROM clients
WHERE organization_id = ${sqlText(organizationId)}
ORDER BY name;
`);
  const projectRows = await querySql(`
SELECT
  id,
  client_id,
  name,
  status,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment
FROM projects
WHERE organization_id = ${sqlText(organizationId)}
ORDER BY name;
`);
  const projectsByClientId = projectRows.reduce((projectsByClient, row) => {
    const project = projectRowToAppProject(row);

    if (!projectsByClient.has(row.client_id)) {
      projectsByClient.set(row.client_id, []);
    }

    projectsByClient.get(row.client_id).push(project);
    return projectsByClient;
  }, new Map());

  return normalizeClientProjectData({
    clients: clientRows.map((row) => ({
      ...clientRowToAppClient(row),
      projects: projectsByClientId.get(row.id) || [],
    })),
  });
}

async function saveClientProjectData(data, organizationId = "") {
  if (!organizationId) {
    await ensureDatabase();
    organizationId = await getDefaultOrganizationId();
  }

  const normalizedData = normalizeClientProjectData(data);
  const now = new Date().toISOString();
  const statements = [
    "BEGIN TRANSACTION;",
    `DELETE FROM projects WHERE organization_id = ${sqlText(organizationId)};`,
    `DELETE FROM clients WHERE organization_id = ${sqlText(organizationId)};`,
  ];

  normalizedData.clients.forEach((client) => {
    statements.push(createClientInsertSql(organizationId, client, now));
    client.projects.forEach((project) => {
      statements.push(createProjectInsertSql(organizationId, client.id, project, now));
    });
  });

  statements.push("COMMIT;");
  await runSql(statements.join("\n"));
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

async function readSeedTimeEntries(organizationId, userId) {
  const existingCsv = await readExistingCsv(TIME_ENTRIES_FILE);
  const rows = parseCsvRows(existingCsv.trim());

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const entry = Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));

    return normalizeTimeEntry({
      ...entry,
      organization_id: organizationId,
      user_id: entry.user_id || userId,
    });
  });
}

async function readTimeEntries() {
  await ensureDatabase();
  const organizationId = await getDefaultOrganizationId();
  const rows = await querySql(`
SELECT
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
  invoice_status
FROM time_entries
WHERE organization_id = ${sqlText(organizationId)}
ORDER BY end_time;
`);

  return rows.map(timeEntryRowToAppValue);
}

async function readTimeEntry(organizationId, entryId) {
  const rows = await querySql(`
SELECT
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
  invoice_status
FROM time_entries
WHERE organization_id = ${sqlText(organizationId)}
  AND entry_id = ${sqlText(entryId)}
LIMIT 1;
`);

  return rows[0] ? timeEntryRowToAppValue(rows[0]) : null;
}

async function saveTimeEntry(entry) {
  const now = new Date().toISOString();
  await runSql(createTimeEntryInsertSql(entry, now));
}

async function updateTimeEntry(entry) {
  const now = new Date().toISOString();
  await runSql(`
UPDATE time_entries
SET
  user_id = ${sqlText(entry.user_id)},
  client_id = ${sqlText(entry.client_id)},
  client_name = ${sqlText(entry.client_name)},
  project_id = ${sqlText(entry.project_id)},
  project_name = ${sqlText(entry.project_name)},
  description = ${sqlText(entry.description)},
  start_time = ${sqlText(entry.start_time)},
  end_time = ${sqlText(entry.end_time)},
  duration_seconds = ${sqlInteger(entry.duration_seconds)},
  duration_hours = ${sqlText(entry.duration_hours)},
  billable = ${sqlText(entry.billable)},
  invoice_status = ${sqlText(entry.invoice_status)},
  updated_at = ${sqlText(now)}
WHERE organization_id = ${sqlText(entry.organization_id)}
  AND entry_id = ${sqlText(entry.entry_id)};
`);
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

function timeEntryRowToAppValue(row) {
  return normalizeTimeEntry({
    entry_id: row.entry_id,
    organization_id: row.organization_id,
    user_id: row.user_id,
    client_id: row.client_id,
    client_name: row.client_name,
    project_id: row.project_id,
    project_name: row.project_name,
    description: row.description,
    start_time: row.start_time,
    end_time: row.end_time,
    duration_seconds: row.duration_seconds,
    duration_hours: row.duration_hours,
    billable: row.billable,
    invoice_status: row.invoice_status,
  });
}

async function getDefaultOrganizationId() {
  const organizations = await querySql("SELECT id FROM organizations ORDER BY created_at LIMIT 1;");

  if (organizations.length === 0) {
    throw new Error("No default organization exists.");
  }

  return organizations[0].id;
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

async function readUserByUsername(username) {
  await ensureDatabase();
  const rows = await querySql(`
SELECT
  user_id,
  organization_id,
  username,
  password
FROM users
WHERE username = ${sqlText(username)}
ORDER BY username
LIMIT 1;
`);

  return rows[0] || null;
}

async function readUserById(organizationId, userId) {
  await ensureDatabase();
  const rows = await querySql(`
SELECT
  user_id,
  organization_id,
  username,
  password
FROM users
WHERE organization_id = ${sqlText(organizationId)}
  AND user_id = ${sqlText(userId)}
LIMIT 1;
`);

  return rows[0] || null;
}

async function updateUserPassword(organizationId, userId, passwordHash) {
  await runSql(`
UPDATE users
SET password = ${sqlText(passwordHash)}
WHERE organization_id = ${sqlText(organizationId)}
  AND user_id = ${sqlText(userId)};
`);
}

function createClientInsertSql(organizationId, client, now) {
  const contact = normalizeBillingContact(client.billing_contact);

  return `
INSERT INTO clients (
  id,
  organization_id,
  name,
  status,
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
  ${sqlNullableText(project.billing_rate)},
  ${sqlNullableText(project.billing_period?.type)},
  ${sqlNullableInteger(project.billing_period?.startDay)},
  ${sqlNullableInteger(project.billing_rounding ? (project.billing_rounding.enabled ? 1 : 0) : null)},
  ${sqlNullableText(project.billing_rounding?.increment)},
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function clientRowToAppClient(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    billing_rate: normalizeBillingRate(row.billing_rate),
    billing_period: billingPeriodRowToAppValue(row),
    billing_rounding: billingRoundingRowToAppValue(row),
    billing_contact: {
      name: row.billing_contact_name,
      email: row.billing_contact_email,
      alternate_name: row.billing_contact_alternate_name,
      alternate_email: row.billing_contact_alternate_email,
      phone_number: row.billing_contact_phone_number,
      alternate_phone_number: row.billing_contact_alternate_phone_number,
      street_address_1: row.billing_contact_street_address_1,
      street_address_2: row.billing_contact_street_address_2,
      city: row.billing_contact_city,
      state: row.billing_contact_state,
      zip_code: row.billing_contact_zip_code,
    },
  };
}

function projectRowToAppProject(row) {
  return {
    id: row.id,
    name: row.name,
    billing_rate: normalizeBillingRate(row.billing_rate),
    billing_period: billingPeriodRowToAppValue(row),
    billing_rounding: billingRoundingRowToAppValue(row),
    status: row.status,
  };
}

function billingPeriodRowToAppValue(row) {
  if (!row.billing_period_type) {
    return null;
  }

  return normalizeBillingPeriod({
    type: row.billing_period_type,
    startDay: row.billing_period_start_day,
  });
}

function billingRoundingRowToAppValue(row) {
  if (row.billing_rounding_enabled === null || row.billing_rounding_enabled === undefined) {
    return null;
  }

  return normalizeBillingRounding({
    enabled: Number(row.billing_rounding_enabled) === 1,
    increment: row.billing_rounding_increment,
  });
}

function settingsRowToOrganizationSettings(row) {
  return normalizeSettings({
    organizationName: row.organization_name,
    fiscalYear: {
      startMonth: row.fiscal_year_start_month,
      startDay: row.fiscal_year_start_day,
    },
    defaultBillingRate: row.default_billing_rate,
    billingPeriod: {
      type: row.billing_period_type,
      startDay: row.billing_period_start_day,
    },
    billingRounding: {
      enabled: Number(row.rounding_enabled) === 1,
      increment: row.rounding_increment,
    },
  });
}

function runSql(sql) {
  // SQLite is accessed through the CLI to keep the server dependency-free for now.
  return new Promise((resolve, reject) => {
    execFile(SQLITE_COMMAND, [DATABASE_FILE, sql], { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      resolve(stdout);
    });
  });
}

function querySql(sql) {
  // The sqlite3 CLI can emit JSON, which keeps row parsing small and predictable.
  return new Promise((resolve, reject) => {
    execFile(SQLITE_COMMAND, ["-json", DATABASE_FILE, sql], { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      try {
        resolve(stdout.trim() ? JSON.parse(stdout) : []);
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

function sqlText(value) {
  // Escape single quotes before interpolating into the local SQLite command string.
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function sqlNullableText(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? "NULL"
    : sqlText(value);
}

function sqlInteger(value) {
  const numberValue = Number.parseInt(value, 10);
  return Number.isFinite(numberValue) ? String(numberValue) : "0";
}

function sqlNullableInteger(value) {
  if (value === null || value === undefined || value === "") {
    return "NULL";
  }

  const numberValue = Number.parseInt(value, 10);
  return Number.isFinite(numberValue) ? String(numberValue) : "NULL";
}

async function serveStaticFile(request, response) {
  const requestPath = new URL(request.url, `http://${HOST}:${PORT}`).pathname;
  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const filePath = path.resolve(ROOT, relativePath);

  // Prevent URLs like /../secret.txt from escaping the project directory.
  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const contents = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
    });
    response.end(contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    throw error;
  }
}

async function handleUnauthenticatedRequest(request, response, pathname) {
  // Splash/login assets stay public; the actual app shell and APIs stay protected.
  if (request.method === "GET" && isLoginAssetPath(pathname)) {
    await serveStaticFile(request, response);
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(response, 401, { error: "Login required." });
    return;
  }

  if (request.method === "GET") {
    response.writeHead(302, {
      Location: "/login.html",
      "Cache-Control": "no-store",
    });
    response.end();
    return;
  }

  sendJson(response, 401, { error: "Login required." });
}

function isLoginAssetPath(pathname) {
  return (
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/login.html" ||
    pathname === "/footer.js" ||
    pathname === "/login.js" ||
    pathname === "/styles/longtail-forge.css"
  );
}

function readJsonBody(request) {
  // A tiny JSON body reader is enough for this app's local API payloads.
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 100000) {
        request.destroy();
        reject(new Error("Request body is too large"));
      }
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizeTimeEntry(entry) {
  // Store a stable API shape even as callers send browser form values.
  return {
    entry_id: String(entry.entry_id || "").trim(),
    organization_id: String(entry.organization_id || "").trim(),
    user_id: String(entry.user_id || "").trim(),
    client_id: String(entry.client_id || "").trim(),
    client_name: String(entry.client_name || "").trim(),
    project_id: String(entry.project_id || "").trim(),
    project_name: String(entry.project_name || "").trim(),
    description: String(entry.description || "").trim(),
    start_time: String(entry.start_time || "").trim(),
    end_time: String(entry.end_time || "").trim(),
    duration_seconds: String(entry.duration_seconds || "0").trim(),
    duration_hours: String(entry.duration_hours || "0").trim(),
    billable: entry.billable === "no" ? "no" : "yes",
    invoice_status: ["unbilled", "billed", "paid"].includes(entry.invoice_status)
      ? entry.invoice_status
      : "unbilled",
  };
}

function getSuperAdminPassword() {
  // SUPER_ADMIN_PASSWORD should be set outside development; generated passwords are a fallback.
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

function createGeneratedPassword() {
  return `Aa1!${randomBytes(18).toString("base64url")}`;
}

function validatePassword(password, username) {
  const text = String(password || "");
  const lowerText = text.toLowerCase();
  const lowerUsername = String(username || "").toLowerCase();
  const commonPasswords = new Set([
    "password",
    "password1",
    "password123",
    "admin1234",
    "letmein123",
    "changeme",
    "qwerty123",
  ]);
  const errors = [];

  if (text.length < 8) {
    errors.push("use at least 8 characters");
  }

  if (!/[a-z]/.test(text)) {
    errors.push("include a lowercase letter");
  }

  if (!/[A-Z]/.test(text)) {
    errors.push("include an uppercase letter");
  }

  if (!/[0-9]/.test(text)) {
    errors.push("include a number");
  }

  if (!/[^A-Za-z0-9]/.test(text)) {
    errors.push("include a symbol");
  }

  if (/\s/.test(text)) {
    errors.push("do not use spaces");
  }

  if (lowerUsername && lowerText.includes(lowerUsername)) {
    errors.push("do not include the username");
  }

  if (commonPasswords.has(lowerText)) {
    errors.push("avoid common passwords");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const iterations = 310000;
  const digest = "sha256";
  const keyLength = 32;
  const hash = pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("base64url");

  return `pbkdf2_${digest}$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, storedPassword) {
  const [algorithm, iterationsText, salt, storedHash] = String(storedPassword || "").split("$");
  const digest = algorithm === "pbkdf2_sha256" ? "sha256" : "";
  const iterations = Number.parseInt(iterationsText, 10);

  if (!digest || !Number.isFinite(iterations) || !salt || !storedHash) {
    return false;
  }

  const keyLength = Math.max(32, Buffer.from(storedHash, "base64url").length);
  const hash = pbkdf2Sync(password, salt, iterations, keyLength, digest).toString("base64url");

  return timingSafeEqualText(hash, storedHash);
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function rowToObject(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
}

function parseCsvRows(csvText) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function normalizeClientProjectData(data) {
  // This is the persistence gate for client/project fields; add new fields here when the UI grows.
  const clients = Array.isArray(data?.clients) ? data.clients : [];

  return {
    clients: clients.map((client) => ({
      id: String(client.id || "").trim(),
      name: String(client.name || "").trim(),
      status: normalizeClientStatus(client.status),
      billing_rate: normalizeBillingRate(client.billing_rate),
      billing_period: normalizeOptionalBillingPeriod(client.billing_period),
      billing_rounding: normalizeOptionalBillingRounding(client.billing_rounding),
      billing_contact: normalizeBillingContact(client.billing_contact),
      projects: Array.isArray(client.projects)
        ? client.projects.map((project) => ({
            id: String(project.id || "").trim(),
            name: String(project.name || "").trim(),
            billing_rate: normalizeBillingRate(project.billing_rate),
            billing_period: normalizeOptionalBillingPeriod(project.billing_period),
            billing_rounding: normalizeOptionalBillingRounding(project.billing_rounding),
            status: normalizeStatus(project.status),
          }))
        : [],
    })),
  };
}

function normalizeSettings(settings) {
  return {
    organizationName: String(settings?.organizationName || "Organization").trim() || "Organization",
    fiscalYear: normalizeFiscalYear(settings?.fiscalYear),
    defaultBillingRate: String(settings?.defaultBillingRate || "").trim(),
    billingPeriod: normalizeBillingPeriod(settings?.billingPeriod),
    billingRounding: normalizeBillingRounding(settings?.billingRounding),
  };
}

function normalizeBillingRate(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeFiscalYear(fiscalYear) {
  const startMonth = Math.min(12, Math.max(1, Number.parseInt(fiscalYear?.startMonth, 10) || 1));
  const startDay = Math.min(
    getDaysInFiscalYearMonth(startMonth),
    Math.max(1, Number.parseInt(fiscalYear?.startDay, 10) || 1),
  );

  return {
    startMonth,
    startDay,
  };
}

function getDaysInFiscalYearMonth(month) {
  return new Date(2026, month, 0).getDate();
}

function normalizeBillingPeriod(period) {
  // Custom billing periods are capped to day 28 so every month can contain the start day.
  const type = period?.type === "custom" ? "custom" : "calendarMonth";
  const startDay = Math.min(28, Math.max(1, Number.parseInt(period?.startDay, 10) || 1));

  return {
    type,
    startDay: type === "custom" ? startDay : 1,
  };
}

function normalizeOptionalBillingPeriod(period) {
  if (!period || period.type === "inherit") {
    return null;
  }

  return normalizeBillingPeriod(period);
}

function normalizeBillingRounding(rounding) {
  const increments = ["nearestHour", "nearestHalfHour", "nearestQuarterHour"];
  const increment = increments.includes(rounding?.increment)
    ? rounding.increment
    : "nearestQuarterHour";

  return {
    enabled: Boolean(rounding?.enabled),
    increment,
  };
}

function normalizeOptionalBillingRounding(rounding) {
  if (!rounding || rounding.type === "inherit") {
    return null;
  }

  return normalizeBillingRounding(rounding);
}

function normalizeBillingContact(contact) {
  return {
    name: String(contact?.name || "").trim(),
    email: String(contact?.email || "").trim(),
    alternate_name: String(contact?.alternate_name || "").trim(),
    alternate_email: String(contact?.alternate_email || "").trim(),
    phone_number: String(contact?.phone_number || "").trim(),
    alternate_phone_number: String(contact?.alternate_phone_number || "").trim(),
    street_address_1: String(contact?.street_address_1 || "").trim(),
    street_address_2: String(contact?.street_address_2 || "").trim(),
    city: String(contact?.city || "").trim(),
    state: String(contact?.state || "").trim(),
    zip_code: String(contact?.zip_code || "").trim(),
  };
}

function normalizeStatus(status) {
  return ["Active", "Inactive", "Completed"].includes(status) ? status : "Active";
}

function normalizeClientStatus(status) {
  return ["Active", "Inactive"].includes(status) ? status : "Active";
}

async function readExistingCsv(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

async function appendAppLog(event) {
  // Append-only logs make front-end actions inspectable without querying the database.
  const existingLog = await readExistingCsv(APP_LOG_FILE);
  const row = [
    new Date().toISOString(),
    event.username || "",
    event.action || "",
    event.client_id || "",
    event.client_name || "",
    event.project_id || "",
    event.project_name || "",
    event.details || "",
  ]
    .map(toCsvValue)
    .join(",");

  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.appendFile(APP_LOG_FILE, buildAppLogAppend(existingLog, row), "utf8");
}

function buildAppLogAppend(existingLog, row) {
  if (!existingLog.trimEnd()) {
    return `${APP_LOG_HEADER}\n${row}\n`;
  }

  return `${existingLog.endsWith("\n") ? "" : "\n"}${row}\n`;
}

function toCsvValue(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function getRequestSession(request) {
  // Sessions are intentionally in-memory; restarting the local server logs everyone out.
  const sessionId = getSessionIdFromRequest(request);

  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

function getSessionIdFromRequest(request) {
  const cookies = parseCookieHeader(request.headers.cookie || "");
  return cookies[SESSION_COOKIE_NAME] || "";
}

function parseCookieHeader(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((cookies, cookie) => {
      const separatorIndex = cookie.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const name = cookie.slice(0, separatorIndex).trim();
      const value = cookie.slice(separatorIndex + 1).trim();

      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function buildSessionCookie(sessionId, maxAgeSeconds) {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax`;
}

function buildExpiredSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function formatYearMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(date) {
  return `${formatYearMonth(date)}-${String(date.getDate()).padStart(2, "0")}`;
}
