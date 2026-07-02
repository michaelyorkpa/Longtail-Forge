import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const appVersion = "0.33.5.21.7.4";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-worker-runner-"));
const dataDir = path.join(tempDir, "data");
process.env.LONGTAIL_DATA_DIR = dataDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(dataDir, "longtail-forge-worker-runner.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Worker-Runner-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
const appSource = readText("src/core/app.js");
const dbIndexSource = readText("src/db/index.js");
const runnerSource = readText("src/core/jobs/job-runner.js");
const handlersSource = readText("src/core/jobs/job-handlers.js");
const workerCliSource = readText("src/core/jobs/worker-cli.js");
const workerRootSource = readText("worker.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeDatabase,
  db,
  initializeDatabase,
  initializeWorkerDatabase,
  querySql,
  runSql,
  sqlText,
} = await import("../src/db/index.js");
const {
  clearJobHandlersForTests,
  getJobWorkerStatus,
  registerJobHandler,
  resetJobWorkerStatusForTests,
  runJobWorkerOnce,
  startJobWorker,
  stopJobWorker,
} = await import("../src/core/jobs/index.js");
const {
  acquireWorkerProcessLock,
  getWorkerProcessLockPath,
} = await import("../src/core/jobs/worker-process-lock.js");

let workspaceId = "";

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the worker runner version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the worker runner version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the worker runner version");

  assert.match(workerRootSource, /loadRuntimeEnvFile\(\)/, "worker.js should load the same local .env contract as server.js");
  assert.match(workerRootSource, /startWorkerCli/, "worker.js should start the Node worker CLI");
  assert.match(appSource, /startConfiguredInlineWorker\(\)/, "app startup should trigger inline worker setup after listen");
  assert.match(appSource, /config\.worker\.mode === "separate"[\s\S]*state=external/, "app startup should leave separate mode to node worker.js");
  assert.match(appSource, /config\.worker\.mode === "disabled"[\s\S]*state=disabled/, "app startup should support disabled mode");
  assert.match(appSource, /stopJobWorker\(\)/, "app shutdown should stop the inline worker");
  assert.match(handlersSource, /registerJobHandler/, "framework should expose registered job handlers");
  assert.match(runnerSource, /setInterval/, "inline and separate workers should use a poll timer");
  assert.match(runnerSource, /db\.transaction\(async \(transaction\)/, "job claiming should run inside the adapter transaction helper");
  assert.match(runnerSource, /RETURNING[\s\S]*job_id/, "job claiming should read claimed rows through RETURNING");
  assert.match(runnerSource, /status = 'completed'/, "runner should mark successful jobs complete");
  assert.match(runnerSource, /status = 'failed'/, "runner should keep retryable failures failed");
  assert.match(runnerSource, /status = 'dead'/, "runner should move exhausted jobs to dead-letter state");
  assert.match(runnerSource, /calculateRetryDelayMs/, "runner should schedule retries with backoff");
  assert.match(workerCliSource, /initializeWorkerDatabase/, "separate worker should use worker schema readiness startup");
  assert.doesNotMatch(workerCliSource, /\binitializeDatabase\b/, "separate worker CLI must not run app migrations/startup maintenance");
  assert.match(workerCliSource, /acquireWorkerProcessLock/, "separate SQLite worker should enforce one local worker process");
  assert.doesNotMatch(functionBlock(dbIndexSource, "initializeWorkerDatabase"), /runMigrations|runAppStartupMaintenance/, "worker database startup must verify schema without owning migrations or app startup maintenance");
  assert.match(regressionSuite, /scripts\/worker-runner-regression\.mjs/, "regression suite should include worker runner coverage");
  assert.match(runtimeDocs, /`LONGTAIL_WORKER_MODE`[\s\S]*`inline`[\s\S]*`separate`[\s\S]*`disabled`/, "runtime docs should document worker modes as active settings");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.2[\s\S]*Worker runner v1/, "database docs should document the worker runner");
  assert.match(sqliteDocs, /As of 0\.33\.5\.21\.2[\s\S]*at most one local worker process/, "SQLite docs should document the one-worker boundary");
  assert.match(roadmap, /Version 0\.33\.5\.21\.2 - Worker runner v1[\s\S]*\[x\] Add a Node worker runner[\s\S]*\[x\] Implement the 0\.33\.5\.21\.0\.5 SQLite boundary/, "roadmap should mark the worker runner slice complete");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the worker runner slice");

  assertWorkerConfigModes();
  assertWorkerSchemaReadinessFailsBeforeMigrations();

  await initializeDatabase();
  await initializeWorkerDatabase();
  workspaceId = await readWorkspaceId();
  await assertWorkerProcessLock();
  await assertRunnerModesAndStatus();
  await assertJobRunnerBehavior();
  await assertIntegrity();

  console.log("Worker runner regression passed.");
} finally {
  await stopJobWorker().catch(() => {});
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertWorkerConfigModes() {
  assert.equal(readConfig().workerMode, "inline", "worker mode should default to inline");
  assert.equal(readConfig({ LONGTAIL_WORKER_MODE: "separate" }).workerMode, "separate");
  assert.equal(readConfig({ LONGTAIL_WORKER_MODE: "disabled" }).workerMode, "disabled");
  assertConfigFails({ LONGTAIL_WORKER_MODE: "fleet" }, /LONGTAIL_WORKER_MODE must be inline or separate or disabled/);
}

function assertWorkerSchemaReadinessFailsBeforeMigrations() {
  const missingDir = path.join(tempDir, "missing-schema");
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    process.env.LONGTAIL_DATA_DIR = ${JSON.stringify(missingDir)};
    process.env.LONGTAIL_DATABASE_FILE = ${JSON.stringify(path.join(missingDir, "missing.db"))};
    process.env.SUPER_ADMIN_PASSWORD = "Worker-Runner-Missing-Schema-123!";
    const { initializeWorkerDatabase, closeDatabase } = await import("./src/db/index.js");
    try {
      await initializeWorkerDatabase();
    } finally {
      await closeDatabase();
    }
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(),
  });

  assert.notEqual(child.status, 0, "worker schema readiness should fail before migrations run");
  assert.match(child.stderr || child.stdout, /Worker schema is not ready/, "missing schema failure should tell operators to run app migration maintenance first");
}

