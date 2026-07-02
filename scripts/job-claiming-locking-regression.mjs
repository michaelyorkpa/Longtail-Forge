/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.21.7.8";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-job-claiming-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-job-claiming.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Job-Claiming-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
const appSource = readText("src/core/app.js");
const routeSource = readText("src/routes/jobs.routes.js");
const serviceSource = readText("src/services/jobs.service.js");
const runnerSource = readText("src/core/jobs/job-runner.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { createApp } = await import("../src/core/app.js");
const { closeDatabase, db, initializeDatabase, querySql } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");
const {
  clearJobHandlersForTests,
  registerJobHandler,
  resetJobWorkerStatusForTests,
  runJobWorkerOnce,
  stopJobWorker,
} = await import("../src/core/jobs/index.js");

let server;
let workspaceId = "";

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the job claiming version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the job claiming version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the job claiming version");

  assert.match(runnerSource, /db\.transaction\(async \(transaction\)/, "job claiming should run inside db.transaction");
  assert.match(runnerSource, /WHERE job_id = \(\s*SELECT job_id[\s\S]*LIMIT 1/, "SQLite claiming should use one atomic scalar subquery claim per transaction loop");
  assert.match(runnerSource, /RETURNING[\s\S]*job_id/, "job claiming should read claimed rows through RETURNING");
  assert.match(runnerSource, /locked_at <= :expiredBefore/, "claiming should reclaim expired running locks");
  assert.match(runnerSource, /calculateRetryDelayMs/, "runner should keep retry backoff active");
  assert.match(runnerSource, /status = 'dead'/, "runner should move exhausted failures to dead-letter state");
  assert.doesNotMatch(runnerSource, /FOR UPDATE|SKIP LOCKED/, "SQLite claiming must not rely on unsupported row-lock syntax");
  assert.match(routeSource, /jobsRoutes\.get\("\/jobs\/status"/, "jobs route should expose GET /api/jobs/status");
  assert.match(appSource, /jobsRoutes/, "app startup should mount the jobs admin readout route after auth");
  assert.match(serviceSource, /workspace_settings\.manage/, "jobs readout should require workspace_settings.manage");
  assert.match(serviceSource, /normalizeBoundedPagination/, "jobs readout should normalize bounded pagination");
  assert.match(serviceSource, /boundedPaginationEnvelope/, "jobs readout should return the shared pagination envelope");
  assert.doesNotMatch(serviceSource, /payload_json|dedupe_key/, "jobs readout must not expose job payloads or dedupe keys");
  assert.match(regressionSuite, /scripts\/job-claiming-locking-regression\.mjs/, "regression suite should include job claiming and readout coverage");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.3[\s\S]*expired running locks/, "database docs should document expired lock reclaim");
  assert.match(runtimeDocs, /`LONGTAIL_JOB_LOCK_TTL_SECONDS`[\s\S]*expired running job locks/, "runtime docs should document the active lock TTL behavior");
  assert.match(sqliteDocs, /`GET \/api\/jobs\/status`[\s\S]*pending[\s\S]*running[\s\S]*dead/, "SQLite docs should document the protected jobs readout");
  assert.match(roadmap, /Version 0\.33\.5\.21\.3 - Job claiming, locking, retry, and dead-letter behavior[\s\S]*\[x\] Expired lock can be reclaimed/, "roadmap should mark the job claiming slice complete");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the job claiming slice");

  await initializeDatabase();
  const fixtures = await seedFixtures();
  workspaceId = fixtures.workspaceId;

  await assertJobClaimingLifecycle();
  await insertJob({ jobId: "job-pending-readout", jobType: "test.success" });
  await assertAdminReadout(fixtures);
  await assertIntegrity();

  console.log("Job claiming and locking regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await stopJobWorker().catch(() => {});
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertJobClaimingLifecycle() {
  resetJobWorkerStatusForTests();
  clearJobHandlersForTests();
  const handled = [];

  registerJobHandler("test.success", async ({ job }) => {
    handled.push(job.jobId);
  });
  registerJobHandler("test.retry", async () => {
    throw new Error("Try again later.");
  });
  registerJobHandler("test.dead", async () => {
    throw new Error("No attempts left.");
  });

  await insertJob({
    attemptCount: 1,
    jobId: "job-active-lock",
    jobType: "test.success",
    lockedAt: new Date().toISOString(),
    lockedBy: "other-worker",
    status: "running",
  });

  const lockedSummary = await runJobWorkerOnce({
    lockTtlSeconds: 30,
    mode: "inline",
    workerId: "claiming-regression",
  });
  assert.equal(lockedSummary.claimed, 0, "fresh running locks should not be claimed by another worker");
  assert.deepEqual(handled, []);
  const activeLock = await readJob("job-active-lock");
  assert.equal(activeLock.status, "running");
  assert.equal(activeLock.locked_by, "other-worker");
  assert.equal(activeLock.attempt_count, 1);

  await insertJob({
    attemptCount: 1,
    jobId: "job-expired-lock",
    jobType: "test.success",
    lockedAt: new Date(Date.now() - 120_000).toISOString(),
    lockedBy: "crashed-worker",
    status: "running",
  });

  const reclaimedSummary = await runJobWorkerOnce({
    lockTtlSeconds: 30,
    mode: "inline",
    workerId: "claiming-regression",
  });
  assert.equal(reclaimedSummary.claimed, 1, "expired running locks should be reclaimed");
  assert.equal(reclaimedSummary.completed, 1);
  assert.deepEqual(handled, ["job-expired-lock"]);
  const reclaimed = await readJob("job-expired-lock");
  assert.equal(reclaimed.status, "completed");
  assert.equal(reclaimed.attempt_count, 2, "reclaimed work should record the new attempt");
  assert.equal(reclaimed.locked_at, null);
  assert.equal(reclaimed.locked_by, null);

  await insertJob({ jobId: "job-retry", jobType: "test.retry", maxAttempts: 3 });
  const beforeRetry = Date.now();
  const retrySummary = await runJobWorkerOnce({
    lockTtlSeconds: 30,
    mode: "inline",
    workerId: "claiming-regression",
  });
  assert.equal(retrySummary.failed, 1, "retryable failures should stay failed");
  const retry = await readJob("job-retry");
  assert.equal(retry.status, "failed");
  assert.equal(retry.attempt_count, 1);
  assert.equal(retry.locked_at, null);
  assert.match(retry.last_error, /Try again later/);
  assert.ok(Date.parse(retry.available_at) > beforeRetry, "failed jobs should be scheduled for a future retry");

  await insertJob({ jobId: "job-dead", jobType: "test.dead", maxAttempts: 1 });
  const deadSummary = await runJobWorkerOnce({
    lockTtlSeconds: 30,
    mode: "inline",
    workerId: "claiming-regression",
  });
  assert.equal(deadSummary.dead, 1, "exhausted failures should become dead-letter rows");
  const dead = await readJob("job-dead");
  assert.equal(dead.status, "dead");
  assert.equal(dead.attempt_count, 1);
  assert.match(dead.last_error, /No attempts left/);
  assert.ok(dead.dead_at, "dead-letter rows should record dead_at");
}

async function assertAdminReadout(fixtures) {
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);

  const unauthenticated = await api.get("/api/jobs/status");
  assert.equal(unauthenticated.status, 401, "jobs readout should require login");
  assert.equal(unauthenticated.body.error, "Login required.");

  const forbidden = await api.get("/api/jobs/status", { cookie: fixtures.unprivilegedSessionId });
  assert.equal(forbidden.status, 403, "jobs readout should require workspace_settings.manage");
  assert.equal(forbidden.body.error, "You do not have permission to perform that action.");

  const allowed = await api.get("/api/jobs/status?limit=1", { cookie: fixtures.adminSessionId });
  assert.equal(allowed.status, 200, "workspace settings managers should read jobs status");
  assert.equal(allowed.headers.get("cache-control"), "no-store");

  const readout = allowed.body.jobs;
  assert.deepEqual(readout.counts, {
    dead: 1,
    failed: 1,
    pending: 1,
    running: 1,
  });
  assert.equal(readout.recentFailures.items.length, 1);
  assert.equal(readout.recentFailures.pagination.limit, 1);
  assert.equal(readout.recentFailures.pagination.maxPageSize, 50);
  assert.equal(readout.recentFailures.pagination.returned, 1);
  assert.equal(readout.recentFailures.pagination.total, 2);
  assert.equal(readout.recentFailures.pagination.hasMore, true);
  assert.ok(readout.recentFailures.pagination.nextCursor);
  assert.match(readout.recentFailures.items[0].lastError, /Try again later|No attempts left/);

  const serialized = JSON.stringify(readout);
  assert.doesNotMatch(serialized, /payload|dedupeKey|dedupe_key/i, "jobs readout should not expose payloads or dedupe details");

  const nextPage = await api.get(`/api/jobs/status?limit=1&cursor=${encodeURIComponent(readout.recentFailures.pagination.nextCursor)}`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(nextPage.status, 200);
  assert.equal(nextPage.body.jobs.recentFailures.items.length, 1);
  assert.equal(nextPage.body.jobs.recentFailures.pagination.hasMore, false);
  assert.equal(nextPage.body.jobs.recentFailures.pagination.nextCursor, "");
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

  const workspace = admin.active_workspace_id || admin.home_workspace_id;
  const unprivilegedUser = {
    userId: `job-readout-user-${randomUUID()}`,
    username: `job-readout-${randomUUID()}@example.test`,
  };
  const now = new Date().toISOString();

  await db.run(`
INSERT INTO users (
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
  :userId,
  :workspaceId,
  :username,
  :displayName,
  NULL,
  'America/New_York',
  'fixture-password',
  'light',
  'active',
  'no',
  :workspaceId
);
`, {
    displayName: unprivilegedUser.username,
    userId: unprivilegedUser.userId,
    username: unprivilegedUser.username,
    workspaceId: workspace,
  });

  await db.run(`
INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  :membershipId,
  :userId,
  :workspaceId,
  'active',
  :now,
  :now
);
`, {
    membershipId: randomUUID(),
    now,
    userId: unprivilegedUser.userId,
    workspaceId: workspace,
  });

  return {
    adminSessionId: (await createSession({
      active_workspace_id: workspace,
      home_workspace_id: admin.home_workspace_id,
      timezone: admin.timezone || "America/New_York",
      user_id: admin.user_id,
      username: admin.username,
    })).sessionId,
    unprivilegedSessionId: (await createSession({
      active_workspace_id: workspace,
      home_workspace_id: workspace,
      timezone: "America/New_York",
      user_id: unprivilegedUser.userId,
      username: unprivilegedUser.username,
    })).sessionId,
    workspaceId: workspace,
  };
}

async function insertJob(options = {}) {
  const now = new Date().toISOString();
  const status = options.status || "pending";
  await db.run(`
INSERT INTO jobs (
  job_id,
  workspace_id,
  job_type,
  dedupe_key,
  payload_json,
  status,
  priority,
  available_at,
  attempt_count,
  max_attempts,
  locked_at,
  locked_by,
  last_error,
  created_at,
  updated_at,
  completed_at,
  dead_at
)
VALUES (
  :jobId,
  :workspaceId,
  :jobType,
  :dedupeKey,
  :payloadJson,
  :status,
  :priority,
  :availableAt,
  :attemptCount,
  :maxAttempts,
  :lockedAt,
  :lockedBy,
  :lastError,
  :createdAt,
  :updatedAt,
  :completedAt,
  :deadAt
);
`, {
    attemptCount: Number.isInteger(options.attemptCount) ? options.attemptCount : 0,
    availableAt: options.availableAt || now,
    completedAt: options.completedAt || null,
    createdAt: options.createdAt || now,
    deadAt: options.deadAt || null,
    dedupeKey: options.dedupeKey ?? `dedupe:${options.jobId}`,
    jobId: options.jobId,
    jobType: options.jobType || "test.success",
    lastError: options.lastError || null,
    lockedAt: options.lockedAt || null,
    lockedBy: options.lockedBy || null,
    maxAttempts: Number.isInteger(options.maxAttempts) ? options.maxAttempts : 3,
    payloadJson: JSON.stringify(options.payload || {}),
    priority: Number.isInteger(options.priority) ? options.priority : 0,
    status,
    updatedAt: options.updatedAt || now,
    workspaceId,
  });
}

async function readJob(jobId) {
  const row = await db.get("SELECT * FROM jobs WHERE job_id = :jobId;", { jobId });
  assert.ok(row, `expected job ${jobId}`);
  return row;
}

async function assertIntegrity() {
  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "job claiming regression database should pass integrity check");
}

function createApi(baseUrl) {
  return {
    async get(url, options = {}) {
      const headers = {};
      if (options.cookie) {
        headers.Cookie = `longtail_forge_session=${options.cookie}`;
      }

      const response = await fetch(`${baseUrl}${url}`, { headers });
      const text = await response.text();
      return {
        body: text ? JSON.parse(text) : null,
        headers: response.headers,
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

function closeServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => {
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
