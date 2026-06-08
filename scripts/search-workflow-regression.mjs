/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-search-workflow-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-search-workflow-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Search-Workflow-Test-Password-123!";

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");
const { searchIndexRebuildService } = await import("../src/services/search-index-rebuild.service.js");
const { searchService } = await import("../src/services/search.service.js");

const results = [];
let server;

try {
  await initializeDatabase();
  const fixtures = await seedWorkflowFixtures();
  await searchIndexRebuildService.rebuildWorkspace({ audit: false, workspaceId: fixtures.workspaceId });
  server = await listen(createApp());
  const api = createApi(`http://${server.address().address}:${server.address().port}`);

  await checkAsync("browser search discovers indexed Tasks, Time Entries, Clients, and Projects", async () => {
    const response = await api.get("/api/search?text=workflow-e2e&limit=10", { cookie: fixtures.sessionId });

    assert.equal(response.status, 200);
    assert.deepEqual(resultTypes(response.body.results), [
      "client-projects:client",
      "client-projects:project",
      "tasks:task",
      "time-tracking:time_entry",
    ]);
    assert.ok(response.body.results.every((result) => result.workspaceId === fixtures.workspaceId));
    assert.ok(response.body.results.every((result) => result.target && typeof result.target.url === "string"));
  });

  await checkAsync("browser search results update after indexed record edits", async () => {
    await runSql(`
UPDATE tasks
SET title = 'Workflow E2E Retitled Task',
    description = 'workflow-edit-retitled task body',
    updated_at = '2026-06-08T21:10:00.000Z'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND task_id = ${sqlText(fixtures.taskId)};
`);
    const reindexResult = await searchService.reindexSearchRecord({
      moduleId: "tasks",
      recordId: fixtures.taskId,
      recordType: "task",
      workspaceId: fixtures.workspaceId,
    });
    const oldResponse = await api.get("/api/search?text=workflow-edit-original&module=tasks", {
      cookie: fixtures.sessionId,
    });
    const newResponse = await api.get("/api/search?text=workflow-edit-retitled&module=tasks", {
      cookie: fixtures.sessionId,
    });

    assert.equal(reindexResult.ok, true);
    assert.equal(oldResponse.status, 200);
    assert.equal(newResponse.status, 200);
    assert.deepEqual(oldResponse.body.results.map((result) => result.recordId), []);
    assert.deepEqual(newResponse.body.results.map((result) => result.recordId), [fixtures.taskId]);
  });

  await checkAsync("browser search pagination remains stable across repeated requests", async () => {
    const firstPage = await api.get("/api/search?text=workflow-e2e&limit=2&page=1", { cookie: fixtures.sessionId });
    const secondPage = await api.get("/api/search?text=workflow-e2e&limit=2&page=2", { cookie: fixtures.sessionId });
    const repeatedFirstPage = await api.get("/api/search?text=workflow-e2e&limit=2&page=1", {
      cookie: fixtures.sessionId,
    });

    assert.equal(firstPage.status, 200);
    assert.equal(secondPage.status, 200);
    assert.equal(firstPage.body.pagination.returned, 2);
    assert.equal(firstPage.body.pagination.hasMore, true);
    assert.equal(secondPage.body.pagination.page, 2);
    assert.deepEqual(
      firstPage.body.results.map((result) => result.searchIndexId),
      repeatedFirstPage.body.results.map((result) => result.searchIndexId),
    );
    assert.notDeepEqual(
      firstPage.body.results.map((result) => result.searchIndexId),
      secondPage.body.results.map((result) => result.searchIndexId),
    );
  });

  await checkAsync("permission-sensitive filtering applies before browser search results are returned", async () => {
    const visible = await api.get("/api/search?text=workflow-edit-retitled&module=tasks", {
      cookie: fixtures.projectUserSessionId,
    });
    const hidden = await api.get("/api/search?text=workflow-edit-retitled&module=tasks", {
      cookie: fixtures.unscopedSessionId,
    });

    assert.equal(visible.status, 200);
    assert.deepEqual(visible.body.results.map((result) => result.recordId), [fixtures.taskId]);
    assert.equal(hidden.status, 200);
    assert.deepEqual(hidden.body.results, []);
    assert.equal(hidden.body.pagination.hasMore, false);
  });

  await checkAsync("global search UI has loading, empty, error, filtered, and paginated states", async () => {
    const searchScript = await readProjectFile("public/js/search.js");

    assert.match(searchScript, /renderLoadingState/);
    assert.match(searchScript, /renderPromptState/);
    assert.match(searchScript, /renderErrorState/);
    assert.match(searchScript, /No matching results/);
    assert.match(searchScript, /updateUrlFromState/);
    assert.match(searchScript, /renderPagination\(hasMore\)/);
  });

  console.log(`Search workflow regression passed ${results.length} checks.`);
} finally {
  if (server) {
    await closeServer(server);
  }

  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function seedWorkflowFixtures() {
  const now = "2026-06-08T21:00:00.000Z";
  const workspace = (await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;"))[0];
  const user = (await querySql(`
SELECT user_id, home_workspace_id, active_workspace_id, username, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY username
LIMIT 1;
`))[0];
  const clientId = `search-workflow-client-${randomUUID()}`;
  const projectId = `search-workflow-project-${randomUUID()}`;
  const taskId = `search-workflow-task-${randomUUID()}`;
  const timeEntryId = `search-workflow-entry-${randomUUID()}`;
  const projectUserId = `search-workflow-project-user-${randomUUID()}`;
  const unscopedUserId = `search-workflow-unscoped-user-${randomUUID()}`;

  await runSql(`
INSERT INTO workspace_modules (workspace_id, module_id, status, enabled_at, disabled_at, updated_at)
VALUES
  (${sqlText(workspace.workspace_id)}, 'client-projects', 'enabled', ${sqlText(now)}, NULL, ${sqlText(now)}),
  (${sqlText(workspace.workspace_id)}, 'tasks', 'enabled', ${sqlText(now)}, NULL, ${sqlText(now)}),
  (${sqlText(workspace.workspace_id)}, 'time-tracking', 'enabled', ${sqlText(now)}, NULL, ${sqlText(now)})
ON CONFLICT(workspace_id, module_id) DO UPDATE SET
  status = 'enabled',
  enabled_at = COALESCE(enabled_at, excluded.enabled_at),
  disabled_at = NULL,
  updated_at = excluded.updated_at;

${userInsertSql(workspace.workspace_id, projectUserId, "search-workflow-project-user")}
${userInsertSql(workspace.workspace_id, unscopedUserId, "search-workflow-unscoped-user")}
${membershipInsertSql(workspace.workspace_id, projectUserId, now)}
${membershipInsertSql(workspace.workspace_id, unscopedUserId, now)}
${assignmentInsertSql(workspace.workspace_id, projectUserId, "project_user", "project", projectId, now)}
${clientInsertSql(workspace.workspace_id, clientId, now)}
${projectInsertSql(workspace.workspace_id, projectId, clientId, now)}
${taskInsertSql(workspace.workspace_id, taskId, clientId, projectId, user.user_id, now)}
${timeEntryInsertSql(workspace.workspace_id, timeEntryId, clientId, projectId, taskId, user.user_id, now)}
`);

  return {
    clientId,
    projectId,
    projectUserSessionId: (await createSession({
      active_workspace_id: workspace.workspace_id,
      home_workspace_id: workspace.workspace_id,
      timezone: "America/New_York",
      user_id: projectUserId,
      username: "search-workflow-project-user@example.test",
    })).sessionId,
    sessionId: (await createSession(user)).sessionId,
    taskId,
    timeEntryId,
    unscopedSessionId: (await createSession({
      active_workspace_id: workspace.workspace_id,
      home_workspace_id: workspace.workspace_id,
      timezone: "America/New_York",
      user_id: unscopedUserId,
      username: "search-workflow-unscoped-user@example.test",
    })).sessionId,
    workspaceId: workspace.workspace_id,
  };
}

function userInsertSql(workspaceId, userId, usernamePrefix) {
  return `
INSERT OR REPLACE INTO users (
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
  ${sqlText(`${usernamePrefix}@example.test`)},
  ${sqlText(usernamePrefix)},
  NULL,
  'America/New_York',
  'hash',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);`;
}

function membershipInsertSql(workspaceId, userId, now) {
  return `
INSERT OR REPLACE INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(userId)}, ${sqlText(workspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)});`;
}

function assignmentInsertSql(workspaceId, userId, roleId, scopeType, scopeId, now) {
  return `
INSERT OR REPLACE INTO user_role_assignments (
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
  ${sqlText(userId)},
  ${sqlText(roleId)},
  ${sqlText(scopeType)},
  ${sqlText(scopeId)},
  NULL,
  ${scopeType === "project" ? sqlText(scopeId) : "NULL"},
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function clientInsertSql(workspaceId, clientId, now) {
  return `
INSERT OR REPLACE INTO clients (
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
  'Workflow E2E Client',
  'active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'Workflow E2E Contact',
  'workflow-e2e@example.test',
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
);`;
}

function projectInsertSql(workspaceId, projectId, clientId, now) {
  return `
INSERT OR REPLACE INTO projects (
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
  task_default_priority,
  task_default_status,
  task_default_sort_order_json,
  task_default_assignee_mode,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(projectId)},
  ${sqlText(workspaceId)},
  ${sqlText(clientId)},
  NULL,
  'Workflow E2E Project',
  'active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'normal',
  'open',
  '["due_date","priority"]',
  'creator',
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function taskInsertSql(workspaceId, taskId, clientId, projectId, userId, now) {
  return `
INSERT OR REPLACE INTO tasks (
  task_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  status,
  priority,
  billable,
  due_date,
  due_time,
  due_timezone,
  due_at_utc,
  source_type,
  source_id,
  archived_at,
  reminder_override_enabled,
  recurrence_template_id,
  recurrence_instance_date,
  completed_at,
  created_by_user_id,
  updated_by_user_id,
  completed_by_user_id,
  archived_by_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(taskId)},
  ${sqlText(workspaceId)},
  ${sqlText(clientId)},
  ${sqlText(projectId)},
  'Workflow E2E Task',
  'workflow-e2e task body workflow-edit-original',
  'open',
  'normal',
  'yes',
  '2026-06-09',
  '',
  'America/New_York',
  NULL,
  'manual',
  NULL,
  NULL,
  0,
  NULL,
  NULL,
  NULL,
  ${sqlText(userId)},
  ${sqlText(userId)},
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function timeEntryInsertSql(workspaceId, entryId, clientId, projectId, taskId, userId, now) {
  return `
INSERT OR REPLACE INTO time_entries (
  entry_id,
  workspace_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  task_id,
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
  ${sqlText(entryId)},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  ${sqlText(clientId)},
  'Workflow E2E Client',
  ${sqlText(projectId)},
  'Workflow E2E Project',
  ${sqlText(taskId)},
  'workflow-e2e time entry',
  '2026-06-08T20:00:00.000Z',
  '2026-06-08T21:00:00.000Z',
  3600,
  '1.00',
  'yes',
  'unbilled',
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function resultTypes(searchResults) {
  return searchResults
    .map((result) => `${result.moduleId}:${result.recordType}`)
    .sort();
}

function createApi(baseUrl) {
  return {
    async get(pathname, options = {}) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        headers: options.cookie ? { Cookie: `longtail_forge_session=${options.cookie}` } : {},
      });
      const body = await response.json().catch(() => ({}));

      return {
        body,
        status: response.status,
      };
    },
  };
}

function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(app);

    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

function closeServer(activeServer) {
  return new Promise((resolve, reject) => {
    activeServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function readProjectFile(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

async function checkAsync(name, assertion) {
  assert.equal(typeof name, "string");
  await assertion();
  results.push(name);
}
