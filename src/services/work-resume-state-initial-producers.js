// @ts-check
import { db } from "../core/database.js";
import { listsService } from "../modules/lists/lists.service.js";
import { LIST_STATUSES } from "../modules/lists/storage-contract.js";
import {
  NOTE_LIBRARY_BUCKETS,
  NOTE_SECURITY_MODES,
  NOTE_STATUSES,
  NOTE_VISIBILITIES,
} from "../modules/notes/library.js";
import { notesService } from "../modules/notes/notes.service.js";
import { tasksService } from "../modules/tasks/tasks.service.js";
import {
  registerResumeStateProducer,
  registerResumeStateProducerEventHandlers,
} from "./work-resume-state-producers.js";
import {
  registerResumeStateBatchReadResolver,
  registerResumeStateReadResolver,
} from "./work-resume-state-read-checks.js";

/** @typedef {import("../types/framework-contracts.js").ResumeStateBatchReadResolverContext} ResumeStateBatchReadResolverContext */
/** @typedef {import("../types/framework-contracts.js").ResumeStateProducerResult} ResumeStateProducerResult */
/** @typedef {import("../types/framework-contracts.js").ResumeStateReadCheck} ResumeStateReadCheck */
/** @typedef {import("../types/framework-contracts.js").ResumeStateReadResolverContext} ResumeStateReadResolverContext */
/** @typedef {import("../types/http-contracts.js").RequestSession} RequestSession */
/** @typedef {import("../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */
/**
 * @typedef {Object} SafeNoteLifecycleRow
 * @property {string} note_id
 * @property {string} library_bucket
 * @property {string} status
 * @property {string} visibility
 * @property {string} security_mode
 * @property {string} [effective_security_mode]
 */
/** @typedef {{ emitted_at?: string, metadata?: Record<string, unknown>, new_value?: Record<string, unknown> | null, previous_value?: Record<string, unknown> | null, record_type?: string }} ResumeProducerEvent */
/** @typedef {{ task_id?: string, id?: string, status?: string, blocked_reason?: string, client_id?: string, due_date?: string, resume_note?: string, handoff_note?: string, last_worked_at?: string, updated_at?: string, checklist_progress?: unknown, recurrence_instance_date?: string, recurrence_template_id?: string, next_action?: string, priority?: string, project_id?: string, title?: string, task_title?: string }} TaskEventRecord */
/** @typedef {{ list_id?: string, client_id?: string, updated_at?: string, project_id?: string, status?: string, title?: string }} ListEventRecord */
/** @typedef {Partial<SafeNoteLifecycleRow> & { client_id?: string, project_id?: string, title?: string, updated_at?: string }} NoteEventRecord */
/** @typedef {{ active_timer_id?: string, source_module_id?: string, source_type?: string, source_id?: string, client_id?: string, project_id?: string, source_url?: string, source_label?: string, timer_status?: string, timer_slot?: string, time_entry_id?: string, accumulated_elapsed_seconds?: number }} TimerEventRecord */

const TASK_EVENTS = [
  "task.created",
  "task.updated",
  "task.completed",
  "task.archived",
  "task.restored",
  "task.checklist_item.created",
  "task.checklist_item.updated",
  "task.checklist_item.checked",
  "task.checklist_item.unchecked",
  "task.checklist_item.deleted",
  "task.checklist_items.reordered",
];
const LIST_EVENTS = [
  "lists.list.created",
  "lists.list.updated",
  "lists.list.completed",
  "lists.list.finalized",
  "lists.list.reopened",
  "lists.list.archived",
  "lists.list.restored",
  "lists.list.deleted",
  "lists.item.created",
  "lists.item.updated",
  "lists.item.checked",
  "lists.item.unchecked",
  "lists.item.completed",
  "lists.item.deleted",
  "lists.link.created",
  "lists.link.removed",
];
const NOTE_EVENTS = [
  "note.created",
  "note.updated",
  "note.linked",
  "note.unlinked",
  "note.archived",
  "note.restored",
  "note.deleted",
  "note.library_changed",
  "note.visibility_changed",
  "note.security_mode_changed",
];
const TIMER_EVENTS = [
  "timer.started",
  "timer.paused",
  "timer.finalized",
  "timer.discarded",
];

let registered = false;

