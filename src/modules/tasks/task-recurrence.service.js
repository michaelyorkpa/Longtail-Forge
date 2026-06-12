import { taskRecurrenceRepository } from "./task-recurrence.repo.js";
import { AppError } from "../../core/errors.js";
import { normalizeUtcIso } from "../../utils/timezones.js";

const FREQUENCIES = new Set(["DAILY", "WEEKDAYS", "WEEKENDS", "WEEKLY", "MONTHLY"]);
const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR"];
const WEEKEND_CODES = ["SA", "SU"];

async function createTemplateFromTask({ session, task, recurrence }) {
  const normalized = normalizeRecurrencePayload(recurrence);

  if (!task.due_date) {
    throw new AppError("Recurring tasks require a due date.", 400);
  }

  return taskRecurrenceRepository.createTemplate(session.workspace_id, {
    ...task,
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
    status: task.status === "complete" || task.status === "archived" ? "open" : task.status,
    priority: task.priority,
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

  const existing = await createTask.findExisting(template.recurrence_template_id, nextDate);
  if (existing) {
    return {
      task: existing,
      wasCreated: false,
    };
  }

  const dueAtUtc = template.due_time
    ? normalizeUtcIso(`${nextDate}T${template.due_time}:00`, template.due_timezone || session.timezone)
    : "";

  return {
    task: await createTask.create({
      client_id: template.client_id,
      project_id: template.project_id,
      title: template.title,
      description: template.description,
      status: template.status === "complete" || template.status === "archived" ? "open" : template.status,
      priority: template.priority,
      due_date: nextDate,
      due_time: template.due_time,
      due_timezone: template.due_timezone || session.timezone,
      due_at_utc: dueAtUtc,
      source_type: "recurrence",
      source_id: template.recurrence_template_id,
      recurrence_template_id: template.recurrence_template_id,
      recurrence_instance_date: nextDate,
      reminder_override_enabled: false,
      assignee_ids: template.assignee_ids || [],
    }),
    wasCreated: true,
  };
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
  parseRRule,
  readTaskRecurrenceDetails,
  updateTemplateFromTask,
};
