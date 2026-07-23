import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-timer-status-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-timer-status.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Timer-Status-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { auditService } = await import("../src/core/audit.js");
const { taskTimersService } = await import("../src/modules/tasks/task-timers.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { timeEntriesService } = await import("../src/modules/time-tracking/time-entries.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const context = await createClientProject(session.workspace_id);

  await assertStartMovesOpenTask(session, context.projectId);
  await assertStartMovesBlockedTask(session, context.projectId);
  await assertRecurringStartAuditCarriesReadableContext(session, context);
  await assertPauseLeavesInProgress(session, context.projectId);
  await assertRemoveRevertsOnlyTimerMovedTask(session, context.projectId);
  await assertBlockedResetRestorationRules(session, context.projectId);
  await assertFinalizeLeavesInProgress(session, context.projectId);
  await assertCompletedAndArchivedTasksRejectTimers(session, context.projectId);
  await assertAuditBrowserFallback();

  console.log("Task timer status regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertRecurringStartAuditCarriesReadableContext(session, context) {
  const task = await createTask(session, context.projectId, "Recurring timer audit context", {
    recurrence: {
      enabled: true,
      endDate: "2026-07-31",
      frequency: "WEEKLY",
      interval: 1,
    },
  });

  assert.ok(task.recurrence_template_id, "audit fixture should be a recurring task instance");
  await taskTimersService.save(task.task_id, runningTimerPayload(), session);

  const audit = await readAudit(session.workspace_id, "task_timer_status_started", task.task_id);
  const metadata = JSON.parse(audit?.metadata_json || "{}");
  assert.deepEqual(
    {
      client_id: metadata.client_id,
      client_name: metadata.client_name,
      project_id: metadata.project_id,
      project_name: metadata.project_name,
    },
    {
      client_id: context.clientId,
      client_name: context.clientName,
      project_id: context.projectId,
      project_name: context.projectName,
    },
    "recurring-task timer status audit should retain readable client and project attribution",
  );

  const [byClient, byProject] = await Promise.all([
    auditService.list(session, { clientId: context.clientId, recordType: "task" }),
    auditService.list(session, { projectId: context.projectId, recordType: "task" }),
  ]);
  assert.ok(byClient.auditLogs.some((entry) => entry.audit_id === audit.audit_id), "client filtering should retain the recurring-task status audit");
  assert.ok(byProject.auditLogs.some((entry) => entry.audit_id === audit.audit_id), "project filtering should retain the recurring-task status audit");
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

async function assertStartMovesBlockedTask(session, projectId) {
  const blockedReason = "Waiting for the reviewed source package.";
  const task = await createTask(session, projectId, "Blocked timer start transition", {
    blocked_reason: blockedReason,
    status: "blocked",
  });

  const result = await taskTimersService.save(task.task_id, runningTimerPayload(), session);
  const storedTask = await readTaskLifecycle(session.workspace_id, task.task_id);
  const transition = await readTimerTransitionMetadata(session.workspace_id, session.user_id, task.task_id);

  assert.equal(result.task?.status, "in_progress", "timer start should recover a blocked task into in progress");
  assert.equal(result.task?.blocked_reason, "", "timer start response should clear the active blocked reason");
  assert.deepEqual(storedTask, { blocked_reason: "", status: "in_progress" }, "timer start should persist the authoritative cleared blocked state");
  assert.equal(transition.movedTaskToInProgress, true, "timer metadata should record that it caused the lifecycle transition");
  assert.equal(transition.movedTaskFromBlocked, true, "timer metadata should distinguish a blocked origin");
  assert.equal(transition.previousStatus, "blocked", "timer metadata should retain the prior lifecycle status");
  assert.equal(transition.previousBlockedReason, blockedReason, "timer metadata should retain the exact recoverable blocked reason");
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

async function assertBlockedResetRestorationRules(session, projectId) {
  const restorableReason = "Waiting for the client decision.";
  const restorable = await createTask(session, projectId, "Blocked timer reset restores reason", {
    blocked_reason: restorableReason,
    status: "blocked",
  });
  await taskTimersService.save(restorable.task_id, runningTimerPayload(), session);
  const restored = await taskTimersService.remove(restorable.task_id, session);

  assert.equal(restored.task?.status, "blocked", "reset should restore Blocked when the unsaved timer was the only work-start signal");
  assert.equal(restored.task?.blocked_reason, restorableReason, "reset should restore the exact prior blocked reason");
  assert.deepEqual(
    await readTaskLifecycle(session.workspace_id, restorable.task_id),
    { blocked_reason: restorableReason, status: "blocked" },
    "restored Blocked state should be authoritative in storage",
  );

  const checklistEvidence = await createTask(session, projectId, "Blocked reset keeps checklist-started work", {
    blocked_reason: "Waiting before checklist work starts.",
    status: "blocked",
  });
  const checklist = await tasksService.addChecklistItem(checklistEvidence.task_id, { label: "Record independent progress" }, session);
  await taskTimersService.save(checklistEvidence.task_id, runningTimerPayload(), session);
  await tasksService.checkChecklistItem(checklistEvidence.task_id, checklist.item.task_checklist_item_id, session);
  const checklistReset = await taskTimersService.remove(checklistEvidence.task_id, session);

  assert.equal(checklistReset.task?.status, "in_progress", "checked checklist work should prevent reset from restoring Blocked");
  assert.equal(checklistReset.task?.blocked_reason, "", "independently started work should keep the old blocked reason cleared");

  const savedTimeEvidence = await createTask(session, projectId, "Blocked reset keeps persisted-time work", {
    blocked_reason: "Waiting before earlier tracked work is reviewed.",
    status: "blocked",
  });
  await timeEntriesService.create({
    billable: "yes",
    description: "Persisted task work",
    duration_hours: "0.0167",
    duration_seconds: 60,
    end_time: "2026-07-21T16:01:00.000Z",
    project_id: projectId,
    start_time: "2026-07-21T16:00:00.000Z",
    task_id: savedTimeEvidence.task_id,
  }, session);
  await taskTimersService.save(savedTimeEvidence.task_id, runningTimerPayload(), session);
  const savedTimeReset = await taskTimersService.remove(savedTimeEvidence.task_id, session);

  assert.equal(savedTimeReset.task?.status, "in_progress", "persisted task time should prevent reset from restoring Blocked");
  assert.equal(savedTimeReset.task?.blocked_reason, "", "persisted work should keep the old blocked reason cleared");
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
    blocked_reason: overrides.blocked_reason || "",
    assignee_ids: [session.user_id],
    ...(overrides.recurrence ? {
      due_date: "2026-07-03",
      recurrence: overrides.recurrence,
    } : {}),
  }, session);

  return result.task;
}

async function createClientProject(workspaceId) {
  const now = new Date().toISOString();
  const clientId = randomUUID();
  const projectId = randomUUID();
  const clientName = "Task Timer Status Client";
  const projectName = "Task Timer Status Project";

  await runSql(`
INSERT INTO clients (
  id, workspace_id, parent_client_id, name, status, billable,
  billing_rate, billing_period_type, billing_period_start_day,
  billing_rounding_enabled, billing_rounding_increment,
  billing_contact_name, billing_contact_email,
  billing_contact_alternate_name, billing_contact_alternate_email,
  billing_contact_phone_number, billing_contact_alternate_phone_number,
  billing_contact_street_address_1, billing_contact_street_address_2,
  billing_contact_city, billing_contact_state, billing_contact_zip_code,
  created_at, updated_at
)
VALUES (
  ${sqlText(clientId)}, ${sqlText(workspaceId)}, NULL, ${sqlText(clientName)}, 'Active', 'yes',
  NULL, NULL, NULL, NULL, NULL,
  '', '', '', '', '', '', '', '', '', '', '',
  ${sqlText(now)}, ${sqlText(now)}
);
`);

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
  ${sqlText(clientId)},
  NULL,
  ${sqlText(projectName)},
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

  return { clientId, clientName, projectId, projectName };
}

async function assertAuditBrowserFallback() {
  const source = await fs.readFile(new URL("../public/js/audit-log.js", import.meta.url), "utf8");
  assert.match(
    source,
    /function getAuditContext\(log, metadata\)[\s\S]*new_value_json[\s\S]*previous_value_json[\s\S]*client_name:[\s\S]*project_name:/,
    "Audit rows should recover readable context from saved before/after values when legacy metadata omitted names",
  );
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

async function readTaskLifecycle(workspaceId, taskId) {
  const rows = await querySql(`
SELECT status, blocked_reason
FROM tasks
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_id = ${sqlText(taskId)}
LIMIT 1;
`);

  return {
    blocked_reason: rows[0]?.blocked_reason || "",
    status: rows[0]?.status || "",
  };
}

async function readTimerTransitionFlag(workspaceId, userId, taskId) {
  const metadata = await readTimerTransitionMetadata(workspaceId, userId, taskId);
  return metadata.movedTaskFromOpen === true;
}

async function readTimerTransitionMetadata(workspaceId, userId, taskId) {
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

  return metadata.taskTimerStatusTransition || {};
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

async function readAudit(workspaceId, action, taskId) {
  const rows = await querySql(`
SELECT audit_id, metadata_json
FROM audit_logs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND action = ${sqlText(action)}
  AND record_type = 'task'
  AND record_id = ${sqlText(taskId)}
ORDER BY created_at DESC
LIMIT 1;
`);

  return rows[0] || null;
}
