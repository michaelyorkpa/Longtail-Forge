import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";

/** @typedef {typeof import("../src/services/files.service.js").filesService} FilesService */
/** @typedef {Awaited<ReturnType<FilesService["uploadAndAttach"]>>} FileUploadEnvelope */
/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} FilesSession */

/**
 * Narrow an upload envelope to the file record it must be carrying.
 *
 * The service publishes `file` as nullable because a refused upload produces
 * none, so every read through it here is a claim the upload was accepted.
 * @template {{ file: unknown }} Envelope
 * @param {Envelope} envelope
 * @param {string} label
 * @returns {NonNullable<Envelope["file"]>}
 */
function requireFile(envelope, label) {
  assert.ok(envelope.file, `${label} should carry its file record`);
  return envelope.file;
}


const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-files-attachment-readmodel-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-files-attachment-readmodel.db");
process.env.SUPER_ADMIN_PASSWORD = "Files-Attachment-Readmodel-Test-123!";

const { internalEventBus } = await import("../src/core/events/event-bus.js");
const { filesService, handleFileScanJob } = await import("../src/services/files.service.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { NOTE_VISIBILITIES } = await import("../src/modules/notes/library.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const adminSession = await readProtectedSession(workspace.workspace_id);
  const limitedSession = await createClientUserSession(workspace.workspace_id);
  const taskId = await createTask(adminSession, "Files read model task");

  await assertAttachmentListSortingAndPagination(adminSession, taskId);
  await assertTargetAccessBeforeListOrCount(adminSession, limitedSession);
  await assertLifecyclePayloadsStaySanitized(adminSession);
  await assertIntegrity();

  console.log("Files attachment read model regression passed.");
} finally {
  internalEventBus.reset();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {FilesSession} session @param {string} taskId */
async function assertAttachmentListSortingAndPagination(session, taskId) {
  const beta = await filesService.uploadAndAttach(session, uploadPayload(taskId, {
    originalFilename: "beta-evidence.txt",
    text: "beta evidence",
  }));
  const alpha = await filesService.uploadAndAttach(session, uploadPayload(taskId, {
    originalFilename: "alpha-evidence.txt",
    text: "alpha evidence with a bit more content",
  }));
  await completeFileScan(session, requireFile(beta, "beta upload").fileId);
  await completeFileScan(session, requireFile(alpha, "alpha upload").fileId);

  await runSql(`
UPDATE file_attachments
SET created_at = '2026-01-01T10:00:00.000Z'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND file_attachment_id = ${sqlText(beta.attachment.fileAttachmentId)};

UPDATE file_attachments
SET created_at = '2026-01-02T10:00:00.000Z'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND file_attachment_id = ${sqlText(alpha.attachment.fileAttachmentId)};
`);

  const newest = await filesService.listAttachments(session, {
    moduleId: "tasks",
    targetType: "task",
    targetId: taskId,
  });
  assert.equal(newest.sort, "newest");
  assert.equal(newest.pagination.total, 2);
  assert.deepEqual(
    newest.attachments.map((attachment) => attachment.file.originalFilename),
    ["alpha-evidence.txt", "beta-evidence.txt"],
    "newest sort should be deterministic service-owned ordering",
  );

  const byFilename = await filesService.listAttachments(session, {
    limit: "1",
    moduleId: "tasks",
    offset: "1",
    sort: "filename",
    targetType: "task",
    targetId: taskId,
  });
  assert.equal(byFilename.pagination.limit, 1);
  assert.equal(byFilename.pagination.offset, 1);
  assert.equal(byFilename.pagination.returned, 1);
  assert.equal(byFilename.pagination.hasMore, false);
  assert.deepEqual(byFilename.attachments.map((attachment) => attachment.file.originalFilename), ["beta-evidence.txt"]);
  assert.equal(JSON.stringify(byFilename).includes("storage_key"), false, "attachment reads must not expose storage keys");

  const counts = await filesService.countAttachmentsForTargets(session, {
    moduleId: "tasks",
    targetType: "task",
    targetIds: [taskId],
  });
  assert.equal(/** @type {Record<string, number>} */ (counts.counts)[taskId], 2);
  assert.equal(counts.meta?.readableTargets, 1);
}

/** @param {FilesSession} session @param {string} fileId */
async function completeFileScan(session, fileId) {
  await handleFileScanJob({
    payload: {
      fileId,
      requestedByUserId: session.user_id,
      workspaceId: session.workspace_id,
    },
  });
}

/** @param {FilesSession} adminSession @param {FilesSession} limitedSession */
async function assertTargetAccessBeforeListOrCount(adminSession, limitedSession) {
  const note = await notesService.create({
    title: "Private attachment note",
    body_markdown: "Private note attachment body.",
    visibility: NOTE_VISIBILITIES.PRIVATE,
  }, adminSession);
  await filesService.uploadAndAttach(adminSession, {
    ...uploadPayload(note.note.note_id, {
      originalFilename: "private-note-file.txt",
      text: "private note file",
    }),
    moduleId: "notes",
    targetType: "note",
  });

  await assert.rejects(
    () => filesService.listAttachments(limitedSession, {
      moduleId: "notes",
      targetType: "note",
      targetId: note.note.note_id,
    }),
    /private note|permission|access/i,
  );

  const limitedCounts = await filesService.countAttachmentsForTargets(limitedSession, {
    moduleId: "notes",
    targetType: "note",
    targetIds: [note.note.note_id],
  });
  assert.equal(/** @type {Record<string, number>} */ (limitedCounts.counts)[note.note.note_id], 0);
  assert.equal(limitedCounts.meta?.readableTargets, 0);
  assert.equal(JSON.stringify(limitedCounts).includes("Private attachment note"), false, "counts must not leak inaccessible target labels");
  assert.equal(JSON.stringify(limitedCounts).includes("private-note-file"), false, "counts must not leak inaccessible file labels");
}

/** @param {FilesSession} session */
async function assertLifecyclePayloadsStaySanitized(session) {
  /** @type {import("../src/types/framework-contracts.js").InternalEvent[]} */
  const captured = [];
  internalEventBus.reset();
  internalEventBus.on("file.attachment.created", async (event) => {
    captured.push(event);
  }, {
    id: "files-attachment-readmodel:capture",
    moduleId: "test",
  });

  await filesService.emitFileLifecycleEvent("file.attachment.created", {
    attachmentId: "attachment-safe",
    fileId: "file-safe",
    metadata: {
      scannerDetail: "safe summary",
      storagePath: "D:/private/file.bin",
      token: "secret-token",
    },
    moduleId: "tasks",
    reason: "regression",
    scanStatus: "passed",
    session,
    status: "available",
    targetId: "task-safe",
    targetType: "task",
  });

  assert.equal(captured.length, 1);
  // The bus publishes metadata as optional, so the sanitization claim below
  // only means anything once the payload is proven to carry one.
  const metadata = captured[0].metadata;
  assert.ok(metadata, "the attachment lifecycle event should carry metadata");
  assert.equal(metadata.scannerDetail, "safe summary");
  assert.equal(metadata.storagePath, undefined);
  assert.equal(metadata.token, undefined);
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

/** @param {string} targetId @param {{ displayName?: string, originalFilename?: string, text?: string }} [options] */
function uploadPayload(targetId, options = {}) {
  return {
    contentBase64: Buffer.from(options.text || "hello file framework").toString("base64"),
    displayName: options.displayName || options.originalFilename || "Evidence",
    moduleId: "tasks",
    originalFilename: options.originalFilename || "evidence.txt",
    targetId,
    targetType: "task",
    visibility: "private",
  };
}

async function readWorkspace() {
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);

  /** @type {{ workspace_id: string }} */
  const workspace = requireFirstRow(rows, "workspace");
  assert.ok(workspace.workspace_id, "workspace should exist");
  return workspace;
}

/** @param {string} workspaceId @returns {Promise<FilesSession>} */
async function readProtectedSession(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  /** @type {{ display_name: string, timezone: string, user_id: string, username: string }} */
  const admin = requireFirstRow(rows, "protected user");
  assert.ok(admin.user_id, "protected user should exist");
  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    ip_address: "127.0.0.1",
    password_change_required: false,
    session_mode: "normal",
    timezone: admin.timezone || "America/New_York",
    user_id: admin.user_id,
    username: admin.username,
    workspace_id: workspaceId,
  };
}

/** @param {string} workspaceId @returns {Promise<FilesSession>} */
async function createClientUserSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(`limited-files-${userId}@example.test`)},
  'Limited Files User',
  NULL,
  'America/New_York',
  'unused',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);

INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);

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
  ${sqlText(userId)},
  'client_user',
  'workspace',
  ${sqlText(workspaceId)},
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    ip_address: "127.0.0.1",
    password_change_required: false,
    session_mode: "normal",
    timezone: "America/New_York",
    user_id: userId,
    username: `limited-files-${userId}@example.test`,
    workspace_id: workspaceId,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
