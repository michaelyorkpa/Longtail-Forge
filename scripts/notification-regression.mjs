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

  await runNotificationUiContractTests();
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
    assert.equal(recipientList.body.notifications[0].updateTypeLabel, "Task Created");
    assert.equal(recipientList.body.notifications[0].displayType, "Task Created");
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
    assert.match(String(page.body), /data-notification-status/);
    assert.match(String(page.body), /data-notification-filter="active"/);
    assert.match(String(page.body), /data-notification-filter="unread"/);
    assert.match(String(page.body), /data-notification-filter="read"/);
    assert.match(String(page.body), /data-notification-filter="dismissed"/);
    assert.match(String(page.body), /data-notification-script-fallback/);
    assert.match(String(page.body), /data-notification-preference-script-fallback/);
    assert.match(String(page.body), /\/js\/notifications\.js\?v=6/);
    assert.doesNotMatch(String(page.body), /src="js\/notifications\.js/);
    assert.match(String(page.body), /notificationsPageReady/);
  });

  const unreadList = await api.get("/api/notifications?status=unread", { cookie: fixtures.sessions.projectUser });
  check("unread notification API filter includes unread notifications", () => {
    assert.equal(unreadList.status, 200, JSON.stringify(unreadList.body));
    assert.ok(unreadList.body.notifications.some((notification) => notification.notification_id === notificationId));
  });

  const readResult = await api.post(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {}, {
    cookie: fixtures.sessions.projectUser,
  });
  check("recipient can mark own notification read", () => {
    assert.equal(readResult.status, 200, JSON.stringify(readResult.body));
    assert.equal(readResult.body.notification.status, "read");
    assert.ok(readResult.body.notification.read_at);
  });

  const activeAfterRead = await api.get("/api/notifications?status=active", { cookie: fixtures.sessions.projectUser });
  check("active notification filter includes read notifications before dismissal", () => {
    assert.equal(activeAfterRead.status, 200, JSON.stringify(activeAfterRead.body));
    assert.ok(activeAfterRead.body.notifications.some((notification) => notification.notification_id === notificationId));
  });

  const readList = await api.get("/api/notifications?status=read", { cookie: fixtures.sessions.projectUser });
  check("read notification API filter includes read notifications", () => {
    assert.equal(readList.status, 200, JSON.stringify(readList.body));
    assert.ok(readList.body.notifications.some((notification) => notification.notification_id === notificationId));
  });

  const deniedRead = await api.post(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {}, {
    cookie: fixtures.sessions.workspaceAdmin,
  });
  check("non-recipient cannot mark another user's notification read", () => {
    assert.equal(deniedRead.status, 404, JSON.stringify(deniedRead.body));
  });

  const initialSubscription = await api.get(`/api/notifications/subscriptions?moduleId=tasks&targetType=task&targetId=${encodeURIComponent(task.body.task.task_id)}`, {
    cookie: fixtures.sessions.projectUser,
  });
  check("recipient can read task notification follow status", () => {
    assert.equal(initialSubscription.status, 200, JSON.stringify(initialSubscription.body));
    assert.equal(initialSubscription.body.isFollowing, false);
  });

  const followedSubscription = await api.post("/api/notifications/subscriptions", {
    moduleId: "tasks",
    targetId: task.body.task.task_id,
    targetType: "task",
  }, { cookie: fixtures.sessions.projectUser });
  check("recipient can follow an accessible task notification target", () => {
    assert.equal(followedSubscription.status, 200, JSON.stringify(followedSubscription.body));
    assert.equal(followedSubscription.body.isFollowing, true);
    assert.equal(followedSubscription.body.subscription.user_id, fixtures.users.projectUser.userId);
  });

  const subscriptionAuditRows = await querySql(`
SELECT action, change_type, record_type, record_id
FROM audit_logs
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND action = 'notification_subscription_followed'
ORDER BY created_at DESC
LIMIT 1;
`);
  check("notification follows are audited against the user", () => {
    assert.equal(subscriptionAuditRows.length, 1);
    assert.equal(subscriptionAuditRows[0].change_type, "settings_change");
    assert.equal(subscriptionAuditRows[0].record_type, "user");
    assert.equal(subscriptionAuditRows[0].record_id, fixtures.users.projectUser.userId);
  });

  const deniedFollow = await api.post("/api/notifications/subscriptions", {
    moduleId: "tasks",
    targetId: task.body.task.task_id,
    targetType: "task",
  }, { cookie: fixtures.sessions.otherProjectUser });
  check("user cannot follow a task target they cannot access", () => {
    assert.equal(deniedFollow.status, 404, JSON.stringify(deniedFollow.body));
  });

  const unfollowedSubscription = await api.delete(`/api/notifications/subscriptions?moduleId=tasks&targetType=task&targetId=${encodeURIComponent(task.body.task.task_id)}`, {
    cookie: fixtures.sessions.projectUser,
  });
  check("recipient can unfollow a task notification target", () => {
    assert.equal(unfollowedSubscription.status, 200, JSON.stringify(unfollowedSubscription.body));
    assert.equal(unfollowedSubscription.body.isFollowing, false);
  });

  const dismissResult = await api.post(`/api/notifications/${encodeURIComponent(notificationId)}/dismiss`, {}, {
    cookie: fixtures.sessions.projectUser,
  });
  check("recipient can dismiss own notification", () => {
    assert.equal(dismissResult.status, 200, JSON.stringify(dismissResult.body));
    assert.equal(dismissResult.body.notification.status, "dismissed");
    assert.ok(dismissResult.body.notification.dismissed_at);
  });

  const activeAfterDismiss = await api.get("/api/notifications?status=active", { cookie: fixtures.sessions.projectUser });
  check("active notification filter excludes dismissed notifications", () => {
    assert.equal(activeAfterDismiss.status, 200, JSON.stringify(activeAfterDismiss.body));
    assert.equal(activeAfterDismiss.body.notifications.some((notification) => notification.notification_id === notificationId), false);
  });

  const dismissedList = await api.get("/api/notifications?status=dismissed", { cookie: fixtures.sessions.projectUser });
  check("dismissed notification filter includes dismissed notifications", () => {
    assert.equal(dismissedList.status, 200, JSON.stringify(dismissedList.body));
    assert.ok(dismissedList.body.notifications.some((notification) => notification.notification_id === notificationId));
  });

  await notificationsService.create({
    body: "Low priority notifications remain visible without increasing the bell badge.",
    event_type: "task.updated",
    module_id: "tasks",
    priority: "low",
    recipient_user_id: fixtures.users.projectUser.userId,
    record_id: task.body.task.task_id,
    record_type: "task",
    title: "Low priority task update",
    url: `tasks.html?task=${encodeURIComponent(task.body.task.task_id)}`,
    workspace_id: fixtures.workspaceId,
  }, {
    user_id: fixtures.users.workspaceAdmin.userId,
    workspace_id: fixtures.workspaceId,
  });
  const lowPrioritySummary = await api.get("/api/notifications/unread-count", { cookie: fixtures.sessions.projectUser });
  check("low priority unread notifications do not increase bell badge count", () => {
    assert.equal(lowPrioritySummary.status, 200, JSON.stringify(lowPrioritySummary.body));
    assert.equal(lowPrioritySummary.body.unreadCount, 0);
    assert.equal(lowPrioritySummary.body.totalUnreadCount, 1);
    assert.equal(lowPrioritySummary.body.lowPriorityUnreadCount, 1);
  });

  await notificationsService.create({
    body: "High priority notifications keep the bell in the attention state.",
    event_type: "task.updated",
    module_id: "tasks",
    priority: "high",
    recipient_user_id: fixtures.users.projectUser.userId,
    record_id: task.body.task.task_id,
    record_type: "task",
    title: "High priority task update",
    url: `tasks.html?task=${encodeURIComponent(task.body.task.task_id)}`,
    workspace_id: fixtures.workspaceId,
  }, {
    user_id: fixtures.users.workspaceAdmin.userId,
    workspace_id: fixtures.workspaceId,
  });
  const highPrioritySummary = await api.get("/api/notifications/unread-count", { cookie: fixtures.sessions.projectUser });
  check("high priority notifications increase badge count and alert the bell", () => {
    assert.equal(highPrioritySummary.status, 200, JSON.stringify(highPrioritySummary.body));
    assert.equal(highPrioritySummary.body.unreadCount, 1);
    assert.equal(highPrioritySummary.body.totalUnreadCount, 2);
    assert.equal(highPrioritySummary.body.hasHighPriority, true);
    assert.equal(highPrioritySummary.body.hasPriorityAlert, true);
  });

  const bulkRead = await api.post("/api/notifications/read-all", {}, { cookie: fixtures.sessions.projectUser });
  check("read all marks active unread notifications read", () => {
    assert.equal(bulkRead.status, 200, JSON.stringify(bulkRead.body));
    assert.equal(bulkRead.body.unreadCount, 0);
    assert.equal(bulkRead.body.totalUnreadCount, 0);
  });

  const bulkDismiss = await api.post("/api/notifications/dismiss-all", {}, { cookie: fixtures.sessions.projectUser });
  const activeAfterBulkDismiss = await api.get("/api/notifications?status=active", { cookie: fixtures.sessions.projectUser });
  check("dismiss all removes active notifications from the bell dropdown source", () => {
    assert.equal(bulkDismiss.status, 200, JSON.stringify(bulkDismiss.body));
    assert.equal(activeAfterBulkDismiss.status, 200, JSON.stringify(activeAfterBulkDismiss.body));
    assert.equal(activeAfterBulkDismiss.body.notifications.length, 0);
    assert.equal(bulkDismiss.body.hasPriorityAlert, false);
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
    assert.equal(hiddenNotification.updateTypeLabel, "Task Updated");
    assert.equal(hiddenNotification.url, "");
    assert.equal(hiddenNotification.target.canOpen, false);
  });
}

