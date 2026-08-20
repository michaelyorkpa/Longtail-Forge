export const regressionMeta = Object.freeze({
  id: "database.workspace-final-purge",
  area: "database",
  tier: "release-gate",
  tags: ["baseline-bypass", "database", "files", "jobs", "permissions", "sessions", "workspaces"],
  description: "Proves the operator-queued final workspace purge is deadline-exact, fenced, restart-resumable, artifact-complete, idempotent, and isolated from every retained workspace.",
  runMode: "isolated-database",
});

import { escapeRegExp } from "../../test-support/source-scan.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";
import { requireRow } from "../../test-support/database-row-assertions.mjs";

const fixture = await createDisposableDatabaseFixture("workspace-final-purge");
process.env.LONGTAIL_LOCAL_STORAGE_ROOT = path.join(fixture.root, "files");
process.env.LONGTAIL_WORKSPACE_BACKUP_ROOT = path.join(fixture.root, "workspace-backups");
process.env.SUPER_ADMIN_USERNAME = "workspace-purge-admin@example.test";
process.env.SUPER_ADMIN_PASSWORD = "Workspace-Purge-Admin-123!";

const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { db } = await import("../../../src/core/database.js");
const { enqueueJob } = await import("../../../src/core/jobs/job-queue.js");
const { apiKeysRepository } = await import("../../../src/repositories/api-keys.repo.js");
const { workspaceDeletionLifecycleRepository } = await import("../../../src/repositories/workspace-deletion-lifecycle.repo.js");
const { workspacesRepository } = await import("../../../src/repositories/workspaces.repo.js");
const { filesService } = await import("../../../src/services/files.service.js");
const {
  fingerprintWorkspaceId,
  WORKSPACE_PURGE_JOB_TYPE,
  workspacePurgeService,
} = await import("../../../src/services/workspace-purge.service.js");

const NOW = "2026-07-16T16:00:00.000Z";
const PURGE_AFTER = "2026-08-15T16:00:00.000Z";
const TARGET_USER_ID = "purge-target-only-user";
const TARGET_NAME = "Disposable Purge Target";
let targetWorkspaceId = "";

