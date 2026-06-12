import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-storage-accounting-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-storage-accounting.db");
process.env.SUPER_ADMIN_PASSWORD = "File-Storage-Accounting-Test-123!";

const { filesService } = await import("../src/services/files.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const adminSession = await readProtectedSession(workspace.workspace_id);
  const limitedSession = await createLimitedSession(workspace.workspace_id);
  const taskId = await createTask(adminSession, "File storage accounting task");

  await assertSchema();
  await assertInternalAccounting(adminSession, taskId);
  await assertExternalAccounting(adminSession);
  await assertAccountingReadPermissions(limitedSession);
  await assertIntegrity();

  console.log("File storage accounting regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertSchema() {
  const fileColumns = await querySql("PRAGMA table_info(files);");
  for (const columnName of [
    "storage_kind",
    "external_source_provider",
    "external_source_id",
    "external_availability_status",
    "external_reported_bytes",
  ]) {
    assert.ok(fileColumns.some((column) => column.name === columnName), `files.${columnName} should exist`);
  }

  const tables = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name = 'file_storage_accounting';
`);
  assert.equal(tables.length, 1, "file_storage_accounting table should exist");
}

async function assertInternalAccounting(session, taskId) {
  const upload = await filesService.uploadAndAttach(session, uploadPayload(taskId, {
    originalFilename: "storage-accounting.txt",
    text: "internal bytes for accounting",
  }));
  let accounting = await filesService.readStorageAccounting(session);

  assert.equal(accounting.totals.internalBytes, Buffer.byteLength("internal bytes for accounting"));
  assert.equal(accounting.totals.externalReportedBytes, 0);
  assert.equal(accounting.totals.internalFileCount, 1);
  assert.equal(JSON.stringify(accounting).includes("storage-accounting.txt"), false, "accounting must not expose file labels");
  assert.equal(JSON.stringify(accounting).includes("storage_key"), false, "accounting must not expose storage keys");

  await filesService.deleteFile(session, upload.file.fileId);
  accounting = await filesService.readStorageAccounting(session);
  assert.equal(accounting.totals.internalBytes, Buffer.byteLength("internal bytes for accounting"));
  assert.equal(accounting.entries.some((entry) => entry.storageKind === "internal" && entry.availabilityStatus === "deleted"), true);

  await filesService.restoreFile(session, upload.file.fileId);
  accounting = await filesService.readStorageAccounting(session);
  assert.equal(accounting.totals.internalBytes, Buffer.byteLength("internal bytes for accounting"));
  assert.equal(accounting.entries.some((entry) => entry.storageKind === "internal" && entry.availabilityStatus === "available"), true);
}

async function assertExternalAccounting(session) {
  await filesService.recordExternalStorageAccounting(session, {
    availabilityStatus: "available",
    externalReportedBytes: 4096,
    externalSourceProvider: "example-drive",
    fileCount: 3,
  });

  const accounting = await filesService.readStorageAccounting(session);
  const external = await filesService.readStorageAccounting(session, { storageKind: "external" });

  assert.equal(accounting.totals.internalBytes, Buffer.byteLength("internal bytes for accounting"));
  assert.equal(accounting.totals.externalReportedBytes, 4096);
  assert.equal(external.totals.internalBytes, 0);
  assert.equal(external.totals.externalReportedBytes, 4096);
  assert.equal(external.entries[0].externalSourceProvider, "example-drive");
}

async function assertAccountingReadPermissions(session) {
  await assert.rejects(
    () => filesService.readStorageAccounting(session),
    /permission/i,
  );
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

  assert.ok(rows[0]?.workspace_id, "workspace should exist");
  return rows[0];
}

async function readProtectedSession(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  assert.ok(rows[0]?.user_id, "protected user should exist");
  return {
    active_workspace_id: workspaceId,
    display_name: rows[0].display_name,
    timezone: rows[0].timezone || "America/New_York",
    user_id: rows[0].user_id,
    username: rows[0].username,
    workspace_id: workspaceId,
  };
}

async function createLimitedSession(workspaceId) {
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
  ${sqlText(`storage-limited-${userId}@example.test`)},
  'Storage Limited User',
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
`);

  return {
    active_workspace_id: workspaceId,
    display_name: "Storage Limited User",
    timezone: "America/New_York",
    user_id: userId,
    username: `storage-limited-${userId}@example.test`,
    workspace_id: workspaceId,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
