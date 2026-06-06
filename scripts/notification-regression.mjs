/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notification-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notification-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Notification-Test-Password-123!";

const { createApp } = await import("../src/core/app.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { notificationsService } = await import("../src/services/notifications.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

const results = [];
let server;

try {
  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const baseUrl = `http://${server.address().address}:${server.address().port}`;
  const api = createApi(baseUrl);

  await runNotificationApiTests(api, fixtures);
  await runNotificationPreferenceTests(api, fixtures);
  await runNotificationEventTests(fixtures);
  await runDisabledModuleTests(fixtures);

  console.log(`Notification regression passed ${results.length} checks.`);
} finally {
  notificationsService.resetEventHandlersForTests();
  if (server) {
    await closeServer(server);
  }

  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function seedFixtures() {
  const workspaceId = (await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;"))[0].workspace_id;
  const superAdmin = (await querySql(`
SELECT user_id, username
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND protected_user = 'yes'
LIMIT 1;
`))[0];
  const now = new Date().toISOString();
  const users = {
    workspaceAdmin: userFixture("notification-admin"),
    projectUser: userFixture("notification-project-user"),
    otherProjectUser: userFixture("notification-other-project-user"),
  };
  const project = {
    id: `notification-project-${randomUUID()}`,
    name: "Notification Project",
  };
  const otherProject = {
    id: `notification-other-project-${randomUUID()}`,
    name: "Other Notification Project",
  };

  await runSql(`
${Object.values(users).map((user) => userInsertSql(workspaceId, user)).join("\n")}
${Object.values(users).map((user) => membershipInsertSql(workspaceId, user, now)).join("\n")}
${projectInsertSql(workspaceId, project, now)}
${projectInsertSql(workspaceId, otherProject, now)}
${assignmentInsertSql(workspaceId, users.workspaceAdmin.userId, "workspace_admin", "workspace", workspaceId, now)}
${assignmentInsertSql(workspaceId, users.projectUser.userId, "project_user", "project", project.id, now)}
${assignmentInsertSql(workspaceId, users.otherProjectUser.userId, "project_user", "project", otherProject.id, now)}
`);

  return {
    project,
    otherProject,
    sessions: {
      workspaceAdmin: await createSession(workspaceId, users.workspaceAdmin.userId, users.workspaceAdmin.username),
      projectUser: await createSession(workspaceId, users.projectUser.userId, users.projectUser.username),
      otherProjectUser: await createSession(workspaceId, users.otherProjectUser.userId, users.otherProjectUser.username),
      superAdmin: await createSession(workspaceId, superAdmin.user_id, superAdmin.username),
    },
    superAdmin,
    users,
    workspaceId,
  };
}

async function runNotificationApiTests(api, fixtures) {
  const task = await api.post("/api/tasks", {
    assignee_ids: [fixtures.users.projectUser.userId],
    project_id: fixtures.project.id,
    title: "Notification regression task",
  }, { cookie: fixtures.sessions.workspaceAdmin });

  check("task creation used for notification regression succeeds", () => {
    assert.equal(task.status, 201, JSON.stringify(task.body));
  });

  const recipientList = await api.get("/api/notifications", { cookie: fixtures.sessions.projectUser });
  check("recipient sees task-created notification", () => {
    assert.equal(recipientList.status, 200, JSON.stringify(recipientList.body));
    assert.equal(recipientList.body.notifications.length, 1);
    assert.equal(recipientList.body.notifications[0].event_type, "task.created");
    assert.equal(recipientList.body.notifications[0].status, "unread");
    assert.match(recipientList.body.notifications[0].url, /^tasks\.html\?task=/);
  });

  const notificationId = recipientList.body.notifications[0].notification_id;
  const adminList = await api.get("/api/notifications", { cookie: fixtures.sessions.workspaceAdmin });
  check("non-recipient does not see another user's notification", () => {
    assert.equal(adminList.status, 200, JSON.stringify(adminList.body));
    assert.equal(adminList.body.notifications.length, 0);
  });

  const unreadCount = await api.get("/api/notifications/unread-count", { cookie: fixtures.sessions.projectUser });
  check("unread count starts at one", () => {
    assert.equal(unreadCount.status, 200, JSON.stringify(unreadCount.body));
    assert.equal(unreadCount.body.unreadCount, 1);
  });

  const shell = await api.get("/api/app-shell/bootstrap", { cookie: fixtures.sessions.projectUser });
  check("app shell bootstrap exposes unread notification count", () => {
    assert.equal(shell.status, 200, JSON.stringify(shell.body));
    assert.equal(shell.body.notificationSummary.unreadCount, 1);
  });

  const page = await api.get("/notifications.html", { cookie: fixtures.sessions.projectUser });
  check("protected notifications page loads for authenticated users", () => {
    assert.equal(page.status, 200, String(page.body).slice(0, 120));
    assert.match(String(page.body), /data-notification-page-list/);
  });

  const readResult = await api.post(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {}, {
    cookie: fixtures.sessions.projectUser,
  });
  check("recipient can mark own notification read", () => {
    assert.equal(readResult.status, 200, JSON.stringify(readResult.body));
    assert.equal(readResult.body.notification.status, "read");
    assert.ok(readResult.body.notification.read_at);
  });

  const deniedRead = await api.post(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {}, {
    cookie: fixtures.sessions.workspaceAdmin,
  });
  check("non-recipient cannot mark another user's notification read", () => {
    assert.equal(deniedRead.status, 404, JSON.stringify(deniedRead.body));
  });

  const dismissResult = await api.post(`/api/notifications/${encodeURIComponent(notificationId)}/dismiss`, {}, {
    cookie: fixtures.sessions.projectUser,
  });
  check("recipient can dismiss own notification", () => {
    assert.equal(dismissResult.status, 200, JSON.stringify(dismissResult.body));
    assert.equal(dismissResult.body.notification.status, "dismissed");
    assert.ok(dismissResult.body.notification.dismissed_at);
  });

  const hiddenTarget = await notificationsService.create({
    body: "A task target outside this user's project scope.",
    event_type: "task.updated",
    module_id: "tasks",
    recipient_user_id: fixtures.users.otherProjectUser.userId,
    record_id: task.body.task.task_id,
    record_type: "task",
    title: "Hidden task target",
    url: `tasks.html?task=${encodeURIComponent(task.body.task.task_id)}`,
    workspace_id: fixtures.workspaceId,
  }, {
    user_id: fixtures.users.workspaceAdmin.userId,
    workspace_id: fixtures.workspaceId,
  });
  const hiddenList = await api.get("/api/notifications", { cookie: fixtures.sessions.otherProjectUser });
  check("notification target URL is hidden when recipient cannot access target record", () => {
    assert.ok(hiddenTarget.notification.notification_id);
    assert.equal(hiddenList.status, 200, JSON.stringify(hiddenList.body));
    const hiddenNotification = hiddenList.body.notifications.find((notification) => notification.title === "Hidden task target");
    assert.equal(hiddenNotification.url, "");
    assert.equal(hiddenNotification.target.canOpen, false);
  });
}

async function runNotificationPreferenceTests(api, fixtures) {
  const preferences = await api.get("/api/notifications/preferences", { cookie: fixtures.sessions.projectUser });
  check("user can read configurable notification preferences", () => {
    assert.equal(preferences.status, 200, JSON.stringify(preferences.body));
    assert.ok(preferences.body.events.some((event) => event.id === "task.updated"));
    assert.equal(preferences.body.canManageWorkspaceDefaults, false);
  });

  const adminPreferences = await api.get("/api/notifications/preferences", { cookie: fixtures.sessions.workspaceAdmin });
  check("workspace admin can manage notification defaults", () => {
    assert.equal(adminPreferences.status, 200, JSON.stringify(adminPreferences.body));
    assert.equal(adminPreferences.body.canManageWorkspaceDefaults, true);
  });

  const muted = await api.put("/api/notifications/preferences", {
    preferences: [{ id: "task.updated", enabled: false }],
  }, { cookie: fixtures.sessions.projectUser });
  check("user can mute a notification type", () => {
    assert.equal(muted.status, 200, JSON.stringify(muted.body));
    const taskUpdated = muted.body.events.find((event) => event.id === "task.updated");
    assert.equal(taskUpdated.userEnabled, false);
  });

  const beforeMutedRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.projectUser.userId, "task.updated");
  await modulesService.emitInternalEvent("task.updated", {
    actorUserId: fixtures.users.workspaceAdmin.userId,
    moduleId: "tasks",
    newValue: {
      assignee_ids: [fixtures.users.projectUser.userId],
      task_id: "muted-event-task",
      title: "Muted event task",
    },
    recordId: "muted-event-task",
    recordType: "task",
    session: {
      user_id: fixtures.users.workspaceAdmin.userId,
      workspace_id: fixtures.workspaceId,
    },
    workspaceId: fixtures.workspaceId,
  });
  const afterMutedRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.projectUser.userId, "task.updated");
  check("muted notification type does not create a user notification", () => {
    assert.equal(afterMutedRows, beforeMutedRows);
  });

  const defaults = await api.put("/api/notifications/workspace-defaults", {
    defaults: [{ id: "task.overdue", enabled: false, priority: "urgent" }],
  }, { cookie: fixtures.sessions.workspaceAdmin });
  check("workspace admin can save notification defaults", () => {
    assert.equal(defaults.status, 200, JSON.stringify(defaults.body));
    const taskOverdue = defaults.body.events.find((event) => event.id === "task.overdue");
    assert.equal(taskOverdue.workspaceEnabled, false);
  });

  const beforeDefaultRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.projectUser.userId, "task.overdue");
  await modulesService.emitInternalEvent("task.overdue", {
    actorUserId: fixtures.users.workspaceAdmin.userId,
    moduleId: "tasks",
    newValue: {
      assignee_ids: [fixtures.users.projectUser.userId],
      task_id: "workspace-default-event-task",
      title: "Workspace default event task",
    },
    recordId: "workspace-default-event-task",
    recordType: "task",
    session: {
      user_id: fixtures.users.workspaceAdmin.userId,
      workspace_id: fixtures.workspaceId,
    },
    workspaceId: fixtures.workspaceId,
  });
  const afterDefaultRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.projectUser.userId, "task.overdue");
  check("disabled workspace default blocks event-created notifications", () => {
    assert.equal(afterDefaultRows, beforeDefaultRows);
  });
}

