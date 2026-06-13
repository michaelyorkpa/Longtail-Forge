import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-linked-panel-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-linked-panel.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Linked-Panel-Test-123!";
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "notes-linked-panel-secure-note-test-key";

const { notesService } = await import("../src/modules/notes/notes.service.js");
const { NOTE_LIBRARY_BUCKETS, NOTE_SECURITY_MODES, NOTE_VISIBILITIES } = await import("../src/modules/notes/library.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const adminSession = await readProtectedSession(workspace.workspace_id);
  const limitedSession = await createClientUserSession(workspace.workspace_id);

  await assertLinkedPanelReadModel(adminSession);
  await assertLinkedPanelAccessBeforeShaping(adminSession, limitedSession);
  await assertCollectionDefaultsAndCounts(adminSession, limitedSession);

  console.log("Notes linked panel regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertLinkedPanelReadModel(session) {
  const beta = await notesService.create({
    title: "Beta panel note",
    body_markdown: "Beta panel body.",
    links: [{ module_id: "framework", target_type: "workspace", target_id: session.workspace_id }],
  }, session);
  const alpha = await notesService.create({
    title: "Alpha panel note",
    body_markdown: "Alpha panel body.",
    links: [{ module_id: "framework", target_type: "workspace", target_id: session.workspace_id }],
  }, session);

  await runSql(`
UPDATE notes
SET updated_at = '2026-01-01T10:00:00.000Z'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND note_id = ${sqlText(beta.note.note_id)};

UPDATE notes
SET updated_at = '2026-01-02T10:00:00.000Z'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND note_id = ${sqlText(alpha.note.note_id)};
`);

  const byTitle = await notesService.listForTarget(session, {
    module_id: "framework",
    target_type: "workspace",
    target_id: session.workspace_id,
    sort: "title",
  });

  assert.equal(byTitle.target.targetType, "workspace");
  assert.equal(byTitle.target.sourceUrl, "dashboard.html");
  assert.equal(byTitle.sort, "title");
  assert.equal(byTitle.moduleState.enabled, true);
  assert.equal(byTitle.actions.canCreate, true);
  assert.equal(byTitle.actions.canLink, true);
  assert.equal(byTitle.actions.canUnlink, true);
  assert.equal(byTitle.actions.readonly, false);
  assert.ok(byTitle.notes.some((note) => note.note_id === alpha.note.note_id), "compatibility notes array should remain present");
  assert.deepEqual(
    byTitle.linkedNotes.slice(0, 2).map((note) => note.label),
    ["Alpha panel note", "Beta panel note"],
    "linked note panels should support service-owned title sorting",
  );
  assert.ok(byTitle.linkedNotes.every((note) => note.sourceUrl.startsWith("notes.html?note=")), "panel notes should include safe source URLs");
  assert.ok(byTitle.linkedNotes.every((note) => !Object.hasOwn(note, "body_markdown")), "panel notes should not expose full note body Markdown");

  const byUpdated = await notesService.listForTarget(session, {
    module_id: "framework",
    target_type: "workspace",
    target_id: session.workspace_id,
    sort: "updated",
  });
  assert.equal(byUpdated.linkedNotes[0].id, alpha.note.note_id, "updated sort should be newest first");

  const empty = await notesService.listForTarget(session, {
    module_id: "users",
    target_type: "user",
    target_id: session.user_id,
  });
  assert.equal(empty.count, 0);
  assert.equal(empty.emptyState.title, "No linked notes yet.");

  await runSql(`
UPDATE workspace_modules
SET status = 'disabled'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'notes';
`);
  const disabledPanel = await notesService.listForTarget(session, {
    module_id: "framework",
    target_type: "workspace",
    target_id: session.workspace_id,
  });
  assert.equal(disabledPanel.count >= 2, true, "disabled Notes should preserve historical linked reads");
  assert.equal(disabledPanel.moduleState.enabled, false);
  assert.equal(disabledPanel.actions.canCreate, false);
  assert.equal(disabledPanel.actions.canLink, false);
  assert.equal(disabledPanel.actions.canUnlink, false);
  assert.equal(disabledPanel.actions.readonly, true);
  await runSql(`
UPDATE workspace_modules
SET status = 'enabled'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'notes';
`);
}

async function assertLinkedPanelAccessBeforeShaping(adminSession, limitedSession) {
  const privateNote = await notesService.create({
    title: "Hidden private panel note",
    body_markdown: "Private panel body.",
    visibility: NOTE_VISIBILITIES.PRIVATE,
    links: [{ module_id: "framework", target_type: "workspace", target_id: adminSession.workspace_id }],
  }, adminSession);
  const secureNote = await notesService.create({
    title: "Hidden secure panel note",
    body_markdown: "Secure panel body.",
    security_mode: NOTE_SECURITY_MODES.SECURE,
    links: [{ module_id: "framework", target_type: "workspace", target_id: adminSession.workspace_id }],
  }, adminSession);

  const limitedPanel = await notesService.listForTarget(limitedSession, {
    module_id: "framework",
    target_type: "workspace",
    target_id: limitedSession.workspace_id,
  });

  assert.equal(limitedPanel.linkedNotes.some((note) => note.id === privateNote.note.note_id), false);
  assert.equal(limitedPanel.linkedNotes.some((note) => note.id === secureNote.note.note_id), false);
  assert.equal(JSON.stringify(limitedPanel).includes("Hidden private panel note"), false, "private note labels should not leak through panel payloads");
  assert.equal(JSON.stringify(limitedPanel).includes("Hidden secure panel note"), false, "secure note labels should not leak through panel payloads");
}

async function assertCollectionDefaultsAndCounts(adminSession, limitedSession) {
  const parent = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    title: "Panel Counts Parent",
  }, adminSession);
  const child = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    parentCollectionId: parent.collection.note_library_collection_id,
    title: "Panel Counts Child",
  }, adminSession);
  const reference = await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    title: "Reference Counts",
  }, adminSession);

  const visible = await notesService.create({
    title: "Visible collection count note",
    body_markdown: "Visible count body.",
    library_bucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    noteCollectionId: child.collection.note_library_collection_id,
  }, adminSession);
  const privateNote = await notesService.create({
    title: "Private collection count note",
    body_markdown: "Private count body.",
    library_bucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    noteCollectionId: child.collection.note_library_collection_id,
    visibility: NOTE_VISIBILITIES.PRIVATE,
  }, adminSession);

  const tree = await notesService.listCollections(limitedSession);
  const parentRow = tree.collections.find((collection) => collection.note_library_collection_id === parent.collection.note_library_collection_id);
  const childRow = tree.collections.find((collection) => collection.note_library_collection_id === child.collection.note_library_collection_id);

  assert.deepEqual(tree.defaults.libraries.all, { label: "All Libraries", value: "all" });
  assert.deepEqual(tree.defaults.collections.all, { label: "All collections", value: "" });
  assert.deepEqual(tree.defaults.collections.uncategorized, { label: "Uncategorized", value: "__uncategorized" });
  assert.equal(tree.collections[0].library_bucket, NOTE_LIBRARY_BUCKETS.ACTIVE_WORK, "collection read model should be bucket-first");
  assert.equal(tree.collections.at(-1).note_library_collection_id, reference.collection.note_library_collection_id);
  assert.equal(parentRow.accessibleNoteCount, 1, "rolled-up counts should use access-filtered notes");
  assert.equal(childRow.directAccessibleNoteCount, 1, "direct counts should use access-filtered notes");
  assert.equal(JSON.stringify(tree).includes(privateNote.note.title), false, "private note labels should never appear in collection trees");
  assert.equal(JSON.stringify(tree).includes(visible.note.title), false, "collection trees should expose counts, not note labels");
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
  ${sqlText(`limited-linked-panel-${userId}@example.test`)},
  'Limited Linked Panel User',
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
    username: `limited-linked-panel-${userId}@example.test`,
    display_name: "Limited Linked Panel User",
    timezone: "America/New_York",
  };
}
