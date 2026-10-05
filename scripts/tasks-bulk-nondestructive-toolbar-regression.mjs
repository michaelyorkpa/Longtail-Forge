import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireJsonRecord } from "./test-support/json-record-assertions.mjs";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} TasksSession */
import { createProjectTextReader, extractFunctionSpan } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const tasksModuleSource = readText("src/modules/tasks/module.js");
const tasksRoutesSource = readText("src/modules/tasks/tasks.routes.js");
const tasksServiceSource = readText("src/modules/tasks/tasks.service.js");
const tasksScript = readText("public/js/tasks.js");

assert.match(tasksModuleSource, /version:\s*appVersion/, "Tasks module should report the current app version");

const bulkChrome = extractFunctionSpan(tasksScript, "createTaskBulkToolbarChrome");
const bulkControls = extractFunctionSpan(tasksScript, "taskBulkToolbarControls");
const selectedBulkActions = extractFunctionSpan(tasksScript, "selectedBulkActions");
const applyBulkAction = extractFunctionSpan(tasksScript, "applyBulkAction");
const reloadTaskList = extractFunctionSpan(tasksScript, "reloadTaskList");

assert.match(tasksScript, /bulkApplyButton\?\.addEventListener\("click", applyBulkAction\)/, "Bulk apply control should dispatch to the Tasks-owned handler");
assert.match(bulkChrome, /view\.createBulkActionToolbar\(\{[\s\S]*body:\s*taskBulkToolbarControls\(\)/, "Framework toolbar should host the Tasks-owned bulk control body");
assert.match(applyBulkAction, /api\.postJson\("\/api\/tasks\/bulk", payload\)/, "Tasks handler should call the Tasks-owned bulk route");
assert.match(applyBulkAction, /resetBulkInputs\(\);[\s\S]*await reloadTaskList\(\)/, "Bulk updates should reset controls and refresh the task list after apply");
assert.doesNotMatch(applyBulkAction, /buildTasksViewShell|createTaskMainListChrome|renderSurface/, "Bulk apply should not rebuild the framework page shell");
assert.doesNotMatch(reloadTaskList, /buildTasksViewShell|createTaskMainListChrome|renderSurface/, "Bulk refresh should reload list data without rebuilding the page shell");

for (const action of ["status", "priority", "project_assign", "due_date", "due_time", "assignee_replace"]) {
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
assert.match(bulkControls, /data-task-bulk-client-control[\s\S]*data-task-bulk-project-control/, "Tasks should expose Client scope and required Project controls inside the module-owned bulk body");
assert.match(tasksScript, /function populateBulkContextOptions[\s\S]*if \(usesClientScope\(\)\)[\s\S]*bulkClientControl\?\.remove\(\)/, "Personal and Family Tasks surfaces should remove the Client bulk control rather than expose it");
assert.match(tasksScript, /function handleBulkProjectChange[\s\S]*project\.client_id \|\| ""[\s\S]*populateBulkProjectOptions\(project\.id\)/, "Business Project selection should derive its Client and keep the Project choice synchronized");

assert.match(tasksRoutesSource, /tasksRoutes\.post\("\/tasks\/bulk"[\s\S]*tasksService\.bulkUpdate/, "Bulk route should remain Tasks-service-owned");
assert.match(tasksServiceSource, /async function bulkUpdate\(payload, session\)[\s\S]*assertModuleWriteEnabled\(session, TASKS_MODULE_ID\)/, "Tasks service should own module write checks for bulk updates");
assert.match(tasksServiceSource, /tagsService\.bulkAssign\(session,[\s\S]*targetType:\s*"task"/, "Task tag bulk updates should use the Tags-owned bulk assignment contract");
assert.match(tasksServiceSource, /if \(action === "status"\)[\s\S]*return update\(taskId, \{[\s\S]*status: payload\.status,[\s\S]*blocked_reason: payload\.blocked_reason/, "Status bulk action and its blocked reason should be service-owned");
assert.match(tasksServiceSource, /if \(action === "priority"\)[\s\S]*return update\(taskId, \{ priority: payload\.priority \}/, "Priority bulk action should be service-owned");
assert.match(tasksServiceSource, /if \(action === "project_assign"\)[\s\S]*Project is required for bulk Project assignment[\s\S]*return update\(taskId, \{[\s\S]*client_id:[\s\S]*project_id: projectId/, "Project bulk assignment should delegate to the canonical Task update path with a required Project");
assert.match(tasksServiceSource, /if \(action === "assignee_replace"\)[\s\S]*assignee_ids: normalizeAssigneeIds/, "Assignee replacement should be service-owned");

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-tasks-bulk-nondestructive-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-tasks-bulk-nondestructive.db");
process.env.SUPER_ADMIN_PASSWORD = "Tasks-Bulk-Nondestructive-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { internalEventBus } = await import("../src/core/events/event-bus.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { indexTaskRecord } = await import("../src/modules/tasks/search-indexers.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { tagsService } = await import("../src/services/tags.service.js");

/** @typedef {import("../src/types/framework-contracts.js").InternalEvent} InternalEvent */
/** @typedef {Awaited<ReturnType<typeof createFixtures>>} BulkFixtures */

/** @type {InternalEvent[]} */
const capturedTaskEvents = [];
const unsubscribeTaskUpdated = internalEventBus.on("task.updated", async (event) => {
  capturedTaskEvents.push(event);
}, {
  id: "tasks-bulk-nondestructive:task.updated",
  moduleId: "tasks-bulk-nondestructive",
});

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createFixtures(session);

  await assertStatusPriorityAssigneeBulkUpdates(session, fixtures);
  await assertProjectBulkUpdates(session, fixtures);
  await assertDueDateAndDueTimeClearing(session, fixtures);
  await assertTagAddRemoveReplace(session, fixtures);
  await assertPermissionsRemainAuthoritative(session, fixtures);
  await assertIntegrity();

  console.log("Tasks non-destructive bulk toolbar regression passed.");
} finally {
  unsubscribeTaskUpdated();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {TasksSession} session */
async function createFixtures(session) {
  const keepTag = (await tagsService.create(session, { name: "Bulk Keep" })).tag;
  const addTag = (await tagsService.create(session, { name: "Bulk Add" })).tag;
  const replaceTag = (await tagsService.create(session, { name: "Bulk Replace" })).tag;
  const firstClient = (await clientsService.createClient({ name: "Bulk Context First Client" }, session)).client;
  const secondClient = (await clientsService.createClient({ name: "Bulk Context Second Client" }, session)).client;
  const firstProject = (await clientsService.createProject(firstClient.id, { name: "Bulk Context First Project" }, session)).project;
  const secondProject = (await clientsService.createProject(secondClient.id, { name: "Bulk Context Second Project" }, session)).project;
  const first = (await tasksService.create({
    title: "Bulk nondestructive first",
    due_date: "2026-06-24",
    due_time: "09:00",
    project_id: firstProject.id,
    tagIds: [keepTag.tag_id],
  }, session)).task;
  const second = (await tasksService.create({
    title: "Bulk nondestructive second",
    due_date: "2026-06-25",
    due_time: "10:30",
    project_id: firstProject.id,
    tagIds: [keepTag.tag_id],
  }, session)).task;

  return { addTag, first, firstProject, keepTag, replaceTag, second, secondProject };
}

/** @param {TasksSession} session @param {BulkFixtures} fixtures */
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

/** @param {TasksSession} session @param {BulkFixtures} fixtures */
async function assertProjectBulkUpdates(session, fixtures) {
  const taskIds = [fixtures.first.task_id, fixtures.second.task_id];
  const moved = await tasksService.bulkUpdate({
    action: "project_assign",
    client_id: fixtures.secondProject.client_id,
    project_id: fixtures.secondProject.id,
    task_ids: taskIds,
  }, session);

  assert.equal(moved.errors.length, 0);
  assert.deepEqual(moved.tasks.map((task) => task.project_id), [fixtures.secondProject.id, fixtures.secondProject.id]);
  assert.deepEqual(moved.tasks.map((task) => task.client_id), [fixtures.secondProject.client_id, fixtures.secondProject.client_id], "Project assignment should derive and persist the matching Business Client");

  const updateEvent = capturedTaskEvents.find((event) =>
    event.record_id === fixtures.first.task_id && event.metadata?.project_id === fixtures.secondProject.id,
  );
  assert.ok(updateEvent, "bulk Project assignment should retain the canonical task.updated event side effect");

  const [audit] = await querySql(`
SELECT metadata_json
FROM audit_logs
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND record_type = 'task'
  AND record_id = ${sqlText(fixtures.first.task_id)}
  AND action = 'task_updated'
ORDER BY created_at DESC
LIMIT 1;
`);
  const auditMetadata = requireJsonRecord(
    JSON.parse(String(audit?.metadata_json || "{}")),
    "bulk project assignment audit metadata",
  );
  assert.equal(auditMetadata.project_id, fixtures.secondProject.id, "bulk Project assignment should retain canonical audit scope metadata");

  const indexed = await indexTaskRecord({
    workspaceId: session.workspace_id,
    recordId: fixtures.first.task_id,
  });
  assert.ok(
    indexed && !("documents" in indexed),
    "indexing a single bulk-updated task should return that record's search document",
  );
  assert.equal(indexed.client_id, fixtures.secondProject.client_id);
  assert.equal(indexed.project_id, fixtures.secondProject.id, "the canonical Search document should reflect the bulk Project move");

  const cascadeParent = (await tasksService.create({
    title: "Bulk Project cascade parent",
    project_id: fixtures.firstProject.id,
  }, session)).task;
  const cascadeChild = (await tasksService.create({
    title: "Bulk Project cascade child",
    project_id: fixtures.firstProject.id,
  }, session)).task;
  await tasksService.addChildTask(cascadeParent.task_id, { child_task_id: cascadeChild.task_id }, session);
  const cascaded = await tasksService.bulkUpdate({
    action: "project_assign",
    project_id: fixtures.secondProject.id,
    task_ids: [cascadeParent.task_id],
  }, session);
  assert.equal(cascaded.errors.length, 0);
  assert.deepEqual(
    new Set(cascaded.tasks.map((task) => task.task_id)),
    new Set([cascadeParent.task_id, cascadeChild.task_id]),
    "bulk Project assignment should return the selected parent and its authoritative cascaded descendants",
  );
  assert.ok(cascaded.tasks.every((task) => task.project_id === fixtures.secondProject.id));

  const partial = await tasksService.bulkUpdate({
    action: "project_assign",
    project_id: fixtures.firstProject.id,
    task_ids: [fixtures.first.task_id, "missing-bulk-project-task"],
  }, session);
  assert.equal(partial.tasks.length, 1);
  assert.equal(partial.errors.length, 1);
  assert.equal(partial.errors[0].task_id, "missing-bulk-project-task", "bulk Project assignment should retain per-task partial failures");

  const missingProject = await tasksService.bulkUpdate({
    action: "project_assign",
    task_ids: [fixtures.first.task_id],
  }, session);
  assert.equal(missingProject.tasks.length, 0);
  assert.equal(missingProject.errors[0].status, 400);
  assert.match(missingProject.errors[0].message, /Project is required/i);

  const mismatchedClient = await tasksService.bulkUpdate({
    action: "project_assign",
    client_id: fixtures.firstProject.client_id,
    project_id: fixtures.secondProject.id,
    task_ids: [fixtures.first.task_id],
  }, session);
  assert.equal(mismatchedClient.tasks.length, 0);
  assert.equal(mismatchedClient.errors[0].status, 400);
  assert.match(mismatchedClient.errors[0].message, /client must match/i, "bulk Project assignment should reject a mismatched Business Client at the server boundary");

  const projectAdminSession = await createProjectAdminSession(session.workspace_id, fixtures.firstProject.id);
  const scopedTask = (await tasksService.create({
    title: "Bulk Project scoped authority",
    project_id: fixtures.firstProject.id,
  }, session)).task;
  const deniedMove = await tasksService.bulkUpdate({
    action: "project_assign",
    project_id: fixtures.secondProject.id,
    task_ids: [scopedTask.task_id],
  }, projectAdminSession);
  assert.equal(deniedMove.tasks.length, 0);
  assert.equal(deniedMove.errors[0].status, 403, "destination Project authority should be enforced by the canonical Task update path");
  assert.equal(JSON.stringify(deniedMove.errors).includes(scopedTask.title), false, "bulk Project errors should not leak inaccessible Task labels");
}

/** @param {TasksSession} session @param {BulkFixtures} fixtures */
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

/** @param {TasksSession} session @param {BulkFixtures} fixtures */
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
  assert.ok(replaced.tasks[0], "bulk tag replacement should return the changed task");
  assert.deepEqual(replaced.tasks[0].tags.map((tag) => tag.tag_id), [fixtures.replaceTag.tag_id]);
}

/** @param {TasksSession} session @param {BulkFixtures} fixtures */
async function assertPermissionsRemainAuthoritative(session, fixtures) {
  const noRoleSession = /** @type {import("../src/types/task-server-contracts.d.ts").TaskServerSession} */ (/** @type {unknown} */ (await createNoRoleSession(session.workspace_id)));
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

/** @param {string} workspaceId @returns {Promise<TasksSession>} */
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

  return workspaceSessionFixture({
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    ip_address: "127.0.0.1",
    timezone: "America/New_York",
    user_id: userId,
    username: `tasks-bulk-nondestructive-no-role-${userId}@example.test`,
    workspace_id: workspaceId,
  });
}

/** @param {string} workspaceId @param {string} projectId @returns {Promise<TasksSession>} */
async function createProjectAdminSession(workspaceId, projectId) {
  const session = await createNoRoleSession(workspaceId);
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(session.user_id)},
  'project_admin',
  'project',
  ${sqlText(projectId)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return session;
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  return workspaceSessionFixture(requireFirstRow(rows, "fresh database should seed a protected super admin"));
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
