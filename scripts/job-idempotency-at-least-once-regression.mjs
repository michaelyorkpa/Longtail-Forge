import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.21.7.8";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-job-idempotency-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-job-idempotency.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Job-Idempotency-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const databaseDocs = readText("docs/database.md");
const moduleDocs = readText("docs/module-development.md");
const taskJobsSource = readText("src/modules/tasks/task-jobs.service.js");
const notificationsSource = readText("src/services/notifications.service.js");
const notificationsRepoSource = readText("src/repositories/notifications.repo.js");
const searchJobsSource = readText("src/services/search-index-jobs.service.js");
const filesSource = readText("src/services/files.service.js");
const importJobsSource = readText("src/services/import-jobs.service.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  resetJobWorkerStatusForTests,
  runJobWorkerOnce,
  stopJobWorker,
} = await import("../src/core/jobs/index.js");
const { closeDatabase, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { notificationsService } = await import("../src/services/notifications.service.js");
const { registerSearchIndexJobHandlers } = await import("../src/services/search-index-jobs.service.js");
const { registerTaskJobHandlers } = await import("../src/modules/tasks/task-jobs.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  registerSearchIndexJobHandlers({ replace: true });
  registerTaskJobHandlers({ replace: true });
  notificationsService.registerNotificationJobHandlers({ replace: true });
  notificationsService.registerEventHandlers();
  const session = await readSeedSession();

  await assertReminderRetryDoesNotDoubleNotify(session);
  await assertIntegrity();

  console.log("Job idempotency and at-least-once regression passed.");
} finally {
  notificationsService.resetEventHandlersForTests();
  await stopJobWorker().catch(() => {});
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the job idempotency version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the job idempotency version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the job idempotency version");
  assert.match(taskJobsSource, /notification_delivery_key:\s*taskReminderDedupeKey/, "reminder events should carry a stable notification delivery key");
  assert.match(notificationsSource, /notificationEventJobDedupeKey/, "notification event jobs should dedupe stable delivery keys");
  assert.match(notificationsSource, /notificationIdForDeliveryKey/, "notification fan-out should create deterministic recipient notification IDs");
  assert.match(notificationsRepoSource, /isDuplicateNotificationIdError/, "notification inserts should tolerate deterministic duplicate IDs");
  assert.match(searchJobsSource, /dedupeKey\(OPERATION_REINDEX/, "search reindex jobs should retain active dedupe keys");
  assert.match(searchJobsSource, /removeSearchDocument/, "search remove jobs should be idempotent canonical deletes");
  assert.match(taskJobsSource, /readByRecurrenceInstance/, "recurrence jobs should keep existing-instance idempotency checks");
  assert.match(filesSource, /file\.status !== "pending" \|\| file\.scan_status !== "pending"/, "file scan jobs should skip already scanned rows");
  assert.match(importJobsSource, /reserved:\s*true[\s\S]*skipped:\s*true/, "future imports should remain a reserved no-op handler");
  assert.match(regressionSuite, /scripts\/job-idempotency-at-least-once-regression\.mjs/, "regression suite should include at-least-once idempotency coverage");
  assert.match(roadmap, /Version 0\.33\.5\.21\.7\.3 - Job idempotency and at-least-once audit[\s\S]*\[x\] Harden reminder firing/, "roadmap should mark the idempotency slice complete");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the idempotency slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.7\.3[\s\S]*notification_delivery_key[\s\S]*at-least-once/, "database docs should document durable idempotency behavior");
  assert.match(moduleDocs, /As of 0\.33\.5\.21\.7\.3[\s\S]*at-least-once worker behavior/, "module docs should document current durable job idempotency expectations");
}

async function assertReminderRetryDoesNotDoubleNotify(session) {
  resetJobWorkerStatusForTests();
  const due = localDateTimeParts(addMinutes(new Date(), 6), session.timezone);
  const beforeCount = await dueSoonNotificationCount(session.workspace_id, session.user_id);
  const task = (await tasksService.create({
    assignee_ids: [session.user_id],
    due_date: due.date,
    due_time: due.time,
    reminderOverrideEnabled: true,
    reminderPolicy: {
      dateTime: [5],
      dateOnly: [1440],
    },
    title: "Retry-safe reminder task",
  }, session)).task;
  const reminderJob = await readReminderJob(session.workspace_id, task.task_id);

  await forceJobDue(reminderJob.job_id);
  const firstReminderRun = await runJobWorkerOnce({
    claimLimit: 1,
    mode: "inline",
    workerId: "job-idempotency-regression",
  });

  assert.equal(firstReminderRun.completed, 1, "worker should complete the first reminder attempt");
  assert.equal(await dueSoonNotificationJobCount(session.workspace_id, task.task_id), 1, "first reminder attempt should queue one notification event job");

  await forceJobRunningExpired(reminderJob.job_id);
  const reclaimedReminderRun = await runJobWorkerOnce({
    claimLimit: 1,
    lockTtlSeconds: 1,
    mode: "inline",
    workerId: "job-idempotency-regression",
  });

  assert.equal(reclaimedReminderRun.completed, 1, "expired running reminder should be reclaimable");
  assert.equal(await dueSoonNotificationJobCount(session.workspace_id, task.task_id), 1, "reclaimed reminder should not queue a second active notification event job");

  const notificationJob = await readDueSoonNotificationJob(session.workspace_id, task.task_id);
  await forceJobDue(notificationJob.job_id);
  await processDueJobs(8);
  const completedNotificationJob = await readJobById(notificationJob.job_id);

  assert.equal(completedNotificationJob.status, "completed", "worker should complete the notification fan-out job");
  assert.equal(await dueSoonNotificationCount(session.workspace_id, session.user_id), beforeCount + 1, "reminder fan-out should create one notification");

  const notification = await readDueSoonNotification(session.workspace_id, session.user_id, task.task_id);
  assert.ok(notification.notification_id.startsWith("notification:"), "delivery-key notifications should use deterministic IDs");
  assert.match(notification.metadata_json, /notification_delivery_key/, "notification metadata should retain the delivery key for audit");

  await forceJobRunningExpired(notificationJob.job_id);
  const reclaimedNotificationRun = await runJobWorkerOnce({
    claimLimit: 1,
    lockTtlSeconds: 1,
    mode: "inline",
    workerId: "job-idempotency-regression",
  });

  assert.equal(reclaimedNotificationRun.completed, 1, "expired running notification fan-out should be reclaimable");
  assert.equal(await dueSoonNotificationCount(session.workspace_id, session.user_id), beforeCount + 1, "notification fan-out retry should not create a duplicate notification row");

  await forceJobRunningExpired(reminderJob.job_id);
  const completedReminderRetry = await runJobWorkerOnce({
    claimLimit: 1,
    lockTtlSeconds: 1,
    mode: "inline",
    workerId: "job-idempotency-regression",
  });
  assert.equal(completedReminderRetry.completed, 1, "completed reminder side effects should remain retry-safe");
  await processDueJobs(6);
  assert.equal(await dueSoonNotificationCount(session.workspace_id, session.user_id), beforeCount + 1, "completed notification dedupe should still suppress duplicate reminder delivery");
}

async function processDueJobs(maxRuns) {
  for (let index = 0; index < maxRuns; index += 1) {
    const summary = await runJobWorkerOnce({
      claimLimit: 1,
      mode: "inline",
      workerId: "job-idempotency-regression",
    });

    if (summary.claimed === 0) {
      break;
    }
  }
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

async function readReminderJob(workspaceId, taskId) {
  const rows = await querySql(`
SELECT *
FROM jobs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND job_type = 'task.reminder'
  AND payload_json LIKE ${sqlText(`%"operation":"fire_reminder"%`)}
  AND payload_json LIKE ${sqlText(`%${taskId}%`)}
ORDER BY created_at DESC, job_id DESC
LIMIT 1;
`);

  assert.ok(rows[0], `expected reminder job for task ${taskId}`);
  return rows[0];
}

async function readDueSoonNotificationJob(workspaceId, taskId) {
  const rows = await querySql(`
SELECT *
FROM jobs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND job_type = 'notification.event'
  AND payload_json LIKE ${sqlText(`%"name":"task.due_soon"%`)}
  AND payload_json LIKE ${sqlText(`%${taskId}%`)}
ORDER BY created_at DESC, job_id DESC
LIMIT 1;
`);

  assert.ok(rows[0], `expected due-soon notification job for task ${taskId}`);
  return rows[0];
}

async function readJobById(jobId) {
  const rows = await querySql(`
SELECT *
FROM jobs
WHERE job_id = ${sqlText(jobId)}
LIMIT 1;
`);

  assert.ok(rows[0], `expected job ${jobId}`);
  return rows[0];
}

async function dueSoonNotificationJobCount(workspaceId, taskId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM jobs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND job_type = 'notification.event'
  AND status IN ('pending', 'running', 'failed')
  AND payload_json LIKE ${sqlText(`%"name":"task.due_soon"%`)}
  AND payload_json LIKE ${sqlText(`%${taskId}%`)};
`);

  return Number(rows[0]?.count || 0);
}

async function dueSoonNotificationCount(workspaceId, recipientUserId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM notifications
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recipient_user_id = ${sqlText(recipientUserId)}
  AND event_type = 'task.due_soon';
`);

  return Number(rows[0]?.count || 0);
}

async function readDueSoonNotification(workspaceId, recipientUserId, taskId) {
  const rows = await querySql(`
SELECT *
FROM notifications
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recipient_user_id = ${sqlText(recipientUserId)}
  AND event_type = 'task.due_soon'
  AND record_id = ${sqlText(taskId)}
ORDER BY created_at DESC, notification_id DESC
LIMIT 1;
`);

  assert.ok(rows[0], `expected due-soon notification for task ${taskId}`);
  return rows[0];
}

async function forceJobDue(jobId) {
  await runSql(`
UPDATE jobs
SET available_at = ${sqlText(new Date().toISOString())}
WHERE job_id = ${sqlText(jobId)};
`);
}

async function forceJobRunningExpired(jobId) {
  const oldLock = new Date(Date.now() - 120_000).toISOString();

  await runSql(`
UPDATE jobs
SET status = 'running',
    locked_at = ${sqlText(oldLock)},
    locked_by = 'crashed-worker',
    completed_at = NULL,
    available_at = ${sqlText(new Date().toISOString())}
WHERE job_id = ${sqlText(jobId)};
`);
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok", "SQLite integrity check should pass");
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}
