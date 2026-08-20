/* global Blob, FormData, fetch */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { readPayload } from "./test-support/http-payload-assertions.mjs";

/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureApp} HttpFixtureApp */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureClientOptions} MultipartClientOptions */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer} HttpFixtureServer */

/**
 * One fixture response. The body stays `unknown` on purpose: JSON.parse would
 * hand back `any`, and every envelope read below would then be a claim the
 * compiler never checks.
 * @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureFetchResponse<unknown> & { text: string }} MultipartResponse
 */

/**
 * @typedef {{
 *   post: (url: string, body?: unknown, options?: MultipartClientOptions) => Promise<MultipartResponse>,
 *   postForm: (url: string, form: FormData, options?: MultipartClientOptions) => Promise<MultipartResponse>,
 * }} MultipartApiClient
 */

/** The multipart route publishes the streamed upload result the Files service builds. */
/** @typedef {typeof import("../src/services/files.service.js").filesService} FilesService */
/** @typedef {Awaited<ReturnType<FilesService["uploadStreamAndAttach"]>>} MultipartUploadEnvelope */
/** @typedef {Awaited<ReturnType<FilesService["uploadAndAttach"]>>} FileUploadEnvelope */
/** @typedef {{ error: import("../src/types/framework-contracts.js").ApiErrorDetails }} MultipartErrorEnvelope */

/** @typedef {Awaited<ReturnType<typeof seedFixtures>>} MultipartFixtures */

/**
 * Narrow an upload envelope to the file record it must be carrying.
 *
 * The service publishes `file` as nullable because a refused upload produces
 * none, so every read through it here is a claim the route accepted the work.
 * @template {{ file: unknown }} Envelope
 * @param {Envelope} envelope
 * @param {string} label
 * @returns {NonNullable<Envelope["file"]>}
 */
function requireFile(envelope, label) {
  assert.ok(envelope.file, `${label} should carry its file record`);
  return envelope.file;
}


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
  const api = createApi(`http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (server.address()).port}`);

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
  const roadmap = readText("ROADMAP.md");
  const moduleDocs = readText("docs/module-development.md");
  const runtimeDocs = readText("docs/runtime-configuration.md");
  const filesRoutes = readText("src/routes/files.routes.js");
  const filesServiceSource = readText("src/services/files.service.js");

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
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
}

