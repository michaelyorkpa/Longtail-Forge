/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const appVersion = "0.33.6.13z";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-s3-diagnostics-boundary-"));
const privateBucket = "private-diagnostics-bucket";
const privateEndpoint = "https://objects.diagnostics.private.invalid";
const privateAccessKey = "private-diagnostics-access-key";
const privateSecret = "private-diagnostics-secret-key";

process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-s3-diagnostics-boundary.db");
process.env.LONGTAIL_STORAGE_PROVIDER = "s3";
process.env.LONGTAIL_S3_ACCESS_KEY_ID = privateAccessKey;
process.env.LONGTAIL_S3_BUCKET = privateBucket;
process.env.LONGTAIL_S3_ENDPOINT = privateEndpoint;
process.env.LONGTAIL_S3_REGION = "us-east-1";
process.env.LONGTAIL_S3_SECRET_ACCESS_KEY = privateSecret;
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "File-S3-Diagnostics-Boundary-Test-123!";

const { config } = await import("../src/config.js");
const { createApp } = await import("../src/core/app.js");
const { createS3FileStorageAdapter } = await import("../src/core/files/s3-storage-adapter.js");
const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");
const { filesService } = await import("../src/services/files.service.js");

let server;

try {
  await assertStaticContracts();

  const client = createMockS3Client();
  filesService.registerFileStorageAdapter("s3", createS3FileStorageAdapter({
    ...config.storage.s3,
    client,
  }));
  filesService.registerFileScanJobHandlers({ replace: true });

  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);

  const diagnosticsResponse = await api.get("/api/runtime-diagnostics", { cookie: fixtures.adminSessionId });
  assert.equal(diagnosticsResponse.status, 200, "workspace settings managers should read S3 runtime diagnostics");
  assertS3Diagnostics(diagnosticsResponse.body.diagnostics);

  const uploadResponse = await api.post("/api/files", uploadPayload(fixtures.taskId), {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(uploadResponse.status, 201, "S3-backed uploads should still return the normal Files JSON read model");
  assert.equal(uploadResponse.body.file.storageProvider, "s3", "S3 uploads should expose only the safe provider id");
  assertNoS3Internals(uploadResponse.body, "S3 upload response");

  const scanSummary = await runJobWorkerOnce({
    claimLimit: 5,
    mode: "inline",
    workerId: "file-s3-diagnostics-boundary",
  });
  assert.equal(scanSummary.completed >= 1, true, "S3-backed upload scan handoff should complete before preview/download checks");

  const fileResponse = await api.get(`/api/files/${uploadResponse.body.file.fileId}`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(fileResponse.status, 200, "file read route should return the safe S3 read model");
  assertNoS3Internals(fileResponse.body, "S3 file read response");

  const attachmentsResponse = await api.get(`/api/files/attachments?moduleId=tasks&targetType=task&targetId=${encodeURIComponent(fixtures.taskId)}`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(attachmentsResponse.status, 200, "attachment list should return safe route-backed rows");
  assertNoS3Internals(attachmentsResponse.body, "S3 attachment list response");

  const attachmentId = uploadResponse.body.attachment.fileAttachmentId || uploadResponse.body.attachment.file_attachment_id;
  const previewResponse = await api.get(`/api/files/attachments/${encodeURIComponent(attachmentId)}/preview`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(previewResponse.status, 200, "preview descriptor should stay route-backed for S3 files");
  assert.match(previewResponse.body.preview.contentUrl || "", /^\/api\/files\/attachments\/[^/]+\/preview\/content$/, "preview content should use the Longtail Forge route");
  assertNoS3Internals(previewResponse.body, "S3 preview descriptor response");

  const previewContentResponse = await api.get(`/api/files/attachments/${encodeURIComponent(attachmentId)}/preview/content`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(previewContentResponse.status, 200, "preview content should read through the Longtail Forge route");
  assert.equal(previewContentResponse.body.content.text, "S3 diagnostics boundary body", "preview content should stream through the registered S3 adapter");
  assertNoS3Internals(previewContentResponse.body, "S3 preview content response");

  const downloadResponse = await api.get(`/api/files/${encodeURIComponent(uploadResponse.body.file.fileId)}/download`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(downloadResponse.status, 200, "download should stay permission-checked through the Longtail Forge route");
  assert.equal(downloadResponse.text, "S3 diagnostics boundary body", "download should stream S3 bytes through the app route");
  assertNoS3Internals(Object.fromEntries(downloadResponse.headers.entries()), "S3 download headers");

  console.log("File S3 diagnostics and signed URL boundary regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
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
    sqliteDocs,
    moduleContract,
    moduleDevelopment,
    filesServiceSource,
    filesRoutesSource,
    runtimeDiagnosticsSource,
    workspaceSettingsScript,
    regressionSuite,
  ] = await Promise.all([
    readJson("package.json"),
    readJson("package-lock.json"),
    readText("ROADMAP.md"),
    readText("CHANGELOG.md"),
    readText("docs/runtime-configuration.md"),
    readText("docs/sqlite-small-office-mode.md"),
    readText("docs/module-contract.md"),
    readText("docs/module-development.md"),
    readText("src/services/files.service.js"),
    readText("src/routes/files.routes.js"),
    readText("src/services/runtime-diagnostics.service.js"),
    readText("public/js/workspace-settings.js"),
    readText("scripts/regression-suite.mjs"),
  ]);

  assert.equal(packageJson.version, appVersion, "package.json should report the S3 diagnostics boundary version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the S3 diagnostics boundary version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the S3 diagnostics boundary version");
  assert.equal(Object.keys(packageJson.dependencies || {}).some((name) => /aws-sdk|client-s3/i.test(name)), false, "this boundary should not add an S3 SDK dependency");

  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the S3 diagnostics boundary slice");
  assert.match(regressionSuite, /scripts\/file-s3-diagnostics-signed-url-boundary-regression\.mjs/, "regression suite should include S3 diagnostics boundary coverage");

  assert.match(runtimeDocs, /As of 0\.33\.5\.25\.1[\s\S]*S3 bucket names[\s\S]*must not appear in diagnostics/, "runtime docs should record the S3 diagnostics redaction boundary");
  assert.match(runtimeDocs, /No direct\/presigned S3 upload or download route is implemented in 0\.33\.5\.25\.1/, "runtime docs should keep signed URL implementation out of scope");
  assert.match(sqliteDocs, /local-vs-S3 deployment guidance/i, "SQLite docs should include local-vs-S3 deployment guidance");
  assert.match(moduleContract, /signed URL exception[\s\S]*permission-checked[\s\S]*expir/, "module contract should describe future signed URL exception rules");
  assert.match(moduleDevelopment, /Normal module payloads[\s\S]*must not expose signed URLs/, "module docs should keep modules behind Files routes");

  assert.match(runtimeDiagnosticsSource, /readSafeStorageHealth/, "runtime diagnostics should use the safe storage health read model");
  assert.doesNotMatch(runtimeDiagnosticsSource, /LONGTAIL_S3|S3_BUCKET|S3_ENDPOINT|accessKey|secretAccessKey/i, "runtime diagnostics source should not expose S3 runtime settings");
  assert.doesNotMatch(workspaceSettingsScript, /LONGTAIL_S3|S3_BUCKET|S3_ENDPOINT|accessKey|secretAccessKey|signedUrl|presigned/i, "Workspace Settings should not expose S3 internals or signed URLs");

  assert.match(filesServiceSource, /permissionsService\.assertCan\(session, "files\.download"/, "downloads should keep the existing Files permission boundary");
  assert.match(filesServiceSource, /previewContentUrlForAttachment[\s\S]*\/api\/files\/attachments/, "preview descriptors should use Longtail Forge routes");
  assert.doesNotMatch(filesServiceSource + filesRoutesSource, /signedUrl|presigned|preSigned|createPresigned|directUpload|directDownload/i, "Files service/routes should not add signed URL behavior in this slice");
  assert.doesNotMatch(runtimeDocs + sqliteDocs + moduleContract + moduleDevelopment, /private-diagnostics-bucket|private-diagnostics-access-key|private-diagnostics-secret-key|objects\.diagnostics\.private\.invalid/i, "docs should not leak regression S3 config values");
}

function assertS3Diagnostics(diagnostics) {
  assert.equal(diagnostics.storage.provider, "s3", "S3 diagnostics should expose only the configured provider id");
  assert.equal(diagnostics.storage.health.status, "ok", "mocked S3 health should surface as safe availability");
  assert.equal(diagnostics.storage.health.available, true, "mocked S3 health should report available");
  assert.equal(diagnostics.storage.rootLocation, null, "S3 diagnostics should not expose a bucket, endpoint, or root location");

  assertNoS3Internals(diagnostics, "S3 runtime diagnostics");
}

async function seedFixtures() {
  const admin = await readSeedAdmin();
  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;
  const taskId = await createTask({
    userId: admin.user_id,
    workspaceId,
  });

  return {
    adminSessionId: (await createSession({
      active_workspace_id: workspaceId,
      home_workspace_id: admin.home_workspace_id,
      timezone: admin.timezone || "America/New_York",
      user_id: admin.user_id,
      username: admin.username,
    })).sessionId,
    taskId,
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
  ${sqlText(options.workspaceId)},
  NULL,
  NULL,
  'S3 diagnostics boundary task',
  '',
  'open',
  'normal',
  ${sqlText(options.userId)},
  ${sqlText(options.userId)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return taskId;
}

function uploadPayload(taskId) {
  return {
    contentBase64: Buffer.from("S3 diagnostics boundary body").toString("base64"),
    moduleId: "tasks",
    originalFilename: "s3-diagnostics-boundary.txt",
    targetId: taskId,
    targetType: "task",
  };
}

function createMockS3Client() {
  const objects = new Map();

  return {
    async deleteObject(payload = {}) {
      objects.delete(objectMapKey(payload));
      return {};
    },
    async getObject(payload = {}) {
      const object = objects.get(objectMapKey(payload));
      if (!object) {
        throw new Error("object missing");
      }
      return { body: Readable.from([object]) };
    },
    async health() {
      return {
        bucket: privateBucket,
        endpoint: privateEndpoint,
        ok: true,
      };
    },
    async headObject(payload = {}) {
      const object = objects.get(objectMapKey(payload));
      if (!object) {
        throw new Error("object missing");
      }
      return {
        contentLength: object.length,
        lastModified: new Date("2026-01-01T00:00:00.000Z"),
      };
    },
    async putObject(payload = {}) {
      objects.set(objectMapKey(payload), await bodyToBuffer(payload.body));
      return {
        bucket: payload.bucket,
        etag: "mock-diagnostics-etag",
      };
    },
  };
}

function objectMapKey(payload = {}) {
  return `${payload.bucket}:${payload.key}`;
}

async function bodyToBuffer(body) {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === "string") {
    return Buffer.from(body);
  }
  if (body && typeof body[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new TypeError("Unsupported mock S3 body.");
}

function assertNoS3Internals(payload, label) {
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /private-diagnostics-bucket|private-diagnostics-access-key|private-diagnostics-secret-key|objects\.diagnostics\.private\.invalid/i, `${label} should not expose S3 config values`);
  assert.doesNotMatch(serialized, /LONGTAIL_S3|storageKey|protectedPath|signedUrl|presigned|preSigned|directUpload|directDownload/i, `${label} should not expose storage internals or signed URLs`);
}

function createApi(baseUrl) {
  return {
    async get(url, options = {}) {
      return request(baseUrl, "GET", url, undefined, options);
    },
    async post(url, body, options = {}) {
      return request(baseUrl, "POST", url, body, options);
    },
  };
}

async function request(baseUrl, method, url, body, options = {}) {
  const headers = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";

  return {
    body: contentType.includes("application/json") && text ? JSON.parse(text) : null,
    headers: response.headers,
    status: response.status,
    text,
  };
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
