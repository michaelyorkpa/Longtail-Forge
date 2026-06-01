import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const baseUrl = process.env.LONGTAIL_FORGE_BASE_URL || "http://127.0.0.1:8001";
const dbFile = process.env.LONGTAIL_FORGE_DB || "data/longtail-forge.db";
const sqliteCommand = process.env.SQLITE_COMMAND || "sqlite3";
const sessionCookie = "longtail_forge_session";
const createdWorkspaceIds = [];
const createdProjectIds = [];
const createdEntryIds = [];
const createdApiKeyIds = [];
const createdSessionIds = [];

function query(sql) {
  const output = execFileSync(sqliteCommand, ["-json", dbFile, sql], { encoding: "utf8" }).trim();
  return output ? JSON.parse(output) : [];
}

function run(sql) {
  execFileSync(sqliteCommand, [dbFile, sql], { encoding: "utf8" });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, { method = "GET", sessionId = "", apiKey = "", body = null, expected = [200] } = {}) {
  const headers = {};

  if (sessionId) {
    headers.cookie = `${sessionCookie}=${sessionId}`;
  }

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  if (body) {
    headers["content-type"] = "application/json";
  }

  const response = await globalThis.fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  assert(expected.includes(response.status), `${method} ${path} returned ${response.status}: ${text}`);
  return payload;
}

function createSession({ organizationId, userId, username }) {
  const sessionId = `codex-0305-${randomUUID()}`;
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  createdSessionIds.push(sessionId);
  run(`
INSERT INTO sessions (
  session_id,
  organization_id,
  user_id,
  username,
  timezone,
  active_workspace_id,
  expires_at,
  created_at,
  updated_at
)
VALUES (
  '${sessionId}',
  '${organizationId}',
  '${userId}',
  '${username}',
  'America/New_York',
  '${organizationId}',
  '${expires}',
  '${now}',
  '${now}'
);
`);

  return sessionId;
}

