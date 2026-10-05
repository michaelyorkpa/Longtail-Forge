import { escapeRegExp } from "./test-support/source-scan.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";
import { Readable } from "node:stream";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readTextAsync: readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-s3-object-proof-"));
const privateBucket = "private-proof-bucket";
const privateEndpoint = "https://objects.private.invalid";
const privateAccessKey = "private-proof-access-key";
const privateSecret = "private-proof-secret-key";

process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-s3-object-proof.db");
process.env.LONGTAIL_STORAGE_PROVIDER = "s3";
process.env.LONGTAIL_S3_ACCESS_KEY_ID = privateAccessKey;
process.env.LONGTAIL_S3_BUCKET = privateBucket;
process.env.LONGTAIL_S3_ENDPOINT = privateEndpoint;
process.env.LONGTAIL_S3_REGION = "us-east-1";
process.env.LONGTAIL_S3_SECRET_ACCESS_KEY = privateSecret;
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "File-S3-Object-Proof-Test-123!";

const { config } = await import("../src/config.js");
const { createS3FileStorageAdapter } = await import("../src/core/files/s3-storage-adapter.js");
const { filesService } = await import("../src/services/files.service.js");
const { requireFirstRow } = await import("./test-support/database-row-assertions.mjs");
const { requirePackageManifest } = await import("./test-support/package-manifest-assertions.mjs");

/** The mock stands in for the client the production adapter consumes, so it is typed against that published contract rather than into agreement with this test. */
/** @typedef {import("../src/core/files/s3-storage-adapter.js").S3Client} S3Client */

/** What this owner records about each client call, which is its own observation rather than part of the provider contract. */
/** @typedef {{ bucket?: unknown, contentLength?: unknown, key?: unknown, method: string, status?: string }} RecordedS3Call */
/** @typedef {S3Client & { calls: RecordedS3Call[] }} RecordingS3Client */

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} FilesSession */

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

const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await assertStaticContracts();
  await assertAdapterObjectOperations();
  await assertFilesServiceLifecycle();

  console.log("File S3 object operation proof regression passed.");
} finally {
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
    s3AdapterSource,
    filesServiceSource,
    _regressionSuite,
  ] = await Promise.all([
    readJson("package.json"),
    readText("docs/runtime-configuration.md"),
    readText("docs/sqlite-small-office-mode.md"),
    readText("docs/module-contract.md"),
    readText("docs/module-development.md"),
    readText("src/core/files/s3-storage-adapter.js"),
    readText("src/services/files.service.js"),
    readText("scripts/regression-legacy-snapshot.json"),
  ]);

  assert.equal(Object.keys(requirePackageManifest(packageJson).dependencies || {}).some((name) => /aws-sdk|client-s3/i.test(name)), false, "this proof should not add an S3 SDK dependency");


  assert.match(s3AdapterSource, /putObject/, "S3 adapter should write through putObject");
  assert.match(s3AdapterSource, /getObject/, "S3 adapter should read through getObject");
  assert.match(s3AdapterSource, /headObject/, "S3 adapter should read metadata through headObject");
  assert.match(s3AdapterSource, /deleteObject/, "S3 adapter should delete through deleteObject");
  assert.match(s3AdapterSource, /Readable\.fromWeb|Readable\.from/, "S3 adapter should normalize object bodies to Node Readable streams");
  assert.doesNotMatch(s3AdapterSource, /@aws-sdk|client-s3/i, "S3 object proof should stay behind the narrow client contract");
  assert.doesNotMatch(s3AdapterSource, /signedUrl|presigned/i, "S3 object proof should not add signed URL behavior");

  assert.match(filesServiceSource, /assertStoredFileObjectExists\(file,[\s\S]*\.read\(file\.storage_key\)/, "download and preview reads should stay behind stored provider metadata prechecks");
  assert.match(filesServiceSource, /storageProvider\.adapter\.saveStream/, "streamed uploads should still use the selected storage provider adapter");
  assert.match(filesServiceSource, /storageProvider: storageProvider\.providerId/, "new file rows should continue to store the resolved provider id");

  assert.match(runtimeDocs, /mocked object-operation proof coverage/, "runtime docs should record the mocked S3 object-operation proof");
  assert.match(sqliteDocs, /S3 remains deferred scaffolding[\s\S]*mocked proof coverage/, "SQLite docs should preserve local default while documenting the object proof");
  assert.match(moduleContract, /S3-compatible adapter scaffold[\s\S]*mocked client/, "module contract should describe the adapter-owned S3 proof");
  assert.match(moduleDevelopment, /S3-compatible adapter object operations[\s\S]*mocked client/, "module docs should keep modules behind filesService");
  assert.doesNotMatch(runtimeDocs + sqliteDocs + moduleContract + moduleDevelopment, /private-proof-bucket|private-proof-access-key|private-proof-secret-key|objects\.private\.invalid/i, "docs should not leak regression S3 config values");
}

