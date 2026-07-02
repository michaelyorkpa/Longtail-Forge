import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.21.7.4";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notification-jobs-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notification-jobs.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Notification-Jobs-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const architectureDocs = readText("docs/architecture.md");
const databaseDocs = readText("docs/database.md");
const moduleDocs = readText("docs/module-development.md");
const notificationsSource = readText("src/services/notifications.service.js");
const workerCliSource = readText("src/core/jobs/worker-cli.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { modulesService } = await import("../src/core/modules/modules.service.js");
const {
  resetJobWorkerStatusForTests,
  runJobWorkerOnce,
  stopJobWorker,
} = await import("../src/core/jobs/index.js");
const { closeDatabase, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { notificationsService } = await import("../src/services/notifications.service.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the notification jobs version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the notification jobs version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the notification jobs version");

  assert.match(notificationsSource, /NOTIFICATION_EVENT_JOB_TYPE = "notification\.event"/, "notifications should declare one durable event job type");
  assert.match(notificationsSource, /registerJobHandler\(NOTIFICATION_EVENT_JOB_TYPE/, "notifications should register a worker handler");
  assert.match(notificationsSource, /queueNotificationEvent\(event, declaration\)/, "notification event handlers should queue jobs");
  assert.match(notificationsSource, /return createFromEvent\(event, declaration, \{ job \}\)/, "notification jobs should reuse the fan-out path with job retry context");
  assert.match(workerCliSource, /registerNotificationJobHandlers/, "separate worker startup should register notification job handlers");
  assert.match(regressionSuite, /scripts\/notification-jobs-regression\.mjs/, "regression suite should include notification job coverage");
  assert.match(roadmap, /Version 0\.33\.5\.21\.5 - Move notification fan-out to jobs[\s\S]*\[x\] Failed fan-out jobs retry safely/, "roadmap should mark notification fan-out jobs complete");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the notification jobs slice");
  assert.match(architectureDocs, /As of 0\.33\.5\.21\.5[\s\S]*notification\.event/, "architecture docs should document notification fan-out jobs");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.5[\s\S]*Notification fan-out uses the durable job runner/, "database docs should document the notification job handoff");
  assert.match(moduleDocs, /Notification-producing internal events are queued as durable jobs/, "module docs should document queued notification fan-out");

  await initializeDatabase();
  notificationsService.registerNotificationJobHandlers({ replace: true });
  notificationsService.registerEventHandlers();
  const fixtures = await seedFixtures();

  await assertNotificationEventQueuesAndWorkerResolvesRecipients(fixtures);
  await assertDisabledModulesDoNotFanOutFromWorker(fixtures);
  await assertFailedFanoutJobsRetrySafely(fixtures);
  await assertIntegrity();

  console.log("Notification jobs regression passed.");
} finally {
  notificationsService.resetEventHandlersForTests();
  await stopJobWorker().catch(() => {});
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertNotificationEventQueuesAndWorkerResolvesRecipients(fixtures) {
  resetJobWorkerStatusForTests();
  const beforeRows = await notificationCountFor(fixtures.workspaceId, fixtures.recipient.userId, "task.assigned");
  await emitTaskEvent("task.assigned", fixtures, {
    assigneeIds: [fixtures.recipient.userId],
    taskId: "notification-job-queued-task",
    title: "Notification job queued task",
  });
  const queuedJob = await readLatestNotificationJob(fixtures.workspaceId, "task.assigned");
  const queuedRows = await notificationCountFor(fixtures.workspaceId, fixtures.recipient.userId, "task.assigned");

  assert.equal(queuedJob.status, "pending");
  assert.match(queuedJob.payload_json, /"operation":"process_event"/);
  assert.equal(queuedRows, beforeRows, "event emission should only queue notification fan-out");

  const summary = await runJobWorkerOnce({
    claimLimit: 5,
    mode: "inline",
    workerId: "notification-jobs-regression",
  });
  const afterRows = await notificationCountFor(fixtures.workspaceId, fixtures.recipient.userId, "task.assigned");
  const completedJob = await readJobById(queuedJob.job_id);

  assert.equal(summary.completed, 1);
  assert.equal(completedJob.status, "completed");
  assert.equal(afterRows, beforeRows + 1, "worker should resolve recipients and create notifications");
}

async function assertDisabledModulesDoNotFanOutFromWorker(fixtures) {
  resetJobWorkerStatusForTests();
  const beforeRows = await totalNotificationCountFor(fixtures.workspaceId, "note.updated");
  const now = new Date().toISOString();
  await runSql(`
UPDATE workspace_modules
SET status = 'disabled',
    disabled_at = ${sqlText(now)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND module_id = 'notes';
`);

  await modulesService.emitInternalEvent("note.updated", {
    actorUserId: fixtures.admin.userId,
    metadata: {
      recipient_user_ids: [fixtures.recipient.userId],
    },
    moduleId: "notes",
    newValue: {
      note_id: "disabled-note-notification-job",
      title: "Disabled note notification job",
    },
    recordId: "disabled-note-notification-job",
    recordType: "note",
    session: fixtures.admin.session,
    workspaceId: fixtures.workspaceId,
  });
  const queuedJob = await readLatestNotificationJob(fixtures.workspaceId, "disabled-note-notification-job");

  assert.equal(queuedJob.status, "pending", "disabled-module fan-out should still be a worker decision");

  const summary = await runJobWorkerOnce({
    claimLimit: 5,
    mode: "inline",
    workerId: "notification-jobs-regression",
  });
  const afterRows = await totalNotificationCountFor(fixtures.workspaceId, "note.updated");
  const completedJob = await readJobById(queuedJob.job_id);

  assert.equal(summary.completed, 1);
  assert.equal(completedJob.status, "completed");
  assert.equal(afterRows, beforeRows, "worker should skip fan-out for disabled modules");
}

async function assertFailedFanoutJobsRetrySafely(fixtures) {
  resetJobWorkerStatusForTests();
  const beforeRows = await totalNotificationCountFor(fixtures.workspaceId, "task.assigned");
  const beforeRun = Date.now();
  await emitTaskEvent("task.assigned", fixtures, {
    explicitRecipientIds: ["missing-notification-recipient"],
    taskId: "notification-job-retry-task",
    title: "Notification job retry task",
  });

  const summary = await runJobWorkerOnce({
    claimLimit: 1,
    mode: "inline",
    workerId: "notification-jobs-regression",
  });
  const failedJob = await readLatestNotificationJob(fixtures.workspaceId, "notification-job-retry-task");
  const afterRows = await totalNotificationCountFor(fixtures.workspaceId, "task.assigned");

  assert.equal(summary.failed, 1);
  assert.equal(failedJob.status, "failed");
  assert.equal(failedJob.attempt_count, 1);
  assert.match(failedJob.last_error, /Notification recipient not found/);
  assert.ok(Date.parse(failedJob.available_at) > beforeRun, "failed notification jobs should retry later");
  assert.equal(afterRows, beforeRows, "failed fan-out should not create partial notification rows");
}

async function emitTaskEvent(eventName, fixtures, options = {}) {
  await modulesService.emitInternalEvent(eventName, {
    actorUserId: fixtures.admin.userId,
    metadata: options.explicitRecipientIds ? {
      recipient_user_ids: options.explicitRecipientIds,
    } : {},
    moduleId: "tasks",
    newValue: {
      assignee_ids: options.assigneeIds || [],
      task_id: options.taskId,
      title: options.title,
    },
    recordId: options.taskId,
    recordType: "task",
    session: fixtures.admin.session,
    workspaceId: fixtures.workspaceId,
  });
}

async function seedFixtures() {
  const workspaceId = (await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;"))[0].workspace_id;
  const superAdmin = (await querySql(`
SELECT user_id, username, timezone
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND protected_user = 'yes'
LIMIT 1;
`))[0];
  const now = new Date().toISOString();
  const recipient = {
    displayName: "notification jobs recipient",
    userId: `user-notification-jobs-${randomUUID()}`,
    username: `notification-jobs-${randomUUID()}@example.test`,
  };

  await runSql(`
${userInsertSql(workspaceId, recipient)}
${membershipInsertSql(workspaceId, recipient, now)}
${assignmentInsertSql(workspaceId, recipient.userId, "project_user", "workspace", workspaceId, now)}
`);

  return {
    admin: {
      session: {
        user_id: superAdmin.user_id,
        username: superAdmin.username,
        workspace_id: workspaceId,
      },
      userId: superAdmin.user_id,
    },
    recipient,
    workspaceId,
  };
}

async function readLatestNotificationJob(workspaceId, payloadNeedle) {
  const row = await querySql(`
SELECT *
FROM jobs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND job_type = 'notification.event'
  AND payload_json LIKE ${sqlText(`%${payloadNeedle}%`)}
ORDER BY updated_at DESC, created_at DESC
LIMIT 1;
`);

  assert.ok(row[0], `expected notification job containing ${payloadNeedle}`);
  return row[0];
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

async function notificationCountFor(workspaceId, recipientUserId, eventType) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM notifications
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recipient_user_id = ${sqlText(recipientUserId)}
  AND event_type = ${sqlText(eventType)};
`);

  return Number(rows[0]?.count || 0);
}

async function totalNotificationCountFor(workspaceId, eventType) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM notifications
WHERE workspace_id = ${sqlText(workspaceId)}
  AND event_type = ${sqlText(eventType)};
`);

  return Number(rows[0]?.count || 0);
}

async function assertIntegrity() {
  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "notification jobs regression database should pass integrity check");
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
  '!',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);`;
}

function membershipInsertSql(workspaceId, user, now) {
  return `
INSERT INTO user_workspaces (user_workspace_id, workspace_id, user_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(workspaceId)}, ${sqlText(user.userId)}, 'active', ${sqlText(now)}, ${sqlText(now)});`;
}

function assignmentInsertSql(workspaceId, userId, roleId, scopeType, scopeId, now) {
  const scopedProjectId = scopeType === "project" ? scopeId : null;

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
  ${scopedProjectId ? sqlText(scopedProjectId) : "NULL"},
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