function registerInitialResumeStateProducers() {
  if (registered) {
    return;
  }

  registered = true;
  registerReadResolvers();
  registerTaskProducer();
  registerListProducer();
  registerNoteProducer();
  registerTimerProducer();
}

function registerInitialResumeStateProducerEventHandlers() {
  registerInitialResumeStateProducers();
  registerResumeStateProducerEventHandlers();
}

function resetInitialResumeStateProducersForTests() {
  registered = false;
}

function registerReadResolvers() {
  registerResumeStateReadResolver("tasks", "task", taskReadResolver);
  registerResumeStateReadResolver("lists", "list", listReadResolver);
  registerResumeStateReadResolver("notes", "note", noteReadResolver);
  registerResumeStateReadResolver("time-tracking", "active_work_timer", activeTimerReadResolver);
  registerResumeStateBatchReadResolver("tasks", "task", taskBatchReadResolver);
  registerResumeStateBatchReadResolver("lists", "list", listBatchReadResolver);
  registerResumeStateBatchReadResolver("notes", "note", noteBatchReadResolver);
  registerResumeStateBatchReadResolver("time-tracking", "active_work_timer", activeTimerBatchReadResolver);
}

function registerTaskProducer() {
  registerResumeStateProducer({
    buildPayload: buildTaskPayload,
    events: TASK_EVENTS,
    id: "initial.tasks",
    moduleId: "tasks",
    recordType: "task",
  });
}

function registerListProducer() {
  registerResumeStateProducer({
    buildPayload: buildListPayload,
    events: LIST_EVENTS,
    id: "initial.lists",
    moduleId: "lists",
    recordType: "list",
  });
}

function registerNoteProducer() {
  registerResumeStateProducer({
    buildPayload: buildNotePayload,
    events: NOTE_EVENTS,
    id: "initial.notes",
    moduleId: "notes",
    recordType: "note",
  });
}

function registerTimerProducer() {
  registerResumeStateProducer({
    buildPayload: buildTimerPayload,
    events: TIMER_EVENTS,
    id: "initial.time-tracking-timers",
    moduleId: "time-tracking",
    recordType: "active_work_timer",
  });
}

/** @param {ResumeStateBatchReadResolverContext} context @returns {Promise<Map<string, ResumeStateReadCheck>>} */
async function taskBatchReadResolver({ recordIds, session }) {
  return tasksService.readLifecycleForIds(session, recordIds);
}

/** @param {ResumeStateBatchReadResolverContext} context @returns {Promise<Map<string, ResumeStateReadCheck>>} */
async function listBatchReadResolver({ recordIds, session }) {
  if (!hasWorkspaceSession(session)) {
    return new Map(recordIds.map((recordId) => [recordId, { readable: false }]));
  }
  return listsService.readLifecycleForIds(session, recordIds);
}

// Batches the safe lifecycle pre-filter into one IN-query; notes that survive
// it still go through notesService.read per row because Notes owns its access
// and secure-content policy, and that boundary is not re-implemented here.
/** @param {ResumeStateBatchReadResolverContext} context @returns {Promise<Map<string, ResumeStateReadCheck>>} */
async function noteBatchReadResolver({ recordIds, session, workspaceId }) {
  if (!session.workspace_id || session.workspace_id !== workspaceId) {
    return new Map(recordIds.map((recordId) => [recordId, { readable: false }]));
  }

  const lifecycleRows = await readSafeNoteLifecycleForIds(workspaceId, recordIds);
  const lifecycleByNoteId = new Map(lifecycleRows.map((row) => [row.note_id, row]));
  const checks = new Map();

  for (const recordId of recordIds) {
    const note = lifecycleByNoteId.get(recordId) || null;

    if (!isResumeEligibleNote(note)) {
      checks.set(recordId, {
        archived: note?.status === NOTE_STATUSES.ARCHIVED,
        deleted: note?.status === NOTE_STATUSES.DELETED || !note,
        readable: false,
        status: note?.status || "",
      });
      continue;
    }

    checks.set(recordId, await readEligibleNoteCheck(recordId, { ...session, workspace_id: workspaceId }));
  }

  return checks;
}

