/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { readPayload } from "./test-support/http-payload-assertions.mjs";

/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureApp} HttpFixtureApp */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureClientOptions} FileApiClientOptions */
/** @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer} HttpFixtureServer */

/**
 * One fixture response. The body stays `unknown` on purpose: JSON.parse would
 * hand back `any`, and every envelope read below would then be a claim the
 * compiler never checks.
 * @typedef {import("./test-support/http-fixture-contracts.mjs").HttpFixtureFetchResponse<unknown> & { text: string }} FileApiResponse
 */

/**
 * @typedef {{
 *   get: (url: string, options?: FileApiClientOptions) => Promise<FileApiResponse>,
 *   post: (url: string, body?: unknown, options?: FileApiClientOptions) => Promise<FileApiResponse>,
 *   put: (url: string, body?: unknown, options?: FileApiClientOptions) => Promise<FileApiResponse>,
 * }} FileApiClient
 */

/** The Files routes publish their service results directly, so the envelopes are read off the service. */
/** @typedef {typeof import("../src/services/files.service.js").filesService} FilesService */
/** @typedef {Awaited<ReturnType<FilesService["uploadAndAttach"]>>} FileUploadEnvelope */
/** @typedef {Awaited<ReturnType<FilesService["uploadBatchAndAttach"]>>} FileBatchEnvelope */
/** @typedef {Awaited<ReturnType<FilesService["listAttachments"]>>} FileAttachmentListEnvelope */
/** @typedef {Awaited<ReturnType<FilesService["deleteFile"]>>} FileStatusEnvelope */
/** @typedef {{ file: Awaited<ReturnType<FilesService["readFileForSession"]>> }} FileRecordEnvelope */
/** @typedef {{ error: import("../src/types/framework-contracts.js").ApiErrorDetails }} FileApiErrorEnvelope */

/**
 * Narrow an envelope to the file record it must be carrying.
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

/** The seeded estate, plus the two identities the upload check adds to it. */
/**
 * @typedef {Awaited<ReturnType<typeof seedFixtures>> & {
 *   attachmentId?: string,
 *   fileId?: string,
 * }} FileApiFixtures
 */


const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-api-lifecycle-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-api-lifecycle.db");
process.env.SUPER_ADMIN_PASSWORD = "File-Api-Lifecycle-Test-123!";

const { internalEventBus } = await import("../src/core/events/event-bus.js");
const { createApp } = await import("../src/core/app.js");
const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");

/** @type {string[]} */
const results = [];
/** @type {Array<{ metadata?: Record<string, unknown>, name: string }>} */
const capturedFileEvents = [];
let server;

try {
  await initializeDatabase();
  /** @type {FileApiFixtures} */
  const fixtures = await seedFixtures();
  internalEventBus.reset();
  registerFileEventCapture();
  server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (server.address()).port}`;
  const api = createApi(baseUrl);

  await checkAsync("POST /api/files requires authentication", async () => {
    const response = await api.post("/api/files", uploadPayload(fixtures.taskId));
    assert.equal(response.status, 401);
  });

  await checkAsync("object-bound Files routes reject arrays before service policy", async () => {
    /** @type {Array<["post" | "put", string]>} */
    const arrayRejectingRoutes = [
      ["put", "/api/files/settings"],
      ["post", "/api/files/unreachable/report"],
      ["post", "/api/files/unreachable/quarantine"],
    ];
    for (const [method, routePath] of arrayRejectingRoutes) {
      const response = await api[method](routePath, [], { cookie: fixtures.adminSessionId });
      assert.equal(response.status, 400, `${routePath} should reject array JSON`);
      /** @type {FileApiErrorEnvelope} */
      const rejected = readPayload(response, ["error"], routePath);
      assert.equal(rejected.error.message, "Request body must contain a JSON object.");
    }
  });

  await checkAsync("POST /api/files uploads, queues scan, stores, and attaches a pending text file", async () => {
    const response = await api.post("/api/files", uploadPayload(fixtures.taskId), { cookie: fixtures.adminSessionId });

    assert.equal(response.status, 201);
    /** @type {FileUploadEnvelope} */
    const uploaded = readPayload(response, ["attachment", "file"], "POST /api/files");
    const uploadedFile = requireFile(uploaded, "POST /api/files");
    assert.equal(uploadedFile.originalFilename, "evidence.txt");
    assert.equal(uploadedFile.status, "pending");
    assert.equal(uploadedFile.scanStatus, "pending");
    assert.equal(uploaded.attachment.targetType, "task");
    fixtures.fileId = uploadedFile.fileId;
    fixtures.attachmentId = uploaded.attachment.fileAttachmentId;
    assertUuidVersion(fixtures.taskId, 4, "the existing Task relationship fixture");
    assertUuidVersion(fixtures.fileId, 7, "new Files record identity");
    assertUuidVersion(fixtures.attachmentId, 7, "new Files attachment identity");

    const rows = await querySql(`
