import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-integration-closeout-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-integration-closeout.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Integration-Closeout-Test-123!";
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "notes-integration-closeout-secure-note-test-key";

const { modulesService } = await import("../src/core/modules/modules.service.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { NOTE_LIBRARY_BUCKETS, NOTE_SECURITY_MODES, NOTE_VISIBILITIES } = await import("../src/modules/notes/library.js");
const { searchService } = await import("../src/services/search.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  await searchService.ensureSearchBackendStorage({ refresh: true });

  const workspace = await readWorkspace();
  const adminSession = await readProtectedSession(workspace.workspace_id);
  const limitedSession = await createClientUserSession(workspace.workspace_id);

  await assertManifestIntegrationContract();
  await assertNotesDoNotBypassFrameworkStorage();
  await assertArchiveCollectionAndSearchBehavior(adminSession);
  await assertPermissionSafeCollectionCounts(adminSession, limitedSession);
  await assertLinkedRecordAccessHidesNotes(adminSession, limitedSession);
  await assertIntegrity();

  console.log("Notes integration closeout regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertManifestIntegrationContract() {
  const notesModule = modulesService.getModule("notes");

  assert.equal(notesModule.version, "0.33.5.20.5");
  assert.equal(notesModule.publicApiRoutes.length, 1, "Notes should expose only the read-only public API router");
  assert.deepEqual(notesModule.apiScopes.map((scope) => scope.id), ["notes:read"]);
  assert.deepEqual(
    notesModule.publicApiEndpoints.map((endpoint) => `${endpoint.method} ${endpoint.path} ${endpoint.scope}`),
    ["GET /api/v1/notes notes:read", "GET /api/v1/notes/:noteId notes:read"],
  );
  assert.ok(notesModule.permissions.some((permission) => permission.id === "notes.view"));
  assert.ok(notesModule.taggableTypes.some((type) => type.targetType === "note" && type.requiredTagPermission === "tags.assign"));
  assert.ok(notesModule.searchableTypes.some((type) => type.recordType === "note" && type.indexer === "notes.records"));
  assert.ok(notesModule.attachableTypes.some((type) => type.targetType === "note" && type.lifecycleEvents.includes("file.attachment.created")));
  assert.ok(notesModule.auditRecordTypes.some((type) => type.recordType === "note"));
  assert.ok(notesModule.eventTypes.some((type) => type.event === "note.updated"));
  assert.ok(notesModule.notificationEvents.some((event) => event.id === "note.updated" && event.recipientMode === "explicit_users"));
  assert.ok(notesModule.help.articles.length >= 4);
}

async function assertNotesDoNotBypassFrameworkStorage() {
  const service = await fs.readFile(path.join(process.cwd(), "src/modules/notes/notes.service.js"), "utf8");
  const repository = await fs.readFile(path.join(process.cwd(), "src/modules/notes/notes.repo.js"), "utf8");
  const routes = await fs.readFile(path.join(process.cwd(), "src/modules/notes/notes.routes.js"), "utf8");
  const moduleManifest = await fs.readFile(path.join(process.cwd(), "src/modules/notes/module.js"), "utf8");

  assert.match(service, /permissionsService/, "Notes service should use the framework permissions service");
  assert.match(service, /tagsService/, "Notes service should use the framework tags service");
  assert.match(service, /searchIndexSyncService/, "Notes service should use the framework search sync service");
  assert.match(service, /auditService\.record/, "Notes service should use the framework audit service");
  assert.match(service, /modulesService\.emitInternalEvent/, "Notes service should use module lifecycle events");
  assert.match(moduleManifest, /help:/, "Notes Help should be contributed through the module manifest");
  assert.doesNotMatch(`${service}\n${repository}\n${routes}`, /INSERT\s+INTO\s+search_index|UPDATE\s+search_index|DELETE\s+FROM\s+search_index|search_index_fts/i);
  assert.doesNotMatch(`${service}\n${repository}\n${routes}`, /INSERT\s+INTO\s+file_attachments|UPDATE\s+file_attachments|DELETE\s+FROM\s+file_attachments|INSERT\s+INTO\s+files|UPDATE\s+files|DELETE\s+FROM\s+files/i);
}

async function assertArchiveCollectionAndSearchBehavior(session) {
  const collection = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    title: "Integration Archive Collection",
  }, session);
  const note = await notesService.create({
    title: "Integration archived searchable note",
    body_markdown: "Archive integration body.",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteCollectionId: collection.collection.note_library_collection_id,
  }, session);

  await notesService.archive(note.note.note_id, session);
  const archived = await notesService.read(note.note.note_id, session);
  assert.equal(archived.note.library_bucket, NOTE_LIBRARY_BUCKETS.REFERENCE);
  assert.equal(archived.note.note_collection_id, collection.collection.note_library_collection_id);

  const searchRows = await querySql(`
SELECT record_status, library_bucket, note_collection_id
FROM search_index
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'notes'
  AND record_id = ${sqlText(note.note.note_id)};
`);
  assert.deepEqual(searchRows[0], {
    record_status: "archived",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    note_collection_id: collection.collection.note_library_collection_id,
  });

  await notesService.restore(note.note.note_id, session);
  const restored = await notesService.read(note.note.note_id, session);
  assert.equal(restored.note.note_collection_id, collection.collection.note_library_collection_id);

  const changed = await notesService.changeLibrary(note.note.note_id, {
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
  }, session);
  assert.equal(changed.note.library_bucket, NOTE_LIBRARY_BUCKETS.ACTIVE_WORK);
  assert.equal(changed.note.note_collection_id, null, "moving Library buckets should not keep a cross-bucket collection assignment");
}

