/* global fetch */

import { escapeRegExp } from "./test-support/source-scan.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fixtureString } from "./test-support/session-fixtures.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readTextAsync: readText } = createProjectTextReader();
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { readPayload } from "./test-support/http-payload-assertions.mjs";

/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureApp} HttpFixtureApp */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureClientOptions} EgressClientOptions */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer} HttpFixtureServer */

/**
 * One fixture response. The body stays `unknown` on purpose: JSON.parse would
 * hand back `any`, and every envelope read below would then be a claim the
 * compiler never checks.
 * @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureFetchResponse<unknown> & { text: string }} EgressResponse
 */

/** @typedef {{ get: (url: string, options?: EgressClientOptions) => Promise<EgressResponse> }} EgressApiClient */

/** @typedef {typeof import("../src/services/files.service.js").filesService} FilesService */
/** @typedef {{ error: import("../src/types/framework-contracts.js").ApiErrorDetails }} EgressErrorEnvelope */
/** @typedef {import("../src/types/database-contracts.js").DatabaseRow} DatabaseRow */

/** @typedef {Awaited<ReturnType<typeof seedFixtures>>} StreamedFixtures */
/** @typedef {StreamedFixtures["session"]} StreamedSession */

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


const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-streamed-validation-"));

process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-streamed-validation.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "File-Streamed-Validation-Test-123!";

const { config } = await import("../src/config.js");
const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");
const { filesService } = await import("../src/services/files.service.js");

let server;

try {
  await assertStaticContracts();
  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (server.address()).port}`);

  await assertWrongTypeStreamRejectedWithoutRows(fixtures.session, fixtures.taskId);
  await assertPostWriteMismatchCleanup(fixtures.session, fixtures.taskId);
  await assertMissingStorageObjectReturnsClean404(api, fixtures);
  await assertIntegrity();

  console.log("File streamed validation and download metadata regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertStaticContracts() {
  const [
    moduleContract,
    moduleDevelopment,
    runtimeDocs,
    filesServiceSource,
    s3AdapterSource,
  ] = await Promise.all([
    readText("docs/module-contract.md"),
    readText("docs/module-development.md"),
    readText("docs/runtime-configuration.md"),
    readText("src/services/files.service.js"),
    readText("src/core/files/s3-storage-adapter.js"),
  ]);

  assert.match(moduleContract, /metadata pre-checks/, "module contract should describe route-backed storage metadata prechecks");
  assert.match(moduleDevelopment, /streamed upload signature validation/, "module docs should describe service-owned streamed validation");
  assert.match(runtimeDocs, /metadata pre-checks/, "runtime docs should describe storage object drift handling");
  assert.match(filesServiceSource, /assertStoredFileObjectExists/, "Files service should precheck storage metadata before reads");
  assert.match(filesServiceSource, /deleteRejectedUploadStorage/, "Files service should await and log rejected-upload cleanup");
  assert.match(filesServiceSource, /validateStreamedUploadSample/, "Files service should validate streamed upload samples during the stream");
  assert.match(s3AdapterSource, /isS3ObjectNotFoundError/, "S3 adapter should normalize missing objects to 404");
  }

/** @param {StreamedSession} session @param {string} taskId */
async function assertWrongTypeStreamRejectedWithoutRows(session, taskId) {
  const beforeFiles = await listStoredFiles(config.storage.localRoot);
  await assertRejectedUpload(
    () => filesService.uploadStreamAndAttach(session, streamedPayload(taskId, {
      chunks: [Buffer.from("not-a-png")],
      mimeType: "image/png",
      originalFilename: "wrong-type-stream.png",
    })),
    400,
    /does not match the allowed file type/i,
    "sampled wrong-type streamed upload should reject before creating rows",
  );
  await assertNoFileOrAttachmentForOriginalFilename("wrong-type-stream.png");
  assert.deepEqual(await listStoredFiles(config.storage.localRoot), beforeFiles, "wrong-type streamed upload should not leave a stored local object");
}

/** @param {StreamedSession} session @param {string} taskId */
async function assertPostWriteMismatchCleanup(session, taskId) {
  const beforeFiles = await listStoredFiles(config.storage.localRoot);
  await assertRejectedUpload(
    () => filesService.uploadStreamAndAttach(session, streamedPayload(taskId, {
      chunks: [Buffer.from("%P")],
      mimeType: "application/pdf",
      originalFilename: "short-invalid-stream.pdf",
    })),
    400,
    /does not match the allowed file type/i,
    "short wrong-type streamed upload should reject after final sample validation",
  );
  await assertNoFileOrAttachmentForOriginalFilename("short-invalid-stream.pdf");
  assert.deepEqual(await listStoredFiles(config.storage.localRoot), beforeFiles, "post-write mismatch cleanup should delete the rejected local object");
}

/** @param {EgressApiClient} api @param {StreamedFixtures} fixtures */
async function assertMissingStorageObjectReturnsClean404(api, fixtures) {
  const upload = await filesService.uploadAndAttach(fixtures.session, {
    contentBase64: Buffer.from("metadata drift preview text").toString("base64"),
    displayName: "Metadata Drift",
    mimeType: "text/plain",
    moduleId: "tasks",
    originalFilename: "metadata-drift.txt",
    targetId: fixtures.taskId,
    targetType: "task",
    visibility: "private",
  });
  const uploadedFile = requireFile(upload, "streamed upload fixture");
  await runSql(`
