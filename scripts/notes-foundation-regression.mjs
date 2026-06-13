import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-foundation-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-foundation.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Foundation-Test-123!";

const { modulesService } = await import("../src/core/modules/modules.service.js");
const {
  NOTE_LIBRARY_BUCKETS,
  deriveSuggestedLibraryBucket,
} = await import("../src/modules/notes/library.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  await assertNotesModuleManifest();
  await assertNotesMigrationApplied();
  await assertNotesSchema();
  await assertNotesConstraints();
  await assertLibraryDerivation();
  await assertModuleLifecycle();
  await assertIntegrity();

  console.log("Notes foundation regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertNotesModuleManifest() {
  const notesModule = modulesService.getModule("notes");

  assert.equal(notesModule.id, "notes");
  assert.equal(notesModule.version, "0.33.5.8.3");
  assert.equal(notesModule.enabledByDefault, true);
  assert.equal(notesModule.canDisable, true);
  assert.equal(notesModule.historicalReadAccess, true);
  assert.ok(notesModule.migrationsDir, "Notes should contribute module-owned migrations");
  assert.equal(notesModule.browserApiRoutes.length, 1, "Notes browser APIs should be registered");
  assert.ok(notesModule.searchableTypes.some((type) => (
    type.recordType === "note" &&
    type.indexer === "notes.records" &&
    type.sourceLabel === "Notes"
  )), "Notes should register searchable note records");
  assert.ok(notesModule.notificationEvents.some((event) => (
    event.id === "note.updated" &&
    event.recipientMode === "explicit_users"
  )), "Notes should declare conservative owner update notifications");
  assert.ok(notesModule.help.articles.some((article) => article.id === "notes.attachments-search"));
  assert.ok(notesModule.taggableTypes.some((type) => type.targetType === "note"), "Notes should register note tag targets");
  assert.ok(notesModule.attachableTypes.some((type) => type.targetType === "note"), "Notes should register note attachment targets");
  assert.ok(notesModule.settings.some((setting) => setting.id === "notesEnabled" && setting.moduleStatus === true));
}

async function assertNotesMigrationApplied() {
  const rows = await querySql(`
SELECT version, module_id, name
FROM schema_migrations
WHERE version IN ('044', '060')
ORDER BY version;
`);

  assert.deepEqual(rows, [{
    version: "044",
    module_id: "notes",
    name: "add_notes_foundation",
  }, {
    version: "060",
    module_id: "notes",
    name: "note_kind_content_values",
  }]);
}

async function assertNotesSchema() {
  const tables = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN ('notes', 'note_links', 'note_library_collections')
ORDER BY name;
`);
  assert.deepEqual(tables.map((row) => row.name), ["note_library_collections", "note_links", "notes"]);

  await assertColumns("notes", [
    "note_id",
    "workspace_id",
    "title",
    "slug",
    "body_markdown",
    "body_excerpt",
    "body_plaintext_index",
    "note_type",
    "library_bucket",
    "library_bucket_source",
    "status",
    "visibility",
    "security_mode",
    "client_id",
    "project_id",
    "task_id",
    "ticket_id",
    "linked_user_id",
    "note_collection_id",
    "owner_user_id",
    "created_by_user_id",
    "updated_by_user_id",
    "created_at",
    "updated_at",
    "archived_at",
    "deleted_at",
    "metadata_json",
  ]);

  await assertColumns("note_links", [
    "note_link_id",
    "workspace_id",
    "note_id",
    "module_id",
    "target_type",
    "target_id",
    "link_role",
    "scope_role",
    "created_by_user_id",
    "created_at",
    "removed_at",
    "metadata_json",
  ]);

  await assertColumns("note_library_collections", [
    "note_library_collection_id",
    "workspace_id",
    "title",
    "slug",
    "description",
    "library_bucket",
    "parent_collection_id",
    "path_cache",
    "depth",
    "sort_order",
    "collection_source",
    "status",
    "created_by_user_id",
    "updated_by_user_id",
    "created_at",
    "updated_at",
    "archived_at",
    "deleted_at",
    "metadata_json",
  ]);

  const indexes = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'idx_notes_workspace_note',
    'idx_notes_workspace_library',
    'idx_notes_workspace_library_status',
    'idx_notes_workspace_status',
    'idx_notes_workspace_visibility',
    'idx_notes_workspace_security_mode',
    'idx_notes_workspace_owner',
    'idx_notes_workspace_created_by',
    'idx_notes_workspace_updated_at',
    'idx_notes_workspace_client',
    'idx_notes_workspace_collection',
    'idx_notes_workspace_project',
    'idx_notes_workspace_task',
    'idx_notes_workspace_ticket',
    'idx_notes_workspace_linked_user',
    'idx_notes_workspace_slug',
    'idx_note_links_workspace_note',
    'idx_note_links_workspace_target',
    'idx_note_links_workspace_scope',
    'idx_note_links_unique_active_target',
    'idx_note_library_collections_workspace_bucket',
    'idx_note_library_collections_workspace_parent',
    'idx_note_library_collections_workspace_path',
    'idx_note_library_collections_workspace_sibling_slug',
    'idx_note_library_collections_workspace_status'
  )
ORDER BY name;
`);

  assert.equal(indexes.length, 25, "Notes foundation should create the expected lookup and uniqueness indexes");
}

