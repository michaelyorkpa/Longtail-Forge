import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-task-context-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-task-context.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Task-Context-Test-123!";

const { notesService } = await import("../src/modules/notes/notes.service.js");
const { clientsRepository } = await import("../src/modules/client-projects/clients.repo.js");
const { projectsRepository } = await import("../src/modules/client-projects/projects.repo.js");
const { tasksRepository } = await import("../src/modules/tasks/tasks.repo.js");
const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertStaticTaskContextContract();
  await assertTaskCreatedNoteContext(session);
  await assertDirectTaskMigrationContract();
  await assertIntegrity();

  console.log("Notes task-created context regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertStaticTaskContextContract() {
  const notesJs = await fs.readFile(path.join(process.cwd(), "public/js/notes.js"), "utf8");
  const notesServiceSource = await fs.readFile(path.join(process.cwd(), "src/modules/notes/notes.service.js"), "utf8");

  assert.match(notesJs, /task_id: null/);
  assert.doesNotMatch(notesJs, /primaryContextFromTarget|taskLinkPrimaryContext|applyContextTarget/, "Linked Context must not infer or mutate Primary Context from task targets");
  assert.match(notesJs, /async function applyTaskCreatedPrimaryContext\(target = \{\}, matchedTarget = \{\}\)[\s\S]*if \(targetType !== "task"\) \{[\s\S]*return;[\s\S]*clientInput\.value = clientId[\s\S]*projectInput\.value = projectId/, "The task-created Note flow should explicitly prefill direct Primary Context controls for new task notes");
  assert.match(notesJs, /await applyTaskCreatedPrimaryContext\(target, matchedTarget\);[\s\S]*stageEditorLinkTarget\(matchedTarget\);/, "Task-created Primary Context prefill should run before the task is staged as Linked Context");
  assert.doesNotMatch(notesJs, /linked\.push\(`Task: \$\{contextSummaryLabel\("task"\)\}`\)/);
  assert.match(notesServiceSource, /function normalizeLinkPayloads\(payload = \{\}\)/);
  assert.match(notesServiceSource, /links\.push\(\{\s*module_id: "tasks",\s*target_type: "task",\s*target_id: taskId,\s*\}\)/);
}

async function assertTaskCreatedNoteContext(session) {
  const fixtures = await createTaskContextFixtures(session);

  const created = await notesService.create({
    title: "Task-created context note",
    body_markdown: "Task-created note body.",
    note_type: "log",
    library_bucket: "active_work",
    client_id: fixtures.clientId,
    project_id: fixtures.projectId,
    task_id: fixtures.taskId,
  }, session);
  const note = created.note;
  const taskLink = findTaskLink(note, fixtures.taskId);

  assert.equal(note.client_id, fixtures.clientId);
  assert.equal(note.project_id, fixtures.projectId);
  assert.equal(note.task_id || "", "", "task should not be saved as direct note context");
  assert.ok(taskLink, "task-created notes should create a normal task link");
  assert.ok(taskLink.noteLinkId || taskLink.note_link_id, "task link should be a removable note_links row");
  assert.equal(taskLink.label, "Task Context Source Task");
  assert.equal(taskLink.sourceUrl || taskLink.source_url, `tasks.html?task=${encodeURIComponent(fixtures.taskId)}`);
  assert.equal(note.linked_context?.client?.label, "Task Context Client");
  assert.equal(note.linked_context?.project?.label, "Task Context Project");
  assert.equal(note.linked_context?.task, undefined);
  assertReadableLabelsDoNotExposeIds([taskLink.label, note.linked_context.client.label, note.linked_context.project.label], fixtures);

  const updated = await notesService.update(note.note_id, {
    ...note,
    client_id: null,
    project_id: fixtures.workspaceProjectId,
    task_id: fixtures.taskId,
  }, session);
  const updatedRead = await notesService.read(updated.note.note_id, session);
  const updatedTaskLink = findTaskLink(updatedRead.note, fixtures.taskId);

  assert.equal(updatedRead.note.client_id || "", "");
  assert.equal(updatedRead.note.project_id, fixtures.workspaceProjectId);
  assert.equal(updatedRead.note.task_id || "", "");
  assert.ok(updatedTaskLink, "editing Primary Context should preserve unrelated task links");

  await notesService.removeLink(updatedRead.note.note_id, updatedTaskLink.noteLinkId || updatedTaskLink.note_link_id, session);
  const afterRemove = await notesService.read(updatedRead.note.note_id, session);

  assert.equal(afterRemove.note.client_id || "", "");
  assert.equal(afterRemove.note.project_id, fixtures.workspaceProjectId);
  assert.equal(afterRemove.note.task_id || "", "");
  assert.equal(Boolean(findTaskLink(afterRemove.note, fixtures.taskId)), false);
}

async function assertDirectTaskMigrationContract() {
  const currentSchema = await fs.readFile(path.join(process.cwd(), "src/db/schema/current.sql"), "utf8");
  const rows = await querySql(`
SELECT version, module_id, name
FROM schema_migrations
WHERE version = '0.33.5.18.6.5.4';
`);

  assert.deepEqual(rows[0], {
    version: "0.33.5.18.6.5.4",
    module_id: "core",
    name: "current_fresh_start_database",
  });
  assert.match(currentSchema, /CREATE TABLE note_links/, "fresh baseline should include flexible note links");
  assert.match(currentSchema, /module_id TEXT NOT NULL/, "note links should retain module ownership metadata");
  assert.match(currentSchema, /target_type TEXT NOT NULL/, "note links should retain target type metadata");
  assert.match(currentSchema, /target_id TEXT NOT NULL/, "note links should retain target identity metadata");
  assert.match(currentSchema, /task_id TEXT/, "fresh baseline should retain legacy direct task column for compatibility reads");
}

async function createTaskContextFixtures(session) {
  const suffix = randomUUID().slice(0, 8);
  const clientId = `task-context-client-${suffix}`;
  const projectId = `task-context-project-${suffix}`;
  const workspaceProjectId = `task-context-workspace-project-${suffix}`;
  const taskId = `task-context-task-${suffix}`;

  await clientsRepository.create(session.workspace_id, {
    id: clientId,
    name: "Task Context Client",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, clientId, {
    id: projectId,
    name: "Task Context Project",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, "", {
    id: workspaceProjectId,
    name: "Task Context Workspace Project",
    status: "Active",
    billable: "yes",
  });
  await tasksRepository.create(session.workspace_id, {
    task_id: taskId,
    client_id: clientId,
    project_id: projectId,
    title: "Task Context Source Task",
    description: "",
    next_action: "",
    blocked_reason: "",
    resume_note: "",
    status: "open",
    priority: "normal",
    billable: "yes",
    created_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
  });

  return { clientId, projectId, workspaceProjectId, taskId };
}

function findTaskLink(note, taskId) {
  return (note.links || []).find((link) => (
    (link.targetType || link.target_type) === "task" &&
    (link.targetId || link.target_id) === taskId
  ));
}

function assertReadableLabelsDoNotExposeIds(labels, fixtures) {
  for (const label of labels) {
    assert.ok(label, "label should exist");
    assert.equal(label.includes(fixtures.clientId), false);
    assert.equal(label.includes(fixtures.projectId), false);
    assert.equal(label.includes(fixtures.taskId), false);
  }
}

async function assertIntegrity() {
  const result = await querySql("PRAGMA integrity_check;");
  assert.equal(result[0]?.integrity_check, "ok");
}

async function readWorkspace() {
  const rows = await querySql("SELECT workspace_id FROM workspaces ORDER BY rowid LIMIT 1;");
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
    display_name: user.display_name || user.username,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: workspaceId,
  };
}
