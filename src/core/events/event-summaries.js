import { modulesService } from "../modules/modules.service.js";

/** @typedef {import("../../types/framework-contracts.js").EventSummaryDeclaration} EventSummaryDeclaration */
/** @typedef {import("../../types/framework-contracts.js").EventSummaryRecipientHints} EventSummaryRecipientHints */
/** @typedef {import("../../types/framework-contracts.js").EventSummarySection} EventSummarySection */
/** @typedef {import("../../types/framework-contracts.js").EventSummaryText} EventSummaryText */
/** @typedef {import("../../types/framework-contracts.js").InternalEvent} InternalEvent */
/** @typedef {Omit<InternalEvent, "session"> & {session?: unknown}} EventSummaryInput */

const TASK_UPDATE_FIELD_LABELS = new Map([
  ["description", "Description Updated"],
  ["status", "Status Updated"],
  ["priority", "Priority Updated"],
  ["assignee_ids", "Assignment Updated"],
  ["due_date", "Due Date Updated"],
  ["due_time", "Due Date Updated"],
  ["due_at_utc", "Due Date Updated"],
  ["recurrence_template_id", "Recurrence Updated"],
  ["recurrence_instance_date", "Recurrence Updated"],
  ["reminder_override_enabled", "Reminder Updated"],
  ["title", "Title Updated"],
  ["client_id", "Project Updated"],
  ["project_id", "Project Updated"],
]);
const TASK_UPDATE_CONTEXT_LABELS = new Map([
  ["description", "Description updated"],
  ["status", "Status updated"],
  ["priority", "Priority updated"],
  ["assignee_ids", "Assignment updated"],
  ["due_date", "Due date updated"],
  ["due_time", "Due date updated"],
  ["due_at_utc", "Due date updated"],
  ["recurrence_template_id", "Recurrence updated"],
  ["recurrence_instance_date", "Recurrence updated"],
  ["reminder_override_enabled", "Reminder updated"],
  ["title", "Title updated"],
  ["client_id", "Project updated"],
  ["project_id", "Project updated"],
]);
const TASK_UPDATE_FIELD_ORDER = [
  "description",
  "status",
  "priority",
  "assignee_ids",
  "due_date",
  "due_time",
  "due_at_utc",
  "recurrence_template_id",
  "recurrence_instance_date",
  "reminder_override_enabled",
  "title",
  "project_id",
  "client_id",
];

/** @param {EventSummaryInput} event */
function summarizeActivityEvent(event) {
  const summary = findEventSummary(event, "activity");
  const context = summarizeEventContext(event);

  return {
    event: event.name,
    moduleId: event.module_id || "",
    recordType: event.record_type || "",
    recordId: event.record_id || "",
    actionType: context.actionType,
    actor: context.actor,
    changedContext: context.changedContext,
    changedFieldLabels: context.changedFieldLabels,
    recordLabel: context.recordLabel,
    label: readSummaryValue(summary?.label, event) || fallbackLabel(event),
    summary: readSummaryValue(summary?.summary, event) || fallbackSummary(event),
    url: safeUrl(readSummaryValue(summary?.url, event) || event.metadata?.record_url || ""),
  };
}

/** @param {EventSummaryInput} event @param {{ moduleId?: string }} [options] */
function summarizeNotificationEvent(event, options = {}) {
  const summary = findEventSummary(event, "notification", options.moduleId);
  const context = summarizeEventContext(event);

  return {
    event: event.name,
    moduleId: event.module_id || "",
    recordType: event.record_type || "",
    recordId: event.record_id || "",
    actionType: context.actionType,
    actor: context.actor,
    changedContext: context.changedContext,
    changedFieldLabels: context.changedFieldLabels,
    recordLabel: context.recordLabel,
    title: readSummaryValue(summary?.title, event) || fallbackLabel(event),
    body: readSummaryValue(summary?.body, event) || fallbackSummary(event),
    url: safeUrl(readSummaryValue(summary?.url, event) || event.metadata?.record_url || ""),
    recipientHints: readRecipientHints(summary?.recipientHints, event),
  };
}

/** @param {EventSummaryInput} event */
function summarizeEventContext(event) {
  const changedFields = readChangedFields(event?.previous_value, event?.new_value);
  const changedContext = buildEventChangedContext(event, changedFields);

  return {
    event: event?.name || event?.event || "",
    moduleId: event?.module_id || event?.moduleId || "",
    recordType: event?.record_type || event?.recordType || "",
    recordId: event?.record_id || event?.recordId || "",
    recordLabel: safeRecordLabel(event),
    actionType: eventActionType(event),
    actor: safeActor(event),
    changedFields,
    changedFieldLabels: changedFields.map((field) => changedFieldLabel(event, field)).filter(Boolean),
    changedContext,
  };
}

