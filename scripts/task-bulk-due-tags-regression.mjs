import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} TasksSession */

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-bulk-due-tags-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-bulk-due-tags.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Bulk-Due-Tags-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
/** @typedef {Awaited<ReturnType<typeof createFixtures>>} DueTagFixtures */

const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { tagsService } = await import("../src/services/tags.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createFixtures(session);

  await assertDueDateBulkActions(session, fixtures);
  await assertDueTimeBulkActions(session, fixtures);
  await assertTagBulkActionsPreserveNonManualTags(session, fixtures);
  await assertPartialFailures(session, fixtures);
  await assertBrowserWiring();
  await assertIntegrity();

  console.log("Task bulk due date/time and tags regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {TasksSession} session */
async function createFixtures(session) {
  const directTag = (await tagsService.create(session, { name: "Bulk Due Direct" })).tag;
  const propagatedTag = (await tagsService.create(session, { name: "Bulk Due Propagated" })).tag;
  const replacementTag = (await tagsService.create(session, { name: "Bulk Due Replacement" })).tag;
  const first = (await tasksService.create({
    title: "Bulk due first",
    due_date: "2026-06-15",
    due_time: "09:15",
    tagIds: [directTag.tag_id],
  }, session)).task;
  const second = (await tasksService.create({
    title: "Bulk due second",
    due_date: "2026-06-16",
    due_time: "10:30",
  }, session)).task;
  const noDate = (await tasksService.create({
    title: "Bulk due no date",
  }, session)).task;

  await tagsService.addPropagatedAssignment(session, {
    propagationRuleId: "task-bulk-due-regression",
    sourceTargetId: "source-project",
    sourceTargetType: "project",
    tagId: propagatedTag.tag_id,
    targetId: first.task_id,
    targetType: "task",
  });

  return {
    directTag,
    first,
    noDate,
    propagatedTag,
    replacementTag,
    second,
  };
}

/** @param {TasksSession} session @param {DueTagFixtures} fixtures */
async function assertDueDateBulkActions(session, fixtures) {
  const setDate = await tasksService.bulkUpdate({
    action: "due_date",
    due_date: "2026-06-20",
    task_ids: [fixtures.first.task_id, fixtures.second.task_id],
  }, session);
  assert.equal(setDate.errors.length, 0);
  assert.deepEqual(setDate.tasks.map((task) => task.due_date), ["2026-06-20", "2026-06-20"]);
  assert.deepEqual(setDate.tasks.map((task) => task.due_time), ["09:15", "10:30"], "setting due date should preserve existing due times");

  const clearedDate = await tasksService.bulkUpdate({
    action: "due_date",
    due_date: "",
    task_ids: [fixtures.first.task_id],
  }, session);
  assert.equal(clearedDate.errors.length, 0);
  assert.equal(clearedDate.tasks[0].due_date, "");
  assert.equal(clearedDate.tasks[0].due_time, "", "clearing due date should clear due time too");
}

/** @param {TasksSession} session @param {DueTagFixtures} fixtures */
async function assertDueTimeBulkActions(session, fixtures) {
  const setTime = await tasksService.bulkUpdate({
    action: "due_time",
    due_time: "14:45",
    task_ids: [fixtures.second.task_id],
  }, session);
  assert.equal(setTime.errors.length, 0);
  assert.equal(setTime.tasks[0].due_date, "2026-06-20");
  assert.equal(setTime.tasks[0].due_time, "14:45");

  const clearedTime = await tasksService.bulkUpdate({
    action: "due_time",
    due_time: "",
    task_ids: [fixtures.second.task_id],
  }, session);
  assert.equal(clearedTime.errors.length, 0);
  assert.equal(clearedTime.tasks[0].due_time, "");
}

/** @param {TasksSession} session @param {DueTagFixtures} fixtures */
async function assertTagBulkActionsPreserveNonManualTags(session, fixtures) {
  const added = await tasksService.bulkUpdate({
    action: "tag_add",
    tagIds: [fixtures.replacementTag.tag_id],
    task_ids: [fixtures.first.task_id, fixtures.second.task_id],
  }, session);
  assert.equal(added.errors.length, 0);
  assert.equal(added.tasks.length, 2);
  assert.ok(added.tasks[0], "bulk tag addition should return changed tasks");
  assert.ok(added.tasks[0].tags.some((tag) => tag.tag_id === fixtures.replacementTag.tag_id));

  const removed = await tasksService.bulkUpdate({
    action: "tag_remove",
    tagIds: [fixtures.directTag.tag_id, fixtures.propagatedTag.tag_id],
    task_ids: [fixtures.first.task_id],
  }, session);
  assert.equal(removed.errors.length, 0);
  const assignments = await tagsService.listAssignments(session, {
    targetId: fixtures.first.task_id,
    targetType: "task",
  });
  assert.equal(assignments.directTags.some((tag) => tag.tag_id === fixtures.directTag.tag_id), false);
  assert.ok(assignments.propagatedTags.some((tag) => tag.tag_id === fixtures.propagatedTag.tag_id), "bulk remove should preserve propagated tags");
}

/** @param {TasksSession} session @param {DueTagFixtures} fixtures */
async function assertPartialFailures(session, fixtures) {
  const invalidDueTime = await tasksService.bulkUpdate({
    action: "due_time",
    due_time: "08:00",
    task_ids: [fixtures.noDate.task_id, fixtures.second.task_id],
  }, session);
  assert.equal(invalidDueTime.tasks.length, 1);
  assert.equal(invalidDueTime.errors.length, 1);
  assert.equal(invalidDueTime.errors[0].task_id, fixtures.noDate.task_id);
  assert.match(invalidDueTime.errors[0].message, /due time requires a due date/i);

  const noRoleSession = /** @type {import("../src/types/task-server-contracts.d.ts").TaskServerSession} */ (/** @type {unknown} */ (await createNoRoleSession(session.workspace_id)));
  const denied = await tasksService.bulkUpdate({
    action: "due_date",
    due_date: "2026-06-22",
    task_ids: [fixtures.second.task_id],
  }, noRoleSession);
  assert.equal(denied.tasks.length, 0);
  assert.equal(denied.errors.length, 1);
  assert.equal(denied.errors[0].task_id, fixtures.second.task_id);
  assert.equal(JSON.stringify(denied.errors).includes("Bulk due second"), false, "partial errors should not leak inaccessible task labels");
}

async function assertBrowserWiring() {
  const tasksJs = await fs.readFile(new URL("../public/js/tasks.js", import.meta.url), "utf8");

  assert.match(tasksJs, /data-task-bulk-due-date/);
  assert.match(tasksJs, /data-task-bulk-clear-due-date/);
  assert.match(tasksJs, /data-task-bulk-due-time/);
  assert.match(tasksJs, /data-task-bulk-clear-due-time/);
  assert.match(tasksJs, /confirmMixedBulkActions/);
  assert.match(tasksJs, /hasMixedTagValues/);
  assert.match(tasksJs, /action: "due_date"/);
  assert.match(tasksJs, /action: "due_time"/);
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
  ${sqlText(`task-bulk-no-role-${userId}@example.test`)},
  'Task Bulk No Role',
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
    username: `task-bulk-no-role-${userId}@example.test`,
    workspace_id: workspaceId,
  });
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
