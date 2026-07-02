import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { clearTimeout, setTimeout } from "node:timers";

const root = process.cwd();
const appVersion = "0.33.5.21.7.6";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-separate-worker-e2e-"));
const dataDir = path.join(tempDir, "data");
const databaseFile = path.join(dataDir, "longtail-forge-separate-worker-e2e.db");
process.env.LONGTAIL_DATA_DIR = dataDir;
process.env.LONGTAIL_DATABASE_FILE = databaseFile;
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.LONGTAIL_JOB_POLL_INTERVAL_MS = "1000";
process.env.LONGTAIL_WORKER_ID = "regression-main-process";
process.env.SUPER_ADMIN_PASSWORD = "Separate-Worker-E2E-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const architectureDocs = readText("docs/architecture.md");
const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
const appSource = readText("src/core/app.js");
const dbIndexSource = readText("src/db/index.js");
const workerCliSource = readText("src/core/jobs/worker-cli.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { modulesService } = await import("../src/core/modules/modules.service.js");
const { closeDatabase, db, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { notificationsService } = await import("../src/services/notifications.service.js");
const { filesService } = await import("../src/services/files.service.js");

let worker = null;

try {
  assertStaticContract();
  assertWorkerSchemaReadinessFailsBeforeMigrations();

  await initializeDatabase();
  const fixtures = await seedFixtures();
  const targets = await seedDurableWork(fixtures);

  await assertWrongWorkerModesDoNotDrainJobs(targets);
  worker = await startSeparateWorkerProcess();
  await assertSecondWorkerIsRejected();
  await waitForTargetJobs(targets);
  await assertSeparateWorkerSideEffects(fixtures, targets);
  await stopSeparateWorkerProcess(worker);
  worker = null;
  await assertIntegrity();

  console.log("Separate worker end-to-end regression passed.");
} finally {
  if (worker) {
    await stopSeparateWorkerProcess(worker, { force: true }).catch(() => {});
  }
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the separate-worker end-to-end version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the separate-worker end-to-end version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the separate-worker end-to-end version");

  assert.match(workerCliSource, /initializeWorkerDatabase/, "separate worker should verify worker schema readiness");
  assert.doesNotMatch(workerCliSource, /\binitializeDatabase\b/, "separate worker CLI must not own app migrations");
  assert.match(workerCliSource, /acquireWorkerProcessLock/, "separate worker should enforce the one-local-worker SQLite boundary");
  assert.match(workerCliSource, /registerSearchIndexJobHandlers/, "separate worker should register search handlers");
  assert.match(workerCliSource, /registerTaskJobHandlers/, "separate worker should register task handlers");
  assert.match(workerCliSource, /registerFileScanJobHandlers/, "separate worker should register file scan handlers");
  assert.match(workerCliSource, /registerNotificationJobHandlers/, "separate worker should register notification handlers");
  assert.match(workerCliSource, /registerFutureImportJobHandlers/, "separate worker should register reserved import handlers");
  assert.match(workerCliSource, /queueTaskReminderSweepJobs/, "separate worker startup should queue reminder sweeps");
  assert.match(workerCliSource, /jobsService\.pruneOldJobs/, "separate worker startup should run retention pruning");
  assert.doesNotMatch(functionBlock(dbIndexSource, "initializeWorkerDatabase"), /runMigrations|runAppStartupMaintenance/, "worker database startup should not run migrations or app defaults");
  assert.match(appSource, /config\.worker\.mode === "separate"[\s\S]*state=external/, "app separate mode should leave processing to node worker.js");
  assert.match(appSource, /config\.worker\.mode === "disabled"[\s\S]*state=disabled/, "app disabled mode should report that jobs will not process");
  assert.match(regressionSuite, /scripts\/separate-worker-end-to-end-regression\.mjs/, "regression suite should include separate-worker end-to-end coverage");
  assert.match(roadmap, /Version 0\.33\.5\.21\.7\.6 - Separate-worker end-to-end validation[\s\S]*\[x\] Add a regression that runs the `separate` worker/, "roadmap should mark separate-worker validation complete");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the separate-worker end-to-end slice");
  assert.match(architectureDocs, /0\.33\.5\.21\.7\.6[\s\S]*separate worker/i, "architecture docs should document separate-worker validation");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.7\.6[\s\S]*separate worker/i, "database docs should document separate-worker validation");
  assert.match(runtimeDocs, /As of 0\.33\.5\.21\.7\.6[\s\S]*separate worker/i, "runtime docs should document the proved separate-worker behavior");
  assert.match(sqliteDocs, /As of 0\.33\.5\.21\.7\.6[\s\S]*one local worker/i, "SQLite docs should document the proved one-worker validation");
}

function assertWorkerSchemaReadinessFailsBeforeMigrations() {
  const missingDir = path.join(tempDir, "missing-schema");
  const missingDatabase = path.join(missingDir, "missing.db");
  const child = spawnSync(process.execPath, ["worker.js"], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv({
      LONGTAIL_DATA_DIR: missingDir,
      LONGTAIL_DATABASE_FILE: missingDatabase,
      LONGTAIL_WORKER_ID: "missing-schema-worker",
      LONGTAIL_WORKER_MODE: "separate",
      SUPER_ADMIN_PASSWORD: "Separate-Worker-Missing-Schema-123!",
    }),
    timeout: 15_000,
  });

  assert.notEqual(child.status, 0, "separate worker should fail before migrations have run");
  assert.match(child.stderr || child.stdout, /Worker schema is not ready/, "missing schema failure should direct operators to app or maintenance migrations");
}

