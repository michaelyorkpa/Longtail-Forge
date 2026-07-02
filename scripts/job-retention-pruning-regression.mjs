import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const appVersion = "0.33.5.21.7.8";
const now = new Date("2026-07-02T12:00:00.000Z");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-job-retention-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-job-retention.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Job-Retention-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const envExample = readText(".env.example");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
const appSource = readText("src/core/app.js");
const configSource = readText("src/config.js");
const serviceSource = readText("src/services/jobs.service.js");
const workerCliSource = readText("src/core/jobs/worker-cli.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeDatabase, db, initializeDatabase, querySql } = await import("../src/db/index.js");
const { enqueueJob } = await import("../src/core/jobs/job-queue.js");
const { jobsService } = await import("../src/services/jobs.service.js");

let workspaceId = "";

try {
  assertStaticContract();
  assertRuntimeConfig();

  await initializeDatabase();
  workspaceId = await readWorkspaceId();
  await assertPruningBehavior();
  await assertHistoryDoesNotBlockReplacementJobs();
  await assertIntegrity();

  console.log("Job retention pruning regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the job retention version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the job retention version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the job retention version");
  assert.match(envExample, /^LONGTAIL_JOB_COMPLETED_RETENTION_DAYS=30$/m, ".env.example should document completed job retention");
  assert.match(envExample, /^LONGTAIL_JOB_DEAD_RETENTION_DAYS=90$/m, ".env.example should document dead-letter job retention");
  assert.match(configSource, /LONGTAIL_JOB_COMPLETED_RETENTION_DAYS/, "runtime config should read completed job retention");
  assert.match(configSource, /LONGTAIL_JOB_DEAD_RETENTION_DAYS/, "runtime config should read dead-letter job retention");
  assert.match(serviceSource, /async function pruneOldJobs/, "jobs service should own pruning behavior");
  assert.match(serviceSource, /status = :status[\s\S]*RETURNING job_id/, "pruning should delete by explicit job status and return counts");
  assert.match(appSource, /queueStartupJobRetentionPrune/, "app startup should queue job retention pruning");
  assert.match(workerCliSource, /jobsService\.pruneOldJobs/, "separate worker startup should run job retention pruning");
  assert.match(regressionSuite, /scripts\/job-retention-pruning-regression\.mjs/, "regression suite should include job retention coverage");
  assert.match(roadmap, /Version 0\.33\.5\.21\.7\.4 - Job retention and pruning[\s\S]*\[x\] Add a retention\/pruning policy/, "roadmap should mark the job retention slice complete");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the job retention slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.7\.4[\s\S]*completed[\s\S]*dead-letter[\s\S]*retention/, "database docs should document job retention");
  assert.match(runtimeDocs, /`LONGTAIL_JOB_COMPLETED_RETENTION_DAYS`[\s\S]*`LONGTAIL_JOB_DEAD_RETENTION_DAYS`/, "runtime docs should document job retention settings");
  assert.match(sqliteDocs, /As of 0\.33\.5\.21\.7\.4[\s\S]*job retention/, "SQLite docs should document job retention safety");
}

function assertRuntimeConfig() {
  const defaults = readConfig();
  assert.equal(defaults.completedRetentionDays, 30, "completed job retention should default to 30 days");
  assert.equal(defaults.deadRetentionDays, 90, "dead-letter job retention should default to 90 days");

  const custom = readConfig({
    LONGTAIL_JOB_COMPLETED_RETENTION_DAYS: "7",
    LONGTAIL_JOB_DEAD_RETENTION_DAYS: "365",
  });
  assert.equal(custom.completedRetentionDays, 7, "completed job retention should be configurable");
  assert.equal(custom.deadRetentionDays, 365, "dead-letter job retention should be configurable");

  assertConfigFails({ LONGTAIL_JOB_COMPLETED_RETENTION_DAYS: "0" }, /LONGTAIL_JOB_COMPLETED_RETENTION_DAYS must be at least 1/);
  assertConfigFails({ LONGTAIL_JOB_DEAD_RETENTION_DAYS: "3651" }, /LONGTAIL_JOB_DEAD_RETENTION_DAYS must be at most 3650/);
  assertConfigFails({ LONGTAIL_JOB_DEAD_RETENTION_DAYS: "soon" }, /LONGTAIL_JOB_DEAD_RETENTION_DAYS must be an integer/);
}

