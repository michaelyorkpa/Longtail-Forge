// @ts-check
import { tasksRoutes } from "./tasks.routes.js";
import { tasksPublicApiRoutes } from "./public-api.routes.js";
import { registerTasksSearchIndexers } from "./search-indexers.js";
import { taskRemindersService } from "./task-reminders.service.js";
import {
  queueTaskRecurrenceSweepJobs,
  queueTaskReminderSweepJobs,
  registerTaskJobHandlers,
} from "./task-jobs.service.js";
import { createModuleEntry } from "../../core/modules/module-entry.js";
import { appVersion } from "../../core/version.js";
import { tasksPermissions } from "./module.permissions.js";
import { tasksEvents } from "./module.events.js";
import { tasksIntegrations } from "./module.integrations.js";
import { tasksSettings } from "./module.settings.js";
import { registerTasksPrivateCalendarFeedProvider } from "./private-calendar-feed.provider.js";

/** @typedef {import("../../types/framework-contracts.d.ts").ModuleActivationContext} ModuleActivationContext */

/** @param {ModuleActivationContext} context */
function activateTasksAppRuntime(context) {
  registerTasksSearchIndexers();
  registerTasksPrivateCalendarFeedProvider();
  taskRemindersService.registerSettingsHandlers();
  registerTaskJobHandlers();
  registerTasksStartupSweeps(context, "startup");
}

/** @param {ModuleActivationContext} context */
function activateTasksWorkerRuntime(context) {
  registerTasksSearchIndexers();
  registerTaskJobHandlers();
  registerTasksStartupSweeps(context, "worker-startup");
}

/** @param {ModuleActivationContext} context @param {string} sourcePrefix */
function registerTasksStartupSweeps({ registerStartupTask }, sourcePrefix) {
  registerStartupTask({
    id: "reminder-sweep",
    run: () => queueTaskReminderSweepJobs({ source: `${sourcePrefix}-reminder-sweep` }),
    formatSuccess: (result) => `[task-reminder-startup] sweep_queue=${result.queued ? "queued" : "skipped"} workspaces=${result.workspaceCount}`,
    failureMessage: "[task-reminder-startup] Reminder sweep queue failed.",
  });
  registerStartupTask({
    id: "recurrence-sweep",
    run: () => queueTaskRecurrenceSweepJobs({ source: `${sourcePrefix}-recurrence-sweep` }),
    formatSuccess: (result) => `[task-recurrence-startup] sweep_queue=${result.queued ? "queued" : "skipped"} workspaces=${result.workspaceCount}`,
    failureMessage: "[task-recurrence-startup] Recurrence sweep queue failed.",
  });
}