async function seedDurableWork(fixtures) {
  const due = localDateTimeParts(addMinutes(new Date(), 6), fixtures.session.timezone);
  const reminderTask = (await tasksService.create({
    assignee_ids: [fixtures.recipient.userId],
    due_date: due.date,
    due_time: due.time,
    reminderOverrideEnabled: true,
    reminderPolicy: {
      dateTime: [5],
      dateOnly: [1440],
    },
    title: "Separate worker reminder task",
  }, fixtures.session)).task;
  const reminderJob = await readLatestJob(fixtures.workspaceId, "task.reminder", reminderTask.task_id);
  await makeJobAvailable(reminderJob.job_id);

  const recurrenceTask = (await tasksService.create({
    due_date: "2026-08-03",
    recurrence: {
      enabled: true,
      endDate: "2026-08-10",
      frequency: "DAILY",
      interval: 1,
    },
    title: "Separate worker recurrence task",
  }, fixtures.session)).task;
  await tasksService.complete(recurrenceTask.task_id, fixtures.session);
  const recurrenceJob = await readLatestJob(fixtures.workspaceId, "task.recurrence", recurrenceTask.task_id);

  const fileTargetTask = (await tasksService.create({
    title: "Separate worker file target",
  }, fixtures.session)).task;
  const upload = await filesService.uploadAndAttach(fixtures.session, {
    contentBase64: Buffer.from("separate worker file body").toString("base64"),
    moduleId: "tasks",
    originalFilename: "separate-worker.txt",
    targetId: fileTargetTask.task_id,
    targetType: "task",
  });
  const fileScanJob = await readLatestJob(fixtures.workspaceId, "file.scan", upload.file.fileId);

  const searchableTask = (await tasksService.create({
    description: "separate-worker-search-body",
    title: "Separate worker indexed task",
  }, fixtures.session)).task;
  const searchJob = await readLatestJob(fixtures.workspaceId, "search.index", searchableTask.task_id);

  const notificationDeclaration = modulesService.listNotificationEvents()
    .find((event) => event.id === "task.assigned");
  assert.ok(notificationDeclaration, "task.assigned notification declaration should be registered");
  const notificationResult = await notificationsService.queueNotificationEvent({
    actor_user_id: fixtures.admin.userId,
    metadata: {
      recipient_user_ids: [fixtures.recipient.userId],
    },
    module_id: "tasks",
    name: "task.assigned",
    new_value: {
      assignee_ids: [fixtures.recipient.userId],
      task_id: searchableTask.task_id,
      title: searchableTask.title,
    },
    record_id: searchableTask.task_id,
    record_type: "task",
    session: fixtures.session,
    workspace_id: fixtures.workspaceId,
  }, notificationDeclaration);
  assert.equal(notificationResult.queued, true, "notification event should queue durable fan-out");

  return {
    fileId: upload.file.fileId,
    fileScanJobId: fileScanJob.job_id,
    notificationJobId: notificationResult.jobId,
    notificationRecipientId: fixtures.recipient.userId,
    recurrenceJobId: recurrenceJob.job_id,
    recurrenceTemplateId: recurrenceTask.recurrence_template_id,
    reminderJobId: reminderJob.job_id,
    searchJobId: searchJob.job_id,
    searchableTaskId: searchableTask.task_id,
    workspaceId: fixtures.workspaceId,
  };
}