/** @param {ResumeStateBatchReadResolverContext} context @returns {Promise<Map<string, ResumeStateReadCheck>>} */
async function activeTimerBatchReadResolver({ recordIds, session, workspaceId }) {
  const timerRows = await db.query(`
SELECT active_timer_id, timer_status
FROM active_work_timers
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND active_timer_id IN (:activeTimerIds);
`, {
    activeTimerIds: recordIds.map((recordId) => textParam(recordId)),
    userId: textParam(session.user_id),
    workspaceId: textParam(workspaceId),
  });
  const statusByTimerId = new Map(timerRows.map((row) => [row.active_timer_id, row.timer_status]));
  const checks = new Map();

  for (const recordId of recordIds) {
    checks.set(recordId, statusByTimerId.has(recordId)
      ? {
          readable: true,
          status: statusByTimerId.get(recordId) === "running" ? "active" : "paused",
        }
      : { deleted: true, readable: false, status: "deleted" });
  }

  return checks;
}

/** @param {ResumeStateReadResolverContext} context @returns {Promise<ResumeStateReadCheck>} */
async function taskReadResolver({ recordId, session }) {
  try {
    const result = await tasksService.readCore(recordId, session);
    const task = result.task || {};
    return {
      archived: task.status === "archived",
      completed: task.status === "complete",
      readable: true,
      status: task.status || "open",
    };
  } catch {
    return { readable: false };
  }
}

/** @param {ResumeStateReadResolverContext} context @returns {Promise<ResumeStateReadCheck>} */
async function listReadResolver({ recordId, session }) {
  try {
    if (!hasWorkspaceSession(session)) {
      return { readable: false };
    }
    const result = await listsService.read(recordId, session, { includeDeleted: true });
    const list = result.list || {};
    return {
      archived: list.status === LIST_STATUSES.ARCHIVED,
      completed: list.status === LIST_STATUSES.COMPLETED,
      deleted: list.status === LIST_STATUSES.DELETED,
      finalized: list.status === LIST_STATUSES.FINALIZED,
      readable: true,
      status: list.status || LIST_STATUSES.ACTIVE,
    };
  } catch {
    return { readable: false };
  }
}

/** @param {ResumeStateReadResolverContext} context @returns {Promise<ResumeStateReadCheck>} */
async function noteReadResolver({ recordId, session, workspaceId }) {
  const note = await readSafeNoteLifecycle(workspaceId, recordId);

  if (!isResumeEligibleNote(note)) {
    return {
      archived: note?.status === NOTE_STATUSES.ARCHIVED,
      deleted: note?.status === NOTE_STATUSES.DELETED || !note,
      readable: false,
      status: note?.status || "",
    };
  }

  if (!session.workspace_id || session.workspace_id !== workspaceId) {
    return { readable: false };
  }

  return readEligibleNoteCheck(recordId, { ...session, workspace_id: workspaceId });
}

/** @param {string} recordId @param {import("../types/http-contracts.js").WorkspaceRequestSession} session @returns {Promise<ResumeStateReadCheck>} */
async function readEligibleNoteCheck(recordId, session) {
  try {
    const note = await notesService.readConsumerSummary(recordId, session, "notes.resume");
    return {
      archived: note?.status === NOTE_STATUSES.ARCHIVED,
      readable: true,
      status: note?.status || NOTE_STATUSES.ACTIVE,
    };
  } catch {
    return { readable: false };
  }
}

/** @param {ResumeStateReadResolverContext} context @returns {Promise<ResumeStateReadCheck>} */
async function activeTimerReadResolver({ recordId, userId, workspaceId }) {
  const row = await db.get(`
SELECT active_timer_id, timer_status
FROM active_work_timers
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND active_timer_id = :activeTimerId
LIMIT 1;
`, {
    activeTimerId: textParam(recordId),
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  });

  if (!row) {
    return { deleted: true, readable: false, status: "deleted" };
  }

  return {
    readable: true,
    status: row.timer_status === "running" ? "active" : "paused",
  };
}

/** @param {{ event: Record<string, any> }} input @returns {ResumeStateProducerResult | null} */
function buildTaskPayload({ event }) {
  const task = event.record_type === "task_checklist_item"
    ? checklistTaskPayload(event)
    : taskFromEvent(event);
  const taskId = task.task_id || task.id || event.record_id;

  if (!taskId) {
    return null;
  }

  return {
    blockedReason: task.status === "blocked" ? task.blocked_reason || "" : "",
    clientId: task.client_id || "",
    dueAtSnapshot: task.due_date || "",
    handoffNote: task.resume_note || task.handoff_note || "",
    lastWorkedAt: task.last_worked_at || task.updated_at || event.emitted_at,
    metadata: {
      checklist_progress: task.checklist_progress || null,
      recurrence_instance_date: task.recurrence_instance_date || "",
      recurrence_template_id: task.recurrence_template_id || "",
      source: event.record_type === "task_checklist_item" ? "task_checklist" : "task",
    },
    nextAction: task.next_action || "",
    prioritySnapshot: task.priority || "",
    projectId: task.project_id || "",
    recordId: taskId,
    sourceUrl: taskId ? `tasks.html?task=${encodeURIComponent(taskId)}` : "",
    statusSnapshot: task.status || "open",
    title: task.title || task.task_title || "Task",
  };
}

