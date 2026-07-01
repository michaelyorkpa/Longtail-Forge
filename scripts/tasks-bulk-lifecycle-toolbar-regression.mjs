import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const appVersion = "0.33.5.20.5";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModuleSource = readText("src/modules/tasks/module.js");
const tasksRoutesSource = readText("src/modules/tasks/tasks.routes.js");
const tasksPublicRoutesSource = readText("src/modules/tasks/public-api.routes.js");
const tasksServiceSource = readText("src/modules/tasks/tasks.service.js");
const tasksScript = readText("public/js/tasks.js");
const tasksView = readText("views/protected/tasks.html");
const styles = readText("public/css/longtail-forge.css");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(tasksModuleSource, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current app version");

const bulkControls = functionBlock(tasksScript, "taskBulkToolbarControls");
const updateBulkControls = functionBlock(tasksScript, "updateBulkControls");
const selectedBulkActions = functionBlock(tasksScript, "selectedBulkActions");
const lifecycleTaskIds = functionBlock(tasksScript, "bulkLifecycleTaskIds");
const lifecycleOptions = functionBlock(tasksScript, "updateBulkLifecycleOptions");
const archiveConfirmation = functionBlock(tasksScript, "confirmBulkArchive");
const applyBulkAction = functionBlock(tasksScript, "applyBulkAction");
const reloadTaskList = functionBlock(tasksScript, "reloadTaskList");

assert.match(bulkControls, /data-task-bulk-lifecycle[\s\S]*data-task-bulk-lifecycle-control[\s\S]*hidden:\s*true/, "Bulk toolbar should expose a module-owned lifecycle control");
assert.match(tasksScript, /bulkLifecycleInput\?\.addEventListener\("change", updateBulkControls\)/, "Lifecycle control changes should update bulk action state");
assert.match(updateBulkControls, /updateBulkLifecycleOptions\(taskIds\)[\s\S]*selectedBulkActions\(taskIds\)/, "Lifecycle options should be refreshed before apply state is calculated");
assert.match(selectedBulkActions, /lifecycleAction === "restore"[\s\S]*pushLifecycleBulkAction\(actions, lifecycleAction, taskIds\)/, "Restore should dispatch as a Tasks-owned bulk action");
assert.match(selectedBulkActions, /lifecycleAction === "archive"[\s\S]*pushLifecycleBulkAction\(actions, lifecycleAction, taskIds\)/, "Archive should dispatch as a Tasks-owned bulk action");
assert.match(lifecycleTaskIds, /lifecycleAction === "restore"[\s\S]*task\.status === "archived"[\s\S]*task\.status !== "archived"/, "Lifecycle target ids should be filtered by supported selected task status");
assert.match(lifecycleOptions, /value: "archive", label: "Archive selected"/, "Archive option should appear only when selectable tasks support it");
assert.match(lifecycleOptions, /value: "restore", label: "Restore selected"/, "Restore option should appear only when selectable tasks support it");
assert.match(archiveConfirmation, /title:\s*"Archive selected tasks\?"/, "Bulk archive should preserve an explicit archive confirmation prompt");
assert.match(archiveConfirmation, /danger:\s*true/, "Bulk archive confirmation should remain dangerous");
assert.doesNotMatch(selectedBulkActions, /action:\s*"(delete|soft_delete|permanent_delete)"/, "Bulk lifecycle wiring should not invent delete payloads");
assert.doesNotMatch(bulkControls, /"(?:delete|soft_delete|permanent_delete)"/, "Bulk toolbar should not expose unsupported delete actions");
assert.doesNotMatch(tasksRoutesSource, /tasksRoutes\.delete\("\/tasks\/:taskId"\s*,/, "Browser API should not expose a task delete route");
assert.doesNotMatch(tasksPublicRoutesSource, /tasksPublicApiRoutes\.delete|\/api\/v1\/tasks\/:taskId\/delete/, "Public API should not expose a task delete route");
assert.match(tasksServiceSource, /if \(action === "archive"\) \{[\s\S]*return archive\(taskId, session\);[\s\S]*if \(action === "restore"\) \{[\s\S]*return restore\(taskId, session\);/, "Bulk lifecycle actions should delegate to existing service lifecycle functions");
assert.match(applyBulkAction, /api\.postJson\("\/api\/tasks\/bulk", payload\)/, "Browser lifecycle actions should post through the Tasks bulk route");
assert.match(applyBulkAction, /resetBulkInputs\(\);[\s\S]*await reloadTaskList\(\)/, "Bulk lifecycle actions should reset controls and refresh canonical list data after apply");
assert.doesNotMatch(applyBulkAction, /buildTasksViewShell|createTaskMainListChrome|renderSurface/, "Bulk lifecycle apply should not rebuild the framework page shell");
assert.doesNotMatch(reloadTaskList, /buildTasksViewShell|createTaskMainListChrome|renderSurface/, "Bulk lifecycle refresh should reload list data without rebuilding the page shell");
assert.match(tasksView, /css\/longtail-forge\.css\?v=73[\s\S]*js\/shared\/view-builder\.js\?v=16[\s\S]*js\/shared\/view-renderer\.js\?v=13[\s\S]*js\/tasks\.js\?v=21/, "Tasks host should load the lifecycle bulk cache keys");
assert.match(styles, /\.task-bulk-grid \[data-task-bulk-apply\]\s*\{[\s\S]*grid-column:\s*4;[\s\S]*align-self:\s*end;/, "Desktop bulk apply action should remain aligned with the lifecycle column");
assert.match(styles, /@media[\s\S]*\.task-bulk-grid \[data-task-bulk-apply\]\s*\{[\s\S]*grid-column:\s*auto;/, "Mobile bulk apply action should return to the one-column grid");
assert.match(regressionSuite, /scripts\/tasks-bulk-lifecycle-toolbar-regression\.mjs/, "Regression suite should include the lifecycle bulk toolbar regression");

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-tasks-bulk-lifecycle-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-tasks-bulk-lifecycle.db");
process.env.SUPER_ADMIN_PASSWORD = "Tasks-Bulk-Lifecycle-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createFixtures(session);

  await assertArchiveAndRestore(session, fixtures);
  await assertDeleteIsUnsupported(session, fixtures);
  await assertPermissionsRemainAuthoritative(session, fixtures);
  await assertIntegrity();

  console.log("Tasks bulk lifecycle toolbar regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function createFixtures(session) {
  const active = (await tasksService.create({ title: "Bulk lifecycle active" }, session)).task;
  const second = (await tasksService.create({ title: "Bulk lifecycle second" }, session)).task;
  const completed = (await tasksService.create({ title: "Bulk lifecycle completed" }, session)).task;
  await tasksService.complete(completed.task_id, session);
  await tasksService.archive(completed.task_id, session);
  const permissionTarget = (await tasksService.create({ title: "Bulk lifecycle permission target" }, session)).task;
  const restorePermissionTarget = (await tasksService.create({ title: "Bulk lifecycle restore permission target" }, session)).task;
  await tasksService.archive(restorePermissionTarget.task_id, session);

  return { active, completed, permissionTarget, restorePermissionTarget, second };
}

async function assertArchiveAndRestore(session, fixtures) {
  const archived = await tasksService.bulkUpdate({
    action: "archive",
    task_ids: [fixtures.active.task_id, fixtures.second.task_id],
  }, session);
  assert.equal(archived.errors.length, 0);
  assert.deepEqual(archived.tasks.map((task) => task.status), ["archived", "archived"]);
  assert.ok(archived.tasks.every((task) => task.archived_at), "Archived tasks should receive archive metadata");

  const restored = await tasksService.bulkUpdate({
    action: "restore",
    task_ids: [fixtures.active.task_id, fixtures.completed.task_id],
  }, session);
  assert.equal(restored.errors.length, 0);
  assert.deepEqual(restored.tasks.map((task) => task.status), ["open", "complete"], "Restore should preserve completed state where completion metadata exists");
  assert.ok(restored.tasks.every((task) => !task.archived_at), "Restored tasks should clear archive metadata");
}

async function assertDeleteIsUnsupported(session, fixtures) {
  const deleted = await tasksService.bulkUpdate({
    action: "delete",
    task_ids: [fixtures.second.task_id],
  }, session);
  assert.equal(deleted.tasks.length, 0);
  assert.equal(deleted.errors.length, 1);
  assert.equal(deleted.errors[0].task_id, fixtures.second.task_id);
  assert.match(deleted.errors[0].message, /unsupported bulk task action/i);
}

async function assertPermissionsRemainAuthoritative(session, fixtures) {
  const noRoleSession = await createNoRoleSession(session.workspace_id);
  const deniedArchive = await tasksService.bulkUpdate({
    action: "archive",
    task_ids: [fixtures.permissionTarget.task_id],
  }, noRoleSession);
  assert.equal(deniedArchive.tasks.length, 0);
  assert.equal(deniedArchive.errors.length, 1);
  assert.equal(deniedArchive.errors[0].status, 403);
  assert.equal(JSON.stringify(deniedArchive.errors).includes("Bulk lifecycle permission target"), false, "Archive errors should not leak inaccessible task labels");

  const deniedRestore = await tasksService.bulkUpdate({
    action: "restore",
    task_ids: [fixtures.restorePermissionTarget.task_id],
  }, noRoleSession);
  assert.equal(deniedRestore.tasks.length, 0);
  assert.equal(deniedRestore.errors.length, 1);
  assert.equal(deniedRestore.errors[0].status, 403);
  assert.equal(JSON.stringify(deniedRestore.errors).includes("Bulk lifecycle restore permission target"), false, "Restore errors should not leak inaccessible task labels");
}

async function createNoRoleSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  password,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(`tasks-bulk-lifecycle-no-role-${userId}@example.test`)},
  'Tasks Bulk Lifecycle No Role',
  'unused',
  'active',
  'no',
  ${sqlText(workspaceId)}
);

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
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    ip: "127.0.0.1",
    timezone: "America/New_York",
    user_id: userId,
    username: `tasks-bulk-lifecycle-no-role-${userId}@example.test`,
    workspace_id: workspaceId,
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
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

function readText(pathName) {
  return readFileSync(new URL(`../${pathName}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
