import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-timer-resume-metadata-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-timer-resume-metadata.db");
process.env.SUPER_ADMIN_PASSWORD = "Timer-Resume-Metadata-Test-Password-123!";

const { internalEventBus } = await import("../src/core/events/event-bus.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { activeTimersService } = await import("../src/modules/time-tracking/active-timers.service.js");
const { taskTimersService } = await import("../src/modules/tasks/task-timers.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");

try {
  await initializeDatabase();
  internalEventBus.reset();
  const session = await readSeedSession();
  const projectId = await createProject(session.workspace_id);
  const task = await createTask(session, projectId);
  const receivedEvents = captureTimerEvents();

  await assertManualTimerPayloadAndEvents(session, projectId, receivedEvents);
  await assertTaskTimerResumeContext(session, task, receivedEvents);
  await assertInaccessibleSourceDetailsAreHidden(session, task);
  await assertTimeTrackingEventTypesRegistered();

  console.log("Timer resume metadata regression passed.");
} finally {
  internalEventBus.reset();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertManualTimerPayloadAndEvents(session, projectId, receivedEvents) {
  const started = await activeTimersService.save("1", {
    accumulated_elapsed_seconds: 0,
    description: "Manual resume timer",
    last_active_start_time: "2026-06-12T12:00:00.000Z",
    project_id: projectId,
    timer_status: "running",
  }, session);

  assert.equal(started.timer.resumeContext.sourceType, "manual");
  assert.equal(started.timer.resumeContext.timerStatus, "running");
  assert.equal(started.timer.resumeContext.projectId, projectId);
  assert.equal(started.timer.resumeContext.lastActiveStartTime, "2026-06-12T12:00:00.000Z");
  assert.equal(started.timer.resumeContext.accumulatedElapsedSeconds, 0);

  await activeTimersService.updateStatus("1", {
    accumulated_elapsed_seconds: 30,
    timer_status: "paused",
  }, session);
  await activeTimersService.finalize("1", {
    project_id: projectId,
  }, session);

  assert.ok(receivedEvents.some((event) => event.name === "timer.started"));
  assert.ok(receivedEvents.some((event) => event.name === "timer.paused"));
  assert.ok(receivedEvents.some((event) => event.name === "timer.finalized"));
  assert.ok(receivedEvents.every((event) => !Object.hasOwn(event.metadata || {}, "source_metadata_json")));
  assert.ok(receivedEvents.every((event) => !Object.hasOwn(event.metadata || {}, "sourceMetadata")));
}

async function assertTaskTimerResumeContext(session, task, receivedEvents) {
  const result = await taskTimersService.save(task.task_id, {
    accumulated_elapsed_seconds: 45,
    last_active_start_time: "2026-06-12T13:00:00.000Z",
    timer_status: "running",
  }, session);

  assert.equal(result.timer.resumeContext.sourceModuleId, "tasks");
  assert.equal(result.timer.resumeContext.sourceType, "task");
  assert.equal(result.timer.resumeContext.sourceId, task.task_id);
  assert.equal(result.timer.resumeContext.sourceLabel, task.title);
  assert.equal(result.timer.resumeContext.sourceUrl, `tasks.html?task=${encodeURIComponent(task.task_id)}`);
  assert.equal(result.timer.resumeContext.clientId, "");
  assert.equal(result.timer.resumeContext.projectId, task.project_id);
  assert.equal(result.timer.resumeContext.timerStatus, "running");

  const list = await activeTimersService.listAll(session);
  const listedTaskTimer = list.timers.find((timer) => timer.source_id === task.task_id);

  assert.equal(listedTaskTimer.resumeContext.sourceLabel, task.title);
  assert.equal(listedTaskTimer.resumeContext.accumulatedElapsedSeconds, 45);

  await taskTimersService.remove(task.task_id, session);
  assert.ok(receivedEvents.some((event) => (
    event.name === "timer.discarded" &&
    event.metadata.source_id === task.task_id &&
    event.metadata.source_label === task.title
  )));
}

async function assertInaccessibleSourceDetailsAreHidden(session, task) {
  const noRoleSession = await createNoRoleSession(session.workspace_id);
  const result = await activeTimersService.saveSourced({
    source_id: task.task_id,
    source_label: task.title,
    source_module_id: "tasks",
    source_type: "task",
    source_url: `tasks.html?task=${encodeURIComponent(task.task_id)}`,
  }, {
    accumulated_elapsed_seconds: 15,
    last_active_start_time: "2026-06-12T14:00:00.000Z",
    project_id: task.project_id,
    timer_status: "paused",
  }, noRoleSession);

  assert.equal(result.timer.source_label, "");
  assert.equal(result.timer.source_url, "");

  const list = await activeTimersService.listAll(noRoleSession);
  const listedTaskTimer = list.timers.find((timer) => timer.source_id === task.task_id);

  assert.ok(listedTaskTimer, "inaccessible-source timer should remain listed for recovery");
  assert.equal(listedTaskTimer.source_label, "");
  assert.equal(listedTaskTimer.source_url, "");
  assert.equal(listedTaskTimer.resumeContext.sourceLabel, "");
  assert.equal(listedTaskTimer.resumeContext.sourceUrl, "");
  assert.equal(listedTaskTimer.resumeContext.sourceModuleId, "tasks");
  assert.equal(listedTaskTimer.resumeContext.sourceType, "task");
  assert.equal(listedTaskTimer.resumeContext.sourceId, task.task_id);
}

async function assertTimeTrackingEventTypesRegistered() {
  const eventTypes = modulesService.listModuleEventTypes()
    .filter((eventType) => eventType.moduleId === "time-tracking")
    .map((eventType) => eventType.event)
    .sort();

  assert.deepEqual(eventTypes, [
    "timer.discarded",
    "timer.finalized",
    "timer.paused",
    "timer.started",
    "timer.still_running",
  ]);
}

function captureTimerEvents() {
  const receivedEvents = [];

  for (const eventName of ["timer.started", "timer.paused", "timer.finalized", "timer.discarded"]) {
    internalEventBus.on(eventName, async (event) => {
      receivedEvents.push(event);
    }, {
      id: `timer-resume-metadata:${eventName}`,
      moduleId: "timer-resume-metadata-regression",
    });
  }

  return receivedEvents;
}

async function createTask(session, projectId) {
  const result = await tasksService.create({
    assignee_ids: [session.user_id],
    project_id: projectId,
    title: "Resume-safe task timer",
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
  task_default_assignee_mode,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(projectId)},
  ${sqlText(workspaceId)},
  NULL,
  NULL,
  'Timer Resume Metadata Project',
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
  'creator',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return projectId;
}

async function createNoRoleSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();
  const username = `timer-resume-no-role-${userId}@example.test`;

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
  ${sqlText(username)},
  'Timer Resume No Role',
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
    username,
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
