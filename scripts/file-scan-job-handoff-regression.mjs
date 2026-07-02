import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-scan-job-handoff-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-scan-job-handoff.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "File-Scan-Job-Handoff-Test-123!";

const { filesService } = await import("../src/services/files.service.js");
const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  filesService.registerFileScanJobHandlers({ replace: true });

  const session = await readSeedSession();
  const taskId = await createTask(session, "File scan handoff task");
  const upload = await filesService.uploadAndAttach(session, {
    contentBase64: Buffer.from("file scan handoff body").toString("base64"),
    moduleId: "tasks",
    originalFilename: "file-scan-handoff.txt",
    targetId: taskId,
    targetType: "task",
  });
  const fileId = upload.file.fileId;
  const attachmentId = upload.attachment.fileAttachmentId;
  const queuedJob = await readFileScanJob(session.workspace_id, fileId);

  assert.equal(upload.file.status, "pending", "upload should leave the file pending until the worker scans it");
  assert.equal(upload.file.scanStatus, "pending", "upload should leave scan status pending until the worker scans it");
  assert.equal(queuedJob.status, "pending", "upload should queue a pending file.scan job");
  assert.equal(queuedJob.attempt_count, 0, "upload should not run the scan job inside the request");
  assertSafeReadModel(upload, "upload response");

  const pendingList = await filesService.listAttachments(session, {
    moduleId: "tasks",
    targetId: taskId,
    targetType: "task",
  });
  assert.equal(pendingList.attachments.length, 1, "target-scoped attachment reads should show pending uploads");
  assert.equal(pendingList.attachments[0].file.status, "pending");
  assert.equal(pendingList.attachments[0].file.scanStatus, "pending");
  assertSafeReadModel(pendingList, "pending attachment list");

  await assert.rejects(
    () => filesService.downloadFile(session, fileId),
    /not available for download/i,
    "pending scan files should not be downloadable",
  );

  const pendingPreview = (await filesService.readAttachmentPreviewDescriptor(session, attachmentId)).preview;
  assert.equal(pendingPreview.contentAvailable, false, "pending scan files should not expose preview content");
  assert.equal(pendingPreview.reason, "file_pending");
  assert.equal("contentUrl" in pendingPreview, false, "pending scan previews should not expose content URLs");
  assertSafeReadModel(pendingPreview, "pending preview descriptor");

  const summary = await runJobWorkerOnce({
    claimLimit: 5,
    mode: "inline",
    workerId: "file-scan-job-handoff-regression",
  });
  const completedJob = await readJobById(queuedJob.job_id);
  const scannedFile = await readFileRow(session.workspace_id, fileId);

  assert.equal(summary.completed, 1, "worker should complete the queued file.scan job");
  assert.equal(completedJob.status, "completed");
  assert.equal(scannedFile.status, "available");
  assert.equal(scannedFile.scan_status, "passed");

  const download = await filesService.downloadFile(session, fileId);
  assert.equal(await streamToText(download.stream), "file scan handoff body");

  console.log("File scan job handoff regression passed.");
} finally {
  await stopJobWorker().catch(() => {});
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
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
)
VALUES (
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

async function readFileScanJob(workspaceId, fileId) {
  const rows = await querySql(`
SELECT *
FROM jobs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND job_type = 'file.scan'
  AND payload_json LIKE ${sqlText(`%"fileId":"${fileId}"%`)}
ORDER BY created_at DESC
LIMIT 1;
`);

  assert.equal(rows.length, 1, "file.scan job should be queued");
  return rows[0];
}

async function readJobById(jobId) {
  const rows = await querySql(`
SELECT *
FROM jobs
WHERE job_id = ${sqlText(jobId)}
LIMIT 1;
`);

  assert.equal(rows.length, 1, "job should exist");
  return rows[0];
}

async function readFileRow(workspaceId, fileId) {
  const rows = await querySql(`
SELECT *
FROM files
WHERE workspace_id = ${sqlText(workspaceId)}
  AND file_id = ${sqlText(fileId)}
LIMIT 1;
`);

  assert.equal(rows.length, 1, "file should exist");
  return rows[0];
}

async function streamToText(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function assertSafeReadModel(value, label) {
  const json = JSON.stringify(value);

  assert.equal(json.includes("storage_key"), false, `${label} should not expose storage_key`);
  assert.equal(json.includes("storageKey"), false, `${label} should not expose storageKey`);
  assert.equal(json.includes("storagePath"), false, `${label} should not expose storage paths`);
  assert.equal(json.includes("scanner"), false, `${label} should not expose scanner internals`);
}
