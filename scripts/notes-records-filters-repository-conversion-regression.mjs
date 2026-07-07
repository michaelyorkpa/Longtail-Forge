import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.5";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-record-filter-repo-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-record-filter-repo.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Notes-Record-Filter-Repository-Test-123!";
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "notes-record-filter-regression-master-key";
process.env.LONGTAIL_SECURE_NOTES_KEY_VERSION = "test-v4";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const notesRepoSource = readText("src/modules/notes/notes.repo.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const notesDocs = readText("docs/notes-module.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, db, initializeDatabase } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { notesRepository } = await import("../src/modules/notes/notes.repo.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const {
  NOTE_LIBRARY_BUCKETS,
  NOTE_SECURITY_MODES,
  NOTE_STATUSES,
  NOTE_TYPES,
  NOTE_VISIBILITIES,
} = await import("../src/modules/notes/library.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createFixtures(session);

  await assertRepositoryRecordReads(session, fixtures);
  await assertRepositoryListFilters(session, fixtures);
  await assertServiceReadModelShaping(session, fixtures);
  await assertIntegrity();

  console.log("Notes records and filters repository conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Notes records/filter conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Notes records/filter conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Notes records/filter conversion version");

  const convertedBlocks = [
    sourceBlock(/async function list\(workspaceId, filters = \{\}\)/, /async function queryList\(workspaceId, options = \{\}\)/),
    sourceBlock(/async function queryList\(workspaceId, options = \{\}\)/, /async function readById\(workspaceId, noteId\)/),
    sourceBlock(/async function readById\(workspaceId, noteId\)/, /async function readByIds\(workspaceId, noteIds = \[\]\)/),
    sourceBlock(/async function readByIds\(workspaceId, noteIds = \[\]\)/, /async function create\(workspaceId, note\)/),
    sourceBlock(/function noteListWhereSql\(options, params\)/, /function normalizedText\(value\)/),
  ].join("\n");

  assert.match(convertedBlocks, /db\.query|db\.get/, "converted Notes read/filter blocks should use the provider-neutral db facade");
  assert.doesNotMatch(convertedBlocks, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "converted Notes read/filter blocks should not use literal helpers or compatibility query wrappers");
  assert.doesNotMatch(convertedBlocks, /COLLATE NOCASE|LOWER\s*\(/, "converted Notes read/filter blocks should not spell raw SQLite case-insensitive SQL");
  assert.match(convertedBlocks, /note_id IN \(:noteIds\)/, "Notes batched reads should use array-valued note id params");
  assert.match(convertedBlocks, /notes\.note_collection_id IN \(:noteCollectionIds\)/, "Notes collection filters should use array-valued collection params");
  assert.match(convertedBlocks, /db\.dialect\.comparison\.containsNoCase/, "Notes text filters should route case-insensitive matching through the dialect seam");
  assert.match(convertedBlocks, /db\.dialect\.comparison\.likePattern/, "Notes text filters should build LIKE patterns through the dialect seam");
  assert.match(convertedBlocks, /db\.dialect\.comparison\.orderByNoCase/, "Notes ordering should route case-insensitive sort terms through the dialect seam");

  assert.match(auditDocs, /0\.33\.5\.27\.14 Notes Records and Filters Repository Conversion[\s\S]*`notes\/notes\.repo`[\s\S]*named params[\s\S]*dialect comparison seams/, "audit docs should record the Notes records/filter conversion ratchet");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.14[\s\S]*`notes\/notes\.repo`[\s\S]*record list\/read\/filter paths[\s\S]*named params/, "database docs should record the Notes records/filter conversion");
  assert.match(notesDocs, new RegExp(`current Notes implementation as of ${escapeRegex(appVersion)}`), "Notes docs should report the current implementation version");
  assert.match(notesDocs, /As of 0\.33\.5\.27\.14[\s\S]*record list\/read\/filter SQL[\s\S]*named params[\s\S]*dialect comparison seams/, "Notes docs should document the converted Notes read/filter repository boundary");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.14 - Conversion wave: Notes records and filters[\s\S]*- \[x\] Convert the note record list\/read\/filter paths[\s\S]*- \[x\] Preserve secure\/private placeholders[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.14 - [\s\S]*Notes records and filters repository conversion[\s\S]*helper invocations[\s\S]*direct interpolated operation sites[\s\S]*bound operation sites/, "changelog should record the Notes records/filter conversion burndown");
  assert.match(regressionSuite, /scripts\/notes-records-filters-repository-conversion-regression\.mjs/, "regression suite should include the Notes records/filter conversion proof");
}

