import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.12n";
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

async function assertStaticContracts() {
  const [
    packageJson,
    packageLock,
    roadmap,
    changelog,
    moduleContract,
    moduleDevelopment,
    runtimeDocs,
    filesServiceSource,
    regressionSuite,
  ] = await Promise.all([
    readJson("package.json"),
    readJson("package-lock.json"),
    readText("ROADMAP.md"),
    readText("CHANGELOG.md"),
    readText("docs/module-contract.md"),
    readText("docs/module-development.md"),
    readText("docs/runtime-configuration.md"),
    readText("src/services/files.service.js"),
    readText("scripts/regression-suite.mjs"),
  ]);

  assert.equal(packageJson.version, appVersion, "package.json should report the quota enforcement version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the quota enforcement version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the quota enforcement version");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the quota enforcement slice");
  assert.match(changelog, /Version 0\.33\.5\.25\.2[\s\S]*Activated workspace and per-user Files storage quota enforcement/, "changelog should preserve the shipped quota enforcement history");
  assert.match(roadmap, /^Active cursor: `0\.33\.6`\. Completed `0\.33\.5\.29` is archived in `ROADMAP-ARCHIVE\.md`\./m, "live roadmap should record the archived 0.33.5.29 handoff");
  assert.match(roadmap, /^## Version 0\.33\.6 - Dashboard and Workbench Formalization as Project hub and work center/m, "live roadmap should hand off after the completed storage cleanup, parameter-binding gap review, database extraction contract, and parameter-binding gap closeout branches");
  assert.match(moduleContract, /0\.33\.5\.25\.2[\s\S]*workspace and per-user storage quotas/, "module contract should describe service-owned quota enforcement");
  assert.match(moduleDevelopment, /0\.33\.5\.25\.2[\s\S]*workspace and per-user storage quotas/, "module development docs should describe service-owned quota enforcement");
  assert.match(runtimeDocs, /0\.33\.5\.25\.2[\s\S]*workspace and per-user storage quotas/, "runtime docs should describe active quota enforcement");
  assert.match(filesServiceSource, /assertStorageQuotaAllowsUpload/, "Files service should enforce quotas before buffered upload persistence");
  assert.match(filesServiceSource, /resolveStreamedUploadLimit/, "Files service should enforce quota limits while streaming");
  assert.match(filesServiceSource, /readInternalStorageQuotaUsage/, "Files service should read actual internal usage for quota checks");
  assert.match(regressionSuite, /scripts\/file-storage-quota-enforcement-regression\.mjs/, "regression suite should include quota enforcement coverage");
}

async function assertBufferedWorkspaceQuota(session, taskId) {
  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: null, workspaceLimitBytes: 12 });

  const atLimit = await filesService.uploadAndAttach(session, bufferedPayload(taskId, {
    originalFilename: "buffered-workspace-at-limit.txt",
    text: "w".repeat(12),
  }));
  assert.equal(atLimit.file.fileSizeBytes, 12, "workspace quota should allow an upload exactly at the limit");

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

async function assertBufferedPerUserQuota(session, taskId) {
  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: 10, workspaceLimitBytes: null });

  const atLimit = await filesService.uploadAndAttach(session, bufferedPayload(taskId, {
    originalFilename: "buffered-user-at-limit.txt",
    text: "u".repeat(10),
  }));
  assert.equal(atLimit.file.fileSizeBytes, 10, "per-user quota should allow an upload exactly at the limit");

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

async function assertBufferedNullLimits(session, taskId) {
  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: null, workspaceLimitBytes: null });

  const upload = await filesService.uploadAndAttach(session, bufferedPayload(taskId, {
    originalFilename: "buffered-null-limits.txt",
    text: "n".repeat(64),
  }));
  assert.equal(upload.file.fileSizeBytes, 64, "NULL workspace and per-user limits should remain unlimited for buffered uploads");
}

async function assertStreamedWorkspaceQuota(session, taskId) {
  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: null, workspaceLimitBytes: 6 });

  const atLimit = await filesService.uploadStreamAndAttach(session, streamedPayload(taskId, {
    originalFilename: "streamed-workspace-at-limit.txt",
    text: "s".repeat(6),
  }));
  assert.equal(atLimit.file.fileSizeBytes, 6, "workspace quota should allow a streamed upload exactly at the limit");

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

async function assertStreamedPerUserQuota(session, taskId) {
  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: 7, workspaceLimitBytes: null });

  const atLimit = await filesService.uploadStreamAndAttach(session, streamedPayload(taskId, {
    originalFilename: "streamed-user-at-limit.txt",
    text: "p".repeat(7),
  }));
  assert.equal(atLimit.file.fileSizeBytes, 7, "per-user quota should allow a streamed upload exactly at the limit");

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

async function assertStreamedNullLimits(session, taskId) {
  await resetStoredFileRows();
  await saveStorageLimits(session, { perUserLimitBytes: null, workspaceLimitBytes: null });

  const upload = await filesService.uploadStreamAndAttach(session, streamedPayload(taskId, {
    originalFilename: "streamed-null-limits.txt",
    text: "z".repeat(64),
  }));
  assert.equal(upload.file.fileSizeBytes, 64, "NULL workspace and per-user limits should remain unlimited for streamed uploads");
}

async function saveStorageLimits(session, { perUserLimitBytes, workspaceLimitBytes }) {
  await filesService.saveWorkspaceFileSettings(session, {
    internalStorageLimitBytes: workspaceLimitBytes,
    perUserStorageLimitBytes: perUserLimitBytes,
  });
}

async function assertRejectedUpload(uploadFn, messagePattern, description) {
  await assert.rejects(
    uploadFn,
    (error) => {
      assert.equal(error.statusCode, 413, description);
      assert.match(error.message, messagePattern, description);
      return true;
    },
    description,
  );
}

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

async function listStoredFiles(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
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
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user?.user_id, "fresh database should seed a protected super admin");
  const workspaceId = user.active_workspace_id || user.home_workspace_id;

  return {
    active_workspace_id: workspaceId,
    display_name: user.display_name,
    role: "super_admin",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: workspaceId,
  };
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

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
