import { taskRecurrenceRepository } from "./task-recurrence.repo.js";
import { taskChecklistsRepository } from "./task-checklists.repo.js";
import { notesService } from "../notes/notes.service.js";
import { AppError } from "../../core/errors.js";
import { normalizeUtcIso } from "../../utils/timezones.js";

const FREQUENCIES = new Set(["DAILY", "WEEKDAYS", "WEEKENDS", "WEEKLY", "MONTHLY"]);
const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR"];
const WEEKEND_CODES = ["SA", "SU"];
const MAX_PROJECTED_OCCURRENCE_STEPS = 36600;

async function createTemplateFromTask({ session, task, recurrence }) {
  const normalized = normalizeRecurrencePayload(recurrence);

  if (!task.due_date) {
    throw new AppError("Recurring tasks require a due date.", 400);
  }

  return taskRecurrenceRepository.createTemplate(session.workspace_id, {
    ...task,
    status: "open",
    recurrence_anchor_date: task.due_date,
    rrule: buildRRule(normalized),
    recurrence_end_date: normalized.endDate,
    template_status: "active",
    created_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
  });
}

async function updateTemplateFromTask({ session, task, recurrence }) {
  if (!task.recurrence_template_id) {
    return null;
  }

  const template = await taskRecurrenceRepository.readTemplateById(session.workspace_id, task.recurrence_template_id);
  if (!template) {
    return null;
  }

  const normalized = normalizeRecurrencePayload(recurrence, template);

  if (normalized.enabled && !task.due_date) {
    throw new AppError("Recurring tasks require a due date.", 400);
  }

  const nextTemplate = {
    ...template,
    client_id: task.client_id,
    project_id: task.project_id,
    title: task.title,
    description: task.description,
    status: "open",
    priority: task.priority,
    estimate_minutes: task.estimate_minutes,
    due_time: task.due_time,
    due_timezone: task.due_timezone,
    due_at_utc: task.due_date && task.due_time ? normalizeUtcIso(`${task.due_date}T${task.due_time}:00`, task.due_timezone || session.timezone) : "",
    recurrence_anchor_date: task.due_date || template.recurrence_anchor_date,
    rrule: buildRRule(normalized),
    recurrence_end_date: normalized.endDate,
    template_status: normalized.enabled ? "active" : "paused",
    updated_by_user_id: session.user_id,
    assignee_ids: task.assignee_ids || [],
  };

  return taskRecurrenceRepository.updateTemplate(session.workspace_id, nextTemplate);
}

async function createNextInstance({ session, completedTask, createTask }) {
  if (!completedTask.recurrence_template_id || !completedTask.recurrence_instance_date) {
    return null;
  }

  const template = await taskRecurrenceRepository.readTemplateById(session.workspace_id, completedTask.recurrence_template_id);
  if (!template || template.template_status !== "active") {
    return null;
  }

  const nextDate = nextOccurrenceDate(completedTask.recurrence_instance_date, template.rrule, template.recurrence_end_date);
  if (!nextDate) {
    return null;
  }

  return materializeInstance({
    session,
    template,
    instanceDate: nextDate,
    createTask,
    sourceTaskId: completedTask.task_id,
  });
}

async function prepareCompletionContinuity({ session, completedTask, findExisting }) {
  const continuity = await readCompletionContinuity({ session, completedTask, findExisting });

  if (!continuity || continuity.status === "ended") {
    return continuity;
  }

  const sourceItems = Array.isArray(completedTask.checklistItems)
    ? completedTask.checklistItems
    : await taskChecklistsRepository.readForTask(session.workspace_id, completedTask.task_id);
  const seedResult = await taskRecurrenceRepository.seedTemplateChecklistIfEmpty(
    session.workspace_id,
    completedTask.recurrence_template_id,
    sourceItems.map((item, index) => ({
      label: String(item?.label || "").trim(),
      sort_order: Number.parseInt(item?.sort_order, 10) || ((index + 1) * 1000),
    })).filter((item) => item.label),
    session.user_id,
  );

  return {
    ...continuity,
    checklistTemplateSeeded: seedResult.seeded === true,
  };
}

