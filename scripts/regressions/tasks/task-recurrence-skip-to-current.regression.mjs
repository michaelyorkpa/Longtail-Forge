export const regressionMeta = Object.freeze({
  id: "tasks.task-recurrence-skip-to-current",
  area: "tasks",
  tier: "integration",
  tags: ["calendar", "database", "permissions", "recurrence", "tasks", "timers"],
  description: "Proves atomic recurring-task recovery, durable checkpoints, next-not-passed boundaries, timer and permission preflight, and retry convergence.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mock } from "node:test";

mock.timers.enable({
  apis: ["Date"],
  now: new Date("2026-08-03T12:00:00.000Z"),
});

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-skip-current-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-skip-current.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Skip-Current-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { taskRecurrenceRepository } = await import("../../../src/modules/tasks/task-recurrence.repo.js");
const { taskRecurrenceService } = await import("../../../src/modules/tasks/task-recurrence.service.js");
const { tasksRepository } = await import("../../../src/modules/tasks/tasks.repo.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  await assertBoundarySemantics(session);
  await assertRecoveryConverges(session);
  await assertConcurrentRecoveryConverges(session);
  await assertEndedSeriesRecovery(session);
  await assertPermissionPreflight(session);
  await assertTimerPreflight(session);
  await assertBrowserAndRouteContracts();
  await assertDatabaseHealth();
  console.log("Task recurrence skip-to-current regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
  mock.timers.reset();
}

async function assertBoundarySemantics(session) {
  const dateOnly = recurrenceTemplateShape({ due_time: "" });
  assert.equal(
    taskRecurrenceService.nextNotPassedOccurrenceDate(dateOnly, new Date("2026-08-03T23:59:00.000Z"), session.timezone),
    "2026-08-03",
    "a date-only occurrence remains current for its whole session-local day",
  );

  const timed = recurrenceTemplateShape({ due_time: "09:00", due_timezone: "America/New_York" });
  assert.equal(
    taskRecurrenceService.nextNotPassedOccurrenceDate(timed, new Date("2026-08-03T12:59:59.000Z"), session.timezone),
    "2026-08-03",
    "a timed occurrence remains current until its normalized due instant",
  );
  assert.equal(
    taskRecurrenceService.nextNotPassedOccurrenceDate(timed, new Date("2026-08-03T13:00:01.000Z"), session.timezone),
    "2026-08-04",
    "a timed occurrence advances after its normalized due instant",
  );

  const dstTimed = recurrenceTemplateShape({
    recurrence_anchor_date: "2026-03-07",
    due_time: "09:00",
    due_timezone: "America/New_York",
  });
  assert.equal(
    taskRecurrenceService.nextNotPassedOccurrenceDate(dstTimed, new Date("2026-03-08T12:59:59.000Z"), session.timezone),
    "2026-03-08",
    "the due instant follows the template timezone across daylight-saving change",
  );

  const monthly = recurrenceTemplateShape({
    recurrence_anchor_date: "2026-01-15",
    recurrence_end_date: "2026-06-30",
    rrule: "FREQ=MONTHLY;INTERVAL=1;UNTIL=20260630",
  });
  assert.equal(
    taskRecurrenceService.nextNotPassedOccurrenceDate(monthly, new Date("2026-03-01T12:00:00.000Z"), session.timezone),
    "2026-03-15",
  );
}

async function assertRecoveryConverges(session) {
  const source = await createDailySeries(session, "Recover daily series");
  await taskRecurrenceRepository.replaceTemplateChecklist(
    session.workspace_id,
    source.recurrence_template_id,
    [{ label: "Retained context", sort_order: 1000 }],
    session.user_id,
  );
  const july31 = (await tasksService.materializeRecurrenceInstance({
    templateId: source.recurrence_template_id,
    instanceDate: "2026-07-31",
  }, session)).task;
  await tasksService.update(july31.task_id, {
    assignee_ids: [session.user_id],
    due_date: "2026-08-15",
    title: july31.title,
  }, session);
  const august1 = (await tasksService.materializeRecurrenceInstance({
    templateId: source.recurrence_template_id,
    instanceDate: "2026-08-01",
  }, session)).task;
  await tasksService.archive(august1.task_id, session);

  const detail = (await tasksService.read(july31.task_id, session)).task;
  assert.deepEqual(detail.recurrenceRecovery, {
    available: true,
    blockedByActiveTimer: false,
    completedTaskCount: 2,
    eligible: true,
    seriesEnded: false,
    skippedOccurrenceCount: 1,
    targetDate: "2026-08-03",
    unchangedHistoryCount: 1,
  });

  const result = await tasksService.skipToCurrent(july31.task_id, session, {
    now: new Date("2026-08-03T12:00:00.000Z"),
  });
  assert.equal(result.completedTaskCount, 2);
  assert.equal(result.skippedOccurrenceCount, 1);
  assert.equal(result.retainedTargetCount, 1);
  assert.equal(result.unchangedHistoryCount, 1);
  assert.equal(result.targetTask.recurrence_instance_date, "2026-08-03");
  assert.deepEqual(result.targetTask.checklistItems.map((item) => item.label), ["Retained context"]);
  assert.equal((await tasksRepository.readById(session.workspace_id, source.task_id)).status, "complete");
  assert.equal((await tasksRepository.readById(session.workspace_id, july31.task_id)).status, "complete");
  assert.equal((await tasksRepository.readById(session.workspace_id, august1.task_id)).status, "archived");
  assert.equal(await instanceCount(session, source.recurrence_template_id, "2026-08-02"), 0);
  assert.equal(await instanceCount(session, source.recurrence_template_id, "2026-08-03"), 1);

  const template = await taskRecurrenceRepository.readTemplateById(session.workspace_id, source.recurrence_template_id);
  assert.equal(template.recovery_checkpoint_date, "2026-08-03");
  const calendar = await tasksService.calendarWindow(session, { start: "2026-07-30", end: "2026-08-04" });
  assert.ok(!calendar.tasks.some((task) => task.virtual && task.instanceDate < "2026-08-03"));
  await assert.rejects(
    tasksService.skipToCurrent(result.targetTask.task_id, session, { now: new Date("2026-08-03T12:00:00.000Z") }),
    (error) => error.statusCode === 409 && /already current/.test(error.message),
  );
  assert.equal(await instanceCount(session, source.recurrence_template_id, "2026-08-03"), 1);

  const audits = await querySql(`
SELECT metadata_json FROM audit_logs
WHERE workspace_id = ? AND action = 'task_completed' AND record_id IN (?, ?);
`, [session.workspace_id, source.task_id, july31.task_id]);
  assert.equal(audits.length, 2);
  assert.ok(audits.every((row) => JSON.parse(row.metadata_json).recurrence_recovery === "skip_to_current"));
}

async function assertConcurrentRecoveryConverges(session) {
  const source = await createDailySeries(session, "Concurrent recovery series");
  const results = await Promise.all(Array.from({ length: 6 }, () => tasksService.skipToCurrent(
    source.task_id,
    session,
    { now: new Date("2026-08-03T12:00:00.000Z") },
  )));
  assert.equal(await instanceCount(session, source.recurrence_template_id, "2026-08-03"), 1);
  assert.equal(new Set(results.map((result) => result.targetTask?.task_id)).size, 1);
  assert.equal(results.reduce((total, result) => total + result.completedTaskCount, 0), 1);
}

async function assertEndedSeriesRecovery(session) {
  const source = (await tasksService.create({
    title: "Ended recovery series",
    due_date: "2026-07-30",
    assignee_ids: [session.user_id],
    recurrence: { enabled: true, frequency: "DAILY", interval: 1, endDate: "2026-08-01" },
  }, session)).task;
  const result = await tasksService.skipToCurrent(source.task_id, session, {
    now: new Date("2026-08-03T12:00:00.000Z"),
  });
  assert.equal(result.seriesEnded, true);
  assert.equal(result.targetTask, null);
  assert.equal((await tasksRepository.readById(session.workspace_id, source.task_id)).status, "complete");
  assert.equal(await instanceCount(session, source.recurrence_template_id, "2026-08-03"), 0);
}

async function assertPermissionPreflight(session) {
  const source = await createDailySeries(session, "Permission recovery series");
  await assert.rejects(
    tasksService.skipToCurrent(source.task_id, {
      ...session,
      user_id: "user-without-task-permissions",
      username: "no-task-permissions@example.test",
    }, { now: new Date("2026-08-03T12:00:00.000Z") }),
    (error) => error.statusCode === 403 && /permission/.test(error.message),
  );
  assert.equal((await tasksRepository.readById(session.workspace_id, source.task_id)).status, "open");
  await assert.rejects(
    tasksService.skipToCurrent(source.task_id, { ...session, workspace_id: "different-workspace" }, {
      now: new Date("2026-08-03T12:00:00.000Z"),
    }),
    (error) => [403, 404].includes(error.statusCode),
  );
  assert.equal((await tasksRepository.readById(session.workspace_id, source.task_id)).status, "open");
}

async function assertTimerPreflight(session) {
  const source = await createDailySeries(session, "Timer recovery series");
  const now = new Date().toISOString();
  await querySql(`
INSERT INTO active_work_timers (
  active_timer_id, workspace_id, user_id, timer_slot, source_module_id, source_type,
  source_id, source_label, source_url, project_id, timer_status, created_at, updated_at
) VALUES (?, ?, ?, 'primary', 'tasks', 'task', ?, ?, '', '', 'paused', ?, ?);
`, ["skip-current-timer", session.workspace_id, session.user_id, source.task_id, source.title, now, now]);

  const detail = (await tasksService.read(source.task_id, session)).task;
  assert.equal(detail.recurrenceRecovery.available, true);
  assert.equal(detail.recurrenceRecovery.blockedByActiveTimer, true);
  await assert.rejects(
    tasksService.skipToCurrent(source.task_id, session, { now: new Date("2026-08-03T12:00:00.000Z") }),
    (error) => error.statusCode === 409 && /timers/.test(error.message),
  );
  assert.equal((await tasksRepository.readById(session.workspace_id, source.task_id)).status, "open");
  const template = await taskRecurrenceRepository.readTemplateById(session.workspace_id, source.recurrence_template_id);
  assert.equal(template.recovery_checkpoint_date, "");
}

async function assertBrowserAndRouteContracts() {
  const [routes, dialog, migration] = await Promise.all([
    fs.readFile("src/modules/tasks/tasks.routes.js", "utf8"),
    fs.readFile("public/js/task-dialog.js", "utf8"),
    fs.readFile("src/db/migrations/087_task_recurrence_recovery_checkpoint.sql", "utf8"),
  ]);
  assert.match(routes, /\/tasks\/:taskId\/skip-to-current/);
  assert.match(dialog, /Skip to current/);
  assert.match(dialog, /recurrenceRecovery/);
  assert.match(migration, /recovery_checkpoint_date/);
}

async function createDailySeries(session, title) {
  return (await tasksService.create({
    title,
    due_date: "2026-07-30",
    assignee_ids: [session.user_id],
    recurrence: { enabled: true, frequency: "DAILY", interval: 1, endDate: "2026-08-31" },
  }, session)).task;
}

function recurrenceTemplateShape(overrides = {}) {
  return {
    recurrence_anchor_date: "2026-07-30",
    recurrence_end_date: "2026-08-31",
    rrule: "FREQ=DAILY;INTERVAL=1;UNTIL=20260831",
    ...overrides,
  };
}

async function instanceCount(session, templateId, instanceDate) {
  const rows = await querySql(`
SELECT COUNT(*) AS count FROM tasks
WHERE workspace_id = ? AND recurrence_template_id = ? AND recurrence_instance_date = ?;
`, [session.workspace_id, templateId, instanceDate]);
  return Number(rows[0]?.count || 0);
}

async function assertDatabaseHealth() {
  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(integrityRows.map((row) => Object.values(row)[0]), ["ok"]);
  assert.deepEqual(await querySql("PRAGMA foreign_key_check;"), []);
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users WHERE users.protected_user = 'yes' LIMIT 1;
`);
  const user = rows[0];
  assert.ok(user);
  return {
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}
