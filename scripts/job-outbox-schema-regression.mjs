import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.21.3";
const migrationVersion = "065";
const migrationFile = "src/db/migrations/065_job_outbox_schema.sql";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-job-outbox-schema-"));

process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-job-outbox-schema.db");
process.env.SUPER_ADMIN_PASSWORD = "Job-Outbox-Schema-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const currentSchema = readText("src/db/schema/current.sql");
const migrationSql = readText(migrationFile);
const databaseDocs = readText("docs/database.md");
const architectureDocs = readText("docs/architecture.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");
let cachedWorkspaceId = "";

const {
  closeDatabase,
  initializeDatabase,
  querySql,
  runSql,
  sqlText,
} = await import("../src/db/index.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the job/outbox schema version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the job/outbox schema version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the job/outbox schema version");

  assert.doesNotMatch(currentSchema, /\bCREATE TABLE jobs\b/, "frozen current.sql baseline should not be edited for the job/outbox schema");
  assert.match(migrationSql, /\bCREATE TABLE jobs\b/, "core migration should create the durable jobs table");
  assert.match(migrationSql, /\bCREATE UNIQUE INDEX idx_jobs_active_dedupe\b[\s\S]*status IN \('pending', 'running', 'failed'\)/, "migration should enforce active dedupe only for retryable/in-flight work");
  assert.match(regressionSuite, /scripts\/job-outbox-schema-regression\.mjs/, "regression suite should include the job/outbox schema regression");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.1[\s\S]*`jobs`[\s\S]*pending[\s\S]*running[\s\S]*completed[\s\S]*failed[\s\S]*dead/i, "database docs should explain the shipped job states");
  assert.match(architectureDocs, /As of 0\.33\.5\.21\.2[\s\S]*framework-owned `jobs` table[\s\S]*v1 worker runner/, "architecture docs should record the durable job table handoff into the worker runner");
  assert.match(databaseDocs, /table shipped as schema only in 0\.33\.5\.21\.1[\s\S]*v1 worker runner shipped in 0\.33\.5\.21\.2/, "database docs should preserve the schema-only handoff while documenting the worker runner");
  assert.match(roadmap, /Version 0\.33\.5\.21\.1 - Job\/outbox schema[\s\S]*\[x\] Add job\/outbox tables[\s\S]*\[x\] Ship job\/outbox tables as a new versioned core migration/, "roadmap should mark the schema slice complete");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the job/outbox schema slice");

  await initializeDatabase();
  await assertMigrationRecorded();
  await assertJobsTableShape();
  await assertJobsIndexes();
  await assertStatusAndAttemptChecks();
  await assertDedupeBehavior();
  await assertIntegrity();

  console.log("Job/outbox schema regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertMigrationRecorded() {
  const rows = await querySql(`
SELECT version, module_id, name
FROM schema_migrations
ORDER BY version;
`);

  assert.deepEqual(rows, [
    {
      version: "0.33.5.18.6.5.4",
      module_id: "core",
      name: "current_fresh_start_database",
    },
    {
      version: migrationVersion,
      module_id: "core",
      name: "job_outbox_schema",
    },
  ]);
}

async function assertJobsTableShape() {
  const columns = await querySql("PRAGMA table_info(jobs);");
  const shaped = columns.map((column) => ({
    name: column.name,
    notnull: column.notnull,
    pk: column.pk,
    type: column.type,
  }));

  assert.deepEqual(shaped, [
    { name: "job_id", type: "TEXT", notnull: 0, pk: 1 },
    { name: "workspace_id", type: "TEXT", notnull: 1, pk: 0 },
    { name: "job_type", type: "TEXT", notnull: 1, pk: 0 },
    { name: "dedupe_key", type: "TEXT", notnull: 0, pk: 0 },
    { name: "payload_json", type: "TEXT", notnull: 1, pk: 0 },
    { name: "status", type: "TEXT", notnull: 1, pk: 0 },
    { name: "priority", type: "INTEGER", notnull: 1, pk: 0 },
    { name: "available_at", type: "TEXT", notnull: 1, pk: 0 },
    { name: "attempt_count", type: "INTEGER", notnull: 1, pk: 0 },
    { name: "max_attempts", type: "INTEGER", notnull: 1, pk: 0 },
    { name: "locked_at", type: "TEXT", notnull: 0, pk: 0 },
    { name: "locked_by", type: "TEXT", notnull: 0, pk: 0 },
    { name: "last_error", type: "TEXT", notnull: 0, pk: 0 },
    { name: "created_at", type: "TEXT", notnull: 1, pk: 0 },
    { name: "updated_at", type: "TEXT", notnull: 1, pk: 0 },
    { name: "completed_at", type: "TEXT", notnull: 0, pk: 0 },
    { name: "dead_at", type: "TEXT", notnull: 0, pk: 0 },
  ]);

  const foreignKeys = await querySql("PRAGMA foreign_key_list(jobs);");
  assert.equal(foreignKeys.length, 1, "jobs should stay workspace-scoped");
  assert.equal(foreignKeys[0].table, "workspaces");
  assert.equal(foreignKeys[0].from, "workspace_id");
  assert.equal(foreignKeys[0].to, "workspace_id");
}