SELECT storage_key, original_filename, status, scan_status
FROM files
WHERE file_id = ${sqlText(fixtures.fileId)};
`);
    /** @type {{ original_filename: string, scan_status: string, status: string, storage_key: string }} */
    const storedRow = requireFirstRow(rows, "stored Files row");
    assert.equal(storedRow.original_filename, "evidence.txt");
    assert.equal(storedRow.status, "pending");
    assert.equal(storedRow.scan_status, "pending");
    assert.ok(!storedRow.storage_key.includes("evidence.txt"));
    const storageObjectId = storedRow.storage_key.split("/").at(-1);
    assertUuidVersion(storageObjectId, 4, "opaque Files storage object identity");
    assert.notEqual(storageObjectId, fixtures.fileId, "Files record identity must stay independent from its storage object identity");
    const scanJobs = await querySql(`
SELECT job_id, status, attempt_count
FROM jobs
WHERE job_type = 'file.scan'
  AND payload_json LIKE ${sqlText(`%"fileId":"${fixtures.fileId}"%`)};
`);
    assert.equal(scanJobs.length, 1);
    assertUuidVersion(scanJobs[0].job_id, 7, "new durable job identity");
    assert.equal(scanJobs[0].status, "pending");
    assert.equal(Number(scanJobs[0].attempt_count), 0);
    assert.ok(capturedFileEvents.some((event) => event.name === "file.upload.requested"));
    assert.ok(capturedFileEvents.some((event) => event.name === "file.attachment.created"));
  });

  await checkAsync("GET /api/files/:fileId/download blocks pending scan files", async () => {
    const response = await api.get(`/api/files/${fixtures.fileId}/download`, { cookie: fixtures.adminSessionId });

    assert.equal(response.status, 403);
  });

  await checkAsync("file.scan worker makes the uploaded file available", async () => {
    await processQueuedJobs();
    const rows = await querySql(`
