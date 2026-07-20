import { NOTE_EVENT_TYPES, NOTE_PERMISSIONS } from "./access-policy.js";

function noteNotificationTitle({ event }) {
  return event.new_value?.title || event.previous_value?.title || event.metadata?.title || event.record_id || "Note";
}

const notesEvents = {
  eventTypes: NOTE_EVENT_TYPES,
  eventSummaries: [
      {
        event: "note.updated",
        moduleId: "notes",
        activity: {
          label: "Note Updated",
          summary: ({ event }) => `Updated note "${event.new_value?.title || event.previous_value?.title || event.record_id || "Note"}".`,
          url: ({ event }) => `notes.html?note=${encodeURIComponent(event.record_id || "")}`,
        },
        notification: {
          title: noteNotificationTitle,
          body: ({ event }) => `Note "${event.new_value?.title || event.previous_value?.title || event.record_id || "Note"}" was updated.`,
          url: ({ event }) => `notes.html?note=${encodeURIComponent(event.record_id || "")}`,
          recipientHints: [],
        },
      },
      {
        event: "note.archived",
        moduleId: "notes",
        activity: {
          label: "Note Archived",
          summary: ({ event }) => `Archived note "${event.new_value?.title || event.previous_value?.title || event.record_id || "Note"}".`,
          url: ({ event }) => `notes.html?note=${encodeURIComponent(event.record_id || "")}`,
        },
        notification: {
          title: noteNotificationTitle,
          body: ({ event }) => `Note "${event.new_value?.title || event.previous_value?.title || event.record_id || "Note"}" was archived.`,
          url: ({ event }) => `notes.html?note=${encodeURIComponent(event.record_id || "")}`,
          recipientHints: [],
        },
      },
      {
        event: "note.restored",
        moduleId: "notes",
        activity: {
          label: "Note Restored",
          summary: ({ event }) => `Restored note "${event.new_value?.title || event.previous_value?.title || event.record_id || "Note"}".`,
          url: ({ event }) => `notes.html?note=${encodeURIComponent(event.record_id || "")}`,
        },
        notification: {
          title: noteNotificationTitle,
          body: ({ event }) => `Note "${event.new_value?.title || event.previous_value?.title || event.record_id || "Note"}" was restored.`,
          url: ({ event }) => `notes.html?note=${encodeURIComponent(event.record_id || "")}`,
          recipientHints: [],
        },
      },
      {
        event: "note.linked",
        moduleId: "notes",
        activity: {
          label: "Note Linked",
          summary: ({ event }) => `Linked context changed for note "${event.new_value?.title || event.previous_value?.title || event.record_id || "Note"}".`,
          url: ({ event }) => `notes.html?note=${encodeURIComponent(event.record_id || "")}`,
        },
        notification: {
          title: noteNotificationTitle,
          body: ({ event }) => `Linked context changed for note "${event.new_value?.title || event.previous_value?.title || event.record_id || "Note"}".`,
          url: ({ event }) => `notes.html?note=${encodeURIComponent(event.record_id || "")}`,
          recipientHints: [],
        },
      },
      {
        event: "note.unlinked",
        moduleId: "notes",
        activity: {
          label: "Note Unlinked",
          summary: ({ event }) => `Linked context changed for note "${event.new_value?.title || event.previous_value?.title || event.record_id || "Note"}".`,
          url: ({ event }) => `notes.html?note=${encodeURIComponent(event.record_id || "")}`,
        },
        notification: {
          title: noteNotificationTitle,
          body: ({ event }) => `Linked context changed for note "${event.new_value?.title || event.previous_value?.title || event.record_id || "Note"}".`,
          url: ({ event }) => `notes.html?note=${encodeURIComponent(event.record_id || "")}`,
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