async function assertJobsIndexes() {
  const rows = await querySql(`
SELECT name, sql
FROM sqlite_master
WHERE type = 'index'
  AND tbl_name = 'jobs'
ORDER BY name;
`);
  const indexes = Object.fromEntries(rows.map((row) => [row.name, row.sql]));

  assert.match(indexes.idx_jobs_active_dedupe, /UNIQUE INDEX[\s\S]*workspace_id, job_type, dedupe_key[\s\S]*status IN \('pending', 'running', 'failed'\)/);
  assert.match(indexes.idx_jobs_pending_available, /status, available_at, priority DESC, created_at, job_id[\s\S]*status IN \('pending', 'failed'\)/);
  assert.match(indexes.idx_jobs_running_locked, /status, locked_at, job_id[\s\S]*status = 'running'/);
  assert.match(indexes.idx_jobs_type_status_available, /job_type, status, available_at, priority DESC/);
  assert.match(indexes.idx_jobs_workspace_status_updated, /workspace_id, status, updated_at DESC, job_id/);
}

async function assertStatusAndAttemptChecks() {
  await assert.rejects(
    () => insertJob({ jobId: "job-invalid-status", status: "queued" }),
    /CHECK constraint failed|constraint/i,
    "jobs should only allow documented lifecycle statuses",
  );
  await assert.rejects(
    () => insertJob({ attemptCount: -1, jobId: "job-invalid-attempt-count" }),
    /CHECK constraint failed|constraint/i,
    "attempt_count should not be negative",
  );
  await assert.rejects(
    () => insertJob({ jobId: "job-invalid-max-attempts", maxAttempts: 0 }),
    /CHECK constraint failed|constraint/i,
    "max_attempts should stay positive",
  );
}

async function assertDedupeBehavior() {
  await insertJob({ dedupeKey: "search:task-1", jobId: "job-dedupe-pending-a" });
  await assert.rejects(
    () => insertJob({ dedupeKey: "search:task-1", jobId: "job-dedupe-pending-b" }),
    /UNIQUE constraint failed|constraint/i,
    "active duplicate dedupe keys should be rejected",
  );

  await insertJob({
    dedupeKey: "search:task-2",
    jobId: "job-dedupe-completed-a",
    status: "completed",
    completedAt: new Date().toISOString(),
  });
  await insertJob({ dedupeKey: "search:task-2", jobId: "job-dedupe-pending-c" });

  await insertJob({
    deadAt: new Date().toISOString(),
    dedupeKey: "search:task-3",
    jobId: "job-dedupe-dead-a",
    status: "dead",
  });
  await insertJob({ dedupeKey: "search:task-3", jobId: "job-dedupe-pending-d" });

  await insertJob({ dedupeKey: null, jobId: "job-null-dedupe-a" });
  await insertJob({ dedupeKey: null, jobId: "job-null-dedupe-b" });
}

async function insertJob(options = {}) {
  const now = new Date().toISOString();
  const jobId = options.jobId || `job-${Math.random().toString(16).slice(2)}`;
  const workspaceId = options.workspaceId || await readWorkspaceId();

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
  ${sqlText(jobId)},
  ${sqlText(workspaceId)},
  ${sqlText(options.jobType || "search.index")},
  ${options.dedupeKey === null ? "NULL" : sqlText(options.dedupeKey || `dedupe:${jobId}`)},
  ${sqlText(JSON.stringify(options.payload || { record_type: "task", record_id: jobId }))},
  ${sqlText(options.status || "pending")},
  ${Number.isInteger(options.priority) ? options.priority : 0},
  ${sqlText(options.availableAt || now)},
  ${Number.isInteger(options.attemptCount) ? options.attemptCount : 0},
  ${Number.isInteger(options.maxAttempts) ? options.maxAttempts : 3},
  ${options.lockedAt ? sqlText(options.lockedAt) : "NULL"},
  ${options.lockedBy ? sqlText(options.lockedBy) : "NULL"},
  ${options.lastError ? sqlText(options.lastError) : "NULL"},
  ${sqlText(now)},
  ${sqlText(now)},
  ${options.completedAt ? sqlText(options.completedAt) : "NULL"},
  ${options.deadAt ? sqlText(options.deadAt) : "NULL"}
);
`);
}

async function readWorkspaceId() {
  if (cachedWorkspaceId) {
    return cachedWorkspaceId;
  }

  const rows = await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  cachedWorkspaceId = rows[0]?.workspace_id;
  assert.ok(cachedWorkspaceId, "fresh database should have a workspace for job rows");
  return cachedWorkspaceId;
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok", "job/outbox schema database should pass integrity check");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
