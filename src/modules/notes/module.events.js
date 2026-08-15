// @ts-check
import { NOTE_EVENT_TYPES, NOTE_PERMISSIONS } from "./access-policy.js";

/** @typedef {import("../../types/framework-contracts.js").EventSummaryResolverContext} EventSummaryResolverContext */

/** @param {unknown} value */
function readEventTitle(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") return "";
  return "title" in value && typeof value.title === "string" ? value.title : "";
}

/** @param {EventSummaryResolverContext} context */
function noteEventTitle({ event }) {
  return readEventTitle(event.new_value) || readEventTitle(event.previous_value) || readEventTitle(event.metadata) || event.record_id || "Note";
}

/** @param {import("../../types/framework-contracts.js").EventSummaryResolverContext} context */
function noteNotificationTitle({ event }) {
  return noteEventTitle({ event });
}

/** @param {EventSummaryResolverContext} context */
function noteEventUrl({ event }) {
  return `notes.html?note=${encodeURIComponent(event.record_id || "")}`;
}

/** @param {string} action @param {EventSummaryResolverContext} context */
function noteActivitySummary(action, context) {
  return `${action} note "${noteEventTitle(context)}".`;
}

/** @param {string} action @param {EventSummaryResolverContext} context */
function noteNotificationBody(action, context) {
  return `Note "${noteEventTitle(context)}" was ${action}.`;
}

/** @param {EventSummaryResolverContext} context */
function linkedContextSummary(context) {
  return `Linked context changed for note "${noteEventTitle(context)}".`;
}

/** @type {Pick<import("../../types/framework-contracts.js").ModuleManifest, "eventTypes" | "eventSummaries" | "hooks" | "notificationEvents" | "notificationFollowTargets">} */
const notesEvents = {
  eventTypes: NOTE_EVENT_TYPES,
  eventSummaries: [
      {
        event: "note.updated",
        moduleId: "notes",
        activity: {
          label: "Note Updated",
          summary: /** @param {EventSummaryResolverContext} context */ (context) => noteActivitySummary("Updated", context),
          url: /** @param {EventSummaryResolverContext} context */ (context) => noteEventUrl(context),
        },
        notification: {
          title: noteNotificationTitle,
          body: /** @param {EventSummaryResolverContext} context */ (context) => noteNotificationBody("updated", context),
          url: /** @param {EventSummaryResolverContext} context */ (context) => noteEventUrl(context),
          recipientHints: [],
        },
      },
      {
        event: "note.archived",
        moduleId: "notes",
        activity: {
          label: "Note Archived",
          summary: /** @param {EventSummaryResolverContext} context */ (context) => noteActivitySummary("Archived", context),
          url: /** @param {EventSummaryResolverContext} context */ (context) => noteEventUrl(context),
        },
        notification: {
          title: noteNotificationTitle,
          body: /** @param {EventSummaryResolverContext} context */ (context) => noteNotificationBody("archived", context),
          url: /** @param {EventSummaryResolverContext} context */ (context) => noteEventUrl(context),
          recipientHints: [],
        },
      },
      {
        event: "note.restored",
        moduleId: "notes",
        activity: {
          label: "Note Restored",
          summary: /** @param {EventSummaryResolverContext} context */ (context) => noteActivitySummary("Restored", context),
          url: /** @param {EventSummaryResolverContext} context */ (context) => noteEventUrl(context),
        },
        notification: {
          title: noteNotificationTitle,
          body: /** @param {EventSummaryResolverContext} context */ (context) => noteNotificationBody("restored", context),
          url: /** @param {EventSummaryResolverContext} context */ (context) => noteEventUrl(context),
          recipientHints: [],
        },
      },
      {
        event: "note.linked",
        moduleId: "notes",
        activity: {
          label: "Note Linked",
          summary: /** @param {EventSummaryResolverContext} context */ (context) => linkedContextSummary(context),
          url: /** @param {EventSummaryResolverContext} context */ (context) => noteEventUrl(context),
        },
        notification: {
          title: noteNotificationTitle,
          body: /** @param {EventSummaryResolverContext} context */ (context) => linkedContextSummary(context),
          url: /** @param {EventSummaryResolverContext} context */ (context) => noteEventUrl(context),
          recipientHints: [],
        },
      },
      {
        event: "note.unlinked",
        moduleId: "notes",
        activity: {
          label: "Note Unlinked",
          summary: /** @param {EventSummaryResolverContext} context */ (context) => linkedContextSummary(context),
          url: /** @param {EventSummaryResolverContext} context */ (context) => noteEventUrl(context),
        },
        notification: {
          title: noteNotificationTitle,
          body: /** @param {EventSummaryResolverContext} context */ (context) => linkedContextSummary(context),
          url: /** @param {EventSummaryResolverContext} context */ (context) => noteEventUrl(context),
          recipientHints: [],
        },
      },
    ],
  hooks: { events: [] },
  notificationEvents: [
      {
        id: "note.updated",
        moduleId: "notes",
        label: "Note Updated",
        description: "Notifies note owners and followers when another user updates a non-secure note.",
        defaultEnabled: true,
        defaultPriority: "normal",
        recipientMode: "explicit_users",
        suppressActorSubscriptions: true,
      },
      {
        id: "note.archived",
        moduleId: "notes",
        label: "Note Archived",
        description: "Notifies followers when another user archives a non-secure note.",
        defaultEnabled: true,
        defaultPriority: "normal",
        recipientMode: "explicit_users",
        suppressActorSubscriptions: true,
      },
      {
        id: "note.restored",
        moduleId: "notes",
        label: "Note Restored",
        description: "Notifies followers when another user restores a non-secure note.",
        defaultEnabled: true,
        defaultPriority: "normal",
        recipientMode: "explicit_users",
        suppressActorSubscriptions: true,
      },
      {
        id: "note.linked",
        moduleId: "notes",
        label: "Note Linked",
        description: "Notifies followers when another user adds linked context to a non-secure note.",
        defaultEnabled: true,
        defaultPriority: "normal",
        recipientMode: "explicit_users",
        suppressActorSubscriptions: true,
      },
      {
        id: "note.unlinked",
        moduleId: "notes",
        label: "Note Unlinked",
        description: "Notifies followers when another user removes linked context from a non-secure note.",
        defaultEnabled: true,
        defaultPriority: "normal",
        recipientMode: "explicit_users",
        suppressActorSubscriptions: true,
      },
    ],
  notificationFollowTargets: [
      {
        targetType: "note",
        moduleId: "notes",
        label: "Note",
        description: "Allows a user to follow one note and receive notifications for meaningful non-secure note changes.",
        requiredReadPermission: NOTE_PERMISSIONS.VIEW,
        eventTypes: [
          "note.updated",
          "note.archived",
          "note.restored",
          "note.linked",
          "note.unlinked",
        ],
      },
    ],
};

export { notesEvents };
