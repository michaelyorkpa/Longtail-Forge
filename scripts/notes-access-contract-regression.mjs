import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-access-contract-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-access-contract.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Access-Contract-Test-123!";

const { modulesService } = await import("../src/core/modules/modules.service.js");
const {
  NOTE_AUDIT_RECORD_TYPES,
  NOTE_EVENT_TYPES,
  NOTE_IMPORT_METADATA_FIELDS,
  NOTE_PERMISSIONS,
  NOTE_RESOURCE_DEFINITION,
  canAccessNote,
  canExposeNoteInAggregate,
  sanitizeNoteLifecyclePayload,
} = await import("../src/modules/notes/access-policy.js");
const { NOTE_LIBRARY_BUCKETS, NOTE_SECURITY_MODES, NOTE_STATUSES, NOTE_VISIBILITIES } = await import("../src/modules/notes/library.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  await assertNotesManifestContract();
  await assertPermissionRows();
  await assertAccessPolicy();
  await assertAccessMigrationApplied();
  await assertImportMetadataSchema();
  await assertAccessIndexes();
  await assertImportMetadataStorage();
  await assertIntegrity();

  console.log("Notes access contract regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertNotesManifestContract() {
  const notesModule = modulesService.getModule("notes");
  const permissionIds = notesModule.permissions.map((permission) => permission.id);
  const eventNames = notesModule.eventTypes.map((eventType) => eventType.event);
  const auditTypes = notesModule.auditRecordTypes.map((recordType) => recordType.recordType);

  assert.equal(notesModule.version, "0.33.5.8.3");
  assert.deepEqual(permissionIds, Object.values(NOTE_PERMISSIONS));
  assert.deepEqual(notesModule.resourceDefinitions, [NOTE_RESOURCE_DEFINITION]);
  assert.deepEqual(auditTypes, NOTE_AUDIT_RECORD_TYPES.map((recordType) => recordType.recordType));
  assert.deepEqual(eventNames, NOTE_EVENT_TYPES.map((eventType) => eventType.event));
  assert.equal(notesModule.browserApiRoutes.length, 1, "Notes browser API routes should be registered");
  assert.ok(notesModule.searchableTypes.some((type) => type.recordType === "note" && type.indexer === "notes.records"));
  assert.equal(notesModule.taggableTypes.length, 1, "Notes should expose one taggable note target");
  assert.equal(notesModule.attachableTypes.length, 1, "Notes should expose one attachable note target");
  assert.equal(notesModule.taggableTypes[0].targetType, "note");
  assert.equal(notesModule.attachableTypes[0].targetType, "note");

  const adminGrant = notesModule.defaultRolePermissions.find((grant) => grant.roleId === "workspace_admin");
  const externalGrant = notesModule.defaultRolePermissions.find((grant) => grant.roleId === "client_external_user");
  assert.deepEqual(adminGrant.permissions, Object.values(NOTE_PERMISSIONS));
  assert.deepEqual(externalGrant.permissions, [], "external client users should not receive default Notes access");
}

async function assertPermissionRows() {
  const rows = await querySql(`
SELECT permission_id
FROM permissions
WHERE permission_id LIKE 'notes.%'
ORDER BY permission_id;
`);

  assert.deepEqual(rows.map((row) => row.permission_id), [...Object.values(NOTE_PERMISSIONS)].sort());

  const roleRows = await querySql(`
SELECT role_id, permission_id
FROM role_permissions
WHERE permission_id LIKE 'notes.%'
ORDER BY role_id, permission_id;
`);
  const workspaceAdminRows = roleRows.filter((row) => row.role_id === "workspace_admin");
  const externalRows = roleRows.filter((row) => row.role_id === "client_external_user");
  assert.equal(workspaceAdminRows.length, Object.values(NOTE_PERMISSIONS).length);
  assert.equal(externalRows.length, 0);
}

async function assertAccessPolicy() {
  const session = { workspace_id: "workspace-1", user_id: "user-1" };
  const baseNote = {
    note_id: "note-1",
    workspace_id: "workspace-1",
    owner_user_id: "user-1",
    created_by_user_id: "user-2",
    library_bucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    status: NOTE_STATUSES.ACTIVE,
    visibility: NOTE_VISIBILITIES.INTERNAL,
    security_mode: NOTE_SECURITY_MODES.NORMAL,
  };

  assert.equal(canAccessNote({
    note: baseNote,
    operation: "read",
    session,
    permissions: [NOTE_PERMISSIONS.VIEW],
  }).allowed, true);

  assert.equal(canAccessNote({
    note: { ...baseNote, workspace_id: "workspace-2" },
    operation: "read",
    session,
    permissions: [NOTE_PERMISSIONS.VIEW],
  }).reason, "workspace_mismatch");

  assert.equal(canAccessNote({
    note: baseNote,
    operation: "create",
    session,
    permissions: [NOTE_PERMISSIONS.CREATE],
    notesModuleEnabled: false,
  }).reason, "module_disabled");

  assert.equal(canAccessNote({
    note: { ...baseNote, status: NOTE_STATUSES.ARCHIVED },
    operation: "update",
    session,
    permissions: [NOTE_PERMISSIONS.UPDATE],
  }).reason, "archived_read_only");

  assert.equal(canAccessNote({
    note: { ...baseNote, visibility: NOTE_VISIBILITIES.PRIVATE, owner_user_id: "other-user", created_by_user_id: "other-user" },
    operation: "read",
    session,
    permissions: [NOTE_PERMISSIONS.VIEW],
  }).reason, "private_note");

  assert.equal(canAccessNote({
    note: { ...baseNote, visibility: NOTE_VISIBILITIES.PRIVATE, owner_user_id: "other-user", created_by_user_id: "other-user" },
    operation: "read",
    session,
    permissions: [NOTE_PERMISSIONS.VIEW, NOTE_PERMISSIONS.VIEW_PRIVATE],
  }).allowed, true);

  assert.equal(canAccessNote({
    note: { ...baseNote, security_mode: NOTE_SECURITY_MODES.SECURE },
    operation: "read",
    session,
    permissions: [NOTE_PERMISSIONS.VIEW],
  }).reason, "secure_note_permission");

  assert.equal(canExposeNoteInAggregate({
    note: { ...baseNote, security_mode: NOTE_SECURITY_MODES.SECURE },
    session,
    permissions: [NOTE_PERMISSIONS.VIEW, NOTE_PERMISSIONS.SECURE_VIEW],
  }), false, "secure notes should not appear in aggregate/count surfaces by default");

  assert.equal(canAccessNote({
    note: baseNote,
    operation: "read",
    session,
    permissions: [NOTE_PERMISSIONS.VIEW],
    linkedRecordAccess: false,
  }).reason, "linked_record_hidden");

  const safePayload = sanitizeNoteLifecyclePayload({
    workspace_id: "workspace-1",
    actor_user_id: "user-1",
    note_id: "note-1",
    title: "Safe title",
    body_markdown: "# Do not emit",
    encrypted_payload: "secret",
    storage_key: "../unsafe",
    previous_values: {
      title: "Old",
      body_markdown: "Hidden body",
      library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    },
  });

  assert.equal(safePayload.body_markdown, undefined);
  assert.equal(safePayload.encrypted_payload, undefined);
  assert.equal(safePayload.storage_key, undefined);
  assert.deepEqual(safePayload.previous_values, { title: "Old", library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE });
}

async function assertAccessMigrationApplied() {
  const rows = await querySql(`
SELECT version, module_id, name
FROM schema_migrations
WHERE version = '046';
`);

  assert.deepEqual(rows[0], {
    version: "046",
    module_id: "notes",
    name: "add_note_access_indexes_and_import_metadata",
  });
}

async function assertImportMetadataSchema() {
  await assertColumns("notes", NOTE_IMPORT_METADATA_FIELDS);
  await assertColumns("note_revisions", NOTE_IMPORT_METADATA_FIELDS);
}

async function assertColumns(tableName, expectedColumns) {
  const rows = await querySql(`PRAGMA table_info(${tableName});`);
  const columns = new Set(rows.map((row) => row.name));

  for (const column of expectedColumns) {
    assert.ok(columns.has(column), `${tableName}.${column} should exist`);
  }
}

async function assertAccessIndexes() {
  const rows = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'idx_notes_workspace_library_visibility',
    'idx_notes_workspace_library_security',
    'idx_notes_workspace_slug_lookup',
    'idx_notes_workspace_import_source',
    'idx_notes_workspace_import_batch',
    'idx_note_revisions_workspace_import_source',
    'idx_note_revisions_workspace_import_batch'
  )
ORDER BY name;
`);

  assert.equal(rows.length, 7, "Notes access/import pass should create the expected indexes");
}

async function assertImportMetadataStorage() {
  const workspace = await readWorkspace();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO notes (
  note_id,
  workspace_id,
  title,
  body_markdown,
  library_bucket,
  library_bucket_source,
  status,
  visibility,
  security_mode,
  created_at,
  updated_at,
  import_source,
  import_source_id,
  import_source_path,
  imported_at,
  import_batch_id,
  original_notebook,
  original_section_group,
  original_section,
  original_page_id
) VALUES (
  'note-import-1',
  ${sqlText(workspace.workspace_id)},
  'Imported Note',
  '# Imported',
  'reference',
  'imported',
  'active',
  'private',
  'normal',
  ${sqlText(now)},
  ${sqlText(now)},
  'onenote',
  'page-1',
  'Notebook/Section/Page',
  ${sqlText(now)},
  'batch-1',
  'Notebook',
  'Section Group',
  'Section',
  'page-1'
);

INSERT INTO note_revisions (
  note_revision_id,
  workspace_id,
  note_id,
  revision_number,
  title,
  body_markdown,
  body_excerpt,
  note_type,
  library_bucket,
  status,
  visibility,
  security_mode,
  created_at,
  import_source,
  import_source_id,
  import_source_path,
  imported_at,
  import_batch_id,
  original_notebook,
  original_section_group,
  original_section,
  original_page_id
) VALUES (
  'note-import-revision-1',
  ${sqlText(workspace.workspace_id)},
  'note-import-1',
  1,
  'Imported Note',
  '# Imported',
  'Imported',
  'general',
  'reference',
  'active',
  'private',
  'normal',
  ${sqlText(now)},
  'onenote',
  'page-1',
  'Notebook/Section/Page',
  ${sqlText(now)},
  'batch-1',
  'Notebook',
  'Section Group',
  'Section',
  'page-1'
);
`);

  const rows = await querySql("SELECT import_source, import_batch_id, original_notebook FROM notes WHERE note_id = 'note-import-1';");
  assert.deepEqual(rows[0], {
    import_source: "onenote",
    import_batch_id: "batch-1",
    original_notebook: "Notebook",
  });

  const access = canAccessNote({
    note: {
      note_id: "note-import-1",
      workspace_id: workspace.workspace_id,
      visibility: NOTE_VISIBILITIES.PRIVATE,
      security_mode: NOTE_SECURITY_MODES.NORMAL,
      status: NOTE_STATUSES.ACTIVE,
      owner_user_id: "someone-else",
      created_by_user_id: "someone-else",
    },
    operation: "read",
    session: { workspace_id: workspace.workspace_id, user_id: "viewer" },
    permissions: [NOTE_PERMISSIONS.VIEW],
  });

  assert.equal(access.reason, "private_note", "import metadata must not grant note access");
}

async function readWorkspace() {
  const rows = await querySql("SELECT workspace_id FROM workspaces ORDER BY workspace_id LIMIT 1;");
  return rows[0];
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
