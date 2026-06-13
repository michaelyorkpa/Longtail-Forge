import { modulesService } from "../modules/modules.service.js";

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

function summarizeNotificationEvent(event) {
  const summary = findEventSummary(event, "notification");
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

function findEventSummary(event, kind) {
  const eventName = event?.name || event?.event || "";
  const moduleId = event?.module_id || event?.moduleId || "";

  return modulesService.listModuleEventSummaries()
    .find((summary) => summary.event === eventName && (!summary.moduleId || summary.moduleId === moduleId))?.[kind] || null;
}

function readSummaryValue(value, event) {
  if (typeof value === "function") {
    return String(value({ event }) || "").trim();
  }

  return String(value || "").trim();
}

function readRecipientHints(value, event) {
  const resolved = typeof value === "function" ? value({ event }) : value;

  if (!Array.isArray(resolved)) {
    return [];
  }

  return resolved
    .map((hint) => String(hint || "").trim())
    .filter(Boolean);
}

function fallbackLabel(event) {
  return String(event?.name || "Event")
    .split(".")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).replaceAll("_", " "))
    .join(" ");
}

function fallbackSummary(event) {
  const recordLabel = safeRecordLabel(event) || "record";

  return `${fallbackLabel(event)} for ${recordLabel}.`;
}

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

function taskChangedContextLabel(field, previousValue, newValue) {
  if (field === "description") {
    return descriptionChangeLabel(previousValue, newValue)
      .replace("Added", "added")
      .replace("Removed", "removed")
      .replace("Updated", "updated");
  }

  return TASK_UPDATE_CONTEXT_LABELS.get(field) || "Task updated";
}

function readableTaskChangedValue(field, newValue) {
  if (["description", "title", "status", "priority", "due_date", "due_time", "due_at_utc"].includes(field)) {
    return truncateSnippet(newValue?.[field]);
  }

  return "";
}

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

function descriptionChangeLabel(previousValue, newValue) {
  const previousDescription = String(previousValue?.description || "").trim();
  const nextDescription = String(newValue?.description || "").trim();

  if (!previousDescription && nextDescription) {
    return "Description Added";
  }

  if (previousDescription && !nextDescription) {
    return "Description Removed";
  }

  return "Description Updated";
}

function readChangedFields(previousValue, newValue) {
  return TASK_UPDATE_FIELD_ORDER.filter((field) => !sameSummaryFieldValue(previousValue?.[field], newValue?.[field]));
}

function sameSummaryFieldValue(left, right) {
  return JSON.stringify(normalizeSummaryFieldValue(left)) === JSON.stringify(normalizeSummaryFieldValue(right));
}

function normalizeSummaryFieldValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).sort();
  }

  return value ?? "";
}

function normalizeChangedFields(value) {
  const fields = Array.isArray(value) ? value : [];

  return new Set(fields.map((field) => String(field || "").trim()).filter(Boolean));
}

function changedFieldLabel(event, field) {
  if ((event?.name || event?.event) === "task.updated") {
    return TASK_UPDATE_FIELD_LABELS.get(field) || titleizeFieldName(field, "Task Updated");
  }

  return titleizeFieldName(field, "Record Updated");
}

function titleizeFieldName(field, fallback) {
  const normalized = String(field || "").trim();

  if (!normalized) {
    return fallback;
  }

  return `${normalized
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())} updated`;
}

function truncateSnippet(value, maxLength = 120) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trimEnd()}...` : normalized;
}

function safeRecordLabel(event) {
  return String(
    event?.record_label ||
    event?.recordLabel ||
    event?.metadata?.record_label ||
    event?.metadata?.recordLabel ||
    event?.new_value?.title ||
    event?.new_value?.name ||
    event?.previous_value?.title ||
    event?.previous_value?.name ||
    event?.record_id ||
    "",
  ).replace(/\s+/g, " ").trim();
}

function eventActionType(event) {
  return String(event?.name || event?.event || "")
    .split(".")
    .filter(Boolean)
    .at(-1) || "";
}

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

function safeUrl(value) {
  const url = String(value || "").trim();

  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return "";
  }

  return url;
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
