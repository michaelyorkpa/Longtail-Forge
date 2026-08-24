import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProjectTextReader, extractFunctionBlock } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-files-lifecycle-settings-quota-conversion-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-files-lifecycle-settings-quota-conversion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Files-Lifecycle-Settings-Quota-Conversion-Test-123!";

const filesServiceSource = readText("src/services/files.service.js");
const filesStorageAccountingServiceSource = readText("src/services/files-storage-accounting.service.js");
const filesRepositorySource = readText("src/repositories/files.repo.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} FilesSession */

/**
 * Narrow an envelope to the file record it must be carrying.
 *
 * The service publishes `file` as nullable because a refused upload or an
 * unrecoverable file produces none, so every read through it here is a claim
 * the lifecycle step succeeded.
 * @template {{ file: unknown }} Envelope
 * @param {Envelope} envelope
 * @param {string} label
 * @returns {NonNullable<Envelope["file"]>}
 */
function requireFile(envelope, label) {
  assert.ok(envelope.file, `${label} should carry its file record`);
  return envelope.file;
}

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { filesService, handleFileScanJob } = await import("../src/services/files.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);
  const taskId = await createTask(session, "Files Lifecycle Conversion Task");

  await assertLifecycleSettingsQuotaRuntime(session, taskId);
  await assertIntegrity();

  console.log("Files lifecycle, settings, quota, and accounting conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {

  assert.match(filesServiceSource, /filesRepo.*from "\.\.\/repositories\/files\.repo\.js"/, "Files service should delegate persistence to the Files repository");
  assert.match(filesRepositorySource, /import \{ db \} from "\.\.\/core\/database\.js";/, "Files repository should import only the provider-neutral db facade");
  assert.doesNotMatch(filesServiceSource, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "Files service should be fully off literal helpers and compatibility query wrappers");
  assert.doesNotMatch(filesServiceSource, /\bdb\.(?:query|get|run|dialect)\b|\b(?:SELECT|INSERT|UPDATE|DELETE)\b/, "Files service should keep SQL and dialect query construction in the repository");

  assertFunctionUsesNamedParams(filesRepositorySource, "removeAttachment", [
    /db\.run\(`/,
    /SET removed_at = :removedAt/,
    /file_attachment_id = :attachmentId/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "softDeleteFile", [
    /db\.run\(`/,
    /SET status = 'deleted'/,
    /deleted_at = :deletedAt/,
    /metadata_json = :metadataJson/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "restoreFile", [
    /db\.run\(`/,
    /SET status = :fileStatus/,
    /deleted_at = NULL/,
    /metadata_json = :metadataJson/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "markQuarantinedFileReviewed", [
    /db\.run\(`/,
    /SET status = 'available'/,
    /quarantine_reason = NULL/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "readStorageAccounting", [
    /const conditions = \["workspace_id = :workspaceId"\]/,
    /await db\.query\(`/,
    /storage_kind = :storageKind/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "upsertExternalStorageAccounting", [
    /db\.dialect\.conflict\.buildInsertOnConflictDoUpdate/,
    /tableName: "file_storage_accounting"/,
    /external_reported_bytes: ":externalReportedBytes"/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "saveWorkspaceFileSettings", [
    /db\.dialect\.conflict\.buildInsertOnConflictDoUpdate/,
    /tableName: "file_workspace_settings"/,
    /internal_storage_limit_bytes: ":internalStorageLimitBytes"/,
    /per_user_storage_limit_bytes: ":perUserStorageLimitBytes"/,
  ]);
  assertFunctionUsesNamedParams(filesServiceSource, "reportFile", [
    /await db\.transaction\(async \(transaction\) => \{/,
    /filesRepo\.createFileReport\(transaction/,
    /filesRepo\.markFileReported\(transaction/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "createFileReport", [
    /transaction\.run\(`/,
    /INSERT INTO file_reports/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "markFileReported", [
    /UPDATE files/,
    /status != 'deleted'/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "quarantineFile", [
    /db\.run\(`/,
    /SET status = 'quarantined'/,
    /quarantine_reason = :quarantineReason/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "createFile", [
    /db\.run\(`/,
    /INSERT INTO files/,
    /:storageProvider/,
    /:metadataJson/,
  ]);
  assertFunctionUsesNamedParams(filesStorageAccountingServiceSource, "refreshStorageAccounting", [
    /await db\.transaction\(async \(transaction\) => \{/,
    /filesRepo\.replaceInternalStorageAccounting\(transaction/,
  ]);
  assertFunctionUsesNamedParams(filesServiceSource, "refreshStorageAccounting", [
    /filesStorageAccountingService\.refreshStorageAccounting\(workspaceId\)/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "replaceInternalStorageAccounting", [
    /DELETE FROM file_storage_accounting/,
    /status IN \(:storageStatuses\)/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "updateScanResult", [
    /db\.run\(`/,
    /scan_status = :scanStatus/,
    /quarantine_reason = :quarantineReason/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "createAttachment", [
    /db\.run\(`/,
    /INSERT INTO file_attachments/,
    /:attachmentRole/,
    /:metadataJson/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "readInternalStorageQuotaUsage", [
    /db\.get\(`/,
    /uploaded_by_user_id = :userId/,
    /status IN \(:storageStatuses\)/,
  ]);
  assert.match(filesStorageAccountingServiceSource, /async function readStorageQuotaState[\s\S]*filesRepo\.readInternalStorageQuotaUsage/, "Files accounting policy should own quota-state calculation over repository usage");
  assert.match(filesStorageAccountingServiceSource, /function summarizeStorageAccounting/, "Files accounting policy should own accounting totals");
  assert.match(filesStorageAccountingServiceSource, /function storageAccountingId/, "Files accounting policy should own external-accounting identity");
  assert.doesNotMatch(filesServiceSource, /function (?:readStorageQuotaState|readStorageQuotaUploadLimit|shapeStorageAccountingRow|storageAccountingId|summarizeStorageAccounting)/, "Files facade should not retain duplicate accounting or quota calculations");
  assertFunctionUsesNamedParams(filesRepositorySource, "readWorkspaceFileSettings", [
    /db\.get\(`/,
    /WHERE workspace_id = :workspaceId/,
  ]);
  assertFunctionUsesNamedParams(filesRepositorySource, "createWorkspaceFileSettingsIfMissing", [
    /db\.dialect\.conflict\.buildInsertOrIgnore/,
  ]);

  assert.match(auditDocs, /## Baseline-driven workflow[\s\S]*npm run audit:params:check[\s\S]*Do not update the baseline in unrelated feature work/, "audit docs should record the current baseline-driven parameter-binding ratchet");
  assert.match(auditDocs, /\| services\/files\.service \| Converted \| 0 \| 0 \| 32 \| 33 \|/, "audit inventory should mark Files service fully converted");
  assert.match(auditDocs, /0\.33\.5\.27\.20 Files Lifecycle, Settings, Quota, and Accounting Conversion[\s\S]*`services\/files\.service` is fully converted[\s\S]*586 runtime literal-helper invocations[\s\S]*123 direct interpolated SQL operation sites[\s\S]*231 existing bound operation sites/, "audit docs should record the Files lifecycle/settings/quota conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.20[\s\S]*`services\/files\.service` is fully converted[\s\S]*586 remaining helper invocations/, "database docs should record the concrete Files lifecycle/settings/quota conversion");
  }

/** @param {string} source @param {string} functionName @param {RegExp[]} patterns */
function assertFunctionUsesNamedParams(source, functionName, patterns) {
  const block = extractFunctionBlock(source, functionName);

  for (const pattern of patterns) {
    assert.match(block, pattern, `${functionName} should include ${pattern}`);
  }
}

/** @param {FilesSession} session @param {string} taskId */
async function assertLifecycleSettingsQuotaRuntime(session, taskId) {
  const settingsResult = await filesService.saveWorkspaceFileSettings(session, {
    allowedExtensions: [".txt", ".md"],
    blockedExtensions: [".exe"],
    fileTypePolicyMode: "allowlist",
    internalStorageLimitBytes: 4096,
    perUserStorageLimitBytes: 4096,
  });
  assert.equal(settingsResult.settings.fileTypePolicyMode, "allowlist");
  assert.equal(settingsResult.settings.internalStorageLimitBytes, 4096);
  assert.equal(settingsResult.settings.perUserStorageLimitBytes, 4096);

  const upload = await filesService.uploadAndAttach(session, {
    contentBase64: Buffer.from("Files lifecycle conversion body").toString("base64"),
    displayName: "files-lifecycle-conversion.txt",
    moduleId: "tasks",
    originalFilename: "files-lifecycle-conversion.txt",
    targetId: taskId,
    targetType: "task",
    visibility: "private",
  });
  const uploadedFile = requireFile(upload, "lifecycle conversion upload");
  assert.equal(uploadedFile.status, "pending", "new file records should keep pending upload lifecycle state");
  assert.equal(upload.attachment.targetId, taskId, "attachments should keep target context");
  assertNoStorageLeak(upload);

  await handleFileScanJob({
    payload: {
      fileId: uploadedFile.fileId,
      requestedByUserId: session.user_id,
      workspaceId: session.workspace_id,
    },
  });

  let fileRow = await readFileRow(uploadedFile.fileId);
  assert.equal(fileRow.status, "available");
  assert.equal(fileRow.scan_status, "not_required");

  let accounting = await filesService.readStorageAccounting(session);
  assert.equal(accounting.totals.internalFileCount, 1);
  assert.equal(accounting.entries.some((entry) => entry.storageKind === "internal" && entry.availabilityStatus === "available"), true);
  assertNoStorageLeak(accounting);

  await filesService.recordExternalStorageAccounting(session, {
    availabilityStatus: "available",
    externalReportedBytes: 1234,
    externalSourceProvider: "conversion-proof-drive",
    fileCount: 2,
  });
  const externalAccounting = await filesService.readStorageAccounting(session, { storageKind: "external" });
  assert.equal(externalAccounting.totals.externalReportedBytes, 1234);
  assert.equal(externalAccounting.entries[0].externalSourceProvider, "conversion-proof-drive");

  const reported = await filesService.reportFile(session, uploadedFile.fileId, {
    attachmentId: upload.attachment.fileAttachmentId,
    notes: "Bound report conversion proof",
    reason: "security",
  });
  assert.equal(requireFile(reported, "reported lifecycle step").status, "quarantined");
  assert.equal(reported.report.reason, "security");
  fileRow = await readFileRow(uploadedFile.fileId);
  assert.equal(fileRow.quarantine_reason, "reported:security");
  assert.equal(await countFileReports(uploadedFile.fileId), 1);

  const reviewed = await filesService.restoreFile(session, uploadedFile.fileId);
  assert.equal(requireFile(reviewed, "reviewed lifecycle step").status, "available", "review restore should keep passed/not-required files available");

  const quarantined = await filesService.quarantineFile(session, uploadedFile.fileId, { reason: "manual_review" });
  assert.equal(requireFile(quarantined, "quarantined lifecycle step").status, "quarantined");
  fileRow = await readFileRow(uploadedFile.fileId);
  assert.equal(fileRow.quarantine_reason, "manual_review");

  const restoredFromReview = await filesService.restoreFile(session, uploadedFile.fileId);
  assert.equal(requireFile(restoredFromReview, "restoredFromReview lifecycle step").status, "available");

  const deleted = await filesService.deleteFile(session, uploadedFile.fileId);
  assert.equal(requireFile(deleted, "deleted lifecycle step").status, "deleted");
  fileRow = await readFileRow(uploadedFile.fileId);
  assert.equal(fileRow.status, "deleted");
  assert.ok(fileRow.deleted_at, "delete lifecycle should stamp deleted_at");

  const restored = await filesService.restoreFile(session, uploadedFile.fileId);
  assert.equal(requireFile(restored, "restored lifecycle step").status, "available");
  fileRow = await readFileRow(uploadedFile.fileId);
  assert.equal(fileRow.status, "available");
  assert.equal(fileRow.deleted_at, null);

  const removed = await filesService.removeAttachment(session, upload.attachment.fileAttachmentId);
  assert.ok(removed.attachment.removedAt, "attachment removal should return the removal timestamp");
  const attachmentRows = await querySql(`
SELECT removed_at
FROM file_attachments
WHERE file_attachment_id = ${sqlText(upload.attachment.fileAttachmentId)};
`);
  assert.ok(attachmentRows[0]?.removed_at, "attachment removal should persist removed_at");

  accounting = await filesService.readStorageAccounting(session);
  assert.equal(accounting.totals.internalBytes, Buffer.byteLength("Files lifecycle conversion body"));
  assert.equal(accounting.entries.some((entry) => entry.storageKind === "internal" && entry.availabilityStatus === "available"), true);
}

/** @param {FilesSession} session @param {string} title */
async function createTask(session, title) {
  const taskId = randomUUID();
  const now = new Date().toISOString();
  await runSql(`
INSERT INTO tasks (
  task_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  status,
  priority,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(taskId)},
  ${sqlText(session.workspace_id)},
  NULL,
  NULL,
  ${sqlText(title)},
  '',
  'open',
  'normal',
  ${sqlText(session.user_id)},
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
  return taskId;
}

async function readWorkspace() {
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);

  /** @type {{ workspace_id: string }} */
  const workspace = requireFirstRow(rows, "workspace");
  assert.ok(workspace.workspace_id, "workspace should exist");
  return workspace;
}

/** @param {string} workspaceId @returns {Promise<FilesSession>} */
async function readProtectedSession(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  /** @type {{ display_name: string, timezone: string, user_id: string, username: string }} */
  const admin = requireFirstRow(rows, "protected user");
  assert.ok(admin.user_id, "protected user should exist");
  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    ip_address: "127.0.0.1",
    password_change_required: false,
    session_mode: "normal",
    timezone: admin.timezone || "America/New_York",
    user_id: admin.user_id,
    username: admin.username,
    workspace_id: workspaceId,
  };
}

/** @param {string} fileId */
async function readFileRow(fileId) {
  const rows = await querySql(`
SELECT status, scan_status, quarantine_reason, deleted_at
FROM files
WHERE file_id = ${sqlText(fileId)}
LIMIT 1;
`);

  assert.ok(rows[0], "file row should exist");
  return rows[0];
}

/** @param {string} fileId */
async function countFileReports(fileId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM file_reports
WHERE file_id = ${sqlText(fileId)};
`);

  return Number(rows[0]?.count || 0);
}

/** @param {unknown} value */
function assertNoStorageLeak(value) {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /storage_key/i);
  assert.doesNotMatch(text, /storageKey/i);
  assert.doesNotMatch(text, /storage_path/i);
  assert.doesNotMatch(text, /storagePath/i);
  assert.doesNotMatch(text, /protected[\\/]/i);
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok", "SQLite integrity check should pass");
}
