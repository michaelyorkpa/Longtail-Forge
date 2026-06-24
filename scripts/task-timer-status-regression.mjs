import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-timer-status-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-timer-status.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Timer-Status-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { taskTimersService } = await import("../src/modules/tasks/task-timers.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const projectId = await createProject(session.workspace_id);

  await assertStartMovesOpenTask(session, projectId);
  await assertPauseLeavesInProgress(session, projectId);
  await assertRemoveRevertsOnlyTimerMovedTask(session, projectId);
  await assertFinalizeLeavesInProgress(session, projectId);
  await assertCompletedAndArchivedTasksRejectTimers(session, projectId);

  console.log("Task timer status regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertStartMovesOpenTask(session, projectId) {
  const task = await createTask(session, projectId, "Timer start transition");

  const result = await taskTimersService.save(task.task_id, runningTimerPayload(), session);

  assert.equal(result.task?.status, "in_progress", "timer start response should include the updated task status");
  assert.equal(await readTaskStatus(session.workspace_id, task.task_id), "in_progress");
  assert.equal(
    await readTimerTransitionFlag(session.workspace_id, session.user_id, task.task_id),
    true,
    "timer should remember it moved an open task to in_progress",
  );
  assert.equal(
    await auditCount(session.workspace_id, "task_timer_status_started", task.task_id),
    1,
    "timer-start status transition should be audited distinctly",
  );
}

async function assertPauseLeavesInProgress(session, projectId) {
  const task = await createTask(session, projectId, "Timer pause transition");

  await taskTimersService.save(task.task_id, runningTimerPayload(), session);
  const result = await taskTimersService.save(task.task_id, {
    accumulated_elapsed_seconds: 10,
    timer_status: "paused",
  }, session);

  assert.equal(result.task?.status, "in_progress", "timer pause response should keep the current task status");
  assert.equal(await readTaskStatus(session.workspace_id, task.task_id), "in_progress");
}

async function assertRemoveRevertsOnlyTimerMovedTask(session, projectId) {
  const openTask = await createTask(session, projectId, "Timer remove reverts open");

  await taskTimersService.save(openTask.task_id, runningTimerPayload(), session);
  const openReset = await taskTimersService.remove(openTask.task_id, session);

  assert.equal(openReset.task?.status, "open", "timer reset response should include reverted open status");
  assert.equal(await readTaskStatus(session.workspace_id, openTask.task_id), "open");
  assert.equal(
    await auditCount(session.workspace_id, "task_timer_status_reverted", openTask.task_id),
    1,
    "timer reset should audit automatic status reversion",
  );

  const inProgressTask = await createTask(session, projectId, "Timer remove preserves in progress", {
    status: "in_progress",
  });

  await taskTimersService.save(inProgressTask.task_id, runningTimerPayload(), session);
  const inProgressReset = await taskTimersService.remove(inProgressTask.task_id, session);

  assert.equal(inProgressReset.task?.status, "in_progress", "timer reset response should preserve existing in-progress status");
  assert.equal(await readTaskStatus(session.workspace_id, inProgressTask.task_id), "in_progress");
  assert.equal(
    await auditCount(session.workspace_id, "task_timer_status_reverted", inProgressTask.task_id),
    0,
    "timer reset should not revert tasks that were already in_progress",
  );
}

async function assertFinalizeLeavesInProgress(session, projectId) {
  const task = await createTask(session, projectId, "Timer finalize transition");

  await taskTimersService.save(task.task_id, runningTimerPayload(), session);
  const result = await taskTimersService.finalize(task.task_id, {
    duration_seconds: 60,
    end_time: "2026-06-06T15:00:00.000Z",
  }, session);

  assert.equal(result.task?.status, "in_progress", "timer finalize response should include the current task status");
  assert.equal(await readTaskStatus(session.workspace_id, task.task_id), "in_progress");
  assert.equal(
    await readTaskTimerCount(session.workspace_id, session.user_id, task.task_id),
    0,
    "finalized task timer should be removed",
  );
}

async function assertCompletedAndArchivedTasksRejectTimers(session, projectId) {
  const completedTask = await createTask(session, projectId, "Completed timer rejection");
  await tasksService.complete(completedTask.task_id, session);
  await assertRejectsTaskTimer(completedTask.task_id, session);

  const archivedTask = await createTask(session, projectId, "Archived timer rejection");
  await tasksService.archive(archivedTask.task_id, session);
  await assertRejectsTaskTimer(archivedTask.task_id, session);
}

async function assertRejectsTaskTimer(taskId, session) {
  await assert.rejects(
    () => taskTimersService.save(taskId, runningTimerPayload(), session),
    /Completed or archived tasks cannot use task timers/,
  );
}

async function createTask(session, projectId, title, overrides = {}) {
  const result = await tasksService.create({
    title,
    project_id: projectId,
    status: overrides.status || "open",
    assignee_ids: [session.user_id],
  }, session);

  return result.task;
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
  'Task Timer Status Project',
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

function runningTimerPayload() {
  return {
    accumulated_elapsed_seconds: 1,
    last_active_start_time: "2026-06-06T14:00:00.000Z",
    timer_status: "running",
  };
}

async function readTaskStatus(workspaceId, taskId) {
  const rows = await querySql(`
SELECT status
FROM tasks
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_id = ${sqlText(taskId)}
LIMIT 1;
`);

  return rows[0]?.status || "";
}

async function readTimerTransitionFlag(workspaceId, userId, taskId) {
  const rows = await querySql(`
SELECT source_metadata_json
FROM active_work_timers
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND source_module_id = 'tasks'
  AND source_type = 'task'
  AND source_id = ${sqlText(taskId)}
LIMIT 1;
`);
  const metadata = JSON.parse(rows[0]?.source_metadata_json || "{}");

  return metadata.taskTimerStatusTransition?.movedTaskFromOpen === true;
}

async function readTaskTimerCount(workspaceId, userId, taskId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM active_work_timers
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND source_module_id = 'tasks'
  AND source_type = 'task'
  AND source_id = ${sqlText(taskId)};
`);

  return Number(rows[0]?.count) || 0;
}

async function auditCount(workspaceId, action, taskId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM audit_logs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND action = ${sqlText(action)}
  AND record_type = 'task'
  AND record_id = ${sqlText(taskId)};
`);

  return Number(rows[0]?.count) || 0;
}