async function runNotificationUiContractTests() {
  const [navigation, notificationsPage, notificationsScript, notificationPreferences, notificationSubscriptions, tasksPage, tasksScript, taskDialog, tasksModule, userSettingsPage, userSettingsScript, css] = await Promise.all([
    readProjectFile("public/js/navigation.js"),
    readProjectFile("views/protected/notifications.html"),
    readProjectFile("public/js/notifications.js"),
    readProjectFile("public/js/shared/notification-preferences.js"),
    readProjectFile("public/js/shared/notification-subscriptions.js"),
    readProjectFile("views/protected/tasks.html"),
    readProjectFile("public/js/tasks.js"),
    readProjectFile("public/js/task-dialog.js"),
    readProjectFile("src/modules/tasks/module.js"),
    readProjectFile("views/protected/user-settings.html"),
    readProjectFile("public/js/user-settings.js"),
    readProjectFile("public/css/longtail-forge.css"),
  ]);

  check("notification dropdown loads active notifications only", () => {
    assert.match(navigation, /\/api\/notifications\?status=active&limit=5/);
  });

  check("notification dropdown applies bell priority state and groups only normal and low priorities", () => {
    assert.match(navigation, /notificationBell\.classList\.toggle\("has-priority-alert", hasPriorityAlert\)/);
    assert.match(navigation, /notificationBell\.dataset\.notificationPriority = priority/);
    assert.match(navigation, /function sortNotificationPanelItems\(notifications\)/);
    assert.match(navigation, /\["urgent", 0\]/);
    assert.match(navigation, /\["high", 1\]/);
    assert.match(navigation, /createNotificationPanelGroup\(priority, notifications\)/);
    assert.match(navigation, /data\.notificationPriorityGroup = priority|dataset\.notificationPriorityGroup = priority/);
    assert.match(css, /\.notification-bell\.has-priority-alert \{/);
    assert.match(css, /\.notification-panel-group-title \{/);
  });

  check("notification dropdown uses icon actions with labels and hover titles", () => {
    assert.match(navigation, /createNotificationPanelActionButton\("Read", "complete"\)/);
    assert.match(navigation, /createNotificationPanelActionButton\("Dismiss", "close", \{ danger: true \}\)/);
    assert.match(navigation, /LongtailForge\?\.icons\?\.createIconButton/);
    assert.match(navigation, /title: label|title: Label/);
    assert.match(navigation, /setAttribute\("aria-label", label\)/);
  });

  check("notification dropdown bottom bulk actions call read all and dismiss all endpoints", () => {
    assert.match(navigation, /dataset\.notificationReadAll = ""/);
    assert.match(navigation, /dataset\.notificationDismissAll = ""/);
    assert.match(navigation, /mutateAllNotifications\("read-all"\)/);
    assert.match(navigation, /mutateAllNotifications\("dismiss-all"\)/);
    assert.match(navigation, /\/api\/notifications\/\$\{action\}/);
    assert.match(css, /\.notification-panel-footer \{/);
    assert.match(css, /\.notification-panel-header a,\s*\.notification-panel-text-action \{\s*font-size: 13px;/);
    assert.match(css, /\.notification-panel-text-action\.is-danger \{/);
  });

  check("notification dropdown dismiss success removes the visible item", () => {
    assert.match(navigation, /item\?\.remove\(\)/);
    assert.match(navigation, /createNotificationPanelEmpty\("No notifications"\)/);
  });

  check("notification dropdown failed actions keep the item visible and show status", () => {
    assert.match(navigation, /if \(!response\.ok\) \{\s*throw new Error\("Notification action failed\."\);/);
    assert.match(navigation, /setNotificationPanelStatus\("Notification action failed\.", true\)/);
  });

  check("notifications page defaults to the active filter", () => {
    assert.match(notificationsPage, /data-notification-filter="active" aria-pressed="true">Active/);
    assert.match(notificationsPage, /\/js\/notifications\.js\?v=6/);
    assert.match(notificationsPage, /\/js\/shared\/notification-preferences\.js\?v=3/);
    assert.match(notificationsScript, /filter: "active"/);
    assert.match(notificationsScript, /params\.set\("status", state\.filter\)/);
  });

  check("notifications page script is scoped away from app shell globals", () => {
    assert.match(notificationsScript, /^\(function initializeNotificationsPage\(\) \{/);
    assert.match(notificationsScript, /\}\)\(\);\s*$/);
  });

  check("notifications page list initializes independently from optional preference helpers", () => {
    assert.match(notificationsScript, /Promise\.allSettled\(\[loadNotifications\(\), loadPreferences\(\)\]\)/);
    assert.match(notificationsScript, /function getNotificationPreferences\(\)/);
    assert.match(notificationsScript, /if \(!preferences\) \{[\s\S]*renderPreferences\(false\);[\s\S]*return;/);
    assert.match(notificationsScript, /Notification preferences unavailable\./);
  });

  check("notifications page filters update pressed state and reload the selected status", () => {
    assert.match(notificationsScript, /function updateFilterPressedState\(\)/);
    assert.match(notificationsScript, /button\.setAttribute\("aria-pressed", String\(\(button\.dataset\.notificationFilter \|\| "active"\) === state\.filter\)\)/);
    assert.match(notificationsScript, /state\.filter = button\.dataset\.notificationFilter \|\| "active"[\s\S]*loadNotifications\(\);/);
  });

  check("notifications page actions refresh the shell unread count", () => {
    assert.match(navigation, /window\.LongtailForge\.refreshNotifications = refreshNotificationCount/);
    assert.match(notificationsScript, /await refreshNotificationCount\(\)/);
  });

  check("notification dropdown title uses compact panel-specific styling", () => {
    assert.match(navigation, /title\.className = "notification-panel-title"/);
    assert.match(css, /\.notification-panel-title \{\s*font-size: 13px;\s*line-height: 1\.3;/);
  });

  check("notification update type labels render on full page and dropdown surfaces", () => {
    assert.match(notificationsScript, /typeBadge\.className = "notification-type-badge"/);
    assert.match(notificationsScript, /typeBadge\.textContent = notificationUpdateTypeLabel\(notification\)/);
    assert.match(navigation, /type\.className = "notification-type-badge"/);
    assert.match(navigation, /type\.textContent = notificationUpdateTypeLabel\(notification\)/);
    assert.match(css, /\.notification-type-badge \{/);
  });

  check("notification icon helper failures fall back to plain buttons", () => {
    assert.match(notificationsScript, /try \{[\s\S]*LongtailForge\?\.icons\?\.createIconButton/);
    assert.match(notificationsScript, /Fall back to a plain button so optional icon failures cannot blank the notifications list\./);
  });

  check("notification preferences render through shared grouped helper", () => {
    assert.match(notificationPreferences, /function renderPreferenceGroups\(container, events, options = \{\}\)/);
    assert.match(notificationPreferences, /function groupEventsByModule\(events\)/);
    assert.match(notificationPreferences, /notification-preference-group/);
    assert.match(notificationPreferences, /notification-preference-matrix/);
    assert.match(notificationPreferences, /My preference/);
    assert.match(notificationPreferences, /Enable\?/);
    assert.match(notificationPreferences, /Priority/);
    assert.match(notificationPreferences, /Workspace default/);
    assert.match(notificationPreferences, /Everyone in this workspace\./);
    assert.match(notificationsPage, /\/js\/shared\/notification-preferences\.js/);
    assert.match(notificationsScript, /preferences\.renderPreferenceGroups/);
    assert.match(css, /\.notification-preference-matrix \{/);
    assert.match(css, /\.notification-preference-enable-cell,/);
    assert.match(css, /\.notification-preference-priority-cell \{/);
  });

  check("user settings exposes the same user notification preferences source", () => {
    assert.match(userSettingsPage, /data-user-notification-preferences-form/);
    assert.match(userSettingsPage, /data-user-notification-preference-list/);
    assert.match(userSettingsPage, /js\/shared\/notification-preferences\.js\?v=3/);
    assert.match(userSettingsScript, /notificationPreferences\.loadPreferences/);
    assert.match(userSettingsScript, /notificationPreferences\.saveUserPreferences/);
    assert.match(userSettingsScript, /includeWorkspaceDefaults: false/);
  });

  check("workspace-disabled notification events cannot be enabled in user preference controls", () => {
    assert.match(notificationPreferences, /userInput\.disabled = workspaceDefaultDisabled/);
    assert.match(notificationPreferences, /Workspace default is off\./);
  });

  check("task notification follow UI uses shared subscription helper", () => {
    assert.match(notificationSubscriptions, /root\.notificationSubscriptions/);
    assert.match(notificationSubscriptions, /\/api\/notifications\/subscriptions/);
    assert.match(tasksPage, /js\/shared\/notification-subscriptions\.js/);
    assert.match(tasksPage, /data-task-notification-follow/);
    assert.match(taskDialog, /toggleTaskNotificationFollow/);
    assert.match(tasksScript, /followTaskNotifications/);
  });

  check("tasks module declares task notification follow target", () => {
    assert.match(tasksModule, /notificationFollowTargets/);
    assert.match(tasksModule, /targetType: "task"/);
    assert.match(tasksModule, /eventTypes:\s*\[/);
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

  const userPreferenceAuditRows = await querySql(`
SELECT action, change_type, record_type, record_id
FROM audit_logs
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND action = 'notification_preferences_updated'
ORDER BY created_at DESC
LIMIT 1;
`);
  check("user notification preference changes are audited", () => {
    assert.equal(userPreferenceAuditRows.length, 1);
    assert.equal(userPreferenceAuditRows[0].change_type, "settings_change");
    assert.equal(userPreferenceAuditRows[0].record_type, "user");
    assert.equal(userPreferenceAuditRows[0].record_id, fixtures.users.projectUser.userId);
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

  const followedTask = await api.post("/api/tasks", {
    assignee_ids: [fixtures.users.workspaceAdmin.userId],
    project_id: fixtures.project.id,
    title: "Followed notification regression task",
  }, { cookie: fixtures.sessions.workspaceAdmin });
  check("followed notification regression task can be created", () => {
    assert.equal(followedTask.status, 201, JSON.stringify(followedTask.body));
  });

  const followedTarget = await api.post("/api/notifications/subscriptions", {
    moduleId: "tasks",
    targetId: followedTask.body.task.task_id,
    targetType: "task",
  }, { cookie: fixtures.sessions.projectUser });
  check("project user can follow an accessible unassigned-to-them task", () => {
    assert.equal(followedTarget.status, 200, JSON.stringify(followedTarget.body));
    assert.equal(followedTarget.body.isFollowing, true);
  });

  const beforeFollowedRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.projectUser.userId, "task.updated");
  const beforeOtherFollowedRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.otherProjectUser.userId, "task.updated");
  await modulesService.emitInternalEvent("task.updated", {
    actorUserId: fixtures.users.workspaceAdmin.userId,
    moduleId: "tasks",
    newValue: {
      assignee_ids: [fixtures.users.workspaceAdmin.userId],
      task_id: followedTask.body.task.task_id,
      title: followedTask.body.task.title,
    },
    recordId: followedTask.body.task.task_id,
    recordType: "task",
    session: {
      user_id: fixtures.users.workspaceAdmin.userId,
      workspace_id: fixtures.workspaceId,
    },
    workspaceId: fixtures.workspaceId,
  });
  const afterFollowedRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.projectUser.userId, "task.updated");
  const afterOtherFollowedRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.otherProjectUser.userId, "task.updated");
  check("followed task notification overrides user event mute for that target", () => {
    assert.equal(afterFollowedRows, beforeFollowedRows + 1);
  });
  check("followed task notification override only sends to the subscribing user", () => {
    assert.equal(afterOtherFollowedRows, beforeOtherFollowedRows);
  });

  const unfollowedTarget = await api.delete(`/api/notifications/subscriptions?moduleId=tasks&targetType=task&targetId=${encodeURIComponent(followedTask.body.task.task_id)}`, {
    cookie: fixtures.sessions.projectUser,
  });
  check("project user can remove the followed task notification override", () => {
    assert.equal(unfollowedTarget.status, 200, JSON.stringify(unfollowedTarget.body));
    assert.equal(unfollowedTarget.body.isFollowing, false);
  });

  const beforeUnfollowedRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.projectUser.userId, "task.updated");
  await modulesService.emitInternalEvent("task.updated", {
    actorUserId: fixtures.users.workspaceAdmin.userId,
    moduleId: "tasks",
    newValue: {
      assignee_ids: [fixtures.users.workspaceAdmin.userId],
      task_id: followedTask.body.task.task_id,
      title: followedTask.body.task.title,
    },
    recordId: followedTask.body.task.task_id,
    recordType: "task",
    session: {
      user_id: fixtures.users.workspaceAdmin.userId,
      workspace_id: fixtures.workspaceId,
    },
    workspaceId: fixtures.workspaceId,
  });
  const afterUnfollowedRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.projectUser.userId, "task.updated");
  check("unfollow removes the per-target override without changing broader muted preference", () => {
    assert.equal(afterUnfollowedRows, beforeUnfollowedRows);
  });

  const defaults = await api.put("/api/notifications/workspace-defaults", {
    defaults: [{ id: "task.overdue", enabled: false, priority: "urgent" }],
  }, { cookie: fixtures.sessions.workspaceAdmin });
  check("workspace admin can save notification defaults", () => {
    assert.equal(defaults.status, 200, JSON.stringify(defaults.body));
    const taskOverdue = defaults.body.events.find((event) => event.id === "task.overdue");
    assert.equal(taskOverdue.workspaceEnabled, false);
  });

  const workspaceDefaultAuditRows = await querySql(`
SELECT action, change_type, record_type, record_id
FROM audit_logs
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND action = 'notification_workspace_defaults_updated'
ORDER BY created_at DESC
LIMIT 1;
`);
  check("workspace notification default changes are audited", () => {
    assert.equal(workspaceDefaultAuditRows.length, 1);
    assert.equal(workspaceDefaultAuditRows[0].change_type, "settings_change");
    assert.equal(workspaceDefaultAuditRows[0].record_type, "workspace_setting");
    assert.equal(workspaceDefaultAuditRows[0].record_id, "notification_workspace_defaults");
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

  const beforeActorCreateRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "task.created");
  const beforeOtherCreateRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.otherProjectUser.userId, "task.created");
  await modulesService.emitInternalEvent("task.created", {
    actorUserId: fixtures.users.workspaceAdmin.userId,
    metadata: {
      recipient_user_ids: [
        fixtures.users.workspaceAdmin.userId,
        fixtures.users.otherProjectUser.userId,
      ],
    },
    moduleId: "tasks",
    newValue: {
      assignee_ids: [fixtures.users.workspaceAdmin.userId],
      task_id: "actor-create-suppression-task",
      title: "Actor create suppression task",
    },
    recordId: "actor-create-suppression-task",
    recordType: "task",
    session: {
      user_id: fixtures.users.workspaceAdmin.userId,
      workspace_id: fixtures.workspaceId,
    },
    workspaceId: fixtures.workspaceId,
  });
  const afterActorCreateRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "task.created");
  const afterOtherCreateRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.otherProjectUser.userId, "task.created");
  check("task creators do not receive their own created notifications", () => {
    assert.equal(afterActorCreateRows, beforeActorCreateRows);
  });
  check("task create actor suppression preserves other explicit recipients", () => {
    assert.equal(afterOtherCreateRows, beforeOtherCreateRows + 1);
  });

  const beforeActorUpdateRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "task.updated");
  const beforeOtherUpdateRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.otherProjectUser.userId, "task.updated");
  await modulesService.emitInternalEvent("task.updated", {
    actorUserId: fixtures.users.workspaceAdmin.userId,
    metadata: {
      recipient_user_ids: [
        fixtures.users.workspaceAdmin.userId,
        fixtures.users.otherProjectUser.userId,
      ],
    },
    moduleId: "tasks",
    newValue: {
      assignee_ids: [fixtures.users.workspaceAdmin.userId],
      description: "New details",
      task_id: "description-label-task",
      title: "Description label task",
    },
    previousValue: {
      assignee_ids: [fixtures.users.workspaceAdmin.userId],
      description: "",
      task_id: "description-label-task",
      title: "Description label task",
    },
    recordId: "description-label-task",
    recordType: "task",
    session: {
      user_id: fixtures.users.workspaceAdmin.userId,
      workspace_id: fixtures.workspaceId,
    },
    workspaceId: fixtures.workspaceId,
  });
  const afterActorUpdateRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "task.updated");
  const afterOtherUpdateRows = await notificationCountFor(fixtures.workspaceId, fixtures.users.otherProjectUser.userId, "task.updated");
  const labelList = await notificationsService.list({
    user_id: fixtures.users.otherProjectUser.userId,
    workspace_id: fixtures.workspaceId,
  });
  const descriptionLabelNotification = labelList.notifications.find((notification) => (
    notification.record_id === "description-label-task" && notification.event_type === "task.updated"
  ));
  check("task modifiers do not receive their own updated notifications", () => {
    assert.equal(afterActorUpdateRows, beforeActorUpdateRows);
  });
  check("task update actor suppression preserves other explicit recipients", () => {
    assert.equal(afterOtherUpdateRows, beforeOtherUpdateRows + 1);
  });
  check("task update notifications expose description-specific update labels", () => {
    assert.equal(descriptionLabelNotification.updateTypeLabel, "Description Added");
    assert.equal(descriptionLabelNotification.displayType, "Description Added");
    assert.ok(descriptionLabelNotification.metadata.changed_fields.includes("description"));
  });
  check("task update notifications include safe changed context snippets", () => {
    assert.deepEqual(descriptionLabelNotification.metadata.changed_context, {
      field: "description",
      label: "Description added",
      summary: "Description added: New details",
    });
    assert.match(descriptionLabelNotification.body, /Description added: New details/);
    assert.doesNotMatch(descriptionLabelNotification.body, /\{|\}|previous_value|new_value/);
  });

  const unknownLabel = await notificationsService.create({
    event_type: "task.updated",
    metadata: {
      changed_fields: ["unknown_field"],
    },
    module_id: "tasks",
    recipient_user_id: fixtures.users.workspaceAdmin.userId,
    title: "Unknown task update",
    workspace_id: fixtures.workspaceId,
  });
  check("unknown task update metadata falls back to Task Updated", () => {
    assert.equal(unknownLabel.notification.updateTypeLabel, "Task Updated");
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
    delete: (url, options = {}) => request(baseUrl, "DELETE", url, null, options),
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

function readProjectFile(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
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