async function assertWorkerProcessLock() {
  const lockPath = getWorkerProcessLockPath();
  const firstLock = await acquireWorkerProcessLock();
  assert.equal(firstLock.lockPath, lockPath);
  assert.equal(existsSync(lockPath), true, "worker lock file should be created");
  await assert.rejects(
    () => acquireWorkerProcessLock(),
    /at most one local worker process/,
    "a second local SQLite worker should be rejected",
  );
  await firstLock.release();
  assert.equal(existsSync(lockPath), false, "worker lock file should be released");
}

async function assertRunnerModesAndStatus() {
  resetJobWorkerStatusForTests();
  const disabled = await startJobWorker({ mode: "disabled", workerId: "disabled-regression" });
  assert.equal(disabled.state, "disabled");
  assert.equal(disabled.timerActive, false);

  const started = await startJobWorker({
    mode: "inline",
    pollIntervalMs: 1000,
    workerId: "inline-regression",
  });
  assert.equal(started.mode, "inline");
  assert.equal(started.timerActive, true);
  assert.equal(started.workerId, "inline-regression");
  const stopped = await stopJobWorker();
  assert.equal(stopped.timerActive, false);
}

async function assertJobRunnerBehavior() {
  resetJobWorkerStatusForTests();
  clearJobHandlersForTests();
  const handled = [];
  registerJobHandler("test.success", async ({ job, payload }) => {
    handled.push({ jobId: job.jobId, payload });
  });
  registerJobHandler("test.fail-retry", async () => {
    throw new Error("Retry please.");
  });
  registerJobHandler("test.fail-dead", async () => {
    throw new Error("Dead letter please.");
  });

  await insertJob({ jobId: "job-success-a", jobType: "test.success", payload: { order: "a" }, priority: 10 });
  await insertJob({ jobId: "job-success-b", jobType: "test.success", payload: { order: "b" }, priority: 5 });
  await insertJob({
    availableAt: new Date(Date.now() + 60_000).toISOString(),
    jobId: "job-future",
    jobType: "test.success",
    payload: { order: "future" },
  });

  const successSummary = await runJobWorkerOnce({
    claimLimit: 2,
    mode: "inline",
    workerId: "regression-worker",
  });
  assert.deepEqual(successSummary, {
    claimed: 2,
    completed: 2,
    dead: 0,
    failed: 0,
    skipped: false,
  });
  assert.deepEqual(handled.map((entry) => entry.jobId), ["job-success-a", "job-success-b"]);
  assert.equal((await readJob("job-success-a")).status, "completed");
  assert.equal((await readJob("job-success-a")).attempt_count, 1);
  assert.equal((await readJob("job-success-a")).locked_at, null);
  assert.equal((await readJob("job-future")).status, "pending", "future scheduled jobs should wait for a later poll tick");
  assert.equal((await readJob("job-future")).attempt_count, 0);

  await insertJob({ jobId: "job-retry", jobType: "test.fail-retry", maxAttempts: 3 });
  const beforeRetry = Date.now();
  const retrySummary = await runJobWorkerOnce({ mode: "inline", workerId: "regression-worker" });
  assert.equal(retrySummary.failed, 1);
  const retry = await readJob("job-retry");
  assert.equal(retry.status, "failed");
  assert.equal(retry.attempt_count, 1);
  assert.equal(retry.locked_at, null);
  assert.match(retry.last_error, /Retry please/);
  assert.ok(Date.parse(retry.available_at) > beforeRetry, "failed jobs should be scheduled for a future retry");

  await insertJob({ jobId: "job-dead", jobType: "test.fail-dead", maxAttempts: 1 });
  const deadSummary = await runJobWorkerOnce({ mode: "inline", workerId: "regression-worker" });
  assert.equal(deadSummary.dead, 1);
  const dead = await readJob("job-dead");
  assert.equal(dead.status, "dead");
  assert.equal(dead.attempt_count, 1);
  assert.match(dead.last_error, /Dead letter please/);
  assert.ok(dead.dead_at, "dead-letter rows should record dead_at");

  await insertJob({ jobId: "job-unknown", jobType: "test.unknown", maxAttempts: 1 });
  const unknownSummary = await runJobWorkerOnce({ mode: "inline", workerId: "regression-worker" });
  assert.equal(unknownSummary.dead, 1);
  assert.match((await readJob("job-unknown")).last_error, /No handler registered/);

  const status = getJobWorkerStatus();
  assert.equal(status.workerId, "regression-worker");
  assert.ok(status.claimedCount >= 5, "worker status should count claimed jobs");
  assert.ok(status.completedCount >= 2, "worker status should count completed jobs");
  assert.ok(status.failedCount >= 1, "worker status should count retryable failures");
  assert.ok(status.deadCount >= 2, "worker status should count dead-letter transitions");
  assert.deepEqual(status.registeredJobTypes, ["test.fail-dead", "test.fail-retry", "test.success"]);
}

