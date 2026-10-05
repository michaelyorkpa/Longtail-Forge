/* global fetch */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { requireRow } from "./test-support/database-row-assertions.mjs";
import { readPayload } from "./test-support/http-payload-assertions.mjs";
import { requireJsonRecord } from "./test-support/json-record-assertions.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureApp} AdminApp */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureClientOptions} AdminClientOptions */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer} AdminServer */

/**
 * What this owner's `fetch` fixture resolves. It carries no headers, so it is
 * declared here rather than through the shared fetch-response contract, which
 * would claim a field the fixture never returns.
 * @typedef {{ body: unknown, status: number }} AdminResponse
 */

/** @typedef {ReturnType<typeof createApi>} AdminApi */

/**
 * The pagination envelope every endpoint under test answers, as
 * `boundedPaginationEnvelope` builds it. `nextCursor` is the empty string
 * rather than null on the last page, which is what the has-more assertions
 * below depend on.
 * @typedef {{ hasMore: boolean, limit: number, maxPageSize: number, nextCursor: string, offset?: number, returned?: number, total?: number | null }} AdminPagination
 */

/** @typedef {{ auditLogs: Array<{ audit_id: unknown }>, pagination: AdminPagination }} AuditPage */
/** @typedef {{ filterOptions: { modules: string[] }, notifications: Array<{ module_id: unknown }>, pagination: AdminPagination }} NotificationsPage */
/** @typedef {{ pagination: AdminPagination, results: Array<{ recordType: unknown, searchIndexId: unknown }> }} SearchPage */
/** @typedef {{ attachments: Array<{ fileAttachmentId: unknown }>, pagination: AdminPagination }} FilesPage */

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-high-volume-admin-lists-"));
const disposableDb = path.join(tempDir, "longtail-forge-high-volume-admin-lists-scale-demo.db");

const paginationHelper = readText("src/core/bounded-pagination.js");
const auditServiceSource = readText("src/services/audit.service.js");
const notificationsServiceSource = readText("src/services/notifications.service.js");
const notificationsRepoSource = readText("src/repositories/notifications.repo.js");
const searchRoutesSource = readText("src/routes/search.routes.js");
const sqliteSearchAdapterSource = readText("src/core/search/adapters/sqlite-search-adapter.js");
const filesServiceSource = readText("src/services/files.service.js");
const filesRepoSource = readText("src/repositories/files.repo.js");
const filesScript = readText("public/js/files.js");
const notificationsScript = readText("public/js/notifications.js");

assertStaticContract();
runSeed();

process.env.LONGTAIL_DATABASE_PROVIDER = "sqlite";
process.env.LONGTAIL_DATABASE_FILE = disposableDb;
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.SUPER_ADMIN_PASSWORD = "Scale-Seed-Password-123!";

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, getSql, initializeDatabase, querySql } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");

/** @type {AdminServer | undefined} */
let server;

