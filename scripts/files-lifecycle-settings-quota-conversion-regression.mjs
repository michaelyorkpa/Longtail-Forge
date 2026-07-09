import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.12f";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-files-lifecycle-settings-quota-conversion-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-files-lifecycle-settings-quota-conversion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Files-Lifecycle-Settings-Quota-Conversion-Test-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const filesServiceSource = readText("src/services/files.service.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

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
  assert.equal(packageJson.version, appVersion, "package.json should report the Files lifecycle/settings/quota conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Files lifecycle/settings/quota conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Files lifecycle/settings/quota conversion version");

  assert.match(filesServiceSource, /import \{ db \} from "\.\.\/core\/database\.js";/, "Files service should import only the provider-neutral db facade");
  assert.doesNotMatch(filesServiceSource, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "Files service should be fully off literal helpers and compatibility query wrappers");

  assertFunctionUsesNamedParams("removeAttachment", [
    /await db\.run\(`/,
    /SET removed_at = :removedAt/,
    /file_attachment_id = :attachmentId/,
  ]);
  assertFunctionUsesNamedParams("deleteFile", [
    /await db\.run\(`/,
    /SET status = :fileStatus/,
    /deleted_at = :deletedAt/,
    /metadata_json = :metadataJson/,
  ]);
  assertFunctionUsesNamedParams("restoreFile", [
    /await db\.run\(`/,
    /SET status = :fileStatus/,
    /deleted_at = NULL/,
    /metadata_json = :metadataJson/,
  ]);
  assertFunctionUsesNamedParams("markQuarantinedFileReviewed", [
    /await db\.run\(`/,
    /SET status = :fileStatus/,
    /quarantine_reason = NULL/,
  ]);
  assertFunctionUsesNamedParams("readStorageAccounting", [
    /const conditions = \["workspace_id = :workspaceId"\]/,
    /const rows = await db\.query\(`/,
    /storage_kind = :storageKind/,
  ]);
  assertFunctionUsesNamedParams("recordExternalStorageAccounting", [
    /db\.dialect\.conflict\.buildInsertOnConflictDoUpdate/,
    /tableName: "file_storage_accounting"/,
    /external_reported_bytes: ":externalReportedBytes"/,
  ]);
  assertFunctionUsesNamedParams("saveWorkspaceFileSettings", [
    /db\.dialect\.conflict\.buildInsertOnConflictDoUpdate/,
    /tableName: "file_workspace_settings"/,
    /internal_storage_limit_bytes: ":internalStorageLimitBytes"/,
    /per_user_storage_limit_bytes: ":perUserStorageLimitBytes"/,
  ]);
  assertFunctionUsesNamedParams("reportFile", [
    /await db\.transaction\(async \(transaction\) => \{/,
    /await transaction\.run\(`/,
    /INSERT INTO file_reports/,
    /UPDATE files/,
    /status != :deletedStatus/,
  ]);
  assertFunctionUsesNamedParams("quarantineFile", [
    /await db\.run\(`/,
    /SET status = :fileStatus/,
    /quarantine_reason = :quarantineReason/,
  ]);
  assertFunctionUsesNamedParams("createFileRecord", [
    /await db\.run\(`/,
    /INSERT INTO files/,
    /:storageProvider/,
    /:metadataJson/,
  ]);
  assertFunctionUsesNamedParams("refreshStorageAccounting", [
    /await db\.transaction\(async \(transaction\) => \{/,
    /DELETE FROM file_storage_accounting/,
    /status IN \(:storageStatuses\)/,
  ]);
  assertFunctionUsesNamedParams("scanFile", [
    /await db\.run\(`/,
    /scan_status = :scanStatus/,
    /quarantine_reason = :quarantineReason/,
  ]);
  assertFunctionUsesNamedParams("attachFile", [
    /await db\.run\(`/,
    /INSERT INTO file_attachments/,
    /:attachmentRole/,
    /:metadataJson/,
  ]);
  assertFunctionUsesNamedParams("readInternalStorageQuotaUsage", [
    /const row = await db\.get\(`/,
    /uploaded_by_user_id = :userId/,
    /status IN \(:storageStatuses\)/,
  ]);
  assertFunctionUsesNamedParams("readWorkspaceFileSettingsForWorkspace", [
    /const row = await db\.get\(`/,
    /WHERE workspace_id = :workspaceId/,
    /db\.dialect\.conflict\.buildInsertOrIgnore/,
  ]);

  assert.match(auditDocs, /Current totals as of 0\.33\.6\.10b:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 388[\s\S]*Total runtime database operation calls seen by the audit scanner: 432/, "audit docs should record the Files lifecycle/settings/quota conversion ratchet");
  assert.match(auditDocs, /\| services\/files\.service \| Converted \| 0 \| 0 \| 32 \| 33 \|/, "audit inventory should mark Files service fully converted");
  assert.match(auditDocs, /0\.33\.5\.27\.20 Files Lifecycle, Settings, Quota, and Accounting Conversion[\s\S]*`services\/files\.service` is fully converted[\s\S]*586 runtime literal-helper invocations[\s\S]*123 direct interpolated SQL operation sites[\s\S]*231 existing bound operation sites/, "audit docs should record the Files lifecycle/settings/quota conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.20[\s\S]*`services\/files\.service` is fully converted[\s\S]*586 remaining helper invocations/, "database docs should record the concrete Files lifecycle/settings/quota conversion");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.20 - Conversion wave: Files lifecycle, settings, quota, and accounting[\s\S]*- \[x\] Convert the remaining `services\/files\.service` lifecycle writes[\s\S]*- \[x\] Preserve upload lifecycle[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.20 - [\s\S]*Files lifecycle, settings, quota, and accounting conversion[\s\S]*586 helper invocations[\s\S]*123 direct interpolated operation sites[\s\S]*231 bound operation sites/, "changelog should record the Files lifecycle/settings/quota conversion burndown");
  assert.match(regressionSuite, /scripts\/files-lifecycle-settings-quota-conversion-regression\.mjs/, "regression suite should include the Files lifecycle/settings/quota conversion proof");
}

function assertFunctionUsesNamedParams(functionName, patterns) {
  const block = functionBlock(filesServiceSource, functionName);

  for (const pattern of patterns) {
    assert.match(block, pattern, `${functionName} should include ${pattern}`);
  }
}

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
  assert.equal(upload.file.status, "pending", "new file records should keep pending upload lifecycle state");
  assert.equal(upload.attachment.targetId, taskId, "attachments should keep target context");
  assertNoStorageLeak(upload);

  await handleFileScanJob({
    payload: {
      fileId: upload.file.fileId,
      requestedByUserId: session.user_id,
      workspaceId: session.workspace_id,
    },
  });

  let fileRow = await readFileRow(upload.file.fileId);
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

  const reported = await filesService.reportFile(session, upload.file.fileId, {
    attachmentId: upload.attachment.fileAttachmentId,
    notes: "Bound report conversion proof",
    reason: "security",
  });
  assert.equal(reported.file.status, "quarantined");
  assert.equal(reported.report.reason, "security");
  fileRow = await readFileRow(upload.file.fileId);
  assert.equal(fileRow.quarantine_reason, "reported:security");
  assert.equal(await countFileReports(upload.file.fileId), 1);

  const reviewed = await filesService.restoreFile(session, upload.file.fileId);
  assert.equal(reviewed.file.status, "available", "review restore should keep passed/not-required files available");

  const quarantined = await filesService.quarantineFile(session, upload.file.fileId, { reason: "manual_review" });
  assert.equal(quarantined.file.status, "quarantined");
  fileRow = await readFileRow(upload.file.fileId);
  assert.equal(fileRow.quarantine_reason, "manual_review");

  const restoredFromReview = await filesService.restoreFile(session, upload.file.fileId);
  assert.equal(restoredFromReview.file.status, "available");

  const deleted = await filesService.deleteFile(session, upload.file.fileId);
  assert.equal(deleted.file.status, "deleted");
  fileRow = await readFileRow(upload.file.fileId);
  assert.equal(fileRow.status, "deleted");
  assert.ok(fileRow.deleted_at, "delete lifecycle should stamp deleted_at");

  const restored = await filesService.restoreFile(session, upload.file.fileId);
  assert.equal(restored.file.status, "available");
  fileRow = await readFileRow(upload.file.fileId);
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

  assert.ok(rows[0]?.workspace_id, "workspace should exist");
  return rows[0];
}

async function readProtectedSession(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  assert.ok(rows[0]?.user_id, "protected user should exist");
  return {
    active_workspace_id: workspaceId,
    display_name: rows[0].display_name,
    timezone: rows[0].timezone || "America/New_York",
    user_id: rows[0].user_id,
    username: rows[0].username,
    workspace_id: workspaceId,
  };
}

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

async function countFileReports(fileId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM file_reports
WHERE file_id = ${sqlText(fileId)};
`);

  return Number(rows[0]?.count || 0);
}

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

function functionBlock(source, functionName) {
  const pattern = new RegExp(`(?:async\\s+)?function ${functionName}\\s*\\([^)]*\\)\\s*\\{`);
  const match = pattern.exec(source);
  assert.ok(match, `${functionName} should exist`);

  const bodyStart = match.index + match[0].lastIndexOf("{");
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(match.index, index + 1);
      }
    }
  }

  throw new Error(`Could not extract function ${functionName}`);
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