/** @type {import("../../types/framework-contracts.js").ModuleManifest} */
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
  version: appVersion,
  enabledByDefault: true,
  canDisable: true,
  historicalReadAccess: true,
  browserApiRoutes: [tasksRoutes],
  publicApiRoutes: [tasksPublicApiRoutes],
  browserAssetsDir: new URL("../../../public/js/", import.meta.url),
  migrationsDir: null,
  hooks: tasksEvents.hooks,
  protectedViewsDir: new URL("../../../views/protected/", import.meta.url),
  seedHooks: [],
  repairHooks: [],
  navigation: [
    { label: "Tasks", href: "tasks.html", parent: "projects.html", counts: ["overdue", "dueSoon"] },
    { label: "Calendar", href: "calendar.html", parent: "tasks.html", requiredPermissions: ["tasks.view"] },
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
      allowDisabledRead: true,
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
          publicDemoCapability: "records.workspace",
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
        recordsKey: "tasks",
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
      id: "tasks-dashboard-script",
      moduleId: "tasks",
      path: "/js/tasks-dashboard.js",
      type: "script",
      views: ["dashboard"],
      requiredPermissions: ["tasks.view"],
    },
    {
      id: "tasks-dashboard-style",
      moduleId: "tasks",
      path: "/css/tasks-dashboard.css",
      type: "style",
      views: ["dashboard"],
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
    },
  ],
  dashboard: [
    {
      id: "tasks-needs-attention",
      label: "Needs Attention",
      description: "Deduplicated task pressure signals for the Dashboard attention region.",
      renderer: "tasks.needs-attention",
      dataRoute: "/api/tasks/dashboard-summary",
      moduleId: "tasks",
      placement: "attention",
      counts: ["overdue", "blocked", "dueSoon", "activeTimers"],
      links: ["workbench"],
      requiredPermissions: ["tasks.view"],
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
      requiresEnabledModules: ["tasks"],
      sortOrder: 10,
    },
    {
      id: "tasks-calendar",
      label: "Calendar",
      description: "Read-only month calendar of task due dates and reminders for the Dashboard calendar region.",
      renderer: "tasks.calendar",
      dataRoute: "/api/tasks/calendar",
      moduleId: "tasks",
      placement: "calendar",
      links: ["calendar"],
      requiredPermissions: ["tasks.view"],
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
      requiresEnabledModules: ["tasks"],
      sortOrder: 15,
    },
    {
      id: "tasks-today-upcoming",
      label: "Today / Upcoming",
      description: "Due-today and due-this-week task work for the Dashboard horizon region.",
      renderer: "tasks.today-upcoming",
      dataRoute: "/api/tasks/dashboard-summary",
      moduleId: "tasks",
      placement: "today",
      counts: ["dueSoon"],
      links: ["workbench"],
      requiredPermissions: ["tasks.view"],
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
      requiresEnabledModules: ["tasks"],
      sortOrder: 20,
    },
    {
      id: "task-summary",
      label: "Tasks",
      description: "Compact task pressure metrics and Dashboard-safe task attention rows.",
      renderer: "tasks.pressure",
      dataRoute: "/api/tasks/dashboard-summary",
      moduleId: "tasks",
      placement: "main",
      counts: ["overdue", "dueSoon", "blocked", "assignedToMe"],
      links: ["workbench", "tasks"],
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
      listRoute: "/api/tasks/options",
      requiredPermissions: ["tasks.view"],
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
      requiresEnabledModules: ["tasks"],
      actions: [
        { publicDemoCapability: "records.workspace", id: "open", label: "Open Task", route: "tasks.html?task=:taskId" },
        { publicDemoCapability: "records.workspace", id: "start-timer", label: "Start Timer", route: "/api/tasks/:taskId/timer" },
        { publicDemoCapability: "records.workspace", id: "pause-timer", label: "Pause Timer", route: "/api/tasks/:taskId/timer" },
        { publicDemoCapability: "records.workspace", id: "finalize-timer", label: "Save & End", route: "/api/tasks/:taskId/timer/finalize" },
      ],
      defaultCollapsed: false,
      sortOrder: 20,
    },
  ],
  reporting: [],
  publicApiEndpoints: tasksIntegrations.publicApiEndpoints,
  requiredPermissions: tasksPermissions.requiredPermissions,
  permissions: tasksPermissions.permissions,
  defaultRolePermissions: tasksPermissions.defaultRolePermissions,
  resourceDefinitions: tasksPermissions.resourceDefinitions,
  auditRecordTypes: tasksPermissions.auditRecordTypes,
  taggableTypes: tasksIntegrations.taggableTypes,
  attachableTypes: tasksIntegrations.attachableTypes,
  linkedContextProviders: tasksIntegrations.linkedContextProviders,
  tagPropagation: tasksIntegrations.tagPropagation,
  searchableTypes: tasksIntegrations.searchableTypes,
  apiScopes: tasksIntegrations.apiScopes,
  eventTypes: tasksEvents.eventTypes,
  eventSummaries: tasksEvents.eventSummaries,
  notificationEvents: tasksEvents.notificationEvents,
  notificationFollowTargets: tasksEvents.notificationFollowTargets,
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
        id: "tasks.actions",
        slug: "tasks-actions",
        sectionId: "tasks.overview",
        moduleId: "tasks",
        title: "Tasks Action Reference",
        summary: "Find Tasks page, task editor, Workbench, timer, checklist, recurrence, and bulk actions.",
        contentPath: "modules/tasks/actions.md",
        sortOrder: 5,
        audience: "user",
        tags: ["tasks", "actions", "bulk actions", "timers"],
        relatedArticleIds: ["tasks.resume-context", "framework.action-catalog", "framework.tasks"],
        requiredModules: ["tasks"],
        requiredPermissions: ["tasks.view"],
      },
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
      {
        id: "tasks.reminders-calendar",
        slug: "tasks-reminders-calendar",
        sectionId: "tasks.overview",
        moduleId: "tasks",
        title: "Reminders, Calendar, and Subscriptions",
        summary: "Understand task reminders, the read-only in-app calendar, recurrence projection, and private calendar subscriptions.",
        contentPath: "modules/tasks/reminders-calendar-and-subscriptions.md",
        sortOrder: 20,
        audience: "user",
        tags: ["tasks", "reminders", "calendar", "subscriptions", "recurrence"],
        relatedArticleIds: ["tasks.resume-context", "framework.notifications", "framework.settings"],
        requiredModules: ["tasks"],
        requiredPermissions: ["tasks.view"],
      },
    ],
  },
  timerSources: tasksIntegrations.timerSources,
  workItemSources: tasksIntegrations.workItemSources,
  workspaceCapabilityRequirements: ["projects", "clients_projects"],
  settings: tasksSettings.settings,
  frameworkDependencies: [
    "audit-service",
    "client-projects",
    "module-access",
    "permissions-service",
    "timezone-normalization",
    "workspace-settings",
  ],
};

const moduleEntry = createModuleEntry({
  manifest: tasksModule,
  activateApp: activateTasksAppRuntime,
  activateWorker: activateTasksWorkerRuntime,
});

export { moduleEntry, tasksModule };