/** @param {{ event: Record<string, any> }} input @returns {ResumeStateProducerResult | null} */
function buildListPayload({ event }) {
  const list = listFromEvent(event);
  const listId = list.list_id || event.metadata?.list_id || event.record_id;

  if (!listId) {
    return null;
  }

  return {
    clientId: list.client_id || event.metadata?.client_id || "",
    lastWorkedAt: event.metadata?.last_activity_at || list.updated_at || event.emitted_at,
    metadata: {
      checked_item_count: event.metadata?.checked_item_count,
      completed_item_count: event.metadata?.completed_item_count,
      earliest_needed_by_date: event.metadata?.earliest_needed_by_date,
      next_unchecked_item_label: event.metadata?.next_unchecked_item_label,
      total_item_count: event.metadata?.total_item_count,
    },
    nextAction: event.metadata?.next_unchecked_item_label
      ? `Continue with ${event.metadata.next_unchecked_item_label}`
      : "",
    projectId: list.project_id || event.metadata?.project_id || "",
    recordId: listId,
    sourceUrl: event.metadata?.source_url || `lists.html?list=${encodeURIComponent(listId)}`,
    statusSnapshot: list.status || "active",
    title: list.title || event.metadata?.title || "List",
  };
}

/** @param {{ event: Record<string, any> }} input @returns {ResumeStateProducerResult | null} */
function buildNotePayload({ event }) {
  const note = noteFromEvent(event);

  if (!isResumeEligibleNote(note)) {
    return null;
  }

  return {
    clientId: note.client_id || "",
    lastWorkedAt: note.updated_at || event.emitted_at,
    metadata: {
      library_bucket: note.library_bucket,
      linked_context: safeNoteLinkedContext(event.metadata),
      note_id: note.note_id,
    },
    projectId: note.project_id || "",
    recordId: note.note_id,
    sourceUrl: note.note_id ? `notes.html?note=${encodeURIComponent(note.note_id)}` : "",
    statusSnapshot: note.status || NOTE_STATUSES.ACTIVE,
    title: note.title || "Active Work Note",
  };
}

/** @param {{ event: Record<string, any> }} input @returns {ResumeStateProducerResult | null} */
function buildTimerPayload({ event }) {
  const timer = timerFromEvent(event);

  if (!timer.active_timer_id) {
    return null;
  }

  if (timer.source_module_id === "tasks" && timer.source_type === "task" && timer.source_id) {
    return {
      clientId: timer.client_id || "",
      lastWorkedAt: event.emitted_at,
      metadata: {
        accumulated_elapsed_seconds: timer.accumulated_elapsed_seconds || 0,
        source_module_id: timer.source_module_id,
        source_type: timer.source_type,
        timer_status: timer.timer_status || "",
        time_entry_id: timer.time_entry_id || "",
      },
      moduleId: "tasks",
      projectId: timer.project_id || "",
      recordId: timer.source_id,
      recordType: "task",
      sourceUrl: timer.source_url || `tasks.html?task=${encodeURIComponent(timer.source_id)}`,
      statusSnapshot: timer.timer_status === "running" ? "active" : "",
      title: timer.source_label || "Task timer",
    };
  }

  if (["timer.finalized", "timer.discarded"].includes(event.name)) {
    return { action: "remove", recordId: timer.active_timer_id };
  }

  return {
    clientId: timer.client_id || "",
    lastWorkedAt: event.emitted_at,
    metadata: {
      accumulated_elapsed_seconds: timer.accumulated_elapsed_seconds || 0,
      timer_slot: timer.timer_slot || "",
      timer_status: timer.timer_status || "",
    },
    projectId: timer.project_id || "",
    recordId: timer.active_timer_id,
    sourceUrl: "time-tracking.html",
    statusSnapshot: timer.timer_status === "running" ? "active" : "paused",
    title: timer.source_label || "Manual timer",
  };
}

