/* global fetch */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const appVersion = "0.33.5.21.0.6";
const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-high-volume-admin-lists-"));
const disposableDb = path.join(tempDir, "longtail-forge-high-volume-admin-lists-scale-demo.db");

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const paginationHelper = readText("src/core/bounded-pagination.js");
const auditServiceSource = readText("src/services/audit.service.js");
const notificationsServiceSource = readText("src/services/notifications.service.js");
const notificationsRepoSource = readText("src/repositories/notifications.repo.js");
const searchRoutesSource = readText("src/routes/search.routes.js");
const sqliteSearchAdapterSource = readText("src/core/search/adapters/sqlite-search-adapter.js");
const filesServiceSource = readText("src/services/files.service.js");
const filesScript = readText("public/js/files.js");
const notificationsScript = readText("public/js/notifications.js");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assertStaticContract();
runSeed();

process.env.LONGTAIL_DATABASE_PROVIDER = "sqlite";
process.env.LONGTAIL_DATABASE_FILE = disposableDb;
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.SUPER_ADMIN_PASSWORD = "Scale-Seed-Password-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, getSql, initializeDatabase, querySql } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");

let server;

try {
  await initializeDatabase();
  await assertSeedCounts();
  const superSession = await createSeedSession(await readProtectedSeedUser());
  const notificationSession = await createSeedSession(await readNotificationRecipientUser());

  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);

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
  assert.equal(packageJson.version, appVersion, "package.json should report the high-volume admin lists version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the high-volume admin lists version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the high-volume admin lists version");

  assert.match(paginationHelper, /function normalizeBoundedPagination/, "framework should expose a bounded pagination normalizer");
  assert.match(paginationHelper, /function boundedPaginationEnvelope/, "framework should expose a reusable pagination envelope");
  assert.match(paginationHelper, /toString\("base64url"\)/, "pagination cursors should be opaque offset cursors");

  assert.match(auditServiceSource, /AUDIT_MAX_PAGE_SIZE = 500/, "Audit log endpoint should expose an explicit maximum normal page size");
  assert.match(auditServiceSource, /normalizeBoundedPagination\(normalizedFilters/, "Audit log reads should use bounded pagination");
  assert.match(auditServiceSource, /boundedPaginationEnvelope/, "Audit log reads should return a common pagination envelope");

  assert.match(notificationsServiceSource, /NOTIFICATION_MAX_PAGE_SIZE = 100/, "Notifications endpoint should expose an explicit maximum page size");
  assert.match(notificationsRepoSource, /async function countForRecipient/, "Notifications repository should count filtered recipient rows");
  assert.match(notificationsRepoSource, /module_id = \$\{sqlText\(moduleId\)\}/, "Notifications repository should own module filtering");
  assert.match(notificationsScript, /params\.set\("moduleId", moduleFilter\.value\)/, "Notifications page should submit module filters to the endpoint");

  assert.match(searchRoutesSource, /maxPageSize:\s*MAX_LIMIT/, "Search route should return max page size metadata");
  assert.match(searchRoutesSource, /decodeOffsetCursor/, "Search route should accept cursor paging metadata");
  assert.match(searchRoutesSource, /clientsRepository\.readByIds/, "Search result context should batch client enrichment");
  assert.match(searchRoutesSource, /projectsRepository\.readByIds/, "Search result context should batch project enrichment");
  assert.match(sqliteSearchAdapterSource, /si\.search_index_id ASC/, "Search backend ordering should include a stable tie-breaker");

  assert.match(filesServiceSource, /async function readVisibleAttachmentPage/, "Files browse should page through bounded visible attachment batches");
  assert.match(filesServiceSource, /function attachmentOrderByClause/, "Files browse should keep stable SQL ordering per sort mode");
  assert.match(filesServiceSource, /MAX_ATTACHMENT_LIMIT = 200/, "Files browse should expose an explicit maximum page size");
  assert.match(filesScript, /FILES_PAGE_SIZE = 50/, "Files browser should request bounded pages");
  assert.match(filesScript, /data-file-load-more/, "Files browser should expose a load-more control for additional pages");

  assert.match(roadmap, /Completed 0\.33\.5\.20 bounded queries and small-office scale data work is archived/, "Roadmap should point the completed 0.33.5.20 branch to the archive");
  assert.match(changelog, /Version 0\.33\.5\.20\.5/, "Changelog should include the high-volume admin lists release");
  assert.match(regressionSuite, /scripts\/high-volume-admin-lists-regression\.mjs/, "Regression suite should include high-volume admin list coverage");
}

async function assertSeedCounts() {
  const marker = await getSql("SELECT expected_counts_json FROM scale_seed_runs LIMIT 1;");
  const expected = JSON.parse(marker?.expected_counts_json || "{}");

  assert.equal(expected.audit_logs, 200, "dev-demo scale seed should include audit rows");
  assert.equal(expected.notifications, 60, "dev-demo scale seed should include notifications");
  assert.equal(expected.files, 24, "dev-demo scale seed should include file rows");
  assert.ok(expected.search_index >= 150, "dev-demo scale seed should include search rows");
}

