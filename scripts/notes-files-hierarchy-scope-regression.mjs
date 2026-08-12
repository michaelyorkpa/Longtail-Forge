import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertRoadmapCursorAtLeast } from "./lib/roadmap-cursor.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-files-hierarchy-scope-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-files-hierarchy-scope.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Files-Hierarchy-Scope-Test-123!";
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "notes-files-hierarchy-scope-master-key";
process.env.LONGTAIL_SECURE_NOTES_KEY_VERSION = "test-v1";

const moduleContract = readText("docs/module-contract.md");
const notesDocs = readText("docs/notes-module.md");
const viewBuildingContract = readText("docs/view-building-contract.md");
const notesModuleSource = readText("src/modules/notes/module.js");

const { closeSqlite, initializeDatabase, runSql, sqlText, querySql } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { filesService } = await import("../src/services/files.service.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createHierarchyFixtures(session);

  await assertNotesHierarchyScope(session, fixtures);
  await assertFilesHierarchyScope(session, fixtures);
  await assertUnreadableDescendantsStayExcluded(session);
  await assertIntegrity();

  console.log("Notes and Files hierarchy scope regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
        assert.match(notesModuleSource, /version:\s*appVersion/, "Notes module metadata should track the current app version");

  assert.match(
    notesDocs,
    /^# Notes Module Developer Guide$/m,
    "Notes docs should retain the owning developer-guide heading",
  );
  assert.match(
    notesDocs,
    /As of 0\.33\.6\.14\.2, direct Notes list client\/project filters now use the shared hierarchy scope resolver[\s\S]*selecting a parent client includes readable descendant sub-clients and descendant projects[\s\S]*leaf selection still drills down to the selected client\/project only[\s\S]*unreadable descendants remain excluded/,
    "Notes docs should document the shipped descendant-aware Notes list scope",
  );
  assert.match(
    moduleContract,
    /As of 0\.33\.6\.14\.2, direct client\/project filters on Notes list reads and Files browse\/File Context target reads use the same shared permission-aware hierarchy scope resolver[\s\S]*Parent client selection includes readable descendant sub-clients plus descendant-project records[\s\S]*parent project selection includes readable descendant sub-project records[\s\S]*project selection remains the narrower direct filter[\s\S]*Reporting keeps its explicit descendant-rollup behavior/,
    "Module contract should document the shared Notes/Files hierarchy scope rule",
  );
  assert.match(
    viewBuildingContract,
    /As of 0\.33\.6\.14\.2, the Notes list query path and Files browse plus File Context target reads consume the shared descendant-aware hierarchy scope resolver[\s\S]*Browser code continues to submit only the selected direct client\/project values[\s\S]*Notes service\/repository and Files service expand readable descendants server-side/,
    "View-building contract should document the Notes/Files hierarchy scope ownership boundary",
  );
  assertRoadmapCursorAtLeast("0.33.8", "Roadmap should advance beyond the completed hierarchy and Linked Context follow-up slices");
    }

async function createHierarchyFixtures(session) {
  const parentClient = (await clientsService.createClient({ name: "Hierarchy Parent Client" }, session)).client;
  const childClient = (await clientsService.createClient({
    name: "Hierarchy Child Client",
    parent_client_id: parentClient.id,
  }, session)).client;
  const unrelatedClient = (await clientsService.createClient({ name: "Hierarchy Unrelated Client" }, session)).client;

  const parentProject = (await clientsService.createProject(parentClient.id, {
    name: "Hierarchy Parent Project",
  }, session)).project;
  const childProject = (await clientsService.createProject(parentClient.id, {
    name: "Hierarchy Child Project",
    parent_project_id: parentProject.id,
  }, session)).project;
  const childClientProject = (await clientsService.createProject(childClient.id, {
    name: "Hierarchy Child Client Project",
  }, session)).project;
  const unrelatedProject = (await clientsService.createProject(unrelatedClient.id, {
    name: "Hierarchy Unrelated Project",
  }, session)).project;

  const descendantClientTask = (await tasksService.create({
    project_id: childClientProject.id,
    title: "Hierarchy descendant client task",
  }, session)).task;
  const descendantProjectTask = (await tasksService.create({
    project_id: childProject.id,
    title: "Hierarchy descendant project task",
  }, session)).task;
  const unrelatedTask = (await tasksService.create({
    project_id: unrelatedProject.id,
    title: "Hierarchy unrelated task",
  }, session)).task;

  const descendantClientNote = (await notesService.create({
    body_markdown: "Hierarchy descendant client note body",
    client_id: childClient.id,
    libraryBucket: "active_work",
    project_id: childClientProject.id,
    title: "Hierarchy descendant client note",
    visibility: "internal",
  }, session)).note;
  const descendantProjectNote = (await notesService.create({
    body_markdown: "Hierarchy descendant project note body",
    client_id: parentClient.id,
    libraryBucket: "active_work",
    project_id: childProject.id,
    title: "Hierarchy descendant project note",
    visibility: "internal",
  }, session)).note;
  const unrelatedNote = (await notesService.create({
    body_markdown: "Hierarchy unrelated note body",
    client_id: unrelatedClient.id,
    libraryBucket: "active_work",
    project_id: unrelatedProject.id,
    title: "Hierarchy unrelated note",
    visibility: "internal",
  }, session)).note;

  const descendantClientAttachmentId = await insertAvailableAttachment({
    clientId: childClient.id,
    label: "hierarchy-descendant-client",
    projectId: childClientProject.id,
    session,
    targetId: descendantClientTask.task_id,
  });
  const descendantProjectAttachmentId = await insertAvailableAttachment({
    clientId: parentClient.id,
    label: "hierarchy-descendant-project",
    projectId: childProject.id,
    session,
    targetId: descendantProjectTask.task_id,
  });
  await insertAvailableAttachment({
    clientId: unrelatedClient.id,
    label: "hierarchy-unrelated",
    projectId: unrelatedProject.id,
    session,
    targetId: unrelatedTask.task_id,
  });

  return {
    childClient,
    childClientProject,
    childProject,
    descendantClientAttachmentId,
    descendantClientNote,
    descendantClientTask,
    descendantProjectAttachmentId,
    descendantProjectNote,
    descendantProjectTask,
    parentClient,
    parentProject,
    unrelatedNote,
    unrelatedTask,
  };
}

async function assertNotesHierarchyScope(session, fixtures) {
  const parentClientScope = await notesService.list(session, {
    client_id: fixtures.parentClient.id,
    status: "all",
  });
  assert.ok(
    parentClientScope.notes.some((note) => note.note_id === fixtures.descendantClientNote.note_id),
    "parent client Notes filter should include readable descendant-client notes",
  );
  assert.ok(
    parentClientScope.notes.some((note) => note.note_id === fixtures.descendantProjectNote.note_id),
    "parent client Notes filter should include same-client descendant-project notes",
  );
  assert.equal(
    parentClientScope.notes.some((note) => note.note_id === fixtures.unrelatedNote.note_id),
    false,
    "parent client Notes filter should exclude unrelated notes",
  );

  const leafClientScope = await notesService.list(session, {
    client_id: fixtures.childClient.id,
    status: "all",
  });
  assert.deepEqual(
    leafClientScope.notes.map((note) => note.note_id),
    [fixtures.descendantClientNote.note_id],
    "leaf client Notes filter should stay limited to the selected client scope",
  );

  const parentProjectScope = await notesService.list(session, {
    project_id: fixtures.parentProject.id,
    status: "all",
  });
  assert.ok(
    parentProjectScope.notes.some((note) => note.note_id === fixtures.descendantProjectNote.note_id),
    "parent project Notes filter should include readable descendant-project notes",
  );

  const leafProjectScope = await notesService.list(session, {
    project_id: fixtures.childProject.id,
    status: "all",
  });
  assert.deepEqual(
    leafProjectScope.notes.map((note) => note.note_id),
    [fixtures.descendantProjectNote.note_id],
    "leaf project Notes filter should stay limited to the selected project scope",
  );
}

async function assertFilesHierarchyScope(session, fixtures) {
  const parentClientScope = await filesService.listAttachments(session, {
    client_id: fixtures.parentClient.id,
    status: "all",
  });
  assert.ok(
    parentClientScope.attachments.some((attachment) => attachment.fileAttachmentId === fixtures.descendantClientAttachmentId),
    "parent client Files browse filter should include readable descendant-client attachments",
  );
  assert.ok(
    parentClientScope.attachments.some((attachment) => attachment.fileAttachmentId === fixtures.descendantProjectAttachmentId),
    "parent client Files browse filter should include same-client descendant-project attachments",
  );
  assert.equal(
    parentClientScope.attachments.some((attachment) => attachment.targetId === fixtures.unrelatedTask.task_id),
    false,
    "parent client Files browse filter should exclude unrelated attachments",
  );

  const leafClientScope = await filesService.listAttachments(session, {
    client_id: fixtures.childClient.id,
    status: "all",
  });
  assert.deepEqual(
    leafClientScope.attachments.map((attachment) => attachment.fileAttachmentId),
    [fixtures.descendantClientAttachmentId],
    "leaf client Files browse filter should stay limited to the selected client scope",
  );

  const parentProjectScope = await filesService.listAttachments(session, {
    project_id: fixtures.parentProject.id,
    status: "all",
  });
  assert.ok(
    parentProjectScope.attachments.some((attachment) => attachment.fileAttachmentId === fixtures.descendantProjectAttachmentId),
    "parent project Files browse filter should include readable descendant-project attachments",
  );

  const leafProjectScope = await filesService.listAttachments(session, {
    project_id: fixtures.childProject.id,
    status: "all",
  });
  assert.deepEqual(
    leafProjectScope.attachments.map((attachment) => attachment.fileAttachmentId),
    [fixtures.descendantProjectAttachmentId],
    "leaf project Files browse filter should stay limited to the selected project scope",
  );

  const parentClientTargets = await filesService.listAttachableTargetOptions(session, {
    client_id: fixtures.parentClient.id,
    moduleId: "tasks",
    targetType: "task",
  });
  assert.ok(
    parentClientTargets.options.some((option) => option.targetId === fixtures.descendantClientTask.task_id),
    "parent client File Context target filters should include readable descendant-client tasks",
  );
  assert.ok(
    parentClientTargets.options.some((option) => option.targetId === fixtures.descendantProjectTask.task_id),
    "parent client File Context target filters should include same-client descendant-project tasks",
  );
  assert.equal(
    parentClientTargets.options.some((option) => option.targetId === fixtures.unrelatedTask.task_id),
    false,
    "parent client File Context target filters should exclude unrelated tasks",
  );

  const leafClientTargets = await filesService.listAttachableTargetOptions(session, {
    client_id: fixtures.childClient.id,
    moduleId: "tasks",
    targetType: "task",
  });
  assert.deepEqual(
    leafClientTargets.options.map((option) => option.targetId),
    [fixtures.descendantClientTask.task_id],
    "leaf client File Context target filters should stay limited to the selected client scope",
  );

  const parentProjectTargets = await filesService.listAttachableTargetOptions(session, {
    moduleId: "tasks",
    project_id: fixtures.parentProject.id,
    targetType: "task",
  });
  assert.ok(
    parentProjectTargets.options.some((option) => option.targetId === fixtures.descendantProjectTask.task_id),
    "parent project File Context target filters should include readable descendant-project tasks",
  );

  const leafProjectTargets = await filesService.listAttachableTargetOptions(session, {
    moduleId: "tasks",
    project_id: fixtures.childProject.id,
    targetType: "task",
  });
  assert.deepEqual(
    leafProjectTargets.options.map((option) => option.targetId),
    [fixtures.descendantProjectTask.task_id],
    "leaf project File Context target filters should stay limited to the selected project scope",
  );
}

async function assertUnreadableDescendantsStayExcluded(session) {
  const parentClient = (await clientsService.createClient({ name: "Hierarchy Permission Parent Client" }, session)).client;
  const readableChildClient = (await clientsService.createClient({
    name: "Hierarchy Permission Readable Child Client",
    parent_client_id: parentClient.id,
  }, session)).client;
  const hiddenChildClient = (await clientsService.createClient({
    name: "Hierarchy Permission Hidden Child Client",
    parent_client_id: parentClient.id,
  }, session)).client;

  const readableProject = (await clientsService.createProject(readableChildClient.id, {
    name: "Hierarchy Permission Readable Project",
  }, session)).project;
  const hiddenProject = (await clientsService.createProject(hiddenChildClient.id, {
    name: "Hierarchy Permission Hidden Project",
  }, session)).project;

  const readableTask = (await tasksService.create({
    project_id: readableProject.id,
    title: "Hierarchy permission readable task",
  }, session)).task;
  const hiddenTask = (await tasksService.create({
    project_id: hiddenProject.id,
    title: "Hierarchy permission hidden task",
  }, session)).task;

  const readableNote = (await notesService.create({
    body_markdown: "Hierarchy permission readable note body",
    libraryBucket: "active_work",
    project_id: readableProject.id,
    title: "Hierarchy permission readable note",
    visibility: "internal",
  }, session)).note;
  const hiddenNote = (await notesService.create({
    body_markdown: "Hierarchy permission hidden note body",
    libraryBucket: "active_work",
    project_id: hiddenProject.id,
    title: "Hierarchy permission hidden note",
    visibility: "internal",
  }, session)).note;

  const readableAttachmentId = await insertAvailableAttachment({
    clientId: readableChildClient.id,
    label: "hierarchy-readable-permission",
    projectId: readableProject.id,
    session,
    targetId: readableTask.task_id,
  });
  await insertAvailableAttachment({
    clientId: hiddenChildClient.id,
    label: "hierarchy-hidden-permission",
    projectId: hiddenProject.id,
    session,
    targetId: hiddenTask.task_id,
  });

  const limitedSession = await createNoRoleSession(session.workspace_id);
  await assignProjectAdminRole(limitedSession.user_id, session.workspace_id, readableProject.id);

  const notesScope = await notesService.list(limitedSession, {
    client_id: parentClient.id,
    status: "all",
  });
  assert.deepEqual(
    notesScope.notes.map((note) => note.note_id),
    [readableNote.note_id],
    "parent client Notes filters should exclude unreadable descendant notes",
  );
  assert.equal(
    notesScope.notes.some((note) => note.note_id === hiddenNote.note_id),
    false,
    "hidden descendant note should stay excluded",
  );

  const attachmentsScope = await filesService.listAttachments(limitedSession, {
    client_id: parentClient.id,
    status: "all",
  });
  assert.deepEqual(
    attachmentsScope.attachments.map((attachment) => attachment.fileAttachmentId),
    [readableAttachmentId],
    "parent client Files browse filters should exclude unreadable descendant attachments",
  );

  const targetsScope = await filesService.listAttachableTargetOptions(limitedSession, {
    client_id: parentClient.id,
    moduleId: "tasks",
    targetType: "task",
  });
  assert.deepEqual(
    targetsScope.options.map((option) => option.targetId),
    [readableTask.task_id],
    "parent client File Context target filters should exclude unreadable descendant tasks",
  );
}

async function insertAvailableAttachment({ clientId, label, projectId, session, targetId }) {
  const attachmentId = randomUUID();
  const fileId = randomUUID();
  const now = new Date().toISOString();
  const originalFilename = `${label}.txt`;

  await runSql(`
INSERT INTO files (
  file_id,
  workspace_id,
  storage_provider,
  storage_key,
  original_filename,
  stored_filename,
  display_name,
  extension,
  mime_type_claimed,
  mime_type_detected,
  file_size_bytes,
  sha256_hash,
  status,
  scan_status,
  quarantine_reason,
  uploaded_by_user_id,
  created_at,
  updated_at,
  deleted_at,
  metadata_json
)
VALUES (
  ${sqlText(fileId)},
  ${sqlText(session.workspace_id)},
  'local',
  ${sqlText(`test/${fileId}`)},
  ${sqlText(originalFilename)},
  ${sqlText(originalFilename)},
  ${sqlText(label)},
  '.txt',
  'text/plain',
  'text/plain',
  16,
  '',
  'available',
  'passed',
  NULL,
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  ${sqlText(now)},
  NULL,
  '{}'
);

INSERT INTO file_attachments (
  file_attachment_id,
  workspace_id,
  file_id,
  module_id,
  target_type,
  target_id,
  client_id,
  project_id,
  visibility,
  attachment_role,
  caption,
  sort_order,
  attached_by_user_id,
  created_at,
  removed_at,
  metadata_json
)
VALUES (
  ${sqlText(attachmentId)},
  ${sqlText(session.workspace_id)},
  ${sqlText(fileId)},
  'tasks',
  'task',
  ${sqlText(targetId)},
  ${sqlText(clientId)},
  ${sqlText(projectId)},
  'private',
  NULL,
  NULL,
  0,
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  NULL,
  '{}'
);
`);

  return attachmentId;
}

async function createNoRoleSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();
  const username = `notes-files-hierarchy-${userId}@example.test`;

  await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  password,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(username)},
  'Notes Files Hierarchy No Role',
  'unused',
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
`);

  return {
    home_workspace_id: workspaceId,
    ip: "127.0.0.1",
    timezone: "America/New_York",
    user_id: userId,
    username,
    workspace_id: workspaceId,
  };
}

async function assignProjectAdminRole(userId, workspaceId, projectId) {
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  'project_admin',
  'project',
  ${sqlText(projectId)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.display_name, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

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
  const rows = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(rows, [{ integrity_check: "ok" }]);
}