/** @param {ResumeProducerEvent} event @returns {TaskEventRecord} */
function taskFromEvent(event) {
  return /** @type {TaskEventRecord} */ ({
    ...(event.previous_value || {}),
    ...(event.new_value || {}),
  });
}

/** @param {ResumeProducerEvent} event @returns {TaskEventRecord} */
function checklistTaskPayload(event) {
  return /** @type {TaskEventRecord} */ ({
    checklist_progress: event.metadata?.checklist_progress || null,
    task_id: event.metadata?.task_id || event.metadata?.target_id || "",
    title: event.metadata?.task_title || "",
    updated_at: event.emitted_at,
  });
}

/** @param {ResumeProducerEvent} event @returns {ListEventRecord} */
function listFromEvent(event) {
  return /** @type {ListEventRecord} */ ({
    ...(event.previous_value || {}),
    ...(event.new_value || {}),
    ...(event.record_type === "list" ? {} : { list_id: event.metadata?.list_id || "" }),
  });
}

/** @param {ResumeProducerEvent} event @returns {NoteEventRecord} */
function noteFromEvent(event) {
  return /** @type {NoteEventRecord} */ ({
    ...(event.previous_value || {}),
    ...(event.new_value || {}),
    ...event.metadata,
  });
}

/** @param {ResumeProducerEvent} event @returns {TimerEventRecord} */
function timerFromEvent(event) {
  return /** @type {TimerEventRecord} */ ({
    ...(event.new_value || {}),
    ...event.metadata,
  });
}

/** @param {Partial<SafeNoteLifecycleRow> | null | undefined} note */
function isResumeEligibleNote(note = null) {
  if (!note) {
    return false;
  }

  return Boolean(note.note_id) &&
    note.library_bucket === NOTE_LIBRARY_BUCKETS.ACTIVE_WORK &&
    note.status === NOTE_STATUSES.ACTIVE &&
    note.visibility !== NOTE_VISIBILITIES.PRIVATE &&
    note.security_mode !== NOTE_SECURITY_MODES.SECURE &&
    note.effective_security_mode !== NOTE_SECURITY_MODES.SECURE;
}

/** @param {Record<string, unknown>} [metadata] */
function safeNoteLinkedContext(metadata = {}) {
  const link = metadata.link;
  if (!link || typeof link !== "object") {
    return null;
  }

  return {
    target_id: "target_id" in link ? String(link.target_id || "") : "",
    target_type: "target_type" in link ? String(link.target_type || "") : "",
  };
}

/**
 * @param {string} workspaceId
 * @param {string} noteId
 */
async function readSafeNoteLifecycle(workspaceId, noteId) {
  return /** @type {Promise<SafeNoteLifecycleRow | null>} */ (db.get(`
SELECT note_id, library_bucket, status, visibility, security_mode
FROM notes
WHERE workspace_id = :workspaceId
  AND note_id = :noteId
LIMIT 1;
`, {
    noteId: textParam(noteId),
    workspaceId: textParam(workspaceId),
  }));
}

/**
 * @param {string} workspaceId
 * @param {unknown[]} [noteIds]
 */
async function readSafeNoteLifecycleForIds(workspaceId, noteIds = []) {
  const ids = [...new Set((Array.isArray(noteIds) ? noteIds : [])
    .map((noteId) => textParam(String(noteId ?? "")).trim())
    .filter(Boolean))];

  if (ids.length === 0) {
    return [];
  }

  return /** @type {Promise<SafeNoteLifecycleRow[]>} */ (db.query(`
SELECT note_id, library_bucket, status, visibility, security_mode
FROM notes
WHERE workspace_id = :workspaceId
  AND note_id IN (:noteIds);
`, {
    noteIds: ids,
    workspaceId: textParam(workspaceId),
  }));
}

/**
 * @param {string} value
 */
function textParam(value) {
  return String(value ?? "");
}

/** @param {RequestSession} session @returns {session is WorkspaceRequestSession} */
function hasWorkspaceSession(session) {
  return Boolean(session.workspace_id);
}

export {
  registerInitialResumeStateProducerEventHandlers,
  registerInitialResumeStateProducers,
  resetInitialResumeStateProducersForTests,
};
