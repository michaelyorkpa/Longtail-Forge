import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-recurrence-linked-notes-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-recurrence-linked-notes.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Recurrence-Linked-Notes-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");
const { runJobWorkerOnce, stopJobWorker } = await import("../src/core/jobs/index.js");
const { activateModuleRuntime } = await import("../src/core/modules/module-runtime.js");
const { registerSearchIndexJobHandlers } = await import("../src/services/search-index-jobs.service.js");
const { registerTaskJobHandlers } = await import("../src/modules/tasks/task-jobs.service.js");
const { notesRepository } = await import("../src/modules/notes/notes.repo.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { taskRecurrenceRepository } = await import("../src/modules/tasks/task-recurrence.repo.js");
const { tasksRepository } = await import("../src/modules/tasks/tasks.repo.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { workbenchTaskFocusRelatedContextService } = await import("../src/services/workbench-task-focus-related-context.service.js");

try {
  await initializeDatabase();
  activateModuleRuntime("worker");
  registerSearchIndexJobHandlers({ replace: true });
  registerTaskJobHandlers({ replace: true });
  const session = await readSeedSession();

  await assertRecurringLinkedNotePropagation(session);
  await assertRecurringLinkedNoteRemoval(session);

  console.log("Task recurrence linked-note propagation regression passed.");
} finally {
  await stopJobWorker().catch(() => {});
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertRecurringLinkedNotePropagation(session) {
  const source = (await createRecurringTask(session, "Recurring linked-note source")).task;
  const templateId = source.recurrence_template_id;
  const note = await createLinkedNote(session, source.task_id, "Shipping Rates and Marketplace Connect Rules");

  const past = await createSeriesOccurrence(session, templateId, "2026-06-18", "Past linked-note occurrence");
  const future = await createSeriesOccurrence(session, templateId, "2026-07-09", "Future linked-note occurrence");
  const completedFuture = await createSeriesOccurrence(session, templateId, "2026-07-16", "Completed linked-note occurrence", "complete");
  const archivedFuture = await createSeriesOccurrence(session, templateId, "2026-07-23", "Archived linked-note occurrence", "archived");

  await saveAllFuture(session, source);

  const templateLinks = await taskRecurrenceRepository.readTemplateNoteLinks(session.workspace_id, templateId);
  assert.deepEqual(
    templateLinks.map((link) => link.note_id),
    [note.note_id],
    "All Future should save source task linked-note structure to the recurrence template",
  );

  assert.deepEqual(await linkedNoteTitlesForTask(session, future.task_id), [note.title], "Eligible future occurrences should receive propagated linked notes");
  assert.deepEqual(await linkedNoteTitlesForTask(session, past.task_id), [], "Past occurrences should not receive propagated linked notes");
  assert.deepEqual(await linkedNoteTitlesForTask(session, completedFuture.task_id), [], "Completed future occurrences should not receive propagated linked notes");
  assert.deepEqual(await linkedNoteTitlesForTask(session, archivedFuture.task_id), [], "Archived future occurrences should not receive propagated linked notes");

  const relatedContext = await workbenchTaskFocusRelatedContextService.readTaskFocusRelatedContext(session, future.task_id);
  const linkedNotesGroup = relatedContext.groups.find((group) => group.id === "linked-notes");
  assert.equal(linkedNotesGroup?.items[0]?.title, note.title, "Task Focus Inspector should show the propagated linked note");
  assert.equal(linkedNotesGroup?.items[0]?.action?.moduleActionId, "notes.view", "Task Focus propagated linked notes should keep the Notes view action");

  await tasksService.complete(source.task_id, session);
  await runJobWorkerOnce({
    claimLimit: 20,
    mode: "inline",
    workerId: "task-recurrence-linked-note-propagation-regression",
  });

  const generated = await tasksRepository.readByRecurrenceInstance(session.workspace_id, templateId, "2026-07-02");
  assert.ok(generated?.task_id, "recurrence worker should create the next linked-note instance after completion");
  assert.deepEqual(await linkedNoteTitlesForTask(session, generated.task_id), [note.title], "Newly generated recurrence instances should inherit template linked notes");
}

async function assertRecurringLinkedNoteRemoval(session) {
  const source = (await createRecurringTask(session, "Recurring linked-note removal source")).task;
  const templateId = source.recurrence_template_id;
  const note = await createLinkedNote(session, source.task_id, "Reusable marketplace note");
  const future = await createSeriesOccurrence(session, templateId, "2026-07-09", "Future linked-note removal occurrence");

  await saveAllFuture(session, source);
  assert.deepEqual(await linkedNoteTitlesForTask(session, future.task_id), [note.title], "Removal fixture should start with a propagated linked note");

  const sourceLinks = await notesRepository.listLinksForTarget(session.workspace_id, taskTarget(source.task_id));
  const sourceLink = sourceLinks.find((link) => link.note_id === note.note_id);
  assert.ok(sourceLink?.note_link_id, "source task should have the linked note row to remove");
  await notesService.removeLink(note.note_id, sourceLink.note_link_id, session);

  await saveAllFuture(session, source);

  const templateLinks = await taskRecurrenceRepository.readTemplateNoteLinks(session.workspace_id, templateId);
  assert.deepEqual(templateLinks, [], "Removing the linked note then saving All Future should clear the recurrence template note-link structure");
  assert.deepEqual(await linkedNoteTitlesForTask(session, future.task_id), [], "Removing a linked note with All Future should remove propagated links from eligible future occurrences");
  assert.ok((await notesService.read(note.note_id, session)).note.note_id, "Removing a propagated task link should not delete the note record");
}

async function createRecurringTask(session, title) {
  return tasksService.create({
    due_date: "2026-06-25",
    recurrence: {
      enabled: true,
      frequency: "WEEKLY",
      interval: 1,
      endDate: "2026-08-31",
    },
    title,
  }, session);
}

async function createLinkedNote(session, taskId, title) {
  const note = (await notesService.create({
    body_markdown: `## ${title}\n\nKeep this reference attached to recurring work.`,
    note_type: "reference",
    title,
  }, session)).note;

  await notesService.createLink(note.note_id, taskTarget(taskId), session);
  return note;
}

async function createSeriesOccurrence(session, templateId, instanceDate, title, status = "open") {
  return (await tasksService.create({
    due_date: instanceDate,
    recurrence_instance_date: instanceDate,
    recurrence_template_id: templateId,
    source_id: templateId,
    source_type: "recurrence",
    status,
    title,
  }, session)).task;
}

async function saveAllFuture(session, sourceTask) {
  await tasksService.update(sourceTask.task_id, {
    recurrence: {
      applyTo: "future",
      enabled: true,
      endDate: "2026-08-31",
      frequency: "WEEKLY",
      interval: 1,
    },
    title: sourceTask.title,
  }, session);
}

async function linkedNoteTitlesForTask(session, taskId) {
  const result = await notesService.listForTarget(session, {
    moduleId: "tasks",
    targetId: taskId,
    targetType: "task",
  });
  return (result.linkedNotes || []).map((note) => note.label || /** @type {Record<string, unknown>} */ (note).title);
}

function taskTarget(taskId) {
  return {
    module_id: "tasks",
    moduleId: "tasks",
    target_id: taskId,
    targetId: taskId,
    target_type: "task",
    targetType: "task",
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
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}
