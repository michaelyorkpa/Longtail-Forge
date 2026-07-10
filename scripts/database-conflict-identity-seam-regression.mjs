import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const dialectContractVersion = "0.33.6.14a";
const conflictIdentitySliceVersion = "0.33.5.27.3";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-db-conflict-identity-seams-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-conflict-identity-seams.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Database-Conflict-Identity-Seams-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const databaseDocs = readText("docs/database.md");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const sqliteDialectSource = readText("src/db/adapters/sqlite-dialect-seams.js");
const dbIndexSource = readText("src/db/index.js");
const jobQueueSource = readText("src/core/jobs/job-queue.js");
const jobRunnerSource = readText("src/core/jobs/job-runner.js");
const jobsServiceSource = readText("src/services/jobs.service.js");
const parameterAuditRegression = readText("scripts/parameter-binding-audit-regression.mjs");
const regressionSuite = readText("scripts/regression-legacy-snapshot.json");

const {
  closeDatabase,
  db,
  initializeDatabase,
  querySql,
} = await import("../src/db/index.js");
const { enqueueJob } = await import("../src/core/jobs/job-queue.js");
const { claimAvailableJobs } = await import("../src/core/jobs/job-runner.js");
const { jobsService } = await import("../src/services/jobs.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  await assertStartupConflictProofPath();
  await assertConflictStatementBuilders(db.dialect);
  await assertLastInsertIdentitySeam(db.dialect);
  await assertDurableJobReturningSeams();
  await assertIntegrity();

  console.log("Database conflict and identity seam regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the conflict and identity seam version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the conflict and identity seam version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the conflict and identity seam version");

  assert.match(sqliteDialectSource, new RegExp(`SQLITE_DIALECT_CONTRACT_VERSION = "${escapeRegExp(dialectContractVersion)}"`), "SQLite dialect contract should keep its independent seam contract version");
  assert.match(sqliteDialectSource, /buildInsertOrIgnore/, "SQLite dialect seams should expose a full insert-or-ignore builder");
  assert.match(sqliteDialectSource, /buildInsertOnConflictDoNothing/, "SQLite dialect seams should expose a do-nothing conflict builder");
  assert.match(sqliteDialectSource, /buildInsertOnConflictDoUpdate/, "SQLite dialect seams should expose an upsert conflict builder");
  assert.match(dbIndexSource, /databaseDialect\.conflict\.buildInsertOrIgnore/, "startup maintenance should include the low-risk conflict proof path");

  assert.doesNotMatch(jobQueueSource, /\bRETURNING\b/, "job queue should not carry raw RETURNING SQL at the call site");
  assert.doesNotMatch(jobRunnerSource, /\bRETURNING\b/, "job runner should not carry raw RETURNING SQL at the call site");
  assert.doesNotMatch(jobsServiceSource, /\bRETURNING\b/, "jobs service should not carry raw RETURNING SQL at the call site");
  assert.match(jobQueueSource, /transaction\.dialect\.returning\.columns\(JOB_RETURN_COLUMNS\)/, "job queue should use the returning seam");
  assert.match(jobRunnerSource, /transaction\.dialect\.returning\.columns\(CLAIMED_JOB_RETURN_COLUMNS\)/, "job runner should use the returning seam");
  assert.match(jobsServiceSource, /transaction\.dialect\.returning\.columns\(\["job_id"\]\)/, "job pruning should use the returning seam");
  assert.match(parameterAuditRegression, /src\/db\/adapters\/sqlite-dialect-seams\.js/, "parameter-binding audit should keep RETURNING provider-owned");
  assert.doesNotMatch(parameterAuditRegression, /src\/core\/jobs\/job-queue\.js:\d+/, "parameter-binding audit should not allowlist raw job queue RETURNING");
  assert.doesNotMatch(parameterAuditRegression, /src\/core\/jobs\/job-runner\.js:\d+/, "parameter-binding audit should not allowlist raw job runner RETURNING");
  assert.doesNotMatch(parameterAuditRegression, /src\/services\/jobs\.service\.js:\d+/, "parameter-binding audit should not allowlist raw jobs service RETURNING");

  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.3 - Upsert\/conflict and identity\/RETURNING seams[\s\S]*- \[x\] Implement the provider-neutral upsert\/conflict helper[\s\S]*- \[x\] Implement the returned-row\/last-insert identity seam[\s\S]*- \[x\] Decide the durable-job `RETURNING` outcome[\s\S]*- \[x\] Convert one low-risk proof path/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.3[\s\S]*`databaseDialect\.conflict\.buildInsertOrIgnore\(\.\.\.\)`[\s\S]*[Dd]urable job[\s\S]*returning seam/, "database docs should describe the conflict and identity seam implementation");
  assert.match(auditDocs, /0\.33\.5\.27\.3 Upsert\/Conflict and Identity Seams[\s\S]*durable-job `RETURNING` statements are converted to the provider returning seam/, "audit docs should record the durable-job RETURNING resolution");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(conflictIdentitySliceVersion)} - [\\s\\S]*upsert\\/conflict and identity seams[\\s\\S]*durable job`), "changelog should record the conflict and identity seam slice");
  assert.match(regressionSuite, /scripts\/database-conflict-identity-seam-regression\.mjs/, "regression suite should include conflict and identity seam coverage");
}

async function assertStartupConflictProofPath() {
  const row = await db.get(`