/**
 * @param {EventSummaryInput} event
 * @param {"activity" | "notification"} kind
 * @param {string} [moduleIdOverride]
 * @returns {EventSummarySection | null}
 */
function findEventSummary(event, kind, moduleIdOverride) {
  const eventName = event?.name || event?.event || "";
  // A module can surface a framework event whose module_id names a *different*
  // module (e.g. Users surfacing module.disabled for whichever module was
  // turned off). Callers that know the surfacing module pass it explicitly so
  // the declaring module's summary still matches; everyone else keeps the old
  // behavior of matching on the event's own module_id.
  const moduleId = moduleIdOverride || event?.module_id || event?.moduleId || "";

  return /** @type {EventSummaryDeclaration[]} */ (modulesService.listModuleEventSummaries())
    .find((summary) => summary.event === eventName && (!summary.moduleId || summary.moduleId === moduleId))?.[kind] || null;
}

/** @param {EventSummaryText | undefined} value @param {EventSummaryInput} event */
function readSummaryValue(value, event) {
  if (typeof value === "function") {
    return String(value({ event: /** @type {import("../../types/framework-contracts.js").InternalEvent} */ (event) }) || "").trim();
  }

  return String(value || "").trim();
}

/** @param {EventSummaryRecipientHints | undefined} value @param {EventSummaryInput} event */
function readRecipientHints(value, event) {
  const resolved = typeof value === "function"
    ? value({ event: /** @type {import("../../types/framework-contracts.js").InternalEvent} */ (event) })
    : value;

  if (!Array.isArray(resolved)) {
    return [];
  }

  return resolved
    .map((hint) => String(hint || "").trim())
    .filter(Boolean);
}

/** @param {EventSummaryInput} event */
function fallbackLabel(event) {
  return String(event?.name || "Event")
    .split(".")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).replaceAll("_", " "))
    .join(" ");
}

/** @param {EventSummaryInput} event */
function fallbackSummary(event) {
  const recordLabel = safeRecordLabel(event);

  // Without a human-readable record label, "Timer Paused." beats leaking a
  // placeholder or an identifier into user-facing summary copy.
  return recordLabel ? `${fallbackLabel(event)} for ${recordLabel}.` : `${fallbackLabel(event)}.`;
}

/** @param {EventSummaryInput} event @param {string[]} [changedFields] */
function buildEventChangedContext(event, changedFields = readChangedFields(event?.previous_value, event?.new_value)) {
  if (!String(event?.name || event?.event || "").endsWith(".updated") || changedFields.length === 0) {
    return null;
  }

  if ((event?.name || event?.event) === "task.updated") {
    return buildTaskChangedContext(event, changedFields);
  }

  const field = changedFields[0] || "";
  const label = titleizeFieldName(field, "Record updated");

  return {
    field,
    fields: changedFields,
    label,
    labels: changedFields.map((changedField) => titleizeFieldName(changedField, "Record updated")),
    summary: `${label}.`,
  };
}

/** @param {EventSummaryInput} event @param {string[]} changedFields */
function buildTaskChangedContext(event, changedFields) {
  const changedFieldSet = new Set(changedFields);
  const field = TASK_UPDATE_FIELD_ORDER.find((candidate) => changedFieldSet.has(candidate)) || changedFields[0] || "";
  const label = taskChangedContextLabel(field, event?.previous_value, event?.new_value);
  const value = readableTaskChangedValue(field, event?.new_value);

  return {
    field,
    fields: changedFields,
    label,
    labels: changedFields.map((changedField) => taskChangedContextLabel(changedField, event?.previous_value, event?.new_value)),
    summary: value ? `${label}: ${value}` : `${label}.`,
  };
}

/** @param {string} field @param {unknown} previousValue @param {unknown} newValue */
function taskChangedContextLabel(field, previousValue, newValue) {
  if (field === "description") {
    return descriptionChangeLabel(previousValue, newValue)
      .replace("Added", "added")
      .replace("Removed", "removed")
      .replace("Updated", "updated");
  }

  return TASK_UPDATE_CONTEXT_LABELS.get(field) || "Task updated";
}

