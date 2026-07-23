import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-reminder-horizon-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-reminder-horizon.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Task-Reminder-Horizon-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const taskJobsSource = readText("src/modules/tasks/task-jobs.service.js");
const tasksModuleSource = readText("src/modules/tasks/module.js");
const appSource = readText("src/core/app.js");
const workerCliSource = readText("src/core/jobs/worker-cli.js");
const tasksDocs = readText("docs/tasks-module.md");
const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const regressionSuite = readText("scripts/regression-legacy-snapshot.json");

const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
const { closeSqlite, db, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const {
  queueTaskReminderSweepJob,
  registerTaskJobHandlers,
  sweepTaskReminderJobsForWorkspace,
} = await import("../src/modules/tasks/task-jobs.service.js");
const { taskRemindersService } = await import("../src/modules/tasks/task-reminders.service.js");
const { tasksRepository } = await import("../src/modules/tasks/tasks.repo.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { normalizeUtcIso } = await import("../src/utils/timezones.js");

try {
  assertStaticContract();

  await initializeDatabase();
  registerTaskJobHandlers({ replace: true });
  const session = await readSeedSession();
  const now = new Date();

  await assertBackfillQueuesExistingTask(session, now);
  await assertHorizonDefersAndSweepTopsUp(session, now);
  await assertCompletedArchivedAndFarFutureTasksDoNotQueue(session, now);
  await assertOptionalSecondaryReminderRoundTrip(session, now);
  await assertIntegrity();

  console.log("Task reminder scheduling horizon regression passed.");
} finally {
  await stopJobWorker().catch(() => {});
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertOptionalSecondaryReminderRoundTrip(session, now) {
  const due = localDateTimeParts(addMinutes(now, 45), session.timezone);
  const single = (await tasksService.create({
    due_date: due.date,
    due_time: due.time,
    reminderOverrideEnabled: true,
    reminderPolicy: {
      dateOnly: [1440],
      dateTime: [5],
    },
    title: "Optional secondary reminder task",
  }, session)).task;
  const singleRead = (await tasksService.read(single.task_id, session)).task;

  assert.deepEqual(singleRead.reminderDetails.taskPolicy.dateTime, [5], "a disabled timed secondary reminder should stay omitted after save and read");
  assert.deepEqual(singleRead.reminderDetails.taskPolicy.dateOnly, [1440], "a disabled date-only secondary reminder should stay omitted after save and read");
  assert.deepEqual(singleRead.reminderDetails.computedOccurrences.map((item) => item.offset_minutes), [5], "a timed task with its secondary disabled should compute one reminder occurrence");
  assert.equal(await reminderFireJobCount(session.workspace_id, single.task_id), 1, "an omitted timed secondary reminder should enqueue no second reminder job");

  const dual = (await tasksService.create({
    due_date: due.date,
    due_time: due.time,
    reminderOverrideEnabled: true,
    reminderPolicy: {
      dateOnly: [1440, 4320],
      dateTime: [5, 10],
    },
    title: "Enabled secondary reminder task",
  }, session)).task;
  const dualRead = (await tasksService.read(dual.task_id, session)).task;

  assert.deepEqual(dualRead.reminderDetails.taskPolicy.dateTime, [5, 10], "enabled timed secondary reminders should preserve the two-offset policy");
  assert.deepEqual(dualRead.reminderDetails.taskPolicy.dateOnly, [1440, 4320], "enabled date-only secondary reminders should preserve the two-offset policy");
  assert.equal(await reminderFireJobCount(session.workspace_id, dual.task_id), 2, "enabled timed secondary reminders should retain two scheduled jobs");
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the reminder scheduling version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the reminder scheduling version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the reminder scheduling version");
  assert.match(taskJobsSource, /TASK_REMINDER_SCHEDULING_HORIZON_DAYS = 30/, "task reminder jobs should document the bounded scheduling horizon");
  assert.match(taskJobsSource, /TASK_REMINDER_SWEEP_INTERVAL_HOURS = 12/, "task reminder jobs should document the sweep top-up interval");
  assert.match(taskJobsSource, /operation:\s*"sweep_reminders"/, "task reminder jobs should queue a durable sweep operation");
  assert.match(taskJobsSource, /readReminderSchedulingCandidates/, "task reminder sweep should read existing due-task candidates");
  assert.match(tasksModuleSource, /queueTaskReminderSweepJobs/, "Tasks activation should own reminder sweeps");
  assert.match(tasksModuleSource, /registerStartupTask/, "Tasks activation should register startup sweep work");
  assert.match(appSource, /runModuleStartupTasks\("app"/, "app startup should run generic module startup work");
  assert.doesNotMatch(appSource, /queueTaskReminderSweepJobs/, "app startup should not import Tasks-specific sweeps");
  assert.match(workerCliSource, /runModuleStartupTasks\("worker"/, "separate worker startup should run generic module startup work");
  assert.doesNotMatch(workerCliSource, /queueTaskReminderSweepJobs/, "separate worker startup should not import Tasks-specific sweeps");
  assert.match(tasksDocs, /^# Tasks Module$/m, "Tasks docs should retain the owning module heading");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.7\.3[\s\S]*30-day scheduling horizon[\s\S]*12-hour sweep/, "database docs should document reminder horizon and sweep behavior");
  assert.match(runtimeDocs, /As of 0\.33\.5\.21\.7\.4[\s\S]*30-day scheduling horizon[\s\S]*12-hour top-up sweep/, "runtime docs should document reminder horizon and sweep behavior");
  assert.match(regressionSuite, /scripts\/task-reminder-scheduling-horizon-regression\.mjs/, "regression suite should include reminder horizon coverage");
}

async function assertBackfillQueuesExistingTask(session, now) {
  const due = localDateTimeParts(addMinutes(now, 20), session.timezone);
  const task = await createRepositoryTask(session, {
    dueDate: due.date,
    dueTime: due.time,
    offsets: [5],
    title: "Existing reminder task",
  });

  assert.equal(await reminderFireJobCount(session.workspace_id, task.task_id), 0, "repository-created task should start without reminder jobs");

  await queueTaskReminderSweepJob({
    reschedule: false,
    source: "task-reminder-horizon-regression",
    workspaceId: session.workspace_id,
  });
  const summary = await runJobWorkerOnce({
    claimLimit: 1,
    mode: "inline",
    workerId: "task-reminder-horizon-regression",
  });

  assert.equal(summary.completed, 1, "worker should complete the reminder sweep");
  assert.equal(await reminderFireJobCount(session.workspace_id, task.task_id), 1, "sweep should queue an existing task reminder");
  await sweepTaskReminderJobsForWorkspace({
    now,
    source: "task-reminder-horizon-regression",
    workspaceId: session.workspace_id,
  });
  assert.equal(await reminderFireJobCount(session.workspace_id, task.task_id), 1, "repeated sweeps should not duplicate reminder jobs");
}

async function assertHorizonDefersAndSweepTopsUp(session, now) {
  const serviceDue = localDateTimeParts(addDays(now, 90), session.timezone);
  const serviceTask = (await tasksService.create({
    due_date: serviceDue.date,
    due_time: serviceDue.time,
    reminderOverrideEnabled: true,
    reminderPolicy: {
      dateTime: [5],
      dateOnly: [1440],
    },
    title: "Service far future reminder task",
  }, session)).task;
  assert.equal(await reminderFireJobCount(session.workspace_id, serviceTask.task_id), 0, "task mutations should not pre-enqueue reminders beyond the horizon");

  const topUpDue = localDateTimeParts(addDays(now, 31), session.timezone);
  const topUpTask = await createRepositoryTask(session, {
    dueDate: topUpDue.date,
    dueTime: topUpDue.time,
    offsets: [60],
    title: "Reminder horizon top-up task",
  });

  await sweepTaskReminderJobsForWorkspace({
    now,
    source: "task-reminder-horizon-regression",
    workspaceId: session.workspace_id,
  });
  assert.equal(await reminderFireJobCount(session.workspace_id, topUpTask.task_id), 0, "sweep should defer reminders beyond the horizon");

  await sweepTaskReminderJobsForWorkspace({
    now: addDays(now, 2),
    source: "task-reminder-horizon-regression",
    workspaceId: session.workspace_id,
  });
  assert.equal(await reminderFireJobCount(session.workspace_id, topUpTask.task_id), 1, "later sweep should top up reminders that enter the horizon");
}

async function assertCompletedArchivedAndFarFutureTasksDoNotQueue(session, now) {
  const due = localDateTimeParts(addMinutes(now, 30), session.timezone);
  const completed = await createRepositoryTask(session, {
    dueDate: due.date,
    dueTime: due.time,
    offsets: [5],
    status: "complete",
    title: "Completed reminder skip task",
  });
  const archived = await createRepositoryTask(session, {
    dueDate: due.date,
    dueTime: due.time,
    offsets: [5],
    status: "archived",
    title: "Archived reminder skip task",
  });
  const futureDue = localDateTimeParts(addDays(now, 90), session.timezone);
  const farFuture = await createRepositoryTask(session, {
    dueDate: futureDue.date,
    dueTime: futureDue.time,
    offsets: [5, 60, 1440, 4320],
    title: "Far future many-offset task",
  });

  await sweepTaskReminderJobsForWorkspace({
    now,
    source: "task-reminder-horizon-regression",
    workspaceId: session.workspace_id,
  });

  assert.equal(await reminderFireJobCount(session.workspace_id, completed.task_id), 0, "completed tasks should not receive reminder jobs");
  assert.equal(await reminderFireJobCount(session.workspace_id, archived.task_id), 0, "archived tasks should not receive reminder jobs");
  assert.equal(await reminderFireJobCount(session.workspace_id, farFuture.task_id), 0, "far-future many-offset tasks should not create long-lived reminder jobs");
}

async function createRepositoryTask(session, options = {}) {
  const dueTimezone = options.dueTimezone || session.timezone || "America/New_York";
  const dueAtUtc = options.dueTime ? normalizeUtcIso(`${options.dueDate}T${options.dueTime}:00`, dueTimezone) : "";
  const now = new Date().toISOString();
  const task = await tasksRepository.create(session.workspace_id, {
    assignee_ids: [session.user_id],
    billable: "yes",
    completed_at: options.status === "complete" ? now : "",
    completed_by_user_id: options.status === "complete" ? session.user_id : "",
    created_by_user_id: session.user_id,
    due_at_utc: dueAtUtc,
    due_date: options.dueDate,
    due_time: options.dueTime,
    due_timezone: dueTimezone,
    priority: "normal",
    reminder_override_enabled: true,
    status: options.status || "open",
    title: options.title,
    updated_by_user_id: session.user_id,
  });

  await taskRemindersService.saveTargetPolicy(session.workspace_id, "task", task.task_id, {
    dateOnly: [1440],
    dateTime: options.offsets || [5],
  }, false);

  return tasksRepository.readById(session.workspace_id, task.task_id);
}

async function reminderFireJobCount(workspaceId, taskId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM jobs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND job_type = 'task.reminder'
  AND payload_json LIKE ${sqlText(`%"operation":"fire_reminder"%`)}
  AND payload_json LIKE ${sqlText(`%${taskId}%`)};
`);

  return Number(rows[0]?.count || 0);
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

async function assertIntegrity() {
  const rows = await db.query("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok", "SQLite integrity check should pass");
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function localDateTimeParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date).reduce((map, part) => {
    map[part.type] = part.value;
    return map;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
  };
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}
