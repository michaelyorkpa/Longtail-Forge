import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";
import { createProjectTextReader, extractFunctionSpan } from "./test-support/source-scan.mjs";
const { readTextAsync: readText } = createProjectTextReader();
/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} FilesSession */

/**
 * Narrow an upload envelope to the file record it must be carrying.
 *
 * The service publishes `file` as nullable because a refused upload produces
 * none, so every read through it here is a claim the upload was accepted.
 * @template {{ file: unknown }} Envelope
 * @param {Envelope} envelope
 * @param {string} label
 * @returns {NonNullable<Envelope["file"]>}
 */
function requireFile(envelope, label) {
  assert.ok(envelope.file, `${label} should carry its file record`);
  return envelope.file;
}


const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-storage-provider-config-"));

delete process.env.LONGTAIL_STORAGE_PROVIDER;
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-storage-provider-config.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "File-Storage-Provider-Config-Test-123!";

const { config } = await import("../src/config.js");
const { filesService } = await import("../src/services/files.service.js");
const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await assertStaticContracts();
  await initializeDatabase();
  filesService.registerFileScanJobHandlers({ replace: true });

  const session = await readSeedSession();
  const taskId = await createTask(session, "File storage provider task");

  assert.equal(config.storage.provider, "local", "local storage should remain the default configured provider");

  const upload = await filesService.uploadAndAttach(session, uploadPayload(taskId, {
    originalFilename: "default-provider.txt",
    text: "default provider body",
  }));
  const fileId = requireFile(upload, "default provider upload").fileId;
  const storedFile = await readFileRow(session.workspace_id, fileId);

  assert.equal(requireFile(upload, "default provider upload").storageProvider, "local", "upload response should identify the stored provider");
  assert.equal(storedFile.storage_provider, "local", "new uploads should persist the configured local provider");
  assert.equal(storedFile.status, "pending", "provider selection must not change upload scan handoff status");
  assert.equal(storedFile.scan_status, "pending", "provider selection must not change upload scan handoff status");

  const scanSummary = await runJobWorkerOnce({
    claimLimit: 5,
    mode: "inline",
    workerId: "file-storage-provider-config-regression",
  });
  assert.equal(scanSummary.completed, 1, "queued file.scan job should complete before download smoke");

  config.storage.provider = "missing-provider";
  await assert.rejects(
    () => filesService.uploadAndAttach(session, uploadPayload(taskId, {
      originalFilename: "missing-provider.txt",
      text: "missing provider body",
    })),
    (error) => {
      const denial = /** @type {{ message?: string, statusCode?: number }} */ (error);
      assert.equal(denial.statusCode, 500, "unknown configured providers should fail as server configuration errors");
      assert.match(String(denial.message), /File storage provider 'missing-provider' is not configured\./);
      return true;
    },
    "unknown configured providers should not silently fall back to local",
  );

  const missingRows = await querySql(`
SELECT file_id
FROM files
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND original_filename = 'missing-provider.txt';
`);
  assert.equal(missingRows.length, 0, "unknown provider failures should not create file rows");

  const download = await filesService.downloadFile(session, fileId);
  assert.equal(await streamToText(download.stream), "default provider body", "existing local rows should read through stored provider metadata even when config changes");

  console.log("File storage provider configuration regression passed.");
} finally {
  await stopJobWorker().catch(() => {});
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertStaticContracts() {
  const [
    runtimeDocs,
    filesServiceSource,
    _regressionSuite,
  ] = await Promise.all([
    readText("docs/runtime-configuration.md"),
    readText("src/services/files.service.js"),
    readText("scripts/regression-legacy-snapshot.json"),
  ]);

          assert.match(runtimeDocs, /As of 0\.33\.5\.22\.15, `LONGTAIL_STORAGE_PROVIDER=local` is consumed by Files upload writes/, "runtime docs should identify the live upload-write provider setting");
  assert.match(filesServiceSource, /function resolveConfiguredFileStorageProvider\(\)/, "Files service should own configured provider resolution");
  assert.doesNotMatch(extractFunctionSpan(filesServiceSource, "uploadAndAttach"), /getFileStorageAdapter\("local"\)|storageProvider:\s*"local"/, "upload writes should not hardcode the local provider");
  }

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "fresh database should seed a protected super admin");

  return workspaceSessionFixture({ ...user, display_name: "Admin User" });
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

/** @param {string} taskId @param {{ originalFilename?: string, text?: string }} [options] */
function uploadPayload(taskId, options = {}) {
  return {
    contentBase64: Buffer.from(options.text || "file body").toString("base64"),
    moduleId: "tasks",
    originalFilename: options.originalFilename || "provider-test.txt",
    targetId: taskId,
    targetType: "task",
  };
}

/** @param {string} workspaceId @param {string} fileId */
async function readFileRow(workspaceId, fileId) {
  const rows = await querySql(`
SELECT *
FROM files
WHERE workspace_id = ${sqlText(workspaceId)}
  AND file_id = ${sqlText(fileId)}
LIMIT 1;
`);

  assert.equal(rows.length, 1, "file row should exist");
  return rows[0];
}

/** @param {NodeJS.ReadableStream} stream */
async function streamToText(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}