/** @param {string} field @param {unknown} newValue */
function readableTaskChangedValue(field, newValue) {
  if (["description", "title", "status", "priority", "due_date", "due_time", "due_at_utc"].includes(field)) {
    return truncateSnippet(objectValue(newValue)[field]);
  }

  return "";
}

/** @param {Record<string, unknown>} metadata @param {{ previousValue?: unknown, newValue?: unknown }} [options] */
function taskUpdatedLabel(metadata, options = {}) {
  if (metadata.transition === "reopened") {
    return "Task Reopened";
  }

  const changedFields = normalizeChangedFields(metadata.changed_fields || metadata.changedFields);

  if (changedFields.has("description")) {
    return descriptionChangeLabel(options.previousValue, options.newValue);
  }

  for (const field of TASK_UPDATE_FIELD_ORDER) {
    if (changedFields.has(field)) {
      return TASK_UPDATE_FIELD_LABELS.get(field) || "Task Updated";
    }
  }

  return "Task Updated";
}

/** @param {unknown} previousValue @param {unknown} newValue */
function descriptionChangeLabel(previousValue, newValue) {
  const previousDescription = String(objectValue(previousValue).description || "").trim();
  const nextDescription = String(objectValue(newValue).description || "").trim();

  if (!previousDescription && nextDescription) {
    return "Description Added";
  }

  if (previousDescription && !nextDescription) {
    return "Description Removed";
  }

  return "Description Updated";
}

/** @param {unknown} previousValue @param {unknown} newValue */
function readChangedFields(previousValue, newValue) {
  const previous = objectValue(previousValue);
  const next = objectValue(newValue);
  return TASK_UPDATE_FIELD_ORDER.filter((field) => !sameSummaryFieldValue(previous[field], next[field]));
}

/** @param {unknown} left @param {unknown} right */
function sameSummaryFieldValue(left, right) {
  return JSON.stringify(normalizeSummaryFieldValue(left)) === JSON.stringify(normalizeSummaryFieldValue(right));
}

/** @param {unknown} value */
function normalizeSummaryFieldValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).sort();
  }

  return value ?? "";
}

/** @param {unknown} value @returns {Set<string>} */
function normalizeChangedFields(value) {
  const fields = Array.isArray(value) ? value : [];

  return new Set(fields.map((field) => String(field || "").trim()).filter(Boolean));
}

/** @param {EventSummaryInput} event @param {string} field */
function changedFieldLabel(event, field) {
  if ((event?.name || event?.event) === "task.updated") {
    return TASK_UPDATE_FIELD_LABELS.get(field) || titleizeFieldName(field, "Task Updated");
  }

  return titleizeFieldName(field, "Record Updated");
}

/** @param {unknown} field @param {string} fallback */
function titleizeFieldName(field, fallback) {
  const normalized = String(field || "").trim();

  if (!normalized) {
    return fallback;
  }

  return `${normalized
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())} updated`;
}

/** @param {unknown} value @param {number} [maxLength] */
function truncateSnippet(value, maxLength = 120) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trimEnd()}...` : normalized;
}

/** @param {EventSummaryInput} event */
function safeRecordLabel(event) {
  const next = objectValue(event?.new_value);
  const previous = objectValue(event?.previous_value);
  // Raw record ids are identifiers, not labels: they must never reach
  // user-facing summary copy, so there is deliberately no record_id fallback.
  return String(
    event?.record_label ||
    event?.recordLabel ||
    event?.metadata?.record_label ||
    event?.metadata?.recordLabel ||
    next.title ||
    next.name ||
    previous.title ||
    previous.name ||
    "",
  ).replace(/\s+/g, " ").trim();
}

/** @param {EventSummaryInput} event */
function eventActionType(event) {
  return String(event?.name || event?.event || "")
    .split(".")
    .filter(Boolean)
    .at(-1) || "";
}

/** @param {EventSummaryInput} event */
function safeActor(event) {
  const userId = String(event?.actor_user_id || event?.actorUserId || "").trim();
  const username = String(event?.actor_user_name || event?.actorUserName || "").trim();

  if (!userId && !username) {
    return null;
  }

  return {
    userId,
    username,
  };
}

/** @param {unknown} value */
function safeUrl(value) {
  const url = String(value || "").trim();

  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return "";
  }

  return url;
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

export {
  buildEventChangedContext,
  descriptionChangeLabel,
  normalizeChangedFields,
  readChangedFields,
  summarizeActivityEvent,
  summarizeEventContext,
  summarizeNotificationEvent,
  taskUpdatedLabel,
};