try {
  await initializeDatabase();
  /** @type {{ user_id: string, username: string }} */
  const admin = requireRow(await db.get("SELECT user_id, username FROM users WHERE username = :username;", {
    username: process.env.SUPER_ADMIN_USERNAME,
  }), "admin");
  /** @type {{ workspace_id: string }} */
  const retainedWorkspace = requireRow(await db.get("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;"), "retainedWorkspace");
  assert.ok(admin?.user_id && retainedWorkspace?.workspace_id);

  const target = await workspacesRepository.createWorkspace({
    ownerUser: admin,
    workspaceName: TARGET_NAME,
    workspaceType: "business",
  });
  targetWorkspaceId = target.workspaceId;
  await seedTargetIdentity(admin.user_id);
  const targetObject = await seedFileObject(targetWorkspaceId, TARGET_USER_ID, "target-purge-content");
  const retainedObject = await seedFileObject(retainedWorkspace.workspace_id, admin.user_id, "retained-content");
  const backupArtifact = path.join(process.env.LONGTAIL_WORKSPACE_BACKUP_ROOT, targetWorkspaceId, "purge-package.ltfworkspace.tgz");
  await fs.mkdir(path.dirname(backupArtifact), { recursive: true });
  await fs.writeFile(backupArtifact, "target backup artifact");
  await seedWorkspaceRecords(admin.user_id);
  await workspaceDeletionLifecycleRepository.create({
    noCurrentBackupAcknowledged: true,
    purgeAfter: PURGE_AFTER,
    requestedAt: NOW,
    requestedByUserId: admin.user_id,
    workspaceId: targetWorkspaceId,
  });

  const retainedBefore = await fingerprintWorkspaceRows(retainedWorkspace.workspace_id);
  const retainedBytesBefore = await fs.readFile(retainedObject.path);

  await assert.rejects(
    workspacePurgeService.queueWorkspacePurge({
      now: "2026-08-15T15:59:59.999Z",
      workspaceId: targetWorkspaceId,
    }),
    (error) => /** @type {{ message?: string, statusCode?: number }} */ (error)?.statusCode === 409 && /grace period has not ended/i.test(String(/** @type {{ message?: string }} */ (error).message)),
  );

  const queued = await workspacePurgeService.queueWorkspacePurge({
    now: PURGE_AFTER,
    source: "purge-regression",
    workspaceId: targetWorkspaceId,
  });
  assert.equal(queued.queued, true, "the exact grace deadline should be purge-eligible");
  assert.ok(queued.jobId);
  assert.equal(requireRow(await readJob(queued.jobId), "queued purge job").job_type, WORKSPACE_PURGE_JOB_TYPE);

  await db.run(`
INSERT INTO jobs (
  job_id, workspace_id, job_type, payload_json, status, priority, available_at,
  attempt_count, max_attempts, locked_at, locked_by, created_at, updated_at
)
VALUES (
  'purge-running-worker', :workspaceId, 'fixture.running', '{}', 'running', 1, :now,
  1, 3, :now, 'fixture-worker', :now, :now
);
`, { now: PURGE_AFTER, workspaceId: targetWorkspaceId });

  const job = { jobId: queued.jobId, workspaceId: targetWorkspaceId };
  const payload = { workspaceId: targetWorkspaceId };
  await assert.rejects(
    workspacePurgeService.handleWorkspacePurgeJob({ job, payload }, { now: PURGE_AFTER }),
    /workers are still draining/i,
    "purge should fence first, then wait for already-running workspace work",
  );
  assert.equal(requireRow(await db.get("SELECT status FROM workspaces WHERE workspace_id = :workspaceId;", { workspaceId: targetWorkspaceId }), "fenced workspace").status, "purging");
  const fenceIdentity = requireRow(await db.get(`
SELECT lifecycle.purge_token, tombstone.purge_tombstone_id
FROM workspace_deletion_lifecycle AS lifecycle
INNER JOIN workspace_purge_tombstones AS tombstone
  ON tombstone.workspace_fingerprint = :workspaceFingerprint
WHERE lifecycle.workspace_id = :workspaceId;
`, {
    workspaceFingerprint: fingerprintWorkspaceId(targetWorkspaceId),
    workspaceId: targetWorkspaceId,
  }), "fenceIdentity");
  assertUuidVersion(fenceIdentity?.purge_token, 4, "workspace purge fence identity");
  assertUuidVersion(fenceIdentity?.purge_tombstone_id, 7, "workspace purge tombstone row identity");
  assert.notEqual(fenceIdentity.purge_token, fenceIdentity.purge_tombstone_id, "purge fencing identity must stay independent from durable tombstone row identity");
  assert.equal(await count("sessions", "home_workspace_id = :workspaceId OR active_workspace_id = :workspaceId"), 0, "the fence should revoke target sessions atomically");
  assert.equal(await apiKeysRepository.readByHash("purge-key-hash"), null, "the fence should make target API keys unusable before deletion");
  assert.equal(await fileExists(targetObject.path), true, "artifacts stay intact until active workspace jobs drain");
  assert.equal((await enqueueJob({ jobType: "fixture.after-fence", workspaceId: targetWorkspaceId })).action, "skipped_workspace_unavailable");

  await db.run("UPDATE jobs SET status = 'completed', locked_at = NULL, locked_by = NULL WHERE job_id = 'purge-running-worker';");
  await assert.rejects(
    workspacePurgeService.handleWorkspacePurgeJob({ job, payload }, {
      now: PURGE_AFTER,
      hooks: { afterStorage: async () => { throw new Error("simulated process interruption"); } },
    }),
    /simulated process interruption/,
  );
  assert.equal(await fileExists(targetObject.path), false, "Files objects should be gone before database finalization");
  assert.equal(await fileExists(backupArtifact), false, "workspace backup artifacts should be gone before database finalization");
  assert.ok(await db.get("SELECT workspace_id FROM workspaces WHERE workspace_id = :workspaceId;", { workspaceId: targetWorkspaceId }), "an interruption should leave the fenced database scope retryable");
  assert.equal(requireRow(await readTombstone(), "tombstone").status, "in_progress");

  await closeDatabase();
  await initializeDatabase();
  const completed = await workspacePurgeService.handleWorkspacePurgeJob({ job, payload }, { now: PURGE_AFTER });
  assert.equal(completed.status, "complete");
  assert.ok(completed.databaseRowCount > 0);
  assert.equal(completed.fileObjectCount, 1);
  assert.equal(completed.fileObjectBytes, Buffer.byteLength("target-purge-content"));

  assert.equal(await db.get("SELECT workspace_id FROM workspaces WHERE workspace_id = :workspaceId;", { workspaceId: targetWorkspaceId }), null);
  assert.deepEqual(await readWorkspaceScopedResidue(), [], "no database table may retain the purged workspace scope");
  assert.equal(await fileExists(targetObject.path), false);
  assert.equal(await fileExists(backupArtifact), false);
  const retainedIdentity = requireRow(await db.get("SELECT username, home_workspace_id, active_workspace_id FROM users WHERE user_id = :userId;", { userId: TARGET_USER_ID }), "retainedIdentity");
  assert.equal(retainedIdentity.username, "purge-target-only@example.test");
  assert.equal(retainedIdentity.home_workspace_id, null);
  assert.equal(retainedIdentity.active_workspace_id, null);
  const recoveryQualification = await db.get(`
SELECT qualification_basis, qualification_source
FROM account_export_recovery_qualifications
WHERE user_id = :userId;
`, { userId: TARGET_USER_ID });
  assert.deepEqual(recoveryQualification, {
    qualification_basis: "former_workspace_administrator",
    qualification_source: "workspace_purge",
  }, "a purged last-workspace owner should retain only the workspace-free export-recovery qualification");

  assert.equal(await fingerprintWorkspaceRows(retainedWorkspace.workspace_id), retainedBefore, "another workspace's database rows must remain byte-for-byte equivalent");
  assert.deepEqual(await fs.readFile(retainedObject.path), retainedBytesBefore, "another workspace's Files bytes must be unchanged");

  const tombstoneBefore = requireRow(await readTombstone(), "tombstoneBefore");
  const repeated = await workspacePurgeService.handleWorkspacePurgeJob({ job, payload }, { now: PURGE_AFTER });
  assert.equal(repeated.alreadyComplete, true);
  assert.deepEqual(await readTombstone(), tombstoneBefore, "a completed purge must be exactly-once and side-effect free on retry");
  assert.doesNotMatch(JSON.stringify(tombstoneBefore), new RegExp(escapeRegExp(targetWorkspaceId)));
  assert.doesNotMatch(JSON.stringify(tombstoneBefore), new RegExp(escapeRegExp(TARGET_NAME)));
  assert.equal(tombstoneBefore.workspace_fingerprint, fingerprintWorkspaceId(targetWorkspaceId));

  assert.deepEqual(await db.query("PRAGMA foreign_key_check;"), []);
  assert.deepEqual(await db.query("PRAGMA integrity_check;"), [{ integrity_check: "ok" }]);
  console.log("Workspace final purge regression passed.");
} finally {
  await closeDatabase();
  await fixture.cleanup();
}

