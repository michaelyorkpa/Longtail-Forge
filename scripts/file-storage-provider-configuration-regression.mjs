import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const appVersion = "0.33.5.27.22";
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
  const fileId = upload.file.fileId;
  const storedFile = await readFileRow(session.workspace_id, fileId);

  assert.equal(upload.file.storageProvider, "local", "upload response should identify the stored provider");
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
      assert.equal(error.statusCode, 500, "unknown configured providers should fail as server configuration errors");
      assert.match(error.message, /File storage provider 'missing-provider' is not configured\./);
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
    packageJson,
    packageLock,
    roadmap,
    changelog,
    runtimeDocs,
    filesServiceSource,
    regressionSuite,
  ] = await Promise.all([
    readJson("package.json"),
    readJson("package-lock.json"),
    readText("ROADMAP.md"),
    readText("CHANGELOG.md"),
    readText("docs/runtime-configuration.md"),
    readText("src/services/files.service.js"),
    readText("scripts/regression-suite.mjs"),
  ]);

  assert.equal(packageJson.version, appVersion, "package.json should report the storage provider resolver version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the storage provider resolver version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the storage provider resolver version");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the storage provider resolver slice");
  assert.match(runtimeDocs, /As of 0\.33\.5\.22\.15, `LONGTAIL_STORAGE_PROVIDER=local` is consumed by Files upload writes/, "runtime docs should identify the live upload-write provider setting");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(filesServiceSource, /function resolveConfiguredFileStorageProvider\(\)/, "Files service should own configured provider resolution");
  assert.doesNotMatch(functionBlock(filesServiceSource, "uploadAndAttach"), /getFileStorageAdapter\("local"\)|storageProvider:\s*"local"/, "upload writes should not hardcode the local provider");
  assert.match(regressionSuite, /scripts\/file-storage-provider-configuration-regression\.mjs/, "regression suite should include the storage provider configuration regression");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
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

  const workspaceId = user.active_workspace_id || user.home_workspace_id;

  return {
    active_workspace_id: workspaceId,
    display_name: "Admin User",
    role: "super_admin",
    timezone: user.timezone || "UTC",
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

function uploadPayload(taskId, options = {}) {
  return {
    contentBase64: Buffer.from(options.text || "file body").toString("base64"),
    moduleId: "tasks",
    originalFilename: options.originalFilename || "provider-test.txt",
    targetId: taskId,
    targetType: "task",
  };
}

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

async function streamToText(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
