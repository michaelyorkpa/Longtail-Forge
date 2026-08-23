/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { fixtureString } from "./test-support/session-fixtures.mjs";
import { readPayload } from "./test-support/http-payload-assertions.mjs";

// The search result, error, and query-error shapes are the ones the route and
// the framework already publish, imported rather than redescribed here.
/** @typedef {import("../src/types/framework-contracts.js").BrowserSearchResult} BrowserSearchResult */
/** @typedef {import("../src/core/http-error-contract.js").ApiErrorValue} ApiErrorValue */
/** @typedef {import("../src/routes/search.routes.js").SearchQueryError} SearchQueryError */

/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureApp} SearchApp */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureClientOptions} SearchClientOptions */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer} SearchServer */

/**
 * What this owner's `fetch` fixture resolves. Its headers are flattened to a
 * plain record rather than a `Headers` instance, so it is declared here rather
 * than through the shared fetch-response contract.
 * @typedef {{ body: unknown, headers: Record<string, string>, status: number }} SearchResponse
 */

/** @typedef {ReturnType<typeof createApi>} SearchApi */

/**
 * The search route's error envelope: the framework's published API error value
 * with the field errors the search route itself publishes, so a
 * filter-validation failure names the query field it rejected. The members
 * mirror `ApiErrorValue`; only `fields` is narrower, because the framework
 * leaves it open for routes that report other field shapes.
 * @typedef {Omit<ApiErrorValue, "fields"> & { fields?: SearchQueryError[] }} SearchApiError
 */

/**
 * The search route's pagination envelope: the shared bounded-pagination
 * envelope plus the page number the route adds.
 * @typedef {{ hasMore: boolean, limit: number, maxPageSize: number, nextCursor: string, offset: number, page: number, returned: number, total: number | null }} SearchPagination
 */

/**
 * The public echo of the parsed query. Every member is what `publicQuery`
 * carries, not only the four these assertions read.
 * @typedef {{ clientId: string, libraryBucket: string, moduleIds: string[], noteCollectionId: string, projectId: string, recordStatus: string, recordTypes: string[], source: string, tagIds: string[], text: string, visibility: string }} SearchPublicQuery
 */

/** @typedef {{ error: SearchApiError }} ErrorEnvelope */
/** @typedef {{ pagination: SearchPagination }} PaginationEnvelope */
/** @typedef {{ results: BrowserSearchResult[] }} ResultsEnvelope */
/** @typedef {{ pagination: SearchPagination, results: BrowserSearchResult[] }} PaginationResultsEnvelope */
/** @typedef {{ query: SearchPublicQuery, results: BrowserSearchResult[] }} QueryResultsEnvelope */
/** @typedef {{ backend: string, pagination: SearchPagination, query: SearchPublicQuery, results: BrowserSearchResult[] }} SearchResponseEnvelope */

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-search-api-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-search-api-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Search-Api-Test-Password-123!";

const { createApp } = await import("../src/core/app.js");
const { encodeOffsetCursor } = await import("../src/core/bounded-pagination.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");
const { searchService } = await import("../src/services/search.service.js");

/** @type {string[]} */
const results = [];
/** @type {SearchServer | undefined} */
let server;

