import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.29.7";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-reminder-delivery-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-reminder-delivery.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Task-Reminder-Delivery-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const taskJobsSource = readText("src/modules/tasks/task-jobs.service.js");
const tasksModuleSource = readText("src/modules/tasks/module.js");
const tasksDocs = readText("docs/tasks-module.md");
const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
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

  const fixtures = await seedFixtures();

  await assertAssignedReminderNotifiesAssignee(fixtures);
  await assertUnassignedReminderNotifiesCreator(fixtures);
  await assertFollowedReminderNotifiesFollower(fixtures);
  await assertMutedResponsibleUserIsSkipped(fixtures);
  await assertIntegrity();

  console.log("Task reminder notification delivery regression passed.");
} finally {
  notificationsService.resetEventHandlersForTests();
  await stopJobWorker().catch(() => {});
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the reminder delivery version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the reminder delivery version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the reminder delivery version");
  assert.match(taskJobsSource, /recipient_user_ids:\s*taskReminderRecipientIds\(task\)/, "reminder jobs should pass explicit responsible recipients");
  assert.match(taskJobsSource, /function taskReminderRecipientIds/, "reminder jobs should resolve fallback creator recipients");
  assert.match(tasksModuleSource, /taskDueSoonNotificationTitle/, "task due-soon notifications should include useful due-soon titles");
  assert.match(tasksModuleSource, /Task "\$\{title\}" is due in \$\{offsetLabel\}\./, "task due-soon body should include the reminder offset");
  assert.match(regressionSuite, /scripts\/task-reminder-notification-delivery-regression\.mjs/, "regression suite should include reminder delivery coverage");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.21 durable jobs and outbox foundation work is archived in `ROADMAP-ARCHIVE\.md`/, "live roadmap should not carry completed-history breadcrumbs");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the reminder delivery slice");
  assert.match(tasksDocs, new RegExp(`current Tasks module behavior as of ${escapeRegExp(appVersion)}`), "Tasks docs should report the current implementation version");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.8[\s\S]*explicit reminder recipients/, "database docs should document reminder delivery recipients");
  assert.match(runtimeDocs, /0\.33\.5\.21\.8[\s\S]*task due reminders reach in-app notifications/, "runtime docs should document reminder delivery");
}

async function assertAssignedReminderNotifiesAssignee(fixtures) {
  resetJobWorkerStatusForTests();
  const task = await createReminderTask(fixtures.admin.session, {
    assigneeIds: [fixtures.assignee.userId],
    title: "Assigned reminder delivery task",
  });
  await drainDueJobs();

  const beforeAssigneeCount = await dueSoonNotificationCount(fixtures.workspaceId, fixtures.assignee.userId, task.task_id);
  const beforeCreatorCount = await dueSoonNotificationCount(fixtures.workspaceId, fixtures.admin.userId, task.task_id);

  await fireReminderAndDrain(fixtures.workspaceId, task.task_id);

  const assigneeNotifications = await dueSoonNotifications(fixtures.workspaceId, fixtures.assignee.userId, task.task_id);
  const creatorCount = await dueSoonNotificationCount(fixtures.workspaceId, fixtures.admin.userId, task.task_id);

  assert.equal(assigneeNotifications.length, beforeAssigneeCount + 1, "assigned reminder should notify the assignee");
  assert.equal(creatorCount, beforeCreatorCount, "assigned reminders should not add creator fallback delivery");
  assertReminderNotificationShape(assigneeNotifications[0], task.task_id);
  await assertNotificationSurfaceIncludes(fixtures.assignee.session, task.task_id);
}

async function assertUnassignedReminderNotifiesCreator(fixtures) {
  resetJobWorkerStatusForTests();
  const task = await createReminderTask(fixtures.admin.session, {
    assigneeIds: [],
    title: "Unassigned creator reminder delivery task",
  });
  await drainDueJobs();

  const beforeCreatorCount = await dueSoonNotificationCount(fixtures.workspaceId, fixtures.admin.userId, task.task_id);

  await fireReminderAndDrain(fixtures.workspaceId, task.task_id);

  const creatorNotifications = await dueSoonNotifications(fixtures.workspaceId, fixtures.admin.userId, task.task_id);

  assert.equal(creatorNotifications.length, beforeCreatorCount + 1, "unassigned reminder should notify the task creator");
  assertReminderNotificationShape(creatorNotifications[0], task.task_id);
  await assertNotificationSurfaceIncludes(fixtures.admin.session, task.task_id);
}