async function assertColumns(tableName, expectedColumns) {
  const rows = await querySql(`PRAGMA table_info(${tableName});`);
  const columns = new Set(rows.map((row) => row.name));

  for (const column of expectedColumns) {
    assert.ok(columns.has(column), `${tableName}.${column} should exist`);
  }
}

async function assertNotesConstraints() {
  const workspace = await readWorkspace();
  const now = new Date().toISOString();
  const notesTable = await querySql("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notes';");
  const revisionsTable = await querySql("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'note_revisions';");

  for (const noteKind of ["decision", "procedure", "reference", "idea", "log", "client", "project", "task", "ticket", "user"]) {
    assert.match(notesTable[0].sql, new RegExp(`'${noteKind}'`), `notes.note_type should allow ${noteKind}`);
    assert.match(revisionsTable[0].sql, new RegExp(`'${noteKind}'`), `note_revisions.note_type should allow ${noteKind}`);
  }

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
  updated_at
) VALUES (
  'note-1',
  ${sqlText(workspace.workspace_id)},
  'Foundation Note',
  '# Foundation',
  'active_work',
  'manual',
  'archived',
  'internal',
  'normal',
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO note_links (
  note_link_id,
  workspace_id,
  note_id,
  module_id,
  target_type,
  target_id,
  link_role,
  scope_role,
  created_at
) VALUES (
  'note-link-1',
  ${sqlText(workspace.workspace_id)},
  'note-1',
  'tasks',
  'task',
  'task-1',
  'scope',
  'primary',
  ${sqlText(now)}
);
`);

  await runSql(`
INSERT INTO notes (
  note_id,
  workspace_id,
  title,
  body_markdown,
  note_type,
  library_bucket,
  library_bucket_source,
  status,
  visibility,
  security_mode,
  created_at,
  updated_at
) VALUES (
  'note-kind-decision',
  ${sqlText(workspace.workspace_id)},
  'Decision Note',
  'Decision body',
  'decision',
  'reference',
  'manual',
  'active',
  'internal',
  'normal',
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO notes (
  note_id,
  workspace_id,
  title,
  body_markdown,
  note_type,
  library_bucket,
  library_bucket_source,
  status,
  visibility,
  security_mode,
  created_at,
  updated_at
) VALUES (
  'note-kind-legacy-client',
  ${sqlText(workspace.workspace_id)},
  'Legacy Client Note',
  'Legacy body',
  'client',
  'reference',
  'manual',
  'active',
  'internal',
  'normal',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  const noteKindRows = await querySql(`
SELECT note_id, note_type
FROM notes
WHERE note_id IN ('note-kind-decision', 'note-kind-legacy-client')
ORDER BY note_id;
`);
  assert.deepEqual(noteKindRows, [
    { note_id: "note-kind-decision", note_type: "decision" },
    { note_id: "note-kind-legacy-client", note_type: "client" },
  ]);

  const noteRows = await querySql("SELECT library_bucket, library_bucket_source, status FROM notes WHERE note_id = 'note-1';");
  assert.deepEqual(noteRows[0], {
    library_bucket: "active_work",
    library_bucket_source: "manual",
    status: "archived",
  });

  await assert.rejects(
    () => runSql(`
INSERT INTO notes (
  note_id,
  workspace_id,
  title,
  library_bucket,
  created_at,
  updated_at
) VALUES (
  'note-invalid',
  ${sqlText(workspace.workspace_id)},
  'Invalid',
  'archive',
  ${sqlText(now)},
  ${sqlText(now)}
);
`),
    /CHECK constraint failed/,
  );
}

function assertLibraryDerivation() {
  assert.equal(
    deriveSuggestedLibraryBucket([{ targetType: "project", targetId: "project-1", clientId: "client-1" }]),
    NOTE_LIBRARY_BUCKETS.ONGOING_AREA,
  );
  assert.equal(
    deriveSuggestedLibraryBucket([{ targetType: "client", targetId: "client-1" }]),
    NOTE_LIBRARY_BUCKETS.ONGOING_AREA,
  );
  assert.equal(
    deriveSuggestedLibraryBucket([
      { targetType: "project", targetId: "project-1", clientId: "client-1" },
      { targetType: "project", targetId: "project-2", clientId: "client-1" },
    ]),
    NOTE_LIBRARY_BUCKETS.ONGOING_AREA,
  );
  assert.equal(
    deriveSuggestedLibraryBucket([
      { targetType: "project", targetId: "project-1", clientId: "client-1" },
      { targetType: "project", targetId: "project-2", clientId: "client-2" },
    ]),
    NOTE_LIBRARY_BUCKETS.REFERENCE,
  );
  assert.equal(deriveSuggestedLibraryBucket([]), NOTE_LIBRARY_BUCKETS.REFERENCE);
}

async function assertModuleLifecycle() {
  const workspace = await readWorkspace();
  const rows = await querySql(`
SELECT status
FROM workspace_modules
WHERE workspace_id = ${sqlText(workspace.workspace_id)}
  AND module_id = 'notes';
`);

  assert.equal(rows[0]?.status, "enabled", "Notes should be enabled by default for the workspace");

  await modulesService.setModuleStatus(workspace.workspace_id, "notes", false, { actorUserId: "test" });
  assert.equal(await modulesService.canWriteModule(workspace.workspace_id, "notes"), false);
  assert.equal(await modulesService.canReadModule(workspace.workspace_id, "notes"), true);
}

async function readWorkspace() {
  const rows = await querySql("SELECT workspace_id FROM workspaces ORDER BY workspace_id LIMIT 1;");
  return rows[0];
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
