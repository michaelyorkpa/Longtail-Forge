import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.6b";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notifications-inbox-lifecycle-conversion-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notifications-inbox-lifecycle-conversion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Notifications-Inbox-Lifecycle-Conversion-Test-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const notificationsRepoSource = readText("src/repositories/notifications.repo.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { notificationsRepository } = await import("../src/repositories/notifications.repo.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const fixture = await readFixture();
  await seedWorkspaceAdminRole(fixture);
  await assertNotificationInboxLifecycleRuntime(fixture);
  await assertIntegrity();

  console.log("Notifications inbox and lifecycle conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Notifications inbox/lifecycle conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Notifications inbox/lifecycle conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Notifications inbox/lifecycle conversion version");

  assert.match(notificationsRepoSource, /import \{ db \} from "\.\.\/core\/database\.js";/, "notifications repo should import the provider-neutral db facade");

  for (const functionName of [
    "create",
    "listForRecipient",
    "countForRecipient",
    "readFilterOptionsForRecipient",
    "countUnreadForRecipient",
    "readBellSummaryForRecipient",
    "readByIdForRecipient",
    "readById",
    "markRead",
    "markAllRead",
    "dismiss",
    "dismissAll",
    "archiveOlderThan",
    "readWorkspaceAdminUserIds",
  ]) {
    assertConvertedFunction(functionName);
  }

  assertFunctionUsesPatterns("notificationListWhereClauses", [
    /workspace_id = :workspaceId/,
    /recipient_user_id = :recipientUserId/,
    /status IN \(:activeStatuses\)/,
    /status = :status/,
    /module_id = :moduleId/,
    /event_type = :eventType/,
    /priority = :priority/,
    /return \{ clauses, params \};/,
  ]);
  assert.doesNotMatch(functionBlock(notificationsRepoSource, "notificationListWhereClauses"), /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "notification list filters should not use literal SQL helpers after conversion");

  assertFunctionUsesPatterns("readFilterOptionsForRecipient", [
    /db\.query\(`/,
    /db\.dialect\.comparison\.orderByNoCase\("module_id", "ASC"\)/,
    /db\.dialect\.comparison\.orderByNoCase\("event_type", "ASC"\)/,
  ]);
  assertFunctionUsesPatterns("readBellSummaryForRecipient", [
    /await db\.get\(`/,
    /status = :unreadStatus/,
    /status IN \(:activeStatuses\)/,
    /priority = :urgentPriority/,
    /priority = :highPriority/,
  ]);
  assertFunctionUsesPatterns("archiveOlderThan", [
    /await db\.run\(`/,
    /SET status = :archivedStatus/,
    /created_at < :cutoffIso/,
    /status IN \(:archivableStatuses\)/,
  ]);

  assert.match(auditDocs, /0\.33\.5\.27\.21 Notifications Inbox and Lifecycle Conversion[\s\S]*create, list\/count, bell summary, read-by-id, mark-read, dismiss, archive, admin-recipient, and filter-option paths[\s\S]*536 runtime literal-helper invocations[\s\S]*111 direct interpolated SQL operation sites[\s\S]*246 existing bound operation sites/, "audit docs should record the Notifications inbox/lifecycle conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.21[\s\S]*Notifications inbox and lifecycle paths in `notifications\.repo` are partially converted[\s\S]*536 remaining helper invocations/, "database docs should record the concrete Notifications inbox/lifecycle conversion");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.21 - Conversion wave: Notifications inbox and lifecycle[\s\S]*- \[x\] Convert notification create[\s\S]*- \[x\] Preserve in-app notification display[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.21 - [\s\S]*Notifications inbox and lifecycle conversion[\s\S]*536 helper invocations[\s\S]*111 direct interpolated operation sites[\s\S]*246 bound operation sites/, "changelog should record the Notifications inbox/lifecycle conversion burndown");
  assert.match(regressionSuite, /scripts\/notifications-inbox-lifecycle-conversion-regression\.mjs/, "regression suite should include the Notifications inbox/lifecycle conversion proof");
}

function assertConvertedFunction(functionName) {
  const block = functionBlock(notificationsRepoSource, functionName);
  assert.match(block, /\bdb\.(?:query|get|run)\(`/u, `${functionName} should use the provider-neutral db facade`);
  assert.match(block, /:[A-Za-z][A-Za-z0-9_]*|notificationListWhereClauses/u, `${functionName} should use named params`);
  assert.doesNotMatch(block, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, `${functionName} should not use literal SQL helpers after conversion`);
}

function assertFunctionUsesPatterns(functionName, patterns) {
  const block = functionBlock(notificationsRepoSource, functionName);

  for (const pattern of patterns) {
    assert.match(block, pattern, `${functionName} should include ${pattern}`);
  }
}

async function readFixture() {
  const workspace = (await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;"))[0];
  const user = (await querySql(`
SELECT user_id
FROM users
WHERE home_workspace_id = ${sqlText(workspace.workspace_id)}
ORDER BY protected_user DESC, username
LIMIT 1;
`))[0];

  assert.ok(workspace?.workspace_id, "fresh database should include a workspace");
  assert.ok(user?.user_id, "fresh database should include a protected user");

  return {
    userId: user.user_id,
    workspaceId: workspace.workspace_id,
  };
}

async function seedWorkspaceAdminRole({ userId, workspaceId }) {
  const now = new Date().toISOString();

  await runSql(`
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
  'workspace_admin',
  'workspace',
  ${sqlText(workspaceId)},
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

async function assertNotificationInboxLifecycleRuntime({ userId, workspaceId }) {
  const oldIso = "2020-01-01T00:00:00.000Z";
  const firstId = randomUUID();
  const lowId = randomUUID();
  const oldReadId = randomUUID();

  const first = await notificationsRepository.create({
    notification_id: firstId,
    body: "Normal notification body",
    event_type: "task.created",
    module_id: "tasks",
    priority: "normal",
    recipient_user_id: userId,
    record_id: "notification-conversion-task",
    record_type: "task",
    title: "Normal task notification",
    url: "tasks.html?task=notification-conversion-task",
    workspace_id: workspaceId,
  });
  assert.equal(first.notification_id, firstId, "created notifications should be readable by id");
  assert.equal(first.status, "unread", "new notifications should default to unread");

  const duplicate = await notificationsRepository.create({
    notification_id: firstId,
    body: "Replacement body should not win",
    event_type: "task.created",
    recipient_user_id: userId,
    title: "Replacement title should not win",
    workspace_id: workspaceId,
  });
  assert.equal(duplicate.title, "Normal task notification", "explicit duplicate notification IDs should return the existing row");

  await notificationsRepository.create({
    notification_id: lowId,
    body: "Low priority body",
    event_type: "task.updated",
    module_id: "tasks",
    priority: "low",
    recipient_user_id: userId,
    record_id: "notification-conversion-task",
    record_type: "task",
    title: "Low priority task notification",
    workspace_id: workspaceId,
  });
  await notificationsRepository.create({
    notification_id: oldReadId,
    body: "Old urgent body",
    created_at: oldIso,
    event_type: "task.overdue",
    module_id: "tasks",
    priority: "urgent",
    read_at: oldIso,
    recipient_user_id: userId,
    status: "read",
    title: "Old urgent notification",
    workspace_id: workspaceId,
  });

  const active = await notificationsRepository.listForRecipient(workspaceId, userId, { status: "active", limit: 10 });
  assert.equal(active.length, 3, "active notifications should include unread and read rows");
  assert.equal(await notificationsRepository.countForRecipient(workspaceId, userId, { status: "unread" }), 2, "unread count filter should include only unread rows");
  assert.equal(await notificationsRepository.countForRecipient(workspaceId, userId, { moduleId: "tasks", eventType: "task.updated", priority: "low" }), 1, "module/event/priority filters should stay canonical");

  const filterOptions = await notificationsRepository.readFilterOptionsForRecipient(workspaceId, userId, { status: "active" });
  assert.deepEqual(filterOptions.modules, ["tasks"], "filter options should return distinct module IDs");
  assert.deepEqual(filterOptions.events, ["task.created", "task.overdue", "task.updated"], "filter options should return case-insensitive ordered event types");

  assert.equal(await notificationsRepository.countUnreadForRecipient(workspaceId, userId), 2, "unread summary count should include normal and low unread rows");
  const summary = await notificationsRepository.readBellSummaryForRecipient(workspaceId, userId);
  assert.equal(summary.unreadCount, 1, "bell badge should exclude low-priority unread notifications");
  assert.equal(summary.totalUnreadCount, 2, "bell total unread should include low-priority unread notifications");
  assert.equal(summary.lowPriorityUnreadCount, 1, "bell low-priority count should remain visible");
  assert.equal(summary.hasUrgentPriority, true, "urgent read active notifications should keep the priority alert");

  const read = await notificationsRepository.markRead(workspaceId, userId, firstId);
  assert.equal(read.status, "read", "markRead should mark an unread notification read");
  assert.ok(read.read_at, "markRead should stamp read_at");

  const dismissed = await notificationsRepository.dismiss(workspaceId, userId, firstId);
  assert.equal(dismissed.status, "dismissed", "dismiss should mark the notification dismissed");
  assert.ok(dismissed.dismissed_at, "dismiss should stamp dismissed_at");

  const dismissedAfterRead = await notificationsRepository.markRead(workspaceId, userId, firstId);
  assert.equal(dismissedAfterRead.status, "dismissed", "markRead should not revive a dismissed notification");

  await notificationsRepository.markAllRead(workspaceId, userId);
  assert.equal(await notificationsRepository.countUnreadForRecipient(workspaceId, userId), 0, "markAllRead should mark remaining unread notifications read");
  await notificationsRepository.dismissAll(workspaceId, userId);
  assert.equal(await notificationsRepository.countForRecipient(workspaceId, userId, { status: "active" }), 0, "dismissAll should remove unread/read notifications from active reads");

  await notificationsRepository.archiveOlderThan("2021-01-01T00:00:00.000Z");
  const oldArchived = await notificationsRepository.readByIdForRecipient(workspaceId, userId, oldReadId);
  assert.equal(oldArchived.status, "archived", "archiveOlderThan should archive old read/dismissed notifications only");

  const admins = await notificationsRepository.readWorkspaceAdminUserIds(workspaceId);
  assert.ok(admins.includes(userId), "workspace-admin recipient lookup should return admin user IDs");
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok", "SQLite integrity check should pass");
}

function functionBlock(source, functionName) {
  const pattern = new RegExp(`(?:async\\s+)?function ${functionName}\\s*\\([^)]*\\)\\s*\\{`);
  const match = pattern.exec(source);
  assert.ok(match, `${functionName} should exist`);

  const bodyStart = match.index + match[0].lastIndexOf("{");
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(match.index, index + 1);
      }
    }
  }

  throw new Error(`Could not extract function ${functionName}`);
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