/** @param {MultipartApiClient} api @param {MultipartFixtures} fixtures */
async function checkStreamedUploadCreatesPendingFile(api, fixtures) {
  const bodyText = "streamed multipart route body";
  const response = await api.postForm("/api/files/upload", createUploadForm(fixtures.streamTaskId, {
    attachmentMetadata: { source: "multipart-regression" },
    displayName: "Streamed Evidence",
    filename: "streamed-evidence.txt",
    text: bodyText,
  }), { cookie: fixtures.adminSessionId });

  assert.equal(response.status, 201, "multipart upload should create a file attachment");
  /** @type {MultipartUploadEnvelope} */
  const uploaded = readPayload(response, ["attachment", "file"], "POST /api/files/upload");
  const uploadedFile = requireFile(uploaded, "POST /api/files/upload");
  assert.equal(uploadedFile.originalFilename, "streamed-evidence.txt");
  assert.equal(uploadedFile.displayName, "Streamed Evidence");
  assert.equal(uploadedFile.status, "pending");
  assert.equal(uploadedFile.scanStatus, "pending");
  assert.equal(uploadedFile.storageProvider, "local");
  assert.equal(uploaded.attachment.targetType, "task");
  assert.equal(uploaded.attachment.targetId, fixtures.streamTaskId);
  assert.doesNotMatch(JSON.stringify(response.body), /storageKey|protectedPath|signedUrl/i, "multipart response must not expose storage internals");

  const fileRows = await querySql(`
SELECT storage_provider, storage_key, original_filename, display_name, file_size_bytes, sha256_hash, status, scan_status
FROM files
WHERE file_id = ${sqlText(uploadedFile.fileId)};
`);
  assert.equal(fileRows.length, 1);
  /** @type {{ display_name: string, file_size_bytes: number, original_filename: string, scan_status: string, sha256_hash: string, status: string, storage_key: string, storage_provider: string }} */
  const fileRow = requireFirstRow(fileRows, "stored streamed file");
  assert.equal(fileRow.storage_provider, "local");
  assert.ok(fileRow.storage_key, "stored streamed files should keep a storage key in the database");
  assert.equal(fileRow.original_filename, "streamed-evidence.txt");
  assert.equal(fileRow.display_name, "Streamed Evidence");
  assert.equal(Number(fileRow.file_size_bytes), Buffer.byteLength(bodyText));
  assert.equal(fileRow.sha256_hash, createHash("sha256").update(bodyText).digest("hex"));
  assert.equal(fileRow.status, "pending");
  assert.equal(fileRow.scan_status, "pending");

  const attachmentRows = await querySql(`
SELECT metadata_json, target_type, target_id
FROM file_attachments
WHERE file_id = ${sqlText(uploadedFile.fileId)};
`);
  assert.equal(attachmentRows.length, 1);
  /** @type {{ metadata_json: string, target_id: string, target_type: string }} */
  const attachmentRow = requireFirstRow(attachmentRows, "streamed file attachment");
  assert.equal(attachmentRow.target_type, "task");
  assert.equal(attachmentRow.target_id, fixtures.streamTaskId);
  assert.deepEqual(JSON.parse(attachmentRow.metadata_json), { source: "multipart-regression" });

  const scanJobs = await querySql(`
SELECT status, attempt_count, payload_json
FROM jobs
WHERE job_type = 'file.scan'
  AND payload_json LIKE ${sqlText(`%"fileId":"${uploadedFile.fileId}"%`)};
`);
  assert.equal(scanJobs.length, 1);
  /** @type {{ attempt_count: number, payload_json: string, status: string }} */
  const scanJob = requireFirstRow(scanJobs, "queued scan job");
  assert.equal(scanJob.status, "pending");
  assert.equal(Number(scanJob.attempt_count), 0);
  assert.match(scanJob.payload_json, /"source":"file_upload"/);
}

/** @param {MultipartApiClient} api @param {MultipartFixtures} fixtures */
async function checkJsonUploadContractRemainsAvailable(api, fixtures) {
  const response = await api.post("/api/files", uploadPayload(fixtures.jsonTaskId), {
    cookie: fixtures.adminSessionId,
  });

  assert.equal(response.status, 201, "existing JSON upload route should remain available");
  /** @type {FileUploadEnvelope} */
  const jsonUpload = readPayload(response, ["attachment", "file"], "POST /api/files");
  const jsonUploadFile = requireFile(jsonUpload, "POST /api/files");
  assert.equal(jsonUploadFile.originalFilename, "json-still-works.txt");
  assert.equal(jsonUploadFile.status, "pending");
  assert.equal(jsonUploadFile.scanStatus, "pending");
}

/** @param {MultipartApiClient} api @param {MultipartFixtures} fixtures */
async function checkOversizedStreamedUploadIsRejected(api, fixtures) {
  const beforeFiles = await listStoredFiles(config.storage.localRoot);
  const response = await api.postForm("/api/files/upload", createUploadForm(fixtures.oversizedTaskId, {
    filename: "too-large.txt",
    text: "x".repeat((5 * 1024 * 1024) + 1),
  }), { cookie: fixtures.adminSessionId });

  assert.equal(response.status, 413, "oversized streamed upload should be rejected");
  /** @type {MultipartErrorEnvelope} */
  const oversized = readPayload(response, ["error"], "POST /api/files/upload");
  assert.match(oversized.error.message, /exceeds the allowed size/i);
  await assertNoFileOrAttachmentForOriginalFilename("too-large.txt");
  assert.deepEqual(
    await listStoredFiles(config.storage.localRoot),
    beforeFiles,
    "oversized streamed upload should not leave a usable local storage file",
  );
}

