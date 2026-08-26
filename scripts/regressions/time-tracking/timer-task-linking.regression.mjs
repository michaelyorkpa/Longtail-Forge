export const regressionMeta = Object.freeze({
  id: "time-tracking.timer-task-linking",
  area: "time-tracking",
  tier: "integration",
  tags: ["database", "permissions", "tasks", "timers"],
  description: "Proves a running manual timer can become a permission-safe Task Timer without losing elapsed-time identity or final time-entry attribution.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireJsonRecord } from "../../test-support/json-record-assertions.mjs";
import { requireRow } from "../../test-support/database-row-assertions.mjs";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";

/** @typedef {import("../../../src/types/http-contracts.js").WorkspaceRequestSession} TimeTrackingSession */

import { createProjectTextReader, extractClassMethodBlock, extractFunctionSpan } from "../../test-support/source-scan.mjs";
const { readTextAsync: readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-timer-task-linking-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-timer-task-linking.db");
process.env.SUPER_ADMIN_PASSWORD = "Timer-Task-Linking-Test-Password-123!";

const activeTimersServiceSource = await readText("src/modules/time-tracking/active-timers.service.js");
const activeTimersRepoSource = await readText("src/modules/time-tracking/active-timers.repo.js");
const taskTimersServiceSource = await readText("src/modules/tasks/task-timers.service.js");
const tasksRoutesSource = await readText("src/modules/tasks/tasks.routes.js");
const stopwatchSource = await readText("public/js/stop-watch.js");
const timeTrackerView = await readText("views/protected/time-tracker.html");
const css = await readText("public/css/longtail-forge.css");
const timeTrackingDocs = await readText("docs/time-tracking-module.md");
const tasksDocs = await readText("docs/tasks-module.md");
const timerHelp = await readText("help/modules/time-tracking/timers-and-saved-duration.md");

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../../../src/db/index.js");
const { activeTimersRepository } = await import("../../../src/modules/time-tracking/active-timers.repo.js");
const { activeTimersService } = await import("../../../src/modules/time-tracking/active-timers.service.js");
const { taskTimersService } = await import("../../../src/modules/tasks/task-timers.service.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");

try {
  assertStaticContract();
  await initializeDatabase();
  const session = await readSeedSession();
  const projectId = await createProject(session.workspace_id);

  await assertRunningManualTimerLinksAndFinalizes(session, projectId);
  await assertPausedManualTimerStaysManual(session, projectId);
  await assertExistingTaskTimerRejectsLink(session, projectId);
  await assertPermissionDeniedLinkStaysManual(session, projectId);
  await assertIntegrity();

  console.log("Timer task-linking regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.match(tasksRoutesSource, /post\("\/tasks\/:taskId\/timer\/link"[\s\S]*taskTimersService\.linkManualTimer/, "Tasks should expose the canonical manual-to-task timer link route");
  assert.match(extractFunctionSpan(taskTimersServiceSource, "linkManualTimer"), /readEligibleTask[\s\S]*assertTaskTimersEnabled[\s\S]*assertCanUseTaskTimer[\s\S]*transitionTaskToInProgressForTimerStart[\s\S]*convertManualToSourced[\s\S]*task_timer_linked/, "Tasks should own link eligibility, status, conversion, audit, and worked-state side effects");
  assert.match(extractFunctionSpan(activeTimersServiceSource, "convertManualToSourced"), /Only a running manual timer[\s\S]*convertManualToSource[\s\S]*compactManualTimerSlots[\s\S]*emitTimerLifecycleEvent/, "Time Tracking should preserve the running timer while converting and compact remaining manual slots");
  assert.match(extractFunctionSpan(activeTimersRepoSource, "convertManualToSource"), /db\.transaction[\s\S]*source_module_id IS NULL[\s\S]*source_type = 'manual'[\s\S]*UPDATE active_work_timers[\s\S]*active_timer_id = :activeTimerId/, "the repository should reclassify the same manual timer row transactionally");
  assert.match(timeTrackerView, /data-stopwatch-task[\s\S]*Start timer to link a task[\s\S]*data-stopwatch-link-task/, "the Time Tracker card should expose a disabled-until-running Task link control");
  assert.match(css, /\.timer-task-link-control\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto[\s\S]*@media \(max-width: 700px\)[\s\S]*\.timer-task-link-control\s*\{[\s\S]*grid-template-columns: 1fr/, "the Task link control should keep its select and action responsive at the canonical mobile breakpoint");
  assert.match(extractClassMethodBlock(stopwatchSource, "StopwatchTimer", "linkRunningTimerToTask"), /\/api\/tasks\/\$\{encodeURIComponent\(task\.id\)\}\/timer\/link[\s\S]*timer_slot[\s\S]*loadActiveTimers\(\{ resetExisting: true \}\)[\s\S]*still running and is now linked/, "the browser should convert through Tasks, refresh compacted manual timers, and confirm continuity");
  assert.match(extractClassMethodBlock(stopwatchSource, "StopwatchTimer", "populateTaskOptions"), /task\.project_id === projectId[\s\S]*Start timer to link a task[\s\S]*this\.persistedActiveTimerId/, "Task choices should be project-filtered and unavailable before server persistence");
  assert.match(timeTrackingDocs, /As of \d+\.\d+\.\d+(?:\.\d+)?[\s\S]*transactionally reclassifies the existing `active_work_timers` row[\s\S]*`active_timer_id`[\s\S]*`created_at`[\s\S]*selected `task_id`/, "Time Tracking docs should record identity, duration, and attribution preservation");
  assert.match(tasksDocs, /As of \d+\.\d+\.\d+(?:\.\d+)?[\s\S]*`POST \/api\/tasks\/:taskId\/timer\/link`[\s\S]*Failed conversions compensate/, "Tasks docs should record the Tasks-owned conversion boundary");
  assert.match(timerHelp, /choose an active task[\s\S]*Link Task[\s\S]*remains running[\s\S]*original start[\s\S]*already has an active timer/, "Time Tracking Help should explain the current running-only linking workflow");
}

/** @param {TimeTrackingSession} session @param {string} projectId */
async function assertRunningManualTimerLinksAndFinalizes(session, projectId) {
  const task = await createTask(session, projectId, "Link running manual timer");
  const started = await activeTimersService.save("2", runningManualPayload(projectId, "Keep this identity", 37), session);
  await activeTimersService.save("4", {
    ...runningManualPayload(projectId, "Compact after link", 8),
    timer_status: "paused",
    last_active_start_time: null,
  }, session);
  const originalId = started.timer.active_timer_id;
  const originalCreatedAt = started.timer.created_at;

  const linked = await taskTimersService.linkManualTimer(task.task_id, { timer_slot: "2" }, session);

  assert.equal(linked.linked, true);
  assert.equal(linked.task.status, "in_progress", "linking a running timer should use the normal task-timer status transition");
  assert.equal(linked.timer.active_timer_id, originalId, "conversion should preserve the active timer identity");
  assert.equal(linked.timer.created_at, originalCreatedAt, "conversion should preserve the factual first-start timestamp");
  assert.equal(linked.timer.source_module_id, "tasks");
  assert.equal(linked.timer.source_type, "task");
  assert.equal(linked.timer.source_id, task.task_id);
  assert.equal(linked.timer.task_id, task.task_id);
  assert.equal(linked.timer.project_id, projectId);
  assert.equal(linked.timer.description, task.title);
  assert.equal(linked.timer.timer_status, "running");
  assert.ok(Number(linked.timer.accumulated_elapsed_seconds) >= 37);
  assert.deepEqual(linked.manual_timers.map((timer) => timer.timer_slot), ["1"], "remaining manual slots should compact after conversion");
  assert.equal(await activeTimersRepository.readBySlot(session.workspace_id, session.user_id, "2"), null, "the old manual slot should no longer exist");

  const sourced = await activeTimersRepository.readBySource(session.workspace_id, session.user_id, {
    sourceId: task.task_id,
    sourceModuleId: "tasks",
    sourceType: "task",
  });
  assert.ok(sourced, "linking should leave a readable sourced timer");
  assert.equal(sourced.active_timer_id, originalId);
  assert.ok(sourced.sourceMetadata, "the linked timer should carry its source metadata");
  assert.equal(sourced.sourceMetadata.linkedFromManualTimerSlot, "2");
  assert.equal(
    requireJsonRecord(sourced.sourceMetadata.taskTimerStatusTransition, "task timer status transition").movedTaskFromOpen,
    true,
  );
  assert.equal(await auditCount(session.workspace_id, "task_timer_linked", task.task_id), 1);

  const finalized = await taskTimersService.finalize(task.task_id, {}, session);
  const entry = await readTimeEntry(session.workspace_id, finalized.entry_id);
  assert.equal(entry.task_id, task.task_id, "finalized linked time must be attributed to the selected task");
  assert.equal(entry.project_id, projectId);
  assert.equal(entry.description, task.title);
}

/** @param {TimeTrackingSession} session @param {string} projectId */
async function assertPausedManualTimerStaysManual(session, projectId) {
  const task = await createTask(session, projectId, "Reject paused manual timer");
  const paused = await activeTimersService.save("2", {
    ...runningManualPayload(projectId, "Paused timer", 12),
    last_active_start_time: null,
    timer_status: "paused",
  }, session);

  await assert.rejects(
    () => taskTimersService.linkManualTimer(task.task_id, { timer_slot: "2" }, session),
    /Only a running manual timer can be linked to a task/,
  );

  const stillManual = await activeTimersRepository.readBySlot(session.workspace_id, session.user_id, "2");
  assert.ok(stillManual, "a rejected link should leave the manual timer readable");
  assert.equal(stillManual.active_timer_id, paused.timer.active_timer_id);
  assert.equal(stillManual.source_type, "manual");
  assert.equal(await readTaskStatus(session.workspace_id, task.task_id), "open", "a failed conversion should compensate its automatic task transition");
  await activeTimersService.remove("2", session);
}

/** @param {TimeTrackingSession} session @param {string} projectId */
async function assertExistingTaskTimerRejectsLink(session, projectId) {
  const task = await createTask(session, projectId, "Existing task timer conflict", { status: "in_progress" });
  await taskTimersService.save(task.task_id, runningManualPayload(projectId, "Existing task timer", 1), session);
  const manual = await activeTimersService.save("2", runningManualPayload(projectId, "Keep separate", 3), session);

  await assert.rejects(
    () => taskTimersService.linkManualTimer(task.task_id, { timer_slot: "2" }, session),
    /already has an active timer/,
  );

  const stillManual = await activeTimersRepository.readBySlot(session.workspace_id, session.user_id, "2");
  assert.ok(stillManual, "the rejected link should leave the manual timer readable");
  assert.equal(stillManual.active_timer_id, manual.timer.active_timer_id);
  assert.equal(stillManual.source_type, "manual");
  await taskTimersService.remove(task.task_id, session);
  await activeTimersService.remove("2", session);
}

/** @param {TimeTrackingSession} session @param {string} projectId */
async function assertPermissionDeniedLinkStaysManual(session, projectId) {
  const task = await createTask(session, projectId, "Permission-safe timer link");
  const noRoleSession = await createNoRoleSession(session.workspace_id);
  const manual = await activeTimersRepository.upsert({
    accumulated_elapsed_seconds: 4,
    active_timer_id: randomUUID(),
    billable: "yes",
    client_id: "",
    client_name: "",
    description: "Permission denied manual timer",
    last_active_start_time: new Date(Date.now() - 4_000).toISOString(),
    project_id: projectId,
    project_name: "Timer Task Linking Project",
    source_id: null,
    source_label: "Manual",
    source_module_id: null,
    source_type: "manual",
    source_url: "",
    timer_slot: "1",
    timer_status: "running",
    user_id: noRoleSession.user_id,
    workspace_id: noRoleSession.workspace_id,
  });

  await assert.rejects(
    () => taskTimersService.linkManualTimer(task.task_id, { timer_slot: "1" }, noRoleSession),
    (error) => rejectionStatus(error) === 403,
    "a user without Tasks/Time Tracking permission must not convert a manual timer",
  );

  const stillManual = await activeTimersRepository.readBySlot(noRoleSession.workspace_id, noRoleSession.user_id, "1");
  assert.ok(stillManual, "a permission-denied link should leave the manual timer readable");
  assert.equal(stillManual.active_timer_id, manual.active_timer_id);
  assert.equal(stillManual.source_type, "manual");
  assert.equal(await readTaskStatus(session.workspace_id, task.task_id), "open");
  await activeTimersRepository.remove(noRoleSession.workspace_id, noRoleSession.user_id, "1");
}

/** @param {TimeTrackingSession} session @param {string} projectId @param {string} title @param {Record<string, unknown>} [overrides] */
async function createTask(session, projectId, title, overrides = {}) {
  const result = await tasksService.create({
    assignee_ids: [session.user_id],
    project_id: projectId,
    status: overrides.status || "open",
    title,
  }, session);
  return result.task;
}

/** @param {string} workspaceId */
async function createProject(workspaceId) {
  const now = new Date().toISOString();
  const projectId = randomUUID();

  await runSql(`
INSERT INTO projects (
  id, workspace_id, client_id, parent_project_id, name, status, billable,
  billing_rate, billing_period_type, billing_period_start_day,
  billing_rounding_enabled, billing_rounding_increment,
  task_default_priority, task_default_status, task_default_sort_order_json,
  task_default_assignee_mode, created_at, updated_at
)
VALUES (
  ${sqlText(projectId)}, ${sqlText(workspaceId)}, NULL, NULL,
  'Timer Task Linking Project', 'Active', 'yes', '100', NULL, NULL, NULL, NULL,
  'normal', 'open', '["due_date","priority","status"]', 'creator',
  ${sqlText(now)}, ${sqlText(now)}
);
`);
  return projectId;
}

/** @param {string} projectId @param {string} description @param {number} elapsedSeconds */
function runningManualPayload(projectId, description, elapsedSeconds) {
  return {
    accumulated_elapsed_seconds: elapsedSeconds,
    billable: "yes",
    description,
    last_active_start_time: new Date(Date.now() - 5_000).toISOString(),
    project_id: projectId,
    timer_status: "running",
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
  return workspaceSessionFixture(requireRow(user, "fresh database should seed a protected super admin"));
}

/** @param {string} workspaceId @returns {Promise<TimeTrackingSession>} */
async function createNoRoleSession(workspaceId) {
  const userId = randomUUID();
  const username = `timer-link-no-role-${userId}@example.test`;
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO users (
  user_id, home_workspace_id, username, display_name, password,
  user_status, protected_user, active_workspace_id
)
VALUES (
  ${sqlText(userId)}, ${sqlText(workspaceId)}, ${sqlText(username)},
  'Timer Link No Role', 'unused', 'active', 'no', ${sqlText(workspaceId)}
);
`);
  await runSql(`
INSERT INTO user_workspaces (
  user_workspace_id, user_id, workspace_id, status, created_at, updated_at
)
VALUES (
  ${sqlText(randomUUID())}, ${sqlText(userId)}, ${sqlText(workspaceId)},
  'active', ${sqlText(now)}, ${sqlText(now)}
);
`);

  return workspaceSessionFixture({
    home_workspace_id: workspaceId,
    ip_address: "127.0.0.1",
    timezone: "America/New_York",
    user_id: userId,
    username,
    workspace_id: workspaceId,
  });
}

/** @param {string} workspaceId @param {string} taskId */
async function readTaskStatus(workspaceId, taskId) {
  const rows = await querySql(`SELECT status FROM tasks WHERE workspace_id = ${sqlText(workspaceId)} AND task_id = ${sqlText(taskId)} LIMIT 1;`);
  return rows[0]?.status || "";
}

/** @param {string} workspaceId @param {string} entryId */
async function readTimeEntry(workspaceId, entryId) {
  const rows = await querySql(`SELECT task_id, project_id, description FROM time_entries WHERE workspace_id = ${sqlText(workspaceId)} AND entry_id = ${sqlText(entryId)} LIMIT 1;`);
  return rows[0] || {};
}

/** @param {string} workspaceId @param {string} action @param {string} taskId @returns {Promise<number>} */
async function auditCount(workspaceId, action, taskId) {
  const rows = await querySql(`SELECT COUNT(*) AS count FROM audit_logs WHERE workspace_id = ${sqlText(workspaceId)} AND action = ${sqlText(action)} AND record_type = 'task' AND record_id = ${sqlText(taskId)};`);
  return Number(rows[0]?.count) || 0;
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}


/**
 * Read the HTTP status a rejected service call carries, proving the value
 * really is an error object first. A rejection without a numeric status
 * resolves to -1 so the predicate fails rather than passing vacuously.
 * @param {unknown} error
 * @returns {number}
 */
function rejectionStatus(error) {
  if (error === null || typeof error !== "object" || !("statusCode" in error)) return -1;
  const status = /** @type {{ statusCode: unknown }} */ (error).statusCode;
  return typeof status === "number" ? status : -1;
}
