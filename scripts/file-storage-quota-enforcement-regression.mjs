import assert from "node:assert/strict";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readTextAsync: readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-storage-quota-"));

process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-storage-quota.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "File-Storage-Quota-Test-123!";

const { config } = await import("../src/config.js");
const { filesService } = await import("../src/services/files.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await assertStaticContracts();
  await initializeDatabase();
  const session = await readSeedSession();
  const taskId = await createTask(session, "File storage quota task");

  await assertBufferedWorkspaceQuota(session, taskId);
  await assertBufferedPerUserQuota(session, taskId);
  await assertBufferedNullLimits(session, taskId);
  await assertStreamedWorkspaceQuota(session, taskId);
  await assertStreamedPerUserQuota(session, taskId);
  await assertStreamedNullLimits(session, taskId);
  await assertIntegrity();

  console.log("File storage quota enforcement regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} FilesSession */

/**
 * Narrow an upload envelope to the file record it must be carrying.
 *
 * The service publishes `file` as nullable because a refused upload produces
 * none, so every read through it here is a claim the quota admitted the upload.
 * @template {{ file: unknown }} Envelope
 * @param {Envelope} envelope
 * @param {string} label
 * @returns {NonNullable<Envelope["file"]>}
 */
function requireFile(envelope, label) {
  assert.ok(envelope.file, `${label} should carry its file record`);
  return envelope.file;
}

async function assertStaticContracts() {
  const [
    moduleContract,
    moduleDevelopment,
    runtimeDocs,
    filesServiceSource,
    filesStorageAccountingServiceSource,
    _regressionSuite,
  ] = await Promise.all([
    readText("docs/module-contract.md"),
    readText("docs/module-development.md"),
    readText("docs/runtime-configuration.md"),
    readText("src/services/files.service.js"),
    readText("src/services/files-storage-accounting.service.js"),
    readText("scripts/regression-legacy-snapshot.json"),
  ]);

  assert.match(moduleContract, /0\.33\.5\.25\.2[\s\S]*workspace and per-user storage quotas/, "module contract should describe service-owned quota enforcement");
  assert.match(moduleDevelopment, /0\.33\.5\.25\.2[\s\S]*workspace and per-user storage quotas/, "module development docs should describe service-owned quota enforcement");
  assert.match(runtimeDocs, /0\.33\.5\.25\.2[\s\S]*workspace and per-user storage quotas/, "runtime docs should describe active quota enforcement");
  assert.match(filesServiceSource, /filesStorageAccountingService\.assertStorageQuotaAllowsUpload/, "Files facade should enforce quotas through the Files accounting policy before buffered upload persistence");
  assert.match(filesServiceSource, /filesStorageAccountingService\.resolveStreamedUploadLimit/, "Files facade should enforce streamed limits through the Files accounting policy");
  assert.match(filesStorageAccountingServiceSource, /async function assertStorageQuotaAllowsUpload/, "Files accounting policy should own quota admission");
  assert.match(filesStorageAccountingServiceSource, /async function resolveStreamedUploadLimit/, "Files accounting policy should own streamed quota limits");
  assert.match(filesStorageAccountingServiceSource, /filesRepo\.readInternalStorageQuotaUsage/, "Files accounting policy should read actual internal usage through the repository");
  assert.doesNotMatch(filesStorageAccountingServiceSource, /storage[_A-Z]?key|protectedPath|scanner/i, "Files accounting policy should not consume storage keys, protected paths, or scanner details");
  }

/** @param {FilesSession} session @param {string} taskId */
async function assertBufferedWorkspaceQuota(session, taskId) {
  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: null, workspaceLimitBytes: 12 });

  const atLimit = await filesService.uploadAndAttach(session, bufferedPayload(taskId, {
    originalFilename: "buffered-workspace-at-limit.txt",
    text: "w".repeat(12),
  }));
  assert.equal(requireFile(atLimit, "at-limit upload").fileSizeBytes, 12, "workspace quota should allow an upload exactly at the limit");

  await assertRejectedUpload(
    () => filesService.uploadAndAttach(session, bufferedPayload(taskId, {
      originalFilename: "buffered-workspace-over-limit.txt",
      text: "x",
    })),
    /workspace storage quota/i,
    "workspace over-limit buffered upload should be rejected",
  );
  await assertNoFileOrAttachmentForOriginalFilename("buffered-workspace-over-limit.txt");
}