try {
  await initializeDatabase();
  const fixtures = await seedSearchFixtures();
  const app = createApp();
  assert.equal(
    app.get("query parser"),
    "extended",
    "the Search scalar/repeated/nested query contract requires the application-owned extended parser",
  );
  server = await listen(app);
  const baseUrl = `http://127.0.0.1:${listenerPort(server)}`;
  const api = createApi(baseUrl);

  await checkAsync("GET /api/search requires authentication", async () => {
    const response = await api.get("/api/search?text=route-contract");
    /** @type {ErrorEnvelope} */
    const responseBody = readPayload(response, ["error"], "response");

    assert.equal(response.status, 401);
    assert.equal(responseBody.error.code, "authentication_required");
    assert.equal(responseBody.error.message, "Login required.");
    assert.equal(responseBody.error.requestId, response.headers["x-request-id"]);
  });

  await checkAsync("GET /api/search returns active-workspace search results", async () => {
    const response = await api.get("/api/search?text=route-contract", { cookie: fixtures.sessionId });
    /** @type {SearchResponseEnvelope} */
    const responseBody = readPayload(response, ["backend", "pagination", "query", "results"], "response");

    assert.equal(response.status, 200);
    assert.equal(responseBody.query.text, "route-contract");
    assert.equal(responseBody.pagination.page, 1);
    assert.equal(responseBody.pagination.limit, 25);
    assert.equal(responseBody.results.length, 4);
    assert.ok(["sqlite-fts5", "sqlite-like"].includes(responseBody.backend));
    assert.ok(responseBody.results.every((result) => result.workspaceId === fixtures.workspaceId));
    assert.ok(responseBody.results.every((result) => !Object.hasOwn(result, "body")));
    assert.ok(responseBody.results.every((result) => !Object.hasOwn(result, "tags_text")));
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
    /** @type {QueryResultsEnvelope} */
    const responseBody = readPayload(response, ["query", "results"], "response");

    assert.equal(response.status, 200);
    assert.deepEqual(responseBody.query.moduleIds, ["tasks"]);
    assert.deepEqual(responseBody.query.recordTypes, ["task"]);
    assert.deepEqual(responseBody.query.tagIds, [fixtures.tagId]);
    assert.deepEqual(responseBody.results.map((result) => result.recordId), ["search-api-task-1"]);
    assert.equal(responseBody.results[0].snippet, "route-contract task exact filter");
    assert.equal(responseBody.results[0].sourceLabel, "Task");
    assert.equal(responseBody.results[0].status, "active");
    assert.equal(responseBody.results[0].updatedAt, "2026-06-08T20:04:00.000Z");
    assert.deepEqual(responseBody.results[0].context.client, {
      id: fixtures.clientId,
      name: "Search API Client",
      status: "active",
    });
    assert.deepEqual(responseBody.results[0].context.project, {
      id: fixtures.projectId,
      name: "Search API Project",
      status: "active",
      clientId: fixtures.clientId,
      clientName: "Search API Client",
    });
    assert.deepEqual(responseBody.results[0].tags, [{
      tagId: fixtures.tagId,
      name: "Search API Tag",
      slug: fixtures.tagId,
      color: "#2563eb",
      status: "active",
    }]);
    assert.deepEqual(responseBody.results[0].target, {
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
    /** @type {QueryResultsEnvelope} */
    const responseBody = readPayload(response, ["query", "results"], "response");

    assert.equal(response.status, 200);
    assert.deepEqual(responseBody.query.tagIds, ["__no_tags__"]);
    assert.deepEqual(responseBody.results.map((result) => result.recordId), ["search-api-task-2"]);
  });

  await checkAsync("GET /api/search returns stable pagination metadata", async () => {
    const firstPage = await api.get("/api/search?text=route-contract&limit=2&page=1", { cookie: fixtures.sessionId });
    /** @type {PaginationResultsEnvelope} */
    const firstPageBody = readPayload(firstPage, ["pagination", "results"], "first page");
    const secondPage = await api.get("/api/search?text=route-contract&limit=2&page=2", { cookie: fixtures.sessionId });
    /** @type {PaginationResultsEnvelope} */
    const secondPageBody = readPayload(secondPage, ["pagination", "results"], "second page");

    assert.equal(firstPage.status, 200);
    assert.equal(firstPageBody.pagination.returned, 2);
    assert.equal(firstPageBody.pagination.hasMore, true);
    assert.equal(secondPage.status, 200);
    assert.equal(secondPageBody.pagination.page, 2);
    assert.equal(secondPageBody.pagination.offset, 2);
    assert.equal(secondPageBody.pagination.returned, 2);
    assert.equal(secondPageBody.pagination.hasMore, false);
    assert.notDeepEqual(
      firstPageBody.results.map((result) => result.searchIndexId),
      secondPageBody.results.map((result) => result.searchIndexId),
    );
  });

  await checkAsync("GET /api/search normalizes repeated scalar query values deliberately", async () => {
    const response = await api.get("/api/search?text=route-contract&limit=2&limit=3&page=1&page=2", {
      cookie: fixtures.sessionId,
    });
    /** @type {PaginationEnvelope} */
    const responseBody = readPayload(response, ["pagination"], "response");

    assert.equal(response.status, 200);
    assert.equal(responseBody.pagination.limit, 2);
    assert.equal(responseBody.pagination.page, 1);
    assert.equal(responseBody.pagination.returned, 2);
  });

  await checkAsync("GET /api/search rejects unsupported nested query values", async () => {
    const response = await api.get("/api/search?module%5Bnested%5D=tasks&limit%5Bnested%5D=2", {
      cookie: fixtures.sessionId,
    });
    /** @type {ErrorEnvelope} */
    const responseBody = readPayload(response, ["error"], "response");

    assert.equal(response.status, 400);
    assert.equal(responseBody.error.code, "invalid_search_filters");
    // The framework publishes field errors as optional, and these assertions
    // are the ones proving the route names the query field it rejected, so the
    // list is proven present rather than read through.
    assert.ok(responseBody.error.fields, "a rejected nested filter set should report which fields it rejected");
    assert.ok(responseBody.error.fields.some((field) => field.field === "module"));
    assert.ok(responseBody.error.fields.some((field) => field.field === "limit"));
  });

  await checkAsync("GET /api/search rejects cursors that bypass the bounded page range", async () => {
    const cursor = encodeOffsetCursor(1000000);
    const response = await api.get(`/api/search?cursor=${encodeURIComponent(cursor)}`, {
      cookie: fixtures.sessionId,
    });
    /** @type {ErrorEnvelope} */
    const responseBody = readPayload(response, ["error"], "response");

    assert.equal(response.status, 400);
    assert.equal(responseBody.error.code, "invalid_search_filters");
    assert.ok(responseBody.error.fields, "a rejected cursor should report which field it rejected");
    assert.ok(responseBody.error.fields.some((field) => field.field === "cursor"));
  });

  await checkAsync("GET /api/search returns structured validation errors", async () => {
    const response = await api.get("/api/search?limit=banana&module=%5Bbad%5D", { cookie: fixtures.sessionId });
    /** @type {ErrorEnvelope} */
    const responseBody = readPayload(response, ["error"], "response");

    assert.equal(response.status, 400);
    assert.equal(responseBody.error.code, "invalid_search_filters");
    assert.ok(responseBody.error.fields, "a rejected filter set should report which fields it rejected");
    assert.ok(responseBody.error.fields.some((field) => field.field === "limit"));
    assert.ok(responseBody.error.fields.some((field) => field.field === "module"));
  });

  await checkAsync("GET /api/search filters each result by declared read permission and record scope", async () => {
    const scoped = await api.get("/api/search?text=permission-scope", { cookie: fixtures.projectUserSessionId });
    /** @type {PaginationResultsEnvelope} */
    const scopedBody = readPayload(scoped, ["pagination", "results"], "scoped");
    const unscoped = await api.get("/api/search?text=permission-scope", { cookie: fixtures.unscopedSessionId });
    /** @type {ResultsEnvelope} */
    const unscopedBody = readPayload(unscoped, ["results"], "unscoped");

    assert.equal(scoped.status, 200);
    assert.deepEqual(scopedBody.results.map((result) => result.recordId), [
      "search-api-visible-task",
      "search-api-visible-task-2",
    ]);
    assert.equal(scopedBody.pagination.hasMore, false);
    assert.equal(unscoped.status, 200);
    assert.deepEqual(unscopedBody.results, []);
  });

  await checkAsync("GET /api/search counts only permission-visible rows toward the requested offset", async () => {
    const query = "module=tasks&recordType=task&source=permission-paging&limit=1";
    const firstPage = await api.get(`/api/search?${query}&page=1`, { cookie: fixtures.projectUserSessionId });
    /** @type {PaginationResultsEnvelope} */
    const firstPageBody = readPayload(firstPage, ["pagination", "results"], "first page");
    const secondPage = await api.get(`/api/search?${query}&page=2`, { cookie: fixtures.projectUserSessionId });
    /** @type {PaginationResultsEnvelope} */
    const secondPageBody = readPayload(secondPage, ["pagination", "results"], "second page");

    assert.equal(firstPage.status, 200);
    assert.deepEqual(firstPageBody.results.map((result) => result.recordId), ["search-api-visible-task"]);
    assert.equal(firstPageBody.pagination.offset, 0);
    assert.equal(firstPageBody.pagination.hasMore, true);
    assert.equal(secondPage.status, 200);
    assert.deepEqual(secondPageBody.results.map((result) => result.recordId), ["search-api-visible-task-2"]);
    assert.equal(secondPageBody.pagination.offset, 1);
    assert.equal(secondPageBody.pagination.hasMore, false);
  });

  await checkAsync("GET /api/search hides disabled-module records through active search", async () => {
    await runSql(`
UPDATE workspace_modules
SET status = 'disabled', disabled_at = ${sqlText(new Date().toISOString())}, updated_at = ${sqlText(new Date().toISOString())}
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND module_id = 'tasks';
`);

    const response = await api.get("/api/search?text=permission-scope&module=tasks", { cookie: fixtures.sessionId });
    /** @type {ResultsEnvelope} */
    const responseBody = readPayload(response, ["results"], "response");

    assert.equal(response.status, 200);
    assert.deepEqual(responseBody.results, []);

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
  const workspaceRow = requireFirstRow(await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;"), "the default workspace");
  const workspace = { workspace_id: fixtureString(workspaceRow.workspace_id, "the default workspace ID") };
  const user = requireFirstRow(await querySql(`
SELECT user_id, home_workspace_id, active_workspace_id, username, timezone
FROM users
WHERE home_workspace_id = ${sqlText(workspace.workspace_id)}
  AND protected_user = 'yes'
LIMIT 1;
`), "the protected user");
  const session = await createSession(user);
  const taskType = searchService.listSearchableTypes()
    .find((type) => type.moduleId === "tasks" && type.recordType === "task");
  const projectType = searchService.listSearchableTypes()
    .find((type) => type.moduleId === "client-projects" && type.recordType === "project");

  // Every indexed fixture below is written through one of these two declared
  // searchable types. If a module stopped declaring one, the fixture would
  // index nothing and the result assertions would fail on empty pages instead
  // of naming the missing declaration.
  assert.ok(taskType, "the Tasks module should declare a searchable task type");
  assert.ok(projectType, "the Client/Projects module should declare a searchable project type");
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
    source: "permission-paging",
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
    source: "permission-paging",
    indexed_at: "2026-06-08T20:01:00.000Z",
  });
  await indexDocument(taskType, {
    workspace_id: workspace.workspace_id,
    task_id: "search-api-visible-task-2",
    title: "Permission Scope Visible Task Two",
    summary: "permission-scope visible second",
    body: "permission-scope visible second private body",
    client_id: clientId,
    project_id: projectId,
    search_status: "active",
    source: "permission-paging",
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

/** @param {string} workspaceId @param {string} userId @param {string} usernamePrefix */
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

/** @param {string} workspaceId @param {string} userId @param {string} now */
function membershipInsertSql(workspaceId, userId, now) {
  return `
INSERT OR REPLACE INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(userId)}, ${sqlText(workspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)});`;
}

/**
 * @param {string} workspaceId
 * @param {string} userId
 * @param {string} roleId
 * @param {string} scopeType
 * @param {string} scopeId
 * @param {string} now
 */
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

/** @param {string} workspaceId @param {string} clientId @param {string} name @param {string} now */
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

/**
 * @param {string} workspaceId
 * @param {string} projectId
 * @param {string} clientId
 * @param {string} name
 * @param {string} now
 */
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

/**
 * @param {import("../src/types/search-rebuild-contracts.js").ActiveSearchableTypeDeclaration} searchableType
 * @param {import("../src/services/search.service.js").SearchDocumentInput} document
 */
async function indexDocument(searchableType, document) {
  const result = await searchService.indexSearchDocument(
    searchService.normalizeSearchDocument(searchableType, document),
  );

  assert.equal(result.ok, true);
}

/**
 * @param {string} baseUrl
 * @returns {{ get: (url: string, options?: SearchClientOptions) => Promise<SearchResponse> }}
 */
function createApi(baseUrl) {
  return {
    get: (url, options = {}) => request(baseUrl, "GET", url, options),
  };
}

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {SearchClientOptions} [options]
 * @returns {Promise<SearchResponse>}
 */
async function request(baseUrl, method, url, options = {}) {
  /** @type {Record<string, string>} */
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
  // The parsed body stays `unknown`. Every read below crosses that boundary
  // through `readPayload`, which proves the envelope it names is present, so a
  // route that stops publishing one fails naming it rather than comparing
  // `undefined` against an expected value further down.
  /** @type {unknown} */
  let parsedBody = null;

  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = text;
  }

  return {
    body: parsedBody,
    headers: Object.fromEntries(response.headers.entries()),
    status: response.status,
  };
}

/** @param {string} name @param {() => Promise<void>} assertion */
async function checkAsync(name, assertion) {
  await assertion();
  results.push(name);
}

/** @param {SearchApp} app @returns {Promise<SearchServer>} */
function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(/** @type {http.RequestListener} */ (/** @type {unknown} */ (app)));
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/** @param {SearchServer} listening @returns {number} */
function listenerPort(listening) {
  const address = listening.address();
  assert.ok(address && typeof address === "object", "the Search API fixture server should bind a TCP port");
  return address.port;
}

/** @param {SearchServer} server @returns {Promise<void>} */
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
