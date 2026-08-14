export const regressionMeta = Object.freeze({
  id: "notes.secure-catalog-effective-security",
  area: "notes",
  tier: "focused",
  tags: ["catalogs", "encryption", "hierarchy", "migration", "notes", "security"],
  description: "Proves secure-catalog inheritance, fail-closed hierarchy projection, and encrypted note/revision persistence for secure creation and moves.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-secure-catalog-policy-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "secure-catalog-policy.db");
process.env.LONGTAIL_SECURE_NOTES_KEY_VERSION = "catalog-policy-test-v1";
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "Catalog-Policy-Regression-Master-Key-2026!";
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Secure-Catalog-Policy-Test-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { notesRepository } = await import("../../../src/modules/notes/notes.repo.js");
const { notesService } = await import("../../../src/modules/notes/notes.service.js");

try {
  await initializeDatabase();
  const session = await readProtectedSession();
  await assertSecureCatalogCreationAndMove(session);
  await assertHierarchyBoundaries(session);
  const integrity = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(integrity, [{ integrity_check: "ok" }]);
  console.log("Secure catalog effective-security regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertSecureCatalogCreationAndMove(session) {
  const root = (await notesService.createCollection({
    libraryBucket: "reference",
    title: "Protected Root",
  }, session)).collection;
  const middle = (await notesService.createCollection({
    libraryBucket: "reference",
    parentCollectionId: root.note_library_collection_id,
    title: "Archived Middle",
  }, session)).collection;
  const leaf = (await notesService.createCollection({
    libraryBucket: "reference",
    parentCollectionId: middle.note_library_collection_id,
    title: "Protected Leaf",
  }, session)).collection;

  await querySql(`
UPDATE note_library_collections
SET security_policy = 'secure'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND note_library_collection_id = ${sqlText(root.note_library_collection_id)};
`);
  await notesService.archiveCollection(middle.note_library_collection_id, session);

  const projectedLeaf = await notesRepository.readCollectionById(session.workspace_id, leaf.note_library_collection_id);
  assert.ok(projectedLeaf, "archived secure-catalog leaf should remain readable");
  assert.equal(projectedLeaf.status, "archived");
  assert.equal(projectedLeaf.effective_security_mode, "secure");
  assert.equal(projectedLeaf.security_inherited, true);
  assert.equal(projectedLeaf.security_source_catalog_id, root.note_library_collection_id);

  const created = (await notesService.create({
    body_markdown: "Inherited creation plaintext needle",
    library_bucket: "reference",
    note_collection_id: leaf.note_library_collection_id,
    security_mode: "normal",
    title: "Inherited secure note",
  }, session)).note;
  await assertEncryptedNoteAndRevisions(created.note_id, {
    expectedRevisionCount: 1,
    forbiddenText: "Inherited creation plaintext needle",
  });

  const projectedCreated = await notesRepository.readById(session.workspace_id, created.note_id);
  assert.ok(projectedCreated, "inherited secure note should remain readable after creation");
  assert.equal(projectedCreated.security_mode, "normal", "catalog inheritance must not copy the explicit note flag");
  assert.equal(projectedCreated.effective_security_mode, "secure");
  assert.equal(projectedCreated.security_source, "ancestor_catalog");

  const ordinaryCatalog = (await notesService.createCollection({
    libraryBucket: "reference",
    title: "Ordinary Catalog",
  }, session)).collection;
  let movable = (await notesService.create({
    body_markdown: "Move body plaintext needle one",
    library_bucket: "reference",
    note_collection_id: ordinaryCatalog.note_library_collection_id,
    title: "Movable note",
  }, session)).note;
  movable = (await notesService.update(movable.note_id, {
    ...movable,
    body_markdown: "Move body plaintext needle two",
  }, session)).note;

  const moved = (await notesService.assignNoteCollection(movable.note_id, {
    noteCollectionId: leaf.note_library_collection_id,
  }, session)).note;
  assert.equal(moved.effective_security_mode, "secure");
  assert.equal(moved.security_mode, "normal");
  await assertEncryptedNoteAndRevisions(moved.note_id, {
    expectedRevisionCount: 2,
    forbiddenText: "Move body plaintext needle",
  });

  const preservedMove = (await notesService.assignNoteCollection(moved.note_id, {
    noteCollectionId: ordinaryCatalog.note_library_collection_id,
  }, session)).note;
  assert.equal(preservedMove.security_mode, "secure", "leaving a secure catalog must preserve explicit note security");
  assert.equal(preservedMove.effective_security_mode, "secure");
  await assertEncryptedNoteAndRevisions(preservedMove.note_id, {
    expectedRevisionCount: 3,
    forbiddenText: "Move body plaintext needle",
  });

  const explicit = (await notesService.create({
    body_markdown: "Explicit secure body",
    library_bucket: "reference",
    note_collection_id: ordinaryCatalog.note_library_collection_id,
    security_mode: "secure",
    title: "Explicit secure note",
  }, session)).note;
  const projectedExplicit = await notesRepository.readById(session.workspace_id, explicit.note_id);
  assert.ok(projectedExplicit, "explicit secure note should remain readable after creation");
  assert.equal(projectedExplicit.effective_security_mode, "secure");
  assert.equal(projectedExplicit.security_inherited, false);
  assert.equal(projectedExplicit.security_source, "explicit_note");
}

async function assertHierarchyBoundaries(session) {
  const parent = (await notesService.createCollection({
    libraryBucket: "active_work",
    title: "Cycle Parent",
  }, session)).collection;
  const child = (await notesService.createCollection({
    libraryBucket: "active_work",
    parentCollectionId: parent.note_library_collection_id,
    title: "Cycle Child",
  }, session)).collection;

  await assert.rejects(
    notesService.moveCollection(parent.note_library_collection_id, {
      parentCollectionId: child.note_library_collection_id,
      title: parent.title,
    }, session),
    (error) => error?.statusCode === 400 && /cannot create a cycle/i.test(error.message),
  );
  await assert.rejects(
    notesService.create({
      library_bucket: "reference",
      note_collection_id: `other-workspace-${child.note_library_collection_id}`,
      title: "Cross-workspace collection",
    }, session),
    (error) => error?.statusCode === 404 && /collection not found/i.test(error.message),
  );
}

async function assertEncryptedNoteAndRevisions(noteId, { expectedRevisionCount, forbiddenText }) {
  const notes = await querySql(`
SELECT body_markdown, body_excerpt, body_plaintext_index, security_mode, secure_payload, encrypted_data_key
FROM notes
WHERE note_id = ${sqlText(noteId)};
`);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].body_markdown, "");
  assert.equal(notes[0].body_excerpt, null);
  assert.equal(notes[0].body_plaintext_index, null);
  assert.ok(notes[0].secure_payload);
  assert.ok(notes[0].encrypted_data_key);
  assert.doesNotMatch(JSON.stringify(notes[0]), new RegExp(forbiddenText));

  const revisions = await querySql(`
SELECT body_markdown, body_excerpt, security_mode, secure_payload, encrypted_data_key
FROM note_revisions
WHERE note_id = ${sqlText(noteId)}
ORDER BY revision_number ASC;
`);
  assert.equal(revisions.length, expectedRevisionCount);
  assert.ok(revisions.every((revision) => (
    revision.body_markdown === "" &&
    revision.body_excerpt === null &&
    revision.security_mode === "secure" &&
    revision.secure_payload &&
    revision.encrypted_data_key
  )));
  assert.doesNotMatch(JSON.stringify(revisions), new RegExp(forbiddenText));
}

async function readProtectedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.display_name, users.timezone, workspaces.workspace_id
FROM users
JOIN workspaces ON workspaces.owner_user_id = users.user_id
WHERE users.protected_user = 'yes'
ORDER BY users.rowid
LIMIT 1;
`);
  assert.ok(rows[0]?.workspace_id, "seeded protected workspace should exist");
  return {
    active_workspace_id: rows[0].workspace_id,
    display_name: rows[0].display_name,
    timezone: rows[0].timezone || "America/New_York",
    user_id: rows[0].user_id,
    username: rows[0].username,
    workspace_id: rows[0].workspace_id,
  };
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
