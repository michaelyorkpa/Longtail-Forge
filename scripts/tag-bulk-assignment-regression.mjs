import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-tag-bulk-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-tag-bulk.db");
process.env.SUPER_ADMIN_PASSWORD = "Tag-Bulk-Test-123!";

const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { tagsService } = await import("../src/services/tags.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const session = await readSession();
  const fixtures = await seedFixtures(session);

  await assertTagFilterSemantics(session, fixtures);
  await assertBulkAssignmentContract(session, fixtures);
  await assertTasksBulkConsumer(session, fixtures);
  await assertBrowserWiring();
  await assertIntegrity();

  console.log("Tag bulk assignment regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function seedFixtures(session) {
  const directTag = (await tagsService.create(session, { name: "Bulk Direct" })).tag;
  const replacementTag = (await tagsService.create(session, { name: "Bulk Replacement" })).tag;
  const propagatedTag = (await tagsService.create(session, { name: "Bulk Propagated" })).tag;
  const systemTag = (await tagsService.create(session, { name: "Bulk System" })).tag;
  const taskA = (await tasksService.create({ title: "Bulk Tag Task A" }, session)).task;
  const taskB = (await tasksService.create({ title: "Bulk Tag Task B" }, session)).task;
  const taskC = (await tasksService.create({ title: "Bulk Tag Task C" }, session)).task;

  await tagsService.addPropagatedAssignment(session, {
    propagationRuleId: "tag-bulk-regression",
    sourceTargetId: "source-record",
    sourceTargetType: "project",
    tagId: propagatedTag.tag_id,
    targetId: taskA.task_id,
    targetType: "task",
  });
  await runSql(`
INSERT INTO tag_assignments (
  tag_assignment_id,
  workspace_id,
  tag_id,
  target_type,
  target_id,
  source,
  created_by_user_id,
  created_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(session.workspace_id)},
  ${sqlText(systemTag.tag_id)},
  'task',
  ${sqlText(taskA.task_id)},
  'system',
  ${sqlText(session.user_id)},
  ${sqlText(new Date().toISOString())}
);
`);

  return {
    directTag,
    propagatedTag,
    replacementTag,
    systemTag,
    taskA,
    taskB,
    taskC,
  };
}

async function assertTagFilterSemantics(session, fixtures) {
  assert.deepEqual(tagsService.normalizeTagFilterIntent("__no_tags__"), {
    noTagsMode: "effective",
    tagIds: [],
  });
  assert.deepEqual(tagsService.normalizeTagFilterIntent("__no_direct_tags__"), {
    noTagsMode: "direct",
    tagIds: [],
  });
  assert.deepEqual(tagsService.normalizeTagFilterIntent([fixtures.directTag.tag_id]), {
    noTagsMode: "",
    tagIds: [fixtures.directTag.tag_id],
  });

  const tasks = [fixtures.taskA, fixtures.taskB, fixtures.taskC];
  const noEffectiveTags = await tagsService.filterRecordsByTags(session, "task", tasks, "__no_tags__");
  assert.deepEqual(
    noEffectiveTags.map((task) => task.task_id).sort(),
    [fixtures.taskB.task_id, fixtures.taskC.task_id].sort(),
    "simple No Tags should mean no effective tags",
  );

  const noDirectTags = await tagsService.filterRecordsByTags(session, "task", tasks, "__no_direct_tags__");
  assert.deepEqual(
    noDirectTags.map((task) => task.task_id).sort(),
    [fixtures.taskA.task_id, fixtures.taskB.task_id, fixtures.taskC.task_id].sort(),
    "reserved direct-only No Tags should remain available without changing simple No Tags semantics",
  );
}

async function assertBulkAssignmentContract(session, fixtures) {
  const added = await tagsService.bulkAssign(session, {
    action: "add",
    tagIds: [fixtures.directTag.tag_id],
    targetIds: [fixtures.taskA.task_id, fixtures.taskB.task_id],
    targetType: "task",
  });
  assert.equal(added.changed_count, 2);
  assert.equal(added.skipped_count, 0);

  const replaced = await tagsService.bulkAssign(session, {
    action: "replace",
    tagIds: [fixtures.replacementTag.tag_id],
    targetIds: [fixtures.taskA.task_id],
    targetType: "task",
  });
  assert.equal(replaced.changed_count, 1);
  const afterReplace = await tagsService.listAssignments(session, {
    targetId: fixtures.taskA.task_id,
    targetType: "task",
  });
  assert.deepEqual(afterReplace.directTags.map((tag) => tag.tag_id), [fixtures.replacementTag.tag_id]);
  assert.ok(afterReplace.propagatedTags.some((tag) => tag.tag_id === fixtures.propagatedTag.tag_id));
  assert.ok(afterReplace.effectiveTags.some((tag) => tag.tag_id === fixtures.systemTag.tag_id));

  const removed = await tagsService.bulkAssign(session, {
    action: "remove",
    tagIds: [fixtures.replacementTag.tag_id, fixtures.propagatedTag.tag_id, fixtures.systemTag.tag_id],
    targetIds: [fixtures.taskA.task_id],
    targetType: "task",
  });
  assert.equal(removed.changed_count, 1);
  const afterRemove = await tagsService.listAssignments(session, {
    targetId: fixtures.taskA.task_id,
    targetType: "task",
  });
  assert.deepEqual(afterRemove.directTags, []);
  assert.ok(afterRemove.propagatedTags.some((tag) => tag.tag_id === fixtures.propagatedTag.tag_id));
  assert.ok(afterRemove.effectiveTags.some((tag) => tag.tag_id === fixtures.systemTag.tag_id));

  const noRoleSession = {
    ...session,
    user_id: "tag-bulk-no-role-user",
    username: "tag-bulk-no-role-user@example.test",
  };
  const partial = await tagsService.bulkAssign(noRoleSession, {
    action: "add",
    tagIds: [fixtures.directTag.tag_id],
    targetIds: [fixtures.taskC.task_id],
    targetType: "task",
  });
  assert.equal(partial.changed_count, 0);
  assert.equal(partial.skipped_count, 1);
  assert.equal(partial.errors[0].target_id, fixtures.taskC.task_id);
  assert.equal(JSON.stringify(partial.errors).includes("Bulk Tag Task C"), false);
}

async function assertTasksBulkConsumer(session, fixtures) {
  const result = await tasksService.bulkUpdate({
    action: "tag_add",
    tagIds: [fixtures.directTag.tag_id],
    task_ids: [fixtures.taskC.task_id],
  }, session);

  assert.equal(result.errors.length, 0);
  assert.equal(result.tasks.length, 1);
  assert.ok(result.tasks[0].tags.some((tag) => tag.tag_id === fixtures.directTag.tag_id));
}

async function assertBrowserWiring() {
  const tasksHtml = await fs.readFile(path.join(process.cwd(), "views/protected/tasks.html"), "utf8");
  const tasksJs = await fs.readFile(path.join(process.cwd(), "public/js/tasks.js"), "utf8");

  assert.match(tasksHtml, /data-task-bulk-tag-action/);
  assert.match(tasksHtml, /data-task-bulk-tags/);
  assert.match(tasksHtml, /value="tag_add"/);
  assert.match(tasksHtml, /value="tag_remove"/);
  assert.match(tasksHtml, /value="tag_replace"/);
  assert.match(tasksJs, /bulkTagActionInput/);
  assert.match(tasksJs, /selectedBulkTagIds/);
}

async function readSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, workspaces.workspace_id
FROM users
CROSS JOIN workspaces
WHERE users.protected_user = 'yes'
ORDER BY users.user_id, workspaces.workspace_id
LIMIT 1;
`);

  return {
    timezone: "America/New_York",
    user_id: rows[0].user_id,
    username: rows[0].username,
    workspace_id: rows[0].workspace_id,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
