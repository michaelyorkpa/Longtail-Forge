/* global fetch */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.21.7.6";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-search-index-jobs-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-search-index-jobs.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Search-Index-Jobs-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const architectureDocs = readText("docs/architecture.md");
const databaseDocs = readText("docs/database.md");
const moduleDocs = readText("docs/module-development.md");
const appSource = readText("src/core/app.js");
const workerCliSource = readText("src/core/jobs/worker-cli.js");
const searchJobsSource = readText("src/services/search-index-jobs.service.js");
const syncSource = readText("src/services/search-index-sync.service.js");
const routeSource = readText("src/routes/search-index.routes.js");
const searchScript = readText("public/js/search.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { createApp } = await import("../src/core/app.js");
const { clearSearchIndexersForTests, registerSearchIndexer } = await import("../src/core/search/indexer-registry.js");
const { closeDatabase, db, initializeDatabase, querySql } = await import("../src/db/index.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { createSession } = await import("../src/security/sessions.js");
const {
  queueSearchIndexRecord,
  queueSearchIndexRebuildIfEmpty,
  registerSearchIndexJobHandlers,
} = await import("../src/services/search-index-jobs.service.js");
const {
  resetJobWorkerStatusForTests,
  runJobWorkerOnce,
  stopJobWorker,
} = await import("../src/core/jobs/index.js");

let server;

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the search index jobs version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the search index jobs version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the search index jobs version");

  assert.match(searchJobsSource, /SEARCH_INDEX_JOB_TYPE = "search\.index"/, "search indexing should have one durable job type");
  assert.match(searchJobsSource, /registerJobHandler\(SEARCH_INDEX_JOB_TYPE/, "search indexing should register a worker handler");
  assert.match(searchJobsSource, /searchService\.reindexSearchRecord/, "search index jobs should run single-record reindexing");
  assert.match(searchJobsSource, /searchService\.removeSearchDocument/, "search index jobs should run single-record removals");
  assert.match(searchJobsSource, /searchIndexRebuildService\.rebuildWorkspace/, "search index jobs should run workspace rebuilds");
  assert.match(syncSource, /queueSearchIndexRecord/, "search sync helper should queue reindex jobs");
  assert.match(syncSource, /queueSearchIndexRemoval/, "search sync helper should queue remove jobs");
  assert.doesNotMatch(syncSource, /searchService\.reindexSearchRecord|searchService\.removeSearchDocument/, "mutation sync helper should not write the search index directly");
  assert.match(routeSource, /queueSearchIndexRebuild/, "admin search rebuild route should queue a rebuild job");
  assert.match(routeSource, /response\.status\(202\)/, "admin search rebuild route should acknowledge queued work");
  assert.match(searchScript, /Index rebuild queued/, "browser rebuild control should tell admins the rebuild was queued");
  assert.match(appSource, /queueStartupSearchIndexRebuildIfEmpty/, "startup should use the empty-index queue transition");
  assert.match(appSource, /registerSearchIndexJobHandlers/, "app startup should register search index job handlers");
  assert.match(workerCliSource, /registerSearchIndexJobHandlers/, "separate worker startup should register search index job handlers");
  assert.doesNotMatch(appSource, /searchIndexRebuildService\.rebuildApp|scheduleStartupSearchIndexRebuild/, "normal startup must not run a full synchronous app rebuild");
  assert.match(regressionSuite, /scripts\/search-index-jobs-regression\.mjs/, "regression suite should include search index job coverage");
  assert.match(roadmap, /Version 0\.33\.5\.21\.4 - Move search indexing to jobs[\s\S]*\[x\] Startup does not launch duplicate full-app rebuilds in normal mode/, "roadmap should mark search index jobs complete");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the search index jobs slice");
  assert.match(architectureDocs, /As of 0\.33\.5\.21\.4[\s\S]*search\.index/, "architecture docs should document search indexing jobs");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.4[\s\S]*Search indexing uses the durable job runner/, "database docs should document the search job handoff");
  assert.match(moduleDocs, /Search indexing side effects are queued as durable jobs/, "module docs should document queued search indexing");

  await initializeDatabase();
  registerSearchIndexJobHandlers({ replace: true });
  const fixtures = await seedFixtures();

  await assertRecordWriteQueuesAndWorkerIndexes(fixtures);
  await assertFailedIndexingJobRetries(fixtures);
  await assertManualRebuildRouteQueues(fixtures);
  await assertEmptyIndexStartupTransition();
  await assertIntegrity();

  console.log("Search index jobs regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await stopJobWorker().catch(() => {});
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertRecordWriteQueuesAndWorkerIndexes(fixtures) {
  resetJobWorkerStatusForTests();
  const result = await tasksService.create({
    description: "search-index-job-body",
    title: "Search index job queued task",
  }, fixtures.session);
  const taskId = result.task.task_id;
  const searchRowsBefore = await readTaskSearchRows(fixtures.workspaceId, taskId);
  const queuedJob = await readLatestSearchJob(fixtures.workspaceId, "reindex", taskId);

  assert.deepEqual(searchRowsBefore, [], "record writes should not write the search index before worker execution");
  assert.equal(queuedJob.status, "pending");
  assert.match(queuedJob.payload_json, /task\.created/);

  const summary = await runJobWorkerOnce({
    claimLimit: 3,
    mode: "inline",
    workerId: "search-index-jobs-regression",
  });
  const searchRowsAfter = await readTaskSearchRows(fixtures.workspaceId, taskId);

  assert.ok(summary.completed >= 1, "worker should complete queued search jobs");
  assert.deepEqual(searchRowsAfter.map((row) => row.title), ["Search index job queued task"]);
}

async function assertFailedIndexingJobRetries(fixtures) {
  resetJobWorkerStatusForTests();
  clearSearchIndexersForTests();
  const searchableType = {
    recordType: "example_record",
    moduleId: "developer-example",
    idField: "example_id",
    titleField: "title",
    summaryField: "summary",
    bodyFields: ["body"],
    workspaceField: "workspace_id",
    requiredReadPermission: "developer_example.view",
    indexer: "developer-example.records",
    requiredModules: ["developer-example"],
    sourceLabel: "Example",
  };
  const unregister = registerSearchIndexer("developer-example.records", async () => {
    throw new Error("search worker retry me");
  });
  await queueSearchIndexRecord({
    searchableType,
    workspaceId: fixtures.workspaceId,
    moduleId: "developer-example",
    recordType: "example_record",
    recordId: "search-job-retry-record",
    reason: "regression.failure",
  });

  const beforeRun = Date.now();
  const summary = await runJobWorkerOnce({
    claimLimit: 1,
    mode: "inline",
    workerId: "search-index-jobs-regression",
  });
  const failedJob = await readLatestSearchJob(fixtures.workspaceId, "reindex", "search-job-retry-record");

  assert.equal(summary.failed, 1);
  assert.equal(failedJob.status, "failed");
  assert.equal(failedJob.attempt_count, 1);
  assert.match(failedJob.last_error, /search worker retry me/);
  assert.ok(Date.parse(failedJob.available_at) > beforeRun, "failed search jobs should retry later");
  unregister();
}

async function assertManualRebuildRouteQueues(fixtures) {
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);
  const response = await api.post("/api/search-index/rebuild", {
    body: {},
    cookie: fixtures.sessionId,
  });
  const rebuildJob = await readLatestSearchJob(fixtures.workspaceId, "rebuild", "");

  assert.equal(response.status, 202);
  assert.equal(response.body.operation, "queue_rebuild");
  assert.equal(response.body.scope, "workspace");
  assert.equal(rebuildJob.status, "pending");
  assert.match(rebuildJob.payload_json, /"operation":"rebuild"/);
  assert.match(rebuildJob.payload_json, /"source":"admin-api"/);
}

async function assertEmptyIndexStartupTransition() {
  await db.run("DELETE FROM jobs WHERE job_type = 'search.index';");
  await db.run("DELETE FROM search_index;");

  const first = await queueSearchIndexRebuildIfEmpty({ source: "regression-empty-index" });
  const second = await queueSearchIndexRebuildIfEmpty({ source: "regression-empty-index" });
  const rows = await querySql(`
SELECT job_id, status, payload_json
FROM jobs
WHERE job_type = 'search.index'
  AND dedupe_key = 'search:rebuild:app:${first.workspaceId}:all'
ORDER BY created_at;
`);

  assert.equal(first.operation, "queue_rebuild_if_empty");
  assert.equal(first.queued, true);
  assert.equal(second.operation, "queue_rebuild_if_empty");
  assert.equal(rows.length, 1, "empty-index startup transition should dedupe active rebuild jobs");
  assert.match(rows[0].payload_json, /"scope":"app"/);
}

async function seedFixtures() {
  const admin = await db.get(`
SELECT user_id, username, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);
  assert.ok(admin?.user_id, "fresh database should seed a protected admin");

  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;
  const session = {
    active_workspace_id: workspaceId,
    home_workspace_id: admin.home_workspace_id,
    timezone: admin.timezone || "America/New_York",
    user_id: admin.user_id,
    username: admin.username,
    workspace_id: workspaceId,
  };
  const sessionId = (await createSession(session)).sessionId;

  return {
    session,
    sessionId,
    workspaceId,
  };
}

async function readLatestSearchJob(workspaceId, operation, recordId) {
  const operationPattern = `%"operation":"${operation}"%`;
  const recordPattern = recordId ? `%"recordId":"${recordId}"%` : "%";
  const row = await db.get(`
SELECT *
FROM jobs
WHERE workspace_id = :workspaceId
  AND job_type = 'search.index'
  AND payload_json LIKE :operationPattern
  AND payload_json LIKE :recordPattern
ORDER BY updated_at DESC, created_at DESC
LIMIT 1;
`, {
    operationPattern,
    recordPattern,
    workspaceId,
  });

  assert.ok(row, `expected ${operation} search job ${recordId || ""}`);
  return row;
}

function readTaskSearchRows(workspaceId, taskId) {
  return db.query(`
SELECT title
FROM search_index
WHERE workspace_id = :workspaceId
  AND module_id = 'tasks'
  AND record_type = 'task'
  AND record_id = :taskId
ORDER BY search_index_id;
`, {
    taskId,
    workspaceId,
  });
}

async function assertIntegrity() {
  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "search index jobs regression database should pass integrity check");
}

function createApi(baseUrl) {
  return {
    async post(url, options = {}) {
      const headers = { "Content-Type": "application/json" };
      if (options.cookie) {
        headers.Cookie = `longtail_forge_session=${options.cookie}`;
      }

      const response = await fetch(`${baseUrl}${url}`, {
        body: JSON.stringify(options.body || {}),
        headers,
        method: "POST",
      });
      const text = await response.text();
      return {
        body: text ? JSON.parse(text) : null,
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

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
