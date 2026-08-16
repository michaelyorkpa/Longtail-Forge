/** @typedef {import("../../types/framework-contracts.d.ts").InternalEvent} InternalEvent */
/** @typedef {import("../../types/framework-contracts.d.ts").EventSummaryResolverContext} EventSummaryResolverContext */

/** @param {EventSummaryResolverContext} context */
function taskNotificationTitle({ event }) {
  return event.new_value?.title || event.previous_value?.title || event.record_id || "Task";
}

/** @param {EventSummaryResolverContext} context */
function taskDueSoonNotificationTitle({ event }) {
  const offsetLabel = taskReminderOffsetLabel(event.metadata?.offset_minutes);
  const title = taskNotificationTitle({ event });

  return offsetLabel ? `Due in ${offsetLabel}: ${title}` : title;
}

/** @param {EventSummaryResolverContext} context */
function taskDueSoonNotificationBody({ event }) {
  const offsetLabel = taskReminderOffsetLabel(event.metadata?.offset_minutes);
  const title = taskNotificationTitle({ event });

  return offsetLabel
    ? `Task "${title}" is due in ${offsetLabel}.`
    : `Task "${title}" is due soon.`;
}

/** @param {unknown} offsetMinutes */
function taskReminderOffsetLabel(offsetMinutes) {
  const minutes = Number(offsetMinutes);

  if (!Number.isFinite(minutes)) {
    return "";
  }

  if (minutes <= 0) {
    return "now";
  }

  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** @param {InternalEvent} event @param {string} reason */
async function markTaskActivityFromEvent(event, reason) {
  const taskId = taskIdFromActivityEvent(event);
  const workspaceId = event.workspace_id || event.session?.workspace_id || "";

  if (!workspaceId || !taskId) {
    return;
  }

  const [{ tasksRepository }, { searchIndexSyncService }] = await Promise.all([
    import("./tasks.repo.js"),
    import("../../services/search-index-sync.service.js"),
  ]);
  await tasksRepository.markWorkedAt(workspaceId, taskId, event.emitted_at || new Date().toISOString(), event.actor_user_id || "");
  await searchIndexSyncService.reindexRecord({
    workspaceId,
    moduleId: "tasks",
    recordType: "task",
    recordId: taskId,
    reason,
  });
}

/** @param {InternalEvent} event @returns {string} */
function taskIdFromActivityEvent(event = { name: "" }) {
  const metadata = event.metadata || {};

  if (metadata.module_id === "tasks" && metadata.target_type === "task") {
    return String(metadata.target_id || "");
  }

  if (event.module_id === "tasks" && event.record_type === "task") {
    return event.record_id || "";
  }

  return String(metadata.task_id || "");
}

/** @type {{ hooks: { events: import("../../types/framework-contracts.d.ts").ModuleEventHookContribution[] }, eventTypes: import("../../types/framework-contracts.d.ts").EventTypeContribution[], eventSummaries: import("../../types/framework-contracts.d.ts").EventSummaryDeclaration[], notificationEvents: import("../../types/framework-contracts.d.ts").NotificationEventContribution[], notificationFollowTargets: import("../../types/framework-contracts.d.ts").NotificationFollowTargetContribution[] }} */
const tasksEvents = {
  hooks: {
      events: [
        {
          id: "tasks-file-attachment-activity",
          event: "file.attachment.created",
          handler: async ({ event }) => markTaskActivityFromEvent(event, "task.file_attachment_created"),
        },
        {
          id: "tasks-file-attachment-removed-activity",
          event: "file.attachment.removed",
          handler: async ({ event }) => markTaskActivityFromEvent(event, "task.file_attachment_removed"),
        },
        {
          id: "tasks-file-attachment-context-updated-activity",
          event: "file.attachment.context_updated",
          handler: async ({ event }) => markTaskActivityFromEvent(event, "task.file_attachment_context_updated"),
        },
        {
          id: "tasks-linked-note-created-activity",
          event: "note.created",
          handler: async ({ event }) => markTaskActivityFromEvent(event, "task.linked_note_created"),
        },
        {
          id: "tasks-linked-note-updated-activity",
          event: "note.updated",
          handler: async ({ event }) => markTaskActivityFromEvent(event, "task.linked_note_updated"),
        },
      ],
    },
  eventTypes: [
      {
        event: "task.created",
        moduleId: "tasks",
        label: "Task Created",
        description: "Emitted after a task is created.",
        recordType: "task",
      },
      {
        event: "task.updated",
        moduleId: "tasks",
        label: "Task Updated",
        description: "Emitted after a task is updated or reopened.",
        recordType: "task",
      },
      {
        event: "task.assigned",
        moduleId: "tasks",
        label: "Task Assigned",
        description: "Emitted after task assignees change.",
        recordType: "task",
      },
      {
        event: "task.completed",
        moduleId: "tasks",
        label: "Task Completed",
        description: "Emitted after a task is completed.",
        recordType: "task",
      },
      {
        event: "task.archived",
        moduleId: "tasks",
        label: "Task Archived",
        description: "Emitted after a task is archived.",
        recordType: "task",
      },
      {
        event: "task.restored",
        moduleId: "tasks",
        label: "Task Restored",
        description: "Emitted after a task is restored from the archive.",
        recordType: "task",
      },
      {
        event: "task.due_soon",
        moduleId: "tasks",
        label: "Task Due Soon",
        description: "Emitted by task reminder jobs when a task is due soon.",
        recordType: "task",
      },
      {
        event: "task.overdue",
        moduleId: "tasks",
        label: "Task Overdue",
        description: "Reserved notification event for future task overdue checks.",
        recordType: "task",
      },
      {
        event: "task.checklist_item.created",
        moduleId: "tasks",
        label: "Task Checklist Item Created",
        description: "Emitted after a checklist item is added to a task.",
        recordType: "task_checklist_item",
      },
      {
        event: "task.checklist_item.updated",
        moduleId: "tasks",
        label: "Task Checklist Item Updated",
        description: "Emitted after a task checklist item label or state changes.",
        recordType: "task_checklist_item",
      },
      {
        event: "task.checklist_item.checked",
        moduleId: "tasks",
        label: "Task Checklist Item Checked",
        description: "Emitted after a task checklist item is checked.",
        recordType: "task_checklist_item",
      },
      {
        event: "task.checklist_item.unchecked",
        moduleId: "tasks",
        label: "Task Checklist Item Unchecked",
        description: "Emitted after a task checklist item is unchecked.",
        recordType: "task_checklist_item",
      },
      {
        event: "task.checklist_item.deleted",
        moduleId: "tasks",
        label: "Task Checklist Item Deleted",
        description: "Emitted after a task checklist item is removed.",
        recordType: "task_checklist_item",
      },
      {
        event: "task.checklist_items.reordered",
        moduleId: "tasks",
        label: "Task Checklist Items Reordered",
        description: "Emitted after task checklist item order changes.",
        recordType: "task_checklist_item",
      },
      {
        event: "task.relationship.created",
        moduleId: "tasks",
        label: "Task Relationship Created",
        description: "Emitted after a parent/child task relationship is created.",
        recordType: "task_relationship",
      },
      {
        event: "task.relationship.updated",
        moduleId: "tasks",
        label: "Task Relationship Updated",
        description: "Emitted after a parent/child task relationship changes.",
        recordType: "task_relationship",
      },
      {
        event: "task.relationship.removed",
        moduleId: "tasks",
        label: "Task Relationship Removed",
        description: "Emitted after a parent/child task relationship is removed.",
        recordType: "task_relationship",
      },
      {
        event: "task.linked_notes.propagated",
        moduleId: "tasks",
        label: "Task Recurring Linked Notes Propagated",
        description: "Emitted after linked Note relationships are propagated to a recurring task occurrence.",
        recordType: "task",
      },
    ],
  eventSummaries: [
      {
        event: "task.created",
        moduleId: "tasks",
        activity: {
          label: "Task Created",
          summary: ({ event }) => `Created task "${event.new_value?.title || event.record_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
        },
        notification: {
          title: taskNotificationTitle,
          body: ({ event }) => `Task "${event.new_value?.title || event.record_id || "Task"}" was created.`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
          recipientHints: ["assignees"],
        },
      },
      {
        event: "task.updated",
        moduleId: "tasks",
        activity: {
          label: "Task Updated",
          summary: ({ event }) => `Updated task "${event.new_value?.title || event.record_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
        },
        notification: {
          title: taskNotificationTitle,
          body: ({ event }) => `Task "${event.new_value?.title || event.record_id || "Task"}" was updated.`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
          recipientHints: ["assignees"],
        },
      },
      {
        event: "task.assigned",
        moduleId: "tasks",
        activity: {
          label: "Task Assigned",
          summary: ({ event }) => `Updated assignees for task "${event.new_value?.title || event.record_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
        },
        notification: {
          title: taskNotificationTitle,
          body: ({ event }) => `Task "${event.new_value?.title || event.record_id || "Task"}" was assigned.`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
          recipientHints: ["assignees"],
        },
      },
      {
        event: "task.completed",
        moduleId: "tasks",
        activity: {
          label: "Task Completed",
          summary: ({ event }) => `Completed task "${event.new_value?.title || event.record_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
        },
        notification: {
          title: taskNotificationTitle,
          body: ({ event }) => `Task "${event.new_value?.title || event.record_id || "Task"}" was completed.`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
          recipientHints: ["assignees"],
        },
      },
      {
        event: "task.archived",
        moduleId: "tasks",
        activity: {
          label: "Task Archived",
          summary: ({ event }) => `Archived task "${event.new_value?.title || event.record_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
        },
        notification: {
          title: taskNotificationTitle,
          body: ({ event }) => `Task "${event.new_value?.title || event.record_id || "Task"}" was archived.`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
          recipientHints: ["assignees"],
        },
      },
      {
        event: "task.restored",
        moduleId: "tasks",
        activity: {
          label: "Task Restored",
          summary: ({ event }) => `Restored task "${event.new_value?.title || event.record_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
        },
        notification: {
          title: taskNotificationTitle,
          body: ({ event }) => `Task "${event.new_value?.title || event.record_id || "Task"}" was restored.`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
          recipientHints: ["assignees"],
        },
      },
      {
        event: "task.due_soon",
        moduleId: "tasks",
        notification: {
          title: taskDueSoonNotificationTitle,
          body: taskDueSoonNotificationBody,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
          recipientHints: ["assignees"],
        },
      },
      {
        event: "task.overdue",
        moduleId: "tasks",
        notification: {
          title: taskNotificationTitle,
          body: ({ event }) => `Task "${event.new_value?.title || event.record_id || "Task"}" is overdue.`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
          recipientHints: ["assignees"],
        },
      },
      {
        event: "task.checklist_item.created",
        moduleId: "tasks",
        activity: {
          label: "Task Checklist Updated",
          summary: ({ event }) => `Added checklist item to task "${event.metadata?.task_title || event.metadata?.task_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(String(event.metadata?.task_id || ""))}`,
        },
      },
      {
        event: "task.checklist_item.updated",
        moduleId: "tasks",
        activity: {
          label: "Task Checklist Updated",
          summary: ({ event }) => `Updated checklist item for task "${event.metadata?.task_title || event.metadata?.task_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(String(event.metadata?.task_id || ""))}`,
        },
      },
      {
        event: "task.checklist_item.checked",
        moduleId: "tasks",
        activity: {
          label: "Task Checklist Progress",
          summary: ({ event }) => `Checked checklist item for task "${event.metadata?.task_title || event.metadata?.task_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(String(event.metadata?.task_id || ""))}`,
        },
      },
      {
        event: "task.checklist_item.unchecked",
        moduleId: "tasks",
        activity: {
          label: "Task Checklist Progress",
          summary: ({ event }) => `Unchecked checklist item for task "${event.metadata?.task_title || event.metadata?.task_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(String(event.metadata?.task_id || ""))}`,
        },
      },
      {
        event: "task.checklist_item.deleted",
        moduleId: "tasks",
        activity: {
          label: "Task Checklist Updated",
          summary: ({ event }) => `Removed checklist item from task "${event.metadata?.task_title || event.metadata?.task_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(String(event.metadata?.task_id || ""))}`,
        },
      },
      {
        event: "task.checklist_items.reordered",
        moduleId: "tasks",
        activity: {
          label: "Task Checklist Reordered",
          summary: ({ event }) => `Reordered checklist items for task "${event.metadata?.task_title || event.metadata?.task_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(String(event.metadata?.task_id || ""))}`,
        },
      },
      {
        event: "task.relationship.created",
        moduleId: "tasks",
        activity: {
          label: "Task Relationship Added",
          summary: ({ event }) => `Linked child task "${event.metadata?.child_title || event.metadata?.child_task_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(String(event.metadata?.parent_task_id || ""))}`,
        },
      },
      {
        event: "task.relationship.updated",
        moduleId: "tasks",
        activity: {
          label: "Task Relationship Updated",
          summary: ({ event }) => `Updated child task relationship for "${event.metadata?.child_title || event.metadata?.child_task_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(String(event.metadata?.parent_task_id || ""))}`,
        },
      },
      {
        event: "task.relationship.removed",
        moduleId: "tasks",
        activity: {
          label: "Task Relationship Removed",
          summary: ({ event }) => `Removed child task relationship for "${event.metadata?.child_title || event.metadata?.child_task_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(String(event.metadata?.parent_task_id || ""))}`,
        },
      },
      {
        event: "task.linked_notes.propagated",
        moduleId: "tasks",
        activity: {
          label: "Recurring Linked Notes Propagated",
          summary: ({ event }) => `Propagated ${event.metadata?.note_link_count || 0} linked note(s) for "${event.new_value?.title || event.record_id || "Task"}".`,
          url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.record_id || "")}`,
        },
      },
    ],
  notificationEvents: [
      {
        id: "task.created",
        moduleId: "tasks",
        label: "Task Created",
        description: "Notifies task assignees when a task is created.",
        defaultEnabled: true,
        defaultPriority: "normal",
        recipientMode: "assignees",
      },
      {
        id: "task.updated",
        moduleId: "tasks",
        label: "Task Updated",
        description: "Notifies task assignees when a task is updated.",
        defaultEnabled: true,
        defaultPriority: "normal",
        recipientMode: "assignees",
      },
      {
        id: "task.assigned",
        moduleId: "tasks",
        label: "Task Assigned",
        description: "Notifies task assignees when assignees change.",
        defaultEnabled: true,
        defaultPriority: "normal",
        recipientMode: "assignees",
      },
      {
        id: "task.completed",
        moduleId: "tasks",
        label: "Task Completed",
        description: "Notifies task assignees when a task is completed.",
        defaultEnabled: true,
        defaultPriority: "normal",
        recipientMode: "assignees",
      },
      {
        id: "task.archived",
        moduleId: "tasks",
        label: "Task Archived",
        description: "Notifies task assignees when a task is archived.",
        defaultEnabled: true,
        defaultPriority: "normal",
        recipientMode: "assignees",
      },
      {
        id: "task.restored",
        moduleId: "tasks",
        label: "Task Restored",
        description: "Notifies task assignees when a task is restored.",
        defaultEnabled: true,
        defaultPriority: "normal",
        recipientMode: "assignees",
      },
      {
        id: "task.due_soon",
        moduleId: "tasks",
        label: "Task Due Soon",
        description: "Notifies responsible task users when a task reminder is due.",
        defaultEnabled: true,
        defaultPriority: "high",
        recipientMode: "assignees",
      },
      {
        id: "task.overdue",
        moduleId: "tasks",
        label: "Task Overdue",
        description: "Notifies task assignees when a task is overdue.",
        defaultEnabled: true,
        defaultPriority: "urgent",
        recipientMode: "assignees",
      },
    ],
  notificationFollowTargets: [
      {
        targetType: "task",
        moduleId: "tasks",
        label: "Task",
        description: "Allows a user to follow one task and receive notifications for task events on that target.",
        requiredReadPermission: "tasks.view",
        eventTypes: [
          "task.updated",
          "task.assigned",
          "task.completed",
          "task.archived",
          "task.restored",
          "task.due_soon",
          "task.overdue",
        ],
      },
    ],
};

export { tasksEvents };