SELECT status, scan_status
FROM files
WHERE file_id = ${sqlText(fixtures.fileId)};
`);

    assert.equal(rows[0].status, "available");
    assert.equal(rows[0].scan_status, "not_required");
    assert.ok(capturedFileEvents.some((event) => event.name === "file.scan.passed"));
    assert.ok(capturedFileEvents.some((event) => event.name === "file.available"));
  });

  await checkAsync("GET /api/files/:fileId/download returns routed content with safe headers", async () => {
    const response = await api.get(`/api/files/${fixtures.fileId}/download`, { cookie: fixtures.adminSessionId });

    assert.equal(response.status, 200);
    assert.equal(response.text, "hello file framework");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(String(response.headers.get("content-disposition")), /inline/);
    assert.ok(capturedFileEvents.some((event) => event.name === "file.downloaded"));
  });

  await checkAsync("GET /api/files/attachments lists available attachments only", async () => {
    const response = await api.get(`/api/files/attachments?targetType=task&targetId=${fixtures.taskId}`, {
      cookie: fixtures.adminSessionId,
    });

    assert.equal(response.status, 200);
    /** @type {FileAttachmentListEnvelope} */
    const listed = readPayload(response, ["attachments"], "GET /api/files/attachments");
    assert.deepEqual(listed.attachments.map((item) => item.fileId), [fixtures.fileId]);
  });

  await checkAsync("POST /api/files rejects disallowed extension and emits rejection", async () => {
    const response = await api.post("/api/files", {
      ...uploadPayload(fixtures.taskId),
      contentBase64: Buffer.from("not executable").toString("base64"),
      originalFilename: "bad.exe",
    }, { cookie: fixtures.adminSessionId });

    assert.equal(response.status, 400);
    assert.ok(capturedFileEvents.some((event) => (
      event.name === "file.upload.rejected" &&
      event.metadata?.target_id === fixtures.taskId
    )));
  });

  await checkAsync("POST /api/files rejects mismatched claimed file content", async () => {
    const response = await api.post("/api/files", {
      ...uploadPayload(fixtures.taskId),
      contentBase64: Buffer.from("not a pdf").toString("base64"),
      originalFilename: "fake.pdf",
    }, { cookie: fixtures.adminSessionId });

    assert.equal(response.status, 400);
  });

  await checkAsync("POST /api/files/batch keeps successful files when one file fails validation", async () => {
    const response = await api.post("/api/files/batch", {
      ...uploadPayload(fixtures.batchTaskId),
      files: [
        {
          contentBase64: Buffer.from("batch good file").toString("base64"),
          displayName: "batch-good.txt",
          originalFilename: "batch-good.txt",
        },
        {
          contentBase64: Buffer.from("batch bad file").toString("base64"),
          displayName: "batch-bad.exe",
          originalFilename: "batch-bad.exe",
        },
      ],
    }, { cookie: fixtures.adminSessionId });

    assert.equal(response.status, 207);
    /** @type {FileBatchEnvelope} */
    const batch = readPayload(response, ["failed", "results", "succeeded", "total"], "POST /api/files/batch");
    assert.equal(batch.total, 2);
    assert.equal(batch.succeeded, 1);
    assert.equal(batch.failed, 1);
    assert.equal(batch.results[0].ok, true);
    assert.equal(batch.results[1].ok, false);

    const list = await api.get(`/api/files/attachments?targetType=task&targetId=${fixtures.batchTaskId}&filename=batch-good`, {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(list.status, 200);
    /** @type {FileAttachmentListEnvelope} */
    const batchList = readPayload(list, ["attachments"], "GET /api/files/attachments");
    assert.equal(batchList.attachments.length, 1);
    assert.equal(batchList.attachments[0].file.originalFilename, "batch-good.txt");
  });

  await checkAsync("non-upload role cannot upload to an otherwise visible record", async () => {
    const response = await api.post("/api/files", uploadPayload(fixtures.taskId), {
      cookie: fixtures.clientUserSessionId,
    });

    assert.equal(response.status, 403);
  });

  await checkAsync("file owners can soft-delete their own files without deleting someone else's file", async () => {
    const ownedFileId = await seedFileRow({
      fileId: randomUUID(),
      originalFilename: "owner-delete.txt",
      session: fixtures,
      targetId: fixtures.ownerDeleteTaskId,
      uploadedByUserId: fixtures.clientUserId,
    });
    const otherFileId = await seedFileRow({
      fileId: randomUUID(),
      originalFilename: "not-owner-delete.txt",
      session: fixtures,
      targetId: fixtures.ownerDeleteTaskId,
      uploadedByUserId: fixtures.adminUserId,
    });

    const ownedDelete = await api.post(`/api/files/${ownedFileId}/delete`, {}, {
      cookie: fixtures.clientUserSessionId,
    });
    assert.equal(ownedDelete.status, 200);
    /** @type {FileStatusEnvelope} */
    const ownedDeleted = readPayload(ownedDelete, ["file"], "POST /api/files/:fileId/delete");
    assert.equal(requireFile(ownedDeleted, "owner delete").status, "deleted");

    const otherDelete = await api.post(`/api/files/${otherFileId}/delete`, {}, {
      cookie: fixtures.clientUserSessionId,
    });
    assert.equal(otherDelete.status, 403);
  });

  await checkAsync("files cannot be attached across workspace boundaries", async () => {
    const response = await api.post("/api/files", uploadPayload(fixtures.otherWorkspaceTaskId), {
      cookie: fixtures.adminSessionId,
    });

    assert.equal(response.status, 404);
  });

  await checkAsync("disabled modules cannot receive new file attachments", async () => {
    await runSql(`
UPDATE workspace_modules
SET status = 'disabled'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND module_id = 'tasks';
`);
    const response = await api.post("/api/files", uploadPayload(fixtures.taskId), {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(response.status, 400);
    await runSql(`