/** @param {FilesSession} session @param {string} taskId */
async function assertBufferedPerUserQuota(session, taskId) {
  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: 10, workspaceLimitBytes: null });

  const atLimit = await filesService.uploadAndAttach(session, bufferedPayload(taskId, {
    originalFilename: "buffered-user-at-limit.txt",
    text: "u".repeat(10),
  }));
  assert.equal(requireFile(atLimit, "at-limit upload").fileSizeBytes, 10, "per-user quota should allow an upload exactly at the limit");

  await assertRejectedUpload(
    () => filesService.uploadAndAttach(session, bufferedPayload(taskId, {
      originalFilename: "buffered-user-over-limit.txt",
      text: "x",
    })),
    /per-user storage quota/i,
    "per-user over-limit buffered upload should be rejected",
  );
  await assertNoFileOrAttachmentForOriginalFilename("buffered-user-over-limit.txt");
}

/** @param {FilesSession} session @param {string} taskId */
async function assertBufferedNullLimits(session, taskId) {
  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: null, workspaceLimitBytes: null });

  const upload = await filesService.uploadAndAttach(session, bufferedPayload(taskId, {
    originalFilename: "buffered-null-limits.txt",
    text: "n".repeat(64),
  }));
  assert.equal(requireFile(upload, "unlimited upload").fileSizeBytes, 64, "NULL workspace and per-user limits should remain unlimited for buffered uploads");
}

/** @param {FilesSession} session @param {string} taskId */
async function assertStreamedWorkspaceQuota(session, taskId) {
  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: null, workspaceLimitBytes: 6 });

  const atLimit = await filesService.uploadStreamAndAttach(session, streamedPayload(taskId, {
    originalFilename: "streamed-workspace-at-limit.txt",
    text: "s".repeat(6),
  }));
  assert.equal(requireFile(atLimit, "at-limit upload").fileSizeBytes, 6, "workspace quota should allow a streamed upload exactly at the limit");

  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: null, workspaceLimitBytes: 5 });
  const beforeFiles = await listStoredFiles(config.storage.localRoot);
  await assertRejectedUpload(
    () => filesService.uploadStreamAndAttach(session, streamedPayload(taskId, {
      chunks: ["w".repeat(3), "x".repeat(3)],
      originalFilename: "streamed-workspace-over-limit.txt",
    })),
    /workspace storage quota/i,
    "workspace over-limit streamed upload should be rejected",
  );
  await assertNoFileOrAttachmentForOriginalFilename("streamed-workspace-over-limit.txt");
  assert.deepEqual(
    await listStoredFiles(config.storage.localRoot),
    beforeFiles,
    "workspace over-limit streamed upload should clean up its partial local file",
  );
}

/** @param {FilesSession} session @param {string} taskId */
async function assertStreamedPerUserQuota(session, taskId) {
  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: 7, workspaceLimitBytes: null });

  const atLimit = await filesService.uploadStreamAndAttach(session, streamedPayload(taskId, {
    originalFilename: "streamed-user-at-limit.txt",
    text: "p".repeat(7),
  }));
  assert.equal(requireFile(atLimit, "at-limit upload").fileSizeBytes, 7, "per-user quota should allow a streamed upload exactly at the limit");

  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: 4, workspaceLimitBytes: null });
  const beforeFiles = await listStoredFiles(config.storage.localRoot);
  await assertRejectedUpload(
    () => filesService.uploadStreamAndAttach(session, streamedPayload(taskId, {
      chunks: ["p".repeat(2), "q".repeat(3)],
      originalFilename: "streamed-user-over-limit.txt",
    })),
    /per-user storage quota/i,
    "per-user over-limit streamed upload should be rejected",
  );
  await assertNoFileOrAttachmentForOriginalFilename("streamed-user-over-limit.txt");
  assert.deepEqual(
    await listStoredFiles(config.storage.localRoot),
    beforeFiles,
    "per-user over-limit streamed upload should clean up its partial local file",
  );
}

/** @param {FilesSession} session @param {string} taskId */
async function assertStreamedNullLimits(session, taskId) {
  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: null, workspaceLimitBytes: null });

  const upload = await filesService.uploadStreamAndAttach(session, streamedPayload(taskId, {
    originalFilename: "streamed-null-limits.txt",
    text: "z".repeat(64),
  }));
  assert.equal(requireFile(upload, "unlimited upload").fileSizeBytes, 64, "NULL workspace and per-user limits should remain unlimited for streamed uploads");
}

