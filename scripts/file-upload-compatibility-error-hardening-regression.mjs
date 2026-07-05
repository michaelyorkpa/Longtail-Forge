/* global Blob, FormData, fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.27.2";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-upload-hardening-"));

process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-upload-hardening.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "File-Upload-Hardening-Test-123!";

const { config } = await import("../src/config.js");
const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");
const { filesService } = await import("../src/services/files.service.js");

let server;

try {
  assertStaticContracts();

  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const api = createApi(baseUrl);

  await checkLegacyJsonCompatibility(api, fixtures);
  await checkOversizedFailureShapeAndCleanup(api, fixtures);
  await checkMalformedMultipartCleanup(baseUrl, fixtures);
  await checkClientAbortCleanup(baseUrl, fixtures);
  await checkStorageStreamFailureIsBounded(api, fixtures);
  await assertIntegrity();

  console.log("File upload compatibility and error hardening regression passed.");
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
  const moduleContract = readText("docs/module-contract.md");
  const moduleDevelopment = readText("docs/module-development.md");
  const runtimeDocs = readText("docs/runtime-configuration.md");
  const filesRoutes = readText("src/routes/files.routes.js");
  const filesServiceSource = readText("src/services/files.service.js");
  const previewRegression = readText("scripts/files-preview-availability-route-regression.mjs");
  const regressionSuite = readText("scripts/regression-suite.mjs");

  assert.equal(packageJson.version, appVersion, "package.json should report the upload hardening version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the upload hardening version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the upload hardening version");

  assert.match(filesRoutes, /request\.on\("aborted", handleRequestAborted\)/, "multipart routes should handle aborted client requests");
  assert.match(filesRoutes, /Multipart upload was cancelled before it finished/, "aborted uploads should return useful cancellation copy");
  assert.match(filesRoutes, /destroyMultipartFileStreams/, "fatal multipart failures should tear down active file streams");
  assert.match(filesRoutes, /normalizeMultipartUploadError/, "multipart parser errors should be normalized to route-safe AppErrors");
  assert.match(filesServiceSource, /Uploaded file could not be stored/, "storage stream failures should have bounded response copy");
  assert.match(filesServiceSource, /error instanceof AppError/, "storage stream failures should preserve known upload errors");

  assert.match(moduleContract, /As of 0\.33\.5\.22\.15[\s\S]*POST \/api\/files[\s\S]*POST \/api\/files\/batch/, "module contract should record legacy JSON compatibility");
  assert.match(moduleDevelopment, /As of 0\.33\.5\.22\.15[\s\S]*base64 compatibility routes/, "module docs should guide new module uploads to streamed routes");
  assert.match(runtimeDocs, /As of 0\.33\.5\.22\.15[\s\S]*retired no earlier than 0\.33\.5\.23\.0/, "runtime docs should define the base64 retirement floor");
  assert.match(previewRegression, /download_only[\s\S]*unsupported_file_type/, "preview coverage should keep unsupported files download-only");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the upload hardening slice");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(regressionSuite, /scripts\/file-upload-compatibility-error-hardening-regression\.mjs/, "regression suite should include upload hardening coverage");
}

async function checkLegacyJsonCompatibility(api, fixtures) {
  const singleResponse = await api.postJson("/api/files", {
    contentBase64: Buffer.from("legacy single upload body").toString("base64"),
    moduleId: "tasks",
    originalFilename: "legacy-single-still-supported.txt",
    targetId: fixtures.legacySingleTaskId,
    targetType: "task",
    visibility: "private",
  }, { cookie: fixtures.adminSessionId });

  assert.equal(singleResponse.status, 201, "legacy JSON single upload route should remain available");
  assert.equal(singleResponse.body.file.originalFilename, "legacy-single-still-supported.txt");
  assert.equal(singleResponse.body.file.status, "pending");
  assert.equal(singleResponse.body.file.scanStatus, "pending");

  const batchResponse = await api.postJson("/api/files/batch", {
    files: [
      {
        contentBase64: Buffer.from("legacy batch upload body").toString("base64"),
        originalFilename: "legacy-batch-still-supported.txt",
      },
    ],
    moduleId: "tasks",
    targetId: fixtures.legacyBatchTaskId,
    targetType: "task",
    visibility: "private",
  }, { cookie: fixtures.adminSessionId });

  assert.equal(batchResponse.status, 201, "legacy JSON batch upload route should remain available");
  assert.equal(batchResponse.body.total, 1);
  assert.equal(batchResponse.body.succeeded, 1);
  assert.equal(batchResponse.body.results[0].file.originalFilename, "legacy-batch-still-supported.txt");
  assert.equal(batchResponse.body.results[0].file.status, "pending");
}

async function checkOversizedFailureShapeAndCleanup(api, fixtures) {
  const beforeFiles = await listStoredFiles(config.storage.localRoot);
  const response = await api.postForm("/api/files/upload", createUploadForm(fixtures.oversizedTaskId, {
    filename: "hardening-too-large.txt",
    text: "x".repeat((5 * 1024 * 1024) + 1),
  }), { cookie: fixtures.adminSessionId });

  assert.equal(response.status, 413, "oversized streamed uploads should use a useful 413 response");
  assert.match(response.body.error, /Uploaded file exceeds the allowed size/i);
  assert.doesNotMatch(JSON.stringify(response.body), /storageKey|protectedPath|signedUrl|localRoot/i, "failure response should not expose storage internals");
  await eventuallyNoFileOrAttachmentForOriginalFilename("hardening-too-large.txt");
  await eventuallyStoredFilesEqual(beforeFiles, "oversized streamed upload should not leave a partial local file");
}

async function checkMalformedMultipartCleanup(baseUrl, fixtures) {
  const beforeFiles = await listStoredFiles(config.storage.localRoot);
  const response = await sendMalformedMultipart(baseUrl, fixtures, {
    filename: "malformed-upload.txt",
    taskId: fixtures.malformedTaskId,
  });

  assert.equal(response.status, 400, "malformed multipart uploads should fail with a route-safe 400");
  assert.match(response.body.error, /could not be parsed|cancelled|could not be read/i);
  assert.doesNotMatch(response.text, /storageKey|protectedPath|signedUrl|localRoot/i, "parse failures should not expose storage internals");
  await eventuallyNoFileOrAttachmentForOriginalFilename("malformed-upload.txt");
  await eventuallyStoredFilesEqual(beforeFiles, "malformed multipart upload should not leave a partial local file");
}

async function checkClientAbortCleanup(baseUrl, fixtures) {
  const beforeFiles = await listStoredFiles(config.storage.localRoot);
  await abortMultipartUpload(baseUrl, fixtures, {
    filename: "client-aborted-upload.txt",
    taskId: fixtures.abortedTaskId,
  });

  await eventuallyNoFileOrAttachmentForOriginalFilename("client-aborted-upload.txt");
  await eventuallyStoredFilesEqual(beforeFiles, "client-aborted upload should not leave a partial local file");
}

async function checkStorageStreamFailureIsBounded(api, fixtures) {
  const originalAdapter = filesService.getFileStorageAdapter("local");
  filesService.registerFileStorageAdapter("local", {
    ...originalAdapter,
    async saveStream(readable) {
      for await (const _chunk of readable) {
        // Drain the request stream before simulating an unexpected provider failure.
      }
      throw new Error("raw provider stream failure with internal path C:\\secret\\storage");
    },
  });

  let response;
  try {
    response = await api.postForm("/api/files/upload", createUploadForm(fixtures.storageFailureTaskId, {
      filename: "bounded-storage-failure.txt",
      text: "storage provider should fail safely",
    }), { cookie: fixtures.adminSessionId });
  } finally {
    filesService.registerFileStorageAdapter("local", originalAdapter);
  }

  assert.equal(response.status, 500, "unexpected storage stream failures should fail the upload");
  assert.match(response.body.error, /Uploaded file could not be stored/i);
  assert.doesNotMatch(response.text, /raw provider|secret|storageKey|protectedPath|signedUrl/i, "storage failures should not leak provider internals");
  await eventuallyNoFileOrAttachmentForOriginalFilename("bounded-storage-failure.txt");
}

async function seedFixtures() {
  const admin = await readSeedAdmin();
  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;
  const taskIds = {
    abortedTaskId: randomUUID(),
    legacyBatchTaskId: randomUUID(),
    legacySingleTaskId: randomUUID(),
    malformedTaskId: randomUUID(),
    oversizedTaskId: randomUUID(),
    storageFailureTaskId: randomUUID(),
  };

  for (const [name, taskId] of Object.entries(taskIds)) {
    await createTask({
      taskId,
      title: `Upload hardening ${name}`,
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
  form.append("file", new Blob([options.text || "upload hardening body"], {
    type: options.mimeType || "text/plain",
  }), options.filename || "upload-hardening.txt");
  return form;
}

function sendMalformedMultipart(baseUrl, fixtures, options = {}) {
  const boundary = `ltf-hardening-${randomUUID()}`;
  const body = Buffer.from([
    multipartField(boundary, "moduleId", "tasks"),
    multipartField(boundary, "targetType", "task"),
    multipartField(boundary, "targetId", options.taskId),
    multipartField(boundary, "visibility", "private"),
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="file"; filename="${options.filename}"\r\n`,
    "Content-Type: text/plain\r\n\r\n",
    "malformed body without the final boundary",
  ].join(""), "utf8");

  return rawHttpRequest(baseUrl, {
    body,
    headers: {
      "Content-Length": String(body.length),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Cookie: `longtail_forge_session=${fixtures.adminSessionId}`,
    },
    method: "POST",
    path: "/api/files/upload",
  });
}

function abortMultipartUpload(baseUrl, fixtures, options = {}) {
  const boundary = `ltf-abort-${randomUUID()}`;
  const bodyStart = Buffer.from([
    multipartField(boundary, "moduleId", "tasks"),
    multipartField(boundary, "targetType", "task"),
    multipartField(boundary, "targetId", options.taskId),
    multipartField(boundary, "visibility", "private"),
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="file"; filename="${options.filename}"\r\n`,
    "Content-Type: text/plain\r\n\r\n",
  ].join(""), "utf8");

  return new Promise((resolve) => {
    const url = new URL("/api/files/upload", baseUrl);
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    const request = http.request({
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        Cookie: `longtail_forge_session=${fixtures.adminSessionId}`,
      },
      hostname: url.hostname,
      method: "POST",
      path: url.pathname,
      port: url.port,
    });

    request.on("error", done);
    request.on("close", done);
    request.write(bodyStart);
    request.write(Buffer.alloc(128 * 1024, "a"));
    setTimeout(() => {
      request.destroy(new Error("client aborted upload regression"));
    }, 20);
  });
}

function multipartField(boundary, name, value) {
  return `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
}

function rawHttpRequest(baseUrl, options) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, baseUrl);
    const request = http.request({
      headers: options.headers,
      hostname: url.hostname,
      method: options.method || "POST",
      path: url.pathname,
      port: url.port,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = text;
        }
        resolve({
          body,
          headers: response.headers,
          status: response.statusCode,
          text,
        });
      });
    });

    request.on("error", reject);
    request.end(options.body);
  });
}

function createApi(baseUrl) {
  return {
    async postForm(url, form, options = {}) {
      return request(baseUrl, "POST", url, form, options);
    },
    async postJson(url, body, options = {}) {
      return request(baseUrl, "POST", url, JSON.stringify(body), {
        ...options,
        contentType: "application/json",
      });
    },
  };
}

async function request(baseUrl, method, url, body, options = {}) {
  const headers = {};

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }
  if (options.contentType) {
    headers["Content-Type"] = options.contentType;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    body,
    headers,
    method,
  });
  const text = await response.text();
  let parsedBody = null;

  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = text;
  }

  return {
    body: parsedBody,
    headers: response.headers,
    status: response.status,
    text,
  };
}

async function eventuallyNoFileOrAttachmentForOriginalFilename(originalFilename) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await hasNoFileOrAttachmentForOriginalFilename(originalFilename)) {
      return;
    }
    await delay(50);
  }

  assert.equal(await hasNoFileOrAttachmentForOriginalFilename(originalFilename), true, `${originalFilename} should not leave file or attachment rows`);
}

async function hasNoFileOrAttachmentForOriginalFilename(originalFilename) {
  const fileRows = await querySql(`
SELECT file_id
FROM files
WHERE original_filename = ${sqlText(originalFilename)};
`);
  if (fileRows.length > 0) {
    return false;
  }

  const orphanRows = await querySql(`
SELECT COUNT(*) AS count
FROM file_attachments
LEFT JOIN files
  ON files.workspace_id = file_attachments.workspace_id
  AND files.file_id = file_attachments.file_id
WHERE files.file_id IS NULL;
`);
  return Number(orphanRows[0].count) === 0;
}

async function eventuallyStoredFilesEqual(expectedFiles, message) {
  let lastFiles = [];

  for (let attempt = 0; attempt < 20; attempt += 1) {
    lastFiles = await listStoredFiles(config.storage.localRoot);
    try {
      assert.deepEqual(lastFiles, expectedFiles);
      return;
    } catch {
      await delay(50);
    }
  }

  assert.deepEqual(lastFiles, expectedFiles, message);
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

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
