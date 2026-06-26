/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { URLSearchParams } from "node:url";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-files-attachable-target-options-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-files-attachable-target-options.db");
process.env.SUPER_ADMIN_PASSWORD = "Files-Attachable-Target-Options-Test-123!";

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");

const results = [];
let server;

try {
  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);

  await checkAsync("Business target options expose readable allowed targets and context filters", async () => {
    const result = await api.get("/api/files/attachable-targets", {
      cookie: fixtures.adminSessionId,
      query: {
        moduleId: "tasks",
        search: "Allowed Option",
        targetType: "task",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.workspaceType, "business");
    assert.equal(result.body.count, 1);
    const option = result.body.options[0];
    assert.equal(option.label, "Allowed Option Task");
    assert.equal(option.moduleLabel, "Tasks");
    assert.equal(option.targetTypeLabel, "Task");
    assert.equal(option.targetId, fixtures.allowedTaskId);
    assert.equal(option.value.targetId, fixtures.allowedTaskId);
    assert.equal(option.clientId, fixtures.clientId);
    assert.equal(option.clientLabel, "Allowed Option Client");
    assert.equal(option.projectId, fixtures.projectId);
    assert.equal(option.projectLabel, "Allowed Option Project");
    assert.match(option.contextLabel, /Allowed Option Client/);
    assert.match(option.contextLabel, /Allowed Option Project/);
    assert.equal(result.body.filters.client.visible, true);
    assert.ok(result.body.filters.client.options.some((entry) => entry.value === fixtures.clientId && entry.label === "Allowed Option Client"));
    assert.ok(result.body.filters.project.options.some((entry) => entry.value === fixtures.projectId && entry.label === "Allowed Option Project"));
    assert.ok(result.body.targetTypes.some((entry) => entry.moduleId === "tasks" && entry.targetType === "task" && entry.label === "Tasks: Task"));
    assertNoStorageLeak(result.body);
    assertSafeLabels(result.body);
  });

  await checkAsync("Business filters narrow by Client and Project without exposing archived targets", async () => {
    const result = await api.get("/api/files/attachable-targets", {
      cookie: fixtures.adminSessionId,
      query: {
        clientId: fixtures.clientId,
        moduleId: "tasks",
        projectId: fixtures.projectId,
        targetType: "task",
      },
    });

    assert.equal(result.status, 200);
    assert.ok(result.body.options.some((option) => option.targetId === fixtures.allowedTaskId));
    assert.ok(result.body.options.some((option) => option.targetId === fixtures.rawLabelTaskId));
    assert.ok(!result.body.options.some((option) => option.targetId === fixtures.archivedTaskId));
    assert.ok(result.body.options.every((option) => option.clientId === fixtures.clientId));
    assert.ok(result.body.options.every((option) => option.projectId === fixtures.projectId));
    assertNoStorageLeak(result.body);
    assertSafeLabels(result.body);
  });

  await checkAsync("Personal and Family-style target options omit Client controls and option payload values", async () => {
    await setWorkspaceType(fixtures.workspaceId, "family");

    const result = await api.get("/api/files/attachable-targets", {
      cookie: fixtures.adminSessionId,
      query: {
        clientId: fixtures.clientId,
        moduleId: "tasks",
        targetType: "task",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.workspaceType, "family");
    assert.equal(result.body.filters.client.visible, false);
    assert.ok(!Object.hasOwn(result.body.filters.client, "options"));
    assert.ok(result.body.options.some((option) => option.targetId === fixtures.allowedTaskId));
    assert.ok(result.body.options.every((option) => !Object.hasOwn(option, "clientId")));
    assert.ok(result.body.options.every((option) => !Object.hasOwn(option, "clientLabel")));
    assert.ok(result.body.options.every((option) => !Object.hasOwn(option.value, "clientId")));
    assert.ok(result.body.filters.project.visible);
    assertNoStorageLeak(result.body);
    assertSafeLabels(result.body);

    await setWorkspaceType(fixtures.workspaceId, "business");
  });

  await checkAsync("Unreadable or unusable targets are omitted", async () => {
    const result = await api.get("/api/files/attachable-targets", {
      cookie: fixtures.clientUserSessionId,
      query: {
        moduleId: "tasks",
        search: "Allowed Option",
        targetType: "task",
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.count, 0);
    assertNoStorageLeak(result.body);
  });

  await checkAsync("Disabled, unsupported, secure-note, and raw-label targets stay safe", async () => {
    await setWorkspaceModuleStatus(fixtures.workspaceId, "tasks", "disabled");
    const disabled = await api.get("/api/files/attachable-targets", {
      cookie: fixtures.adminSessionId,
      query: {
        moduleId: "tasks",
        targetType: "task",
      },
    });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.body.count, 0);
    assert.equal(disabled.body.targetTypes.length, 0);

    await setWorkspaceModuleStatus(fixtures.workspaceId, "tasks", "enabled");
    const unsupported = await api.get("/api/files/attachable-targets", {
      cookie: fixtures.adminSessionId,
      query: {
        moduleId: "unknown-module",
        targetType: "mystery",
      },
    });
    assert.equal(unsupported.status, 200);
    assert.equal(unsupported.body.count, 0);

    const secureNote = await api.get("/api/files/attachable-targets", {
      cookie: fixtures.adminSessionId,
      query: {
        moduleId: "notes",
        search: "Secure Option Note",
        targetType: "note",
      },
    });
    assert.equal(secureNote.status, 200);
    assert.ok(!secureNote.body.options.some((option) => option.targetId === fixtures.secureNoteId));

    const rawLabel = await api.get("/api/files/attachable-targets", {
      cookie: fixtures.adminSessionId,
      query: {
        moduleId: "tasks",
        search: fixtures.rawLabelTaskId,
        targetType: "task",
      },
    });
    assert.equal(rawLabel.status, 200);
    assert.equal(rawLabel.body.count, 1);
    assert.equal(rawLabel.body.options[0].targetId, fixtures.rawLabelTaskId);
    assert.equal(rawLabel.body.options[0].label, "Untitled Task");
    assertNoStorageLeak([disabled.body, unsupported.body, secureNote.body, rawLabel.body]);
    assertSafeLabels([disabled.body, unsupported.body, secureNote.body, rawLabel.body]);
  });

  await assertIntegrity();
  console.log(`Files attachable target options regression passed ${results.length} checks.`);
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function seedFixtures() {
  const users = await querySql(`
SELECT user_id, username, display_name, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY username
LIMIT 1;
`);
  const admin = users[0];
  assert.ok(admin, "protected admin should exist");

  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;
  const now = new Date().toISOString();
  const clientId = randomUUID();
  const projectId = randomUUID();
  const allowedTaskId = randomUUID();
  const archivedTaskId = randomUUID();
  const rawLabelTaskId = randomUUID();
  const otherWorkspaceId = randomUUID();
  const otherWorkspaceTaskId = randomUUID();
  const secureNoteId = randomUUID();
  const clientUserId = randomUUID();

  await setWorkspaceType(workspaceId, "business");
  await insertClient({ clientId, name: "Allowed Option Client", now, status: "Active", workspaceId });
  await insertProject({ clientId, name: "Allowed Option Project", now, projectId, status: "Active", workspaceId });
  await insertTask({
    clientId,
    now,
    projectId,
    taskId: allowedTaskId,
    title: "Allowed Option Task",
    userId: admin.user_id,
    workspaceId,
  });
  await insertTask({
    archivedAt: now,
    clientId,
    now,
    projectId,
    status: "archived",
    taskId: archivedTaskId,
    title: "Archived Option Task",
    userId: admin.user_id,
    workspaceId,
  });
  await insertTask({
    clientId,
    now,
    projectId,
    taskId: rawLabelTaskId,
    title: rawLabelTaskId,
    userId: admin.user_id,
    workspaceId,
  });
  await insertSecureNote({
    noteId: secureNoteId,
    now,
    title: "Secure Option Note",
    userId: admin.user_id,
    workspaceId,
  });

  await runSql(`
INSERT INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(otherWorkspaceId)}, 'Other Attachable Target Options Workspace', 'Active', 'business', ${sqlText(now)}, ${sqlText(now)});
`);
  await insertTask({
    now,
    taskId: otherWorkspaceTaskId,
    title: "Other Workspace Option Task",
    userId: admin.user_id,
    workspaceId: otherWorkspaceId,
  });
  await insertClientUser({ clientUserId, now, workspaceId });

  const adminSession = await createSession({
    ...admin,
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
  });
  const clientUserSession = await createSession({
    active_workspace_id: workspaceId,
    display_name: "Files Target Option Client User",
    home_workspace_id: workspaceId,
    timezone: "America/New_York",
    user_id: clientUserId,
    username: "files-target-option-client-user@example.test",
  });

  return {
    adminSessionId: adminSession.sessionId,
    allowedTaskId,
    archivedTaskId,
    clientId,
    clientUserSessionId: clientUserSession.sessionId,
    otherWorkspaceTaskId,
    projectId,
    rawLabelTaskId,
    secureNoteId,
    workspaceId,
  };
}

async function insertClient({ clientId, name, now, status, workspaceId }) {
  await runSql(`
INSERT INTO clients (
  id,
  workspace_id,
  parent_client_id,
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
  ${sqlText(clientId)},
  ${sqlText(workspaceId)},
  NULL,
  ${sqlText(name)},
  ${sqlText(status)},
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

async function insertProject({ clientId = null, name, now, projectId, status, workspaceId }) {
  await runSql(`
INSERT INTO projects (
  id,
  workspace_id,
  client_id,
  parent_project_id,
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
  ${sqlText(projectId)},
  ${sqlText(workspaceId)},
  ${clientId ? sqlText(clientId) : "NULL"},
  NULL,
  ${sqlText(name)},
  ${sqlText(status)},
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

async function insertTask({
  archivedAt = null,
  clientId = null,
  now,
  projectId = null,
  status = "open",
  taskId,
  title,
  userId,
  workspaceId,
}) {
  await runSql(`
INSERT INTO tasks (
  task_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  status,
  priority,
  archived_at,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(taskId)},
  ${sqlText(workspaceId)},
  ${clientId ? sqlText(clientId) : "NULL"},
  ${projectId ? sqlText(projectId) : "NULL"},
  ${sqlText(title)},
  '',
  ${sqlText(status)},
  'normal',
  ${archivedAt ? sqlText(archivedAt) : "NULL"},
  ${sqlText(userId)},
  ${sqlText(userId)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

async function insertSecureNote({ noteId, now, title, userId, workspaceId }) {
  await runSql(`
INSERT INTO notes (
  note_id,
  workspace_id,
  title,
  slug,
  body_markdown,
  body_excerpt,
  body_plaintext_index,
  note_type,
  library_bucket,
  library_bucket_source,
  status,
  visibility,
  security_mode,
  owner_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at,
  metadata_json
)
VALUES (
  ${sqlText(noteId)},
  ${sqlText(workspaceId)},
  ${sqlText(title)},
  NULL,
  '',
  '',
  '',
  'general',
  'reference',
  'manual',
  'active',
  'private',
  'secure',
  ${sqlText(userId)},
  ${sqlText(userId)},
  ${sqlText(userId)},
  ${sqlText(now)},
  ${sqlText(now)},
  '{}'
);
`);
}

async function insertClientUser({ clientUserId, now, workspaceId }) {
  await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(clientUserId)},
  ${sqlText(workspaceId)},
  'files-target-option-client-user@example.test',
  'Files Target Option Client User',
  'America/New_York',
  '',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);

INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(clientUserId)}, ${sqlText(workspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO user_role_assignments (
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
  ${sqlText(clientUserId)},
  'client_user',
  'all',
  'all',
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

async function setWorkspaceType(workspaceId, workspaceType) {
  await runSql(`
UPDATE workspaces
SET workspace_type = ${sqlText(workspaceType)}
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

async function setWorkspaceModuleStatus(workspaceId, moduleId, status) {
  const now = new Date().toISOString();
  await runSql(`
INSERT INTO workspace_modules (workspace_id, module_id, status, enabled_at, disabled_at, updated_at)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlText(moduleId)},
  ${sqlText(status)},
  ${status === "enabled" ? sqlText(now) : "NULL"},
  ${status === "disabled" ? sqlText(now) : "NULL"},
  ${sqlText(now)}
)
ON CONFLICT(workspace_id, module_id) DO UPDATE SET
  status = excluded.status,
  enabled_at = excluded.enabled_at,
  disabled_at = excluded.disabled_at,
  updated_at = excluded.updated_at;
`);
}

function assertNoStorageLeak(value) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /storage_key/i);
  assert.doesNotMatch(text, /storageKey/i);
  assert.doesNotMatch(text, /storage_path/i);
  assert.doesNotMatch(text, /storagePath/i);
  assert.doesNotMatch(text, /sha256/i);
  assert.doesNotMatch(text, /scanner/i);
  assert.doesNotMatch(text, /secure_payload/i);
  assert.doesNotMatch(text, /encrypted_/i);
}

function assertSafeLabels(value) {
  for (const [key, item] of walk(value)) {
    if (!/label$/i.test(key)) {
      continue;
    }
    assert.ok(!looksLikeRawIdentifier(item), `${key} should not expose a raw identifier label`);
  }
}

function* walk(value, key = "") {
  if (Array.isArray(value)) {
    for (const item of value) {
      yield* walk(item, key);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    yield [key, String(value || "")];
    return;
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    yield* walk(childValue, childKey);
  }
}

function looksLikeRawIdentifier(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(text) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}/i.test(text);
}

function createApi(baseUrl) {
  return {
    get: (url, options = {}) => request(baseUrl, "GET", url, null, options),
  };
}

async function request(baseUrl, method, url, body, options = {}) {
  const headers = {};
  const query = new URLSearchParams(options.query || {});
  const requestUrl = `${baseUrl}${url}${query.toString() ? `?${query}` : ""}`;

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }
  if (body !== null && body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(requestUrl, {
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
    redirect: "manual",
  });
  const text = await response.text();
  let parsedBody = null;
  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = null;
  }

  return {
    body: parsedBody,
    headers: response.headers,
    status: response.status,
    text,
  };
}

async function listen(app) {
  const serverInstance = http.createServer(app);
  await new Promise((resolve) => {
    serverInstance.listen(0, "127.0.0.1", resolve);
  });
  return serverInstance;
}

async function closeServer(serverInstance) {
  await new Promise((resolve, reject) => {
    serverInstance.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function checkAsync(name, fn) {
  await fn();
  results.push(name);
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0].integrity_check, "ok");
}