/** @param {FilesSession} session @param {{ perUserLimitBytes: number | null, workspaceLimitBytes: number | null }} limits */
async function saveStorageLimits(session, { perUserLimitBytes, workspaceLimitBytes }) {
  await filesService.saveWorkspaceFileSettings(session, {
    internalStorageLimitBytes: workspaceLimitBytes,
    perUserStorageLimitBytes: perUserLimitBytes,
  });
}

/** @param {() => Promise<unknown>} uploadFn @param {RegExp} messagePattern @param {string} description */
async function assertRejectedUpload(uploadFn, messagePattern, description) {
  await assert.rejects(
    uploadFn,
    (error) => {
      const denial = /** @type {{ message?: string, statusCode?: number }} */ (error);
      assert.equal(denial.statusCode, 413, description);
      assert.match(String(denial.message), messagePattern, description);
      return true;
    },
    description,
  );
}

/** @param {string} originalFilename */
async function assertNoFileOrAttachmentForOriginalFilename(originalFilename) {
  const fileRows = await querySql(`
SELECT file_id
FROM files
WHERE original_filename = ${sqlText(originalFilename)};
`);
  assert.equal(fileRows.length, 0, `${originalFilename} should not leave a file row`);

  const orphanRows = await querySql(`
SELECT COUNT(*) AS count
FROM file_attachments
LEFT JOIN files
  ON files.workspace_id = file_attachments.workspace_id
  AND files.file_id = file_attachments.file_id
WHERE files.file_id IS NULL;
`);
  assert.equal(Number(orphanRows[0].count), 0, "failed quota uploads should not leave orphaned attachments");
}

async function resetStoredFileRows() {
  await runSql(`
DELETE FROM file_attachments;
DELETE FROM files;
DELETE FROM file_storage_accounting
WHERE storage_kind = 'internal';
DELETE FROM jobs
WHERE job_type = 'file.scan';
`);
}

/** @param {string} targetId @param {{ chunks?: Array<Buffer | string>, displayName?: string, originalFilename?: string, text?: string }} [options] */
function bufferedPayload(targetId, options = {}) {
  return {
    contentBase64: Buffer.from(options.text || "buffered quota body").toString("base64"),
    displayName: options.displayName || options.originalFilename || "Quota Evidence",
    moduleId: "tasks",
    originalFilename: options.originalFilename || "quota-evidence.txt",
    targetId,
    targetType: "task",
    visibility: "private",
  };
}

/** @param {string} targetId @param {{ chunks?: Array<Buffer | string>, displayName?: string, originalFilename?: string, text?: string }} [options] */
function streamedPayload(targetId, options = {}) {
  const chunks = Array.isArray(options.chunks) && options.chunks.length > 0
    ? options.chunks
    : [options.text || "streamed quota body"];

  return {
    displayName: options.displayName || options.originalFilename || "Quota Evidence",
    fileStream: Readable.from(chunks.map((chunk) => Buffer.from(chunk))),
    filename: options.originalFilename || "quota-evidence.txt",
    mimeType: "text/plain",
    moduleId: "tasks",
    originalFilename: options.originalFilename || "quota-evidence.txt",
    targetId,
    targetType: "task",
    visibility: "private",
  };
}

/** @param {string} directory @returns {Promise<string[]>} */
async function listStoredFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    /** @type {string[]} */
    const files = [];

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        for (const nested of await listStoredFiles(fullPath)) {
          files.push(path.join(entry.name, nested).replaceAll("\\", "/"));
        }
      } else {
        files.push(entry.name);
      }
    }

    return files.sort();
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/** @returns {Promise<FilesSession>} */
async function readSeedSession() {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);
  /** @type {{ active_workspace_id: string, display_name: string, home_workspace_id: string, timezone: string, user_id: string, username: string }} */
  const user = requireFirstRow(rows, "protected super admin");
  assert.ok(user.user_id, "fresh database should seed a protected super admin");
  const workspaceId = user.active_workspace_id || user.home_workspace_id;

  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    ip_address: "127.0.0.1",
    password_change_required: false,
    session_mode: "normal",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: workspaceId,
  };
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

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

