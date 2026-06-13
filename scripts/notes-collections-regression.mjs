import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-collections-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-collections.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Collections-Test-123!";

const { modulesService } = await import("../src/core/modules/modules.service.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { NOTE_LIBRARY_BUCKETS } = await import("../src/modules/notes/library.js");
const { searchService } = await import("../src/services/search.service.js");
const { closeSqlite, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  await searchService.ensureSearchBackendStorage({ refresh: true });
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertManifestAndSchema();
  await assertCollectionService(session);
  await assertImportMapping(session);
  await assertSearchFiltering(session);
  await assertIntegrity();

  console.log("Notes collections regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertManifestAndSchema() {
  const notesModule = modulesService.getModule("notes");
  assert.equal(notesModule.version, "0.33.5.8.3");

  await assertColumns("note_library_collections", [
    "path_cache",
    "depth",
    "collection_source",
    "updated_by_user_id",
  ]);
  await assertColumns("notes", ["note_collection_id"]);
  await assertColumns("search_index", ["note_collection_id", "collection_path"]);

  const tables = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name = 'note_collections';
`);
  assert.deepEqual(tables, [], "0.33.1.5 must extend note_library_collections instead of creating note_collections");
}

async function assertCollectionService(session) {
  const root = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    title: "Research",
  }, session);
  const child = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    parentCollectionId: root.collection.note_library_collection_id,
    title: "Client Notes",
  }, session);
  const otherRoot = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    title: "Archive Source",
  }, session);

  assert.equal(root.collection.path_cache, "Research");
  assert.equal(child.collection.path_cache, "Research / Client Notes");
  assert.equal(child.collection.depth, 1);

  await assertRejectsWithMessage(
    () => notesService.createCollection({
      libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
      parentCollectionId: root.collection.note_library_collection_id,
      title: "Client Notes",
    }, session),
    /already exists/,
  );

  const duplicateUnderOtherParent = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    parentCollectionId: otherRoot.collection.note_library_collection_id,
    title: "Client Notes",
  }, session);
  assert.equal(duplicateUnderOtherParent.collection.slug, child.collection.slug);

  await assertRejectsWithMessage(
    () => notesService.moveCollection(root.collection.note_library_collection_id, {
      parentCollectionId: child.collection.note_library_collection_id,
    }, session),
    /cycle/,
  );

  await assertRejectsWithMessage(
    () => notesService.moveCollection(child.collection.note_library_collection_id, {
      parentCollectionId: otherRoot.collection.note_library_collection_id,
    }, session),
    /already exists/,
  );

  const moved = await notesService.moveCollection(child.collection.note_library_collection_id, {
    parentCollectionId: otherRoot.collection.note_library_collection_id,
    title: "Moved Client Notes",
  }, session);
  assert.equal(moved.collection.path_cache, "Archive Source / Moved Client Notes");
  assert.equal(moved.collection.depth, 1);

  const note = await notesService.create({
    title: "Collected note",
    body_markdown: "Collection assignment should not affect access.",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteCollectionId: moved.collection.note_library_collection_id,
  }, session);
  assert.equal(note.note.note_collection_id, moved.collection.note_library_collection_id);

  const countedTree = await notesService.listCollections(session, {
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
  });
  const countedRoot = countedTree.collections.find((collection) => collection.note_library_collection_id === otherRoot.collection.note_library_collection_id);
  const countedChild = countedTree.collections.find((collection) => collection.note_library_collection_id === moved.collection.note_library_collection_id);
  assert.equal(countedRoot.accessibleNoteCount, 1, "Parent collection counts should include permission-safe child notes");
  assert.equal(countedRoot.directAccessibleNoteCount, 0, "Parent direct count should stay separate from rolled-up totals");
  assert.equal(countedChild.accessibleNoteCount, 1);
  assert.equal(countedChild.directAccessibleNoteCount, 1);

  await assertRejectsWithMessage(
    () => notesService.create({
      title: "Wrong bucket note",
      body_markdown: "Nope.",
      library_bucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
      noteCollectionId: moved.collection.note_library_collection_id,
    }, session),
    /same Library bucket/,
  );

  await assertRejectsWithMessage(
    () => notesService.deleteEmptyCollection(moved.collection.note_library_collection_id, session),
    /contains notes/,
  );

  const archived = await notesService.archiveCollection(otherRoot.collection.note_library_collection_id, session);
  assert.equal(archived.collection.status, "archived");
  const readNote = await notesService.read(note.note.note_id, session);
  assert.equal(
    readNote.note.note_collection_id,
    moved.collection.note_library_collection_id,
    "archiving collections must not uncategorize assigned notes",
  );

  const normalTree = await notesService.listCollections(session, {
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
  });
  assert.equal(
    normalTree.collections.some((collection) => collection.note_library_collection_id === otherRoot.collection.note_library_collection_id),
    false,
    "archived collections should be hidden from normal tree data",
  );

  const archivedTree = await notesService.listCollections(session, {
    includeArchived: "true",
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
  });
  assert.ok(archivedTree.collections.some((collection) => collection.note_library_collection_id === otherRoot.collection.note_library_collection_id));

  const empty = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    title: "Empty",
  }, session);
  const deleted = await notesService.deleteEmptyCollection(empty.collection.note_library_collection_id, session);
  assert.equal(deleted.collection.status, "deleted");
}

async function assertImportMapping(session) {
  const mapped = await notesService.ensureCollectionsForImportPath(session, {
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    originalNotebook: "Notebook A",
    originalSectionGroup: "Group B",
    originalSection: "Section C",
  });

  assert.equal(mapped.collection.path_cache, "Notebook A / Group B / Section C");
  assert.equal(mapped.collection.collection_source, "imported");
  assert.equal(mapped.collection.metadata.original_notebook, "Notebook A");

  const mappedAgain = await notesService.ensureCollectionsForImportPath(session, {
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    originalNotebook: "Notebook A",
    originalSectionGroup: "Group B",
    originalSection: "Section C",
  });
  assert.equal(mappedAgain.collection.note_library_collection_id, mapped.collection.note_library_collection_id);
}

async function assertSearchFiltering(session) {
  const collection = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    title: "Search Collection",
  }, session);
  const matching = await notesService.create({
    title: "Collection-searchable note",
    body_markdown: "Needle collection body.",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteCollectionId: collection.collection.note_library_collection_id,
  }, session);
  const other = await notesService.create({
    title: "Other note",
    body_markdown: "Needle collection body.",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
  }, session);
  const request = await searchService.composePermissionSafeSearchRequest({
    session,
    filters: {
      noteCollectionId: collection.collection.note_library_collection_id,
      recordTypes: ["note"],
      text: "Needle",
    },
  });
  const result = await searchService.executeSearch(request);

  assert.ok(result.results.some((row) => row.record_id === matching.note.note_id));
  assert.equal(result.results.some((row) => row.record_id === other.note.note_id), false);

  const rows = await querySql(`
SELECT note_collection_id, collection_path, body
FROM search_index
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND record_id = ${sqlText(matching.note.note_id)};
`);
  assert.deepEqual(rows[0], {
    note_collection_id: collection.collection.note_library_collection_id,
    collection_path: "Search Collection",
    body: "Needle collection body.\nreference\nactive\ninternal",
  });
}

async function assertColumns(tableName, expectedColumns) {
  const rows = await querySql(`PRAGMA table_info(${tableName});`);
  const columns = new Set(rows.map((row) => row.name));

  for (const column of expectedColumns) {
    assert.ok(columns.has(column), `${tableName}.${column} should exist`);
  }
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

async function assertRejectsWithMessage(fn, pattern) {
  await assert.rejects(async () => {
    await fn();
  }, pattern);
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(rows, [{ integrity_check: "ok" }]);
}
