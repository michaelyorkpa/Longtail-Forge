/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.6e";
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
  const api = createApi(`http://127.0.0.1:${server.address().port}`);

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
    packageJson,
    packageLock,
    roadmap,
    changelog,
    moduleContract,
    moduleDevelopment,
    runtimeDocs,
    filesServiceSource,
    s3AdapterSource,
    regressionSuite,
  ] = await Promise.all([
    readJson("package.json"),
    readJson("package-lock.json"),
    readText("ROADMAP.md"),
    readText("CHANGELOG.md"),
    readText("docs/module-contract.md"),
    readText("docs/module-development.md"),
    readText("docs/runtime-configuration.md"),
    readText("src/services/files.service.js"),
    readText("src/core/files/s3-storage-adapter.js"),
    readText("scripts/regression-suite.mjs"),
  ]);

  assert.equal(packageJson.version, appVersion, "package.json should report the streamed validation version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the streamed validation version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the streamed validation version");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the streamed validation slice");
  assert.match(changelog, /Version 0\.33\.5\.25\.3[\s\S]*Hardened streamed Files uploads/, "changelog should preserve the shipped streamed validation history");
  assert.match(roadmap, /^Active cursor: `0\.33\.6`\. Completed `0\.33\.5\.29` is archived in `ROADMAP-ARCHIVE\.md`\./m, "live roadmap should record the archived 0.33.5.29 handoff");
  assert.match(roadmap, /^## Version 0\.33\.6 - Dashboard and Workbench Formalization as Project hub and work center/m, "live roadmap should hand off after the completed storage cleanup, parameter-binding gap review, database extraction contract, and parameter-binding gap closeout branches");
  assert.match(moduleContract, /0\.33\.5\.25\.3[\s\S]*metadata pre-checks/, "module contract should describe route-backed storage metadata prechecks");
  assert.match(moduleDevelopment, /0\.33\.5\.25\.3[\s\S]*streamed upload signature validation/, "module docs should describe service-owned streamed validation");
  assert.match(runtimeDocs, /0\.33\.5\.25\.3[\s\S]*metadata pre-checks/, "runtime docs should describe storage object drift handling");
  assert.match(filesServiceSource, /assertStoredFileObjectExists/, "Files service should precheck storage metadata before reads");
  assert.match(filesServiceSource, /deleteRejectedUploadStorage/, "Files service should await and log rejected-upload cleanup");
  assert.match(filesServiceSource, /validateStreamedUploadSample/, "Files service should validate streamed upload samples during the stream");
  assert.match(s3AdapterSource, /isS3ObjectNotFoundError/, "S3 adapter should normalize missing objects to 404");
  assert.match(regressionSuite, /scripts\/file-streamed-validation-download-metadata-regression\.mjs/, "regression suite should include streamed validation/download metadata coverage");
}

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
  await runSql(`
UPDATE files
SET status = 'available',
    scan_status = 'not_required'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND file_id = ${sqlText(upload.file.fileId)};
`);

  const storedFile = await readFileRow(fixtures.workspaceId, upload.file.fileId);
  assert.ok(storedFile?.storage_key, "uploaded fixture should have a storage key before deleting the object");
  await filesService.getFileStorageAdapter(storedFile.storage_provider).delete(storedFile.storage_key);

  const download = await api.get(`/api/files/${upload.file.fileId}/download`, {
    cookie: fixtures.sessionId,
  });
  assert.equal(download.status, 404, download.text);
  assert.match(download.body?.error || "", /no longer available/i, "download of missing storage object should return a clean 404");

  const preview = await api.get(`/api/files/attachments/${upload.attachment.fileAttachmentId}/preview/content`, {
    cookie: fixtures.sessionId,
  });
  assert.equal(preview.status, 404, preview.text);
  assert.match(preview.body?.error || "", /no longer available/i, "preview of missing storage object should return a clean 404");
  assertNoUnsafeStorageLeak([download.body, preview.body]);
}

async function assertRejectedUpload(uploadFn, statusCode, messagePattern, description) {
  await assert.rejects(
    uploadFn,
    (error) => {
      assert.equal(error.statusCode, statusCode, description);
      assert.match(error.message, messagePattern, description);
      return true;
    },
    description,
  );
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
  assert.equal(Number(orphanRows[0].count), 0, "failed streamed uploads should not leave orphaned attachments");
}

function streamedPayload(targetId, options = {}) {
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
  const session = {
    ...sessionPayload,
    role: "super_admin",
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

function createApi(baseUrl) {
  return {
    get: (url, options = {}) => requestJson(baseUrl, "GET", url, null, options),
  };
}

async function requestJson(baseUrl, method, url, body = null, options = {}) {
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

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