UPDATE workspace_modules
SET status = 'enabled'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND module_id = 'tasks';
`);
  });

  await checkAsync("attachment removal keeps file metadata", async () => {
    const upload = await api.post("/api/files", uploadPayload(fixtures.removeTaskId, {
      originalFilename: "remove-me.txt",
      text: "remove attachment only",
    }), { cookie: fixtures.adminSessionId });
    assert.equal(upload.status, 201);
    await processQueuedJobs();
    /** @type {FileUploadEnvelope} */
    const removable = readPayload(upload, ["attachment", "file"], "POST /api/files");
    const removableFile = requireFile(removable, "POST /api/files");

    const remove = await api.post(`/api/files/attachments/${removable.attachment.fileAttachmentId}/remove`, {}, {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(remove.status, 200);

    const file = await api.get(`/api/files/${removableFile.fileId}`, { cookie: fixtures.adminSessionId });
    assert.equal(file.status, 200);
    /** @type {FileRecordEnvelope} */
    const readBack = readPayload(file, ["file"], "GET /api/files/:fileId");
    assert.equal(requireFile(readBack, "GET /api/files/:fileId").status, "available");
    assert.ok(capturedFileEvents.some((event) => event.name === "file.attachment.removed"));
  });

  await checkAsync("reporting a file quarantines it, hides it from normal lists, and blocks download", async () => {
    const report = await api.post(`/api/files/${fixtures.fileId}/report`, { reason: "abusive", notes: "test report" }, {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(report.status, 200);
    /** @type {FileStatusEnvelope} */
    const reported = readPayload(report, ["file"], "POST /api/files/:fileId/report");
    assert.equal(requireFile(reported, "file report").status, "quarantined");

    const list = await api.get(`/api/files/attachments?targetType=task&targetId=${fixtures.taskId}`, {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(list.status, 200);
    /** @type {FileAttachmentListEnvelope} */
    const hidden = readPayload(list, ["attachments"], "GET /api/files/attachments");
    assert.deepEqual(hidden.attachments, []);

    const download = await api.get(`/api/files/${fixtures.fileId}/download`, { cookie: fixtures.adminSessionId });
    assert.equal(download.status, 403);
    assert.ok(capturedFileEvents.some((event) => event.name === "file.reported"));
    assert.ok(capturedFileEvents.some((event) => event.name === "file.quarantined"));

    const reports = await querySql(`SELECT COUNT(*) AS count FROM file_reports WHERE file_id = ${sqlText(fixtures.fileId)};`);
    assert.equal(Number(reports[0].count), 1);

    const reviewed = await api.post(`/api/files/${fixtures.fileId}/restore`, {}, {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(reviewed.status, 200);
    /** @type {FileStatusEnvelope} */
    const reviewedEnvelope = readPayload(reviewed, ["file"], "POST /api/files/:fileId/restore");
    assert.equal(requireFile(reviewedEnvelope, "quarantine review").status, "available");
    assert.ok(capturedFileEvents.some((event) => event.name === "file.restored"));

    const reviewedRows = await querySql(`
SELECT status, quarantine_reason
FROM files
WHERE file_id = ${sqlText(fixtures.fileId)};
`);
    assert.equal(reviewedRows[0].status, "available");
    assert.equal(reviewedRows[0].quarantine_reason, null);
  });

  await checkAsync("file delete stages metadata while preserving safe attachment history", async () => {
    const upload = await api.post("/api/files", uploadPayload(fixtures.deleteTaskId, {
      originalFilename: "delete-me.txt",
      text: "delete file",
    }), { cookie: fixtures.adminSessionId });
    assert.equal(upload.status, 201);
    await processQueuedJobs();

    /** @type {FileUploadEnvelope} */
    const deletable = readPayload(upload, ["attachment", "file"], "POST /api/files");
    const deletableFile = requireFile(deletable, "POST /api/files");
    const deleted = await api.post(`/api/files/${deletableFile.fileId}/delete`, {}, {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(deleted.status, 200);
    /** @type {FileStatusEnvelope} */
    const deletedEnvelope = readPayload(deleted, ["file"], "POST /api/files/:fileId/delete");
    assert.equal(requireFile(deletedEnvelope, "file delete").status, "deleted");
    assert.ok(capturedFileEvents.some((event) => event.name === "file.deleted"));

    const rows = await querySql(`
SELECT files.status, files.deleted_at, file_attachments.removed_at
FROM files
INNER JOIN file_attachments
  ON file_attachments.file_id = files.file_id