async function runNotificationEventTests(fixtures) {
  const beforeRows = await querySql(`
SELECT COUNT(*) AS count
FROM notifications
WHERE event_type = 'task.assigned';
`);

  await modulesService.emitInternalEvent("task.assigned", {
    actorUserId: fixtures.users.workspaceAdmin.userId,
    moduleId: "tasks",
    newValue: {
      assignee_ids: [fixtures.users.projectUser.userId],
      task_id: "manual-event-task",
      title: "Manual event task",
    },
    recordId: "manual-event-task",
    recordType: "task",
    session: {
      user_id: fixtures.users.workspaceAdmin.userId,
      workspace_id: fixtures.workspaceId,
    },
    workspaceId: fixtures.workspaceId,
  });

  const afterRows = await querySql(`
SELECT COUNT(*) AS count
FROM notifications
WHERE event_type = 'task.assigned';
`);

  check("framework event bus can create notifications from module declarations", () => {
    assert.equal(Number(afterRows[0].count), Number(beforeRows[0].count) + 1);
  });
}

async function runDisabledModuleTests(fixtures) {
  const beforeRows = await querySql(`
SELECT COUNT(*) AS count
FROM notifications
WHERE event_type = 'developer-example.sample';
`);

  await runSql(`
UPDATE workspace_modules
SET status = 'disabled',
    disabled_at = ${sqlText(new Date().toISOString())},
    updated_at = ${sqlText(new Date().toISOString())}
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND module_id = 'developer-example';
`);

  await modulesService.emitInternalEvent("developer-example.sample", {
    actorUserId: fixtures.users.workspaceAdmin.userId,
    metadata: {
      recipient_user_ids: [fixtures.users.projectUser.userId],
    },
    moduleId: "developer-example",
    recordId: "developer-example",
    recordType: "developer_example",
    session: {
      user_id: fixtures.users.workspaceAdmin.userId,
      workspace_id: fixtures.workspaceId,
    },
    workspaceId: fixtures.workspaceId,
  });

  const afterRows = await querySql(`
SELECT COUNT(*) AS count
FROM notifications
WHERE event_type = 'developer-example.sample';
`);

  check("disabled modules do not create new notifications from events", () => {
    assert.equal(Number(afterRows[0].count), Number(beforeRows[0].count));
  });
}

