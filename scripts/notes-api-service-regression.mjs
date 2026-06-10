import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-api-service-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-api-service.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Api-Service-Test-123!";

const { notesService } = await import("../src/modules/notes/notes.service.js");
const { tagsService } = await import("../src/services/tags.service.js");
const { filesService } = await import("../src/services/files.service.js");
const { NOTE_LIBRARY_BUCKETS, NOTE_SECURITY_MODES, NOTE_STATUSES, NOTE_VISIBILITIES } = await import("../src/modules/notes/library.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const adminSession = await readProtectedSession(workspace.workspace_id);
  const limitedSession = await createClientUserSession(workspace.workspace_id);

  await assertNoteLifecycle(adminSession);
  await assertNotesTagAndTargetIntegrations(adminSession);
  await assertNotesFileAttachmentIntegration(adminSession);
  await assertPrivateNotesStayHidden(adminSession, limitedSession);
  await assertDisabledModuleBlocksWrites(adminSession);
  await assertIntegrity();

  console.log("Notes API service regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertNoteLifecycle(session) {
  const createResult = await notesService.create({
    title: "API service note",
    body_markdown: "# Heading\n\nA useful [[Reference Note]] body.",
    note_type: "general",
    visibility: NOTE_VISIBILITIES.INTERNAL,
    links: [
      {
        module_id: "framework",
        target_type: "workspace",
        target_id: session.workspace_id,
      },
    ],
  }, session);
  const noteId = createResult.note.note_id;

  assert.equal(createResult.note.library_bucket, NOTE_LIBRARY_BUCKETS.REFERENCE);
  assert.equal(createResult.note.links.length, 1);
  assert.equal(createResult.searchDocument.recordType, "note");
  assert.match(createResult.note.body_excerpt, /Heading/);
  assert.equal((await notesService.listRevisions(noteId, session)).revisions.length, 0);

  const listResult = await notesService.list(session);
  assert.ok(listResult.notes.some((note) => note.note_id === noteId));

  const targetResult = await notesService.listForTarget(session, {
    module_id: "framework",
    target_type: "workspace",
    target_id: session.workspace_id,
  });
  assert.ok(targetResult.notes.some((note) => note.note_id === noteId));

  const updateResult = await notesService.update(noteId, {
    ...createResult.note,
    title: "Updated API service note",
    body_markdown: "Updated body",
  }, session);
  assert.equal(updateResult.note.title, "Updated API service note");

  const revisionsAfterUpdate = await notesService.listRevisions(noteId, session);
  assert.equal(revisionsAfterUpdate.revisions.length, 1);
  assert.equal(revisionsAfterUpdate.revisions[0].revision_number, 1);
  assert.equal(revisionsAfterUpdate.revisions[0].title, "API service note");

  const archiveResult = await notesService.archive(noteId, session);
  assert.equal(archiveResult.note.status, NOTE_STATUSES.ARCHIVED);
  await assertRejectsWithMessage(
    () => notesService.update(noteId, { ...archiveResult.note, title: "Should fail" }, session),
    /Archived notes are read-only/,
  );

  const restoreResult = await notesService.restore(noteId, session);
  assert.equal(restoreResult.note.status, NOTE_STATUSES.ACTIVE);

  const revisionToRestore = revisionsAfterUpdate.revisions.at(-1);
  const revisionRestoreResult = await notesService.restoreRevision(noteId, revisionToRestore.note_revision_id, session);
  assert.equal(revisionRestoreResult.restoredRevision.note_revision_id, revisionToRestore.note_revision_id);

  const links = await notesService.listLinks(noteId, session);
  assert.equal(links.links.length, 1);
  const removed = await notesService.removeLink(noteId, links.links[0].note_link_id, session);
  assert.ok(removed.link.removed_at);

  const deleteResult = await notesService.softDelete(noteId, session);
  assert.equal(deleteResult.note.status, NOTE_STATUSES.DELETED);
}

async function assertNotesTagAndTargetIntegrations(session) {
  const tag = await tagsService.create(session, {
    color: "#2563eb",
    name: `Notes Integration ${randomUUID().slice(0, 8)}`,
  });
  const createResult = await notesService.create({
    title: "Tagged linked user note",
    body_markdown: "Tagged note body.",
    linked_user_id: session.user_id,
    tagIds: [tag.tag.tag_id],
  }, session);
  const noteId = createResult.note.note_id;

  assert.deepEqual(createResult.note.tags.map((item) => item.tag_id), [tag.tag.tag_id]);

  const filtered = await notesService.list(session, { tagIds: [tag.tag.tag_id] });
  assert.ok(filtered.notes.some((note) => note.note_id === noteId), "Notes list should filter by assigned tags");
  assert.equal(
    filtered.notes.find((note) => note.note_id === noteId).library_bucket,
    createResult.note.library_bucket,
    "Tag filtering should not alter Library bucket classification",
  );

  const directTarget = await notesService.listForTarget(session, {
    module_id: "users",
    target_type: "user",
    target_id: session.user_id,
  });
  assert.ok(directTarget.notes.some((note) => note.note_id === noteId), "Target lookup should include direct note context columns");

  const updated = await notesService.update(noteId, {
    ...createResult.note,
    title: "Untagged linked user note",
    body_markdown: "Updated body.",
    tagIds: [],
  }, session);
  assert.deepEqual(updated.note.tags, [], "Manual note tags should be replaceable without leaving stale tags");
}

async function assertNotesFileAttachmentIntegration(session) {
  const noteResult = await notesService.create({
    title: "Attachable note",
    body_markdown: "Shared file attachment target.",
    visibility: NOTE_VISIBILITIES.INTERNAL,
  }, session);
  const upload = await filesService.uploadAndAttach(session, {
    contentBase64: Buffer.from("note attachment").toString("base64"),
    moduleId: "notes",
    originalFilename: "note-attachment.txt",
    targetId: noteResult.note.note_id,
    targetType: "note",
    visibility: "workspace",
  });

  assert.equal(upload.attachment.targetType, "note");
  assert.equal(upload.attachment.moduleId, "notes");

  const attachments = await filesService.listAttachments(session, {
    moduleId: "notes",
    targetId: noteResult.note.note_id,
    targetType: "note",
  });
  assert.deepEqual(attachments.attachments.map((attachment) => attachment.fileId), [upload.file.fileId]);

  const secureNote = await notesService.create({
    title: "Secure attachment note",
    body_markdown: "No normal attachments.",
    security_mode: NOTE_SECURITY_MODES.SECURE,
  }, session);
  await assertRejectsWithMessage(
    () => filesService.uploadAndAttach(session, {
      contentBase64: Buffer.from("secure note attachment").toString("base64"),
      moduleId: "notes",
      originalFilename: "secure-note-attachment.txt",
      targetId: secureNote.note.note_id,
      targetType: "note",
      visibility: "private",
    }),
    /Secure notes do not allow framework file attachments/,
  );
}

async function assertPrivateNotesStayHidden(adminSession, limitedSession) {
  const privateNote = await notesService.create({
    title: "Private admin note",
    body_markdown: "Only the owner should see this.",
    visibility: NOTE_VISIBILITIES.PRIVATE,
  }, adminSession);

  const limitedList = await notesService.list(limitedSession);
  assert.equal(
    limitedList.notes.some((note) => note.note_id === privateNote.note.note_id),
    false,
    "private notes should not appear in unauthorized list results",
  );

  await assertRejectsWithMessage(
    () => notesService.read(privateNote.note.note_id, limitedSession),
    /private note|access notes/i,
  );
}

async function assertDisabledModuleBlocksWrites(session) {
  await runSql(`
UPDATE workspace_modules
SET status = 'disabled'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'notes';
`);

  await assertRejectsWithMessage(
    () => notesService.create({ title: "Disabled write", body_markdown: "Nope." }, session),
    /disabled/,
  );

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND module_id = 'notes';
`);
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
  ${sqlText(`limited-${userId}@example.test`)},
  'Limited Notes User',
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
    username: `limited-${userId}@example.test`,
    display_name: "Limited Notes User",
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