async function assertFollowedReminderNotifiesFollower(fixtures) {
  resetJobWorkerStatusForTests();
  const task = await createReminderTask(fixtures.admin.session, {
    assigneeIds: [fixtures.assignee.userId],
    title: "Followed reminder delivery task",
  });
  await drainDueJobs();

  await notificationsService.followTarget(fixtures.follower.session, {
    event_type: "task.due_soon",
    module_id: "tasks",
    target_id: task.task_id,
    target_type: "task",
  });

  const beforeAssigneeCount = await dueSoonNotificationCount(fixtures.workspaceId, fixtures.assignee.userId, task.task_id);
  const beforeFollowerCount = await dueSoonNotificationCount(fixtures.workspaceId, fixtures.follower.userId, task.task_id);

  await fireReminderAndDrain(fixtures.workspaceId, task.task_id);

  assert.equal(
    await dueSoonNotificationCount(fixtures.workspaceId, fixtures.assignee.userId, task.task_id),
    beforeAssigneeCount + 1,
    "followed assigned reminder should still notify the assignee",
  );
  assert.equal(
    await dueSoonNotificationCount(fixtures.workspaceId, fixtures.follower.userId, task.task_id),
    beforeFollowerCount + 1,
    "followed reminder should notify the follower through existing subscriptions",
  );
  await assertNotificationSurfaceIncludes(fixtures.follower.session, task.task_id);
}

async function assertMutedResponsibleUserIsSkipped(fixtures) {
  resetJobWorkerStatusForTests();
  const task = await createReminderTask(fixtures.admin.session, {
    assigneeIds: [fixtures.muted.userId],
    title: "Muted reminder delivery task",
  });
  await drainDueJobs();
  await saveUserPreference(fixtures.workspaceId, fixtures.muted.userId, "task.due_soon", false);

  await fireReminderAndDrain(fixtures.workspaceId, task.task_id);

  assert.equal(
    await dueSoonNotificationCount(fixtures.workspaceId, fixtures.muted.userId, task.task_id),
    0,
    "muted responsible users should not receive default reminder delivery",
  );
}

async function createReminderTask(session, options = {}) {
  const due = localDateTimeParts(addMinutes(new Date(), 6), session.timezone);
  const result = await tasksService.create({
    assignee_ids: options.assigneeIds || [],
    due_date: due.date,
    due_time: due.time,
    reminderOverrideEnabled: true,
    reminderPolicy: {
      dateOnly: [1440],
      dateTime: [5],
    },
    title: options.title,
  }, session);

  return result.task;
}

async function fireReminderAndDrain(workspaceId, taskId) {
  const reminderJob = await readReminderJob(workspaceId, taskId);
  await forceJobDue(reminderJob.job_id);
  await drainDueJobs({
    until: async () => (await dueSoonNotificationJobCount(workspaceId, taskId)) > 0,
  });
  await drainDueJobs();
}

async function drainDueJobs(options = {}) {
  for (let index = 0; index < (options.maxRuns || 30); index += 1) {
    if (options.until && await options.until()) {
      return;
    }

    const summary = await runJobWorkerOnce({
      claimLimit: 5,
      mode: "inline",
      workerId: "task-reminder-delivery-regression",
    });

    if (options.until && await options.until()) {
      return;
    }

    if (summary.claimed === 0) {
      if (options.until) {
        assert.fail("Worker drained due jobs before the reminder delivery condition was met.");
      }
      return;
    }
  }

  assert.fail("Worker did not drain due jobs within the expected run limit.");
}

async function seedFixtures() {
  const adminSession = await readSeedSession();
  const users = {
    assignee: await createWorkspaceUser(adminSession.workspace_id, "assignee"),
    follower: await createWorkspaceUser(adminSession.workspace_id, "follower"),
    muted: await createWorkspaceUser(adminSession.workspace_id, "muted"),
  };

  return {
    admin: {
      session: adminSession,
      userId: adminSession.user_id,
    },
    ...users,
    workspaceId: adminSession.workspace_id,
  };
}