async function assertPermissionSafeCollectionCounts(adminSession, limitedSession) {
  const collection = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    title: "Permission Safe Counts",
  }, adminSession);
  const normal = await notesService.create({
    title: "Visible counted note",
    body_markdown: "Visible count body.",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteCollectionId: collection.collection.note_library_collection_id,
  }, adminSession);
  const privateNote = await notesService.create({
    title: "Hidden private counted note",
    body_markdown: "Hidden private count body.",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteCollectionId: collection.collection.note_library_collection_id,
    visibility: NOTE_VISIBILITIES.PRIVATE,
  }, adminSession);
  const secureNote = await notesService.create({
    title: "Hidden secure counted note",
    body_markdown: "Hidden secure count body.",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteCollectionId: collection.collection.note_library_collection_id,
    security_mode: NOTE_SECURITY_MODES.SECURE,
  }, adminSession);

  const adminTree = await notesService.listCollections(adminSession, {
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
  });
  const limitedTree = await notesService.listCollections(limitedSession, {
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
  });
  const adminCollection = adminTree.collections.find((item) => item.note_library_collection_id === collection.collection.note_library_collection_id);
  const limitedCollection = limitedTree.collections.find((item) => item.note_library_collection_id === collection.collection.note_library_collection_id);

  assert.equal(adminCollection.accessibleNoteCount, 3);
  assert.equal(limitedCollection.accessibleNoteCount, 1);
  assert.equal(limitedCollection.directAccessibleNoteCount, 1);

  const limitedList = await notesService.list(limitedSession, {
    noteCollectionId: collection.collection.note_library_collection_id,
  });
  assert.ok(limitedList.notes.some((note) => note.note_id === normal.note.note_id));
  assert.equal(limitedList.notes.some((note) => note.note_id === privateNote.note.note_id), false);
  assert.equal(limitedList.notes.some((note) => note.note_id === secureNote.note.note_id), false);
}

async function assertLinkedRecordAccessHidesNotes(adminSession, limitedSession) {
  const linked = await notesService.create({
    title: "Hidden linked-user note",
    body_markdown: "Linked user body.",
    linked_user_id: adminSession.user_id,
  }, adminSession);

  const limitedList = await notesService.list(limitedSession);
  assert.equal(limitedList.notes.some((note) => note.note_id === linked.note.note_id), false);

  await assertRejectsWithMessage(
    () => notesService.read(linked.note.note_id, limitedSession),
    /linked note context|access/i,
  );
  await assertRejectsWithMessage(
    () => notesService.listForTarget(limitedSession, {
      module_id: "users",
      target_type: "user",
      target_id: adminSession.user_id,
    }),
    /linked note target|access/i,
  );
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
    workspace_id: workspaceId,
    active_workspace_id: workspaceId,
    user_id: rows[0].user_id,
    username: rows[0].username,
    display_name: rows[0].display_name,
    timezone: rows[0].timezone || "America/New_York",
  };
}

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
  ${sqlText(`limited-integration-${userId}@example.test`)},
  'Limited Integration User',
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
    workspace_id: workspaceId,
    active_workspace_id: workspaceId,
    user_id: userId,
    username: `limited-integration-${userId}@example.test`,
    display_name: "Limited Integration User",
    timezone: "America/New_York",
  };
}

async function assertRejectsWithMessage(fn, pattern) {
  await assert.rejects(fn, (error) => {
    assert.match(error.message, pattern);
    return true;
  });
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(rows, [{ integrity_check: "ok" }]);
}