async function assertWrongWorkerModesDoNotDrainJobs(targets) {
  const before = await readJobStatuses(targetJobIds(targets));
  const disabled = spawnSync(process.execPath, ["worker.js"], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv({
      LONGTAIL_WORKER_MODE: "disabled",
      LONGTAIL_WORKER_ID: "disabled-separate-worker-regression",
    }),
    timeout: 15_000,
  });
  assert.equal(disabled.status, 0, disabled.stderr || disabled.stdout);
  assert.match(disabled.stdout, /\[job-worker\] mode=disabled state=disabled/, "disabled worker mode should explain that processing is off");
  assert.deepEqual(await readJobStatuses(targetJobIds(targets)), before, "disabled mode should not process queued jobs");

  const inline = spawnSync(process.execPath, ["worker.js"], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv({
      LONGTAIL_WORKER_MODE: "inline",
      LONGTAIL_WORKER_ID: "inline-separate-worker-regression",
    }),
    timeout: 15_000,
  });
  assert.notEqual(inline.status, 0, "worker.js should reject inline mode");
  assert.match(inline.stderr || inline.stdout, /requires LONGTAIL_WORKER_MODE=separate/, "inline worker.js failure should explain the correct process boundary");
  assert.deepEqual(await readJobStatuses(targetJobIds(targets)), before, "worker.js inline rejection should not process queued jobs");
}