async function createWorkspaceUser(workspaceId, label) {
  const now = new Date().toISOString();
  const user = {
    displayName: `Reminder delivery ${label}`,
    userId: `user-reminder-delivery-${label}-${randomUUID()}`,
    username: `reminder-delivery-${label}-${randomUUID()}@example.test`,
  };

  await runSql(`
${userInsertSql(workspaceId, user)}
${membershipInsertSql(workspaceId, user, now)}
${assignmentInsertSql(workspaceId, user.userId, "workspace_admin", "workspace", workspaceId, now)}
`);

  return {
    ...user,
    session: {
      ip: "127.0.0.1",
      timezone: "America/New_York",
      user_id: user.userId,
      username: user.username,
      workspace_id: workspaceId,
    },
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

async function dueSoonNotificationJobCount(workspaceId, taskId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM jobs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND job_type = 'notification.event'
  AND payload_json LIKE ${sqlText(`%"name":"task.due_soon"%`)}
  AND payload_json LIKE ${sqlText(`%${taskId}%`)};
`);

  return Number(rows[0]?.count || 0);
}

async function dueSoonNotifications(workspaceId, recipientUserId, taskId) {
  return querySql(`
SELECT *
FROM notifications
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recipient_user_id = ${sqlText(recipientUserId)}
  AND event_type = 'task.due_soon'
  AND record_id = ${sqlText(taskId)}
ORDER BY created_at DESC, notification_id DESC;
`);
}

async function dueSoonNotificationCount(workspaceId, recipientUserId, taskId) {
  return (await dueSoonNotifications(workspaceId, recipientUserId, taskId)).length;
}

async function forceJobDue(jobId) {
  await runSql(`
UPDATE jobs
SET available_at = ${sqlText(new Date().toISOString())}
WHERE job_id = ${sqlText(jobId)};
`);
}

async function saveUserPreference(workspaceId, userId, eventType, enabled) {
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO notification_user_preferences (workspace_id, user_id, event_type, enabled, created_at, updated_at)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  ${sqlText(eventType)},
  ${enabled ? 1 : 0},
  ${sqlText(now)},
  ${sqlText(now)}
)
ON CONFLICT(workspace_id, user_id, event_type) DO UPDATE SET
  enabled = excluded.enabled,
  updated_at = excluded.updated_at;
`);
}

async function assertNotificationSurfaceIncludes(session, taskId) {
  const [listResult, unread] = await Promise.all([
    notificationsService.list(session, {
      eventType: "task.due_soon",
      limit: 10,
      status: "active",
    }),
    notificationsService.unreadCount(session),
  ]);

  assert.ok(
    listResult.notifications.some((notification) => notification.record_id === taskId && notification.url === `tasks.html?task=${encodeURIComponent(taskId)}`),
    "notification list surface should include the reminder notification with a task link",
  );
  assert.ok(unread.totalUnreadCount >= 1, "unread count should include the reminder notification");
  assert.ok(unread.highPriorityCount >= 1, "bell summary should include the high-priority reminder");
}

function assertReminderNotificationShape(notification, taskId) {
  assert.equal(notification.event_type, "task.due_soon");
  assert.equal(notification.priority, "high");
  assert.equal(notification.record_id, taskId);
  assert.equal(notification.url, `tasks.html?task=${encodeURIComponent(taskId)}`);
  assert.match(notification.title, /Due in 5 minutes:/);
  assert.match(notification.body, /due in 5 minutes/);
  assert.match(notification.metadata_json, /notification_delivery_key/);
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok", "SQLite integrity check should pass");
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
  user_id,
  role_id,
  workspace_id,
  scope_type,
  scope_id,
  project_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(userId)},
  ${sqlText(roleId)},
  ${sqlText(workspaceId)},
  ${sqlText(scopeType)},
  ${sqlText(scopeId)},
  ${scopedProjectId ? sqlText(scopedProjectId) : "NULL"},
  ${sqlText(now)},
  ${sqlText(now)}
);`;
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
