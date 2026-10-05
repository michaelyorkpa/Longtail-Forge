import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-file-framework-contract-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-file-framework-contract.db");
process.env.SUPER_ADMIN_PASSWORD = "File-Framework-Contract-Test-123!";

const { validateModuleManifests } = await import("../src/core/modules/manifest-contract.js");
const { internalEventBus } = await import("../src/core/events/event-bus.js");
const { resolveStoragePath } = await import("../src/core/files/local-storage-adapter.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { filesService } = await import("../src/services/files.service.js");

try {
  await assertManifestValidation();
  await initializeDatabase();
  await assertSchemaAndPermissions();
  await assertAttachableRegistry();
  await assertStorageKeyContainment();
  await assertSafeLifecycleEvents();
  await assertIntegrity();

  console.log("File framework contract regression passed.");
} finally {
  internalEventBus.reset();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} FilesSession */
/** @typedef {import("../src/types/framework-contracts.js").InternalEvent} CapturedEvent */

async function assertManifestValidation() {
  assert.doesNotThrow(() => validateModuleManifests([
    manifest("test-files", {
      permissions: [
        permission("test.read"),
        permission("test.attach"),
        permission("test.remove"),
      ],
      attachableTypes: [attachable("test-files", "test_record")],
    }),
  ]));

  assert.throws(() => validateModuleManifests([
    manifest("test-files", {
      permissions: [permission("test.read"), permission("test.attach")],
      attachableTypes: [
        attachable("test-files", "test_record"),
        attachable("test-files", "test_record"),
      ],
    }),
  ]), /attachableTypes target 'test-files:test_record' is duplicated/);

  assert.throws(() => validateModuleManifests([
    manifest("test-files", {
      permissions: [permission("test.attach")],
      attachableTypes: [attachable("test-files", "test_record", { requiredReadPermission: "missing.read" })],
    }),
  ]), /requiredReadPermission references unknown permission 'missing.read'/);

  assert.throws(() => validateModuleManifests([
    manifest("test-files", {
      permissions: [permission("test.read"), permission("test.attach")],
      attachableTypes: [attachable("test-files", "test_record", { clientField: "client-id;drop" })],
    }),
  ]), /clientField has an invalid format/);

  assert.throws(() => validateModuleManifests([
    manifest("test-files", {
      permissions: [permission("test.read"), permission("test.attach")],
      attachableTypes: [attachable("test-files", "test_record", { lifecycleEvents: ["file.unknown"] })],
    }),
  ]), /lifecycleEvents contains invalid hook name 'file.unknown'/);
}

async function assertSchemaAndPermissions() {
  const tables = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN ('files', 'file_attachments', 'file_storage_accounting', 'file_workspace_settings')
ORDER BY name;
`);
  assert.deepEqual(tables.map((row) => row.name), ["file_attachments", "file_storage_accounting", "file_workspace_settings", "files"]);

  const fileColumns = await querySql("PRAGMA table_info(files);");
  for (const columnName of [
    "file_id",
    "workspace_id",
    "storage_provider",
    "storage_key",
    "original_filename",
    "stored_filename",
    "display_name",
    "extension",
    "mime_type_claimed",
    "mime_type_detected",
    "file_size_bytes",
    "sha256_hash",
    "status",
    "scan_status",
    "quarantine_reason",
    "uploaded_by_user_id",
    "created_at",
    "updated_at",
    "deleted_at",
    "external_availability_status",
    "external_reported_bytes",
    "external_source_id",
    "external_source_provider",
    "metadata_json",
    "storage_kind",
  ]) {
    assert.ok(fileColumns.some((column) => column.name === columnName), `files.${columnName} should exist`);
  }

  const accountingColumns = await querySql("PRAGMA table_info(file_storage_accounting);");
  for (const columnName of [
    "storage_accounting_id",
    "workspace_id",
    "user_id",
    "storage_kind",
    "storage_provider",
    "external_source_provider",
    "availability_status",
    "file_count",
    "internal_bytes",
    "external_reported_bytes",
    "calculated_at",
    "metadata_json",
  ]) {
    assert.ok(accountingColumns.some((column) => column.name === columnName), `file_storage_accounting.${columnName} should exist`);
  }

  const settingsColumns = await querySql("PRAGMA table_info(file_workspace_settings);");
  for (const columnName of [
    "workspace_id",
    "file_type_policy_mode",
    "allowed_extensions_json",
    "blocked_extensions_json",
    "internal_storage_limit_bytes",
    "per_user_storage_limit_bytes",
    "created_at",
    "updated_at",
    "metadata_json",
  ]) {
    assert.ok(settingsColumns.some((column) => column.name === columnName), `file_workspace_settings.${columnName} should exist`);
  }

  const attachmentColumns = await querySql("PRAGMA table_info(file_attachments);");
  for (const columnName of [
    "file_attachment_id",
    "workspace_id",
    "file_id",
    "module_id",
    "target_type",
    "target_id",
    "client_id",
    "project_id",
    "visibility",
    "attachment_role",
    "caption",
    "sort_order",
    "attached_by_user_id",
    "created_at",
    "removed_at",
    "metadata_json",
  ]) {
    assert.ok(attachmentColumns.some((column) => column.name === columnName), `file_attachments.${columnName} should exist`);
  }

  const permissionRows = await querySql(`
SELECT permission_id
FROM permissions
WHERE permission_id LIKE 'files.%'
ORDER BY permission_id;
`);
  assert.deepEqual(permissionRows.map((row) => row.permission_id), [
    "files.delete",
    "files.download",
    "files.manage_quarantine",
    "files.manage_workspace_settings",
    "files.upload",
    "files.view",
  ]);
}

async function assertAttachableRegistry() {
  const allTargets = modulesService.listAttachableTypes();
  assert.ok(allTargets.some((target) => target.moduleId === "tasks" && target.targetType === "task"));
  assert.ok(allTargets.some((target) => target.moduleId === "client-projects" && target.targetType === "client"));
  assert.ok(allTargets.some((target) => target.moduleId === "client-projects" && target.targetType === "project"));
  assert.ok(allTargets.some((target) => target.moduleId === "time-tracking" && target.targetType === "time_entry"));

  const session = await readProtectedSession();
  let activeTargets = await filesService.listActiveAttachableTypes(session.workspace_id);
  assert.ok(activeTargets.some((target) => target.moduleId === "tasks" && target.targetType === "task"));

  await runSql(`
UPDATE workspace_modules
SET status = 'disabled'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'tasks';
`);
  activeTargets = await filesService.listActiveAttachableTypes(session.workspace_id);
  assert.ok(!activeTargets.some((target) => target.moduleId === "tasks" && target.targetType === "task"));
  await assert.rejects(
    () => filesService.resolveAttachableType(session.workspace_id, "tasks", "task"),
    /not registered for file attachments/,
  );
}

async function assertStorageKeyContainment() {
  const rootDir = path.join(tempDir, "file-root");
  const safePath = resolveStoragePath(rootDir, "workspace/2026-06-09/example.bin");
  assert.equal(path.relative(rootDir, safePath).startsWith(".."), false);

  assert.throws(() => resolveStoragePath(rootDir, "../escape.bin"), /Invalid file storage key|escapes/);
  assert.throws(() => resolveStoragePath(rootDir, "workspace/../../escape.bin"), /Invalid file storage key|escapes/);
  assert.throws(() => resolveStoragePath(rootDir, "/absolute.bin"), /Invalid file storage key|escapes/);
}

async function assertSafeLifecycleEvents() {
  const session = await readProtectedSession();
  /** @type {CapturedEvent[]} */
  const receivedEvents = [];
  internalEventBus.reset();
  internalEventBus.on("file.attachment.created", async (event) => {
    receivedEvents.push(event);
  }, {
    id: "file-framework-contract:capture",
    moduleId: "test",
  });

  await filesService.emitFileLifecycleEvent("file.attachment.created", {
    session,
    fileId: "file-1",
    attachmentId: "attachment-1",
    moduleId: "tasks",
    targetType: "task",
    targetId: "task-1",
    status: "available",
    scanStatus: "passed",
    reason: "contract-test",
    metadata: {
      content: "raw file bytes must not pass",
      scannerDetail: "safe summary",
      storagePath: "D:/secret/path",
    },
  });

  assert.equal(receivedEvents.length, 1);
  const [lifecycleEvent] = receivedEvents;
  assert.ok(lifecycleEvent, "the lifecycle emit should publish one event");
  assert.equal(lifecycleEvent.name, "file.attachment.created");
  assert.equal(lifecycleEvent.workspace_id, session.workspace_id);
  assert.equal(lifecycleEvent.module_id, "tasks");
  assert.equal(lifecycleEvent.record_type, "task");
  assert.equal(lifecycleEvent.record_id, "task-1");
  // The bus publishes metadata as optional, so the redaction claims below
  // only mean something once the payload is proven to carry one.
  const { metadata } = lifecycleEvent;
  assert.ok(metadata, "the lifecycle event should carry metadata");
  assert.equal(metadata.file_id, "file-1");
  assert.equal(metadata.attachment_id, "attachment-1");
  assert.equal(metadata.scannerDetail, "safe summary");
  assert.equal(metadata.content, undefined);
  assert.equal(metadata.storagePath, undefined);

  await assert.rejects(
    () => filesService.emitFileLifecycleEvent("file.unknown", { session }),
    /Unknown file lifecycle event/,
  );
}

/** @returns {Promise<FilesSession>} */
async function readProtectedSession() {
  const rows = await querySql(`
SELECT user_id, username, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
ORDER BY username
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "protected user should exist");
  return workspaceSessionFixture(user);
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

/** @param {string} id @param {Record<string, unknown>} [overrides] */
function manifest(id, overrides = {}) {
  return {
    id,
    name: id,
    displayName: id,
    description: `${id} manifest`,
    category: "test",
    version: "0.32.10",
    enabledByDefault: true,
    ...overrides,
  };
}

/** @param {string} id */
function permission(id) {
  return {
    id,
    moduleId: "test-files",
    label: id,
    description: `${id} permission`,
  };
}

/** @param {string} moduleId @param {string} targetType @param {Record<string, unknown>} [overrides] */
function attachable(moduleId, targetType, overrides = {}) {
  return {
    targetType,
    moduleId,
    label: targetType,
    description: `${targetType} records`,
    tableName: "test_records",
    idField: "record_id",
    labelField: "title",
    workspaceField: "workspace_id",
    requiredReadPermission: "test.read",
    requiredAttachPermission: "test.attach",
    requiredRemovePermission: "files.delete",
    allowedFileCategories: ["document", "image"],
    allowedVisibilityValues: ["private", "workspace"],
    lifecycleEvents: ["file.attachment.created"],
    ...overrides,
  };
}