/** @param {string} adminUserId */
async function seedTargetIdentity(adminUserId) {
  await db.run(`
INSERT INTO users (
  user_id, home_workspace_id, username, display_name, timezone, password, theme_mode,
  user_status, protected_user, active_workspace_id
)
VALUES (
  :userId, :workspaceId, 'purge-target-only@example.test', 'Retained Attribution',
  'America/New_York', 'retained-password-hash', 'light', 'active', 'no', :workspaceId
);
`, { userId: TARGET_USER_ID, workspaceId: targetWorkspaceId });
  await db.run(`
INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES ('purge-target-only-membership', :userId, :workspaceId, 'active', :now, :now);
`, { now: NOW, userId: TARGET_USER_ID, workspaceId: targetWorkspaceId });
  await db.run("UPDATE workspaces SET owner_user_id = :userId WHERE workspace_id = :workspaceId;", {
    userId: TARGET_USER_ID,
    workspaceId: targetWorkspaceId,
  });
  assert.ok(adminUserId);
}

/** @param {string} workspaceId @param {string} uploadedByUserId @param {string} content */
async function seedFileObject(workspaceId, uploadedByUserId, content) {
  const adapter = filesService.getFileStorageAdapter("local");
  if (typeof adapter.resolveStoragePath !== "function") throw new Error("Local storage adapter should resolve protected paths.");
  const stored = await adapter.save(Buffer.from(content), { workspaceId });
  const fileId = `purge-file-${createHash("sha256").update(workspaceId).digest("hex").slice(0, 12)}`;
  await db.run(`
INSERT INTO files (
  file_id, workspace_id, storage_provider, storage_key, original_filename, stored_filename,
  display_name, extension, mime_type_claimed, mime_type_detected, file_size_bytes, sha256_hash,
  status, scan_status, uploaded_by_user_id, created_at, updated_at, storage_kind,
  external_availability_status, external_reported_bytes
)
VALUES (
  :fileId, :workspaceId, 'local', :storageKey, 'purge.txt', :storedFilename,
  'Purge fixture', '.txt', 'text/plain', 'text/plain', :fileSizeBytes, :sha256Hash,
  'available', 'passed', :uploadedByUserId, :now, :now, 'internal', 'not_external', 0
);
`, {
    fileId,
    fileSizeBytes: Buffer.byteLength(content),
    now: NOW,
    sha256Hash: createHash("sha256").update(content).digest("hex"),
    storageKey: stored.storageKey,
    storedFilename: stored.storedFilename,
    uploadedByUserId,
    workspaceId,
  });
  return { path: adapter.resolveStoragePath(stored.storageKey), storageKey: stored.storageKey };
}

