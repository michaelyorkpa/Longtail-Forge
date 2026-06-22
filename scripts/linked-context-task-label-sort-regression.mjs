import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-linked-context-task-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-linked-context-task.db");
process.env.SUPER_ADMIN_PASSWORD = "Linked-Context-Task-Test-123!";

const { clientsRepository } = await import("../src/modules/client-projects/clients.repo.js");
const { projectsRepository } = await import("../src/modules/client-projects/projects.repo.js");
const { tasksRepository } = await import("../src/modules/tasks/tasks.repo.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertBrowserPreservesFullTaskLabels();
  await assertBusinessTaskTargets(session);
  await assertFamilyTaskTargets(session);
  await assertIntegrity();

  console.log("Linked Context Task label and sort regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertBrowserPreservesFullTaskLabels() {
  const notesJs = await fs.readFile(path.join(process.cwd(), "public/js/notes.js"), "utf8");
  const viewBuilderJs = await fs.readFile(path.join(process.cwd(), "public/js/shared/view-builder.js"), "utf8");

  assert.match(notesJs, /title: target\.title \|\| ""/, "Notes picker records should carry provider full-title metadata");
  assert.match(notesJs, /option\.setAttribute\("aria-label", title\)/, "Notes fallback picker options should expose full labels accessibly");
  assert.match(viewBuilderJs, /title: record\.title \|\| record\.fullLabel \|\| record\.ariaLabel/, "Shared picker records should preserve full labels for truncated provider options");
  assert.match(viewBuilderJs, /"aria-label": pickerOptionalLabel\(option\.ariaLabel\) \|\| title/, "Shared picker options should expose provider aria labels");
}

async function assertBusinessTaskTargets(session) {
  const suffix = randomUUID().slice(0, 8);
  const workspaceName = "LCTask Workspace Business";
  const clientId = `task-label-client-${suffix}`;
  const clientProjectId = `task-label-client-project-${suffix}`;
  const workspaceProjectId = `task-label-workspace-project-${suffix}`;
  const taskIds = {
    noProject: `task-label-no-project-${suffix}`,
    clientProject: `task-label-client-project-task-${suffix}`,
    workspaceProject: `task-label-workspace-project-task-${suffix}`,
    completed: `task-label-completed-${suffix}`,
  };
  const titles = {
    noProject: "LCTask No Project Followup",
    clientProject: "LCTask Client Project Task Extremely Verbose",
    workspaceProject: "LCTask Workspace Project Task Extended",
    completed: "LCTask Finished Task Extended",
  };

  await setWorkspace(session.workspace_id, "business", workspaceName);
  await clientsRepository.create(session.workspace_id, {
    id: clientId,
    name: "LCTask Acme Client",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, clientId, {
    id: clientProjectId,
    name: "LCTask Client Project",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, "", {
    id: workspaceProjectId,
    name: "LCTask Workspace Project",
    status: "Active",
    billable: "yes",
  });

  await createTask(session, {
    task_id: taskIds.noProject,
    title: titles.noProject,
  });
  await createTask(session, {
    task_id: taskIds.clientProject,
    client_id: clientId,
    project_id: clientProjectId,
    title: titles.clientProject,
  });
  await createTask(session, {
    task_id: taskIds.workspaceProject,
    project_id: workspaceProjectId,
    title: titles.workspaceProject,
  });
  await createTask(session, {
    task_id: taskIds.completed,
    client_id: clientId,
    project_id: clientProjectId,
    title: titles.completed,
    status: "complete",
    completed_at: "2026-06-22T00:00:00.000Z",
    completed_by_user_id: session.user_id,
  });

  const result = await notesService.listLinkTargets(session, { targetType: "task", q: "LCTask", limit: 50 });
  const targets = result.targets.filter((target) => Object.values(taskIds).includes(target.targetId));

  assert.deepEqual(targets.map((target) => target.targetId), [
    taskIds.noProject,
    taskIds.clientProject,
    taskIds.workspaceProject,
    taskIds.completed,
  ]);
  assert.deepEqual(targets.map((target) => target.displayLabel), [
    truncateTaskTitle(titles.noProject),
    `${truncateTaskTitle(titles.clientProject)} - LCTask Acme Client | LCTask Client Project`,
    `${truncateTaskTitle(titles.workspaceProject)} - ${workspaceName} | LCTask Workspace Project`,
    `${truncateTaskTitle(titles.completed)} - LCTask Acme Client | LCTask Client Project`,
  ]);

  for (const target of targets) {
    assert.equal(target.targetType, "task");
    assert.equal(target.workspaceId, session.workspace_id);
    assert.equal(target.secondaryLabel, "");
    assert.equal(target.title, target.label);
    assert.equal(target.fullLabel, target.label);
    assert.ok(target.ariaLabel.startsWith(target.label), "full task title should be preserved for accessible labels");
    assertCleanTaskLabel(target, target.targetId);
  }

  assert.equal(targets[0].displayLabel.includes(" - "), false, "tasks without a project should not show client/workspace context");

  const linkedNote = await notesService.create({
    title: "LCTask linked-row note",
    body_markdown: "Task row display.",
    links: [{ targetType: "task", targetId: taskIds.clientProject }],
  }, session);
  const read = await notesService.read(linkedNote.note.note_id, session);
  const taskLink = read.note.links.find((link) => link.target_id === taskIds.clientProject);
  assert.equal(taskLink.label, titles.clientProject);
  assert.equal(taskLink.display_label, titles.clientProject);
  assert.equal(taskLink.secondary_label, "LCTask Acme Client | LCTask Client Project");
  assert.doesNotMatch(taskLink.secondary_label, /open|complete|archived/i, "linked task rows should not include task status suffixes");
}

async function assertFamilyTaskTargets(session) {
  const suffix = randomUUID().slice(0, 8);
  const projectId = `task-label-family-project-${suffix}`;
  const taskIds = {
    project: `task-label-family-project-task-${suffix}`,
    noProject: `task-label-family-no-project-${suffix}`,
  };
  const titles = {
    project: "LCFamily Task With Project Extended",
    noProject: "LCFamily Task No Project Extended",
  };

  await setWorkspace(session.workspace_id, "family", "LCTask Family Workspace");
  await projectsRepository.create(session.workspace_id, "", {
    id: projectId,
    name: "LCFamily Project",
    status: "Active",
    billable: "no",
  });
  await createTask(session, {
    task_id: taskIds.project,
    project_id: projectId,
    title: titles.project,
  });
  await createTask(session, {
    task_id: taskIds.noProject,
    title: titles.noProject,
  });

  const clientTargets = await notesService.listLinkTargets(session, { targetType: "client", q: "LCFamily", limit: 20 });
  assert.equal(clientTargets.targets.length, 0, "Family workspaces should not expose Client targets");

  const result = await notesService.listLinkTargets(session, { targetType: "task", q: "LCFamily", limit: 20 });
  const targets = result.targets.filter((target) => Object.values(taskIds).includes(target.targetId));

  assert.deepEqual(targets.map((target) => target.targetId), [
    taskIds.noProject,
    taskIds.project,
  ]);
  assert.deepEqual(targets.map((target) => target.displayLabel), [
    truncateTaskTitle(titles.noProject),
    `${truncateTaskTitle(titles.project)} - LCFamily Project`,
  ]);

  for (const target of targets) {
    assert.equal(target.workspaceId, session.workspace_id);
    assertCleanTaskLabel(target, target.targetId);
    assert.doesNotMatch(target.displayLabel, /LCTask Family Workspace|Client:|Task:/);
  }
}

async function createTask(session, task) {
  return tasksRepository.create(session.workspace_id, {
    client_id: "",
    project_id: "",
    description: "",
    next_action: "",
    blocked_reason: "",
    resume_note: "",
    status: "open",
    priority: "normal",
    billable: "yes",
    created_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
    ...task,
  });
}

function assertCleanTaskLabel(target, targetId) {
  assert.ok(target.displayLabel, "display label should be present");
  assert.doesNotMatch(target.displayLabel, /Task:|open|complete|archived/i, "task display label should not include type or status suffixes");
  assert.doesNotMatch(target.displayLabel, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, "display label should not expose UUIDs");
  assert.equal(target.displayLabel.includes(targetId), false, "display label should not echo the target id");
}

function truncateTaskTitle(title) {
  const text = String(title || "").trim();
  return text.length > 20 ? `${text.slice(0, 17).trimEnd()}...` : text;
}

async function setWorkspace(workspaceId, workspaceType, workspaceName) {
  await runSql(`
UPDATE workspaces
SET workspace_type = ${sqlText(workspaceType)},
    name = ${sqlText(workspaceName)}
WHERE workspace_id = ${sqlText(workspaceId)};
`);
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
    display_name: user.display_name || user.username,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: workspaceId,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
