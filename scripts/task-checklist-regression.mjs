import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-checklist-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-checklist.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Checklist-Test-Password-123!";

const { internalEventBus } = await import("../src/core/events/event-bus.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { indexTaskRecord } = await import("../src/modules/tasks/search-indexers.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

const capturedEvents = [];
const unsubscribe = [
  "task.updated",
  "task.checklist_item.checked",
  "task.checklist_item.unchecked",
].map((eventName) => internalEventBus.on(eventName, async (event) => {
  capturedEvents.push(event);
}, {
  id: `task-checklist-regression:${eventName}`,
  moduleId: "task-checklist-regression",
}));

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const noRoleSession = await createNoRoleSession(session.workspace_id);

  await assertChecklistLifecycleAndProgress(session);
  await assertChecklistDrivenStatusTransitions(session);
  await assertChecklistPermissionBoundaries(session, noRoleSession);
  await assertTaskViewDialogIncludesChecklistControls();

  console.log("Task checklist regression passed.");
} finally {
  unsubscribe.forEach((remove) => remove());
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertChecklistLifecycleAndProgress(session) {
  const task = (await tasksService.create({
    title: "Checklist parent task",
    next_action: "Work the first checklist item.",
  }, session)).task;

  const first = await tasksService.addChecklistItem(task.task_id, { label: "Gather source notes" }, session);
  const second = await tasksService.addChecklistItem(task.task_id, { label: "Draft task summary" }, session);
  const third = await tasksService.addChecklistItem(task.task_id, { label: "Review final state" }, session);

  assert.equal(third.checklistProgress.total_count, 3);
  assert.equal(third.checklistProgress.completed_count, 0);
  assert.equal(third.checklistProgress.next_incomplete_item_label, "Gather source notes");
  assert.equal(third.task.checklistItems.length, 3);
  assert.equal(third.task.resumeContext.checklist_progress.total_count, 3);

  const checked = await tasksService.checkChecklistItem(task.task_id, first.item.task_checklist_item_id, session);
  assert.equal(checked.item.is_checked, true);
  assert.equal(checked.task.status, "in_progress");
  assert.ok(checked.item.completed_at);
  assert.equal(checked.checklistProgress.completed_count, 1);
  assert.equal(checked.checklistProgress.next_incomplete_item_label, "Draft task summary");
  assert.ok(Date.parse(checked.task.last_worked_at) >= Date.parse(task.last_worked_at));

  const edited = await tasksService.updateChecklistItem(task.task_id, second.item.task_checklist_item_id, {
    label: "Draft recovery summary",
  }, session);
  assert.equal(edited.item.label, "Draft recovery summary");

  const reordered = await tasksService.reorderChecklistItems(task.task_id, {
    item_ids: [
      third.item.task_checklist_item_id,
      second.item.task_checklist_item_id,
      first.item.task_checklist_item_id,
    ],
  }, session);
  assert.deepEqual(
    reordered.items.map((item) => item.label),
    ["Review final state", "Draft recovery summary", "Gather source notes"],
  );
  assert.equal(reordered.checklistProgress.next_incomplete_item_label, "Review final state");

  const unchecked = await tasksService.uncheckChecklistItem(task.task_id, first.item.task_checklist_item_id, session);
  assert.equal(unchecked.item.is_checked, false);
  assert.equal(unchecked.task.status, "open");
  assert.equal(unchecked.item.completed_at, "");

  const removed = await tasksService.deleteChecklistItem(task.task_id, second.item.task_checklist_item_id, session);
  assert.equal(removed.checklistProgress.total_count, 2);
  assert.equal(removed.items.some((item) => item.task_checklist_item_id === second.item.task_checklist_item_id), false);

  const read = (await tasksService.read(task.task_id, session)).task;
  assert.equal(read.checklistProgress.total_count, 2);
  assert.equal(read.checklistProgress.next_incomplete_item_label, "Review final state");

  const summary = await tasksService.summary(session);
  const assigned = summary.assignedToMe.find((item) => item.task_id === task.task_id);
  assert.equal(assigned.checklistProgress.total_count, 2);
  assert.equal(assigned.resumeContext.checklist_progress.next_incomplete_item_label, "Review final state");

  const workbench = await tasksService.listWorkbenchItems(session);
  const workItem = workbench.items.find((item) => item.task_id === task.task_id);
  assert.equal(workItem.checklistProgress.total_count, 2);
  assert.equal(workItem.resumeContext.checklist_progress.total_count, 2);

  const searchDocument = await indexTaskRecord({
    workspaceId: session.workspace_id,
    recordId: task.task_id,
  });
  assert.match(searchDocument.body, /Review final state/);
  assert.doesNotMatch(searchDocument.body, /Draft recovery summary/);
}

async function assertChecklistDrivenStatusTransitions(session) {
  const task = (await tasksService.create({
    title: "Checklist status transition task",
  }, session)).task;
  const first = await tasksService.addChecklistItem(task.task_id, { label: "Start the task" }, session);
  const second = await tasksService.addChecklistItem(task.task_id, { label: "Keep the task active" }, session);

  const firstChecked = await tasksService.checkChecklistItem(task.task_id, first.item.task_checklist_item_id, session);
  assert.equal(firstChecked.task.status, "in_progress", "checking the first item should move an open task in progress");
  assert.equal(firstChecked.checklistProgress.completed_count, 1);

  const secondChecked = await tasksService.checkChecklistItem(task.task_id, second.item.task_checklist_item_id, session);
  assert.equal(secondChecked.task.status, "in_progress", "checking another item should keep the task in progress");
  assert.equal(secondChecked.checklistProgress.completed_count, 2);

  const oneUnchecked = await tasksService.uncheckChecklistItem(task.task_id, first.item.task_checklist_item_id, session);
  assert.equal(oneUnchecked.task.status, "in_progress", "unchecking one of several checked items should keep the task in progress");
  assert.equal(oneUnchecked.checklistProgress.completed_count, 1);

  const allUnchecked = await tasksService.uncheckChecklistItem(task.task_id, second.item.task_checklist_item_id, session);
  assert.equal(allUnchecked.task.status, "open", "unchecking the last checked item should reopen an in-progress task");
  assert.equal(allUnchecked.checklistProgress.completed_count, 0);

  const taskEvents = capturedEvents.filter((event) => event.record_id === task.task_id || event.metadata?.task_id === task.task_id);
  assert.ok(
    taskEvents.some((event) => event.name === "task.updated" && event.metadata?.transition === "checklist_started"),
    "checking checklist work should emit a task update transition event",
  );
  assert.ok(
    taskEvents.some((event) => event.name === "task.updated" && event.metadata?.transition === "checklist_cleared"),
    "clearing all checklist work should emit a task update transition event",
  );
  assert.ok(
    taskEvents.some((event) => event.name === "task.checklist_item.checked"),
    "checklist checked events should still be emitted",
  );
  assert.ok(
    taskEvents.some((event) => event.name === "task.checklist_item.unchecked"),
    "checklist unchecked events should still be emitted",
  );

  await assertChecklistToggleKeepsLifecycleStatus(session, "complete");
  await assertChecklistToggleKeepsLifecycleStatus(session, "archived");
  await assertChecklistToggleKeepsLifecycleStatus(session, "blocked");
}

async function assertChecklistToggleKeepsLifecycleStatus(session, status) {
  const task = (await tasksService.create({
    title: `Checklist ${status} task`,
    status,
  }, session)).task;
  const checklist = await tasksService.addChecklistItem(task.task_id, { label: `Toggle ${status} checklist` }, session);

  const checked = await tasksService.checkChecklistItem(task.task_id, checklist.item.task_checklist_item_id, session);
  assert.equal(checked.task.status, status, `${status} tasks should not change status when checklist items are checked`);

  const unchecked = await tasksService.uncheckChecklistItem(task.task_id, checklist.item.task_checklist_item_id, session);
  assert.equal(unchecked.task.status, status, `${status} tasks should not change status when checklist items are unchecked`);
}

async function assertChecklistPermissionBoundaries(session, noRoleSession) {
  const task = (await tasksService.create({
    title: "Private checklist task",
  }, session)).task;
  await tasksService.addChecklistItem(task.task_id, { label: "Visible only with task access" }, session);

  await assert.rejects(
    () => tasksService.listChecklistItems(task.task_id, noRoleSession),
    /permission/i,
  );
  await assert.rejects(
    () => tasksService.addChecklistItem(task.task_id, { label: "Should fail" }, noRoleSession),
    /permission/i,
  );
}

async function assertTaskViewDialogIncludesChecklistControls() {
  const taskDialogScript = await fs.readFile(new URL("../public/js/task-dialog.js", import.meta.url), "utf8");

  assert.match(taskDialogScript, /data-task-checklist-field/, "Tasks dialog must include checklist field markup");
  assert.match(taskDialogScript, /data-task-checklist-input/, "Tasks dialog must include checklist input markup");
  assert.match(taskDialogScript, /data-task-checklist-add/, "Tasks dialog must include checklist add control markup");
  assert.match(taskDialogScript, /data-task-checklist-list/, "Tasks dialog must include checklist list markup");
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
  ${sqlText(`task-checklist-${userId}@example.test`)},
  'Task Checklist No Role',
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
    username: `task-checklist-${userId}@example.test`,
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
