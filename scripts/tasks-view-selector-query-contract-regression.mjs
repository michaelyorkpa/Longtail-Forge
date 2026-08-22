import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} TasksSession */
/** @typedef {import("../src/types/task-list-engine-contracts.js").TaskListQuery} TaskListQuery */
/** @typedef {import("../src/types/task-recurrence-contracts.js").TaskRecord} TaskRecord */
/** @typedef {Awaited<ReturnType<typeof createFixtures>>} TaskViewFixtures */

const tasksScript = readText("public/js/tasks.js");
const tasksServiceSource = readText("src/modules/tasks/tasks.service.js");
const taskListEngineSource = readText("src/modules/tasks/task-list-engine.js");
const tasksView = readText("views/protected/tasks.html");

assert.match(tasksScript, /params\.set\("task_view", canonicalTaskViewValue\(taskView\)\)/, "Tasks adapter should send selected views through task_view");
assert.doesNotMatch(tasksScript, /params\.set\("quick_filter"/, "Tasks adapter should not use quick_filter for the saved task view contract");
assert.match(tasksScript, /complete:\s*"completed"/, "Tasks adapter should map the Completed dropdown option to the completed task_view");
assert.match(tasksScript, /assigneeValue === "me"[\s\S]*params\.set\("assignee", "me"\)/, "Assignee filter should combine as an advanced filter instead of replacing task_view");
assert.match(tasksScript, /data-task-reset-filters/, "Sorting and Filters should expose a reset control");
assert.match(tasksScript, /function resetAdvancedTaskFilters\(\)[\s\S]*resetAdvancedFilterControlsForTaskView\(selectedTaskView\(\)\)/, "Resetting advanced filters should preserve the selected task view");
assert.match(tasksScript, /function preserveCompatibleAdvancedFiltersForTaskView\(taskView\)[\s\S]*\["my", "unassigned"\]\.includes\(taskView\)[\s\S]*setSelectValue\(assigneeFilter, "all"\)/, "Changing task views should clear incompatible assignee filters");
assert.match(tasksScript, /const clientValue = usesClientScope\(\) \? clientFilter\?\.value \?\? "all" : "all"/, "Personal and Family task queries should not include client-only UI assumptions");
assert.match(taskListEngineSource, /function matchesTaskView\(task, taskView, currentUserId, today, currentWeekEnd, statusOverridesActiveScope\)/, "The Tasks list engine should own task_view semantics");
assert.match(taskListEngineSource, /taskView === "completed"[\s\S]*task\.status === "complete"/, "Completed view should be scoped intentionally");
assert.match(taskListEngineSource, /taskView === "archived"[\s\S]*task\.status === "archived"/, "Archived view should be scoped intentionally");
assert.match(tasksServiceSource, /function currentWeekEndKey\(dateKey\)/, "Due This Week should use a Tasks-owned user-local current-week boundary");
assert.match(tasksView, /css\/longtail-forge\.css[\s\S]*js\/tasks\.js/, "Tasks host should load the task_view query contract cache keys");

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-view-selector-query-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-view-selector-query.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-View-Selector-Query-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { tagsService } = await import("../src/services/tags.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createFixtures(session);

  await assertSavedTaskViews(session, fixtures);
  await assertAdvancedFiltersCompose(session, fixtures);

  console.log("Tasks view selector query contract regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {TasksSession} session */
async function createFixtures(session) {
  const client = (await clientsService.createClient({ name: "Task View Client" }, session)).client;
  const project = (await clientsService.createProject(client.id, { name: "Task View Project" }, session)).project;
  const tag = (await tagsService.create(session, { name: "Task View Tag" })).tag;
  const today = localDateKey(new Date(), session.timezone);
  const yesterday = addCalendarDaysKey(today, -1);
  const currentWeekEnd = currentWeekEndKey(today);
  const afterCurrentWeek = addCalendarDaysKey(currentWeekEnd, 1);

  const assigned = await createTask(session, {
    task_id: `task-view-assigned-${randomUUID()}`,
    title: "Task View assigned active",
    due_date: afterCurrentWeek,
    project_id: project.id,
  });
  const blocked = await createTask(session, {
    task_id: `task-view-blocked-${randomUUID()}`,
    title: "Task View blocked active",
    status: "blocked",
    blocked_reason: "Waiting on task view fixture context.",
    due_date: afterCurrentWeek,
    project_id: project.id,
  });
  const unassigned = await createTask(session, {
    task_id: `task-view-unassigned-${randomUUID()}`,
    title: "Task View unassigned active",
    assignee_ids: [],
    due_date: currentWeekEnd,
    project_id: project.id,
  });
  const overdue = await createTask(session, {
    task_id: `task-view-overdue-${randomUUID()}`,
    title: "Task View overdue active",
    due_date: yesterday,
    project_id: project.id,
    tagIds: [tag.tag_id],
  });
  // Identical to `overdue` in every dimension the Overdue view reads — same due
  // date, project, and assignee — so the tag is the only thing that can
  // separate them. Without this competing task the tag-composition assertion
  // below would pass just as well against a filter that ignored tags entirely.
  const overdueUntagged = await createTask(session, {
    task_id: `task-view-overdue-untagged-${randomUUID()}`,
    title: "Task View overdue active untagged",
    due_date: yesterday,
    project_id: project.id,
  });
  const todayTask = await createTask(session, {
    task_id: `task-view-today-${randomUUID()}`,
    title: "Task View today active",
    due_date: today,
    project_id: project.id,
  });
  const weekTask = await createTask(session, {
    task_id: `task-view-week-${randomUUID()}`,
    title: "Task View current week active",
    due_date: currentWeekEnd,
    project_id: project.id,
  });
  const afterWeek = await createTask(session, {
    task_id: `task-view-after-week-${randomUUID()}`,
    title: "Task View after current week active",
    due_date: afterCurrentWeek,
    project_id: project.id,
  });
  const completedSource = await createTask(session, {
    task_id: `task-view-completed-${randomUUID()}`,
    title: "Task View completed task",
    due_date: today,
    project_id: project.id,
  });
  const archivedSource = await createTask(session, {
    task_id: `task-view-archived-${randomUUID()}`,
    title: "Task View archived task",
    due_date: today,
    project_id: project.id,
  });
  const completed = (await tasksService.complete(completedSource.task_id, session)).task;
  const archived = (await tasksService.archive(archivedSource.task_id, session)).task;

  return {
    afterWeek,
    archived,
    assigned,
    blocked,
    completed,
    currentWeekEnd,
    overdue,
    overdueUntagged,
    project,
    tag,
    today,
    todayTask,
    unassigned,
    weekTask,
  };
}

/** @param {TasksSession} session @param {TaskViewFixtures} fixtures */
async function assertSavedTaskViews(session, fixtures) {
  const my = await taskIds(session, { task_view: "my", status: "active" });
  assertIncludes(my, fixtures.assigned.task_id, "My Tasks should include active tasks assigned to the current user");
  assertIncludes(my, fixtures.overdue.task_id, "My Tasks should include assigned overdue active tasks");
  assertExcludes(my, fixtures.unassigned.task_id, "My Tasks should exclude unassigned tasks");
  assertExcludes(my, fixtures.completed.task_id, "My Tasks should exclude completed tasks");
  assertExcludes(my, fixtures.archived.task_id, "My Tasks should exclude archived tasks");

  // Explicit Status = All widens past the saved view's active-only scope (all statuses).
  const all = await taskIds(session, { task_view: "all", status: "all" });
  assertIncludes(all, fixtures.assigned.task_id, "All + Status All should include active assigned tasks");
  assertIncludes(all, fixtures.unassigned.task_id, "All + Status All should include active unassigned tasks");
  assertIncludes(all, fixtures.completed.task_id, "All + Status All should include completed tasks");
  assertIncludes(all, fixtures.archived.task_id, "All + Status All should include archived tasks");

  // The default landing (All view defaults its Status control to active) stays uncluttered.
  const allActive = await taskIds(session, { task_view: "all", status: "active" });
  assertIncludes(allActive, fixtures.assigned.task_id, "All + Status Active should include active work");
  assertExcludes(allActive, fixtures.completed.task_id, "All + Status Active should exclude completed tasks");
  assertExcludes(allActive, fixtures.archived.task_id, "All + Status Active should exclude archived tasks");

  assert.deepEqual(await taskIds(session, { task_view: "unassigned", status: "active" }), [fixtures.unassigned.task_id]);
  assert.deepEqual(
    [...await taskIds(session, { task_view: "overdue", status: "active" })].sort(),
    [fixtures.overdue.task_id, fixtures.overdueUntagged.task_id].sort(),
    "Overdue should return every overdue active task regardless of tag",
  );

  const today = await taskIds(session, { task_view: "today", status: "active" });
  assertIncludes(today, fixtures.todayTask.task_id, "Due Today should include active tasks due on the current local date");
  assertExcludes(today, fixtures.overdue.task_id, "Due Today should exclude earlier local dates");
  assertExcludes(today, fixtures.completed.task_id, "Due Today should exclude completed tasks");

  const week = await taskIds(session, { task_view: "week", status: "active" });
  assertIncludes(week, fixtures.todayTask.task_id, "Due This Week should include today's active tasks");
  assertIncludes(week, fixtures.weekTask.task_id, "Due This Week should include tasks through the current week end");
  assertExcludes(week, fixtures.overdue.task_id, "Due This Week should start at today");
  assertExcludes(week, fixtures.afterWeek.task_id, "Due This Week should stop at the current week end");

  assert.deepEqual(await taskIds(session, { task_view: "completed", status: "all" }), [fixtures.completed.task_id]);
  assert.deepEqual(await taskIds(session, { task_view: "archived", status: "all" }), [fixtures.archived.task_id]);
}

/** @param {TasksSession} session @param {TaskViewFixtures} fixtures */
async function assertAdvancedFiltersCompose(session, fixtures) {
  assert.deepEqual(
    await taskIds(session, {
      task_view: "all",
      status: "blocked",
      project_id: fixtures.project.id,
    }),
    [fixtures.blocked.task_id],
    "Advanced status/project filters should narrow the selected All view",
  );

  // The Overdue view holds two otherwise-equivalent tasks, so this exact result
  // proves both halves of the composition at once: the tagged task survives and
  // the untagged one is removed. A filter that ignored `tags` would return both
  // and fail here, which is what makes the assertion load-bearing.
  const taggedOverdue = await taskIds(session, {
    task_view: "overdue",
    status: "active",
    tags: [fixtures.tag.tag_id],
  });
  assert.deepEqual(
    taggedOverdue,
    [fixtures.overdue.task_id],
    "Advanced tag filters should combine with the selected Overdue view",
  );
  assertExcludes(
    taggedOverdue,
    fixtures.overdueUntagged.task_id,
    "An advanced tag filter should drop the equally overdue task that does not carry the tag",
  );

  assert.deepEqual(
    await taskIds(session, {
      task_view: "all",
      status: "active",
      assignee: "unassigned",
    }),
    [fixtures.unassigned.task_id],
    "Advanced assignee filters should narrow the selected All view without replacing it",
  );

  assert.deepEqual(
    await taskIds(session, {
      task_view: "my",
      status: "active",
      assignee: "unassigned",
    }),
    [],
    "Incompatible advanced filters should not broaden or replace the selected My Tasks view",
  );

  assert.deepEqual(
    await taskIds(session, {
      task_view: "completed",
      status: "active",
    }),
    [],
    "An incompatible status filter should narrow Completed to no results instead of leaking active tasks",
  );
}

/** @param {TasksSession} session @param {Partial<TaskRecord> & { title: string, assignee_ids?: string[], tagIds?: string[] }} payload @returns {Promise<TaskRecord>} */
async function createTask(session, payload) {
  return (await tasksService.create(payload, session)).task;
}

/** @param {TasksSession} session @param {TaskListQuery} query @returns {Promise<string[]>} */
async function taskIds(session, query) {
  const result = await tasksService.list(session, query);
  return result.tasks.map((task) => task.task_id);
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  return workspaceSessionFixture(requireFirstRow(rows, "fresh database should seed a protected super admin"));
}

/** @param {readonly string[]} ids @param {string} id @param {string} message */
function assertIncludes(ids, id, message) {
  assert.ok(ids.includes(id), message);
}

/** @param {readonly string[]} ids @param {string} id @param {string} message */
function assertExcludes(ids, id, message) {
  assert.equal(ids.includes(id), false, message);
}

/** @param {Date} date @param {string} [timezone] @returns {string} */
function localDateKey(date, timezone = "America/New_York") {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** @param {string} dateKey @returns {string} */
function currentWeekEndKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const daysUntilSaturday = (6 - date.getUTCDay() + 7) % 7;
  return addCalendarDaysKey(dateKey, daysUntilSaturday);
}

/** @param {string} dateKey @param {number} days @returns {string} */
function addCalendarDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
