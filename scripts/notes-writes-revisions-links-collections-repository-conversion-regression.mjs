import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.12o";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-write-repo-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-write-repo.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Notes-Write-Repository-Test-123!";
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "notes-write-repo-regression-master-key";
process.env.LONGTAIL_SECURE_NOTES_KEY_VERSION = "test-v5";
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
const { notesRepository } = await import("../src/modules/notes/notes.repo.js");
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
  await assertRepositoryMutationLifecycle(session);
  await assertIntegrity();

  console.log("Notes writes, revisions, links, and collections repository conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Notes write conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Notes write conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Notes write conversion version");

  assert.match(notesRepoSource, /import \{ db \} from "\.\.\/\.\.\/core\/database\.js";/, "Notes repository should import only the provider-neutral db facade");
  assert.doesNotMatch(notesRepoSource, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "Notes repository should not use literal helpers or compatibility query wrappers after the .15 wave");
  assert.doesNotMatch(notesRepoSource, /COLLATE NOCASE|LOWER\s*\(/, "Notes repository should route case-insensitive SQL through dialect seams after full conversion");
  assert.match(notesRepoSource, /createWithLinks[\s\S]*db\.transaction[\s\S]*insertNote\(transaction[\s\S]*insertNoteLink\(transaction/, "createWithLinks should keep staged note/link writes in the adapter transaction");
  assert.match(notesRepoSource, /note_id IN \(:noteIds\)/, "batched note link reads should use array-valued named params");
  assert.match(notesRepoSource, /notes\.\$\{directColumn\} = :targetId/, "direct linked-context target reads should keep the allowlisted column and bind the target id");
  assert.match(notesRepoSource, /orderByNoCase\("path_cache", "ASC"\)/, "collection ordering should route path ordering through the comparison seam");
  assert.match(notesRepoSource, /orderByNoCase\("notes\.title", "ASC"\)/, "target note ordering should route title ordering through the comparison seam");
  assert.match(notesRepoSource, /function nullableText\(value\)[\s\S]*String\(value\)\.trim\(\) === ""[\s\S]*\? null/, "converted nullable params should preserve the old nullable text trimming behavior");
  assert.match(notesRepoSource, /function integer\(value\)[\s\S]*Number\.parseInt[\s\S]*: 0/, "converted integer params should preserve the old integer fallback behavior");

  assert.match(auditDocs, /Current totals as of 0\.33\.6\.12n:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 402[\s\S]*Total runtime database operation calls seen by the audit scanner: 446/, "audit docs should record the current Files lifecycle/settings/quota conversion ratchet");
  assert.match(auditDocs, /\| notes\/notes\.repo \| Converted \| 0 \| 0 \| 25 \| 25 \|/, "audit inventory should mark notes/notes.repo fully converted");
  assert.match(auditDocs, /0\.33\.5\.27\.15 Notes Writes, Revisions, Links, and Collections Repository Conversion[\s\S]*`notes\/notes\.repo`[\s\S]*fully converted[\s\S]*904 runtime literal-helper invocations[\s\S]*166 direct interpolated SQL operation sites[\s\S]*180 existing bound operation sites/, "audit docs should record the Notes write conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.15[\s\S]*`notes\/notes\.repo`[\s\S]*fully converted[\s\S]*904 remaining helper invocations/, "database docs should record the full Notes repository conversion");
  assert.match(notesDocs, new RegExp(`current Notes implementation as of ${escapeRegex(appVersion)}`), "Notes docs should report the current implementation version");
  assert.match(notesDocs, /As of 0\.33\.5\.27\.15[\s\S]*Notes repository is fully converted[\s\S]*writes[\s\S]*revisions[\s\S]*links[\s\S]*collections[\s\S]*count helpers/, "Notes docs should document the fully converted Notes repository boundary");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.15 - Conversion wave: Notes writes, revisions, links, and collections[\s\S]*- \[x\] Convert the remaining `notes\/notes\.repo`[\s\S]*- \[x\] Preserve revision numbering[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.15 - [\s\S]*Notes writes, revisions, links, and collections repository conversion[\s\S]*904 helper invocations[\s\S]*166 direct interpolated operation sites[\s\S]*180 bound operation sites/, "changelog should record the Notes write conversion burndown");
  assert.match(regressionSuite, /scripts\/notes-writes-revisions-links-collections-repository-conversion-regression\.mjs/, "regression suite should include the Notes write conversion proof");
}

async function assertRepositoryMutationLifecycle(session) {
  const suffix = randomUUID().slice(0, 8);
  const rootCollection = await notesRepository.createCollection(session.workspace_id, {
    collection_source: "manual",
    created_by_user_id: session.user_id,
    depth: "",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    metadata_json: JSON.stringify({ slice: "0.33.5.27.15-root" }),
    path_cache: `27.15 Root ${suffix}`,
    slug: `27-15-root-${suffix}`,
    sort_order: "",
    title: `27.15 Root ${suffix}`,
    updated_by_user_id: session.user_id,
  });
  const childCollection = await notesRepository.createCollection(session.workspace_id, {
    collection_source: "manual",
    created_by_user_id: session.user_id,
    depth: 1,
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    parent_collection_id: rootCollection.note_library_collection_id,
    path_cache: `${rootCollection.path_cache} / 27.15 Child ${suffix}`,
    slug: `27-15-child-${suffix}`,
    sort_order: 2,
    title: `27.15 Child ${suffix}`,
    updated_by_user_id: session.user_id,
  });
  const activeCollections = await notesRepository.listCollections(session.workspace_id, {
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
  });
  assert.ok(activeCollections.some((collection) => collection.note_library_collection_id === rootCollection.note_library_collection_id), "collection reads should include the created root");
  assert.ok(activeCollections.some((collection) => collection.note_library_collection_id === childCollection.note_library_collection_id), "collection reads should include the created child");
  assert.equal(await notesRepository.countChildCollections(session.workspace_id, rootCollection.note_library_collection_id), 1, "child collection counts should include active children");

  const noteResult = await notesRepository.createWithLinks(session.workspace_id, {
    body_excerpt: "27.15 excerpt",
    body_markdown: `27.15 mutable body ${suffix}`,
    body_plaintext_index: `27.15 mutable body ${suffix}`,
    created_by_user_id: session.user_id,
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    library_bucket_source: "manual",
    metadata_json: JSON.stringify({ slice: "0.33.5.27.15" }),
    note_collection_id: childCollection.note_library_collection_id,
    note_type: NOTE_TYPES.DECISION,
    owner_user_id: session.user_id,
    slug: "",
    title: `27.15 Write Needle ${suffix}`,
    updated_by_user_id: session.user_id,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, [
    {
      created_by_user_id: session.user_id,
      metadata_json: JSON.stringify({ staged: "workspace" }),
      module_id: "framework",
      target_id: session.workspace_id,
      target_type: "workspace",
    },
    {
      created_by_user_id: session.user_id,
      module_id: "users",
      target_id: session.user_id,
      target_type: "user",
    },
  ]);

  assert.equal(noteResult.title, `27.15 Write Needle ${suffix}`);
  assert.equal(noteResult.slug, null, "blank slug should preserve nullable text behavior");
  assert.deepEqual(noteResult.metadata, { slice: "0.33.5.27.15" });
  assert.equal(await notesRepository.countNotesInCollection(session.workspace_id, childCollection.note_library_collection_id), 1, "collection note counts should include active notes");

  const links = await notesRepository.listLinks(session.workspace_id, noteResult.note_id);
  assert.deepEqual(
    links.map((link) => `${link.module_id}:${link.target_type}`).sort(),
    ["framework:workspace", "users:user"],
    "createWithLinks should persist staged links inside the transaction",
  );
  const workspaceLink = links.find((link) => link.target_type === "workspace");
  assert.equal(workspaceLink.metadata.staged, "workspace", "link metadata should remain parsed after conversion");
  const batchedLinks = await notesRepository.listLinksForNotes(session.workspace_id, [noteResult.note_id, noteResult.note_id]);
  assert.equal(batchedLinks.length, 2, "batched link reads should use unique note ids and preserve active links");

  const directTargetNote = await notesRepository.create(session.workspace_id, {
    body_markdown: "Direct target body",
    body_plaintext_index: "Direct target body",
    linked_user_id: session.user_id,
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    note_type: NOTE_TYPES.LOG,
    owner_user_id: session.user_id,
    title: `27.15 Direct Target ${suffix}`,
  });
  const targetNotes = await notesRepository.listForTarget(session.workspace_id, {
    module_id: "users",
    target_id: session.user_id,
    target_type: "user",
  });
  const targetIds = new Set(targetNotes.map((note) => note.note_id));
  assert.ok(targetIds.has(noteResult.note_id), "target reads should include linked note_links rows");
  assert.ok(targetIds.has(directTargetNote.note_id), "target reads should include allowlisted direct context columns");

  const updatedNote = await notesRepository.update(session.workspace_id, {
    ...noteResult,
    body_excerpt: "27.15 updated excerpt",
    body_markdown: "27.15 updated body",
    body_plaintext_index: "27.15 updated body",
    note_collection_id: rootCollection.note_library_collection_id,
    title: `27.15 Updated Needle ${suffix}`,
    updated_by_user_id: session.user_id,
  });
  assert.equal(updatedNote.title, `27.15 Updated Needle ${suffix}`);
  assert.equal(updatedNote.note_collection_id, rootCollection.note_library_collection_id, "note updates should preserve collection reassignment");
  assert.equal(await notesRepository.countNotesInCollection(session.workspace_id, childCollection.note_library_collection_id), 0, "old collection count should reflect note moves");
  assert.equal(await notesRepository.countNotesInCollection(session.workspace_id, rootCollection.note_library_collection_id), 1, "new collection count should reflect note moves");

  assert.equal(await notesRepository.nextRevisionNumber(session.workspace_id, noteResult.note_id), 1, "initial revision number should start at one");
  const revisionOne = await notesRepository.createRevision(session.workspace_id, {
    body_excerpt: noteResult.body_excerpt,
    body_markdown: noteResult.body_markdown,
    change_summary: "Initial update snapshot",
    changed_by_user_id: session.user_id,
    library_bucket: noteResult.library_bucket,
    note_id: noteResult.note_id,
    note_type: noteResult.note_type,
    revision_number: 1,
    status: noteResult.status,
    title: noteResult.title,
    visibility: noteResult.visibility,
  });
  assert.equal(revisionOne.revision_number, 1);
  assert.equal(await notesRepository.nextRevisionNumber(session.workspace_id, noteResult.note_id), 2, "next revision number should increment after the first snapshot");
  const revisionTwo = await notesRepository.createRevision(session.workspace_id, {
    body_excerpt: updatedNote.body_excerpt,
    body_markdown: updatedNote.body_markdown,
    change_summary: "Second update snapshot",
    changed_by_user_id: session.user_id,
    library_bucket: updatedNote.library_bucket,
    note_id: updatedNote.note_id,
    note_type: updatedNote.note_type,
    revision_number: 2,
    status: updatedNote.status,
    title: updatedNote.title,
    visibility: updatedNote.visibility,
  });
  const revisions = await notesRepository.listRevisions(session.workspace_id, noteResult.note_id);
  assert.deepEqual(revisions.map((revision) => revision.revision_number), [2, 1], "revision lists should remain newest-first");
  assert.equal((await notesRepository.readRevisionById(session.workspace_id, noteResult.note_id, revisionTwo.note_revision_id)).title, updatedNote.title);

  const removedLink = await notesRepository.removeLink(session.workspace_id, noteResult.note_id, workspaceLink.note_link_id);
  assert.ok(removedLink.removed_at, "link removal should soft-remove active links");
  const remainingLinks = await notesRepository.listLinks(session.workspace_id, noteResult.note_id);
  assert.equal(remainingLinks.length, 1, "active link lists should exclude removed rows");

  const archivedChild = await notesRepository.updateCollection(session.workspace_id, {
    ...childCollection,
    archived_at: "2026-07-06T12:00:00.000Z",
    status: NOTE_STATUSES.ARCHIVED,
    updated_by_user_id: session.user_id,
  });
  assert.equal(archivedChild.status, NOTE_STATUSES.ARCHIVED);
  assert.equal(await notesRepository.countChildCollections(session.workspace_id, rootCollection.note_library_collection_id), 0, "default child counts should exclude archived collections");
  assert.equal(await notesRepository.countChildCollections(session.workspace_id, rootCollection.note_library_collection_id, { includeArchived: true }), 1, "includeArchived should keep archived child counts visible");
  assert.equal(
    (await notesRepository.listCollections(session.workspace_id, { libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE }))
      .some((collection) => collection.note_library_collection_id === childCollection.note_library_collection_id),
    false,
    "default collection reads should hide archived collections",
  );
  assert.ok(
    (await notesRepository.listCollections(session.workspace_id, { includeArchived: true, libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE }))
      .some((collection) => collection.note_library_collection_id === childCollection.note_library_collection_id),
    "includeArchived collection reads should include archived collections",
  );

  await notesRepository.create(session.workspace_id, {
    body_excerpt: "secure plaintext placeholder",
    body_markdown: "secure plaintext placeholder",
    body_plaintext_index: "secure plaintext placeholder",
    library_bucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    note_type: NOTE_TYPES.REFERENCE,
    owner_user_id: session.user_id,
    security_mode: NOTE_SECURITY_MODES.SECURE,
    title: `27.15 Secure Placeholder ${suffix}`,
    visibility: NOTE_VISIBILITIES.INTERNAL,
  });
  assert.equal(await notesRepository.countPlaintextSecurePlaceholders(session.workspace_id), 1, "secure plaintext placeholder count should preserve the existing safety check");
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

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