UPDATE files
SET status = 'available',
    scan_status = 'not_required'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND file_id = ${sqlText(uploadedFile.fileId)};
`);

  const storedFile = await readFileRow(fixtures.workspaceId, uploadedFile.fileId);
  assert.ok(storedFile?.storage_key, "uploaded fixture should have a storage key before deleting the object");
  await filesService.getFileStorageAdapter(fixtureString(storedFile.storage_provider, "storage provider ID")).delete(fixtureString(storedFile.storage_key, "storage key"));

  const download = await api.get(`/api/files/${uploadedFile.fileId}/download`, {
    cookie: fixtures.sessionId,
  });
  assert.equal(download.status, 404, download.text);
  /** @type {EgressErrorEnvelope} */
  const downloadError = readPayload(download, ["error"], "GET /api/files/:fileId/download");
  assert.equal(downloadError.error.code, "not_found");
  assert.match(downloadError.error.message, /no longer available/i, "download of missing storage object should return a clean 404");
  assert.equal(downloadError.error.requestId, download.headers.get("x-request-id"));

  const preview = await api.get(`/api/files/attachments/${upload.attachment.fileAttachmentId}/preview/content`, {
    cookie: fixtures.sessionId,
  });
  assert.equal(preview.status, 404, preview.text);
  /** @type {EgressErrorEnvelope} */
  const previewError = readPayload(preview, ["error"], "GET /api/files/attachments/:fileAttachmentId/preview/content");
  assert.equal(previewError.error.code, "not_found");
  assert.match(previewError.error.message, /no longer available/i, "preview of missing storage object should return a clean 404");
  assert.equal(previewError.error.requestId, preview.headers.get("x-request-id"));
  assertNoUnsafeStorageLeak([download.body, preview.body]);
}

/**
 * @param {() => Promise<unknown>} uploadFn
 * @param {number} statusCode
 * @param {RegExp} messagePattern
 * @param {string} description
 */
async function assertRejectedUpload(uploadFn, statusCode, messagePattern, description) {
  await assert.rejects(
    uploadFn,
    (error) => {
      const denial = /** @type {{ message?: string, statusCode?: number }} */ (error);
      assert.equal(denial.statusCode, statusCode, description);
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
  /** @type {{ count: number }} */
  const orphanRow = requireFirstRow(orphanRows, "orphaned attachment count");
  assert.equal(Number(orphanRow.count), 0, "failed streamed uploads should not leave orphaned attachments");
}

/** @param {string} targetId @param {{ chunks?: Buffer[], mimeType: string, originalFilename: string }} options */
function streamedPayload(targetId, options) {
  return {
    displayName: options.originalFilename,
    fileStream: Readable.from(options.chunks || [Buffer.from("streamed validation body")]),
    filename: options.originalFilename,
    mimeType: options.mimeType,
    moduleId: "tasks",
    originalFilename: options.originalFilename,
    targetId,
    targetType: "task",
    visibility: "private",
  };
}

async function seedFixtures() {
  const admin = await readSeedAdmin();
  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;
  const taskId = randomUUID();
  await createTask({
    taskId,
    title: "File streamed validation task",
    userId: admin.user_id,
    workspaceId,
  });
  const sessionPayload = {
    active_workspace_id: workspaceId,
    display_name: admin.display_name,
    home_workspace_id: admin.home_workspace_id,
    timezone: admin.timezone || "America/New_York",
    user_id: admin.user_id,
    username: admin.username,
  };
  /** @type {import("../src/types/http-contracts.js").WorkspaceRequestSession} */
  const session = {
    ...sessionPayload,
    ip_address: "127.0.0.1",
    password_change_required: false,
    session_mode: "normal",
    workspace_id: workspaceId,
  };
  const persistedSession = await createSession(sessionPayload);

  return {
    session,
    sessionId: persistedSession.sessionId,
    taskId,
    workspaceId,
  };
}

async function readSeedAdmin() {
  const rows = await querySql(`
SELECT user_id, username, display_name, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  /** @type {{ active_workspace_id: string, display_name: string, home_workspace_id: string, timezone: string, user_id: string, username: string }} */
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

/** @param {string} workspaceId @param {string} fileId @returns {Promise<DatabaseRow | null>} */
async function readFileRow(workspaceId, fileId) {
  const rows = await querySql(`
SELECT *
FROM files
WHERE workspace_id = ${sqlText(workspaceId)}
  AND file_id = ${sqlText(fileId)}
LIMIT 1;
`);
  return rows[0] || null;
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

/** @param {string} baseUrl @returns {EgressApiClient} */
function createApi(baseUrl) {
  return {
    get: (url, options = {}) => requestJson(baseUrl, "GET", url, null, options),
  };
}

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {unknown} [body]
 * @param {EgressClientOptions} [options]
 * @returns {Promise<EgressResponse>}
 */
async function requestJson(baseUrl, method, url, body = null, options = {}) {
  /** @type {Record<string, string>} */
  const headers = {};
  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
    redirect: "manual",
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

/** @param {unknown[]} values */
function assertNoUnsafeStorageLeak(values) {
  const text = JSON.stringify(values);
  for (const forbidden of ["storageKey", "storage_key", "protectedPath", "signedUrl", "sha256", config.storage.localRoot]) {
    assert.doesNotMatch(text, new RegExp(escapeRegExp(forbidden), "i"), `response should not expose ${forbidden}`);
  }
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
      resolve(undefined);
    });
  });
}

