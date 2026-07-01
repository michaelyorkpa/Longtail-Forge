import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.20.5";
const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-server-side-paging-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-server-side-paging.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Server-List-Test-123!";
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "notes-server-side-list-regression-master-key";
process.env.LONGTAIL_SECURE_NOTES_KEY_VERSION = "test-v3";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const notesRepositorySource = readText("src/modules/notes/notes.repo.js");
const notesServiceSource = readText("src/modules/notes/notes.service.js");
const notesScript = readText("public/js/notes.js");
const linkedPanelScript = readText("public/js/shared/notes-linked-panel.js");
const notesView = readText("views/protected/notes.html");
const notesDocs = readText("docs/notes-module.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assertStaticContract();

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { notesRepository } = await import("../src/modules/notes/notes.repo.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { NOTE_LIBRARY_BUCKETS, NOTE_SECURITY_MODES, NOTE_VISIBILITIES } = await import("../src/modules/notes/library.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);
  const fixtures = await createFixtures(session);
  const originalRepositoryList = notesRepository.list;

  notesRepository.list = async () => {
    throw new Error("Notes list browsing should use queryList instead of loading full note rows.");
  };

  try {
    await assertLightweightListProjection(session, fixtures);
    await assertCursorPaging(session);
    await assertCollectionFiltering(session, fixtures);
  } finally {
    notesRepository.list = originalRepositoryList;
  }

  await assertDetailReadStillRendersBody(session, fixtures);
  await assertIntegrity();

  console.log("Notes server-side list paging regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Notes server-side list version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Notes server-side list version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Notes server-side list version");

  assert.match(notesRepositorySource, /async function queryList\(workspaceId, options = \{\}\)/, "Notes repository should expose a bounded list projection query");
  assert.match(notesRepositorySource, /const NOTE_LIST_COLUMNS = \[[\s\S]*"body_excerpt"[\s\S]*\]/, "Notes list projection should keep safe excerpts");
  assert.doesNotMatch(notesRepositorySource.match(/const NOTE_LIST_COLUMNS = \[[\s\S]*?\];/)?.[0] || "", /body_markdown|body_plaintext_index|secure_payload|encrypted_data_key/, "Notes list projection should not select full body or secure envelope columns");
  assert.match(notesRepositorySource, /LIMIT :limit OFFSET :offset/, "Notes repository list query should use bounded SQL paging");
  assert.match(notesRepositorySource, /function noteListWhereSql\(options, params\)/, "Notes repository should own SQL list filters");
  assert.match(notesRepositorySource, /function noteListOrderSql\(sort\)/, "Notes repository should own stable SQL list sorting");

  assert.match(notesServiceSource, /const NOTE_LIST_MAX_PAGE_SIZE = 200/, "Notes service should cap requested page sizes");
  assert.match(notesServiceSource, /async function queryNotesList\(session, query = \{\}, options = \{\}\)/, "Notes service should route list reads through a dedicated query helper");
  assert.match(notesServiceSource, /notesRepository\.queryList/, "Notes service should consume the bounded repository query");
  assert.match(notesServiceSource, /await filterAccessibleNotes\(session, notesWithOffsets\)/, "Notes service should keep permission pruning authoritative after SQL filters");
  assert.match(notesServiceSource, /function shapeNoteListProjection\(note = \{\}\)[\s\S]*delete shaped\.body_markdown[\s\S]*delete shaped\.body_html/, "Notes list projection should strip editable and rendered body fields");
  assert.match(notesServiceSource, /async function read\(noteId, session\)[\s\S]*includeBodyHtml: true/, "Notes detail reads should continue returning rendered safe body HTML");

  assert.match(notesScript, /params\.set\("limit", String\(PAGE_SIZE\)\)/, "Notes browser should request bounded list pages");
  assert.match(notesScript, /params\.set\("cursor", cursor\)/, "Notes browser should request subsequent pages by cursor");
  assert.match(notesScript, /appendNotesQueryParam\(params, "collection"/, "Notes browser should send collection filters to the service");
  assert.match(notesScript, /function renderNotes\(\)[\s\S]*const pageNotes = state\.notes \|\| \[\]/, "Notes browser should render the server-shaped page directly");
  assert.match(linkedPanelScript, /\/api\/notes\?\$\{params\.toString\(\)\}/, "Linked note picker should use the bounded Notes list query");
  assert.match(notesView, /css\/longtail-forge\.css\?v=56[\s\S]*js\/notes\.js\?v=69/, "Notes host should cache-bust list paging assets");
  assert.match(notesDocs, /current Notes implementation as of 0\.33\.5\.20\.5/, "Notes docs should report the current implementation version");
  assert.match(notesDocs, /As of 0\.33\.5\.20\.3, the protected Notes workspace uses a lightweight server-shaped list read/, "Notes docs should keep the server-side list version on the shipped list-read contract");
  assert.match(regressionSuite, /scripts\/notes-server-side-list-paging-regression\.mjs/, "Regression suite should include Notes server-side paging coverage");
}

async function createFixtures(session) {
  const root = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    title: "20.3 Root",
  }, session);
  const child = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    parentCollectionId: root.collection.note_library_collection_id,
    title: "20.3 Child",
  }, session);
  const outside = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    title: "20.3 Outside",
  }, session);
  const rootNote = await notesService.create({
    title: "20.3 collection root note",
    body_markdown: "Root collection body should stay detail-only.",
    library_bucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    noteCollectionId: root.collection.note_library_collection_id,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session);
  const childNote = await notesService.create({
    title: "20.3 collection child note",
    body_markdown: "Child collection body should stay detail-only.",
    library_bucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    noteCollectionId: child.collection.note_library_collection_id,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session);
  const outsideNote = await notesService.create({
    title: "20.3 outside note",
    body_markdown: "Outside collection body should stay detail-only.",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteCollectionId: outside.collection.note_library_collection_id,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session);
  const detailNote = await notesService.create({
    title: "20.3 detail body note",
    body_markdown: "# Detail Body\n\nThis **rendered body needle** stays on detail reads.",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session);
  const secureNote = await notesService.create({
    title: "20.3 secure list note",
    body_markdown: "20.3 secure body needle must not leak through lists.",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    security_mode: NOTE_SECURITY_MODES.SECURE,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session);

  for (let index = 0; index < 9; index += 1) {
    await notesService.create({
      title: `20.3 paged note ${String(index).padStart(2, "0")}`,
      body_markdown: `Paged body needle ${index} should not appear in list rows.`,
      library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
      visibility: NOTE_VISIBILITIES.INTERNAL,
    }, session);
  }

  return {
    childCollectionId: child.collection.note_library_collection_id,
    childNoteId: childNote.note.note_id,
    detailNoteId: detailNote.note.note_id,
    outsideNoteId: outsideNote.note.note_id,
    rootCollectionId: root.collection.note_library_collection_id,
    rootNoteId: rootNote.note.note_id,
    secureNoteId: secureNote.note.note_id,
  };
}

async function assertLightweightListProjection(session, fixtures) {
  const result = await notesService.list(session, {
    limit: 20,
    search: "20.3",
    sort: "title_asc",
    status: "all",
  });
  const secureListNote = result.notes.find((note) => note.note_id === fixtures.secureNoteId);

  assert.ok(result.notes.length > 0, "Notes list should return seeded records");
  assert.ok(result.pagination.nextCursor || result.notes.length <= 20, "Notes list should expose cursor metadata");
  for (const note of result.notes) {
    assert.equal(Object.hasOwn(note, "body_markdown"), false, "List rows should not include editable body Markdown");
    assert.equal(Object.hasOwn(note, "body_html"), false, "List rows should not include rendered body HTML");
    assert.equal(Object.hasOwn(note, "body_plaintext_index"), false, "List rows should not include plaintext body index text");
  }
  assert.ok(secureListNote, "Secure note metadata should remain listable when the session can read it");
  assert.equal(secureListNote.body_excerpt, null, "Secure note list rows should not expose body excerpts");
  assert.doesNotMatch(JSON.stringify(secureListNote), /secure body needle/i, "Secure note list rows should not leak secure body content");
}

async function assertCursorPaging(session) {
  const firstPage = await notesService.list(session, {
    limit: 3,
    search: "20.3 paged note",
    sort: "title_asc",
    status: "all",
  });
  assert.equal(firstPage.notes.length, 3, "first Notes page should honor requested page size");
  assert.equal(firstPage.pagination.limit, 3, "pagination should report the effective page size");
  assert.ok(firstPage.pagination.nextCursor, "first Notes page should expose an opaque next cursor");

  const secondPage = await notesService.list(session, {
    limit: 3,
    search: "20.3 paged note",
    sort: "title_asc",
    status: "all",
    cursor: firstPage.pagination.nextCursor,
  });
  const firstIds = new Set(firstPage.notes.map((note) => note.note_id));
  const secondIds = new Set(secondPage.notes.map((note) => note.note_id));

  assert.equal(secondPage.notes.length, 3, "second Notes page should return additional records");
  assert.equal([...secondIds].some((noteId) => firstIds.has(noteId)), false, "cursor paging should not duplicate the first page");
}

async function assertCollectionFiltering(session, fixtures) {
  const result = await notesService.list(session, {
    collection: fixtures.rootCollectionId,
    limit: 10,
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    sort: "title_asc",
    status: "all",
  });
  const ids = new Set(result.notes.map((note) => note.note_id));

  assert.ok(ids.has(fixtures.rootNoteId), "Collection filtering should include direct collection notes");
  assert.ok(ids.has(fixtures.childNoteId), "Collection filtering should include descendant collection notes");
  assert.equal(ids.has(fixtures.outsideNoteId), false, "Collection filtering should exclude notes outside the selected tree");
}

async function assertDetailReadStillRendersBody(session, fixtures) {
  const result = await notesService.read(fixtures.detailNoteId, session);

  assert.match(result.note.body_markdown, /rendered body needle/, "Detail reads should still include editable Markdown");
  assert.match(result.note.body_html, /<h1>Detail Body<\/h1>/, "Detail reads should still include safe rendered HTML");
  assert.match(result.note.body_html, /<strong>rendered body needle<\/strong>/, "Detail rendered HTML should preserve Markdown formatting");
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

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(rows, [{ integrity_check: "ok" }]);
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