SELECT COUNT(*) AS total
FROM role_permissions
WHERE role_id = :roleId
  AND permission_id = :permissionId;
`, {
    permissionId: "roles.assign",
    roleId: "project_admin",
  });
  assert.equal(Number(row.total), 1, "startup conflict proof path should preserve the project-admin role assignment repair");
}

async function assertConflictStatementBuilders(dialect) {
  await db.run(`
CREATE TABLE conflict_identity_proof (
  record_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  touched_at TEXT NOT NULL
);
`);

  const insertOrIgnoreSql = dialect.conflict.buildInsertOrIgnore({
    columns: ["record_id", "label", "touched_at"],
    returningColumns: ["record_id", "label"],
    tableName: "conflict_identity_proof",
    valueExpressions: {
      label: ":label",
      record_id: ":recordId",
      touched_at: ":touchedAt",
    },
  });
  assert.equal(insertOrIgnoreSql, [
    "INSERT OR IGNORE INTO conflict_identity_proof (record_id, label, touched_at)",
    "VALUES (:recordId, :label, :touchedAt)",
    "RETURNING record_id, label",
  ].join("\n"));

  const inserted = await db.get(`${insertOrIgnoreSql};`, {
    label: "Original",
    recordId: "proof-one",
    touchedAt: "2026-07-05T14:00:00.000Z",
  });
  assert.deepEqual(inserted, {
    label: "Original",
    record_id: "proof-one",
  }, "insert-or-ignore builder should return the inserted row on SQLite");

  const ignored = await db.get(`${insertOrIgnoreSql};`, {
    label: "Ignored duplicate",
    recordId: "proof-one",
    touchedAt: "2026-07-05T14:01:00.000Z",
  });
  assert.equal(ignored, null, "insert-or-ignore builder should preserve SQLite duplicate-ignore behavior");

  const doNothingSql = dialect.conflict.buildInsertOnConflictDoNothing({
    columns: ["record_id", "label", "touched_at"],
    conflictColumns: ["record_id"],
    tableName: "conflict_identity_proof",
    valueExpressions: {
      label: ":label",
      record_id: ":recordId",
      touched_at: ":touchedAt",
    },
  });
  assert.equal(doNothingSql, [
    "INSERT INTO conflict_identity_proof (record_id, label, touched_at)",
    "VALUES (:recordId, :label, :touchedAt)",
    "ON CONFLICT(record_id) DO NOTHING",
  ].join("\n"));

  const upsertSql = dialect.conflict.buildInsertOnConflictDoUpdate({
    columns: ["record_id", "label", "touched_at"],
    conflictColumns: ["record_id"],
    returningColumns: ["record_id", "label"],
    tableName: "conflict_identity_proof",
    updateColumns: ["label", "touched_at"],
    valueExpressions: {
      label: ":label",
      record_id: ":recordId",
      touched_at: ":touchedAt",
    },
  });
  assert.equal(upsertSql, [
    "INSERT INTO conflict_identity_proof (record_id, label, touched_at)",
    "VALUES (:recordId, :label, :touchedAt)",
    "ON CONFLICT(record_id) DO UPDATE SET label = excluded.label, touched_at = excluded.touched_at",
    "RETURNING record_id, label",
  ].join("\n"));

  const updated = await db.get(`${upsertSql};`, {
    label: "Updated",
    recordId: "proof-one",
    touchedAt: "2026-07-05T14:02:00.000Z",
  });
  assert.deepEqual(updated, {
    label: "Updated",
    record_id: "proof-one",
  }, "upsert builder should return the SQLite upsert result row");

  assert.throws(
    () => dialect.conflict.buildInsertOrIgnore({
      columns: ["record_id"],
      tableName: "conflict_identity_proof",
      valueExpressions: {},
    }),
    /Missing insert value expression/,
    "conflict builders should reject missing value expressions",
  );
}

async function assertLastInsertIdentitySeam(dialect) {
  await db.run(`