/** @param {string} adminUserId */
async function seedWorkspaceRecords(adminUserId) {
  await db.run(`
INSERT INTO notifications (
  notification_id, workspace_id, event_type, recipient_user_id, title, body, status,
  priority, created_at, metadata_json
)
VALUES ('purge-notification', :workspaceId, 'fixture', :userId, 'Purge me', '', 'unread', 'normal', :now, '{}');
`, { now: NOW, userId: TARGET_USER_ID, workspaceId: targetWorkspaceId });
  await db.run(`
INSERT INTO search_index (
  search_index_id, workspace_id, module_id, record_type, record_id, title, summary,
  body, tags_text, visibility, record_status, source, indexed_at
)
VALUES ('purge-search', :workspaceId, 'tasks', 'task', 'purge-record', 'Purge search', '', 'secret purge body', '', 'workspace', 'active', 'fixture', :now);
`, { now: NOW, workspaceId: targetWorkspaceId });
  await db.run(`
INSERT INTO api_keys (
  api_key_id, workspace_id, created_by_user_id, name, key_hash, key_prefix, status, created_at
)
VALUES ('purge-api-key', :workspaceId, :userId, 'Purge key', 'purge-key-hash', 'ltf_purge', 'active', :now);
`, { now: NOW, userId: TARGET_USER_ID, workspaceId: targetWorkspaceId });
  await db.run("INSERT INTO api_key_scopes (api_key_id, scope) VALUES ('purge-api-key', 'tasks:read');");
  await db.run(`
INSERT INTO sessions (
  session_id, home_workspace_id, active_workspace_id, user_id, username, timezone,
  expires_at, created_at, updated_at
)
VALUES ('purge-session', :workspaceId, :workspaceId, :userId, 'purge-target-only@example.test', 'America/New_York', '2027-01-01T00:00:00.000Z', :now, :now);
`, { now: NOW, userId: TARGET_USER_ID, workspaceId: targetWorkspaceId });
  assert.ok(adminUserId);
}

/** @param {string} workspaceId */
async function fingerprintWorkspaceRows(workspaceId) {
  const tables = await workspaceTables();
  /** @type {Record<string, unknown>} */
  const snapshot = {};
  for (const tableName of tables) {
    const quoted = quoteIdentifier(tableName);
    snapshot[/** @type {string} */ (tableName)] = await db.query(`SELECT * FROM ${quoted} WHERE workspace_id = :workspaceId ORDER BY rowid;`, { workspaceId });
  }
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

async function readWorkspaceScopedResidue() {
  const residue = [];
  for (const tableName of await workspaceTables()) {
    const countValue = await count(tableName, "workspace_id = :workspaceId");
    if (countValue > 0) residue.push({ count: countValue, tableName });
  }
  return residue;
}

async function workspaceTables() {
  const tables = await db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;");
  const result = [];
  for (const { name } of /** @type {Array<{ name: string }>} */ (tables)) {
    const columns = await db.query(`PRAGMA table_info(${quoteIdentifier(name)});`);
    if (columns.some((column) => column.name === "workspace_id")) result.push(name);
  }
  return result;
}

/** @param {string} tableName @param {string} whereClause */
async function count(tableName, whereClause) {
  const row = await db.get(`SELECT COUNT(1) AS count FROM ${quoteIdentifier(tableName)} WHERE ${whereClause};`, {
    workspaceId: targetWorkspaceId,
  });
  return Number(row?.count) || 0;
}

/** @param {string} jobId */
async function readJob(jobId) {
  return db.get("SELECT * FROM jobs WHERE job_id = :jobId;", { jobId });
}

async function readTombstone() {
  return db.get("SELECT * FROM workspace_purge_tombstones WHERE workspace_fingerprint = :fingerprint;", {
    fingerprint: fingerprintWorkspaceId(targetWorkspaceId),
  });
}

/** @param {string} filePath */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} value @returns {string} */
function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

/** @param {unknown} value @param {number} expectedVersion @param {string} label */
function assertUuidVersion(value, expectedVersion, label) {
  assert.match(String(value || ""), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, `${label} should be a canonical UUID`);
  assert.equal(String(value)[14], String(expectedVersion), `${label} should use UUIDv${expectedVersion}`);
}