async function insertJob(options = {}) {
  const now = new Date().toISOString();
  await runSql(`
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
  ${sqlText(options.jobId)},
  ${sqlText(workspaceId)},
  ${sqlText(options.jobType || "test.success")},
  ${options.dedupeKey === null ? "NULL" : sqlText(options.dedupeKey || `dedupe:${options.jobId}`)},
  ${sqlText(JSON.stringify(options.payload || {}))},
  ${sqlText(options.status || "pending")},
  ${Number.isInteger(options.priority) ? options.priority : 0},
  ${sqlText(options.availableAt || now)},
  ${Number.isInteger(options.attemptCount) ? options.attemptCount : 0},
  ${Number.isInteger(options.maxAttempts) ? options.maxAttempts : 3},
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)},
  NULL,
  NULL
);
`);
}

async function readWorkspaceId() {
  const row = await db.get("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  assert.ok(row?.workspace_id, "fresh database should have a workspace");
  return row.workspace_id;
}

async function readJob(jobId) {
  const row = await db.get("SELECT * FROM jobs WHERE job_id = :jobId;", { jobId });
  assert.ok(row, `expected job ${jobId}`);
  return row;
}

async function assertIntegrity() {
  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "worker runner regression database should pass integrity check");
}

function readConfig(overrides = {}) {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { config } from "./src/config.js";
    console.log(JSON.stringify({
      workerMode: config.worker.mode
    }));
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(overrides),
  });

  assert.equal(child.status, 0, child.stderr || child.stdout);
  return JSON.parse(child.stdout.trim());
}

function assertConfigFails(overrides, pattern) {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import "./src/config.js";
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(overrides),
  });

  assert.notEqual(child.status, 0, "config import should fail");
  assert.match(child.stderr || child.stdout, pattern);
}

function cleanEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("LONGTAIL_") ||
      key.startsWith("SECURE_NOTES_") ||
      key === "DATABASE_URL" ||
      key === "HOST" ||
      key === "PORT" ||
      key === "SQLITE_COMMAND" ||
      key === "SUPER_ADMIN_PASSWORD" ||
      key === "SUPER_ADMIN_USERNAME" ||
      key === "TRUST_PROXY" ||
      key === "WORKSPACE_INSTALL_MODE" ||
      key === "WORKSPACE_TYPE_LIMIT"
    ) {
      delete env[key];
    }
  }

  return { ...env, ...overrides };
}

function functionBlock(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `expected ${name} function`);
  const nextFunction = source.indexOf("\nasync function ", start + 1);
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