CREATE TABLE last_insert_identity_proof (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL
);
INSERT INTO last_insert_identity_proof (label)
VALUES ('Inserted through identity proof');
`);

  const row = await db.get(`
SELECT
  ${dialect.identity.lastInsertRowId()} AS id,
  label
FROM last_insert_identity_proof
WHERE id = ${dialect.identity.lastInsertRowId()};
`);
  assert.deepEqual(row, {
    id: 1,
    label: "Inserted through identity proof",
  }, "last-insert identity seam should lower to SQLite last_insert_rowid()");
}

async function assertDurableJobReturningSeams() {
  const workspace = await db.get("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  assert.ok(workspace?.workspace_id, "fresh database should have a workspace for durable job proof");
  const now = "2026-07-05T14:10:00.000Z";

  const inserted = await enqueueJob({
    availableAt: now,
    dedupeKey: "conflict-identity-proof",
    jobId: "conflict-identity-proof-job",
    jobType: "database.conflict_identity.proof",
    payload: { proof: "insert" },
    priority: 1,
    workspaceId: workspace.workspace_id,
  });
  assert.equal(inserted.action, "inserted");
  assert.equal(inserted.job.jobId, "conflict-identity-proof-job");
  assert.equal(inserted.job.status, "pending");

  const updated = await enqueueJob({
    availableAt: now,
    dedupeKey: "conflict-identity-proof",
    jobType: "database.conflict_identity.proof",
    payload: { proof: "update" },
    priority: 5,
    workspaceId: workspace.workspace_id,
  });
  assert.equal(updated.action, "updated", "deduped pending enqueue should still return the updated job row through the seam");
  assert.equal(updated.job.jobId, "conflict-identity-proof-job");
  assert.equal(updated.job.priority, 5);

  const claimed = await claimAvailableJobs({
    limit: 1,
    now,
    workerId: "conflict-identity-worker",
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job_id, "conflict-identity-proof-job");
  assert.equal(claimed[0].locked_by, "conflict-identity-worker");

  await db.run(`
UPDATE jobs
SET
  status = 'completed',
  completed_at = :completedAt,
  updated_at = :completedAt,
  locked_at = NULL,
  locked_by = NULL
WHERE job_id = :jobId;
`, {
    completedAt: "2026-01-01T00:00:00.000Z",
    jobId: "conflict-identity-proof-job",
  });

  const pruned = await jobsService.pruneOldJobs({
    batchSize: 10,
    completedRetentionDays: 1,
    deadRetentionDays: 1,
    now: new Date("2026-07-05T14:20:00.000Z"),
  });
  assert.equal(pruned.completed.deleted, 1, "job retention pruning should count deleted rows through the returning seam");
  assert.equal(pruned.deleted, 1);
  const remaining = await db.get("SELECT job_id FROM jobs WHERE job_id = :jobId;", {
    jobId: "conflict-identity-proof-job",
  });
  assert.equal(remaining, null, "job retention pruning should delete the completed proof row");
}

async function assertIntegrity() {
  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "conflict and identity seam regression database should pass integrity check");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