try {
  await initializeDatabase();
  await assertSeedCounts();
  const superSession = await createSeedSession(await readProtectedSeedUser());
  const notificationSession = await createSeedSession(await readNotificationRecipientUser());

  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${listenerPort(server)}`);

  await assertAuditEndpoint(api, superSession.sessionId);
  await assertNotificationsEndpoint(api, notificationSession.sessionId);
  await assertSearchEndpoint(api, superSession.sessionId);
  await assertFilesEndpoint(api, superSession.sessionId);

  console.log("High-volume admin lists regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {

  assert.match(paginationHelper, /function normalizeBoundedPagination/, "framework should expose a bounded pagination normalizer");
  assert.match(paginationHelper, /function boundedPaginationEnvelope/, "framework should expose a reusable pagination envelope");
  assert.match(paginationHelper, /toString\("base64url"\)/, "pagination cursors should be opaque offset cursors");

  assert.match(auditServiceSource, /AUDIT_MAX_PAGE_SIZE = 500/, "Audit log endpoint should expose an explicit maximum normal page size");
  assert.match(auditServiceSource, /normalizeBoundedPagination\(normalizedFilters/, "Audit log reads should use bounded pagination");
  assert.match(auditServiceSource, /boundedPaginationEnvelope/, "Audit log reads should return a common pagination envelope");

  assert.match(notificationsServiceSource, /NOTIFICATION_MAX_PAGE_SIZE = 100/, "Notifications endpoint should expose an explicit maximum page size");
  assert.match(notificationsRepoSource, /async function countForRecipient/, "Notifications repository should count filtered recipient rows");
  assert.match(notificationsRepoSource, /module_id = :moduleId/, "Notifications repository should own module filtering");
  assert.match(notificationsScript, /params\.set\("moduleId", moduleFilter\.value\)/, "Notifications page should submit module filters to the endpoint");

  assert.match(searchRoutesSource, /maxPageSize:\s*MAX_LIMIT/, "Search route should return max page size metadata");
  assert.match(searchRoutesSource, /decodeOffsetCursor/, "Search route should accept cursor paging metadata");
  assert.match(searchRoutesSource, /clientsRepository\.readByIds/, "Search result context should batch client enrichment");
  assert.match(searchRoutesSource, /projectsRepository\.readByIds/, "Search result context should batch project enrichment");
  assert.match(sqliteSearchAdapterSource, /si\.search_index_id ASC/, "Search backend ordering should include a stable tie-breaker");

  assert.match(filesServiceSource, /async function readVisibleAttachmentPage/, "Files browse should page through bounded visible attachment batches");
  assert.match(filesRepoSource, /function attachmentOrderByClause/, "Files repository should keep stable SQL ordering per sort mode");
  assert.match(filesServiceSource, /MAX_ATTACHMENT_LIMIT = 200/, "Files browse should expose an explicit maximum page size");
  assert.match(filesScript, /FILES_PAGE_SIZE = 50/, "Files browser should request bounded pages");
  assert.match(filesScript, /data-file-load-more/, "Files browser should expose a load-more control for additional pages");

}

async function assertSeedCounts() {
  const marker = requireRow(await getSql("SELECT expected_counts_json FROM scale_seed_runs LIMIT 1;"), "the scale seed marker");
  const expectedCountsJson = marker.expected_counts_json;
  assert.ok(typeof expectedCountsJson === "string", "the scale seed marker should persist its expected counts as JSON text");
  const expected = requireJsonRecord(JSON.parse(expectedCountsJson), "the scale seed expected counts");

  assert.equal(expected.audit_logs, 200, "dev-demo scale seed should include audit rows");
  assert.equal(expected.notifications, 60, "dev-demo scale seed should include notifications");
  assert.equal(expected.files, 24, "dev-demo scale seed should include file rows");
  const searchIndexCount = expected.search_index;
  assert.ok(typeof searchIndexCount === "number", "the scale seed should record its search row count as a number");
  assert.ok(searchIndexCount >= 150, "dev-demo scale seed should include search rows");
}

/** @param {AdminApi} api @param {string} cookie */
async function assertAuditEndpoint(api, cookie) {
  const firstPage = await api.get("/api/audit-logs?limit=17", { cookie });
  /** @type {AuditPage} */
  const firstBody = readPayload(firstPage, ["auditLogs", "pagination"], "audit first page");

  assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
  assert.equal(firstBody.auditLogs.length, 17, "Audit endpoint should honor bounded page size");
  assert.equal(firstBody.pagination.limit, 17);
  assert.equal(firstBody.pagination.maxPageSize, 500);
  assert.equal(firstBody.pagination.hasMore, true);
  assert.ok(firstBody.pagination.nextCursor, "Audit endpoint should expose a next cursor");
  assert.equal(firstBody.pagination.total, 200);

  const secondPage = await api.get(`/api/audit-logs?limit=17&cursor=${encodeURIComponent(firstBody.pagination.nextCursor)}`, { cookie });
  /** @type {AuditPage} */
  const secondBody = readPayload(secondPage, ["auditLogs"], "audit cursor page");
  const firstIds = new Set(firstBody.auditLogs.map((log) => log.audit_id));

  assert.equal(secondPage.status, 200, JSON.stringify(secondPage.body));
  assert.equal(secondBody.auditLogs.some((log) => firstIds.has(log.audit_id)), false, "Audit cursor page should not duplicate first-page rows");
}

/** @param {AdminApi} api @param {string} cookie */
async function assertNotificationsEndpoint(api, cookie) {
  const firstPage = await api.get("/api/notifications?limit=3", { cookie });
  /** @type {NotificationsPage} */
  const firstBody = readPayload(firstPage, ["filterOptions", "notifications", "pagination"], "notifications first page");

  assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
  assert.equal(firstBody.notifications.length, 3, "Notifications endpoint should honor bounded page size");
  assert.equal(firstBody.pagination.limit, 3);
  assert.equal(firstBody.pagination.maxPageSize, 100);
  assert.equal(firstBody.pagination.hasMore, true);
  assert.ok(firstBody.pagination.nextCursor, "Notifications endpoint should expose a next cursor");
  assert.ok(firstBody.filterOptions.modules.length > 0, "Notifications endpoint should return server-owned module filters");

  const moduleId = firstBody.filterOptions.modules[0];
  const modulePage = await api.get(`/api/notifications?limit=5&moduleId=${encodeURIComponent(moduleId)}`, { cookie });
  /** @type {NotificationsPage} */
  const moduleBody = readPayload(modulePage, ["notifications"], "module-filtered notifications page");

  assert.equal(modulePage.status, 200, JSON.stringify(modulePage.body));
  assert.ok(moduleBody.notifications.length > 0, "Module-filtered notifications should return seeded rows");
  assert.ok(moduleBody.notifications.every((notification) => notification.module_id === moduleId), "Notification module filter should apply on the endpoint");
}

/** @param {AdminApi} api @param {string} cookie */
async function assertSearchEndpoint(api, cookie) {
  const firstPage = await api.get("/api/search?recordType=task&limit=11", { cookie });
  /** @type {SearchPage} */
  const firstBody = readPayload(firstPage, ["pagination", "results"], "search first page");

  assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
  assert.equal(firstBody.results.length, 11, "Search endpoint should honor bounded page size");
  assert.equal(firstBody.pagination.limit, 11);
  assert.equal(firstBody.pagination.maxPageSize, 100);
  assert.equal(firstBody.pagination.hasMore, true);
  assert.ok(firstBody.pagination.nextCursor, "Search endpoint should expose a next cursor");
  assert.ok(firstBody.results.every((result) => result.recordType === "task"));

  const secondPage = await api.get(`/api/search?recordType=task&limit=11&cursor=${encodeURIComponent(firstBody.pagination.nextCursor)}`, { cookie });
  /** @type {SearchPage} */
  const secondBody = readPayload(secondPage, ["results"], "search cursor page");
  const firstIds = new Set(firstBody.results.map((result) => result.searchIndexId));

  assert.equal(secondPage.status, 200, JSON.stringify(secondPage.body));
  assert.equal(secondBody.results.some((result) => firstIds.has(result.searchIndexId)), false, "Search cursor page should not duplicate first-page results");
}

/** @param {AdminApi} api @param {string} cookie */
async function assertFilesEndpoint(api, cookie) {
  const firstPage = await api.get("/api/files/attachments?status=all&limit=7", { cookie });
  /** @type {FilesPage} */
  const firstBody = readPayload(firstPage, ["attachments", "pagination"], "files first page");

  assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
  assert.equal(firstBody.attachments.length, 7, "Files endpoint should honor bounded page size");
  assert.equal(firstBody.pagination.limit, 7);
  assert.equal(firstBody.pagination.maxPageSize, 200);
  assert.equal(firstBody.pagination.hasMore, true);
  assert.ok(firstBody.pagination.nextCursor, "Files endpoint should expose a next cursor");
  assert.equal(JSON.stringify(firstPage.body).includes("storage_key"), false, "Files browse must not expose storage keys");

  const secondPage = await api.get(`/api/files/attachments?status=all&limit=7&cursor=${encodeURIComponent(firstBody.pagination.nextCursor)}`, { cookie });
  /** @type {FilesPage} */
  const secondBody = readPayload(secondPage, ["attachments"], "files cursor page");
  const firstIds = new Set(firstBody.attachments.map((attachment) => attachment.fileAttachmentId));

  assert.equal(secondPage.status, 200, JSON.stringify(secondPage.body));
  assert.equal(secondBody.attachments.some((attachment) => firstIds.has(attachment.fileAttachmentId)), false, "Files cursor page should not duplicate first-page attachments");
}

async function readProtectedSeedUser() {
  const row = await getSql(`
SELECT user_id, username, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
LIMIT 1;
`);

  assert.ok(row, "seeded database should include a protected super admin");
  return row;
}

async function readNotificationRecipientUser() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id, COUNT(*) AS notification_count
FROM notifications
INNER JOIN users
  ON users.user_id = notifications.recipient_user_id
GROUP BY users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
HAVING COUNT(*) >= 4
ORDER BY COUNT(*) DESC, users.username
LIMIT 1;
`);
  const row = rows[0];

  assert.ok(row, "scale seed should include a notification recipient with multiple rows");
  return row;
}

