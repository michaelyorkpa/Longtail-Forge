import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-qol-closeout-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-qol-closeout.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-QoL-Closeout-Test-Password-123!";

const { internalEventBus } = await import("../src/core/events/event-bus.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { indexTaskRecord } = await import("../src/modules/tasks/search-indexers.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { workbenchService } = await import("../src/services/workbench.service.js");

const capturedEvents = [];
const unsubscribe = [
  "task.created",
  "task.updated",
  "task.completed",
  "task.archived",
  "task.checklist_item.created",
  "task.relationship.created",
].map((eventName) => internalEventBus.on(eventName, async (event) => {
  capturedEvents.push(event);
}, {
  id: `task-qol-closeout:${eventName}`,
  moduleId: "task-qol-closeout",
}));

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const noRoleSession = await createNoRoleSession(session.workspace_id);

  await assertResumeSafeTaskSurface(session, noRoleSession);
  await assertTasksHelpAndDocsAreCurrent();

  console.log("Task QoL closeout regression passed.");
} finally {
  unsubscribe.forEach((remove) => remove());
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertResumeSafeTaskSurface(session, noRoleSession) {
  const parent = (await tasksService.create({
    title: "Closeout parent task",
    description: "Detailed private implementation note that should not become the resume summary.",
    next_action: "Review the closeout evidence.",
    resume_note: "Regression setup paused after creating the task.",
    due_date: "2026-06-15",
  }, session)).task;
  const child = (await tasksService.create({
    title: "Closeout blocker child task",
    next_action: "Clear the blocker.",
  }, session)).task;

  await tasksService.addChecklistItem(parent.task_id, { label: "Collect verification evidence" }, session);
  await tasksService.addChildTask(parent.task_id, {
    child_task_id: child.task_id,
    is_blocking: true,
  }, session);

  const read = (await tasksService.read(parent.task_id, session)).task;
  assert.equal(read.status, "blocked");
  assert.equal(read.next_action, "Review the closeout evidence.");
  assert.match(read.blocked_reason, /Blocked by incomplete child task/);
  assert.equal(read.resume_note, "Regression setup paused after creating the task.");
  assert.equal(read.checklistProgress.total_count, 1);
  assert.equal(read.relationshipSummary.incomplete_blocking_child_count, 1);
  assert.equal(read.resumeContext.active_candidate, true);
  assert.equal(read.resumeContext.blocked_reason, read.blocked_reason);
  assert.equal(read.resumeContext.checklist_progress.total_count, 1);
  assert.equal(read.resumeContext.relationship_summary.incomplete_blocking_child_count, 1);

  const summary = await tasksService.summary(session);
  const summarized = summary.assignedToMe.find((item) => item.task_id === parent.task_id);
  assert.ok(summarized, "active assigned task should appear in task summaries");
  assert.equal(summarized.next_action, "Review the closeout evidence.");
  assert.equal(summarized.resumeContext.active_candidate, true);
  assert.equal(summarized.relationshipSummary.incomplete_blocking_child_count, 1);

  const workbench = await workbenchService.listTaskWorkItems(session);
  const workItem = workbench.items.find((item) => item.task_id === parent.task_id);
  assert.ok(workItem, "active task should appear in Workbench task items");
  assert.equal(workItem.next_action, "Review the closeout evidence.");
  assert.equal(workItem.resumeContext.active_candidate, true);
  assert.equal(workItem.relationshipSummary.incomplete_blocking_child_count, 1);

  const tasksModule = modulesService.getModule("tasks");
  const taskSearchDeclaration = tasksModule.searchableTypes.find((type) => type.recordType === "task");
  assert.equal(taskSearchDeclaration.requiredReadPermission, "tasks.view");

  const searchDocument = await indexTaskRecord({
    workspaceId: session.workspace_id,
    recordId: parent.task_id,
  });
  assert.equal(searchDocument.summary, "Review the closeout evidence.");
  assert.match(searchDocument.body, /Blocked by incomplete child task/);
  assert.match(searchDocument.body, /Collect verification evidence/);

  const taskEvents = capturedEvents.filter((event) => event.record_id === parent.task_id || event.metadata?.task_id === parent.task_id);
  assert.ok(taskEvents.some((event) => event.name === "task.created"), "task create event should be emitted");
  assert.ok(taskEvents.some((event) => event.name === "task.updated"), "parent block update event should be emitted");
  assert.ok(taskEvents.some((event) => event.name === "task.checklist_item.created"), "checklist progress event should be emitted");
  assert.ok(capturedEvents.some((event) =>
    event.name === "task.relationship.created" &&
    event.metadata?.parent_task_id === parent.task_id &&
    event.metadata?.relationship_summary?.incomplete_blocking_child_count === 1,
  ), "relationship event should include parent blocking summary metadata");

  const updateEvent = taskEvents.find((event) => event.name === "task.updated" && event.metadata?.resume_context);
  assert.ok(updateEvent, "task update event should include resume-safe metadata");
  assert.equal(updateEvent.metadata.next_action, "Review the closeout evidence.");
  assert.equal(updateEvent.metadata.resume_context.active_candidate, true);
  assert.equal(updateEvent.metadata.checklist_progress.total_count, 1);
  assert.equal(updateEvent.metadata.relationship_summary.incomplete_blocking_child_count, 1);

  await assert.rejects(
    () => tasksService.read(parent.task_id, noRoleSession),
    /permission/i,
    "users without task read access must not receive resume-safe task context",
  );
  const restrictedSummary = await tasksService.summary(noRoleSession);
  assert.equal(restrictedSummary.counts.active, 0);
  const restrictedWorkbench = await workbenchService.listTaskWorkItems(noRoleSession);
  assert.equal(restrictedWorkbench.items.length, 0);

  const completed = (await tasksService.complete(child.task_id, session)).task;
  assert.equal(completed.resumeContext.active_candidate, false);
  const archived = (await tasksService.archive(completed.task_id, session)).task;
  assert.equal(archived.resumeContext.active_candidate, false);
}

async function assertTasksHelpAndDocsAreCurrent() {
  const tasksModule = modulesService.getModule("tasks");
  assert.equal(tasksModule.version, "0.33.5.2.2");
  assert.ok(tasksModule.help?.articles?.some((article) => article.id === "tasks.resume-context"));

  const docs = await fs.readFile(new URL("../docs/tasks-module.md", import.meta.url), "utf8");
  assert.match(docs, /resume-safe context/i);
  assert.match(docs, /global resume-state service/i);
  assert.match(docs, /Tasks do not expose a task delete workflow/i);
}

async function createNoRoleSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();

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
  ${sqlText(`task-qol-closeout-${userId}@example.test`)},
  'Task QoL Closeout No Role',
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
    username: `task-qol-closeout-${userId}@example.test`,
    workspace_id: workspaceId,
  };
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "fresh database should seed a protected super admin");

  return {
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}