async function startSeparateWorkerProcess() {
  const child = spawn(process.execPath, ["worker.js"], {
    cwd: root,
    env: cleanEnv({
      LONGTAIL_JOB_POLL_INTERVAL_MS: "1000",
      LONGTAIL_WORKER_ID: "separate-worker-e2e",
      LONGTAIL_WORKER_MODE: "separate",
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdoutText = "";
  child.stderrText = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    child.stdoutText += chunk;
  });
  child.stderr.on("data", (chunk) => {
    child.stderrText += chunk;
  });

  await waitFor(() => child.stdoutText.includes("[job-worker] acquired_lock="), {
    message: () => `separate worker did not acquire the SQLite worker lock.\nstdout:\n${child.stdoutText}\nstderr:\n${child.stderrText}`,
    timeoutMs: 15_000,
  });
  await waitFor(() => /mode=separate[\s\S]*timer=on/.test(child.stdoutText), {
    message: () => `separate worker did not start its poll timer.\nstdout:\n${child.stdoutText}\nstderr:\n${child.stderrText}`,
    timeoutMs: 15_000,
  });

  return child;
}

async function assertSecondWorkerIsRejected() {
  const second = spawnSync(process.execPath, ["worker.js"], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv({
      LONGTAIL_JOB_POLL_INTERVAL_MS: "1000",
      LONGTAIL_WORKER_ID: "second-separate-worker-e2e",
      LONGTAIL_WORKER_MODE: "separate",
    }),
    timeout: 15_000,
  });

  assert.notEqual(second.status, 0, "a second local SQLite worker should fail while the first worker owns the lock");
  assert.match(second.stderr || second.stdout, /at most one local worker process/, "second worker failure should explain the one-worker SQLite boundary");
}

async function waitForTargetJobs(targets) {
  await waitFor(async () => {
    const statuses = await readJobStatuses(targetJobIds(targets));
    return [...statuses.values()].every((status) => status === "completed");
  }, {
    message: async () => {
      const rows = await readJobRows(targetJobIds(targets));
      return `target jobs did not complete:\n${JSON.stringify(rows, null, 2)}\nworker stdout:\n${worker?.stdoutText || ""}\nworker stderr:\n${worker?.stderrText || ""}`;
    },
    timeoutMs: 45_000,
  });
}

async function assertSeparateWorkerSideEffects(fixtures, targets) {
  const searchRows = await querySql(`
SELECT title
FROM search_index
WHERE workspace_id = ${sqlText(targets.workspaceId)}
  AND module_id = 'tasks'
  AND record_type = 'task'
  AND record_id = ${sqlText(targets.searchableTaskId)};
`);
  assert.deepEqual(searchRows.map((row) => row.title), ["Separate worker indexed task"], "separate worker should run search.index jobs");

  const notifications = await querySql(`
SELECT notification_id
FROM notifications
WHERE workspace_id = ${sqlText(targets.workspaceId)}
  AND recipient_user_id = ${sqlText(targets.notificationRecipientId)}
  AND event_type = 'task.assigned'
  AND record_id = ${sqlText(targets.searchableTaskId)};
`);
  assert.equal(notifications.length, 1, "separate worker should run notification.event fan-out jobs");

  const recurrenceRows = await querySql(`
SELECT task_id
FROM tasks
WHERE workspace_id = ${sqlText(targets.workspaceId)}
  AND recurrence_template_id = ${sqlText(targets.recurrenceTemplateId)}
  AND recurrence_instance_date = '2026-08-04';
`);
  assert.equal(recurrenceRows.length, 1, "separate worker should create the next recurring task instance");

  const fileRows = await querySql(`
SELECT status, scan_status
FROM files
WHERE workspace_id = ${sqlText(targets.workspaceId)}
  AND file_id = ${sqlText(targets.fileId)}
LIMIT 1;
`);
  assert.equal(fileRows[0]?.status, "available", "separate worker should make scanned files available");
  assert.equal(fileRows[0]?.scan_status, "passed", "separate worker should mark scanned files passed");

  const reminderJob = await readJobById(targets.reminderJobId);
  assert.equal(reminderJob.status, "completed", "separate worker should complete due task reminders");

  const workerRows = await querySql(`
SELECT DISTINCT locked_by
FROM jobs
WHERE job_id IN (${targetJobIds(targets).map((jobId) => sqlText(jobId)).join(", ")})
ORDER BY locked_by;
`);
  assert.deepEqual(workerRows.map((row) => row.locked_by), [null], "completed jobs should release their worker locks");

  const attemptRows = await querySql(`
SELECT job_type, attempt_count
FROM jobs
WHERE job_id IN (${targetJobIds(targets).map((jobId) => sqlText(jobId)).join(", ")})
ORDER BY job_type;
`);
  assert.ok(attemptRows.every((row) => Number(row.attempt_count) >= 1), "separate worker should claim every target job at least once");
  assert.ok(fixtures.session.workspace_id, "fixture session should remain scoped to a workspace");
}

async function stopSeparateWorkerProcess(child, options = {}) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  try {
    await waitForChildExit(child, 10_000);
  } catch (error) {
    if (!options.force) {
      throw error;
    }
    child.kill("SIGKILL");
    await waitForChildExit(child, 10_000).catch(() => {});
  }
}

