import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-canonical-query-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-canonical-query.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Canonical-Query-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { taskTimersService } = await import("../src/modules/tasks/task-timers.service.js");
const { tagsService } = await import("../src/services/tags.service.js");
const { workbenchService } = await import("../src/services/workbench.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createFixtures(session);

  await assertCanonicalFilters(session, fixtures);
  await assertCanonicalSorts(session, fixtures);
  await assertWorkItemSummaryPayload(session, fixtures);
  await assertPermissionFiltering(session);

  console.log("Task canonical query regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function createFixtures(session) {
  const client = (await clientsService.createClient({ name: "Canonical Query Client" }, session)).client;
  const project = (await clientsService.createProject(client.id, { name: "Canonical Query Project" }, session)).project;
  const tag = await tagsService.create(session, { name: "Canonical Query" });
  const now = new Date();
  const yesterday = dateKey(addDays(now, -1));
  const today = dateKey(now);
  const nextWeek = dateKey(addDays(now, 5));

  const overdue = (await tasksService.create({
    title: "Canonical overdue task",
    description: "This description should become a concise work item excerpt.",
    next_action: "Handle the overdue task.",
    resume_note: "Paused at canonical query setup.",
    due_date: yesterday,
    priority: "urgent",
    project_id: project.id,
    tagIds: [tag.tag_id],
  }, session)).task;
  const todayTask = (await tasksService.create({
    title: "Canonical today task",
    due_date: today,
    priority: "normal",
    project_id: project.id,
  }, session)).task;
  const unassigned = (await tasksService.create({
    title: "Canonical unassigned task",
    due_date: nextWeek,
    priority: "low",
    project_id: project.id,
    assignee_ids: [],
  }, session)).task;
  const blocked = (await tasksService.update(todayTask.task_id, {
    ...todayTask,
    status: "blocked",
    blocked_reason: "Waiting on canonical query evidence.",
  }, session)).task;
  const complete = (await tasksService.complete(unassigned.task_id, session)).task;
  await taskTimersService.save(overdue.task_id, {
    timer_status: "running",
    accumulated_elapsed_seconds: 90,
    last_active_start_time: new Date().toISOString(),
  }, session);

  return {
    blocked,
    complete,
    overdue,
    project,
    tag,
  };
}

async function assertCanonicalFilters(session, fixtures) {
  const assigned = await tasksService.list(session, { quickFilter: "assigned_to_me" });
  assert.ok(assigned.tasks.some((task) => task.task_id === fixtures.overdue.task_id), "assigned-to-me filter should include assigned tasks");
  assert.ok(!assigned.tasks.some((task) => task.task_id === fixtures.complete.task_id), "assigned-to-me filter should not bypass active status when caller requests active");

  const unassigned = await tasksService.list(session, { quickFilter: "unassigned" });
  assert.ok(unassigned.tasks.some((task) => task.task_id === fixtures.complete.task_id), "unassigned filter should preserve list compatibility for history tasks");

  const overdue = await tasksService.list(session, { due: "overdue", status: "active" });
  assert.deepEqual(overdue.tasks.map((task) => task.task_id), [fixtures.overdue.task_id]);

  const blocked = await tasksService.list(session, { quickFilter: "blocked", status: "active" });
  assert.deepEqual(blocked.tasks.map((task) => task.task_id), [fixtures.blocked.task_id]);

  const project = await tasksService.list(session, { project_id: fixtures.project.id, status: "active" });
  assert.ok(project.tasks.every((task) => task.project_id === fixtures.project.id));

  const tagged = await tasksService.list(session, { tags: [fixtures.tag.tag_id], status: "active" });
  assert.ok(tagged.tasks.some((task) => task.task_id === fixtures.overdue.task_id), "tag filter should include the directly tagged task");

  const timer = await tasksService.list(session, { timer_status: "running", status: "active" });
  assert.deepEqual(timer.tasks.map((task) => task.task_id), [fixtures.overdue.task_id]);
}

async function assertCanonicalSorts(session, fixtures) {
  const priority = await tasksService.list(session, { status: "active", sort: "priority" });
  assert.equal(priority.tasks[0].task_id, fixtures.overdue.task_id);

  const due = await tasksService.list(session, { status: "active", sort: "due_at" });
  assert.equal(due.tasks[0].task_id, fixtures.overdue.task_id);

  const context = await tasksService.list(session, { status: "active", sort: "context" });
  assert.ok(context.tasks.length >= 2, "context sort should return deterministic readable tasks");
  assert.deepEqual(
    context.tasks.map((task) => task.task_id),
    [...context.tasks].sort((left, right) =>
      String(left.client_name || "").localeCompare(String(right.client_name || "")) ||
      String(left.project_name || "").localeCompare(String(right.project_name || "")) ||
      String(left.title || "").localeCompare(String(right.title || "")) ||
      String(left.created_at || "").localeCompare(String(right.created_at || "")) ||
      String(left.task_id || "").localeCompare(String(right.task_id || "")),
    ).map((task) => task.task_id),
  );
}

async function assertWorkItemSummaryPayload(session, fixtures) {
  const result = await tasksService.listWorkItems(session, { status: "active", sort: "priority" });
  const item = result.items.find((candidate) => candidate.task_id === fixtures.overdue.task_id);
  assert.ok(item, "canonical work-item list should include active readable task");
  assert.equal(item.source_module_id, "tasks");
  assert.equal(item.source_type, "task");
  assert.equal(item.source_id, fixtures.overdue.task_id);
  assert.equal(item.source_url, `tasks.html?task=${encodeURIComponent(fixtures.overdue.task_id)}`);
  assert.equal(item.title, "Canonical overdue task");
  assert.equal(item.description_excerpt, "This description should become a concise work item excerpt.");
  assert.equal(item.assigned_to_current_user, true);
  assert.equal(item.next_action, "Handle the overdue task.");
  assert.equal(item.resume_note, "Paused at canonical query setup.");
  assert.equal(item.timer_status, "running");
  assert.equal(item.elapsed_seconds, 90);
  assert.equal(item.active_candidate, true);
  assert.equal(item.resume_context.active_candidate, true);
  assert.equal(item.checklist_progress.total_count, 0);
  assert.equal(item.project_id, fixtures.project.id);

  const complete = (await tasksService.listWorkItems(session, { status: "history" })).items.find((candidate) =>
    candidate.task_id === fixtures.complete.task_id
  );
  assert.equal(complete.active_candidate, false);

  const workbench = await workbenchService.listTaskWorkItems(session);
  const workbenchItem = workbench.items.find((candidate) => candidate.task_id === fixtures.overdue.task_id);
  assert.equal(workbenchItem.description_excerpt, item.description_excerpt);
  assert.equal(workbenchItem.resume_context.active_candidate, true);
}

async function assertPermissionFiltering(session) {
  const noRoleSession = await createNoRoleSession(session.workspace_id);
  const result = await tasksService.list(noRoleSession, { status: "active" });
  const workItems = await tasksService.listWorkItems(noRoleSession);
  const workbench = await workbenchService.listTaskWorkItems(noRoleSession);

  assert.equal(result.tasks.length, 0, "canonical list should filter unreadable tasks before shaping");
  assert.equal(workItems.items.length, 0, "canonical work items should not expose unreadable task context");
  assert.equal(workbench.items.length, 0, "Workbench should consume permission-filtered canonical task work items");
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
  ${sqlText(`task-canonical-no-role-${userId}@example.test`)},
  'Task Canonical No Role',
  'unused',
  'active',
  'no',
  ${sqlText(workspaceId)}
);
`);

  await runSql(`
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
    username: `task-canonical-no-role-${userId}@example.test`,
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

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}
