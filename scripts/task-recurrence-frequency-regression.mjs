import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-recurrence-frequency-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-recurrence-frequency.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Recurrence-Frequency-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
const { registerSearchIndexJobHandlers } = await import("../src/services/search-index-jobs.service.js");
const { registerTaskJobHandlers } = await import("../src/modules/tasks/task-jobs.service.js");
const { taskRecurrenceService } = await import("../src/modules/tasks/task-recurrence.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  await initializeDatabase();
  registerSearchIndexJobHandlers({ replace: true });
  registerTaskJobHandlers({ replace: true });
  const session = await readSeedSession();

  await assertWeekdayRecurrenceSkipsWeekends(session);
  await assertWeekendRecurrenceSkipsWeekdays(session);
  await assertDailyRecurrenceRemainsSevenDays(session);
  await assertFutureEditDoesNotPersistInstanceStatus(session);
  await assertTaskViewDialogIncludesFrequencyOptions();

  console.log("Task recurrence frequency regression passed.");
} finally {
  await stopJobWorker().catch(() => {});
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertWeekdayRecurrenceSkipsWeekends(session) {
  const task = (await tasksService.create({
    title: "Weekday recurring task",
    due_date: "2026-06-12",
    recurrence: {
      enabled: true,
      frequency: "WEEKDAYS",
      interval: 1,
      endDate: "2026-06-30",
    },
  }, session)).task;

  assert.equal(task.recurrenceDetails.frequency, "WEEKDAYS");
  assert.match(task.recurrenceDetails.rrule, /FREQ=DAILY/);
  assert.match(task.recurrenceDetails.rrule, /BYDAY=MO,TU,WE,TH,FR/);

  const createdTask = await completeAndRunRecurrence(task, session, "2026-06-15");
  assert.equal(createdTask.due_date, "2026-06-15");
  assert.equal(createdTask.recurrence_instance_date, "2026-06-15");
}

async function assertWeekendRecurrenceSkipsWeekdays(session) {
  const task = (await tasksService.create({
    title: "Weekend recurring task",
    due_date: "2026-06-14",
    recurrence: {
      enabled: true,
      frequency: "DAILY",
      interval: 1,
      endDate: "2026-06-30",
    },
  }, session)).task;

  const updated = (await tasksService.update(task.task_id, {
    title: "Weekend recurring task",
    recurrence: {
      enabled: true,
      frequency: "WEEKENDS",
      interval: 1,
      endDate: "2026-06-30",
      applyTo: "future",
    },
  }, session)).task;

  assert.equal(updated.recurrenceDetails.frequency, "WEEKENDS");
  assert.match(updated.recurrenceDetails.rrule, /FREQ=DAILY/);
  assert.match(updated.recurrenceDetails.rrule, /BYDAY=SA,SU/);

  const read = (await tasksService.read(task.task_id, session)).task;
  assert.equal(read.recurrenceDetails.frequency, "WEEKENDS");

  const createdTask = await completeAndRunRecurrence(task, session, "2026-06-20");
  assert.equal(createdTask.due_date, "2026-06-20");
  assert.equal(createdTask.recurrence_instance_date, "2026-06-20");
}

async function assertDailyRecurrenceRemainsSevenDays(session) {
  const task = (await tasksService.create({
    title: "Daily recurring task",
    due_date: "2026-06-12",
    recurrence: {
      enabled: true,
      frequency: "DAILY",
      interval: 1,
      endDate: "2026-06-30",
    },
  }, session)).task;

  assert.equal(task.recurrenceDetails.frequency, "DAILY");
  assert.equal(taskRecurrenceService.parseRRule(task.recurrenceDetails.rrule).frequency, "DAILY");

  const createdTask = await completeAndRunRecurrence(task, session, "2026-06-13");
  assert.equal(createdTask.due_date, "2026-06-13");
  assert.equal(createdTask.recurrence_instance_date, "2026-06-13");
}

async function assertFutureEditDoesNotPersistInstanceStatus(session) {
  const task = (await tasksService.create({
    title: "Future edit recurring task",
    due_date: "2026-06-16",
    recurrence: {
      enabled: true,
      frequency: "DAILY",
      interval: 1,
      endDate: "2026-06-30",
    },
  }, session)).task;

  await tasksService.update(task.task_id, {
    title: task.title,
    status: "in_progress",
  }, session);

  const futureEdited = (await tasksService.update(task.task_id, {
    title: "Future edit recurring task with tags",
    recurrence: {
      enabled: true,
      frequency: "DAILY",
      interval: 1,
      endDate: "2026-06-30",
      applyTo: "future",
    },
  }, session)).task;

  assert.equal(futureEdited.status, "in_progress", "The current task instance should keep its real status.");
  assert.equal(
    await readTemplateStatus(session.workspace_id, task.recurrence_template_id),
    "open",
    "All-future recurrence edits should not persist the current instance status to the series template.",
  );

  const createdTask = await completeAndRunRecurrence(task, session, "2026-06-17");
  assert.equal(createdTask.status, "open", "Next recurring task instances should be created open.");
}

async function assertTaskViewDialogIncludesFrequencyOptions() {
  const taskDialogScript = await fs.readFile(new URL("../public/js/task-dialog.js", import.meta.url), "utf8");

  assert.match(taskDialogScript, /value: "WEEKDAYS", label: "Weekdays"/, "Tasks dialog must expose Weekdays recurrence");
  assert.match(taskDialogScript, /value: "WEEKENDS", label: "Weekends"/, "Tasks dialog must expose Weekends recurrence");
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

async function readTemplateStatus(workspaceId, templateId) {
  const rows = await querySql(`
SELECT status
FROM task_recurrence_templates
WHERE workspace_id = '${workspaceId.replaceAll("'", "''")}'
  AND recurrence_template_id = '${templateId.replaceAll("'", "''")}'
LIMIT 1;
`);

  return rows[0]?.status || "";
}

async function completeAndRunRecurrence(task, session, instanceDate) {
  const completed = await tasksService.complete(task.task_id, session);
  assert.equal(completed.createdTask, null, "recurrence generation should be queued instead of inline");
  assert.equal(completed.recurrenceJob.queued, true, "completing a recurring task should queue recurrence generation");

  const summary = await runJobWorkerOnce({
    claimLimit: 20,
    mode: "inline",
    workerId: "task-recurrence-frequency-regression",
  });
  assert.ok(summary.completed >= 1, "worker should process queued recurrence work");

  const rows = await querySql(`
SELECT task_id
FROM tasks
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND recurrence_template_id = ${sqlText(task.recurrence_template_id)}
  AND recurrence_instance_date = ${sqlText(instanceDate)}
  AND task_id <> ${sqlText(task.task_id)}
LIMIT 1;
`);
  assert.ok(rows[0]?.task_id, `expected recurrence instance for ${instanceDate}`);

  return (await tasksService.read(rows[0].task_id, session)).task;
}