function createApi(baseUrl) {
  return {
    get: (url, options = {}) => request(baseUrl, "GET", url, null, options),
    post: (url, body, options = {}) => request(baseUrl, "POST", url, body, options),
    put: (url, body, options = {}) => request(baseUrl, "PUT", url, body, options),
  };
}

async function request(baseUrl, method, url, body = null, options = {}) {
  const headers = {};

  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  let parsedBody = null;

  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = text;
  }

  return {
    body: parsedBody,
    status: response.status,
  };
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

function check(name, assertion) {
  assertion();
  results.push(name);
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function userFixture(slug) {
  return {
    displayName: slug.replaceAll("-", " "),
    userId: `user-${slug}-${randomUUID()}`,
    username: `${slug}-${randomUUID()}@example.test`,
  };
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

function projectInsertSql(workspaceId, project, now) {
  return `
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
  task_default_status,
  task_default_priority,
  task_default_sort_order_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(project.id)},
  ${sqlText(workspaceId)},
  NULL,
  NULL,
  ${sqlText(project.name)},
  'Active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'open',
  'normal',
  '["due_date","priority","status"]',
  ${sqlText(now)},
  ${sqlText(now)}
);`;
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

async function createSession(workspaceId, userId, username) {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await runSql(`
INSERT INTO sessions (
  session_id,
  home_workspace_id,
  active_workspace_id,
  user_id,
  username,
  timezone,
  expires_at,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(sessionId)},
  ${sqlText(workspaceId)},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  ${sqlText(username)},
  'America/New_York',
  ${sqlText(expiresAt)},
  ${sqlText(now)},
  ${sqlText(now)}
);`);

  return sessionId;
}
