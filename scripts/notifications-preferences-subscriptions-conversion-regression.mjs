import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.2";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notifications-preferences-subscriptions-conversion-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notifications-preferences-subscriptions-conversion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Notifications-Preferences-Subscriptions-Conversion-Test-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const notificationsRepoSource = readText("src/repositories/notifications.repo.js");
const sqliteDialectSource = readText("src/db/adapters/sqlite-dialect-seams.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const { notificationsRepository } = await import("../src/repositories/notifications.repo.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const fixture = await readFixture();
  await assertNotificationPreferencesAndSubscriptionsRuntime(fixture);
  await assertIntegrity();

  console.log("Notifications preferences and subscriptions conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Notifications preferences/subscriptions conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Notifications preferences/subscriptions conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Notifications preferences/subscriptions conversion version");

  assert.match(notificationsRepoSource, /import \{ db \} from "\.\.\/core\/database\.js";/, "notifications repo should import the provider-neutral db facade");
  assert.doesNotMatch(notificationsRepoSource, /\.\.\/db\/index\.js/, "notifications repo should not import legacy db helpers after full conversion");
  assert.doesNotMatch(notificationsRepoSource, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "notifications repo should be fully off literal helpers and compatibility query wrappers");

  for (const functionName of [
    "readUserPreferences",
    "readUserDisplayPreferences",
    "readWorkspaceDefaults",
    "readSubscription",
    "readSubscriptionsForTarget",
    "saveSubscription",
    "removeSubscription",
    "saveUserDisplayPreferences",
  ]) {
    assertConvertedFunction(functionName);
  }

  assertFunctionUsesPatterns("saveUserPreferences", [
    /await db\.transaction\(async \(transaction\) =>/,
    /await transaction\.run\(`/,
    /transaction\.dialect\.conflict\.buildInsertOnConflictDoUpdate/,
    /conflictColumns: \["workspace_id", "user_id", "event_type"\]/,
  ]);
  assertFunctionUsesPatterns("saveWorkspaceDefaults", [
    /await db\.transaction\(async \(transaction\) =>/,
    /await transaction\.run\(`/,
    /transaction\.dialect\.conflict\.buildInsertOnConflictDoUpdate/,
    /conflictColumns: \["workspace_id", "event_type"\]/,
  ]);
  assertFunctionUsesPatterns("notificationUserPreferenceParams", [
    /enabled: db\.dialect\.boolean\.bind/,
  ]);
  assertFunctionUsesPatterns("notificationWorkspaceDefaultParams", [
    /enabled: db\.dialect\.boolean\.bind/,
  ]);
  assertFunctionUsesPatterns("saveSubscription", [
    /await db\.run\(`/,
    /db\.dialect\.conflict\.buildInsertOnAnyConflictDoUpdate/,
    /NOTIFICATION_SUBSCRIPTION_COLUMNS/,
    /subscriptionWriteParams/,
  ]);
  assertFunctionUsesPatterns("readSubscription", [
    /await db\.get\(`/,
    /COALESCE\(event_type, ''\) = :eventType/,
    /subscriptionTargetParams/,
  ]);
  assertFunctionUsesPatterns("readSubscriptionsForTarget", [
    /await db\.query\(`/,
    /status = :activeStatus/,
    /event_type IS NULL OR event_type = '' OR event_type = :eventType/,
  ]);
  assertFunctionUsesPatterns("saveUserDisplayPreferences", [
    /db\.dialect\.conflict\.buildInsertOnConflictDoUpdate/,
    /conflictColumns: \["workspace_id", "user_id"\]/,
    /notificationDisplayPreferenceParams/,
  ]);
  assert.match(sqliteDialectSource, /buildInsertOnAnyConflictDoUpdate/, "SQLite dialect should expose an any-conflict upsert seam for expression-index conflicts");
  assert.match(sqliteDialectSource, /function onAnyConflictDoUpdateSet\(updateColumns\)[\s\S]*ON CONFLICT DO UPDATE SET/, "SQLite dialect should own bare ON CONFLICT DO UPDATE SQL");

  assert.match(auditDocs, /Current totals as of 0\.33\.5\.28\.2:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 385[\s\S]*Total runtime database operation calls seen by the audit scanner: 429/, "audit docs should record the Notifications preferences/subscriptions conversion ratchet");
  assert.match(auditDocs, /\| notifications\.repo \| Converted \| 0 \| 0 \| 25 \| 25 \|/, "audit inventory should mark notifications repo fully converted");
  assert.match(auditDocs, /0\.33\.5\.27\.22 Notifications Preferences and Subscriptions Conversion[\s\S]*`notifications\.repo` is fully converted[\s\S]*487 runtime literal-helper invocations[\s\S]*103 direct interpolated SQL operation sites[\s\S]*256 existing bound operation sites/, "audit docs should record the Notifications preferences/subscriptions conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.22[\s\S]*Notification preferences, display preferences, workspace defaults, follow subscriptions, and subscription write paths in `notifications\.repo` are converted[\s\S]*487 remaining helper invocations/, "database docs should record the concrete Notifications preferences/subscriptions conversion");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.22 - Conversion wave: Notification preferences and subscriptions[\s\S]*- \[x\] Convert notification user preferences[\s\S]*- \[x\] Preserve per-user preferences[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.22 - [\s\S]*Notification preferences and subscriptions conversion[\s\S]*487 helper invocations[\s\S]*103 direct interpolated operation sites[\s\S]*256 bound operation sites/, "changelog should record the Notifications preferences/subscriptions conversion burndown");
  assert.match(regressionSuite, /scripts\/notifications-preferences-subscriptions-conversion-regression\.mjs/, "regression suite should include the Notifications preferences/subscriptions conversion proof");
}

function assertConvertedFunction(functionName) {
  const block = functionBlock(notificationsRepoSource, functionName);
  assert.match(block, /\b(?:db|transaction)\.(?:query|get|run|transaction)\(`/u, `${functionName} should use the provider-neutral db facade`);
  assert.match(block, /:[A-Za-z][A-Za-z0-9_]*|subscriptionTargetParams|subscriptionWriteParams|notificationDisplayPreferenceParams/u, `${functionName} should use named params`);
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

async function assertNotificationPreferencesAndSubscriptionsRuntime({ userId, workspaceId }) {
  assert.deepEqual(await notificationsRepository.readUserPreferences(workspaceId, userId), [], "fresh user preferences should start empty");
  assert.equal(await notificationsRepository.readUserDisplayPreferences(workspaceId, userId), null, "fresh display preferences should start empty");
  assert.deepEqual(await notificationsRepository.readWorkspaceDefaults(workspaceId), [], "fresh workspace defaults should start empty");

  await notificationsRepository.saveUserPreferences(workspaceId, userId, [
    { enabled: false, event_type: "task.updated" },
    { enabled: true, event_type: "task.created" },
  ]);
  let userPreferences = await notificationsRepository.readUserPreferences(workspaceId, userId);
  assert.deepEqual(userPreferences.map((row) => [row.event_type, Number(row.enabled)]), [
    ["task.created", 1],
    ["task.updated", 0],
  ], "user preferences should persist enabled values and stable event ordering");

  await notificationsRepository.saveUserPreferences(workspaceId, userId, [
    { enabled: true, event_type: "task.updated" },
  ]);
  userPreferences = await notificationsRepository.readUserPreferences(workspaceId, userId);
  assert.equal(userPreferences.length, 2, "user preference upsert should update without duplicating rows");
  assert.equal(Number(userPreferences.find((row) => row.event_type === "task.updated")?.enabled), 1, "user preference upsert should update enabled state");

  await notificationsRepository.saveUserDisplayPreferences(workspaceId, userId, { grouping_mode: "record_type" });
  let displayPreferences = await notificationsRepository.readUserDisplayPreferences(workspaceId, userId);
  assert.equal(displayPreferences.groupingMode, "record_type", "display preferences should persist grouping mode");
  await notificationsRepository.saveUserDisplayPreferences(workspaceId, userId, { grouping_mode: "notification_type" });
  displayPreferences = await notificationsRepository.readUserDisplayPreferences(workspaceId, userId);
  assert.equal(displayPreferences.groupingMode, "notification_type", "display preference upsert should update grouping mode");

  await notificationsRepository.saveWorkspaceDefaults(workspaceId, [
    { enabled: false, event_type: "task.overdue", priority: "urgent" },
    { enabled: true, event_type: "task.updated", priority: "low" },
  ]);
  let workspaceDefaults = await notificationsRepository.readWorkspaceDefaults(workspaceId);
  assert.deepEqual(workspaceDefaults.map((row) => [row.event_type, Number(row.enabled), row.priority]), [
    ["task.overdue", 0, "urgent"],
    ["task.updated", 1, "low"],
  ], "workspace defaults should persist enabled values, priorities, and event ordering");

  await notificationsRepository.saveWorkspaceDefaults(workspaceId, [
    { enabled: true, event_type: "task.overdue", priority: "high" },
  ]);
  workspaceDefaults = await notificationsRepository.readWorkspaceDefaults(workspaceId);
  assert.equal(workspaceDefaults.length, 2, "workspace default upsert should update without duplicating rows");
  const overdueDefault = workspaceDefaults.find((row) => row.event_type === "task.overdue");
  assert.equal(Number(overdueDefault?.enabled), 1, "workspace default upsert should update enabled state");
  assert.equal(overdueDefault?.priority, "high", "workspace default upsert should update priority");

  const targetId = `notification-preference-target-${randomUUID()}`;
  const eventTarget = {
    event_type: "task.updated",
    module_id: "tasks",
    target_id: targetId,
    target_type: "task",
  };
  const generalTarget = {
    event_type: "",
    module_id: "tasks",
    target_id: targetId,
    target_type: "task",
  };

  assert.equal(await notificationsRepository.readSubscription(workspaceId, userId, eventTarget), null, "fresh subscription target should start empty");
  const followed = await notificationsRepository.saveSubscription(workspaceId, userId, eventTarget);
  assert.equal(followed.status, "active", "saveSubscription should create an active subscription");
  assert.equal(followed.event_type, "task.updated", "event-specific subscriptions should preserve event type");

  const followedAgain = await notificationsRepository.saveSubscription(workspaceId, userId, eventTarget);
  assert.equal(followedAgain.notification_subscription_id, followed.notification_subscription_id, "subscription upsert should keep the original subscription ID");

  const unfollowed = await notificationsRepository.removeSubscription(workspaceId, userId, eventTarget);
  assert.equal(unfollowed.status, "inactive", "removeSubscription should mark the subscription inactive");

  const refollowed = await notificationsRepository.saveSubscription(workspaceId, userId, eventTarget);
  assert.equal(refollowed.notification_subscription_id, followed.notification_subscription_id, "re-follow should reactivate the existing subscription row");
  assert.equal(refollowed.status, "active", "re-follow should restore active status");

  const general = await notificationsRepository.saveSubscription(workspaceId, userId, generalTarget);
  assert.equal(general.status, "active", "general target subscription should save as active");
  assert.equal(general.event_type, "", "general target subscription should read as an empty event type");

  const subscriptionsForEvent = await notificationsRepository.readSubscriptionsForTarget(workspaceId, eventTarget);
  assert.deepEqual(
    subscriptionsForEvent.map((row) => row.event_type).sort(),
    ["", "task.updated"],
    "event fan-out target reads should include general and matching event subscriptions",
  );

  await notificationsRepository.removeSubscription(workspaceId, userId, eventTarget);
  const subscriptionsAfterUnfollow = await notificationsRepository.readSubscriptionsForTarget(workspaceId, eventTarget);
  assert.deepEqual(
    subscriptionsAfterUnfollow.map((row) => row.event_type),
    [""],
    "event fan-out target reads should exclude inactive event-specific subscriptions while keeping general follows",
  );

  const rawSubscriptionRows = await querySql(`
SELECT COUNT(*) AS count
FROM notification_subscriptions
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND module_id = 'tasks'
  AND target_type = 'task'
  AND target_id = ${sqlText(targetId)};
`);
  assert.equal(Number(rawSubscriptionRows[0]?.count || 0), 2, "subscription upserts should leave one event-specific row and one general row");
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