function createDirectApiKey({ workspaceId, userId, name, scopes }) {
  const apiKeyId = randomUUID();
  const rawKey = `ltf_live_${randomBytes(24).toString("base64url")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 17);
  const now = new Date().toISOString();
  const scopeSql = scopes.map((scope) => `
INSERT INTO api_key_scopes (api_key_id, scope)
VALUES ('${apiKeyId}', '${scope}');
`).join("\n");

  createdApiKeyIds.push(apiKeyId);
  run(`
BEGIN TRANSACTION;
INSERT INTO api_keys (
  api_key_id,
  organization_id,
  workspace_id,
  created_by_user_id,
  name,
  key_hash,
  key_prefix,
  status,
  created_at,
  last_used_at,
  revoked_at
)
VALUES (
  '${apiKeyId}',
  '${workspaceId}',
  '${workspaceId}',
  '${userId}',
  '${name}',
  '${keyHash}',
  '${keyPrefix}',
  'active',
  '${now}',
  NULL,
  NULL
);
${scopeSql}
COMMIT;
`);

  return {
    apiKey: {
      api_key_id: apiKeyId,
      workspace_id: workspaceId,
      key_prefix: keyPrefix,
      scopes,
    },
    rawKey,
  };
}

async function main() {
  const business = query(`
SELECT organizations.id, organizations.name, users.user_id, users.username
FROM organizations
INNER JOIN users ON users.organization_id = organizations.id
WHERE organizations.workspace_type = 'business'
ORDER BY organizations.created_at
LIMIT 1;
`)[0];
  assert(business, "No business workspace with a user was found.");

  const oneWorkspaceUser = query(`
SELECT users.organization_id, users.user_id, users.username
FROM users
WHERE users.user_id IN (
  SELECT user_id
  FROM user_workspaces
  WHERE status = 'active'
  GROUP BY user_id
  HAVING COUNT(*) = 1
)
LIMIT 1;
`)[0];
  assert(oneWorkspaceUser, "No single-workspace user was found.");

  const businessProject = query(`
SELECT id
FROM projects
WHERE organization_id = '${business.id}'
ORDER BY updated_at DESC
LIMIT 1;
`)[0];
  assert(businessProject, "No existing business project was found for migrated-data visibility.");

  const oneWorkspaceSession = createSession({
    organizationId: oneWorkspaceUser.organization_id,
    userId: oneWorkspaceUser.user_id,
    username: oneWorkspaceUser.username,
  });
  const singleSessionBody = await request("/api/session", { sessionId: oneWorkspaceSession });
  assert(singleSessionBody.user.workspaces.length === 1, "Single-workspace user did not load exactly one workspace.");

  const adminSession = createSession({
    organizationId: business.id,
    userId: business.user_id,
    username: business.username,
  });
  const multiSessionBody = await request("/api/session", { sessionId: adminSession });
  assert(multiSessionBody.user.workspaces.length >= 1, "Admin session did not load workspaces.");

  const familyWorkspace = await request("/api/workspaces", {
    method: "POST",
    sessionId: adminSession,
    body: { workspaceType: "family", workspaceName: "Codex 0.30.5 Family" },
    expected: [201],
  });
  createdWorkspaceIds.push(familyWorkspace.workspace.workspaceId);
  const familySettings = await request("/api/settings", { sessionId: adminSession });
  assert(familySettings.workspaceType === "family", "Family workspace did not become the active workspace.");
  assert(familySettings.workspaceCapabilities.maxUsers === 20, "Family workspace did not expose the expected user limit.");
  const familyUsers = await request("/api/users", { sessionId: adminSession });
  assert(Array.isArray(familyUsers.users) && familyUsers.users.length >= 1, "Family workspace users did not load.");

  const personalWorkspace = await request("/api/workspaces", {
    method: "POST",
    sessionId: adminSession,
    body: { workspaceType: "personal", workspaceName: "Codex 0.30.5 Personal" },
    expected: [201],
  });
  const personalWorkspaceId = personalWorkspace.workspace.workspaceId;
  createdWorkspaceIds.push(personalWorkspaceId);

  const personalProjectId = randomUUID();
  createdProjectIds.push(personalProjectId);
  const personalProject = await request("/api/projects", {
    method: "POST",
    sessionId: adminSession,
    body: {
      id: personalProjectId,
      name: "Codex 0.30.5 Project",
      status: "Active",
      billable: "no",
      client_id: "",
    },
    expected: [201],
  });
  assert(personalProject.project.id === personalProjectId, "Personal project was not created.");
  const personalProjectRows = query(`
SELECT workspace_id, COALESCE(client_id, '') AS client_id
FROM projects
WHERE id = '${personalProjectId}'
LIMIT 1;
`);
  assert(personalProjectRows[0]?.workspace_id === personalWorkspaceId, "Personal project was not workspace-scoped.");
  assert(!personalProjectRows[0]?.client_id, "Personal project unexpectedly required a client.");

  const personalApiKey = createDirectApiKey({
    workspaceId: personalWorkspaceId,
    userId: business.user_id,
    name: "Codex 0.30.5 Personal API",
    scopes: [
      "projects:read",
      "time_entries:read",
      "time_entries:write",
    ],
  });
  assert(personalApiKey.apiKey.workspace_id === personalWorkspaceId, "Personal API key was not scoped to the active workspace.");

  const personalProjects = await request("/api/v1/projects", { apiKey: personalApiKey.rawKey });
  assert(personalProjects.workspace_id === personalWorkspaceId, "Public project list did not include workspace_id.");
  assert(personalProjects.data.some((project) => project.id === personalProjectId), "Personal workspace project was not visible through its API key.");

  await request(`/api/v1/projects/${businessProject.id}`, {
    apiKey: personalApiKey.rawKey,
    expected: [404],
  });

  await request("/api/v1/time-entries", {
    method: "POST",
    apiKey: personalApiKey.rawKey,
    body: {
      description: "Missing project smoke",
      start_time: "2026-06-01T13:00:00.000Z",
      end_time: "2026-06-01T13:15:00.000Z",
    },
    expected: [404],
  });

  const entryId = randomUUID();
  createdEntryIds.push(entryId);
  const createdEntry = await request("/api/v1/time-entries", {
    method: "POST",
    apiKey: personalApiKey.rawKey,
    body: {
      entry_id: entryId,
      project_id: personalProjectId,
      description: "Codex 0.30.5 workspace smoke",
      start_time: "2026-06-01T13:00:00.000Z",
      end_time: "2026-06-01T13:30:00.000Z",
      billable: "no",
    },
    expected: [201],
  });
  assert(createdEntry.workspace_id === personalWorkspaceId, "Public time-entry response did not include the workspace envelope.");
  assert(createdEntry.data.workspace_id === personalWorkspaceId, "Public time-entry record did not include workspace_id.");
  assert(!createdEntry.data.client_id, "Workspace-level time entry unexpectedly required a client.");

  const auditRows = query(`
SELECT workspace_id, metadata_json
FROM audit_logs
WHERE action = 'public_api_time_entry_created'
  AND record_id = '${entryId}'
LIMIT 1;
`);
  assert(auditRows[0]?.workspace_id === personalWorkspaceId, "Public API audit log did not record workspace_id.");
  assert(auditRows[0]?.metadata_json.includes(personalWorkspaceId), "Public API audit metadata did not include workspace context.");

  await request("/api/session/workspace", {
    method: "POST",
    sessionId: adminSession,
    body: { workspaceId: business.id },
  });
  const switchedSession = await request("/api/session", { sessionId: adminSession });
  assert(switchedSession.user.active_workspace_id === business.id, "Workspace switch did not set the business workspace active.");
  const businessApiKey = createDirectApiKey({
    workspaceId: business.id,
    userId: business.user_id,
    name: "Codex 0.30.5 Business API",
    scopes: [
      "clients:read",
      "projects:read",
      "time_entries:read",
    ],
  });
  const businessClients = await request("/api/v1/clients", { apiKey: businessApiKey.rawKey });
  const businessProjects = await request("/api/v1/projects", { apiKey: businessApiKey.rawKey });
  const businessEntries = await request("/api/v1/time-entries", { apiKey: businessApiKey.rawKey });
  assert(businessClients.workspace_id === business.id, "Business clients response did not include workspace_id.");
  assert(businessProjects.data.length > 0, "Existing migrated business projects were not visible.");
  assert(businessEntries.workspace_id === business.id, "Business time entries response did not include workspace_id.");

  console.log("0.30.5 workspace smoke passed.");
}

try {
  await main();
} finally {
  const keyIds = createdApiKeyIds.map((id) => `'${id}'`).join(",");
  const workspaceIds = createdWorkspaceIds.map((id) => `'${id}'`).join(",");
  const projectIds = createdProjectIds.map((id) => `'${id}'`).join(",");
  const entryIds = createdEntryIds.map((id) => `'${id}'`).join(",");
  const sessionIds = createdSessionIds.map((id) => `'${id}'`).join(",");

  if (keyIds) {
    run(`DELETE FROM api_key_scopes WHERE api_key_id IN (${keyIds}); DELETE FROM api_keys WHERE api_key_id IN (${keyIds});`);
  }

  if (entryIds) {
    run(`DELETE FROM time_entries WHERE entry_id IN (${entryIds}); DELETE FROM active_timers WHERE timer_slot IN (${entryIds});`);
  }

  if (projectIds) {
    run(`DELETE FROM projects WHERE id IN (${projectIds});`);
  }

  if (workspaceIds) {
    run(`
DELETE FROM audit_logs WHERE workspace_id IN (${workspaceIds}) OR organization_id IN (${workspaceIds});
DELETE FROM organization_modules WHERE workspace_id IN (${workspaceIds}) OR organization_id IN (${workspaceIds});
DELETE FROM user_role_assignments WHERE workspace_id IN (${workspaceIds}) OR organization_id IN (${workspaceIds});
DELETE FROM user_workspaces WHERE workspace_id IN (${workspaceIds});
DELETE FROM users WHERE organization_id IN (${workspaceIds});
DELETE FROM workspace_settings WHERE workspace_id IN (${workspaceIds});
DELETE FROM organization_settings WHERE organization_id IN (${workspaceIds});
DELETE FROM workspaces WHERE workspace_id IN (${workspaceIds});
DELETE FROM organizations WHERE id IN (${workspaceIds});
`);
  }

  if (sessionIds) {
    run(`DELETE FROM sessions WHERE session_id IN (${sessionIds});`);
  }
}
