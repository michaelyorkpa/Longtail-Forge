import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} TasksSession */

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-recurrence-checklist-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-recurrence-checklist.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Recurrence-Checklist-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
const { activateModuleRuntime } = await import("../src/core/modules/module-runtime.js");
const { registerSearchIndexJobHandlers } = await import("../src/services/search-index-jobs.service.js");
const { registerTaskJobHandlers } = await import("../src/modules/tasks/task-jobs.service.js");
const { taskRecurrenceRepository } = await import("../src/modules/tasks/task-recurrence.repo.js");
const { tasksRepository } = await import("../src/modules/tasks/tasks.repo.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  await initializeDatabase();
  activateModuleRuntime("worker");
  registerSearchIndexJobHandlers({ replace: true });
  registerTaskJobHandlers({ replace: true });
  const session = await readSeedSession();

  await assertRecurringChecklistPropagation(session);

  console.log("Task recurrence checklist propagation regression passed.");
} finally {
  await stopJobWorker().catch(() => {});
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/** @param {TasksSession} session */
async function assertRecurringChecklistPropagation(session) {
  const source = (await tasksService.create({
    title: "Recurring checklist source",
    due_date: "2026-06-25",
    recurrence: {
      enabled: true,
      frequency: "WEEKLY",
      interval: 1,
      endDate: "2026-08-31",
    },
  }, session)).task;
  const templateId = source.recurrence_template_id;

  await tasksService.addChecklistItem(source.task_id, { label: "Check SDC Email" }, session);
  await tasksService.addChecklistItem(source.task_id, { label: "Import using blue dot" }, session);
  await tasksService.addChecklistItem(source.task_id, { label: "Add new items to eBay" }, session);
  const sourceWithChecklist = (await tasksService.read(source.task_id, session)).task;
  for (const item of sourceWithChecklist.checklistItems) {
    await tasksService.checkChecklistItem(source.task_id, item.task_checklist_item_id, session);
  }

  const past = await createSeriesOccurrence(session, templateId, "2026-06-18", "Past recurring occurrence");
  await tasksService.addChecklistItem(past.task_id, { label: "Past checklist item" }, session);

  const future = await createSeriesOccurrence(session, templateId, "2026-07-09", "Future recurring occurrence");
  const matchedFutureItem = await tasksService.addChecklistItem(future.task_id, { label: "Check SDC Email" }, session);
  await tasksService.checkChecklistItem(future.task_id, matchedFutureItem.item.task_checklist_item_id, session);
  await tasksService.addChecklistItem(future.task_id, { label: "Legacy future-only item" }, session);

  const completedFuture = await createSeriesOccurrence(session, templateId, "2026-07-16", "Completed future occurrence", "complete");
  await tasksService.addChecklistItem(completedFuture.task_id, { label: "Completed checklist item" }, session);

  const archivedFuture = await createSeriesOccurrence(session, templateId, "2026-07-23", "Archived future occurrence", "archived");
  await tasksService.addChecklistItem(archivedFuture.task_id, { label: "Archived checklist item" }, session);

  await tasksService.update(source.task_id, {
    title: source.title,
    recurrence: {
      enabled: true,
      frequency: "WEEKLY",
      interval: 1,
      endDate: "2026-08-31",
      applyTo: "future",
    },
  }, session);

  const templateChecklist = await taskRecurrenceRepository.readTemplateChecklist(session.workspace_id, templateId);
  assert.deepEqual(
    templateChecklist.map((item) => item.label),
    ["Check SDC Email", "Import using blue dot", "Add new items to eBay"],
    "All Future should save the edited occurrence checklist structure to the recurrence template",
  );

  const propagatedFuture = (await tasksService.read(future.task_id, session)).task;
  assert.deepEqual(
    propagatedFuture.checklistItems.map((item) => item.label),
    ["Check SDC Email", "Import using blue dot", "Add new items to eBay"],
    "Eligible existing future occurrences should receive the recurrence checklist structure",
  );
  assert.equal(
    propagatedFuture.checklistItems.find((item) => item.label === "Check SDC Email")?.is_checked,
    true,
    "Matching future checklist progress should be preserved",
  );
  assert.equal(
    propagatedFuture.checklistItems.find((item) => item.label === "Import using blue dot")?.is_checked,
    false,
    "Newly propagated future checklist rows should start unchecked",
  );

  const workbench = await tasksService.listWorkbenchItems(session, { task_view: "all" });
  const workbenchFuture = workbench.items.find((item) => item.task_id === future.task_id);
  assert.equal(workbenchFuture?.checklist_progress.total_count, 3, "Task Focus candidates should carry propagated checklist progress");

  const unchangedPast = (await tasksService.read(past.task_id, session)).task;
  assert.deepEqual(unchangedPast.checklistItems.map((item) => item.label), ["Past checklist item"]);

  const unchangedCompleted = (await tasksService.read(completedFuture.task_id, session)).task;
  assert.deepEqual(unchangedCompleted.checklistItems.map((item) => item.label), ["Completed checklist item"]);

  const unchangedArchived = (await tasksService.read(archivedFuture.task_id, session)).task;
  assert.deepEqual(unchangedArchived.checklistItems.map((item) => item.label), ["Archived checklist item"]);

  await tasksService.complete(source.task_id, session);
  await runJobWorkerOnce({
    claimLimit: 20,
    mode: "inline",
    workerId: "task-recurrence-checklist-propagation-regression",
  });

  const generated = await tasksRepository.readByRecurrenceInstance(session.workspace_id, templateId, "2026-07-02");
  assert.ok(generated?.task_id, "recurrence worker should create the next instance after completion");
  const generatedRead = (await tasksService.read(generated.task_id, session)).task;
  assert.deepEqual(
    generatedRead.checklistItems.map((item) => item.label),
    ["Check SDC Email", "Import using blue dot", "Add new items to eBay"],
    "Newly generated recurrence instances should inherit the template checklist structure",
  );
  assert.deepEqual(
    generatedRead.checklistItems.map((item) => item.is_checked),
    [false, false, false],
    "Newly generated recurrence checklist rows should start unchecked",
  );
}

/** @param {TasksSession} session @param {string} templateId @param {string} instanceDate @param {string} title @param {string} [status] */
async function createSeriesOccurrence(session, templateId, instanceDate, title, status = "open") {
  return (await tasksService.create({
    title,
    due_date: instanceDate,
    recurrence_template_id: templateId,
    recurrence_instance_date: instanceDate,
    source_type: "recurrence",
    source_id: templateId,
    status,
  }, session)).task;
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
