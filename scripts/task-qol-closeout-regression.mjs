import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";
import { appVersion } from "../src/core/version.js";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-qol-closeout-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-qol-closeout.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-QoL-Closeout-Test-Password-123!";

const { internalEventBus } = await import("../src/core/events/event-bus.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} TasksSession */
/** @typedef {import("../src/types/framework-contracts.js").InternalEvent} InternalEvent */

const { modulesService } = await import("../src/core/modules/modules.service.js");
const { indexTaskRecord } = await import("../src/modules/tasks/search-indexers.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

/** @type {InternalEvent[]} */
const capturedEvents = [];
const unsubscribe = [
  "task.created",
  "task.updated",
  "task.completed",
  "task.archived",
  "task.checklist_item.created",
  "task.relationship.created",
].map((eventName) => internalEventBus.on(eventName, async (event) => {
  capturedEvents.push(event);
}, {
  id: `task-qol-closeout:${eventName}`,
  moduleId: "task-qol-closeout",
}));

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const noRoleSession = await createNoRoleSession(session.workspace_id);

  await assertResumeSafeTaskSurface(session, noRoleSession);
  await assertTasksHelpAndDocsAreCurrent();

  console.log("Task QoL closeout regression passed.");
} finally {
  unsubscribe.forEach((remove) => remove());
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {TasksSession} session @param {TasksSession} noRoleSession */
async function assertResumeSafeTaskSurface(session, noRoleSession) {
  const parent = (await tasksService.create({
    title: "Closeout parent task",
    description: "Detailed private implementation note that should not become the resume summary.",
    next_action: "Review the closeout evidence.",
    resume_note: "Regression setup paused after creating the task.",
    due_date: "2026-06-15",
  }, session)).task;
  const child = (await tasksService.create({
    title: "Closeout blocker child task",
    next_action: "Clear the blocker.",
  }, session)).task;

  await tasksService.addChecklistItem(parent.task_id, { label: "Collect verification evidence" }, session);
  await tasksService.addChildTask(parent.task_id, {
    child_task_id: child.task_id,
    is_blocking: true,
  }, session);

  const read = (await tasksService.read(parent.task_id, session)).task;
  assert.equal(read.status, "blocked");
  assert.equal(read.next_action, "Review the closeout evidence.");
  assert.match(read.blocked_reason, /Blocked by incomplete child task/);
  assert.equal(read.resume_note, "Regression setup paused after creating the task.");
  assert.equal(read.checklistProgress.total_count, 1);
  assert.equal(read.relationshipSummary.incomplete_blocking_child_count, 1);
  assert.equal(read.resumeContext.active_candidate, true);
  assert.equal(read.resumeContext.blocked_reason, read.blocked_reason);
  assert.equal(read.resumeContext.checklist_progress.total_count, 1);
  assert.equal(read.resumeContext.relationship_summary.incomplete_blocking_child_count, 1);

  const summary = await tasksService.summary(session);
  const summarized = summary.assignedToMe.find((item) => item.task_id === parent.task_id);
  assert.ok(summarized, "active assigned task should appear in task summaries");
  assert.equal(summarized.next_action, "Review the closeout evidence.");
  assert.equal(summarized.resumeContext.active_candidate, true);
  assert.equal(summarized.relationshipSummary.incomplete_blocking_child_count, 1);

  const workbench = await tasksService.listWorkbenchItems(session);
  const workItem = workbench.items.find((item) => item.task_id === parent.task_id);
  assert.ok(workItem, "active task should appear in Workbench task items");
  assert.equal(workItem.next_action, "Review the closeout evidence.");
  assert.equal(workItem.resume_context.active_candidate, true);
  assert.equal(workItem.relationship_summary.incomplete_blocking_child_count, 1);

  const tasksModule = modulesService.getModule("tasks");
  assert.ok(tasksModule, "the Tasks module should be registered");
  const taskSearchDeclaration = tasksModule.searchableTypes.find((type) => type.recordType === "task");
  assert.ok(taskSearchDeclaration, "the Tasks module should declare a searchable task record type");
  assert.equal(taskSearchDeclaration.requiredReadPermission, "tasks.view");

  const searchDocument = await indexTaskRecord({
    workspaceId: session.workspace_id,
    recordId: parent.task_id,
  });
  assert.ok(
    searchDocument && !("documents" in searchDocument),
    "indexing a single task record should return that record's search document",
  );
  assert.equal(searchDocument.summary, "Review the closeout evidence.");
  assert.match(searchDocument.body, /Blocked by incomplete child task/);
  assert.match(searchDocument.body, /Collect verification evidence/);

  const taskEvents = capturedEvents.filter((event) => event.record_id === parent.task_id || event.metadata?.task_id === parent.task_id);
  assert.ok(taskEvents.some((event) => event.name === "task.created"), "task create event should be emitted");
  assert.ok(taskEvents.some((event) => event.name === "task.updated"), "parent block update event should be emitted");
  assert.ok(taskEvents.some((event) => event.name === "task.checklist_item.created"), "checklist progress event should be emitted");
  assert.ok(capturedEvents.some((event) =>
    event.name === "task.relationship.created" &&
    event.metadata?.parent_task_id === parent.task_id &&
    eventRecord(event.metadata?.relationship_summary)?.incomplete_blocking_child_count === 1,
  ), "relationship event should include parent blocking summary metadata");

  const updateEvent = taskEvents.find((event) => event.name === "task.updated" && event.metadata?.resume_context);
  assert.ok(updateEvent, "task update event should include resume-safe metadata");
  const updateMetadata = requireEventRecord(updateEvent.metadata, "task update event metadata");
  const resumeContext = requireEventRecord(updateMetadata.resume_context, "task update resume context");
  const checklistProgress = requireEventRecord(updateMetadata.checklist_progress, "task update checklist progress");
  const relationshipSummary = requireEventRecord(updateMetadata.relationship_summary, "task update relationship summary");
  assert.equal(updateMetadata.next_action, "Review the closeout evidence.");
  assert.equal(resumeContext.active_candidate, true);
  assert.equal(checklistProgress.total_count, 1);
  assert.equal(relationshipSummary.incomplete_blocking_child_count, 1);

  await assert.rejects(
    () => tasksService.read(parent.task_id, noRoleSession),
    /permission/i,
    "users without task read access must not receive resume-safe task context",
  );
  const restrictedSummary = await tasksService.summary(noRoleSession);
  assert.equal(restrictedSummary.counts.active, 0);
  const restrictedWorkbench = await tasksService.listWorkbenchItems(noRoleSession);
  assert.equal(restrictedWorkbench.items.length, 0);

  const completed = (await tasksService.complete(child.task_id, session)).task;
  assert.equal(completed.resumeContext.active_candidate, false);
  const archived = (await tasksService.archive(completed.task_id, session)).task;
  assert.equal(archived.resumeContext.active_candidate, false);
}

async function assertTasksHelpAndDocsAreCurrent() {
  const tasksModule = modulesService.getModule("tasks");
  assert.ok(tasksModule, "the Tasks module should be registered");
  assert.equal(tasksModule.version, appVersion);
  assert.ok(tasksModule.help?.articles?.some((article) => article.id === "tasks.resume-context"));
  const docs = await fs.readFile(new URL("../docs/tasks-module.md", import.meta.url), "utf8");
  assert.match(docs, /resume-safe context/i);
  assert.match(docs, /global resume-state service/i);
  assert.match(docs, /Tasks do not expose a task delete workflow/i);
  assert.match(docs, /bulk status\/priority\/assignee\/due date\/due time\/tag updates/i);
  assert.match(docs, /heading bell follows or unfollows/i);
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
  ${sqlText(`task-qol-closeout-${userId}@example.test`)},
  'Task QoL Closeout No Role',
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
    home_workspace_id: workspaceId,
    ip_address: "127.0.0.1",
    timezone: "America/New_York",
    user_id: userId,
    username: `task-qol-closeout-${userId}@example.test`,
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

/**
 * Prove one published event-metadata value really is an object before the
 * owner names a field on it. `InternalEvent.metadata` is an open record, so a
 * nested read is otherwise unchecked.
 * @param {unknown} value
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function requireEventRecord(value, label) {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} should be an object`,
  );
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * Non-asserting variant for the boolean predicates inside `Array#some`, where
 * a non-object metadata value should fail the candidate rather than the run.
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
function eventRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : null;
}
