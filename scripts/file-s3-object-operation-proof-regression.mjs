import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const appVersion = "0.33.5.23.1";
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
    packageLock,
    roadmap,
    changelog,
    runtimeDocs,
    sqliteDocs,
    moduleContract,
    moduleDevelopment,
    s3AdapterSource,
    filesServiceSource,
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
    readText("src/core/files/s3-storage-adapter.js"),
    readText("src/services/files.service.js"),
    readText("scripts/regression-suite.mjs"),
  ]);

  assert.equal(packageJson.version, appVersion, "package.json should report the S3 object proof version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the S3 object proof version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the S3 object proof version");
  assert.equal(Object.keys(packageJson.dependencies || {}).some((name) => /aws-sdk|client-s3/i.test(name)), false, "this proof should not add an S3 SDK dependency");

  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.22 storage provider and scanner runtime work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the S3 object proof slice");
  assert.match(regressionSuite, /scripts\/file-s3-object-operation-proof-regression\.mjs/, "regression suite should include S3 object proof coverage");

  assert.match(s3AdapterSource, /putObject/, "S3 adapter should write through putObject");
  assert.match(s3AdapterSource, /getObject/, "S3 adapter should read through getObject");
  assert.match(s3AdapterSource, /headObject/, "S3 adapter should read metadata through headObject");
  assert.match(s3AdapterSource, /deleteObject/, "S3 adapter should delete through deleteObject");
  assert.match(s3AdapterSource, /Readable\.fromWeb|Readable\.from/, "S3 adapter should normalize object bodies to Node Readable streams");
  assert.doesNotMatch(s3AdapterSource, /@aws-sdk|client-s3/i, "S3 object proof should stay behind the narrow client contract");
  assert.doesNotMatch(s3AdapterSource, /signedUrl|presigned/i, "S3 object proof should not add signed URL behavior");

  assert.match(filesServiceSource, /getFileStorageAdapter\(file\.storage_provider\)\.read\(file\.storage_key\)/, "download and preview reads should stay behind stored provider metadata");
  assert.match(filesServiceSource, /storageProvider\.adapter\.saveStream/, "streamed uploads should still use the selected storage provider adapter");
  assert.match(filesServiceSource, /storageProvider: storageProvider\.providerId/, "new file rows should continue to store the resolved provider id");

  assert.match(runtimeDocs, /As of 0\.33\.5\.22\.15[\s\S]*S3 object operations are contract-tested through a mocked client path/, "runtime docs should record the mocked S3 object-operation proof");
  assert.match(sqliteDocs, /As of 0\.33\.5\.22\.15[\s\S]*mocked S3 client proof/, "SQLite docs should preserve local default while documenting the object proof");
  assert.match(moduleContract, /As of 0\.33\.5\.22\.15[\s\S]*S3-compatible provider[\s\S]*mocked client/, "module contract should describe the provider-owned S3 proof");
  assert.match(moduleDevelopment, /As of 0\.33\.5\.22\.15[\s\S]*S3-compatible provider[\s\S]*mocked client/, "module docs should keep modules behind filesService");
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
      assert.equal(error.statusCode, 502, "client read failures should be normalized");
      assertSafeS3Payload(error.message, "read error");
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

  assert.equal(upload.file.storageProvider, "s3", "streamed upload should persist the resolved S3 provider");
  assert.equal(upload.file.status, "pending", "S3 upload should keep the normal pending scan lifecycle");
  assert.equal(upload.file.scanStatus, "pending", "S3 upload should keep the normal scan handoff");

  const storedFile = await readFileRow(session.workspace_id, upload.file.fileId);
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

  const download = await filesService.downloadFile(session, upload.file.fileId);
  assert.equal(await streamToText(download.stream), "S3 lifecycle body", "downloadFile should read through the stored S3 provider adapter");
  assert.equal(lifecycleClient.calls.some((call) => call.method === "putObject"), true, "Files upload should call S3 putObject through saveStream");
  assert.equal(lifecycleClient.calls.some((call) => call.method === "getObject"), true, "Files download should call S3 getObject through read");
}

function createMockS3Client() {
  const objects = new Map();
  const updatedAt = "2026-07-03T12:00:00.000Z";

  return {
    calls: [],
    async deleteObject(payload = {}) {
      this.calls.push({ bucket: payload.bucket, key: payload.key, method: "deleteObject" });
      if (!objects.delete(objectMapKey(payload))) {
        throw new Error("object missing");
      }
      return {};
    },
    async getObject(payload = {}) {
      this.calls.push({ bucket: payload.bucket, key: payload.key, method: "getObject" });
      const object = objects.get(objectMapKey(payload));
      if (!object) {
        throw new Error("object missing");
      }
      return { body: Readable.from([object.body]) };
    },
    async headObject(payload = {}) {
      this.calls.push({ bucket: payload.bucket, key: payload.key, method: "headObject" });
      const object = objects.get(objectMapKey(payload));
      if (!object) {
        throw new Error("object missing");
      }
      return { contentLength: object.body.length, lastModified: object.updatedAt };
    },
    async health(payload = {}) {
      this.calls.push({ bucket: payload.bucket, method: "health", status: "ok" });
      return { ok: true };
    },
    async putObject(payload = {}) {
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

async function readFileRow(workspaceId, fileId) {
  const rows = await querySql(`
SELECT storage_provider, storage_key, status, scan_status
FROM files
WHERE workspace_id = ${sqlText(workspaceId)}
  AND file_id = ${sqlText(fileId)}
LIMIT 1;
`);
  assert.equal(rows.length, 1, "uploaded S3 file row should exist");
  return rows[0];
}

async function streamToText(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function assertSafeS3Payload(payload, label) {
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /private-proof-bucket|private-proof-access-key|private-proof-secret-key|objects\.private\.invalid/i, `${label} should not expose S3 config values`);
  assert.doesNotMatch(serialized, /signedUrl|presigned|protectedPath/i, `${label} should not expose signed URLs or protected internals`);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