async function createFixtures(session) {
  const suffix = randomUUID().slice(0, 8);
  const client = (await clientsService.createClient({
    name: `Notes Filter Client ${suffix}`,
  }, session)).client;
  const project = (await clientsService.createProject(client.id, {
    name: `Notes Filter Project ${suffix}`,
  }, session)).project;
  const rootCollection = (await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    title: `27.14 Root ${suffix}`,
  }, session)).collection;
  const childCollection = (await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    parentCollectionId: rootCollection.note_library_collection_id,
    title: `27.14 Child ${suffix}`,
  }, session)).collection;
  const outsideCollection = (await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    title: `27.14 Outside ${suffix}`,
  }, session)).collection;

  const decisionNote = (await notesService.create({
    body_markdown: `27.14 decision body ${suffix}`,
    client_id: client.id,
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    linkedUserId: session.user_id,
    noteCollectionId: rootCollection.note_library_collection_id,
    noteType: NOTE_TYPES.DECISION,
    ownerUserId: session.user_id,
    project_id: project.id,
    title: `Aa 27.14 Decision Needle ${suffix}`,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session)).note;
  const childNote = (await notesService.create({
    body_markdown: `27.14 child body ${suffix}`,
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    noteCollectionId: childCollection.note_library_collection_id,
    noteType: NOTE_TYPES.RESEARCH,
    ownerUserId: session.user_id,
    title: `Bb 27.14 Child Needle ${suffix}`,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session)).note;
  const outsideNote = (await notesService.create({
    body_markdown: `27.14 outside body ${suffix}`,
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteCollectionId: outsideCollection.note_library_collection_id,
    noteType: NOTE_TYPES.MEETING,
    ownerUserId: session.user_id,
    title: `Cc 27.14 Outside Needle ${suffix}`,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session)).note;
  const uncategorizedNote = (await notesService.create({
    body_markdown: `27.14 uncategorized body ${suffix}`,
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteType: NOTE_TYPES.LOG,
    ownerUserId: session.user_id,
    title: `Dd 27.14 Uncategorized Needle ${suffix}`,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session)).note;
  const secureNote = (await notesService.create({
    body_markdown: `27.14 secure body needle ${suffix}`,
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    noteCollectionId: rootCollection.note_library_collection_id,
    noteType: NOTE_TYPES.REFERENCE,
    security_mode: NOTE_SECURITY_MODES.SECURE,
    title: `Ee 27.14 Secure Needle ${suffix}`,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session)).note;
  const privateNote = (await notesService.create({
    body_markdown: `27.14 private body ${suffix}`,
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteType: NOTE_TYPES.GENERAL,
    ownerUserId: session.user_id,
    title: `Ff 27.14 Private Needle ${suffix}`,
    visibility: NOTE_VISIBILITIES.PRIVATE,
  }, session)).note;
  const archivedDraft = (await notesService.create({
    body_markdown: `27.14 archived body ${suffix}`,
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteType: NOTE_TYPES.IDEA,
    ownerUserId: session.user_id,
    title: `Gg 27.14 Archived Needle ${suffix}`,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session)).note;
  const archivedNote = (await notesService.archive(archivedDraft.note_id, session)).note;
  const oldNote = (await notesService.create({
    body_markdown: `27.14 old body ${suffix}`,
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteType: NOTE_TYPES.PROCEDURE,
    ownerUserId: session.user_id,
    title: `Hh 27.14 Old Needle ${suffix}`,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session)).note;
  const literalPatternNote = (await notesService.create({
    body_markdown: `27.14 literal body ${suffix}`,
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteType: NOTE_TYPES.GENERAL,
    ownerUserId: session.user_id,
    title: `Ii 27.14 literal 100%_ quoted ${suffix}`,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session)).note;

  await db.run(`
UPDATE notes
SET updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND note_id = :noteId;
`, {
    noteId: oldNote.note_id,
    updatedAt: "2024-01-01T00:00:00.000Z",
    workspaceId: session.workspace_id,
  });

  return {
    archivedNote,
    childCollection,
    childNote,
    client,
    decisionNote,
    literalPatternNote,
    oldNote,
    outsideNote,
    privateNote,
    project,
    rootCollection,
    secureNote,
    suffix,
    uncategorizedNote,
  };
}

async function assertRepositoryRecordReads(session, fixtures) {
  const byIds = await notesRepository.readByIds(session.workspace_id, [
    fixtures.childNote.note_id,
    fixtures.decisionNote.note_id,
    fixtures.decisionNote.note_id,
  ]);
  assert.deepEqual(
    new Set(byIds.map((note) => note.note_id)),
    new Set([fixtures.childNote.note_id, fixtures.decisionNote.note_id]),
    "readByIds should use array-valued named params and de-duplicate note ids",
  );

  const activeOwned = await notesRepository.list(session.workspace_id, {
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    ownerUserId: session.user_id,
  });
  const activeOwnedIds = new Set(activeOwned.map((note) => note.note_id));
  assert.ok(activeOwnedIds.has(fixtures.decisionNote.note_id), "record list should preserve Library and owner filters");
  assert.ok(activeOwnedIds.has(fixtures.childNote.note_id), "record list should include matching child collection records");
  assert.ok(activeOwnedIds.has(fixtures.secureNote.note_id), "record list should preserve secure note metadata rows");
  assert.equal(activeOwnedIds.has(fixtures.outsideNote.note_id), false, "record list should exclude non-matching Library rows");

  const secureRow = activeOwned.find((note) => note.note_id === fixtures.secureNote.note_id);
  assert.equal(secureRow.body_markdown || "", "", "secure note record reads should preserve closed Markdown placeholders");
  assert.equal(secureRow.body_excerpt, null, "secure note record reads should preserve closed excerpt placeholders");
  assert.equal(secureRow.body_plaintext_index, null, "secure note record reads should preserve closed plaintext placeholders");
}

async function assertRepositoryListFilters(session, fixtures) {
  const statusActive = await queryIds(session, {
    limit: 50,
    searchQuery: fixtures.suffix,
    status: NOTE_STATUSES.ACTIVE,
  });
  assert.ok(statusActive.has(fixtures.decisionNote.note_id), "active status filter should include active notes");
  assert.equal(statusActive.has(fixtures.archivedNote.note_id), false, "active status filter should exclude archived notes");

  const archived = await queryIds(session, {
    limit: 50,
    searchQuery: fixtures.suffix,
    status: NOTE_STATUSES.ARCHIVED,
  });
  assert.deepEqual(archived, new Set([fixtures.archivedNote.note_id]), "archived status filter should remain exact");

  assert.deepEqual(
    await queryIds(session, {
      limit: 50,
      noteType: NOTE_TYPES.DECISION,
      searchQuery: fixtures.suffix,
      status: "all",
    }),
    new Set([fixtures.decisionNote.note_id]),
    "Note Kind filter should remain exact",
  );

  assert.ok((await queryIds(session, {
    contextSearch: fixtures.client.id.slice(0, 12),
    limit: 50,
    status: "all",
  })).has(fixtures.decisionNote.note_id), "context search should match Primary Context IDs case-insensitively");

  assert.ok((await queryIds(session, {
    limit: 50,
    ownerSearch: session.user_id.slice(0, 8),
    searchQuery: "Decision Needle",
    status: "all",
  })).has(fixtures.decisionNote.note_id), "owner search should compose with search filters");

  const collectionIds = await queryIds(session, {
    limit: 50,
    noteCollectionIds: [
      fixtures.rootCollection.note_library_collection_id,
      fixtures.childCollection.note_library_collection_id,
    ],
    searchQuery: fixtures.suffix,
    sort: "library_collection_updated_desc",
    status: "all",
  });
  assert.ok(collectionIds.has(fixtures.decisionNote.note_id), "collection filters should include root collection notes");
  assert.ok(collectionIds.has(fixtures.childNote.note_id), "collection filters should include descendant collection notes");
  assert.equal(collectionIds.has(fixtures.outsideNote.note_id), false, "collection filters should exclude outside collection notes");

  assert.deepEqual(
    await queryIds(session, {
      limit: 50,
      searchQuery: `Uncategorized Needle ${fixtures.suffix}`,
      status: "all",
      uncategorizedCollection: true,
    }),
    new Set([fixtures.uncategorizedNote.note_id]),
    "Uncategorized collection filter should preserve null collection semantics",
  );

  assert.deepEqual(
    await queryIds(session, {
      limit: 50,
      searchQuery: "100%_",
      status: "all",
    }),
    new Set([fixtures.literalPatternNote.note_id]),
    "search filters should bind escaped LIKE patterns through the dialect seam",
  );

  assert.equal((await queryIds(session, {
    limit: 50,
    searchQuery: fixtures.suffix,
    status: "all",
    updatedSince: "2025-01-01T00:00:00.000Z",
  })).has(fixtures.oldNote.note_id), false, "updated-since filters should remain server-side");

  const firstPage = await notesRepository.queryList(session.workspace_id, {
    limit: 2,
    searchQuery: fixtures.suffix,
    sort: "title_asc",
    status: "all",
  });
  assert.equal(firstPage.notes.length, 2, "queryList should keep bounded paging");
  assert.equal(firstPage.hasMore, true, "queryList should report additional candidates");
  assert.equal(firstPage.nextOffset, 2, "queryList should preserve offset paging metadata");
  assert.deepEqual(
    firstPage.notes.map((note) => note.note_id),
    [fixtures.decisionNote.note_id, fixtures.childNote.note_id],
    "case-insensitive title ordering should stay stable",
  );
}

async function assertServiceReadModelShaping(session, fixtures) {
  const secureList = await notesService.list(session, {
    limit: 20,
    search: `Secure Needle ${fixtures.suffix}`,
    securityMode: NOTE_SECURITY_MODES.SECURE,
    status: "all",
  });
  const secureRow = secureList.notes.find((note) => note.note_id === fixtures.secureNote.note_id);
  assert.ok(secureRow, "secure note metadata should stay listable for sessions that can read secure notes");
  assert.equal(secureRow.body_excerpt, null, "secure note list rows should keep body excerpts closed");
  assert.equal(Object.hasOwn(secureRow, "body_markdown"), false, "secure note list rows should not expose editable body Markdown");
  assert.equal(Object.hasOwn(secureRow, "body_plaintext_index"), false, "secure note list rows should not expose plaintext search bodies");
  assert.doesNotMatch(JSON.stringify(secureRow), /secure body needle/i, "secure note list rows should not leak secure body content");

  const privateList = await notesService.list(session, {
    limit: 20,
    search: `Private Needle ${fixtures.suffix}`,
    status: "all",
    visibility: NOTE_VISIBILITIES.PRIVATE,
  });
  assert.ok(
    privateList.notes.some((note) => note.note_id === fixtures.privateNote.note_id),
    "private note list filters should preserve readable owned private rows",
  );
}

async function queryIds(session, options) {
  const result = await notesRepository.queryList(session.workspace_id, options);
  return new Set(result.notes.map((note) => note.note_id));
}

async function readSeedSession() {
  const user = await db.get(`
SELECT users.user_id, users.username, users.display_name, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);

  assert.ok(user, "fresh database should seed a protected super admin");

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    display_name: user.display_name,
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

async function assertIntegrity() {
  const rows = await db.query("PRAGMA integrity_check;");
  assert.deepEqual(rows, [{ integrity_check: "ok" }]);
}

function sourceBlock(startPattern, endPattern) {
  const start = notesRepoSource.search(startPattern);
  const end = notesRepoSource.search(endPattern);

  assert.notEqual(start, -1, `source block start should exist: ${startPattern}`);
  assert.notEqual(end, -1, `source block end should exist: ${endPattern}`);
  assert.ok(end > start, "source block end should follow start");

  return notesRepoSource.slice(start, end);
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