WHERE files.file_id = ${sqlText(deletableFile.fileId)};
`);
    assert.equal(rows[0].status, "deleted");
    assert.ok(rows[0].deleted_at);
    assert.equal(rows[0].removed_at, null);

    const history = await api.get(`/api/files/attachments?targetType=task&targetId=${fixtures.deleteTaskId}`, {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(history.status, 200);
    /** @type {FileAttachmentListEnvelope} */
    const historyList = readPayload(history, ["attachments"], "GET /api/files/attachments");
    assert.equal(historyList.attachments.length, 1);
    assert.equal(historyList.attachments[0].file.status, "deleted");

    const download = await api.get(`/api/files/${deletableFile.fileId}/download`, { cookie: fixtures.adminSessionId });
    assert.equal(download.status, 404);

    const restored = await api.post(`/api/files/${deletableFile.fileId}/restore`, {}, {
      cookie: fixtures.adminSessionId,
    });
    assert.equal(restored.status, 200);
    /** @type {FileStatusEnvelope} */
    const restoredEnvelope = readPayload(restored, ["file"], "POST /api/files/:fileId/restore");
    assert.equal(requireFile(restoredEnvelope, "file restore").status, "available");
    assert.ok(capturedFileEvents.some((event) => event.name === "file.restored"));
  });

  await assertIntegrity();
  console.log(`File API lifecycle regression passed ${results.length} checks.`);
} finally {
  if (server) {
    await closeServer(server);
  }
  await stopJobWorker().catch(() => {});
  internalEventBus.reset();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function seedFixtures() {
  const users = await querySql(`
SELECT user_id, username, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY username
LIMIT 1;
`);
  /** @type {{ active_workspace_id: string, home_workspace_id: string, timezone: string, user_id: string, username: string }} */
  const admin = requireFirstRow(users, "protected admin");

  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;
  const now = new Date().toISOString();
  const taskId = randomUUID();
  const batchTaskId = randomUUID();
  const ownerDeleteTaskId = randomUUID();
  const removeTaskId = randomUUID();
  const deleteTaskId = randomUUID();
  const clientUserId = randomUUID();
  const otherWorkspaceId = randomUUID();
  const otherWorkspaceTaskId = randomUUID();

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
VALUES
  (${sqlText(taskId)}, ${sqlText(workspaceId)}, NULL, NULL, 'File API Task', '', 'open', 'normal', ${sqlText(admin.user_id)}, ${sqlText(admin.user_id)}, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(batchTaskId)}, ${sqlText(workspaceId)}, NULL, NULL, 'File API Batch Task', '', 'open', 'normal', ${sqlText(admin.user_id)}, ${sqlText(admin.user_id)}, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(ownerDeleteTaskId)}, ${sqlText(workspaceId)}, NULL, NULL, 'File API Owner Delete Task', '', 'open', 'normal', ${sqlText(admin.user_id)}, ${sqlText(admin.user_id)}, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(removeTaskId)}, ${sqlText(workspaceId)}, NULL, NULL, 'File API Remove Task', '', 'open', 'normal', ${sqlText(admin.user_id)}, ${sqlText(admin.user_id)}, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(deleteTaskId)}, ${sqlText(workspaceId)}, NULL, NULL, 'File API Delete Task', '', 'open', 'normal', ${sqlText(admin.user_id)}, ${sqlText(admin.user_id)}, ${sqlText(now)}, ${sqlText(now)});

INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(clientUserId)},
  ${sqlText(workspaceId)},
  'file-api-client-user@example.test',
  'File API Client User',
  'America/New_York',
  '',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);

INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(clientUserId)}, ${sqlText(workspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(clientUserId)},
  'client_user',
  'all',
  'all',
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(otherWorkspaceId)}, 'Other File Workspace', 'Active', 'business', ${sqlText(now)}, ${sqlText(now)});

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
  ${sqlText(otherWorkspaceTaskId)},
  ${sqlText(otherWorkspaceId)},
  NULL,
  NULL,
  'Other Workspace Task',
  '',
  'open',
  'normal',
  ${sqlText(admin.user_id)},
  ${sqlText(admin.user_id)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  const adminSession = await createSession({
    ...admin,
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
  });
  const clientUserSession = await createSession({
    user_id: clientUserId,
    username: "file-api-client-user@example.test",
    home_workspace_id: workspaceId,
    active_workspace_id: workspaceId,
    timezone: "America/New_York",
  });

  return {
    adminSessionId: adminSession.sessionId,
    adminUserId: admin.user_id,
    batchTaskId,
    clientUserId,
    clientUserSessionId: clientUserSession.sessionId,
    deleteTaskId,
    ownerDeleteTaskId,
    otherWorkspaceTaskId,
    removeTaskId,
    taskId,
    workspaceId,
  };
}

/** @param {{ fileId?: string, originalFilename?: string, session: { workspaceId: string }, targetId: string, uploadedByUserId: string }} options */
async function seedFileRow(options) {
  const fileId = options.fileId || randomUUID();
  const attachmentId = randomUUID();
  const now = new Date().toISOString();
  const filename = options.originalFilename || "seeded-owner-file.txt";

  await runSql(`
