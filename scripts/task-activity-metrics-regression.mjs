import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-activity-metrics-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-activity-metrics.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Activity-Metrics-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { taskTimersService } = await import("../src/modules/tasks/task-timers.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { workbenchService } = await import("../src/services/workbench.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const projectId = await createProject(session.workspace_id);

  await assertTaskEditsExposeLastWorkedAt(session);
  await assertCompletionMetricsAreReusable(session);
  await assertTimerLifecycleUpdatesLastWorkedAt(session, projectId);
  await assertLinkedContextEventsUpdateLastWorkedAt(session);

  console.log("Task activity metrics regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertTaskEditsExposeLastWorkedAt(session) {
  const created = (await tasksService.create({
    title: "Activity timestamp task",
    next_action: "Capture the latest status.",
  }, session)).task;

  assert.ok(created.last_worked_at, "created task should expose last_worked_at");
  assert.equal(created.resumeContext.last_worked_at, created.last_worked_at);

  await waitForClockTick();
  const updated = (await tasksService.update(created.task_id, {
    title: "Activity timestamp task",
    next_action: "Write the latest status.",
  }, session)).task;

  assert.ok(
    Date.parse(updated.last_worked_at) >= Date.parse(created.last_worked_at),
    "task edit should refresh last_worked_at",
  );

  const workbench = await workbenchService.listTaskWorkItems(session);
  const item = workbench.items.find((candidate) => candidate.task_id === updated.task_id);
  assert.equal(item.last_worked_at, updated.last_worked_at);
}

async function assertCompletionMetricsAreReusable(session) {
  const task = (await tasksService.create({
    title: "Completion metrics task",
  }, session)).task;
  const createdAt = "2026-01-01T00:00:00.000Z";

  await runSql(`
UPDATE tasks
SET created_at = ${sqlText(createdAt)},
    last_worked_at = ${sqlText(createdAt)}
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND task_id = ${sqlText(task.task_id)};
`);

  const completed = (await tasksService.complete(task.task_id, session)).task;

  assert.equal(completed.completionMetrics.created_at, createdAt);
  assert.equal(completed.completionMetrics.completed_at, completed.completed_at);
  assert.ok(completed.completionMetrics.duration_seconds > 0);
  assert.ok(completed.completionMetrics.duration_label);
  assert.equal(completed.resumeContext.active_candidate, false);
  assert.equal(completed.resumeContext.completion_metrics.duration_seconds, completed.completionMetrics.duration_seconds);

  const archived = (await tasksService.archive(task.task_id, session)).task;
  assert.equal(archived.status, "archived");
  assert.equal(archived.completionMetrics.duration_seconds, completed.completionMetrics.duration_seconds);

  const summary = await tasksService.summary(session);
  assert.ok(
    summary.counts.completed >= 0,
    "summary should remain readable after completed task is archived",
  );
}

async function assertTimerLifecycleUpdatesLastWorkedAt(session, projectId) {
  const task = (await tasksService.create({
    title: "Timer activity task",
    project_id: projectId,
    assignee_ids: [session.user_id],
  }, session)).task;
  const initialWorkedAt = task.last_worked_at;

  await waitForClockTick();
  await taskTimersService.save(task.task_id, runningTimerPayload(), session);
  const afterStart = (await tasksService.read(task.task_id, session)).task;
  assert.ok(Date.parse(afterStart.last_worked_at) >= Date.parse(initialWorkedAt));

  await waitForClockTick();
  await taskTimersService.save(task.task_id, {
    accumulated_elapsed_seconds: 15,
    timer_status: "paused",
  }, session);
  const afterPause = (await tasksService.read(task.task_id, session)).task;
  assert.ok(Date.parse(afterPause.last_worked_at) >= Date.parse(afterStart.last_worked_at));

  await waitForClockTick();
  await taskTimersService.finalize(task.task_id, {
    duration_seconds: 60,
    end_time: "2026-06-11T18:00:00.000Z",
  }, session);
  const afterFinalize = (await tasksService.read(task.task_id, session)).task;
  assert.ok(Date.parse(afterFinalize.last_worked_at) >= Date.parse(afterPause.last_worked_at));
}

async function assertLinkedContextEventsUpdateLastWorkedAt(session) {
  const task = (await tasksService.create({
    title: "Linked context activity task",
  }, session)).task;

  await waitForClockTick();
  await modulesService.emitInternalEvent("note.updated", {
    session,
    moduleId: "notes",
    recordType: "note",
    recordId: "activity-note",
    metadata: {
      task_id: task.task_id,
    },
  });
  const afterNote = (await tasksService.read(task.task_id, session)).task;
  assert.ok(Date.parse(afterNote.last_worked_at) >= Date.parse(task.last_worked_at));

  await waitForClockTick();
  await modulesService.emitInternalEvent("file.attachment.created", {
    session,
    moduleId: "tasks",
    recordType: "task",
    recordId: task.task_id,
    metadata: {
      module_id: "tasks",
      target_type: "task",
      target_id: task.task_id,
    },
  });
  const afterFile = (await tasksService.read(task.task_id, session)).task;
  assert.ok(Date.parse(afterFile.last_worked_at) >= Date.parse(afterNote.last_worked_at));
}

async function createProject(workspaceId) {
  const now = new Date().toISOString();
  const projectId = randomUUID();

  await runSql(`
INSERT INTO projects (
  id,
  workspace_id,
  client_id,
  parent_project_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  task_default_priority,
  task_default_status,
  task_default_sort_order_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(projectId)},
  ${sqlText(workspaceId)},
  NULL,
  NULL,
  'Task Activity Metrics Project',
  'Active',
  'yes',
  '100',
  NULL,
  NULL,
  NULL,
  NULL,
  'normal',
  'open',
  '["due_date","priority","status"]',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return projectId;
}

function runningTimerPayload() {
  return {
    accumulated_elapsed_seconds: 1,
    last_active_start_time: "2026-06-11T17:00:00.000Z",
    timer_status: "running",
  };
}

async function waitForClockTick() {
  await new Promise((resolve) => {
    setTimeout(resolve, 15);
  });
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