async function assertPruningBehavior() {
  await insertJob({
    completedAt: daysAgo(45),
    jobId: "completed-old-a",
    status: "completed",
    updatedAt: daysAgo(45),
  });
  await insertJob({
    completedAt: daysAgo(31),
    jobId: "completed-old-b",
    status: "completed",
    updatedAt: daysAgo(31),
  });
  await insertJob({
    completedAt: daysAgo(2),
    jobId: "completed-recent",
    status: "completed",
    updatedAt: daysAgo(2),
  });
  await insertJob({
    deadAt: daysAgo(120),
    jobId: "dead-old",
    lastError: "old dead-letter history",
    status: "dead",
    updatedAt: daysAgo(120),
  });
  await insertJob({
    deadAt: daysAgo(3),
    jobId: "dead-recent",
    lastError: "recent dead-letter history",
    status: "dead",
    updatedAt: daysAgo(3),
  });

  for (const status of ["pending", "running", "failed"]) {
    await insertJob({
      completedAt: daysAgo(120),
      deadAt: daysAgo(120),
      jobId: `${status}-old-active`,
      lastError: status === "failed" ? "retry later" : null,
      lockedAt: status === "running" ? daysAgo(120) : null,
      lockedBy: status === "running" ? "old-worker" : null,
      status,
      updatedAt: daysAgo(120),
    });
  }

  const result = await jobsService.pruneOldJobs({
    batchSize: 1,
    completedRetentionDays: 30,
    deadRetentionDays: 90,
    now,
  });

  assert.equal(result.completed.deleted, 2, "old completed rows should be pruned, even across multiple batches");
  assert.equal(result.dead.deleted, 1, "old dead-letter rows should be pruned");
  assert.equal(result.deleted, 3, "summary should count all pruned rows");
  assert.equal(result.completed.retentionDays, 30);
  assert.equal(result.dead.retentionDays, 90);
  assert.equal(await jobExists("completed-old-a"), false, "old completed history should be removed");
  assert.equal(await jobExists("completed-old-b"), false, "all old completed history should be removed");
  assert.equal(await jobExists("dead-old"), false, "old dead-letter history should be removed");

  for (const jobId of [
    "completed-recent",
    "dead-recent",
    "pending-old-active",
    "running-old-active",
    "failed-old-active",
  ]) {
    assert.equal(await jobExists(jobId), true, `${jobId} should be preserved`);
  }

  const repeat = await jobsService.pruneOldJobs({
    batchSize: 1,
    completedRetentionDays: 30,
    deadRetentionDays: 90,
    now,
  });
  assert.equal(repeat.deleted, 0, "running pruning again should be repeatable");
}

async function assertHistoryDoesNotBlockReplacementJobs() {
  await insertJob({
    completedAt: daysAgo(1),
    dedupeKey: "dedupe:recent-completed",
    jobId: "completed-history-dedupe",
    jobType: "retention.replacement",
    status: "completed",
    updatedAt: daysAgo(1),
  });
  await insertJob({
    deadAt: daysAgo(1),
    dedupeKey: "dedupe:recent-dead",
    jobId: "dead-history-dedupe",
    jobType: "retention.replacement",
    lastError: "dead history",
    status: "dead",
    updatedAt: daysAgo(1),
  });

  const completedReplacement = await enqueueJob({
    dedupeKey: "dedupe:recent-completed",
    jobType: "retention.replacement",
    payload: { replacement: "completed" },
    workspaceId,
  });
  const deadReplacement = await enqueueJob({
    dedupeKey: "dedupe:recent-dead",
    jobType: "retention.replacement",
    payload: { replacement: "dead" },
    workspaceId,
  });

  assert.equal(completedReplacement.action, "inserted", "completed history should not block replacement jobs");
  assert.equal(deadReplacement.action, "inserted", "dead-letter history should not block replacement jobs");
  assert.equal(await activeJobCount("retention.replacement"), 2, "replacement jobs should remain active after insertion");
}

async function insertJob(options = {}) {
  const createdAt = options.createdAt || options.updatedAt || now.toISOString();
  const updatedAt = options.updatedAt || createdAt;

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
  '{}',
  :status,
  0,
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
    attemptCount: options.status === "running" ? 1 : 0,
    availableAt: options.availableAt || createdAt,
    completedAt: options.completedAt || null,
    createdAt,
    deadAt: options.deadAt || null,
    dedupeKey: options.dedupeKey ?? `dedupe:${options.jobId}`,
    jobId: options.jobId,
    jobType: options.jobType || "retention.test",
    lastError: options.lastError || null,
    lockedAt: options.lockedAt || null,
    lockedBy: options.lockedBy || null,
    maxAttempts: Number.isInteger(options.maxAttempts) ? options.maxAttempts : 3,
    status: options.status || "pending",
    updatedAt,
    workspaceId,
  });
}

async function readWorkspaceId() {
  const row = await db.get("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  assert.ok(row?.workspace_id, "fresh database should have a workspace");
  return row.workspace_id;
}

async function jobExists(jobId) {
  const row = await db.get("SELECT job_id FROM jobs WHERE job_id = :jobId;", { jobId });
  return Boolean(row);
}

async function activeJobCount(jobType) {
  const row = await db.get(`
SELECT COUNT(*) AS count
FROM jobs
WHERE workspace_id = :workspaceId
  AND job_type = :jobType
  AND status IN ('pending', 'running', 'failed');
`, {
    jobType,
    workspaceId,
  });

  return Number(row?.count || 0);
}

async function assertIntegrity() {
  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "job retention regression database should pass integrity check");
}

function daysAgo(days) {
  return new Date(now.getTime() - (days * 24 * 60 * 60 * 1000)).toISOString();
}

function readConfig(overrides = {}) {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { config } from "./src/config.js";
    console.log(JSON.stringify({
      completedRetentionDays: config.worker.completedRetentionDays,
      deadRetentionDays: config.worker.deadRetentionDays
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

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