async function assertAdapterObjectOperations() {
  const client = createMockS3Client();
  const adapter = createS3FileStorageAdapter({
    accessKeyId: privateAccessKey,
    bucket: privateBucket,
    client,
    endpoint: privateEndpoint,
    region: "us-east-1",
    secretAccessKey: privateSecret,
  });

  assert.deepEqual(await adapter.health(), { ok: true, provider: "s3", status: "ok" }, "healthy mock S3 client should report safe ok health");

  const saved = await adapter.save(Buffer.from("buffer body"), { workspaceId: "workspace/proof" });
  assert.equal(saved.storedFilename, path.posix.basename(saved.storageKey), "stored filename should be the safe object-key basename");
  assert.match(saved.storageKey, /^workspace-proof\/\d{4}-\d{2}-\d{2}\//, "S3 storage keys should be app-generated object keys");
  assertUuidVersion(path.posix.basename(saved.storageKey), 4, "S3 object-key identity");
  assertSafeS3Payload(saved, "save result");

  assert.equal(await streamToText(await adapter.read(saved.storageKey)), "buffer body", "read() should return a Node Readable for saved objects");
  assert.deepEqual(await adapter.metadata(saved.storageKey), {
    size: Buffer.byteLength("buffer body"),
    updatedAt: "2026-07-03T12:00:00.000Z",
  }, "metadata() should normalize object size and timestamp");

  const streamed = await adapter.saveStream(Readable.from(["streamed ", "body"]), { workspaceId: "workspace-stream" });
  assert.equal(await streamToText(await adapter.read(streamed.storageKey)), "streamed body", "saveStream() should pass readable bodies through the client contract");

  await adapter.delete(saved.storageKey);
  await assert.rejects(
    () => adapter.read(saved.storageKey),
    (error) => {
      const denial = /** @type {{ message?: string, statusCode?: number }} */ (error);
      assert.equal(denial.statusCode, 404, "missing object read failures should be normalized");
      assertSafeS3Payload(denial.message, "read error");
      return true;
    },
    "deleted objects should not read back through the adapter",
  );

  assert.deepEqual(client.calls.map((call) => call.method), [
    "health",
    "putObject",
    "getObject",
    "headObject",
    "putObject",
    "getObject",
    "deleteObject",
    "getObject",
  ], "adapter should call the narrow S3 client methods in order");
  for (const call of client.calls) {
    assert.equal(call.bucket, privateBucket, "client calls should receive the configured bucket internally");
    assertSafeS3Payload({
      key: call.key,
      method: call.method,
      status: call.status,
    }, `${call.method} public-safe call summary`);
  }
}

async function assertFilesServiceLifecycle() {
  const lifecycleClient = createMockS3Client();
  filesService.registerFileStorageAdapter("s3", createS3FileStorageAdapter({
    ...config.storage.s3,
    client: lifecycleClient,
  }));
  filesService.registerFileScanJobHandlers({ replace: true });

  await initializeDatabase();
  const session = await readSeedSession();
  const taskId = await createTask(session, "S3 object proof task");
  const upload = await filesService.uploadStreamAndAttach(session, {
    fileStream: Readable.from(["S3 lifecycle body"]),
    mimeType: "text/plain",
    moduleId: "tasks",
    originalFilename: "s3-object-proof.txt",
    targetId: taskId,
    targetType: "task",
  });

  const uploadedFile = requireFile(upload, "S3 lifecycle upload");
  assert.equal(uploadedFile.storageProvider, "s3", "streamed upload should persist the resolved S3 provider");
  assert.equal(uploadedFile.status, "pending", "S3 upload should keep the normal pending scan lifecycle");
  assert.equal(uploadedFile.scanStatus, "pending", "S3 upload should keep the normal scan handoff");

  const storedFile = await readFileRow(session.workspace_id, uploadedFile.fileId);
  assert.equal(storedFile.storage_provider, "s3", "database file row should store the S3 provider id");
  assert.match(storedFile.storage_key, new RegExp(`^${escapeRegExp(session.workspace_id)}/\\d{4}-\\d{2}-\\d{2}/`), "S3 service storage key should stay app-generated");
  assertSafeS3Payload({
    storageProvider: storedFile.storage_provider,
    storageKey: storedFile.storage_key,
  }, "stored file row public fields");

  const scanSummary = await runJobWorkerOnce({
    claimLimit: 5,
    mode: "inline",
    workerId: "file-s3-object-proof",
  });
  assert.equal(scanSummary.completed, 1, "queued file.scan job should complete before download");

  const download = await filesService.downloadFile(session, uploadedFile.fileId);
  assert.equal(await streamToText(download.stream), "S3 lifecycle body", "downloadFile should read through the stored S3 provider adapter");
  assert.equal(lifecycleClient.calls.some((call) => call.method === "putObject"), true, "Files upload should call S3 putObject through saveStream");
  assert.equal(lifecycleClient.calls.some((call) => call.method === "getObject"), true, "Files download should call S3 getObject through read");
}

/** @returns {RecordingS3Client} */
function createMockS3Client() {
  /** @type {Map<string, { body: Buffer, updatedAt: string }>} */
  const objects = new Map();
  const updatedAt = "2026-07-03T12:00:00.000Z";

  return {
    /** @type {RecordedS3Call[]} */
    calls: [],
    async deleteObject(payload) {
      this.calls.push({ bucket: payload.bucket, key: payload.key, method: "deleteObject" });
      if (!objects.delete(objectMapKey(payload))) {
        throw new Error("object missing");
      }
      return {};
    },
    async getObject(payload) {
      this.calls.push({ bucket: payload.bucket, key: payload.key, method: "getObject" });
      const object = objects.get(objectMapKey(payload));
      if (!object) {
        throw new Error("object missing");
      }
      return { body: Readable.from([object.body]) };
    },
    async headObject(payload) {
      this.calls.push({ bucket: payload.bucket, key: payload.key, method: "headObject" });
      const object = objects.get(objectMapKey(payload));
      if (!object) {
        throw new Error("object missing");
      }
      return { contentLength: object.body.length, lastModified: object.updatedAt };
    },
    async health(payload) {
      this.calls.push({ bucket: payload.bucket, method: "health", status: "ok" });
      return { ok: true };
    },
    async putObject(payload) {
      this.calls.push({
        bucket: payload.bucket,
        contentLength: payload.contentLength ?? null,
        key: payload.key,
        method: "putObject",
      });
      objects.set(objectMapKey(payload), {
        body: await bodyToBuffer(payload.body),
        updatedAt,
      });
      return { etag: "mock-etag" };
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
  // rather than assuming the shape this test happens to send.
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

/**
 * Filesystem JSON enters as `unknown`; callers narrow at the point of use.
 * @param {string} relativePath
 * @returns {Promise<unknown>}
 */
async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
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
) VALUES (
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

/**
 * @param {string} workspaceId
 * @param {string} fileId
 * @returns {Promise<{ scan_status: string, status: string, storage_key: string, storage_provider: string }>}
 */
async function readFileRow(workspaceId, fileId) {
  const rows = await querySql(`
SELECT storage_provider, storage_key, status, scan_status
FROM files
WHERE workspace_id = ${sqlText(workspaceId)}
  AND file_id = ${sqlText(fileId)}
LIMIT 1;
`);
  assert.equal(rows.length, 1, "uploaded S3 file row should exist");
  return requireFirstRow(rows, "uploaded S3 file row");
}

/** @param {NodeJS.ReadableStream} readable */
async function streamToText(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** @param {unknown} payload @param {string} label */
function assertSafeS3Payload(payload, label) {
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /private-proof-bucket|private-proof-access-key|private-proof-secret-key|objects\.private\.invalid/i, `${label} should not expose S3 config values`);
  assert.doesNotMatch(serialized, /signedUrl|presigned|protectedPath/i, `${label} should not expose signed URLs or protected internals`);
}

/** @param {unknown} value @param {number} expectedVersion @param {string} label */
function assertUuidVersion(value, expectedVersion, label) {
  assert.match(String(value || ""), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, `${label} should be a canonical UUID`);
  assert.equal(String(value)[14], String(expectedVersion), `${label} should use UUIDv${expectedVersion}`);
}
