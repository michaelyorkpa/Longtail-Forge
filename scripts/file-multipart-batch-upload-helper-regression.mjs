/* global Blob, FormData, fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { readPayload } from "./test-support/http-payload-assertions.mjs";
import { requireJsonRecord } from "./test-support/json-record-assertions.mjs";

/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureApp} HttpFixtureApp */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer} HttpFixtureServer */

/** This client sends a form or a JSON string, so it names its own option bag. */
/** @typedef {{ contentType?: string, cookie?: string }} BatchClientOptions */

/**
 * One fixture response. The body stays `unknown` on purpose: JSON.parse would
 * hand back `any`, and every envelope read below would then be a claim the
 * compiler never checks.
 * @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureFetchResponse<unknown> & { text: string }} BatchResponse
 */

/**
 * @typedef {{
 *   postForm: (url: string, form: FormData, options?: BatchClientOptions) => Promise<BatchResponse>,
 *   postJson: (url: string, body: unknown, options?: BatchClientOptions) => Promise<BatchResponse>,
 * }} BatchApiClient
 */

/** The streamed batch route publishes the result the Files routes assemble; the JSON route publishes the service's. */
/** @typedef {import("../src/routes/files.routes.js").MultipartBatchResult} MultipartBatchEnvelope */
/** @typedef {import("../src/routes/files.routes.js").MultipartBatchEntry} MultipartBatchEntry */
/** @typedef {typeof import("../src/services/files.service.js").filesService} FilesService */
/** @typedef {Awaited<ReturnType<FilesService["uploadBatchAndAttach"]>>} JsonBatchEnvelope */

/** @typedef {Awaited<ReturnType<typeof seedFixtures>>} BatchFixtures */

/**
 * Narrow one batch entry to its accepted branch.
 *
 * The route publishes a per-file union, so an entry only carries a file record
 * when that file was actually stored; reading through it otherwise would be a
 * claim the compiler cannot check.
 * @param {MultipartBatchEntry} entry
 * @param {string} label
 * @returns {Extract<MultipartBatchEntry, { ok: true }>}
 */
function requireAcceptedEntry(entry, label) {
  assert.ok(entry.ok, `${label} should have been accepted: ${JSON.stringify(entry)}`);
  return entry;
}

/**
 * Narrow one batch entry to its refused branch.
 * @param {MultipartBatchEntry} entry
 * @param {string} label
 * @returns {Extract<MultipartBatchEntry, { ok: false }>}
 */
function requireRefusedEntry(entry, label) {
  assert.equal(entry.ok, false, `${label} should have been refused: ${JSON.stringify(entry)}`);
  return /** @type {Extract<MultipartBatchEntry, { ok: false }>} */ (entry);
}


const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-multipart-batch-"));

