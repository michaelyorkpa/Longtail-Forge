import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const appVersion = "0.33.5.18.10.8.5";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModuleSource = readText("src/modules/tasks/module.js");
const tasksRoutesSource = readText("src/modules/tasks/tasks.routes.js");
const tasksServiceSource = readText("src/modules/tasks/tasks.service.js");
const tasksScript = readText("public/js/tasks.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(tasksModuleSource, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current app version");

const bulkChrome = functionBlock(tasksScript, "createTaskBulkToolbarChrome");
const bulkControls = functionBlock(tasksScript, "taskBulkToolbarControls");
const selectedBulkActions = functionBlock(tasksScript, "selectedBulkActions");
const applyBulkAction = functionBlock(tasksScript, "applyBulkAction");
const reloadTaskList = functionBlock(tasksScript, "reloadTaskList");

assert.match(tasksScript, /bulkApplyButton\?\.addEventListener\("click", applyBulkAction\)/, "Bulk apply control should dispatch to the Tasks-owned handler");
assert.match(bulkChrome, /view\.createBulkActionToolbar\(\{[\s\S]*body:\s*taskBulkToolbarControls\(\)/, "Framework toolbar should host the Tasks-owned bulk control body");
assert.match(applyBulkAction, /api\.postJson\("\/api\/tasks\/bulk", payload\)/, "Tasks handler should call the Tasks-owned bulk route");
assert.match(applyBulkAction, /resetBulkInputs\(\);[\s\S]*await reloadTaskList\(\)/, "Bulk updates should reset controls and refresh the task list after apply");
assert.doesNotMatch(applyBulkAction, /buildTasksViewShell|createTaskMainListChrome|renderSurface/, "Bulk apply should not rebuild the framework page shell");
assert.doesNotMatch(reloadTaskList, /buildTasksViewShell|createTaskMainListChrome|renderSurface/, "Bulk refresh should reload list data without rebuilding the page shell");

for (const action of ["status", "priority", "due_date", "due_time", "assignee_replace"]) {
  assert.match(selectedBulkActions, new RegExp(`action:\\s*"${action}"`), `Browser should be able to build ${action} bulk payloads`);
}
for (const action of ["tag_add", "tag_remove", "tag_replace"]) {
  assert.match(bulkControls, new RegExp(`\\["${action}"`), `Browser should expose the ${action} bulk tag action`);
}
assert.match(selectedBulkActions, /actions\.push\(\{ action: tagAction, task_ids: taskIds, tagIds \}\)/, "Browser should build selected tag action payloads dynamically");
assert.doesNotMatch(selectedBulkActions, /action:\s*"(delete|soft_delete|permanent_delete)"/, "Bulk toolbar wiring should not emit unsupported delete actions");
assert.match(selectedBulkActions, /due_date:\s*shouldClearDueDate \? "" : dueDate/, "Due date clearing should send an empty due date");
assert.match(selectedBulkActions, /if \(!shouldClearDueDate && \(shouldClearDueTime \|\| dueTime\)\)/, "Due time should not be sent while clearing due date");
assert.match(selectedBulkActions, /tagIds/, "Tag add/remove/replace payloads should send selected tag ids");

assert.match(tasksRoutesSource, /tasksRoutes\.post\("\/tasks\/bulk"[\s\S]*tasksService\.bulkUpdate/, "Bulk route should remain Tasks-service-owned");
assert.match(tasksServiceSource, /async function bulkUpdate\(payload, session\)[\s\S]*assertModuleWriteEnabled\(session, TASKS_MODULE_ID\)/, "Tasks service should own module write checks for bulk updates");
assert.match(tasksServiceSource, /tagsService\.bulkAssign\(session,[\s\S]*targetType:\s*"task"/, "Task tag bulk updates should use the Tags-owned bulk assignment contract");
assert.match(tasksServiceSource, /if \(action === "status"\)[\s\S]*return update\(taskId, \{ status: payload\.status \}/, "Status bulk action should be service-owned");
assert.match(tasksServiceSource, /if \(action === "priority"\)[\s\S]*return update\(taskId, \{ priority: payload\.priority \}/, "Priority bulk action should be service-owned");
assert.match(tasksServiceSource, /if \(action === "assignee_replace"\)[\s\S]*assignee_ids: normalizeAssigneeIds/, "Assignee replacement should be service-owned");
assert.match(regressionSuite, /scripts\/tasks-bulk-nondestructive-toolbar-regression\.mjs/, "Regression suite should include the non-destructive bulk toolbar regression");

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-tasks-bulk-nondestructive-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-tasks-bulk-nondestructive.db");
process.env.SUPER_ADMIN_PASSWORD = "Tasks-Bulk-Nondestructive-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { tagsService } = await import("../src/services/tags.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createFixtures(session);

  await assertStatusPriorityAssigneeBulkUpdates(session, fixtures);
  await assertDueDateAndDueTimeClearing(session, fixtures);
  await assertTagAddRemoveReplace(session, fixtures);
  await assertPermissionsRemainAuthoritative(session, fixtures);
  await assertIntegrity();

  console.log("Tasks non-destructive bulk toolbar regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function createFixtures(session) {
  const keepTag = (await tagsService.create(session, { name: "Bulk Keep" })).tag;
  const addTag = (await tagsService.create(session, { name: "Bulk Add" })).tag;
  const replaceTag = (await tagsService.create(session, { name: "Bulk Replace" })).tag;
  const first = (await tasksService.create({
    title: "Bulk nondestructive first",
    due_date: "2026-06-24",
    due_time: "09:00",
    tagIds: [keepTag.tag_id],
  }, session)).task;
  const second = (await tasksService.create({
    title: "Bulk nondestructive second",
    due_date: "2026-06-25",
    due_time: "10:30",
    tagIds: [keepTag.tag_id],
  }, session)).task;

  return { addTag, first, keepTag, replaceTag, second };
}

async function assertStatusPriorityAssigneeBulkUpdates(session, fixtures) {
  const taskIds = [fixtures.first.task_id, fixtures.second.task_id];
  const status = await tasksService.bulkUpdate({ action: "status", status: "in_progress", task_ids: taskIds }, session);
  assert.equal(status.errors.length, 0);
  assert.deepEqual(status.tasks.map((task) => task.status), ["in_progress", "in_progress"]);

  const priority = await tasksService.bulkUpdate({ action: "priority", priority: "high", task_ids: taskIds }, session);
  assert.equal(priority.errors.length, 0);
  assert.deepEqual(priority.tasks.map((task) => task.priority), ["high", "high"]);

  const assignees = await tasksService.bulkUpdate({
    action: "assignee_replace",
    assignee_ids: [session.user_id],
    task_ids: taskIds,
  }, session);
  assert.equal(assignees.errors.length, 0);
  assert.deepEqual(assignees.tasks.map((task) => task.assignee_ids), [[session.user_id], [session.user_id]]);
}

async function assertDueDateAndDueTimeClearing(session, fixtures) {
  const clearedTime = await tasksService.bulkUpdate({
    action: "due_time",
    due_time: "",
    task_ids: [fixtures.first.task_id],
  }, session);
  assert.equal(clearedTime.errors.length, 0);
  assert.equal(clearedTime.tasks[0].due_time, "");
  assert.equal(clearedTime.tasks[0].due_date, "2026-06-24");

  const clearedDate = await tasksService.bulkUpdate({
    action: "due_date",
    due_date: "",
    task_ids: [fixtures.second.task_id],
  }, session);
  assert.equal(clearedDate.errors.length, 0);
  assert.equal(clearedDate.tasks[0].due_date, "");
  assert.equal(clearedDate.tasks[0].due_time, "", "Clearing due date should clear due time too");
}

async function assertTagAddRemoveReplace(session, fixtures) {
  const added = await tasksService.bulkUpdate({
    action: "tag_add",
    tagIds: [fixtures.addTag.tag_id],
    task_ids: [fixtures.first.task_id, fixtures.second.task_id],
  }, session);
  assert.equal(added.errors.length, 0);
  assert.ok(added.tasks.every((task) => task.tags.some((tag) => tag.tag_id === fixtures.addTag.tag_id)));

  const removed = await tasksService.bulkUpdate({
    action: "tag_remove",
    tagIds: [fixtures.keepTag.tag_id],
    task_ids: [fixtures.first.task_id, fixtures.second.task_id],
  }, session);
  assert.equal(removed.errors.length, 0);
  assert.ok(removed.tasks.every((task) => !task.tags.some((tag) => tag.tag_id === fixtures.keepTag.tag_id)));

  const replaced = await tasksService.bulkUpdate({
    action: "tag_replace",
    tagIds: [fixtures.replaceTag.tag_id],
    task_ids: [fixtures.first.task_id],
  }, session);
  assert.equal(replaced.errors.length, 0);
  assert.deepEqual(replaced.tasks[0].tags.map((tag) => tag.tag_id), [fixtures.replaceTag.tag_id]);
}

async function assertPermissionsRemainAuthoritative(session, fixtures) {
  const noRoleSession = await createNoRoleSession(session.workspace_id);
  const denied = await tasksService.bulkUpdate({
    action: "priority",
    priority: "urgent",
    task_ids: [fixtures.first.task_id],
  }, noRoleSession);
  assert.equal(denied.tasks.length, 0);
  assert.equal(denied.errors.length, 1);
  assert.equal(denied.errors[0].status, 403);
  assert.equal(JSON.stringify(denied.errors).includes("Bulk nondestructive first"), false, "Partial bulk errors should not leak inaccessible task labels");
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
  ${sqlText(`tasks-bulk-nondestructive-no-role-${userId}@example.test`)},
  'Tasks Bulk Nondestructive No Role',
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
    username: `tasks-bulk-nondestructive-no-role-${userId}@example.test`,
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

