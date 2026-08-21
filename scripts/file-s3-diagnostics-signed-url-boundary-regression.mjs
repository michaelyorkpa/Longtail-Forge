/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readTextAsync: readText } = createProjectTextReader();

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
const { requireFirstRow } = await import("./test-support/database-row-assertions.mjs");
const { readPayload } = await import("./test-support/http-payload-assertions.mjs");
const { requirePackageManifest } = await import("./test-support/package-manifest-assertions.mjs");

/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureApp} HttpFixtureApp */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureClientOptions} S3ClientOptions */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer} HttpFixtureServer */

/**
 * One fixture response. The body stays `unknown` on purpose: JSON.parse would
 * hand back `any`, and every envelope read below would then be a claim the
 * compiler never checks.
 * @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureFetchResponse<unknown> & { text: string }} S3Response
 */

/**
 * @typedef {{
 *   get: (url: string, options?: S3ClientOptions) => Promise<S3Response>,
 *   post: (url: string, body?: unknown, options?: S3ClientOptions) => Promise<S3Response>,
 * }} S3ApiClient
 */

/** The mock stands in for the client the production adapter consumes, so it is typed against that contract rather than into agreement with this test. */
/** @typedef {import("../src/core/files/s3-storage-adapter.js").S3Client} S3Client */
/** @typedef {import("../src/core/files/s3-storage-adapter.js").S3ClientResult} S3ClientResult */

/** The route envelopes this owner reads, from the services that publish them. */
/** @typedef {typeof import("../src/services/files.service.js").filesService} FilesService */
/** @typedef {Awaited<ReturnType<FilesService["uploadAndAttach"]>>} FileUploadEnvelope */
/** @typedef {Awaited<ReturnType<FilesService["readAttachmentPreviewDescriptor"]>>} PreviewDescriptorEnvelope */
/** @typedef {import("../src/types/files-preview-contracts.js").FilePreviewTextResponse} PreviewTextEnvelope */
/** @typedef {{ diagnostics: { storage: { health: { available: boolean, status: string }, provider: string, rootLocation: string | null } } }} RuntimeDiagnosticsEnvelope */

/**
 * Narrow an upload envelope to the file record it must be carrying.
 * @template {{ file: unknown }} Envelope
 * @param {Envelope} envelope
 * @param {string} label
 * @returns {NonNullable<Envelope["file"]>}
 */