process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-multipart-batch.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "File-Multipart-Batch-Test-123!";

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
  const api = createApi(`http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (server.address()).port}`);

  await checkSuccessfulMultiFileUpload(api, fixtures);
  await checkPartialBatchFailure(api, fixtures);
  await checkMalformedFilePartBatchFailure(api, fixtures);
  await checkUnexpectedBatchFailureIsRedacted(api, fixtures);
  await checkJsonBatchRouteCompatibility(api, fixtures);
  await assertIntegrity();

  console.log("File multipart batch upload helper regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContracts() {
  const roadmap = readText("ROADMAP.md");
  const filesRoutes = readText("src/routes/files.routes.js");
  const filesService = readText("src/services/files.service.js");
  const filesRepository = readText("src/repositories/files.repo.js");
  const helper = readText("public/js/shared/file-attachments.js");
  const localStorageAdapter = readText("src/core/files/local-storage-adapter.js");
  const moduleContract = readText("docs/module-contract.md");
  const notesHtml = readText("views/protected/notes.html");
  const tasksHtml = readText("views/protected/tasks.html");
  const workbenchHtml = readText("views/protected/workbench.html");

  assert.match(filesRoutes, /filesRoutes\.post\("\/files\/upload\/batch"/, "Files routes should expose the streamed multipart batch route");
  assert.match(filesRoutes, /MAX_MULTIPART_BATCH_FILES = 50/, "Multipart batch uploads should keep a bounded file count");
  assert.match(filesRoutes, /function readMultipartBatchUpload/, "Files routes should own multipart batch parsing");
  assert.match(filesRoutes, /uploadStreamAndAttach/, "Multipart batch uploads should use the streamed Files lifecycle per file");
  assert.match(filesRoutes, /response\.status\(result\.failed > 0 \? 207 : 201\)/, "Multipart batch route should preserve partial-failure status semantics");
  assert.match(filesRoutes, /originalFilename: payload\.originalFilename/, "Multipart batch results should preserve per-file result labels");
  assert.match(filesRoutes, /function multipartBatchFailureResult/, "Multipart batch uploads should shape malformed file parts as per-file failures");
  assert.match(filesRoutes, /multipartBatchFailureResult\(\{[\s\S]*info[\s\S]*\}\)/, "Multipart batch malformed file parts should preserve their filename when available");
  assert.match(filesService, /assertStoredFileObjectExists\(file,[\s\S]*adapter\.metadata\(file\.storage_key\)/, "metadata() should remain an active storage adapter contract for download and preview pre-checks");
  assert.doesNotMatch(localStorageAdapter, /async quarantine\(/, "Local storage adapter should not expose unused quarantine() surface");
  assert.match(functionBlock(filesService, "quarantineFile"), /filesRepo\.quarantineFile/, "Quarantine service should delegate only the lifecycle write to the Files repository");
  assert.match(functionBlock(filesRepository, "quarantineFile"), /SET status = 'quarantined'[\s\S]*quarantine_reason = :quarantineReason/, "Quarantine remains DB lifecycle state until storage relocation is explicitly designed");

  assert.match(helper, /FormData/, "Attachment helper should build multipart form uploads");
  assert.match(helper, /postMultipartJson\("\/api\/files\/upload\/batch", buildUploadForm\(options, files\)\)/, "Attachment helper should prefer the streamed multipart batch route");
  assert.match(helper, /form\.append\("files", file, file\.name\)/, "Attachment helper should append selected files as streamed multipart file parts");
  assert.match(helper, /appendFormField\(form, "moduleId", options\.moduleId\)/, "Attachment helper should preserve module metadata before file parts");
  assert.match(helper, /appendFormField\(form, "targetType", options\.targetType\)/, "Attachment helper should preserve target type metadata before file parts");
  assert.match(helper, /appendFormField\(form, "targetId", options\.targetId\)/, "Attachment helper should preserve target ID metadata before file parts");
  assert.doesNotMatch(functionBlock(helper, "uploadFiles"), /readFileBase64|contentBase64|\/api\/files\/batch/, "Normal attachment helper uploads should no longer use base64 JSON");
  assert.doesNotMatch(helper, /FileReader|function readFileBase64/, "Attachment helper should not require FileReader for normal uploads");

  const resultItem = functionBlock(helper, "createUploadResultItem");
  assert.match(resultItem, /review pending/, "Upload results should keep pending-review copy visible");
  assert.match(resultItem, /data-file-upload-result/, "Upload results should keep stable success/error hooks");

  const uploadFiles = functionBlock(helper, "uploadFiles");
  assert.match(uploadFiles, /emit\(container, state, "uploadCompleted", result\)/, "Upload flow should preserve uploadCompleted callbacks");
  assert.match(uploadFiles, /emit\(container, state, "attachmentAdded", result\)/, "Upload flow should preserve attachmentAdded callbacks");
  assert.match(uploadFiles, /await refresh\(container, state\)/, "Upload flow should refresh the host attachment list after completion");

  assert.match(notesHtml, /js\/shared\/file-attachments\.js[\s\S]*js\/shared\/file-preview\.js/, "Notes should reference the streamed attachment helper");
  assert.match(tasksHtml, /js\/shared\/file-attachments\.js[\s\S]*js\/shared\/file-preview\.js/, "Tasks should reference the streamed attachment helper");
  assert.match(workbenchHtml, /js\/shared\/file-attachments\.js[\s\S]*js\/shared\/file-preview\.js/, "Workbench should reference the streamed attachment helper");
  assert.match(moduleContract, /As of 0\.33\.5\.22\.15[\s\S]*\/api\/files\/upload\/batch/, "module contract should record the streamed batch boundary");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
}

/** @param {BatchApiClient} api @param {BatchFixtures} fixtures */
async function checkSuccessfulMultiFileUpload(api, fixtures) {
  const response = await api.postForm("/api/files/upload/batch", createBatchForm(fixtures.multiTaskId, [
    { filename: "streamed-alpha.txt", text: "alpha streamed body" },
    { filename: "streamed-beta.txt", text: "beta streamed body" },
  ]), { cookie: fixtures.adminSessionId });

  assert.equal(response.status, 201, "streamed batch upload should accept multiple files");
  /** @type {MultipartBatchEnvelope} */
  const batch = readPayload(response, ["failed", "results", "succeeded", "total"], "POST /api/files/upload/batch");
  assert.equal(batch.total, 2);
  assert.equal(batch.succeeded, 2);
  assert.equal(batch.failed, 0);
  assert.deepEqual(batch.results.map((result) => result.ok), [true, true]);
  assert.deepEqual(batch.results.map((result) => result.originalFilename), ["streamed-alpha.txt", "streamed-beta.txt"]);

  for (const result of batch.results) {
    const accepted = requireAcceptedEntry(result, `batch entry ${result.index}`);
    assert.ok(accepted.file, `batch entry ${result.index} should carry its file record`);
    assert.equal(accepted.file.status, "pending");
    assert.equal(accepted.file.scanStatus, "pending");
    assert.equal(accepted.file.storageProvider, "local");
  }

  const attachmentRows = await querySql(`
SELECT files.original_filename, files.status, files.scan_status, file_attachments.target_id, file_attachments.metadata_json
FROM file_attachments
INNER JOIN files
  ON files.workspace_id = file_attachments.workspace_id
  AND files.file_id = file_attachments.file_id
WHERE file_attachments.target_id = ${sqlText(fixtures.multiTaskId)}
ORDER BY files.original_filename;
`);
  assert.equal(attachmentRows.length, 2);
  // The columns are named by the SELECT directly above, so the row shape is
  // read off the query rather than assumed.
  const attachments = /** @type {Array<{ metadata_json: string, original_filename: string, scan_status: string, status: string, target_id: string }>} */ (attachmentRows);
  assert.deepEqual(attachments.map((row) => row.original_filename), ["streamed-alpha.txt", "streamed-beta.txt"]);
  assert.deepEqual(attachments.map((row) => row.status), ["pending", "pending"]);
  assert.deepEqual(attachments.map((row) => row.scan_status), ["pending", "pending"]);
  assert.deepEqual(
    attachments.map((row) => /** @type {{ batch_index: number }} */ (
      requireJsonRecord(JSON.parse(row.metadata_json), "attachment metadata_json")
    ).batch_index),
    [0, 1],
  );
}

/** @param {BatchApiClient} api @param {BatchFixtures} fixtures */
async function checkPartialBatchFailure(api, fixtures) {
  const response = await api.postForm("/api/files/upload/batch", createBatchForm(fixtures.partialTaskId, [
    { filename: "partial-good.txt", text: "partial good body" },
    { filename: "partial-bad.exe", text: "partial bad body" },
  ]), { cookie: fixtures.adminSessionId });

  assert.equal(response.status, 207, "partial streamed batch failure should use multi-status response");
  /** @type {MultipartBatchEnvelope} */
  const partial = readPayload(response, ["failed", "results", "succeeded", "total"], "POST /api/files/upload/batch");
  assert.equal(partial.total, 2);
  assert.equal(partial.succeeded, 1);
  assert.equal(partial.failed, 1);
  const partialAccepted = requireAcceptedEntry(partial.results[0], "partial batch entry 0");
  assert.equal(partialAccepted.originalFilename, "partial-good.txt");
  const partialRefused = requireRefusedEntry(partial.results[1], "partial batch entry 1");
  assert.equal(partialRefused.originalFilename, "partial-bad.exe");
  assert.match(partialRefused.error, /extension|file type/i);

  const attachedRows = await querySql(`
SELECT files.original_filename, files.status, files.scan_status
FROM file_attachments
INNER JOIN files
  ON files.workspace_id = file_attachments.workspace_id
  AND files.file_id = file_attachments.file_id
WHERE file_attachments.target_id = ${sqlText(fixtures.partialTaskId)}
ORDER BY files.original_filename;
`);
  assert.equal(attachedRows.length, 1);
  assert.equal(attachedRows[0].original_filename, "partial-good.txt");
  assert.equal(attachedRows[0].status, "pending");
  assert.equal(attachedRows[0].scan_status, "pending");

  const badRows = await querySql(`
SELECT COUNT(*) AS count
FROM files
WHERE original_filename = 'partial-bad.exe';
`);
  assert.equal(Number(badRows[0].count), 0, "failed streamed batch items should not create file rows");
}

/** @param {BatchApiClient} api @param {BatchFixtures} fixtures */
async function checkMalformedFilePartBatchFailure(api, fixtures) {
  const form = new FormData();
  form.append("moduleId", "tasks");
  form.append("targetType", "task");
  form.append("targetId", fixtures.malformedTaskId);
  form.append("visibility", "private");
  form.append("files", new Blob(["valid streamed body"], {
    type: "text/plain",
  }), "malformed-part-good.txt");
  form.append("wrongFileField", new Blob(["wrong field body"], {
    type: "text/plain",
  }), "malformed-part-bad.txt");

  const response = await api.postForm("/api/files/upload/batch", form, { cookie: fixtures.adminSessionId });

  assert.equal(response.status, 207, "single malformed streamed batch file should use multi-status response");
  /** @type {MultipartBatchEnvelope} */
  const malformed = readPayload(response, ["failed", "results", "succeeded", "total"], "POST /api/files/upload/batch");
  assert.equal(malformed.total, 2);
  assert.equal(malformed.succeeded, 1);
  assert.equal(malformed.failed, 1);
  const malformedAccepted = requireAcceptedEntry(malformed.results[0], "malformed batch entry 0");
  assert.equal(malformedAccepted.originalFilename, "malformed-part-good.txt");
  const malformedRefused = requireRefusedEntry(malformed.results[1], "malformed batch entry 1");
  assert.equal(malformedRefused.originalFilename, "malformed-part-bad.txt");
  assert.match(malformedRefused.error, /file fields named 'files'/);

  const attachedRows = await querySql(`
SELECT files.original_filename, files.status, files.scan_status
FROM file_attachments
INNER JOIN files
  ON files.workspace_id = file_attachments.workspace_id
  AND files.file_id = file_attachments.file_id
WHERE file_attachments.target_id = ${sqlText(fixtures.malformedTaskId)}
ORDER BY files.original_filename;
`);
  assert.equal(attachedRows.length, 1);
  assert.equal(attachedRows[0].original_filename, "malformed-part-good.txt");
  assert.equal(attachedRows[0].status, "pending");
  assert.equal(attachedRows[0].scan_status, "pending");

  const badRows = await querySql(`
SELECT COUNT(*) AS count
FROM files
WHERE original_filename = 'malformed-part-bad.txt';
`);
  assert.equal(Number(badRows[0].count), 0, "malformed streamed batch file parts should not create file rows");
}

/** @param {BatchApiClient} api @param {BatchFixtures} fixtures */
async function checkUnexpectedBatchFailureIsRedacted(api, fixtures) {
  const originalAdapter = filesService.getFileStorageAdapter("local");
  filesService.registerFileStorageAdapter("local", {
    ...originalAdapter,
    async saveStream(readable) {
      for await (const _chunk of readable) {
        // Drain the request stream before simulating an unexpected provider failure.
      }
      throw new Error("unexpected-provider-secret storage/path/should-not-leak");
    },
  });

  let response;
  try {
    response = await api.postForm("/api/files/upload/batch", createBatchForm(fixtures.unexpectedFailureTaskId, [
      { filename: "unexpected-provider.txt", text: "unexpected provider failure" },
    ]), { cookie: fixtures.adminSessionId });
  } finally {
    filesService.registerFileStorageAdapter("local", originalAdapter);
  }

  assert.equal(response.status, 207);
  /** @type {MultipartBatchEnvelope} */
  const redacted = readPayload(response, ["failed", "results"], "POST /api/files/upload/batch");
  assert.equal(redacted.failed, 1);
  const redactedRefused = requireRefusedEntry(redacted.results[0], "redacted batch entry 0");
  assert.equal(redactedRefused.error, "Uploaded file could not be stored.");
  assert.equal(redactedRefused.status, 500);
  assert.doesNotMatch(JSON.stringify(response.body), /unexpected-provider-secret|storage\/path/i);
}

/** @param {BatchApiClient} api @param {BatchFixtures} fixtures */
async function checkJsonBatchRouteCompatibility(api, fixtures) {
  const response = await api.postJson("/api/files/batch", {
    files: [
      {
        contentBase64: Buffer.from("legacy json batch body").toString("base64"),
        originalFilename: "legacy-json-batch.txt",
      },
    ],
    moduleId: "tasks",
    targetId: fixtures.legacyTaskId,
    targetType: "task",
    visibility: "private",
  }, { cookie: fixtures.adminSessionId });

  assert.equal(response.status, 201, "legacy JSON batch upload route should remain available");
  /** @type {JsonBatchEnvelope} */
  const jsonBatch = readPayload(response, ["results", "succeeded", "total"], "POST /api/files/batch");
  assert.equal(jsonBatch.total, 1);
  assert.equal(jsonBatch.succeeded, 1);
  const jsonEntry = jsonBatch.results[0];
  assert.ok(jsonEntry.ok && jsonEntry.file, "the legacy JSON batch route should accept and publish its file");
  assert.equal(jsonEntry.file.originalFilename, "legacy-json-batch.txt");
  assert.equal(jsonEntry.file.status, "pending");
}

async function seedFixtures() {
  const admin = await readSeedAdmin();
  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;
  const taskIds = {
    legacyTaskId: randomUUID(),
    malformedTaskId: randomUUID(),
    multiTaskId: randomUUID(),
    partialTaskId: randomUUID(),
    unexpectedFailureTaskId: randomUUID(),
  };

  for (const [name, taskId] of Object.entries(taskIds)) {
    await createTask({
      taskId,
      title: `Multipart batch ${name}`,
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

/** @param {{ taskId: string, title: string, userId: string, workspaceId: string }} options */
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

/** @param {string} taskId @param {Array<{ filename: string, mimeType?: string, text: string }>} files */
function createBatchForm(taskId, files) {
  const form = new FormData();
  form.append("moduleId", "tasks");
  form.append("targetType", "task");
  form.append("targetId", taskId);
  form.append("visibility", "private");

  for (const file of files) {
    form.append("files", new Blob([file.text], {
      type: file.mimeType || "text/plain",
    }), file.filename);
  }

  return form;
}

/** @param {string} baseUrl @returns {BatchApiClient} */
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

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {BodyInit} body
 * @param {BatchClientOptions} [options]
 * @returns {Promise<BatchResponse>}
 */
async function request(baseUrl, method, url, body, options = {}) {
  /** @type {Record<string, string>} */
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

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

/** @param {HttpFixtureApp} app @returns {Promise<HttpFixtureServer>} */
function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(app);
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

/** @param {string} source @param {string} functionName */
function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