/** @param {MultipartApiClient} api @param {MultipartFixtures} fixtures */
async function checkParseFailureLeavesNoAttachment(api, fixtures) {
  const form = new FormData();
  form.append("moduleId", "tasks");
  form.append("targetType", "task");
  form.append("file", new Blob(["missing target"], { type: "text/plain" }), "missing-target.txt");

  const response = await api.postForm("/api/files/upload", form, { cookie: fixtures.adminSessionId });

  assert.equal(response.status, 400, "metadata parse failure should reject the upload");
  /** @type {MultipartErrorEnvelope} */
  const parseFailure = readPayload(response, ["error"], "POST /api/files/upload");
  assert.match(parseFailure.error.message, /metadata fields must be sent before the file field/i);
  await assertNoFileOrAttachmentForOriginalFilename("missing-target.txt");
}

/** @param {MultipartApiClient} api @param {MultipartFixtures} fixtures */
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

  /** @type {MultipartResponse | undefined} */
  let response;
  try {
    response = await api.postForm("/api/files/upload", createUploadForm(fixtures.storageFailureTaskId, {
      filename: "storage-fails.txt",
      text: "storage should fail",
    }), { cookie: fixtures.adminSessionId });
  } finally {
    filesService.registerFileStorageAdapter("local", originalAdapter);
  }

  assert.ok(response, "the storage-failure probe should have produced a response");
  assert.equal(response.status, 503, "storage failures should reject the streamed upload");
  /** @type {MultipartErrorEnvelope} */
  const storageFailure = readPayload(response, ["error"], "POST /api/files/upload");
  assert.equal(storageFailure.error.code, "service_unavailable");
  assert.equal(storageFailure.error.message, "The service is temporarily unavailable.");
  await assertNoFileOrAttachmentForOriginalFilename("storage-fails.txt");
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

  /** @type {{ active_workspace_id: string, home_workspace_id: string, timezone: string, user_id: string, username: string }} */
  const admin = requireFirstRow(rows, "protected admin");
  assert.ok(admin.user_id, "fresh database should seed a protected admin");
  return admin;
}

/** @param {{ clientId?: string | null, projectId?: string | null, taskId: string, title: string, userId: string, workspaceId: string }} options */
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

/** @param {string} taskId @param {{ attachmentMetadata?: Record<string, unknown>, displayName?: string, filename?: string, mimeType?: string, text?: string }} [options] */
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

/** @param {string} taskId */
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

/** @param {string} baseUrl @returns {MultipartApiClient} */
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

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {unknown} body
 * @param {MultipartClientOptions} [options]
 * @returns {Promise<MultipartResponse>}
 */
async function requestJson(baseUrl, method, url, body, options = {}) {
  /** @type {Record<string, string>} */
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

/**
 * @param {string} baseUrl
 * @param {string} url
 * @param {FormData} form
 * @param {MultipartClientOptions} [options]
 * @returns {Promise<MultipartResponse>}
 */
async function requestForm(baseUrl, url, form, options = {}) {
  /** @type {Record<string, string>} */
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

/** @param {Response} response @returns {Promise<MultipartResponse>} */
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

/** @param {string} directory */
async function listStoredFiles(directory) {
  /** @type {string[]} */
  const files = [];

  /** @param {string} currentDirectory */
  async function walk(currentDirectory) {
    let entries;
    try {
      entries = await fs.readdir(currentDirectory, { withFileTypes: true });
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error)?.code === "ENOENT") {
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

/** @param {HttpFixtureApp} app @returns {Promise<HttpFixtureServer>} */
function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(/** @type {import("node:http").RequestListener} */ (/** @type {unknown} */ (app)));
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

/** @param {HttpFixtureServer} serverInstance @returns {Promise<void>} */
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