async function assertAuditEndpoint(api, cookie) {
  const firstPage = await api.get("/api/audit-logs?limit=17", { cookie });

  assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
  assert.equal(firstPage.body.auditLogs.length, 17, "Audit endpoint should honor bounded page size");
  assert.equal(firstPage.body.pagination.limit, 17);
  assert.equal(firstPage.body.pagination.maxPageSize, 500);
  assert.equal(firstPage.body.pagination.hasMore, true);
  assert.ok(firstPage.body.pagination.nextCursor, "Audit endpoint should expose a next cursor");
  assert.equal(firstPage.body.pagination.total, 200);

  const secondPage = await api.get(`/api/audit-logs?limit=17&cursor=${encodeURIComponent(firstPage.body.pagination.nextCursor)}`, { cookie });
  const firstIds = new Set(firstPage.body.auditLogs.map((log) => log.audit_id));

  assert.equal(secondPage.status, 200, JSON.stringify(secondPage.body));
  assert.equal(secondPage.body.auditLogs.some((log) => firstIds.has(log.audit_id)), false, "Audit cursor page should not duplicate first-page rows");
}

async function assertNotificationsEndpoint(api, cookie) {
  const firstPage = await api.get("/api/notifications?limit=3", { cookie });

  assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
  assert.equal(firstPage.body.notifications.length, 3, "Notifications endpoint should honor bounded page size");
  assert.equal(firstPage.body.pagination.limit, 3);
  assert.equal(firstPage.body.pagination.maxPageSize, 100);
  assert.equal(firstPage.body.pagination.hasMore, true);
  assert.ok(firstPage.body.pagination.nextCursor, "Notifications endpoint should expose a next cursor");
  assert.ok(firstPage.body.filterOptions.modules.length > 0, "Notifications endpoint should return server-owned module filters");

  const moduleId = firstPage.body.filterOptions.modules[0];
  const modulePage = await api.get(`/api/notifications?limit=5&moduleId=${encodeURIComponent(moduleId)}`, { cookie });

  assert.equal(modulePage.status, 200, JSON.stringify(modulePage.body));
  assert.ok(modulePage.body.notifications.length > 0, "Module-filtered notifications should return seeded rows");
  assert.ok(modulePage.body.notifications.every((notification) => notification.module_id === moduleId), "Notification module filter should apply on the endpoint");
}

async function assertSearchEndpoint(api, cookie) {
  const firstPage = await api.get("/api/search?recordType=task&limit=11", { cookie });

  assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
  assert.equal(firstPage.body.results.length, 11, "Search endpoint should honor bounded page size");
  assert.equal(firstPage.body.pagination.limit, 11);
  assert.equal(firstPage.body.pagination.maxPageSize, 100);
  assert.equal(firstPage.body.pagination.hasMore, true);
  assert.ok(firstPage.body.pagination.nextCursor, "Search endpoint should expose a next cursor");
  assert.ok(firstPage.body.results.every((result) => result.recordType === "task"));

  const secondPage = await api.get(`/api/search?recordType=task&limit=11&cursor=${encodeURIComponent(firstPage.body.pagination.nextCursor)}`, { cookie });
  const firstIds = new Set(firstPage.body.results.map((result) => result.searchIndexId));

  assert.equal(secondPage.status, 200, JSON.stringify(secondPage.body));
  assert.equal(secondPage.body.results.some((result) => firstIds.has(result.searchIndexId)), false, "Search cursor page should not duplicate first-page results");
}

async function assertFilesEndpoint(api, cookie) {
  const firstPage = await api.get("/api/files/attachments?status=all&limit=7", { cookie });

  assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
  assert.equal(firstPage.body.attachments.length, 7, "Files endpoint should honor bounded page size");
  assert.equal(firstPage.body.pagination.limit, 7);
  assert.equal(firstPage.body.pagination.maxPageSize, 200);
  assert.equal(firstPage.body.pagination.hasMore, true);
  assert.ok(firstPage.body.pagination.nextCursor, "Files endpoint should expose a next cursor");
  assert.equal(JSON.stringify(firstPage.body).includes("storage_key"), false, "Files browse must not expose storage keys");

  const secondPage = await api.get(`/api/files/attachments?status=all&limit=7&cursor=${encodeURIComponent(firstPage.body.pagination.nextCursor)}`, { cookie });
  const firstIds = new Set(firstPage.body.attachments.map((attachment) => attachment.fileAttachmentId));

  assert.equal(secondPage.status, 200, JSON.stringify(secondPage.body));
  assert.equal(secondPage.body.attachments.some((attachment) => firstIds.has(attachment.fileAttachmentId)), false, "Files cursor page should not duplicate first-page attachments");
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
    headers,
    method,
    redirect: "manual",
  });
  const text = await response.text();
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

function cleanEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.LTF_REGRESSION_BASELINE_DB;
  delete env.LONGTAIL_DATABASE_FILE;
  delete env.LONGTAIL_DATA_DIR;
  delete env.LONGTAIL_DATABASE_PROVIDER;
  return env;
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