/** @param {Record<string, unknown>} user */
async function createSeedSession(user) {
  return createSession({
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    ip_address: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
  });
}

function runSeed() {
  const result = spawnSync(process.execPath, [
    "scripts/seed-scale.mjs",
    "--profile",
    "dev-demo",
    "--provider",
    "sqlite",
    "--database",
    disposableDb,
    "--json",
  ], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv({
      LONGTAIL_ENV: "test",
      SUPER_ADMIN_PASSWORD: "Scale-Seed-Password-123!",
    }),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
}

/**
 * @param {string} baseUrl
 * @returns {{ get: (url: string, options?: AdminClientOptions) => Promise<AdminResponse> }}
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
 * @param {AdminClientOptions} [options]
 * @returns {Promise<AdminResponse>}
 */
async function request(baseUrl, method, url, options = {}) {
  /** @type {Record<string, string>} */
  const headers = {};

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    headers,
    method,
    redirect: "manual",
  });
  const text = await response.text();
  // The parsed body stays `unknown`; every read below crosses that boundary
  // through `readPayload`, which proves the envelopes it names are present.
  /** @type {unknown} */
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    body,
    status: response.status,
  };
}

/** @param {AdminApp} app @returns {Promise<AdminServer>} */
function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/** @param {AdminServer} listening @returns {number} */
function listenerPort(listening) {
  const address = listening.address();
  assert.ok(address && typeof address === "object", "the admin-scale fixture server should bind a TCP port");
  return address.port;
}

/** @param {AdminServer} server @returns {Promise<void>} */
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

/** @param {Record<string, string>} [overrides] @returns {NodeJS.ProcessEnv} */
function cleanEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.LTF_REGRESSION_BASELINE_DB;
  delete env.LONGTAIL_DATABASE_FILE;
  delete env.LONGTAIL_DATA_DIR;
  delete env.LONGTAIL_DATABASE_PROVIDER;
  return env;
}