INSERT INTO files (
  file_id,
  workspace_id,
  storage_provider,
  storage_key,
  original_filename,
  stored_filename,
  display_name,
  extension,
  mime_type_claimed,
  mime_type_detected,
  file_size_bytes,
  sha256_hash,
  status,
  scan_status,
  quarantine_reason,
  uploaded_by_user_id,
  created_at,
  updated_at,
  deleted_at,
  metadata_json
)
VALUES (
  ${sqlText(fileId)},
  ${sqlText(options.session.workspaceId)},
  'local',
  ${sqlText(`test/${fileId}`)},
  ${sqlText(filename)},
  ${sqlText(filename)},
  ${sqlText(filename)},
  '.txt',
  'text/plain',
  'text/plain',
  12,
  '',
  'available',
  'passed',
  NULL,
  ${sqlText(options.uploadedByUserId)},
  ${sqlText(now)},
  ${sqlText(now)},
  NULL,
  '{}'
);

INSERT INTO file_attachments (
  file_attachment_id,
  workspace_id,
  file_id,
  module_id,
  target_type,
  target_id,
  client_id,
  project_id,
  visibility,
  attachment_role,
  caption,
  sort_order,
  attached_by_user_id,
  created_at,
  removed_at,
  metadata_json
)
VALUES (
  ${sqlText(attachmentId)},
  ${sqlText(options.session.workspaceId)},
  ${sqlText(fileId)},
  'tasks',
  'task',
  ${sqlText(options.targetId)},
  NULL,
  NULL,
  'private',
  NULL,
  NULL,
  0,
  ${sqlText(options.uploadedByUserId)},
  ${sqlText(now)},
  NULL,
  '{}'
);
`);

  return fileId;
}

/** @param {string} taskId @param {{ displayName?: string, originalFilename?: string, text?: string }} [options] */
function uploadPayload(taskId, options = {}) {
  return {
    contentBase64: Buffer.from(options.text || "hello file framework").toString("base64"),
    displayName: options.displayName || options.originalFilename || "Evidence",
    moduleId: "tasks",
    originalFilename: options.originalFilename || "evidence.txt",
    targetId: taskId,
    targetType: "task",
    visibility: "private",
  };
}

/** @param {unknown} value @param {number} expectedVersion @param {string} label */
function assertUuidVersion(value, expectedVersion, label) {
  assert.match(String(value || ""), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, `${label} should be a canonical UUID`);
  assert.equal(String(value)[14], String(expectedVersion), `${label} should use UUIDv${expectedVersion}`);
}

function registerFileEventCapture() {
  for (const eventName of [
    "file.upload.requested",
    "file.upload.accepted",
    "file.upload.rejected",
    "file.scan.pending",
    "file.scan.passed",
    "file.scan.failed",
    "file.quarantined",
    "file.available",
    "file.downloaded",
    "file.reported",
    "file.deleted",
    "file.restored",
    "file.attachment.created",
    "file.attachment.context_updated",
    "file.attachment.removed",
  ]) {
    internalEventBus.on(eventName, async (event) => {
      capturedFileEvents.push(event);
    }, {
      id: `file-api-lifecycle:${eventName}`,
      moduleId: "test",
    });
  }
}

/** @param {string} baseUrl @returns {FileApiClient} */
function createApi(baseUrl) {
  return {
    get: (url, options = {}) => request(baseUrl, "GET", url, null, options),
    post: (url, body, options = {}) => request(baseUrl, "POST", url, body, options),
    put: (url, body, options = {}) => request(baseUrl, "PUT", url, body, options),
  };
}

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {unknown} body
 * @param {FileApiClientOptions} [options]
 * @returns {Promise<FileApiResponse>}
 */
async function request(baseUrl, method, url, body, options = {}) {
  /** @type {Record<string, string>} */
  const headers = {};

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }
  if (body !== null && body !== undefined) {
    headers["Content-Type"] = "application/json";
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

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

/** @param {string} name @param {() => Promise<void>} assertion */
async function checkAsync(name, assertion) {
  await assertion();
  results.push(name);
}

async function processQueuedJobs() {
  await runJobWorkerOnce({
    claimLimit: 10,
    mode: "inline",
    workerId: "file-api-lifecycle-regression",
  });
}

/** @param {HttpFixtureApp} app @returns {Promise<HttpFixtureServer>} */
function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(/** @type {import("node:http").RequestListener} */ (/** @type {unknown} */ (app)));
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
