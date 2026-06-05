import { modulesService } from "../modules/modules.service.js";

function summarizeActivityEvent(event) {
  const summary = findEventSummary(event, "activity");

  return {
    event: event.name,
    moduleId: event.module_id || "",
    recordType: event.record_type || "",
    recordId: event.record_id || "",
    label: readSummaryValue(summary?.label, event) || fallbackLabel(event),
    summary: readSummaryValue(summary?.summary, event) || fallbackSummary(event),
    url: safeUrl(readSummaryValue(summary?.url, event) || event.metadata?.record_url || ""),
  };
}

function summarizeNotificationEvent(event) {
  const summary = findEventSummary(event, "notification");

  return {
    event: event.name,
    moduleId: event.module_id || "",
    recordType: event.record_type || "",
    recordId: event.record_id || "",
    title: readSummaryValue(summary?.title, event) || fallbackLabel(event),
    body: readSummaryValue(summary?.body, event) || fallbackSummary(event),
    url: safeUrl(readSummaryValue(summary?.url, event) || event.metadata?.record_url || ""),
    recipientHints: readRecipientHints(summary?.recipientHints, event),
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
  const recordLabel = event?.new_value?.title ||
    event?.new_value?.name ||
    event?.previous_value?.title ||
    event?.previous_value?.name ||
    event?.record_id ||
    "record";

  return `${fallbackLabel(event)} for ${recordLabel}.`;
}

function safeUrl(value) {
  const url = String(value || "").trim();

  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return "";
  }

  return url;
}

export {
  summarizeActivityEvent,
  summarizeNotificationEvent,
};

