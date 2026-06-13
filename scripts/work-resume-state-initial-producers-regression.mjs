import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-work-resume-state-initial-producers-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-work-resume-state-initial-producers.db");
process.env.SUPER_ADMIN_PASSWORD = "Work-Resume-State-Initial-Producers-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { activeTimersRepository } = await import("../src/modules/time-tracking/active-timers.repo.js");
const { listsService } = await import("../src/modules/lists/lists.service.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { workResumeStateService } = await import("../src/services/work-resume-state.service.js");
const {
  resetResumeStateReadResolvers,
} = await import("../src/services/work-resume-state-read-checks.js");
const {
  resetResumeStateProducersForTests,
} = await import("../src/services/work-resume-state-producers.js");
const {
  registerInitialResumeStateProducerEventHandlers,
  resetInitialResumeStateProducersForTests,
} = await import("../src/services/work-resume-state-initial-producers.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();

  resetResumeStateReadResolvers();
  resetResumeStateProducersForTests();
  resetInitialResumeStateProducersForTests();
  registerInitialResumeStateProducerEventHandlers();

  await assertTaskProducerWritesTaskAndChecklistState(session);
  await assertListProducerWritesListItemAndLinkState(session);
  await assertNoteProducerWritesOnlySafeActiveWorkNotes(session);
  await assertTimerProducerWritesManualAndSourcedTimerState(session);

  console.log("Work resume state initial producers regression passed.");
} finally {
  resetResumeStateReadResolvers();
  resetResumeStateProducersForTests();
  resetInitialResumeStateProducersForTests();
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertTaskProducerWritesTaskAndChecklistState(session) {
  const taskId = `resume-task-${randomUUID()}`;
  await tasksService.create({
    next_action: "Confirm the first implementation step.",
    priority: "high",
    task_id: taskId,
    title: "Resume producer task",
  }, session);

  let item = await findResumeItem(session, taskId);
  assert.equal(item.module_id, "tasks");
  assert.equal(item.record_type, "task");
  assert.equal(item.title_snapshot, "Resume producer task");
  assert.equal(item.next_action, "Confirm the first implementation step.");
  assert.equal(item.priority_snapshot, "high");

  await modulesService.emitInternalEvent("task.checklist_item.checked", {
    metadata: {
      checklist_progress: {
        completed_count: 1,
        open_count: 1,
        percent_complete: 50,
        total_count: 2,
      },
      task_id: taskId,
      task_title: "Resume producer task",
    },
    moduleId: "tasks",
    recordId: `checklist-${randomUUID()}`,
    recordType: "task_checklist_item",
    session,
  });

  item = await findResumeItem(session, taskId);
  assert.equal(item.last_action_type, "task.checklist_item.checked");
  assert.equal(item.metadata.checklist_progress.completed_count, 1);
}

async function assertListProducerWritesListItemAndLinkState(session) {
  const listId = `resume-list-${randomUUID()}`;
  await listsService.create({
    list_id: listId,
    list_type: "shopping",
    title: "Resume producer list",
  }, session);

  let item = await findResumeItem(session, listId);
  assert.equal(item.module_id, "lists");
  assert.equal(item.record_type, "list");
  assert.equal(item.title_snapshot, "Resume producer list");

  await modulesService.emitInternalEvent("lists.item.checked", {
    metadata: {
      checked_item_count: 1,
      list_id: listId,
      next_unchecked_item_label: "Order spare filters",
      source_url: `lists.html?list=${encodeURIComponent(listId)}`,
      title: "Resume producer list",
      total_item_count: 3,
    },
    moduleId: "lists",
    recordId: `list-item-${randomUUID()}`,
    recordType: "list_item",
    session,
  });

  item = await findResumeItem(session, listId);
  assert.equal(item.last_action_type, "lists.item.checked");
  assert.equal(item.next_action, "Continue with Order spare filters");
  assert.equal(item.metadata.total_item_count, 3);

  await modulesService.emitInternalEvent("lists.link.created", {
    metadata: {
      list_id: listId,
      source_url: `lists.html?list=${encodeURIComponent(listId)}`,
      title: "Resume producer list",
    },
    moduleId: "lists",
    recordId: `list-link-${randomUUID()}`,
    recordType: "list_link",
    session,
  });

  item = await findResumeItem(session, listId);
  assert.equal(item.last_action_type, "lists.link.created");
}

async function assertNoteProducerWritesOnlySafeActiveWorkNotes(session) {
  const noteId = `resume-note-${randomUUID()}`;
  await notesService.create({
    library_bucket: "active_work",
    note_id: noteId,
    title: "Resume producer note",
    visibility: "internal",
  }, session);

  const item = await findResumeItem(session, noteId);
  assert.equal(item.module_id, "notes");
  assert.equal(item.record_type, "note");
  assert.equal(item.title_snapshot, "Resume producer note");
  assert.equal(item.metadata.body_excerpt, undefined);

  const privateNoteId = `private-resume-note-${randomUUID()}`;
  await modulesService.emitInternalEvent("note.created", {
    metadata: {
      body_excerpt: "This must not be copied.",
      library_bucket: "active_work",
      note_id: privateNoteId,
      security_mode: "normal",
      title: "Private resume note",
      visibility: "private",
    },
    moduleId: "notes",
    recordId: privateNoteId,
    recordType: "note",
    session,
  });

  assert.equal(await rawResumeRowCount(session, privateNoteId), 0);

  const secureNoteId = `secure-resume-note-${randomUUID()}`;
  await modulesService.emitInternalEvent("note.created", {
    metadata: {
      body_excerpt: "This must not be copied either.",
      library_bucket: "active_work",
      note_id: secureNoteId,
      security_mode: "secure",
      title: "Secure resume note",
      visibility: "internal",
    },
    moduleId: "notes",
    recordId: secureNoteId,
    recordType: "note",
    session,
  });

  assert.equal(await rawResumeRowCount(session, secureNoteId), 0);
}

async function assertTimerProducerWritesManualAndSourcedTimerState(session) {
  const manualTimerId = `manual-timer-${randomUUID()}`;
  await activeTimersRepository.upsert({
    active_timer_id: manualTimerId,
    accumulated_elapsed_seconds: 30,
    client_id: "",
    description: "Manual resume timer",
    last_active_start_time: "2026-06-13T18:00:00.000Z",
    project_id: "",
    timer_slot: "9",
    timer_status: "running",
    user_id: session.user_id,
    workspace_id: session.workspace_id,
  });
  await modulesService.emitInternalEvent("timer.started", {
    metadata: {
      active_timer_id: manualTimerId,
      accumulated_elapsed_seconds: 30,
      source_type: "manual",
      timer_slot: "9",
      timer_status: "running",
    },
    moduleId: "time-tracking",
    recordId: manualTimerId,
    recordType: "active_work_timer",
    session,
  });

  let item = await findResumeItem(session, manualTimerId);
  assert.equal(item.module_id, "time-tracking");
  assert.equal(item.status_snapshot, "active");

  await modulesService.emitInternalEvent("timer.finalized", {
    metadata: {
      active_timer_id: manualTimerId,
      source_type: "manual",
      timer_slot: "9",
      timer_status: "running",
    },
    moduleId: "time-tracking",
    recordId: manualTimerId,
    recordType: "active_work_timer",
    session,
  });

  assert.equal(await rawResumeRowCount(session, manualTimerId), 0);

  const taskId = `timer-source-task-${randomUUID()}`;
  await tasksService.create({
    task_id: taskId,
    title: "Sourced timer resume task",
  }, session);
  await modulesService.emitInternalEvent("timer.paused", {
    metadata: {
      active_timer_id: `task-timer-${randomUUID()}`,
      accumulated_elapsed_seconds: 120,
      source_id: taskId,
      source_label: "Sourced timer resume task",
      source_module_id: "tasks",
      source_type: "task",
      source_url: `tasks.html?task=${encodeURIComponent(taskId)}`,
      timer_status: "paused",
    },
    moduleId: "time-tracking",
    recordId: `task-timer-${randomUUID()}`,
    recordType: "active_work_timer",
    session,
  });

  item = await findResumeItem(session, taskId);
  assert.equal(item.module_id, "tasks");
  assert.equal(item.record_type, "task");
  assert.equal(item.last_action_type, "timer.paused");
  assert.equal(item.metadata.source_module_id, "tasks");
}

async function findResumeItem(session, recordId) {
  const result = await workResumeStateService.listResumeState(session, {
    limit: 100,
    mode: "recent",
  });
  const item = result.items.find((candidate) => candidate.record_id === recordId);

  assert.ok(item, `expected readable resume state for ${recordId}`);
  return item;
}

async function rawResumeRowCount(session, recordId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM work_resume_state
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND record_id = ${sqlText(recordId)};
`);

  return Number(rows[0]?.count) || 0;
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
