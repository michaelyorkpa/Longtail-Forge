import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} RelatedContextSession */
/** The fixture records this owner keeps and reads back. */
/** @typedef {Awaited<ReturnType<typeof createRelatedContextFixtures>>} RelatedContextFixtures */

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-workbench-related-context-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-workbench-related-context.db");
process.env.LONGTAIL_FILE_SCANNER = "none";
process.env.LONGTAIL_LOCAL_STORAGE_ROOT = path.join(tempDir, "files");
process.env.SUPER_ADMIN_PASSWORD = "Workbench-Related-Context-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { filesService } = await import("../src/services/files.service.js");
const { listsService } = await import("../src/modules/lists/lists.service.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { tagsService } = await import("../src/services/tags.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { workbenchTaskFocusRelatedContextService } = await import("../src/services/workbench-task-focus-related-context.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createRelatedContextFixtures(session);

  await assertRelatedContextReadModel(session, fixtures);
  await assertStaticContracts();
  await assertIntegrity();

  console.log("Workbench Task Focus related-context regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {RelatedContextSession} session @param {RelatedContextFixtures} fixtures */
async function assertRelatedContextReadModel(session, fixtures) {
  const result = await workbenchTaskFocusRelatedContextService.readTaskFocusRelatedContext(
    session,
    fixtures.selectedTask.task_id,
  );
  const allItems = result.items;
  const groupCounts = Object.fromEntries(result.groups.map((group) => [group.id, group.count]));
  const reasonByTitle = new Map(allItems.map((item) => [item.title, item.reason]));

  assert.equal(result.task.taskId, fixtures.selectedTask.task_id);
  assert.equal(result.task.title, "Focused related context task");
  assert.deepEqual(result.groups.map((group) => group.id), [
    "linked-notes",
    "task-files",
    "linked-lists",
    "same-project-tasks",
    "shared-direct-tags",
  ]);
  assert.deepEqual(allItems.map((item) => item.reason), [
    "linked_note",
    "task_file",
    "linked_list",
    "same_project_task",
    "same_project_task",
    "same_project_task",
    "same_project_task",
    "same_project_task",
    "same_project_task",
    "shared_direct_tag",
    "shared_direct_tag",
    "shared_direct_tag",
  ]);
  assert.equal(groupCounts["linked-notes"], 1);
  assert.equal(groupCounts["task-files"], 1);
  assert.equal(groupCounts["linked-lists"], 1);
  assert.equal(groupCounts["same-project-tasks"], 7);
  assert.equal(groupCounts["shared-direct-tags"], 3);
  const sameProjectGroup = result.groups.find((group) => group.id === "same-project-tasks");
  assert.deepEqual(
    (sameProjectGroup?.items || []).map((item) => item.title),
    [
      "Due today same project task",
      "Overdue yesterday same project task",
      "Tomorrow newer same project task",
      "Tomorrow older same project task",
      "Same project shared task",
      "Child project related task",
    ],
    "same-project tasks should include child-project work and prioritize overdue/today, then nearest future due dates before the six-item display cap",
  );
  assert.equal(reasonByTitle.get("Linked context note"), "linked_note", "linked notes should outrank shared direct tags");
  assert.equal(reasonByTitle.get("Linked procurement list"), "linked_list", "linked lists should outrank shared direct tags");
  assert.equal(reasonByTitle.get("Same project shared task"), "same_project_task", "same-project tasks should outrank shared direct tags");
  assert.equal(reasonByTitle.get("Completed same project task"), undefined, "completed same-project tasks should not leak into related context");
  assert.equal(reasonByTitle.get("Archived same project task"), undefined, "archived same-project tasks should not leak into related context");
  assert.equal(reasonByTitle.get("Other project shared task"), "shared_direct_tag");
  assert.equal(reasonByTitle.get("Shared direct tag note"), "shared_direct_tag");
  assert.equal(reasonByTitle.get("Shared direct tag list"), "shared_direct_tag");
  assert.equal(allItems.some((item) => item.title === "Propagated-only note"), false, "propagated/effective tags must not create shared-tag related context");
  assert.equal(new Set(allItems.map((item) => item.id)).size, allItems.length, "records matched by multiple reasons should be deduplicated");
  assert.equal(result.meta.fileSharedTagSource, "files-not-taggable", "Files shared-tag context should not be invented while Files has no taggable target");

  for (const item of allItems) {
    assert.ok(item.moduleId, "related item should include module ID");
    assert.ok(item.sourceLabel, "related item should include a source label");
    assert.ok(item.recordType, "related item should include record type");
    assert.ok(item.recordId, "related item should include record ID");
    assert.ok(item.title, "related item should include a safe title");
    assert.ok(item.contextLabel, "related item should include context label");
    assert.equal(item.action?.type, "module-action", "related item should use a module-action descriptor");
    assert.match(
      item.action.moduleActionId,
      /^(tasks\.edit|notes\.view|lists\.edit|files\.preview)$/,
      "related item action should be an existing registered module action",
    );
    assert.ok(item.action.fallbackUrl, "related item action should include an explicit safe fallback URL");
  }

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /body_markdown|body_plaintext_index|body_html|secure_payload|encrypted_data_key|storage_key|sha256_hash|protected_path/i);
  assert.doesNotMatch(serialized, new RegExp(fixtures.propagatedOnlyNote.note_id), "direct-tag decoys should not leak by ID");
}

async function assertStaticContracts() {
  const serviceSource = readText("src/services/workbench-task-focus-related-context.service.js");
  const genericWorkbenchSource = readText("src/services/workbench.service.js");

        assert.doesNotMatch(genericWorkbenchSource, /tasksService|notesService|listsService|filesService|tagsService/, "generic Workbench bootstrap service should remain de-hardcoded");
  assert.doesNotMatch(serviceSource, /workCandidateService|listFocusCandidates|focusCandidates|workCandidates/, "related-context service must not use focus-mode candidate overflow");
  assert.match(serviceSource, /tagsService\.listAssignments[\s\S]*targetType: "task"/, "selected task direct tags should come from the Tags service");
  assert.match(serviceSource, /Array\.isArray\(record\.directTags\)[\s\S]*Array\.isArray\(record\.direct_tags\)/, "shared-tag matching should inspect direct tags only");
  assert.match(serviceSource, /reason: "linked_note"[\s\S]*reason: "task_file"[\s\S]*reason: "linked_list"[\s\S]*reason: "same_project_task"[\s\S]*reason: "shared_direct_tag"/, "service should encode the roadmap ordering");
  assert.match(serviceSource, /compareSameProjectTaskItems[\s\S]*sameProjectDueBucket[\s\S]*compareSameProjectDueAt/, "same-project task ordering should bucket by due-date usefulness before comparing due-date proximity");
  assert.match(serviceSource, /compareSameProjectDueAt[\s\S]*bucket === 0[\s\S]*right\.dueAtUtc[\s\S]*left\.dueAtUtc/, "overdue and due-today same-project tasks should be sorted by closest-to-now overdue/due timestamp first");
  assert.match(serviceSource, /compareSameProjectDueAt[\s\S]*bucket === 1[\s\S]*left\.dueAtUtc[\s\S]*right\.dueAtUtc/, "future same-project tasks should be sorted from nearest due date to farthest");
  assert.match(serviceSource, /priorityRank\(right\.priority\) - priorityRank\(left\.priority\)/, "same-project task ordering should use priority as a deterministic tie-breaker");
  assert.match(serviceSource, /statusRank\(left\.status\) - statusRank\(right\.status\)/, "same-project task ordering should use status as a deterministic tie-breaker");
  assert.match(serviceSource, /String\(right\.updatedAt \|\| ""\)\.localeCompare\(String\(left\.updatedAt \|\| ""\)\)/, "same-project task ordering should use updated_at as a deterministic tie-breaker");
  assert.match(
    serviceSource,
    /tasksService\.list\(session, \{[\s\S]*projectId: task\.project_id,[\s\S]*status: "active"/,
    "same-project task reads should stay on the Tasks service active-task contract so completed, archived, permission-filtered, and disabled-module tasks remain pruned by owning behavior",
  );
  assert.match(serviceSource, /files-not-taggable/, "service should document the current Files shared-tag boundary");
}

/** @param {RelatedContextSession} session */
async function createRelatedContextFixtures(session) {
  const today = localDateKey(new Date(), session.timezone);
  const yesterday = addDaysKey(today, -1);
  const tomorrow = addDaysKey(today, 1);
  const inTwoDays = addDaysKey(today, 2);
  const client = (await clientsService.createClient({ name: "Related Context Client" }, session)).client;
  const project = (await clientsService.createProject(client.id, { name: "Related Context Project" }, session)).project;
  const otherProject = (await clientsService.createProject(client.id, { name: "Related Context Other Project" }, session)).project;
  const childProject = (await clientsService.createProject(client.id, {
    name: "Related Context Child Project",
    parent_project_id: project.id,
  }, session)).project;
  const selectedTask = (await tasksService.create({
    title: "Focused related context task",
    project_id: project.id,
    assignee_ids: [session.user_id],
  }, session)).task;
  const tag = (await tagsService.create(session, { name: "Focus Shared" })).tag;

  await tagsService.assign(session, { tagId: tag.tag_id, targetId: selectedTask.task_id, targetType: "task" });

  const linkedNote = (await notesService.create({
    body_markdown: "This linked note body must not appear in related context.",
    client_id: client.id,
    project_id: project.id,
    task_id: selectedTask.task_id,
    title: "Linked context note",
  }, session)).note;
  await tagsService.assign(session, { tagId: tag.tag_id, targetId: linkedNote.note_id, targetType: "note" });

  await filesService.uploadAndAttach(session, {
    contentBase64: Buffer.from("Task file body must not appear.").toString("base64"),
    displayName: "Related context task file",
    moduleId: "tasks",
    originalFilename: "related-context-task-file.txt",
    targetId: selectedTask.task_id,
    targetType: "task",
    visibility: "workspace",
  });

  const linkedList = (await listsService.create({
    list_type: "procurement",
    project_id: project.id,
    title: "Linked procurement list",
  }, session)).list;
  await listsService.createLink(linkedList.list_id, {
    targetId: selectedTask.task_id,
    targetType: "task",
  }, session);
  await tagsService.assign(session, { tagId: tag.tag_id, targetId: linkedList.list_id, targetType: "list" });

  const _dueTodayTask = (await tasksService.create({
    title: "Due today same project task",
    due_date: today,
    project_id: project.id,
  }, session)).task;

  const _overdueTask = (await tasksService.create({
    title: "Overdue yesterday same project task",
    due_date: yesterday,
    project_id: project.id,
  }, session)).task;

  const tomorrowOlderTask = (await tasksService.create({
    title: "Tomorrow older same project task",
    due_date: tomorrow,
    project_id: project.id,
  }, session)).task;

  const tomorrowNewerTask = (await tasksService.create({
    title: "Tomorrow newer same project task",
    due_date: tomorrow,
    project_id: project.id,
  }, session)).task;

  const sameProjectTask = (await tasksService.create({
    title: "Same project shared task",
    due_date: inTwoDays,
    project_id: project.id,
  }, session)).task;
  await tagsService.assign(session, { tagId: tag.tag_id, targetId: sameProjectTask.task_id, targetType: "task" });

  const _childProjectTask = (await tasksService.create({
    title: "Child project related task",
    due_date: addDaysKey(today, 3),
    project_id: childProject.id,
  }, session)).task;

  const _noDueTask = (await tasksService.create({
    title: "No due same project task",
    project_id: project.id,
  }, session)).task;

  const completedSameProjectTask = (await tasksService.create({
    title: "Completed same project task",
    due_date: tomorrow,
    project_id: project.id,
  }, session)).task;
  await tasksService.complete(completedSameProjectTask.task_id, session);

  const archivedSameProjectTask = (await tasksService.create({
    title: "Archived same project task",
    due_date: inTwoDays,
    project_id: project.id,
  }, session)).task;
  await tasksService.update(archivedSameProjectTask.task_id, { status: "archived" }, session);

  await setTaskUpdatedAt(tomorrowOlderTask.task_id, `${tomorrow}T08:00:00.000Z`);
  await setTaskUpdatedAt(tomorrowNewerTask.task_id, `${tomorrow}T09:00:00.000Z`);

  const otherProjectTask = (await tasksService.create({
    title: "Other project shared task",
    project_id: otherProject.id,
  }, session)).task;
  await tagsService.assign(session, { tagId: tag.tag_id, targetId: otherProjectTask.task_id, targetType: "task" });

  const sharedNote = (await notesService.create({
    body_markdown: "Shared note body must not appear.",
    client_id: client.id,
    project_id: otherProject.id,
    title: "Shared direct tag note",
  }, session)).note;
  await tagsService.assign(session, { tagId: tag.tag_id, targetId: sharedNote.note_id, targetType: "note" });

  const sharedList = (await listsService.create({
    list_type: "shopping",
    project_id: otherProject.id,
    title: "Shared direct tag list",
  }, session)).list;
  await tagsService.assign(session, { tagId: tag.tag_id, targetId: sharedList.list_id, targetType: "list" });

  const propagatedOnlyNote = (await notesService.create({
    body_markdown: "Propagated-only note body must not appear.",
    client_id: client.id,
    project_id: otherProject.id,
    title: "Propagated-only note",
  }, session)).note;
  await insertPropagatedAssignment(session, tag.tag_id, "note", propagatedOnlyNote.note_id, selectedTask.task_id);

  return {
    propagatedOnlyNote,
    selectedTask,
  };
}

/** @param {RelatedContextSession} session @param {string} tagId @param {string} targetType @param {string} targetId @param {string} sourceTaskId */
async function insertPropagatedAssignment(session, tagId, targetType, targetId, sourceTaskId) {
  const now = new Date().toISOString();
  await runSql(`
INSERT INTO tag_assignments (
  tag_assignment_id,
  workspace_id,
  tag_id,
  target_type,
  target_id,
  created_by_user_id,
  source,
  source_assignment_id,
  source_target_type,
  source_target_id,
  propagation_rule_id,
  created_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(session.workspace_id)},
  ${sqlText(tagId)},
  ${sqlText(targetType)},
  ${sqlText(targetId)},
  ${sqlText(session.user_id)},
  'propagated',
  ${sqlText(randomUUID())},
  'task',
  ${sqlText(sourceTaskId)},
  'workbench-related-context-test',
  ${sqlText(now)}
);
`);
}

/** @param {string} taskId @param {string} updatedAt */
async function setTaskUpdatedAt(taskId, updatedAt) {
  await runSql(`
UPDATE tasks
SET updated_at = ${sqlText(updatedAt)}
WHERE task_id = ${sqlText(taskId)};
`);
}

async function assertIntegrity() {
  const result = await querySql("PRAGMA integrity_check;");
  assert.equal(result[0]?.integrity_check, "ok");
}

/** @returns {Promise<RelatedContextSession>} */
async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "fresh database should seed a protected super admin");

  return workspaceSessionFixture({
    ...user,
    username: user.username || `workbench-related-context-${randomUUID()}@example.test`,
  });
}

/** @param {Date} date @param {string} [timezone] @returns {string} */
function localDateKey(date, timezone = "America/New_York") {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** @param {string} dateKey @param {number} days @returns {string} */
function addDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