async function readCompletionContinuity({ session, completedTask, findExisting }) {
  if (!completedTask?.recurrence_template_id || !completedTask?.recurrence_instance_date) {
    return null;
  }

  const template = await taskRecurrenceRepository.readTemplateById(
    session.workspace_id,
    completedTask.recurrence_template_id,
  );
  if (!template || template.template_status !== "active") {
    return endedContinuity();
  }

  const nextScheduledDate = nextOccurrenceDate(
    completedTask.recurrence_instance_date,
    template.rrule,
    template.recurrence_end_date,
  );
  if (!nextScheduledDate) {
    return endedContinuity();
  }

  const nextTask = typeof findExisting === "function"
    ? await findExisting(template.recurrence_template_id, nextScheduledDate)
    : null;

  return {
    checklistTemplateSeeded: false,
    followUpFailed: false,
    followUpQueued: false,
    isRecurring: true,
    nextScheduledDate,
    nextTask: safeNextTask(nextTask),
    status: nextTask ? "available" : "pending",
  };
}

function endedContinuity() {
  return {
    checklistTemplateSeeded: false,
    followUpFailed: false,
    followUpQueued: false,
    isRecurring: true,
    nextScheduledDate: "",
    nextTask: null,
    status: "ended",
  };
}

function safeNextTask(task) {
  if (!task?.task_id) {
    return null;
  }

  return {
    due_date: task.due_date || task.recurrence_instance_date || "",
    task_id: task.task_id,
    title: task.title || "Task",
    url: `tasks.html?task=${encodeURIComponent(task.task_id)}`,
  };
}

// Re-anchor a stalled chain: create the first occurrence on or after `today` for a template
// that has no open instance. Recurrence is generated on completion only, so if a completion
// ever fails to enqueue generation the chain has no open instance left and stays dead — this
// backfill is the safety net that regenerates it (used by the recurrence sweep).
async function ensureUpcomingInstance({ session, template, latestInstanceDate, hasInstances, today, createTask }) {
  if (!template || template.template_status !== "active") {
    return null;
  }

  const normalizedToday = normalizeDate(today);
  const anchor = normalizeDate(latestInstanceDate) || normalizeDate(template.recurrence_anchor_date);
  if (!anchor) {
    return null;
  }

  let instanceDate;
  if (!hasInstances && (!normalizedToday || anchor >= normalizedToday)) {
    // Template that never produced an instance yet: its anchor date is itself a valid first
    // occurrence, so don't advance past it.
    instanceDate = anchor;
  } else {
    instanceDate = upcomingOccurrenceDate(anchor, template.rrule, template.recurrence_end_date, normalizedToday);
  }

  if (!instanceDate) {
    return null;
  }

  return materializeInstance({ session, template, instanceDate, createTask });
}

async function materializeInstance({ session, template, instanceDate, createTask, sourceTaskId = "" }) {
  const existing = await createTask.findExisting(template.recurrence_template_id, instanceDate);
  if (existing) {
    return {
      task: existing,
      wasCreated: false,
    };
  }

  const dueAtUtc = template.due_time
    ? normalizeUtcIso(`${instanceDate}T${template.due_time}:00`, template.due_timezone || session.timezone)
    : "";

  const creationResult = await createTask.create({
    client_id: template.client_id,
    project_id: template.project_id,
    title: template.title,
    description: template.description,
    status: "open",
    priority: template.priority,
    estimate_minutes: template.estimate_minutes,
    due_date: instanceDate,
    due_time: template.due_time,
    due_timezone: template.due_timezone || session.timezone,
    due_at_utc: dueAtUtc,
    source_type: "recurrence",
    source_id: template.recurrence_template_id,
    recurrence_template_id: template.recurrence_template_id,
    recurrence_instance_date: instanceDate,
    reminder_override_enabled: false,
    assignee_ids: template.assignee_ids || [],
  });
  const task = creationResult?.task || creationResult;
  const wasCreated = creationResult?.wasCreated !== false;

  if (!wasCreated) {
    return {
      task,
      wasCreated: false,
    };
  }

  await copyTemplateChecklistToTask({
    session,
    task,
    template,
  });
  await copyTemplateNoteLinksToTask({
    session,
    sourceTaskId,
    task,
    template,
  });

  return {
    task,
    wasCreated,
  };
}

