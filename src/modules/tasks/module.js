import { tasksRoutes } from "./tasks.routes.js";
import { tasksPublicApiRoutes } from "./public-api.routes.js";
import { registerTasksSearchIndexers } from "./search-indexers.js";
import { LINKED_CONTEXT_TARGET_RESPONSE_CONTRACT } from "../../core/linked-context/provider-contract.js";

registerTasksSearchIndexers();

function taskNotificationTitle({ event }) {
  return event.new_value?.title || event.previous_value?.title || event.record_id || "Task";
}

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

function taskIdFromActivityEvent(event = {}) {
  const metadata = event.metadata || {};

  if (metadata.module_id === "tasks" && metadata.target_type === "task") {
    return metadata.target_id || "";
  }

  if (event.module_id === "tasks" && event.record_type === "task") {
    return event.record_id || "";
  }

  return metadata.task_id || "";
}

const tasksModule = {
  id: "tasks",
  name: "Tasks",
  displayName: "Tasks",
  description: "Workspace, client, and project task tracking with scoped assignment and due-date foundations.",
  terminology: {
    default: {
      label: "Tasks",
      singular: "Task",
      plural: "Tasks",
      navigationLabel: "Tasks",
      createButton: "Create Task",
      emptyState: "No tasks found.",
    },
  },
  category: "core-workflow",
  version: "0.33.5.18.13.3",
  enabledByDefault: true,
  canDisable: true,
  historicalReadAccess: true,
  browserApiRoutes: [tasksRoutes],
  publicApiRoutes: [tasksPublicApiRoutes],
  browserAssetsDir: new URL("../../../public/js/", import.meta.url),
  migrationsDir: null,
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
  protectedViewsDir: new URL("../../../views/protected/", import.meta.url),
  seedHooks: [],
  repairHooks: [],
  navigation: [
    { label: "Tasks", href: "tasks.html", parent: "projects.html", counts: ["overdue", "dueSoon"] },
  ],
  protectedViews: [
    {
      id: "tasks",
      path: "/tasks.html",
      moduleId: "tasks",
      file: "tasks.html",
      requiredPermissions: ["tasks.view"],
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
      allowDisabledRead: true,
    },
    {
      id: "tasks-settings",
      path: "/tasks-settings.html",
      moduleId: "tasks",
      file: "tasks-settings.html",
      requiredPermissions: ["workspace_settings.manage"],
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
    },
  ],
  publicViews: [],
  viewSurfaces: [
    {
      id: "tasks.workspace",
      moduleId: "tasks",
      viewId: "tasks",
      layout: "slide-out-sidebar",
      sidebarLabel: "Task filters",
      pageHeader: {
        title: "Tasks",
        titleKey: "label",
        primaryAction: {
          id: "create-task",
          label: "Add Task",
          labelKey: "createButton",
          role: "primary",
          behavior: "tasks.create",
          requiredPermissions: ["tasks.create"],
        },
      },
      sidebarPanels: [
        {
          id: "tasks-view-selector",
          type: "navigation",
          title: "Saved Task Views",
          behavior: "tasks.sidebar.view-selector",
          collapsible: false,
          className: "tasks-view-selector-panel",
          ariaLabel: "Saved task views",
        },
        {
          id: "tasks-filters",
          type: "navigation",
          title: "Sorting and Filters",
          behavior: "tasks.sidebar.filters",
          open: false,
          className: "tasks-filters-panel",
          ariaLabel: "Sorting and task filters",
        },
      ],
      detail: {
        regions: [
          {
            id: "tasks-main-list",
            behavior: "tasks.main.list",
            className: "tasks-main-list-region",
            ariaLabel: "Task list",
          },
        ],
      },
      dataSource: {
        route: "/api/tasks",
        method: "GET",
        fieldBindings: {
          id: "task_id",
          title: "title",
          status: "status",
          priority: "priority",
          dueDate: "due_date",
          dueTime: "due_time",
          assignees: "assignee_names",
        },
      },
    },
  ],
  browserAssets: [
    {
      id: "tasks-dialog-script",
      moduleId: "tasks",
      path: "/js/task-dialog.js",
      type: "script",
      views: ["tasks", "workbench"],
      requiredPermissions: ["tasks.view"],
    },
    {
      id: "tasks-script",
      moduleId: "tasks",
      path: "/js/tasks.js",
      type: "script",
      views: ["tasks"],
      requiredPermissions: ["tasks.view"],
    },
    {
      id: "tasks-module-settings-script",
      moduleId: "tasks",
      path: "/js/module-settings.js",
      type: "script",
      views: ["tasks-settings"],
      requiredPermissions: ["workspace_settings.manage"],
    },
  ],
  dashboard: [
    {
      id: "task-summary",
      label: "Task Summary",
      description: "Task counts and short task lists for the dashboard.",
      renderer: "task-summary",
      moduleId: "tasks",
      counts: ["overdue", "dueSoon", "assignedToMe"],
      links: ["overdue", "dueSoon", "assignedToMe"],
      requiredPermissions: ["tasks.view"],
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
      requiresEnabledModules: ["tasks"],
      sortOrder: 30,
    },
  ],
  workbench: [
    {
      id: "task-workbench-items",
      label: "Tasks",
      description: "Active task work items and task timer actions.",
      renderer: "task-workbench-items",
      moduleId: "tasks",
      sourceType: "task",
      listRoute: "/api/tasks/workbench-items",
      requiredPermissions: ["tasks.view"],
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
      requiresEnabledModules: ["tasks"],
      actions: [
        { id: "open", label: "Open Task", route: "tasks.html?task=:taskId" },
        { id: "start-timer", label: "Start Timer", route: "/api/tasks/:taskId/timer" },
        { id: "pause-timer", label: "Pause Timer", route: "/api/tasks/:taskId/timer" },
        { id: "finalize-timer", label: "Save & End", route: "/api/tasks/:taskId/timer/finalize" },
      ],
      defaultCollapsed: false,
      sortOrder: 20,
    },
  ],
  reporting: [],
  publicApiEndpoints: [
    { method: "GET", path: "/api/v1/tasks", scope: "tasks:read" },
    { method: "GET", path: "/api/v1/tasks/:taskId", scope: "tasks:read" },
    { method: "POST", path: "/api/v1/tasks", scope: "tasks:write" },
    { method: "PUT", path: "/api/v1/tasks/:taskId", scope: "tasks:write" },
    { method: "POST", path: "/api/v1/tasks/:taskId/complete", scope: "tasks:write" },
    { method: "POST", path: "/api/v1/tasks/:taskId/reopen", scope: "tasks:write" },
    { method: "POST", path: "/api/v1/tasks/:taskId/archive", scope: "tasks:write" },
    { method: "POST", path: "/api/v1/tasks/:taskId/restore", scope: "tasks:write" },
  ],
  requiredPermissions: [
    "tasks.create",
    "tasks.view",
    "tasks.edit_own",
    "tasks.edit_all",
    "tasks.assign",
    "tasks.complete",
    "tasks.archive",
    "tasks.restore",
  ],
  permissions: [
    {
      id: "tasks.create",
      moduleId: "tasks",
      label: "Create Tasks",
      description: "Create tasks in an authorized workspace, client, or project scope.",
      resource: "tasks",
      operation: "create",
    },
    {
      id: "tasks.view",
      moduleId: "tasks",
      label: "View Tasks",
      description: "View tasks in an authorized workspace, client, or project scope.",
      resource: "tasks",
      operation: "read",
    },
    {
      id: "tasks.edit_own",
      moduleId: "tasks",
      label: "Edit Own Tasks",
      description: "Edit tasks created by or assigned to the actor in scope.",
      resource: "tasks",
      operation: "update",
    },
    {
      id: "tasks.edit_all",
      moduleId: "tasks",
      label: "Edit All Tasks",
      description: "Edit all tasks in an authorized workspace, client, or project scope.",
      resource: "tasks",
      operation: "update",
    },
    {
      id: "tasks.assign",
      moduleId: "tasks",
      label: "Assign Tasks",
      description: "Assign tasks to eligible workspace users.",
      resource: "tasks",
      operation: "assign",
    },
    {
      id: "tasks.complete",
      moduleId: "tasks",
      label: "Complete Tasks",
      description: "Complete and reopen authorized tasks.",
      resource: "tasks",
      operation: "update",
    },
    {
      id: "tasks.archive",
      moduleId: "tasks",
      label: "Archive Tasks",
      description: "Archive authorized tasks.",
      resource: "tasks",
      operation: "archive",
    },
    {
      id: "tasks.restore",
      moduleId: "tasks",
      label: "Restore Tasks",
      description: "Restore archived tasks.",
      resource: "tasks",
      operation: "restore",
    },
  ],
  defaultRolePermissions: [
    { roleId: "super_admin", permissions: ["tasks.create", "tasks.view", "tasks.edit_all", "tasks.assign", "tasks.complete", "tasks.archive", "tasks.restore"] },
    { roleId: "workspace_admin", permissions: ["tasks.create", "tasks.view", "tasks.edit_all", "tasks.assign", "tasks.complete", "tasks.archive", "tasks.restore"] },
    { roleId: "client_admin", permissions: ["tasks.create", "tasks.view", "tasks.edit_all", "tasks.assign", "tasks.complete", "tasks.archive", "tasks.restore"] },
    { roleId: "project_admin", permissions: ["tasks.create", "tasks.view", "tasks.edit_all", "tasks.assign", "tasks.complete", "tasks.archive", "tasks.restore"] },
    { roleId: "client_user", permissions: ["tasks.create", "tasks.view", "tasks.edit_own", "tasks.complete"] },
    { roleId: "project_user", permissions: ["tasks.create", "tasks.view", "tasks.edit_own", "tasks.complete"] },
    { roleId: "client_external_user", permissions: ["tasks.view"] },
  ],
  resourceDefinitions: [
    {
      key: "tasks",
      moduleId: "tasks",
      label: "Tasks",
      operations: ["read", "create", "update", "delete", "archive", "restore", "assign", "manage"],
    },
  ],
  auditRecordTypes: [
    {
      recordType: "task",
      moduleId: "tasks",
      label: "Task",
      description: "Task records and task lifecycle audit history.",
    },
    {
      recordType: "task_recurrence_template",
      moduleId: "tasks",
      label: "Task Recurrence Template",
      description: "Recurring task series templates and recurrence audit history.",
    },
    {
      recordType: "task_checklist_item",
      moduleId: "tasks",
      label: "Task Checklist Item",
      description: "Lightweight checklist items owned by parent task records.",
    },
    {
      recordType: "task_relationship",
      moduleId: "tasks",
      label: "Task Relationship",
      description: "Parent/child task planning links and blocking relationship history.",
    },
  ],
  taggableTypes: [
    {
      targetType: "task",
      moduleId: "tasks",
      label: "Task",
      description: "Task records that can receive workspace tags.",
      tableName: "tasks",
      idField: "task_id",
      labelField: "title",
      workspaceField: "workspace_id",
      clientField: "client_id",
      projectField: "project_id",
      requiredReadPermission: "tasks.view",
      requiredTagPermission: "tags.assign",
      requiredModules: ["tasks"],
    },
  ],
  attachableTypes: [
    {
      targetType: "task",
      moduleId: "tasks",
      label: "Task",
      description: "Task records that can receive framework-managed file attachments.",
      tableName: "tasks",
      idField: "task_id",
      labelField: "title",
      workspaceField: "workspace_id",
      clientField: "client_id",
      projectField: "project_id",
      requiredReadPermission: "tasks.view",
      requiredAttachPermission: "files.upload",
      requiredRemovePermission: "files.delete",
      allowedFileCategories: ["document", "image", "pdf", "text", "other"],
      allowedVisibilityValues: ["private", "workspace", "client"],
      lifecycleEvents: ["file.attachment.created", "file.attachment.context_updated", "file.attachment.removed"],
      requiredModules: ["tasks"],
    },
  ],
  linkedContextProviders: [
    {
      id: "tasks.task",
      moduleId: "tasks",
      targetType: "task",
      label: "Task",
      description: "Permission-safe task targets for shared Linked Context pickers.",
      provider: "tasks.linked-context.tasks",
      responseContract: LINKED_CONTEXT_TARGET_RESPONSE_CONTRACT,
      requiredReadPermission: "tasks.view",
      requiredPermissions: ["tasks.view"],
      requiredModules: ["tasks"],
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
    },
  ],
  tagPropagation: [
    {
      id: "tasks.project-to-task",
      sourceModuleId: "client-projects",
      sourceTargetType: "project",
      targetModuleId: "tasks",
      targetType: "task",
      relationshipResolver: "tasks.project-tasks",
      workspaceField: "workspace_id",
      sourceReadPermission: "projects.manage",
      targetReadPermission: "tasks.view",
      targetTagPermission: "tags.assign",
      requiredModules: ["client-projects", "tasks", "tags"],
      propagateOnParentChange: true,
      propagateOnRelationshipChange: true,
    },
  ],
  searchableTypes: [
    {
      recordType: "task",
      moduleId: "tasks",
      label: "Task",
      description: "Task records searchable by title, description, assignment, due date, client/project context, and tags.",
      idField: "task_id",
      titleField: "title",
      summaryField: "summary",
      bodyFields: ["body"],
      workspaceField: "workspace_id",
      clientField: "client_id",
      projectField: "project_id",
      requiredReadPermission: "tasks.view",
      indexer: "tasks.records",
      requiredModules: ["tasks"],
      tagsTextField: "tags_text",
      recordStatusField: "search_status",
      sourceLabel: "Task",
    },
  ],
  apiScopes: [
    {
      id: "tasks:read",
      moduleId: "tasks",
      label: "Read Tasks",
      description: "Read tasks through the public API.",
      access: "read",
    },
    {
      id: "tasks:write",
      moduleId: "tasks",
      label: "Write Tasks",
      description: "Create and update tasks through the public API.",
      access: "write",
    },
  ],
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
      description: "Reserved notification event for future task due-soon checks.",
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
        title: taskNotificationTitle,
        body: ({ event }) => `Task "${event.new_value?.title || event.record_id || "Task"}" is due soon.`,
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
        url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.metadata?.task_id || "")}`,
      },
    },
    {
      event: "task.checklist_item.updated",
      moduleId: "tasks",
      activity: {
        label: "Task Checklist Updated",
        summary: ({ event }) => `Updated checklist item for task "${event.metadata?.task_title || event.metadata?.task_id || "Task"}".`,
        url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.metadata?.task_id || "")}`,
      },
    },
    {
      event: "task.checklist_item.checked",
      moduleId: "tasks",
      activity: {
        label: "Task Checklist Progress",
        summary: ({ event }) => `Checked checklist item for task "${event.metadata?.task_title || event.metadata?.task_id || "Task"}".`,
        url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.metadata?.task_id || "")}`,
      },
    },
    {
      event: "task.checklist_item.unchecked",
      moduleId: "tasks",
      activity: {
        label: "Task Checklist Progress",
        summary: ({ event }) => `Unchecked checklist item for task "${event.metadata?.task_title || event.metadata?.task_id || "Task"}".`,
        url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.metadata?.task_id || "")}`,
      },
    },
    {
      event: "task.checklist_item.deleted",
      moduleId: "tasks",
      activity: {
        label: "Task Checklist Updated",
        summary: ({ event }) => `Removed checklist item from task "${event.metadata?.task_title || event.metadata?.task_id || "Task"}".`,
        url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.metadata?.task_id || "")}`,
      },
    },
    {
      event: "task.checklist_items.reordered",
      moduleId: "tasks",
      activity: {
        label: "Task Checklist Reordered",
        summary: ({ event }) => `Reordered checklist items for task "${event.metadata?.task_title || event.metadata?.task_id || "Task"}".`,
        url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.metadata?.task_id || "")}`,
      },
    },
    {
      event: "task.relationship.created",
      moduleId: "tasks",
      activity: {
        label: "Task Relationship Added",
        summary: ({ event }) => `Linked child task "${event.metadata?.child_title || event.metadata?.child_task_id || "Task"}".`,
        url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.metadata?.parent_task_id || "")}`,
      },
    },
    {
      event: "task.relationship.updated",
      moduleId: "tasks",
      activity: {
        label: "Task Relationship Updated",
        summary: ({ event }) => `Updated child task relationship for "${event.metadata?.child_title || event.metadata?.child_task_id || "Task"}".`,
        url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.metadata?.parent_task_id || "")}`,
      },
    },
    {
      event: "task.relationship.removed",
      moduleId: "tasks",
      activity: {
        label: "Task Relationship Removed",
        summary: ({ event }) => `Removed child task relationship for "${event.metadata?.child_title || event.metadata?.child_task_id || "Task"}".`,
        url: ({ event }) => `tasks.html?task=${encodeURIComponent(event.metadata?.parent_task_id || "")}`,
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
      description: "Notifies task assignees when a task is due soon.",
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
  help: {
    sections: [
      {
        id: "tasks.overview",
        moduleId: "tasks",
        title: "Tasks",
        description: "Current Tasks behavior for task context, checklists, parent/child planning, recurrence, timers, notifications, search, and recovery context.",
        sortOrder: 110,
        audience: "user",
        tags: ["tasks", "resume work", "next action"],
        requiredModules: ["tasks"],
        requiredPermissions: ["tasks.view"],
      },
    ],
    articles: [
      {
        id: "tasks.resume-context",
        slug: "tasks-resume-context",
        sectionId: "tasks.overview",
        moduleId: "tasks",
        title: "Resuming Task Work",
        summary: "Use next actions, blocked reasons, resume notes, checklist progress, and child-task blockers to recover task context.",
        contentPath: "modules/tasks/resuming-task-work.md",
        sortOrder: 10,
        audience: "user",
        tags: ["tasks", "resume work", "blocked", "checklists"],
        requiredModules: ["tasks"],
        requiredPermissions: ["tasks.view"],
      },
    ],
  },
  timerSources: [
    {
      sourceType: "task",
      moduleId: "tasks",
      label: "Task Timer",
      listRoute: "/api/tasks/timers",
      startRoute: "/api/tasks/:taskId/timer",
      pauseRoute: "/api/tasks/:taskId/timer",
      finalizeRoute: "/api/tasks/:taskId/timer/finalize",
      removeRoute: "/api/tasks/:taskId/timer",
      requiredPermissions: ["tasks.view", "time_entries.create"],
      requiredModules: ["tasks", "time-tracking"],
    },
  ],
  workItemSources: [
    {
      sourceType: "task",
      moduleId: "tasks",
      label: "Tasks",
      listRoute: "/api/tasks/workbench-items",
      requiredPermissions: ["tasks.view"],
      requiredModules: ["tasks"],
      filterHints: {
        supported: ["all", "due-soon", "assigned-to-me", "active"],
      },
      sortHints: {
        supported: ["due_at", "priority", "title", "timer_status"],
      },
    },
  ],
  workspaceCapabilityRequirements: ["projects", "clients_projects"],
  settings: [
    {
      id: "tasksEnabled",
      label: "Tasks",
      type: "boolean",
      moduleStatus: true,
    },
    {
      id: "taskTimersEnabled",
      label: "Task Timers",
      type: "boolean",
      moduleStatus: false,
    },
  ],
  frameworkDependencies: [
    "audit-service",
    "client-projects",
    "module-access",
    "permissions-service",
    "timezone-normalization",
    "workspace-settings",
  ],
};

export { tasksModule };
