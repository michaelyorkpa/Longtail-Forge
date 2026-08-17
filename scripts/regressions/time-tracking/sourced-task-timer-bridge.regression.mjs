export const regressionMeta = Object.freeze({
  id: "time-tracking.sourced-task-timer-bridge",
  area: "time-tracking",
  tier: "integration",
  tags: ["database", "tasks", "time-tracking"],
  description: "Proves manual and sourced timer edges preserve non-billable intent across workspace types while Task Timer finalization retains authoritative duration.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("sourced-task-timer-bridge");
const { closeSqlite, db, initializeDatabase } = await import("../../../src/db/index.js");
const { createRecordId } = await import("../../../src/core/identifiers.js");
const { tasksService } = await import("../../../src/modules/tasks/index.js");
const { taskTimersService } = await import("../../../src/modules/tasks/task-timers.service.js");
const { activeTimersService, timeEntriesRepository } = await import("../../../src/modules/time-tracking/index.js");

try {
  await initializeDatabase();
  const session = await readProtectedSession();
  const projectId = await createProject(session.workspace_id);

  const manual = await activeTimersService.save("1", {
    accumulated_elapsed_seconds: 60,
    billable: false,
    description: "Boolean manual timer",
    project_id: projectId,
    timer_status: "paused",
  }, session);
  assert.equal(
    manual.timer.billable,
    "no",
    "manual Time Tracking saves must not collapse boolean false to billable yes",
  );
  await activeTimersService.remove("1", session);

  await setWorkspaceType(session.workspace_id, "personal");
  const personalTimer = await activeTimersService.save("1", {
    billable: "yes",
    description: "Personal timer",
    project_id: projectId,
    timer_status: "paused",
  }, session);
  assert.equal(personalTimer.timer.billable, "no", "Personal workspaces must force manual timers non-billable");
  await activeTimersService.remove("1", session);

  const directSource = {
    source_id: createRecordId(),
    source_label: "Boolean billable source",
    source_module_id: "tasks",
    source_type: "task",
    source_url: "tasks.html",
  };
  await setWorkspaceType(session.workspace_id, "family");
  const familySource = {
    ...directSource,
    source_id: createRecordId(),
    source_label: "Family sourced timer",
  };
  const familyTimer = await activeTimersService.saveSourced(familySource, {
    billable: true,
    project_id: projectId,
    timer_status: "paused",
  }, session);
  assert.equal(familyTimer.timer.billable, "no", "Family workspaces must force sourced timers non-billable");
  await activeTimersService.removeSourced(familySource, session);

  await setWorkspaceType(session.workspace_id, "business");
  await assert.rejects(
    () => activeTimersService.saveSourced({
      ...directSource,
      source_id: createRecordId(),
      source_label: "Invalid sourced payload",
    }, {
      billable: "sometimes",
      project_id: projectId,
      timer_status: "paused",
    }, session),
    (error) => error?.statusCode === 400 && /Billable must be/.test(error.message),
    "sourced Time Tracking saves must validate their payload at the module edge",
  );
  const sourced = await activeTimersService.saveSourced(directSource, {
    accumulated_elapsed_seconds: 120,
    billable: false,
    description: "Boolean billable source",
    project_id: projectId,
    timer_status: "paused",
  }, session);
  assert.equal(
    sourced.timer.billable,
    "no",
    "sourced Time Tracking saves must not collapse boolean false to billable yes",
  );
  assert.equal(sourced.timer.accumulated_elapsed_seconds, 120);
  await activeTimersService.removeSourced(directSource, session);

  const created = await tasksService.create({
    assignee_ids: [session.user_id],
    billable: false,
    project_id: projectId,
    status: "open",
    title: "Non-billable sourced timer",
  }, session);
  const task = created.task;
  assert.equal(task.billable, "no");

  const saved = await taskTimersService.save(task.task_id, {
    accumulated_elapsed_seconds: 300,
    timer_status: "paused",
  }, session);
  assert.equal(saved.timer.billable, "no", "Task Timer save must retain the Task's non-billable intent");
  assert.equal(saved.timer.accumulated_elapsed_seconds, 300);

  const finalized = await taskTimersService.finalize(task.task_id, {}, session);
  const entry = await timeEntriesRepository.readById(session.workspace_id, finalized.entry_id);
  assert.ok(entry, "Task Timer finalization must persist a time entry");
  assert.equal(entry.task_id, task.task_id);
  assert.equal(entry.billable, "no", "finalized sourced entries must retain non-billable intent");
  assert.equal(entry.duration_seconds, "300", "finalized sourced entries must retain authoritative active seconds");
  assert.equal(entry.duration_hours, "0.0833", "finalized sourced entries must retain the matching hours projection");

  const remainingTimer = await db.get(`
SELECT active_timer_id
FROM active_work_timers
WHERE workspace_id = :workspaceId
  AND source_module_id = 'tasks'
  AND source_type = 'task'
  AND source_id = :taskId
LIMIT 1;
`, {
    taskId: task.task_id,
    workspaceId: String(session.workspace_id),
  });
  assert.equal(remainingTimer, null, "finalized Task Timers must still remove their active sourced row");

  const integrity = await db.get("PRAGMA integrity_check;");
  assert.equal(integrity?.integrity_check, "ok");

  console.log("Sourced Task Timer bridge regression passed.");
} finally {
  await closeSqlite();
  await fixture.cleanup();
}

/** @param {string} workspaceId */
async function createProject(workspaceId) {
  const now = new Date().toISOString();
  const projectId = createRecordId();
  await db.run(`
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
  task_default_assignee_mode,
  created_at,
  updated_at
)
VALUES (
  :projectId,
  :workspaceId,
  NULL,
  NULL,
  'Sourced Timer Project',
  'Active',
  'no',
  '100',
  NULL,
  NULL,
  NULL,
  NULL,
  'normal',
  'open',
  '["due_date","priority","status"]',
  'creator',
  :createdAt,
  :updatedAt
);
`, {
    createdAt: now,
    projectId,
    updatedAt: now,
    workspaceId,
  });
  return projectId;
}

/** @param {string} workspaceId @param {string} workspaceType */
async function setWorkspaceType(workspaceId, workspaceType) {
  await db.run(`
UPDATE workspaces
SET workspace_type = :workspaceType
WHERE workspace_id = :workspaceId;
`, {
    workspaceId,
    workspaceType,
  });
}

/** @returns {Promise<import("../../../src/types/time-tracking-contracts.d.ts").TimeTrackingSession>} */
async function readProtectedSession() {
  const user = await db.get(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
ORDER BY users.user_id
LIMIT 1;
`);
  assert.ok(user?.user_id, "protected user fixture is required");
  const workspaceId = String(user.active_workspace_id || user.home_workspace_id || "");
  return {
    active_workspace_id: workspaceId,
    home_workspace_id: String(user.home_workspace_id || workspaceId),
    ip_address: "127.0.0.1",
    password_change_required: false,
    session_mode: "normal",
    timezone: String(user.timezone || "America/New_York"),
    user_id: String(user.user_id),
    username: String(user.username || ""),
    workspace_id: workspaceId,
  };
}
