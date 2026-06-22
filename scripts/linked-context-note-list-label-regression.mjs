import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-linked-context-note-list-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-linked-context-note-list.db");
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "linked-context-note-list-secure-key";
process.env.SUPER_ADMIN_PASSWORD = "Linked-Context-Note-List-Test-123!";

const { listsRepository } = await import("../src/modules/lists/lists.repo.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const {
  NOTE_LIBRARY_BUCKETS,
  NOTE_SECURITY_MODES,
  NOTE_VISIBILITIES,
} = await import("../src/modules/notes/library.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);
  const limitedSession = await createClientUserSession(workspace.workspace_id);

  await assertBrowserExposesNoteAndListTargets();
  const fixtures = await createFixtures(session);
  await assertNoteTargets(session, limitedSession, fixtures);
  await assertListTargets(session, fixtures);
  await assertLinkedRows(session, fixtures);
  await assertIntegrity();

  console.log("Linked Context Note/List label regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertBrowserExposesNoteAndListTargets() {
  const notesJs = await fs.readFile(path.join(process.cwd(), "public/js/notes.js"), "utf8");

  assert.match(notesJs, /const LINK_TARGET_TYPE_ORDER = \["project", "task", "note", "list", "client", "user"\]/, "Notes picker should expose Note and List as normal target types");
  assert.match(notesJs, /note: "Note"/, "Notes picker should label Note targets");
  assert.match(notesJs, /list: "List"/, "Notes picker should label List targets");
}

async function createFixtures(session) {
  const suffix = randomUUID().slice(0, 8);
  const collectionResult = await notesService.createCollection({
    title: `LCNL Reference Collection ${suffix}`,
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
  }, session);
  const collectionId = collectionResult.collection.note_library_collection_id;

  const activeNote = await notesService.create({
    title: `LCNL Active Note ${suffix}`,
    body_markdown: "Active note target.",
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
  }, session);
  const alphaNote = await notesService.create({
    title: `LCNL Alpha Note ${suffix}`,
    body_markdown: "Reference alpha note target.",
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteCollectionId: collectionId,
  }, session);
  const zetaNote = await notesService.create({
    title: `LCNL Zeta Note ${suffix}`,
    body_markdown: "Reference zeta note target.",
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    noteCollectionId: collectionId,
  }, session);
  const hiddenPrivateNote = await notesService.create({
    title: `LCNL Hidden Private Note ${suffix}`,
    body_markdown: "Private note target should not leak.",
    visibility: NOTE_VISIBILITIES.PRIVATE,
  }, session);
  const hiddenSecureNote = await notesService.create({
    title: `LCNL Hidden Secure Note ${suffix}`,
    body_markdown: "Secure note target should not leak.",
    securityMode: NOTE_SECURITY_MODES.SECURE,
  }, session);

  const checklistList = await createList(session, {
    list_id: `lcnl-checklist-${suffix}`,
    title: `LCNL Checklist List ${suffix}`,
    list_type: "checklist",
  });
  const procurementList = await createList(session, {
    list_id: `lcnl-procurement-${suffix}`,
    title: `LCNL Procurement List ${suffix}`,
    list_type: "procurement",
  });

  return {
    activeNote: activeNote.note,
    alphaNote: alphaNote.note,
    zetaNote: zetaNote.note,
    hiddenPrivateNote: hiddenPrivateNote.note,
    hiddenSecureNote: hiddenSecureNote.note,
    checklistList,
    collection: collectionResult.collection,
    procurementList,
    suffix,
  };
}

async function assertNoteTargets(session, limitedSession, fixtures) {
  const result = await notesService.listLinkTargets(session, { targetType: "note", q: `LCNL`, limit: 50 });
  const targetIds = [
    fixtures.activeNote.note_id,
    fixtures.alphaNote.note_id,
    fixtures.zetaNote.note_id,
  ];
  const targets = result.targets.filter((target) => targetIds.includes(target.targetId));

  assert.deepEqual(targets.map((target) => target.targetId), targetIds, "Note targets should sort by Library, collection, and title");
  assert.deepEqual(targets.map((target) => target.displayLabel), [
    fixtures.activeNote.title,
    fixtures.alphaNote.title,
    fixtures.zetaNote.title,
  ]);
  assert.deepEqual(targets.map((target) => target.secondaryLabel), [
    "Active Work",
    `Reference Library / ${fixtures.collection.title}`,
    `Reference Library / ${fixtures.collection.title}`,
  ]);

  for (const target of targets) {
    assert.equal(target.targetType, "note");
    assert.equal(target.workspaceId, session.workspace_id);
    assert.equal(target.title, target.label);
    assert.equal(target.fullLabel, target.label);
    assert.ok(target.ariaLabel.startsWith(target.label), "Note target should preserve the full note title accessibly");
    assertCleanLabel(target.displayLabel, target.targetId);
    assertCleanLabel(target.secondaryLabel, target.targetId);
    assert.doesNotMatch(target.displayLabel, /Note:/, "Note display labels should be plain note titles");
  }

  const limitedVisible = await notesService.listLinkTargets(limitedSession, { targetType: "note", q: fixtures.activeNote.title, limit: 20 });
  assert.ok(limitedVisible.targets.some((target) => target.targetId === fixtures.activeNote.note_id), "Readable notes should appear for limited users");

  const limitedHidden = await notesService.listLinkTargets(limitedSession, { targetType: "note", q: `LCNL Hidden`, limit: 20 });
  assert.equal(limitedHidden.targets.some((target) => target.targetId === fixtures.hiddenPrivateNote.note_id), false, "Private note titles should not appear for unauthorized users");
  assert.equal(limitedHidden.targets.some((target) => target.targetId === fixtures.hiddenSecureNote.note_id), false, "Secure note titles should not appear for unauthorized users");
  assert.equal(limitedHidden.targets.some((target) => /LCNL Hidden/.test(target.displayLabel || target.label || "")), false, "Hidden note labels should not leak through search results");
}

async function assertListTargets(session, fixtures) {
  const result = await notesService.listLinkTargets(session, { targetType: "list", q: `LCNL`, limit: 50 });
  const targetIds = [
    fixtures.checklistList.list_id,
    fixtures.procurementList.list_id,
  ];
  const targets = result.targets.filter((target) => targetIds.includes(target.targetId));

  assert.deepEqual(targets.map((target) => target.targetId), targetIds, "List targets should sort by list type and title");
  assert.deepEqual(targets.map((target) => target.displayLabel), [
    fixtures.checklistList.title,
    fixtures.procurementList.title,
  ]);
  assert.deepEqual(targets.map((target) => target.secondaryLabel), [
    "Checklist",
    "Procurement",
  ]);

  for (const target of targets) {
    assert.equal(target.targetType, "list");
    assert.equal(target.workspaceId, session.workspace_id);
    assert.equal(target.title, target.label);
    assert.equal(target.fullLabel, target.label);
    assertCleanLabel(target.displayLabel, target.targetId);
    assertCleanLabel(target.secondaryLabel, target.targetId);
    assert.doesNotMatch(target.displayLabel, /List:|active|deleted|archived/i, "List display labels should be plain list titles");
  }

  await runSql(`
UPDATE workspace_modules
SET status = 'disabled'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'lists';
`);
  const disabledTargets = await notesService.listLinkTargets(session, { targetType: "list", q: `LCNL`, limit: 20 });
  assert.equal(disabledTargets.targets.length, 0, "Disabled Lists module should not contribute List targets");
  await runSql(`
UPDATE workspace_modules
SET status = 'enabled'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'lists';
`);
}

async function assertLinkedRows(session, fixtures) {
  const linked = await notesService.create({
    title: `LCNL Linked Consumer ${fixtures.suffix}`,
    body_markdown: "Note/List linked row display.",
    links: [
      { targetType: "note", targetId: fixtures.alphaNote.note_id },
      { targetType: "list", targetId: fixtures.checklistList.list_id },
    ],
  }, session);
  const read = await notesService.read(linked.note.note_id, session);
  const noteLink = read.note.links.find((link) => link.target_id === fixtures.alphaNote.note_id);
  const listLink = read.note.links.find((link) => link.target_id === fixtures.checklistList.list_id);

  assert.equal(noteLink.label, fixtures.alphaNote.title);
  assert.equal(noteLink.display_label, fixtures.alphaNote.title);
  assert.equal(noteLink.secondary_label, `Reference Library / ${fixtures.collection.title}`);
  assert.equal(noteLink.source_url, `notes.html?note=${encodeURIComponent(fixtures.alphaNote.note_id)}`);
  assert.equal(listLink.label, fixtures.checklistList.title);
  assert.equal(listLink.display_label, fixtures.checklistList.title);
  assert.equal(listLink.secondary_label, "Checklist");
  assert.equal(listLink.source_url, `lists.html?list=${encodeURIComponent(fixtures.checklistList.list_id)}`);
}

async function createList(session, payload) {
  return listsRepository.create(session.workspace_id, {
    client_id: "",
    project_id: "",
    description: "Linked Context list target.",
    status: "active",
    is_reusable: false,
    created_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
    ...payload,
  });
}

function assertCleanLabel(label, targetId) {
  assert.ok(label, "label should be present");
  assert.doesNotMatch(label, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "labels should not expose UUIDs");
  assert.equal(label.includes(targetId), false, "labels should not echo raw target ids");
}

async function readWorkspace() {
  const rows = await querySql("SELECT workspace_id, name AS workspace_name FROM workspaces ORDER BY rowid LIMIT 1;");
  assert.ok(rows[0]?.workspace_id, "workspace fixture is required");
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
  const user = rows[0];
  assert.ok(user?.user_id, "protected user fixture is required");
  return {
    active_workspace_id: workspaceId,
    display_name: user.display_name || user.username,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: workspaceId,
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
  ${sqlText(`limited-${userId}@example.test`)},
  'Limited Note List Target User',
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
    active_workspace_id: workspaceId,
    display_name: "Limited Note List Target User",
    timezone: "America/New_York",
    user_id: userId,
    username: `limited-${userId}@example.test`,
    workspace_id: workspaceId,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