function requireFile(envelope, label) {
  assert.ok(envelope.file, `${label} should carry its file record`);
  return envelope.file;
}

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
  const api = createApi(`http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (server.address()).port}`);

  const diagnosticsResponse = await api.get("/api/runtime-diagnostics", { cookie: fixtures.adminSessionId });
  assert.equal(diagnosticsResponse.status, 200, "workspace settings managers should read S3 runtime diagnostics");
  /** @type {RuntimeDiagnosticsEnvelope} */
  const diagnostics = readPayload(diagnosticsResponse, ["diagnostics"], "GET /api/runtime-diagnostics");
  assertS3Diagnostics(diagnostics.diagnostics);

  const uploadResponse = await api.post("/api/files", uploadPayload(fixtures.taskId), {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(uploadResponse.status, 201, "S3-backed uploads should still return the normal Files JSON read model");
  /** @type {FileUploadEnvelope} */
  const uploaded = readPayload(uploadResponse, ["attachment", "file"], "POST /api/files");
  const uploadedFile = requireFile(uploaded, "POST /api/files");
  assert.equal(uploadedFile.storageProvider, "s3", "S3 uploads should expose only the safe provider id");
  assertNoS3Internals(uploadResponse.body, "S3 upload response");

  const scanSummary = await runJobWorkerOnce({
    claimLimit: 5,
    mode: "inline",
    workerId: "file-s3-diagnostics-boundary",
  });
  assert.equal(scanSummary.completed >= 1, true, "S3-backed upload scan handoff should complete before preview/download checks");

  const fileResponse = await api.get(`/api/files/${uploadedFile.fileId}`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(fileResponse.status, 200, "file read route should return the safe S3 read model");
  assertNoS3Internals(fileResponse.body, "S3 file read response");

  const attachmentsResponse = await api.get(`/api/files/attachments?moduleId=tasks&targetType=task&targetId=${encodeURIComponent(fixtures.taskId)}`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(attachmentsResponse.status, 200, "attachment list should return safe route-backed rows");
  assertNoS3Internals(attachmentsResponse.body, "S3 attachment list response");

  const attachmentId = uploaded.attachment.fileAttachmentId;
  const previewResponse = await api.get(`/api/files/attachments/${encodeURIComponent(attachmentId)}/preview`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(previewResponse.status, 200, "preview descriptor should stay route-backed for S3 files");
  /** @type {PreviewDescriptorEnvelope} */
  const previewDescriptor = readPayload(previewResponse, ["preview"], "GET /api/files/attachments/:fileAttachmentId/preview");
  assert.match(previewDescriptor.preview.contentUrl || "", /^\/api\/files\/attachments\/[^/]+\/preview\/content$/, "preview content should use the Longtail Forge route");
  assertNoS3Internals(previewResponse.body, "S3 preview descriptor response");

  const previewContentResponse = await api.get(`/api/files/attachments/${encodeURIComponent(attachmentId)}/preview/content`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(previewContentResponse.status, 200, "preview content should read through the Longtail Forge route");
  /** @type {PreviewTextEnvelope} */
  const previewContent = readPayload(previewContentResponse, ["content", "preview"], "GET /api/files/attachments/:fileAttachmentId/preview/content");
  assert.equal(previewContent.content.text, "S3 diagnostics boundary body", "preview content should stream through the registered S3 adapter");
  assertNoS3Internals(previewContentResponse.body, "S3 preview content response");

  const downloadResponse = await api.get(`/api/files/${encodeURIComponent(uploadedFile.fileId)}/download`, {
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
    runtimeDocs,
    sqliteDocs,
    moduleContract,
    moduleDevelopment,
    filesServiceSource,
    filesPreviewServiceSource,
    filesRoutesSource,
    runtimeDiagnosticsSource,
    workspaceSettingsScript,
  ] = await Promise.all([
    readJson("package.json"),
    readText("docs/runtime-configuration.md"),
    readText("docs/sqlite-small-office-mode.md"),
    readText("docs/module-contract.md"),
    readText("docs/module-development.md"),
    readText("src/services/files.service.js"),
    readText("src/services/files-preview.service.js"),
    readText("src/routes/files.routes.js"),
    readText("src/services/runtime-diagnostics.service.js"),
    readText("public/js/workspace-settings.js"),
  ]);

  assert.equal(Object.keys(requirePackageManifest(packageJson).dependencies || {}).some((name) => /aws-sdk|client-s3/i.test(name)), false, "this boundary should not add an S3 SDK dependency");

  assert.match(runtimeDocs, /S3 bucket names[\s\S]*must not appear in diagnostics/, "runtime docs should record the S3 diagnostics redaction boundary");
  assert.match(runtimeDocs, /No direct\/presigned S3 upload or download route is implemented/, "runtime docs should keep signed URL implementation out of scope");
  assert.match(sqliteDocs, /local-vs-S3 deployment guidance/i, "SQLite docs should include local-vs-S3 deployment guidance");
  assert.match(moduleContract, /signed URL exception[\s\S]*permission-checked[\s\S]*expir/, "module contract should describe future signed URL exception rules");
  assert.match(moduleDevelopment, /Normal module payloads[\s\S]*must not expose signed URLs/, "module docs should keep modules behind Files routes");

  assert.match(runtimeDiagnosticsSource, /readSafeStorageHealth/, "runtime diagnostics should use the safe storage health read model");
  assert.doesNotMatch(runtimeDiagnosticsSource, /LONGTAIL_S3|S3_BUCKET|S3_ENDPOINT|accessKey|secretAccessKey/i, "runtime diagnostics source should not expose S3 runtime settings");
  assert.doesNotMatch(workspaceSettingsScript, /LONGTAIL_S3|S3_BUCKET|S3_ENDPOINT|accessKey|secretAccessKey|signedUrl|presigned/i, "Workspace Settings should not expose S3 internals or signed URLs");

  assert.match(filesServiceSource, /permissionsService\.assertCan\(session, "files\.download"/, "downloads should keep the existing Files permission boundary");
  assert.match(filesPreviewServiceSource, /previewContentUrlForAttachment[\s\S]*\/api\/files\/attachments/, "preview descriptors should use Longtail Forge routes");
  assert.doesNotMatch(filesServiceSource + filesPreviewServiceSource + filesRoutesSource, /signedUrl|presigned|preSigned|createPresigned|directUpload|directDownload/i, "Files service/routes should not add signed URL behavior in this slice");
  assert.doesNotMatch(runtimeDocs + sqliteDocs + moduleContract + moduleDevelopment, /private-diagnostics-bucket|private-diagnostics-access-key|private-diagnostics-secret-key|objects\.diagnostics\.private\.invalid/i, "docs should not leak regression S3 config values");
}

/** @param {RuntimeDiagnosticsEnvelope["diagnostics"]} diagnostics */
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

  /** @type {{ active_workspace_id: string, home_workspace_id: string, timezone: string, user_id: string, username: string }} */
  const admin = requireFirstRow(rows, "protected admin");
  assert.ok(admin.user_id, "fresh database should seed a protected admin");
  return admin;
}

/** @param {{ userId: string, workspaceId: string }} options */
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

/** @param {string} taskId */
function uploadPayload(taskId) {
  return {
    contentBase64: Buffer.from("S3 diagnostics boundary body").toString("base64"),
    moduleId: "tasks",
    originalFilename: "s3-diagnostics-boundary.txt",
    targetId: taskId,
    targetType: "task",
  };
}

/** @returns {S3Client} */
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
    async putObject(payload) {
      objects.set(objectMapKey(payload), await bodyToBuffer(payload.body));
      return {
        bucket: payload.bucket,
        etag: "mock-diagnostics-etag",
      };
    },
  };
}

/** @param {Record<string, unknown>} payload */
function objectMapKey(payload) {
  return `${payload.bucket}:${payload.key}`;
}

/** @param {unknown} body @returns {Promise<Buffer>} */
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
  // The adapter may hand the client a stream, so the mock probes for one
  // rather than assuming the shape the rest of this test happens to send.
  if (body && typeof (/** @type {Partial<AsyncIterable<unknown>>} */ (body))[Symbol.asyncIterator] === "function") {
    /** @type {Buffer[]} */
    const chunks = [];
    for await (const chunk of /** @type {AsyncIterable<Buffer | string>} */ (body)) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new TypeError("Unsupported mock S3 body.");
}

/** @param {unknown} payload @param {string} label */
function assertNoS3Internals(payload, label) {
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /private-diagnostics-bucket|private-diagnostics-access-key|private-diagnostics-secret-key|objects\.diagnostics\.private\.invalid/i, `${label} should not expose S3 config values`);
  assert.doesNotMatch(serialized, /LONGTAIL_S3|storageKey|protectedPath|signedUrl|presigned|preSigned|directUpload|directDownload/i, `${label} should not expose storage internals or signed URLs`);
}

/** @param {string} baseUrl @returns {S3ApiClient} */
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

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {unknown} body
 * @param {S3ClientOptions} [options]
 * @returns {Promise<S3Response>}
 */
async function request(baseUrl, method, url, body, options = {}) {
  /** @type {Record<string, string>} */
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

/** @param {HttpFixtureApp} app @returns {Promise<HttpFixtureServer>} */
function listen(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(/** @type {import("node:http").RequestListener} */ (/** @type {unknown} */ (app)));
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/** @param {HttpFixtureServer} server @returns {Promise<void>} */
function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(undefined);
    });
  });
}

/**
 * Filesystem JSON enters as `unknown`; callers narrow at the point of use.
 * @param {string} relativePath
 * @returns {Promise<unknown>}
 */
async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}