async function copyTemplateChecklistToTask({ session, task, template }) {
  if (!task?.task_id || !template?.recurrence_template_id) {
    return [];
  }

  const checklistItems = Array.isArray(template.checklistItems)
    ? template.checklistItems
    : await taskRecurrenceRepository.readTemplateChecklist(
        session.workspace_id,
        template.recurrence_template_id,
      );

  for (const [index, item] of checklistItems.entries()) {
    await taskChecklistsRepository.create(session.workspace_id, task.task_id, {
      label: item.label,
      sort_order: item.sort_order || ((index + 1) * 1000),
      is_checked: false,
      completed_at: "",
      completed_by_user_id: "",
      created_by_user_id: session.user_id || template.updated_by_user_id || template.created_by_user_id,
      updated_by_user_id: session.user_id || template.updated_by_user_id || template.created_by_user_id,
    });
  }

  return checklistItems;
}

async function copyTemplateNoteLinksToTask({ session, task, template, sourceTaskId = "" }) {
  if (!task?.task_id || !template?.recurrence_template_id) {
    return {
      createdCount: 0,
      removedCount: 0,
      skipped: true,
    };
  }

  const noteLinks = Array.isArray(template.noteLinks)
    ? template.noteLinks
    : await taskRecurrenceRepository.readTemplateNoteLinks(
        session.workspace_id,
        template.recurrence_template_id,
      );

  return notesService.replacePropagatedTaskLinkedNotes(session, {
    links: noteLinks,
    sourceTaskId,
    taskId: task.task_id,
    templateId: template.recurrence_template_id,
  });
}

async function readTaskRecurrenceDetails(task) {
  if (!task?.recurrence_template_id) {
    return {
      enabled: false,
      applyTo: "instance",
      frequency: "WEEKLY",
      interval: 1,
      endDate: "",
      rrule: "",
      templateStatus: "",
    };
  }

  const template = await taskRecurrenceRepository.readTemplateById(task.workspace_id, task.recurrence_template_id);
  const parsed = parseRRule(template?.rrule || "");

  return {
    enabled: Boolean(template && template.template_status === "active"),
    applyTo: "instance",
    frequency: parsed.frequency,
    interval: parsed.interval,
    endDate: template?.recurrence_end_date || parsed.endDate || "",
    rrule: template?.rrule || "",
    templateStatus: template?.template_status || "",
  };
}

function normalizeRecurrencePayload(payload = {}, fallback = {}) {
  const frequency = String(payload.frequency || parseRRule(fallback.rrule).frequency || "WEEKLY").trim().toUpperCase();
  const interval = Math.max(1, Number.parseInt(payload.interval || parseRRule(fallback.rrule).interval || 1, 10));
  const endDate = normalizeDate(payload.endDate || payload.end_date || fallback.recurrence_end_date || "");

  if (!FREQUENCIES.has(frequency)) {
    throw new AppError("Recurrence frequency must be daily, weekdays, weekends, weekly, or monthly.", 400);
  }

  return {
    enabled: payload.enabled !== false,
    frequency,
    interval,
    endDate,
  };
}

function buildRRule({ frequency, interval, endDate }) {
  const rruleFrequency = frequency === "WEEKDAYS" || frequency === "WEEKENDS" ? "DAILY" : frequency;
  const parts = [`FREQ=${rruleFrequency}`, `INTERVAL=${interval}`];

  if (frequency === "WEEKDAYS") {
    parts.push(`BYDAY=${WEEKDAY_CODES.join(",")}`);
  } else if (frequency === "WEEKENDS") {
    parts.push(`BYDAY=${WEEKEND_CODES.join(",")}`);
  }

  if (endDate) {
    parts.push(`UNTIL=${endDate.replaceAll("-", "")}`);
  }

  return parts.join(";");
}

function parseRRule(rrule = "") {
  const values = String(rrule || "").split(";").reduce((map, part) => {
    const [key, value] = part.split("=");
    if (key && value) {
      map[key.trim().toUpperCase()] = value.trim().toUpperCase();
    }
    return map;
  }, {});

  const byDay = String(values.BYDAY || "")
    .split(",")
    .map((day) => day.trim().toUpperCase())
    .filter(Boolean);

  return {
    frequency: recurrenceFrequencyFromParts(values.FREQ, byDay),
    interval: Math.max(1, Number.parseInt(values.INTERVAL, 10) || 1),
    endDate: normalizeUntilDate(values.UNTIL || ""),
  };
}

