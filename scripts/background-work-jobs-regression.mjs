import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.21.7.7";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-background-work-jobs-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-background-work-jobs.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Background-Work-Jobs-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const architectureDocs = readText("docs/architecture.md");
const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const tasksSource = readText("src/modules/tasks/tasks.service.js");
const taskJobsSource = readText("src/modules/tasks/task-jobs.service.js");
const filesSource = readText("src/services/files.service.js");
const importJobsSource = readText("src/services/import-jobs.service.js");
const appSource = readText("src/core/app.js");
const workerCliSource = readText("src/core/jobs/worker-cli.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { modulesService } = await import("../src/core/modules/modules.service.js");
const { closeDatabase, db, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
const { filesService } = await import("../src/services/files.service.js");
const { queueFutureImportJob, registerFutureImportJobHandlers } = await import("../src/services/import-jobs.service.js");
const { registerSearchIndexJobHandlers } = await import("../src/services/search-index-jobs.service.js");
const { registerTaskJobHandlers } = await import("../src/modules/tasks/task-jobs.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the background work jobs version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the background work jobs version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the background work jobs version");

  assert.match(taskJobsSource, /TASK_REMINDER_JOB_TYPE = "task\.reminder"/, "task reminders should have a durable job type");
  assert.match(taskJobsSource, /TASK_RECURRENCE_JOB_TYPE = "task\.recurrence"/, "task recurrence should have a durable job type");
  assert.match(taskJobsSource, /computePendingReminderOccurrences/, "task reminder jobs should use the reminder policy service");
  assert.match(taskJobsSource, /TASK_REMINDER_CLOCK_SKEW_MS/, "task reminder jobs should account for clock skew");
  assert.match(tasksSource, /queueTaskRecurrenceGeneration/, "task completion should queue recurrence generation");
  assert.doesNotMatch(tasksSource, /const recurrenceResult = await taskRecurrenceService\.createNextInstance/, "task completion should not create recurrence inline");
  assert.match(filesSource, /FILE_SCAN_JOB_TYPE = "file\.scan"/, "file scanning should have a durable job type");
  assert.match(filesSource, /registerJobHandler\(FILE_SCAN_JOB_TYPE/, "file scanning should register a worker handler");
  assert.match(importJobsSource, /FUTURE_IMPORT_JOB_TYPE = "import\.future"/, "future imports should have a reserved durable job type");
  assert.match(appSource, /registerTaskJobHandlers/, "app startup should register task job handlers");
  assert.match(appSource, /registerFileScanJobHandlers/, "app startup should register file scan handlers");
  assert.match(appSource, /registerFutureImportJobHandlers/, "app startup should register future import handlers");
  assert.match(workerCliSource, /registerTaskJobHandlers/, "separate worker startup should register task job handlers");
  assert.match(workerCliSource, /registerFileScanJobHandlers/, "separate worker startup should register file scan handlers");
  assert.match(workerCliSource, /registerFutureImportJobHandlers/, "separate worker startup should register future import handlers");
  assert.match(regressionSuite, /scripts\/background-work-jobs-regression\.mjs/, "regression suite should include background work job coverage");
  assert.match(roadmap, /Version 0\.33\.5\.21\.6 - Move reminders, recurrence, and file scanning to jobs[\s\S]*\[x\] Add regressions for each job type/, "roadmap should mark background work jobs complete");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the background work jobs slice");
  assert.match(architectureDocs, /As of 0\.33\.5\.21\.6[\s\S]*task\.reminder[\s\S]*task\.recurrence[\s\S]*file\.scan[\s\S]*import\.future/, "architecture docs should document background work jobs");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.6[\s\S]*task\.reminder[\s\S]*task\.recurrence[\s\S]*file\.scan[\s\S]*import\.future/, "database docs should document background work jobs");
  assert.match(runtimeDocs, /As of 0\.33\.5\.21\.7\.4[\s\S]*LONGTAIL_WORKER_MODE/, "runtime docs should document worker mode for background work jobs");

  await initializeDatabase();
  registerSearchIndexJobHandlers({ replace: true });
  registerTaskJobHandlers({ replace: true });
  filesService.registerFileScanJobHandlers({ replace: true });
  registerFutureImportJobHandlers({ replace: true });
  const session = await readSeedSession();

  await assertTaskReminderJobsFireDueSoon(session);
  await assertRecurrenceJobsCreateNextInstanceOnce(session);
  await assertFileScanJobsAreDurableAndIdempotent(session);
  await assertFutureImportJobIsReservedAndSafe(session);
  await assertIntegrity();

  console.log("Background work jobs regression passed.");
} finally {
  await stopJobWorker().catch(() => {});
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertTaskReminderJobsFireDueSoon(session) {
  const due = localDateTimeParts(addMinutes(new Date(), 6), session.timezone);
  const capturedEvents = [];
  const unsubscribe = modulesService.onInternalEvent("task.due_soon", async (event) => {
    capturedEvents.push(event);
  }, {
    id: "background-work-jobs-regression:task.due_soon",
    moduleId: "test",
  });

  try {
    const task = (await tasksService.create({
      assignee_ids: [session.user_id],
      due_date: due.date,
      due_time: due.time,
      reminderOverrideEnabled: true,
      reminderPolicy: {
        dateTime: [5],
        dateOnly: [1440],
      },
      title: "Worker-fired reminder task",
    }, session)).task;
    const reminderJob = await readLatestJob(session.workspace_id, "task.reminder", task.task_id);

    assert.equal(reminderJob.status, "pending");
    assert.match(reminderJob.payload_json, /"operation":"fire_reminder"/);
    await runSql(`
UPDATE jobs
SET available_at = ${sqlText(new Date().toISOString())}
WHERE job_id = ${sqlText(reminderJob.job_id)};
`);

    const summary = await runJobWorkerOnce({
      claimLimit: 1,
      mode: "inline",
      workerId: "background-work-jobs-regression",
    });
    const completedJob = await readJobById(reminderJob.job_id);

    assert.equal(summary.completed, 1);
    assert.equal(completedJob.status, "completed");
    assert.equal(capturedEvents.length, 1);
    assert.equal(capturedEvents[0].record_id, task.task_id);
    assert.equal(capturedEvents[0].metadata.offset_minutes, 5);
    assert.equal(capturedEvents[0].metadata.source, "task_reminder_job");
  } finally {
    unsubscribe();
  }
}

async function assertRecurrenceJobsCreateNextInstanceOnce(session) {
  const task = (await tasksService.create({
    due_date: "2026-08-03",
    recurrence: {
      enabled: true,
      endDate: "2026-08-10",
      frequency: "DAILY",
      interval: 1,
    },
    title: "Worker recurrence task",
  }, session)).task;
  const completed = await tasksService.complete(task.task_id, session);
  const recurrenceJob = await readLatestJob(session.workspace_id, "task.recurrence", task.task_id);

  assert.equal(completed.createdTask, null);
  assert.equal(completed.recurrenceJob.queued, true);
  assert.equal(recurrenceJob.status, "pending");
  assert.equal(await recurrenceInstanceCount(session.workspace_id, task.recurrence_template_id, "2026-08-04"), 0);

  const firstSummary = await runJobWorkerOnce({
    claimLimit: 10,
    mode: "inline",
    workerId: "background-work-jobs-regression",
  });
  assert.ok(firstSummary.completed >= 1, "worker should process the recurrence job");
  assert.equal(await recurrenceInstanceCount(session.workspace_id, task.recurrence_template_id, "2026-08-04"), 1);

  await runSql(`
UPDATE jobs
SET status = 'pending',
    completed_at = NULL,
    available_at = ${sqlText(new Date().toISOString())}
WHERE job_id = ${sqlText(recurrenceJob.job_id)};
`);
  await runJobWorkerOnce({
    claimLimit: 10,
    mode: "inline",
    workerId: "background-work-jobs-regression",
  });
  assert.equal(await recurrenceInstanceCount(session.workspace_id, task.recurrence_template_id, "2026-08-04"), 1, "rerunning recurrence generation should not duplicate the next instance");
}

async function assertFileScanJobsAreDurableAndIdempotent(session) {
  const task = (await tasksService.create({
    title: "File scan job target",
  }, session)).task;
  const upload = await filesService.uploadAndAttach(session, {
    contentBase64: Buffer.from("file scan job body").toString("base64"),
    moduleId: "tasks",
    originalFilename: "scan-job.txt",
    targetId: task.task_id,
    targetType: "task",
  });
  const fileId = upload.file.fileId;
  const scanJob = await readLatestJob(session.workspace_id, "file.scan", fileId);

  assert.equal(scanJob.status, "pending");
  assert.equal(upload.file.status, "pending", "upload should leave file availability to the durable scan job");
  assert.equal(upload.file.scanStatus, "pending", "upload should leave scan completion to the durable scan job");

  const summary = await runJobWorkerOnce({
    claimLimit: 10,
    mode: "inline",
    workerId: "background-work-jobs-regression",
  });
  const fileAfterWorker = await readFileRow(fileId);

  assert.ok(summary.completed >= 1, "worker should process the file scan job");
  assert.equal(fileAfterWorker.status, "available");
  assert.equal(fileAfterWorker.scan_status, "passed");

  await runSql(`
UPDATE jobs
SET status = 'pending',
    completed_at = NULL,
    available_at = ${sqlText(new Date().toISOString())}
WHERE job_id = ${sqlText(scanJob.job_id)};
`);
  await runJobWorkerOnce({
    claimLimit: 10,
    mode: "inline",
    workerId: "background-work-jobs-regression",
  });
  const fileAfterSecondRun = await readFileRow(fileId);

  assert.equal(fileAfterSecondRun.status, "available", "rerunning a scan job for an already scanned file should be harmless");
  assert.equal(fileAfterSecondRun.scan_status, "passed");
}

async function assertFutureImportJobIsReservedAndSafe(session) {
  const result = await queueFutureImportJob({
    source: "background-work-regression",
    workspaceId: session.workspace_id,
  });

  assert.equal(result.queued, true);
  const summary = await runJobWorkerOnce({
    claimLimit: 10,
    mode: "inline",
    workerId: "background-work-jobs-regression",
  });
  const job = await readJobById(result.jobId);

  assert.ok(summary.completed >= 1, "worker should complete the reserved import job");
  assert.equal(job.status, "completed");
  assert.match(job.payload_json, /"operation":"reserved_import"/);
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

async function readLatestJob(workspaceId, jobType, payloadNeedle) {
  const rows = await querySql(`
SELECT *
FROM jobs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND job_type = ${sqlText(jobType)}
  AND payload_json LIKE ${sqlText(`%${payloadNeedle}%`)}
ORDER BY updated_at DESC, created_at DESC
LIMIT 1;
`);

  assert.ok(rows[0], `expected ${jobType} job containing ${payloadNeedle}`);
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

async function readFileRow(fileId) {
  const rows = await querySql(`
SELECT status, scan_status
FROM files
WHERE file_id = ${sqlText(fileId)}
LIMIT 1;
`);

  assert.ok(rows[0], `expected file ${fileId}`);
  return rows[0];
}

async function recurrenceInstanceCount(workspaceId, templateId, instanceDate) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM tasks
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recurrence_template_id = ${sqlText(templateId)}
  AND recurrence_instance_date = ${sqlText(instanceDate)};
`);

  return Number(rows[0]?.count || 0);
}

async function assertIntegrity() {
  const rows = await db.query("PRAGMA integrity_check;");
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

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
