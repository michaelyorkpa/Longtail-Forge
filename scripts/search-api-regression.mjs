/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-search-api-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-search-api-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Search-Api-Test-Password-123!";

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");
const { searchService } = await import("../src/services/search.service.js");

const results = [];
let server;

try {
  await initializeDatabase();
  const fixtures = await seedSearchFixtures();
  server = await listen(createApp());
  const baseUrl = `http://${server.address().address}:${server.address().port}`;
  const api = createApi(baseUrl);

  await checkAsync("GET /api/search requires authentication", async () => {
    const response = await api.get("/api/search?text=route-contract");

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Login required.");
  });

  await checkAsync("GET /api/search returns active-workspace search results", async () => {
    const response = await api.get("/api/search?text=route-contract", { cookie: fixtures.sessionId });

    assert.equal(response.status, 200);
    assert.equal(response.body.query.text, "route-contract");
    assert.equal(response.body.pagination.page, 1);
    assert.equal(response.body.pagination.limit, 25);
    assert.equal(response.body.results.length, 4);
    assert.ok(["sqlite-fts5", "sqlite-like"].includes(response.body.backend));
    assert.ok(response.body.results.every((result) => result.workspaceId === fixtures.workspaceId));
    assert.ok(response.body.results.every((result) => !Object.hasOwn(result, "body")));
    assert.ok(response.body.results.every((result) => !Object.hasOwn(result, "tags_text")));
  });

  await checkAsync("GET /api/search applies module, record type, client, project, and tag filters", async () => {
    const query = [
      "text=route-contract",
      "module=tasks",
      "recordType=task",
      `clientId=${encodeURIComponent(fixtures.clientId)}`,
      `projectId=${encodeURIComponent(fixtures.projectId)}`,
      `tagId=${encodeURIComponent(fixtures.tagId)}`,
    ].join("&");
    const response = await api.get(`/api/search?${query}`, { cookie: fixtures.sessionId });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.query.moduleIds, ["tasks"]);
    assert.deepEqual(response.body.query.recordTypes, ["task"]);
    assert.deepEqual(response.body.query.tagIds, [fixtures.tagId]);
    assert.deepEqual(response.body.results.map((result) => result.recordId), ["search-api-task-1"]);
    assert.equal(response.body.results[0].snippet, "route-contract task exact filter");
    assert.equal(response.body.results[0].sourceLabel, "Task");
    assert.equal(response.body.results[0].status, "active");
    assert.equal(response.body.results[0].updatedAt, "2026-06-08T20:04:00.000Z");
    assert.deepEqual(response.body.results[0].context.client, {
      id: fixtures.clientId,
      name: "Search API Client",
      status: "active",
    });
    assert.deepEqual(response.body.results[0].context.project, {
      id: fixtures.projectId,
      name: "Search API Project",
      status: "active",
      clientId: fixtures.clientId,
      clientName: "Search API Client",
    });
    assert.deepEqual(response.body.results[0].tags, [{
      tagId: fixtures.tagId,
      name: "Search API Tag",
      slug: fixtures.tagId,
      color: "#2563eb",
      status: "active",
    }]);
    assert.deepEqual(response.body.results[0].target, {
      url: "tasks.html?task=search-api-task-1",
      actionId: "tasks.edit",
      params: { taskId: "search-api-task-1" },
    });
  });

  await checkAsync("GET /api/search applies the shared No Tags filter through canonical tag assignments", async () => {
    const query = [
      "text=route-contract",
      "module=tasks",
      "recordType=task",
      `clientId=${encodeURIComponent(fixtures.clientId)}`,
      `projectId=${encodeURIComponent(fixtures.projectId)}`,
      "tagId=__no_tags__",
    ].join("&");
    const response = await api.get(`/api/search?${query}`, { cookie: fixtures.sessionId });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.query.tagIds, ["__no_tags__"]);
    assert.deepEqual(response.body.results.map((result) => result.recordId), ["search-api-task-2"]);
  });

  await checkAsync("GET /api/search returns stable pagination metadata", async () => {
    const firstPage = await api.get("/api/search?text=route-contract&limit=2&page=1", { cookie: fixtures.sessionId });
    const secondPage = await api.get("/api/search?text=route-contract&limit=2&page=2", { cookie: fixtures.sessionId });

    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.pagination.returned, 2);
    assert.equal(firstPage.body.pagination.hasMore, true);
    assert.equal(secondPage.status, 200);
    assert.equal(secondPage.body.pagination.page, 2);
    assert.equal(secondPage.body.pagination.offset, 2);
    assert.equal(secondPage.body.pagination.returned, 2);
    assert.equal(secondPage.body.pagination.hasMore, false);
    assert.notDeepEqual(
      firstPage.body.results.map((result) => result.searchIndexId),
      secondPage.body.results.map((result) => result.searchIndexId),
    );
  });

  await checkAsync("GET /api/search returns structured validation errors", async () => {
    const response = await api.get("/api/search?limit=banana&module=%5Bbad%5D", { cookie: fixtures.sessionId });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "invalid_search_filters");
    assert.ok(response.body.error.fields.some((field) => field.field === "limit"));
    assert.ok(response.body.error.fields.some((field) => field.field === "module"));
  });

  await checkAsync("GET /api/search filters each result by declared read permission and record scope", async () => {
    const scoped = await api.get("/api/search?text=permission-scope", { cookie: fixtures.projectUserSessionId });
    const unscoped = await api.get("/api/search?text=permission-scope", { cookie: fixtures.unscopedSessionId });

    assert.equal(scoped.status, 200);
    assert.deepEqual(scoped.body.results.map((result) => result.recordId), ["search-api-visible-task"]);
    assert.equal(scoped.body.pagination.hasMore, false);
    assert.equal(unscoped.status, 200);
    assert.deepEqual(unscoped.body.results, []);
  });

  await checkAsync("GET /api/search hides disabled-module records through active search", async () => {
    await runSql(`
UPDATE workspace_modules
SET status = 'disabled', disabled_at = ${sqlText(new Date().toISOString())}, updated_at = ${sqlText(new Date().toISOString())}
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND module_id = 'tasks';
`);

    const response = await api.get("/api/search?text=permission-scope&module=tasks", { cookie: fixtures.sessionId });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.results, []);

    await runSql(`
UPDATE workspace_modules
SET status = 'enabled', disabled_at = NULL, updated_at = ${sqlText(new Date().toISOString())}
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND module_id = 'tasks';
`);
  });

  console.log(`Search API regression passed ${results.length} checks.`);
} finally {
  if (server) {
    await closeServer(server);
  }

  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function seedSearchFixtures() {
  const now = new Date().toISOString();
  const workspace = (await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;"))[0];
  const user = (await querySql(`
SELECT user_id, home_workspace_id, active_workspace_id, username, timezone
FROM users
WHERE home_workspace_id = ${sqlText(workspace.workspace_id)}
  AND protected_user = 'yes'
LIMIT 1;
`))[0];
  const session = await createSession(user);
  const taskType = searchService.listSearchableTypes()
    .find((type) => type.moduleId === "tasks" && type.recordType === "task");
  const projectType = searchService.listSearchableTypes()
    .find((type) => type.moduleId === "client-projects" && type.recordType === "project");
  const clientId = `search-api-client-${randomUUID()}`;
  const projectId = `search-api-project-${randomUUID()}`;
  const otherClientId = `search-api-other-client-${randomUUID()}`;
  const otherProjectId = `search-api-other-project-${randomUUID()}`;
  const tagId = `search-api-tag-${randomUUID()}`;
  const projectUserId = `search-api-project-user-${randomUUID()}`;
  const unscopedUserId = `search-api-unscoped-user-${randomUUID()}`;

  await runSql(`
${userInsertSql(workspace.workspace_id, projectUserId, "search-api-project-user")}
${userInsertSql(workspace.workspace_id, unscopedUserId, "search-api-unscoped-user")}
${membershipInsertSql(workspace.workspace_id, projectUserId, now)}
${membershipInsertSql(workspace.workspace_id, unscopedUserId, now)}
${assignmentInsertSql(workspace.workspace_id, projectUserId, "project_user", "project", projectId, now)}
${clientInsertSql(workspace.workspace_id, clientId, "Search API Client", now)}
${clientInsertSql(workspace.workspace_id, otherClientId, "Search API Other Client", now)}
${projectInsertSql(workspace.workspace_id, projectId, clientId, "Search API Project", now)}
${projectInsertSql(workspace.workspace_id, otherProjectId, otherClientId, "Search API Other Project", now)}
INSERT OR REPLACE INTO tags (tag_id, workspace_id, name, slug, color, status, created_at, updated_at)
VALUES (${sqlText(tagId)}, ${sqlText(workspace.workspace_id)}, 'Search API Tag', ${sqlText(tagId)}, '#2563eb', 'active', ${sqlText(now)}, ${sqlText(now)});

INSERT OR REPLACE INTO tag_assignments (tag_assignment_id, workspace_id, tag_id, target_type, target_id, source, created_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(workspace.workspace_id)}, ${sqlText(tagId)}, 'task', 'search-api-task-1', 'manual', ${sqlText(now)});
`);

  await indexDocument(taskType, {
    workspace_id: workspace.workspace_id,
    task_id: "search-api-task-1",
    title: "Route Contract Task Alpha",
    summary: "route-contract task exact filter",
    body: "route-contract search API task body private",
    tags_text: "Search API Tag",
    client_id: clientId,
    project_id: projectId,
    search_status: "active",
    indexed_at: "2026-06-08T20:04:00.000Z",
  });
  await indexDocument(taskType, {
    workspace_id: workspace.workspace_id,
    task_id: "search-api-task-2",
    title: "Route Contract Task Beta",
    summary: "route-contract task untagged",
    body: "route-contract second task body private",
    client_id: clientId,
    project_id: projectId,
    search_status: "active",
    indexed_at: "2026-06-08T20:03:00.000Z",
  });
  await indexDocument(projectType, {
    workspace_id: workspace.workspace_id,
    id: "search-api-project-row",
    name: "Route Contract Project",
    summary: "route-contract project result",
    body: "route-contract project body private",
    client_id: clientId,
    search_status: "active",
    indexed_at: "2026-06-08T20:02:00.000Z",
  });
  await indexDocument(projectType, {
    workspace_id: workspace.workspace_id,
    id: "search-api-project-row-2",
    name: "Route Contract Project Two",
    summary: "route-contract second project result",
    body: "route-contract project second body private",
    client_id: clientId,
    search_status: "active",
    indexed_at: "2026-06-08T20:01:00.000Z",
  });
  await indexDocument(taskType, {
    workspace_id: workspace.workspace_id,
    task_id: "search-api-visible-task",
    title: "Permission Scope Visible Task",
    summary: "permission-scope visible",
    body: "permission-scope visible private body",
    client_id: clientId,
    project_id: projectId,
    search_status: "active",
    indexed_at: "2026-06-08T20:00:00.000Z",
  });
  await indexDocument(taskType, {
    workspace_id: workspace.workspace_id,
    task_id: "search-api-hidden-task",
    title: "Permission Scope Hidden Task",
    summary: "permission-scope hidden",
    body: "permission-scope hidden private body",
    client_id: otherClientId,
    project_id: otherProjectId,
    search_status: "active",
    indexed_at: "2026-06-08T19:59:00.000Z",
  });

  return {
    clientId,
    projectId,
    projectUserSessionId: (await createSession({
      active_workspace_id: workspace.workspace_id,
      home_workspace_id: workspace.workspace_id,
      timezone: "America/New_York",
      user_id: projectUserId,
      username: "search-api-project-user@example.test",
    })).sessionId,
    sessionId: session.sessionId,
    tagId,
    unscopedSessionId: (await createSession({
      active_workspace_id: workspace.workspace_id,
      home_workspace_id: workspace.workspace_id,
      timezone: "America/New_York",
      user_id: unscopedUserId,
      username: "search-api-unscoped-user@example.test",
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

function clientInsertSql(workspaceId, clientId, name, now) {
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
  ${sqlText(name)},
  'active',
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
);`;
}

function projectInsertSql(workspaceId, projectId, clientId, name, now) {
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
  created_at,
  updated_at
)
VALUES (
  ${sqlText(projectId)},
  ${sqlText(workspaceId)},
  ${sqlText(clientId)},
  NULL,
  ${sqlText(name)},
  'active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

async function indexDocument(searchableType, document) {
  const result = await searchService.indexSearchDocument(
    searchService.normalizeSearchDocument(searchableType, document),
  );

  assert.equal(result.ok, true);
}

function createApi(baseUrl) {
  return {
    get: (url, options = {}) => request(baseUrl, "GET", url, options),
  };
}

async function request(baseUrl, method, url, options = {}) {
  const headers = {};

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    redirect: "manual",
  });
  const text = await response.text();
  let parsedBody = null;

  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = text;
  }

  return {
    body: parsedBody,
    status: response.status,
  };
}

async function checkAsync(name, assertion) {
  await assertion();
  results.push(name);
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
