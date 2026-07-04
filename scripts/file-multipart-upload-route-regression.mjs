/* global Blob, FormData, fetch */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.22.15";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-multipart-upload-"));

process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-multipart-upload.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "File-Multipart-Upload-Test-123!";

const { config } = await import("../src/config.js");
const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");
const { filesService } = await import("../src/services/files.service.js");
const { AppError } = await import("../src/utils/app-error.js");

let server;

try {
  assertStaticContracts();

  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);

  await checkStreamedUploadCreatesPendingFile(api, fixtures);
  await checkJsonUploadContractRemainsAvailable(api, fixtures);
  await checkOversizedStreamedUploadIsRejected(api, fixtures);
  await checkParseFailureLeavesNoAttachment(api, fixtures);
  await checkStorageFailureLeavesNoAttachment(api, fixtures);
  await assertIntegrity();

  console.log("File multipart upload route regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContracts() {
  const packageJson = JSON.parse(readText("package.json"));
  const packageLock = JSON.parse(readText("package-lock.json"));
  const roadmap = readText("ROADMAP.md");
  const changelog = readText("CHANGELOG.md");
  const moduleDocs = readText("docs/module-development.md");
  const runtimeDocs = readText("docs/runtime-configuration.md");
  const filesRoutes = readText("src/routes/files.routes.js");
  const filesServiceSource = readText("src/services/files.service.js");
  const regressionSuite = readText("scripts/regression-suite.mjs");

  assert.equal(packageJson.version, appVersion, "package.json should report the multipart route version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the multipart route version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the multipart route version");
  assert.equal(packageJson.dependencies?.busboy, "^1.6.0", "package.json should keep the selected multipart parser dependency");

  assert.match(filesRoutes, /import Busboy from "busboy"/, "Files routes should use the selected Busboy parser");
  assert.match(filesRoutes, /filesRoutes\.post\("\/files\/upload"/, "Files routes should expose the streamed upload route");
  assert.match(filesRoutes, /filesRoutes\.post\("\/files"/, "Files routes should preserve the JSON upload route");
  assert.match(filesRoutes, /uploadStreamAndAttach/, "Multipart route should hand the stream to the Files service");
  assert.match(filesRoutes, /Multipart upload metadata fields must be sent before the file field/, "Multipart route should document the first-slice metadata-before-file boundary");

  assert.match(filesServiceSource, /async function uploadStreamAndAttach/, "Files service should own streamed upload lifecycle");
  assert.match(filesServiceSource, /saveStream\(guardedStream/, "Streamed uploads should write through the storage streaming contract");
  assert.match(filesServiceSource, /Uploaded file exceeds the allowed size/, "Streamed uploads should enforce upload size before a usable file record exists");
  assert.match(filesServiceSource, /queueFileScanJob\(session, file/, "Streamed uploads should keep the normal scan-job handoff");
  assert.match(filesServiceSource, /attachFile\(session, \{/, "Streamed uploads should keep the normal attachment lifecycle");

  assert.match(runtimeDocs, /As of 0\.33\.5\.22\.15[\s\S]*`POST \/api\/files\/upload` accepts one multipart file/, "runtime docs should mark the single-file multipart route active");
  assert.match(moduleDocs, /multipart upload route[\s\S]*file\.scan/, "module docs should record that multipart uploads keep the scan lifecycle");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the multipart route slice");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(regressionSuite, /scripts\/file-multipart-upload-route-regression\.mjs/, "regression suite should include multipart upload route coverage");
}

async function checkStreamedUploadCreatesPendingFile(api, fixtures) {
  const bodyText = "streamed multipart route body";
  const response = await api.postForm("/api/files/upload", createUploadForm(fixtures.streamTaskId, {
    attachmentMetadata: { source: "multipart-regression" },
    displayName: "Streamed Evidence",
    filename: "streamed-evidence.txt",
    text: bodyText,
  }), { cookie: fixtures.adminSessionId });

  assert.equal(response.status, 201, "multipart upload should create a file attachment");
  assert.equal(response.body.file.originalFilename, "streamed-evidence.txt");
  assert.equal(response.body.file.displayName, "Streamed Evidence");
  assert.equal(response.body.file.status, "pending");
  assert.equal(response.body.file.scanStatus, "pending");
  assert.equal(response.body.file.storageProvider, "local");
  assert.equal(response.body.attachment.targetType, "task");
  assert.equal(response.body.attachment.targetId, fixtures.streamTaskId);
  assert.doesNotMatch(JSON.stringify(response.body), /storageKey|protectedPath|signedUrl/i, "multipart response must not expose storage internals");

  const fileRows = await querySql(`
SELECT storage_provider, storage_key, original_filename, display_name, file_size_bytes, sha256_hash, status, scan_status
FROM files
WHERE file_id = ${sqlText(response.body.file.fileId)};
`);
  assert.equal(fileRows.length, 1);
  assert.equal(fileRows[0].storage_provider, "local");
  assert.ok(fileRows[0].storage_key, "stored streamed files should keep a storage key in the database");
  assert.equal(fileRows[0].original_filename, "streamed-evidence.txt");
  assert.equal(fileRows[0].display_name, "Streamed Evidence");
  assert.equal(Number(fileRows[0].file_size_bytes), Buffer.byteLength(bodyText));
  assert.equal(fileRows[0].sha256_hash, createHash("sha256").update(bodyText).digest("hex"));
  assert.equal(fileRows[0].status, "pending");
  assert.equal(fileRows[0].scan_status, "pending");

  const attachmentRows = await querySql(`
SELECT metadata_json, target_type, target_id
FROM file_attachments
WHERE file_id = ${sqlText(response.body.file.fileId)};
`);
  assert.equal(attachmentRows.length, 1);
  assert.equal(attachmentRows[0].target_type, "task");
  assert.equal(attachmentRows[0].target_id, fixtures.streamTaskId);
  assert.deepEqual(JSON.parse(attachmentRows[0].metadata_json), { source: "multipart-regression" });

  const scanJobs = await querySql(`
SELECT status, attempt_count, payload_json
FROM jobs
WHERE job_type = 'file.scan'
  AND payload_json LIKE ${sqlText(`%"fileId":"${response.body.file.fileId}"%`)};
`);
  assert.equal(scanJobs.length, 1);
  assert.equal(scanJobs[0].status, "pending");
  assert.equal(Number(scanJobs[0].attempt_count), 0);
  assert.match(scanJobs[0].payload_json, /"source":"file_upload"/);
}

async function checkJsonUploadContractRemainsAvailable(api, fixtures) {
  const response = await api.post("/api/files", uploadPayload(fixtures.jsonTaskId), {
    cookie: fixtures.adminSessionId,
  });

  assert.equal(response.status, 201, "existing JSON upload route should remain available");
  assert.equal(response.body.file.originalFilename, "json-still-works.txt");
  assert.equal(response.body.file.status, "pending");
  assert.equal(response.body.file.scanStatus, "pending");
}

async function checkOversizedStreamedUploadIsRejected(api, fixtures) {
  const beforeFiles = await listStoredFiles(config.storage.localRoot);
  const response = await api.postForm("/api/files/upload", createUploadForm(fixtures.oversizedTaskId, {
    filename: "too-large.txt",
    text: "x".repeat((5 * 1024 * 1024) + 1),
  }), { cookie: fixtures.adminSessionId });

  assert.equal(response.status, 413, "oversized streamed upload should be rejected");
  assert.match(response.body.error, /exceeds the allowed size/i);
  await assertNoFileOrAttachmentForOriginalFilename("too-large.txt");
  assert.deepEqual(
    await listStoredFiles(config.storage.localRoot),
    beforeFiles,
    "oversized streamed upload should not leave a usable local storage file",
  );
}

async function checkParseFailureLeavesNoAttachment(api, fixtures) {
  const form = new FormData();
  form.append("moduleId", "tasks");
  form.append("targetType", "task");
  form.append("file", new Blob(["missing target"], { type: "text/plain" }), "missing-target.txt");

  const response = await api.postForm("/api/files/upload", form, { cookie: fixtures.adminSessionId });

  assert.equal(response.status, 400, "metadata parse failure should reject the upload");
  assert.match(response.body.error, /metadata fields must be sent before the file field/i);
  await assertNoFileOrAttachmentForOriginalFilename("missing-target.txt");
}

async function checkStorageFailureLeavesNoAttachment(api, fixtures) {
  const originalAdapter = filesService.getFileStorageAdapter("local");
  filesService.registerFileStorageAdapter("local", {
    ...originalAdapter,
    async saveStream(readable) {
      for await (const _chunk of readable) {
        // Drain the request stream before simulating the storage failure.
      }
      throw new AppError("Simulated storage failure.", 503);
    },
  });

  let response;
  try {
    response = await api.postForm("/api/files/upload", createUploadForm(fixtures.storageFailureTaskId, {
      filename: "storage-fails.txt",
      text: "storage should fail",
    }), { cookie: fixtures.adminSessionId });
  } finally {
    filesService.registerFileStorageAdapter("local", originalAdapter);
  }

  assert.equal(response.status, 503, "storage failures should reject the streamed upload");
  assert.match(response.body.error, /storage failure/i);
  await assertNoFileOrAttachmentForOriginalFilename("storage-fails.txt");
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
  assert.equal(Number(orphanRows[0].count), 0, "failed uploads should not leave orphaned attachments");
}

async function seedFixtures() {
  const admin = await readSeedAdmin();
  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;
  const taskIds = {
    jsonTaskId: randomUUID(),
    oversizedTaskId: randomUUID(),
    storageFailureTaskId: randomUUID(),
    streamTaskId: randomUUID(),
  };

  for (const [name, taskId] of Object.entries(taskIds)) {
    await createTask({
      taskId,
      title: `Multipart upload ${name}`,
      userId: admin.user_id,
      workspaceId,
    });
  }

  return {
    adminSessionId: (await createSession({
      active_workspace_id: workspaceId,
      home_workspace_id: admin.home_workspace_id,
      timezone: admin.timezone || "America/New_York",
      user_id: admin.user_id,
      username: admin.username,
    })).sessionId,
    workspaceId,
    ...taskIds,
  };
}

async function readSeedAdmin() {
  const rows = await querySql(`
SELECT user_id, username, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  assert.ok(rows[0]?.user_id, "fresh database should seed a protected admin");
  return rows[0];
}

async function createTask(options) {
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
  ${sqlText(options.taskId)},
  ${sqlText(options.workspaceId)},
  NULL,
  NULL,
  ${sqlText(options.title)},
  '',
  'open',
  'normal',
  ${sqlText(options.userId)},
  ${sqlText(options.userId)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

function createUploadForm(taskId, options = {}) {
  const form = new FormData();
  form.append("moduleId", "tasks");
  form.append("targetType", "task");
  form.append("targetId", taskId);
  form.append("visibility", "private");

  if (options.displayName) {
    form.append("displayName", options.displayName);
  }
  if (options.attachmentMetadata) {
    form.append("attachmentMetadata", JSON.stringify(options.attachmentMetadata));
  }

  form.append("file", new Blob([options.text || "multipart upload body"], {
    type: options.mimeType || "text/plain",
  }), options.filename || "multipart-evidence.txt");
  return form;
}

function uploadPayload(taskId) {
  return {
    contentBase64: Buffer.from("json route still works").toString("base64"),
    moduleId: "tasks",
    originalFilename: "json-still-works.txt",
    targetId: taskId,
    targetType: "task",
    visibility: "private",
  };
}

function createApi(baseUrl) {
  return {
    async post(url, body, options = {}) {
      return requestJson(baseUrl, "POST", url, body, options);
    },
    async postForm(url, form, options = {}) {
      return requestForm(baseUrl, url, form, options);
    },
  };
}

async function requestJson(baseUrl, method, url, body, options = {}) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    body: JSON.stringify(body),
    headers,
    method,
  });
  return parseResponse(response);
}

async function requestForm(baseUrl, url, form, options = {}) {
  const headers = {};

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    body: form,
    headers,
    method: "POST",
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    body,
    headers: response.headers,
    status: response.status,
    text,
  };
}

async function listStoredFiles(directory) {
  const files = [];

  async function walk(currentDirectory) {
    let entries;
    try {
      entries = await fs.readdir(currentDirectory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile()) {
        files.push(path.relative(directory, entryPath).replaceAll(path.sep, "/"));
      }
    }
  }

  await walk(directory);
  return files.sort();
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(app);
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

function closeServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