async function seedFixtures() {
  const admin = await db.get(`
SELECT user_id, username, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);
  assert.ok(admin?.user_id, "fresh database should seed a protected admin");

  const workspaceId = admin.active_workspace_id || admin.home_workspace_id;
  const recipient = {
    displayName: "separate worker recipient",
    userId: `separate-worker-recipient-${randomUUID()}`,
    username: `separate-worker-${randomUUID()}@example.test`,
  };
  const now = new Date().toISOString();

await runSql(`
${userInsertSql(workspaceId, recipient)}
${membershipInsertSql(workspaceId, recipient, now)}
${assignmentInsertSql(workspaceId, recipient.userId, "project_user", "workspace", workspaceId, now)}
`);

  return {
    admin: {
      userId: admin.user_id,
    },
    recipient,
    session: {
      active_workspace_id: workspaceId,
      home_workspace_id: admin.home_workspace_id,
      ip: "127.0.0.1",
      timezone: admin.timezone || "America/New_York",
      user_id: admin.user_id,
      username: admin.username,
      workspace_id: workspaceId,
    },
    workspaceId,
  };
}

async function makeJobAvailable(jobId) {
  await runSql(`
UPDATE jobs
SET available_at = ${sqlText(new Date().toISOString())}
WHERE job_id = ${sqlText(jobId)};
`);
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

async function readJobRows(jobIds) {
  return querySql(`
SELECT job_id, job_type, status, attempt_count, last_error
FROM jobs
WHERE job_id IN (${jobIds.map((jobId) => sqlText(jobId)).join(", ")})
ORDER BY job_type, job_id;
`);
}

async function readJobStatuses(jobIds) {
  const rows = await readJobRows(jobIds);
  return new Map(rows.map((row) => [row.job_id, row.status]));
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok", "separate worker regression database should pass integrity check");
}

function targetJobIds(targets) {
  return [
    targets.fileScanJobId,
    targets.notificationJobId,
    targets.recurrenceJobId,
    targets.reminderJobId,
    targets.searchJobId,
  ];
}

function userInsertSql(workspaceId, user) {
  return `
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(user.userId)},
  ${sqlText(workspaceId)},
  ${sqlText(user.username)},
  ${sqlText(user.displayName)},
  '',
  'America/New_York',
  'fixture-password',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);
`;
}

function membershipInsertSql(workspaceId, user, now) {
  return `
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
  ${sqlText(user.userId)},
  ${sqlText(workspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);
`;
}

function assignmentInsertSql(workspaceId, userId, roleId, scopeType, scopeId, now) {
  return `
INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  ${sqlText(roleId)},
  ${sqlText(scopeType)},
  ${sqlText(scopeId)},
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
`;
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

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

async function waitFor(check, options = {}) {
  const started = Date.now();
  const timeoutMs = options.timeoutMs || 10_000;
  const intervalMs = options.intervalMs || 250;

  while (Date.now() - started < timeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  const message = typeof options.message === "function" ? await options.message() : options.message;
  throw new Error(message || "Timed out waiting for condition.");
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null) {
    return Promise.resolve(child.exitCode);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      reject(new Error(`Child process did not exit within ${timeoutMs}ms.`));
    }, timeoutMs);
    const onExit = (code) => {
      clearTimeout(timer);
      resolve(code);
    };
    child.once("exit", onExit);
  });
}

function functionBlock(source, functionName) {
  const pattern = new RegExp(`async function ${functionName}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`);
  const match = source.match(pattern);
  return match ? match[0] : "";
}

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function cleanEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("LONGTAIL_") ||
      key.startsWith("SECURE_NOTES_") ||
      key === "DATABASE_URL" ||
      key === "HOST" ||
      key === "PORT" ||
      key === "SUPER_ADMIN_PASSWORD" ||
      key === "WORKSPACE_INSTALL_MODE" ||
      key === "WORKSPACE_TYPE_LIMIT"
    ) {
      delete env[key];
    }
  }

  return {
    ...env,
    LONGTAIL_DATA_DIR: dataDir,
    LONGTAIL_DATABASE_FILE: databaseFile,
    LONGTAIL_JOB_POLL_INTERVAL_MS: "1000",
    SUPER_ADMIN_PASSWORD: "Separate-Worker-E2E-Test-123!",
    ...overrides,
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