function nextOccurrenceDate(currentDate, rrule, endDate) {
  const parsed = parseRRule(rrule);
  const date = new Date(`${currentDate}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (parsed.frequency === "WEEKDAYS") {
    advanceToMatchingDay(date, parsed.interval, new Set([1, 2, 3, 4, 5]));
  } else if (parsed.frequency === "WEEKENDS") {
    advanceToMatchingDay(date, parsed.interval, new Set([0, 6]));
  } else if (parsed.frequency === "DAILY") {
    date.setUTCDate(date.getUTCDate() + parsed.interval);
  } else if (parsed.frequency === "WEEKLY") {
    date.setUTCDate(date.getUTCDate() + (parsed.interval * 7));
  } else {
    date.setUTCMonth(date.getUTCMonth() + parsed.interval);
  }

  const nextDate = date.toISOString().slice(0, 10);
  const finalEndDate = normalizeDate(endDate || parsed.endDate || "");

  return finalEndDate && nextDate > finalEndDate ? "" : nextDate;
}

function projectOccurrenceDates(template, startDate, endDate) {
  const anchorDate = normalizeDate(template?.recurrence_anchor_date);
  const rangeStart = normalizeDate(startDate);
  const rangeEnd = normalizeDate(endDate);

  if (!anchorDate || !rangeStart || !rangeEnd || rangeEnd < rangeStart) {
    return [];
  }

  const parsedEndDate = parseRRule(template?.rrule || "").endDate;
  const storedEndDate = normalizeDate(template?.recurrence_end_date);
  const recurrenceEndDate = [parsedEndDate, storedEndDate].filter(Boolean).sort()[0] || "";
  const boundedEndDate = recurrenceEndDate && recurrenceEndDate < rangeEnd ? recurrenceEndDate : rangeEnd;

  if (anchorDate > boundedEndDate) {
    return [];
  }

  const dates = [];
  let cursor = anchorDate;

  for (let step = 0; step < MAX_PROJECTED_OCCURRENCE_STEPS; step += 1) {
    if (cursor >= rangeStart && cursor <= boundedEndDate) {
      dates.push(cursor);
    }

    if (cursor >= boundedEndDate) {
      break;
    }

    const nextDate = nextOccurrenceDate(cursor, template?.rrule || "", recurrenceEndDate);
    if (!nextDate || nextDate <= cursor) {
      break;
    }
    cursor = nextDate;
  }

  return dates;
}

// Walk the recurrence forward from `fromDate` and return the first occurrence on or after
// `today` (skipping every occurrence that was missed while the chain was stalled). Returns ""
// if the recurrence ends before reaching `today`.
function upcomingOccurrenceDate(fromDate, rrule, endDate, today) {
  const normalizedToday = normalizeDate(today);
  let cursor = normalizeDate(fromDate);
  if (!cursor) {
    return "";
  }

  // Bounded to ~10 years of daily steps so a malformed rule can never loop forever.
  for (let guard = 0; guard < 3660; guard += 1) {
    const next = nextOccurrenceDate(cursor, rrule, endDate);
    if (!next) {
      return "";
    }
    if (!normalizedToday || next >= normalizedToday) {
      return next;
    }
    cursor = next;
  }

  return "";
}

function recurrenceFrequencyFromParts(frequency, byDay) {
  const normalizedFrequency = String(frequency || "").trim().toUpperCase();
  const sortedByDay = [...new Set(byDay)].sort().join(",");

  if (normalizedFrequency === "DAILY" && sortedByDay === [...WEEKDAY_CODES].sort().join(",")) {
    return "WEEKDAYS";
  }

  if (normalizedFrequency === "DAILY" && sortedByDay === [...WEEKEND_CODES].sort().join(",")) {
    return "WEEKENDS";
  }

  return FREQUENCIES.has(normalizedFrequency) ? normalizedFrequency : "WEEKLY";
}

function advanceToMatchingDay(date, interval, allowedDays) {
  let matches = 0;

  while (matches < interval) {
    date.setUTCDate(date.getUTCDate() + 1);

    if (allowedDays.has(date.getUTCDay())) {
      matches += 1;
    }
  }
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeUntilDate(value) {
  const text = String(value || "").trim();
  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }

  return normalizeDate(text);
}

export const taskRecurrenceService = {
  createNextInstance,
  createTemplateFromTask,
  ensureUpcomingInstance,
  materializeInstance,
  parseRRule,
  prepareCompletionContinuity,
  projectOccurrenceDates,
  readCompletionContinuity,
  readTaskRecurrenceDetails,
  updateTemplateFromTask,
};
