import { config } from "../config.js";
import { modulesService } from "../core/modules/modules.service.js";
import { userWorkspacesRepository } from "../repositories/user-workspaces.repo.js";
import { usersRepository } from "../repositories/users.repo.js";
import { permissionsService } from "./permissions.service.js";
import { settingsService } from "./settings.service.js";
import { normalizeCalendarViewPreference, normalizeThemeAutoSource, normalizeThemeMode } from "../utils/normalizers.js";
import { notificationsService } from "./notifications.service.js";
import { searchService } from "./search.service.js";
import { evaluatePublicDemoCapability } from "../core/public-demo-enforcement.js";

const QUICK_ACTION_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "timer",
    label: "Timer",
    description: "Start an active timer.",
    icon: "start",
    actionType: "module-action",
    moduleActionId: "time-tracking.timer.create",
    moduleId: "time-tracking",
    requiredModules: ["time-tracking"],
    requiredPermissions: ["time_entries.create"],
    requiredWorkspaceCapabilities: ["time_tracking", "time_tracking_optional"],
  }),
  Object.freeze({
    id: "task",
    label: "Task",
    description: "Capture a new task without leaving this page.",
    icon: "complete",
    actionType: "module-action",
    moduleActionId: "tasks.add",
    moduleId: "tasks",
    requiredModules: ["tasks"],
    requiredPermissions: ["tasks.create"],
    requiredWorkspaceCapabilities: ["projects", "clients_projects"],
  }),
  Object.freeze({
    id: "note",
    label: "Note",
    description: "Capture working context.",
    icon: "edit",
    actionType: "module-action",
    moduleActionId: "notes.add",
    moduleId: "notes",
    requiredModules: ["notes"],
    requiredPermissions: ["notes.create"],
  }),
  Object.freeze({
    id: "list",
    label: "List",
    description: "Capture an operational list or checklist.",
    icon: "list-checks",
    actionType: "module-action",
    moduleActionId: "lists.add",
    moduleId: "lists",
    requiredModules: ["lists"],
    requiredPermissions: ["lists.create"],
  }),
  Object.freeze({
    id: "file",
    label: "File",
    description: "Add or recover a file attachment.",
    icon: "file",
    actionType: "fallback-link",
    href: "files.html",
    moduleId: "framework",
    publicDemoCapability: "files.ingress",
    requiredPermissions: ["files.upload"],
    temporaryFallback: true,
    temporaryLabel: "Temporary fallback: opens Files until target-aware file upload capture ships.",
  }),
  Object.freeze({
    id: "reporting",
    label: "Reporting",
    description: "Open reporting tools.",
    icon: "list",
    actionType: "fallback-link",
    href: "reporting.html",
    moduleId: "framework",
    requiredPermissions: ["reporting.view"],
    requiredReportingReports: true,
    temporaryFallback: true,
    temporaryLabel: "Temporary fallback: opens Reporting until report creation has a modal.",
  }),
  Object.freeze({
    id: "search",
    label: "Search",
    description: "Recover records through global search.",
    icon: "filter",
    actionType: "fallback-link",
    href: "search.html",
    moduleId: "framework",
    requiredSearchTargets: true,
    temporaryFallback: true,
    temporaryLabel: "Temporary fallback: opens Search until advanced search has a modal.",
  }),
]);

async function bootstrap(session) {
  const [
    workspaceContext,
    workspaces,
    user,
    moduleNavigation,
    moduleSettingsNavigation,
    viewSurfaces,
    permissionHints,
    notificationSummary,
    searchTargets,
    reportingReports,
  ] = await Promise.all([
    settingsService.readWorkspaceBootstrap(session),
    userWorkspacesRepository.readForUser(session.user_id),
    usersRepository.readById(session.home_workspace_id || session.workspace_id, session.user_id),
    modulesService.listModuleNavigation(session.workspace_id, session),
    modulesService.listModuleSettingsNavigation(session.workspace_id, session),
    modulesService.listActiveViewSurfaces(session.workspace_id, session),
    readPermissionHints(session),
    readNotificationSummary(session),
    readSearchTargets(session),
    modulesService.listReportingReports(session.workspace_id, session),
  ]);
  const [navigation, quickActions] = await Promise.all([
    buildNavigation(workspaceContext, moduleNavigation, moduleSettingsNavigation, permissionHints, reportingReports),
    readQuickActions(session, workspaceContext, { reportingReports, searchTargets }),
  ]);

  return {
    app: {
      name: config.appName,
      version: config.appDisplayVersion,
      displayVersion: config.appDisplayVersion,
      canonicalVersion: config.appVersion,
      sourceBranch: config.release.sourceBranch,
    },
    activeWorkspaceId: session.active_workspace_id || session.workspace_id,
    enabledModules: workspaceContext.enabledModules || [],
    moduleNavigation,
    moduleSettingsNavigation,
    navigation,
    notificationSummary,
    permissionHints,
    quickActions,
    searchTargets,
    supportView: session.support_view ? { ...session.support_view } : null,
    viewSurfaces,
    themeMode: normalizeThemeMode(user?.theme_mode),
    themeAutoSource: normalizeThemeAutoSource(user?.theme_auto_source),
    timezone: session.timezone || user?.timezone || "",
    user: {
      user_id: session.user_id,
      username: session.username,
      themeMode: normalizeThemeMode(user?.theme_mode),
      themeAutoSource: normalizeThemeAutoSource(user?.theme_auto_source),
      preferredCalendarView: normalizeCalendarViewPreference(user?.preferred_calendar_view),
      timezone: session.timezone || user?.timezone || "",
    },
    workspaceContext: {
      ...workspaceContext,
      publicDemo: {
        enabled: config.demo.enabled,
        filesIngressAllowed: evaluatePublicDemoCapability("files.ingress").allowed,
      },
      quickActions,
      viewSurfaces,
    },
    workspaces: normalizeWorkspaceMemberships(workspaces),
  };
}

async function readQuickActions(session, workspaceContext, options = {}) {
  const visibleActions = [];

  for (const action of QUICK_ACTION_DEFINITIONS) {
    if (!evaluatePublicDemoCapability(action.publicDemoCapability || "records.workspace").allowed) {
      continue;
    }
    if (session.support_view && action.actionType === "module-action") {
      continue;
    }
    if (action.requiredSearchTargets && normalizeSearchTargetsForQuickActions(options.searchTargets).length === 0) {
      continue;
    }
    if (action.requiredReportingReports && normalizeReportingReportsForShell(options.reportingReports).length === 0) {
      continue;
    }
    if (!quickActionModulesAvailable(action, workspaceContext)) {
      continue;
    }
    if (!quickActionWorkspaceCapabilitiesAvailable(action, workspaceContext)) {
      continue;
    }
    if (!(await quickActionPermissionsAllowed(action, session))) {
      continue;
    }

    visibleActions.push(toQuickActionPayload(action));
  }

  return visibleActions;
}

function normalizeSearchTargetsForQuickActions(searchTargets = []) {
  return Array.isArray(searchTargets) ? searchTargets.filter((target) => target?.recordType) : [];
}

function normalizeReportingReportsForShell(reportingReports = []) {
  return (Array.isArray(reportingReports) ? reportingReports : [])
    .filter((report) => report?.moduleId && report?.id)
    .map((report) => ({
      ...report,
      reportKey: report.reportKey || `${report.moduleId}:${report.id}`,
    }));
}

function quickActionModulesAvailable(action, workspaceContext) {
  const enabledModules = new Set(Array.isArray(workspaceContext.enabledModules) ? workspaceContext.enabledModules : []);
  const requiredModules = [
    action.moduleId && action.moduleId !== "framework" ? action.moduleId : "",
    ...(action.requiredModules || []),
  ].filter(Boolean);

  return requiredModules.every((moduleId) => enabledModules.has(moduleId));
}

function quickActionWorkspaceCapabilitiesAvailable(action, workspaceContext) {
  const requiredCapabilities = Array.isArray(action.requiredWorkspaceCapabilities)
    ? action.requiredWorkspaceCapabilities
    : [];

  if (requiredCapabilities.length === 0) {
    return true;
  }

  const availableTools = new Set(
    Array.isArray(workspaceContext.workspaceCapabilities?.availableTools)
      ? workspaceContext.workspaceCapabilities.availableTools
      : [],
  );
  return requiredCapabilities.some((capability) => availableTools.has(capability));
}

async function quickActionPermissionsAllowed(action, session) {
  for (const permissionId of action.requiredPermissions || []) {
    if (!(await permissionsService.canInAnyScope(session, permissionId, {
      workspace_id: session.workspace_id,
    }))) {
      return false;
    }
  }

  return true;
}

function toQuickActionPayload(action) {
  return {
    actionType: action.actionType,
    description: action.description,
    href: action.href || "",
    icon: action.icon,
    id: action.id,
    label: action.label,
    moduleActionId: action.moduleActionId || "",
    moduleId: action.moduleId,
    temporaryFallback: action.temporaryFallback === true,
    temporaryLabel: action.temporaryLabel || "",
  };
}

async function readSearchTargets(session) {
  const searchableTypes = await searchService.listActiveSearchableTypes(session.workspace_id);

  return visibleSearchTargets(searchableTypes);
}

function visibleSearchTargets(searchableTypes = []) {
  const visibleTargets = new Map();

  for (const type of searchableTypes) {
    const sourceLabel = type.sourceLabel || type.label || type.moduleId;
    const label = type.label || sourceLabel || type.recordType;
    const visibleKey = `${sourceLabel}:${type.recordType}`;
    const existing = visibleTargets.get(visibleKey);

    if (existing) {
      visibleTargets.set(visibleKey, {
        ...existing,
        aggregate: true,
        id: `source:${sourceLabel}:${type.recordType}`,
        moduleId: "",
      });
      continue;
    }

    visibleTargets.set(visibleKey, {
      aggregate: false,
      id: `${type.moduleId}:${type.recordType}`,
      moduleId: type.moduleId,
      recordType: type.recordType,
      label,
      sourceLabel,
    });
  }

  return [...visibleTargets.values()];
}

async function readNotificationSummary(session) {
  try {
    return await notificationsService.unreadCount(session);
  } catch {
    return {
      count: 0,
      unreadCount: 0,
      totalUnreadCount: 0,
      lowPriorityUnreadCount: 0,
      urgentPriorityCount: 0,
      highPriorityCount: 0,
      hasUrgentPriority: false,
      hasHighPriority: false,
      hasPriorityAlert: false,
    };
  }
}

async function readPermissionHints(session) {
  const [
    canManageWorkspaceSettings,
    canManageFileSettings,
    canManageFileQuarantine,
    canManageClients,
    canManageProjects,
    canManageUsers,
    canDelegateRoleAssignments,
    canViewAuditLogs,
    canEnterSupportView,
  ] = await Promise.all([
    permissionsService.canInAnyScope(session, "workspace_settings.manage", {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
    permissionsService.canInAnyScope(session, "files.manage_workspace_settings", {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
    permissionsService.canInAnyScope(session, "files.manage_quarantine", {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
    permissionsService.canInAnyScope(session, "clients.manage", {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
    permissionsService.canInAnyScope(session, "projects.manage", {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
    permissionsService.canInAnyScope(session, "users.manage", {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
    permissionsService.hasUsableDelegatedRoleScope(session),
    permissionsService.canInAnyScope(session, "audit_logs.view", {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
    config.supportView.enabled && !session.support_view
      ? permissionsService.isSuperAdmin(session).then((isSuperAdmin) => (
          isSuperAdmin
            ? permissionsService.canInAnyScope(session, "support_view.enter", {
                workspace_id: session.workspace_id,
                operation: "read",
              })
            : false
        ))
      : Promise.resolve(false),
  ]);

  return {
    auditLogsView: canViewAuditLogs,
    clientsManage: canManageClients,
    filesManageQuarantine: canManageFileQuarantine,
    filesSettingsManage: canManageFileSettings,
    projectsManage: canManageProjects,
    roleAssignmentsDelegate: canDelegateRoleAssignments,
    supportViewEnter: canEnterSupportView,
    usersManage: canManageUsers,
    workspaceSettingsManage: canManageWorkspaceSettings,
  };
}

async function buildNavigation(workspaceContext, moduleNavigation, moduleSettingsNavigation, permissionHints, reportingReports = []) {
  const capabilities = workspaceContext.workspaceCapabilities || {};
  const workspaceType = workspaceContext.workspaceType || capabilities.workspaceType || "business";
  const availableTools = new Set(Array.isArray(capabilities.availableTools) ? capabilities.availableTools : []);
  const moduleNavByHref = new Map(moduleNavigation.map((item) => [item.href, item]));
  const frameworkOwnedTopLevelHrefs = new Set(["time-tracker.html", "tasks.html", "calendar.html", "projects.html", "clients.html", "reporting.html"]);
  const standaloneModuleNavigation = moduleNavigation.filter((item) => (
    item.href &&
    !item.parent &&
    !frameworkOwnedTopLevelHrefs.has(item.href)
  ));
  const actionsMenu = {
    id: "actions",
    label: "Actions",
    items: [],
  };
  const reportingMenu = {
    id: "reporting",
    label: "Reporting",
    items: [],
  };
  const adminSettingsMenu = {
    id: "admin-settings-group",
    label: "Admin",
    items: [],
  };
  const modulesSettingsMenu = {
    id: "module-settings-group",
    label: "Modules",
    items: [],
  };

  addTimeKeepingNavigation(actionsMenu.items, moduleNavigation);
  addModuleNavItem(actionsMenu.items, moduleNavByHref.get("tasks.html"));
  addModuleNavItem(actionsMenu.items, moduleNavByHref.get("calendar.html"));
  addModuleNavItem(actionsMenu.items, moduleNavByHref.get("notes.html"));
  addModuleNavItem(actionsMenu.items, moduleNavByHref.get("lists.html"));
  actionsMenu.items.push({
    id: "files",
    label: "Files",
    href: "files.html",
  });

  addReportingNavigation(reportingMenu.items, reportingReports);
  if (reportingMenu.items.length > 0) {
    actionsMenu.items.push(reportingMenu);
  }

  if (permissionHints.workspaceSettingsManage) {
    if (permissionHints.filesSettingsManage) {
      modulesSettingsMenu.items.push({
        id: "files-settings",
        label: "Files",
        href: "files-settings.html",
      });
    }
    modulesSettingsMenu.items.push({
      id: "calendar-settings",
      label: "Calendar",
      href: "calendar-settings.html",
    });
    modulesSettingsMenu.items.push({
      id: "workbench-settings",
      label: "Workbench",
      href: "workbench-settings.html",
    });
    addSettingsModuleNavigation(
      modulesSettingsMenu.items,
      moduleNavigation.filter((item) => !["role-assignments.html", "user-admin.html"].includes(item.href)),
    );
    moduleSettingsNavigation.forEach((item) => addModuleNavItem(modulesSettingsMenu.items, item));
    sortAdminModuleNavigation(modulesSettingsMenu.items);
  }

  if (modulesSettingsMenu.items.length > 0) {
    adminSettingsMenu.items.push(modulesSettingsMenu);
  }

  if ((availableTools.has("projects") || availableTools.has("clients_projects")) && permissionHints.projectsManage) {
    adminSettingsMenu.items.push({
      id: "projects",
      label: "Projects",
      href: "projects.html",
    });
  }

  if (availableTools.has("clients_projects") && permissionHints.clientsManage) {
    addModuleNavItem(adminSettingsMenu.items, moduleNavByHref.get("clients.html"));
  }

  if (availableTools.has("team_members") && permissionHints.usersManage) {
    addModuleNavItem(adminSettingsMenu.items, moduleNavByHref.get("user-admin.html"));
  }

  if (availableTools.has("team_members") && permissionHints.roleAssignmentsDelegate) {
    addModuleNavItem(adminSettingsMenu.items, moduleNavByHref.get("role-assignments.html"));
  }

  if (permissionHints.workspaceSettingsManage) {
    adminSettingsMenu.items.push({
      id: "workspace-settings",
      label: "Workspace",
      href: "workspace-settings.html",
    });
  }

  if (workspaceType === "business" && permissionHints.workspaceSettingsManage) {
    adminSettingsMenu.items.push({
      id: "api-keys",
      label: "API Keys",
      href: "api-keys.html",
    });
  }

  if (permissionHints.auditLogsView) {
    adminSettingsMenu.items.push({
      id: "audit-log",
      label: "Audit Log",
      href: "audit-log.html",
    });
  }

  if (permissionHints.supportViewEnter) {
    adminSettingsMenu.items.push(
      {
        id: "support-view",
        label: "Support View",
        href: "support-view.html",
      },
      {
        id: "support-view-audit",
        label: "Support View Audit",
        href: "support-view-audit.html",
      },
    );
  }

  const settingsMenu = {
    id: "settings",
    label: "Settings",
    items: [
      adminSettingsMenu,
      {
        id: "user-settings",
        label: "User",
        href: "user-settings.html",
      },
      {
        id: "help",
        label: "Help",
        href: "help.html",
      },
    ].filter((item) => item.href || item.items?.length > 0),
  };

  return [
    { id: "dashboard", label: "Dashboard", href: "dashboard.html" },
    { id: "workbench", label: "Workbench", href: "workbench.html" },
    ...standaloneModuleNavigation.map((item) => ({
      id: item.id || item.href.replace(/\.html$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase(),
      label: item.label,
      href: item.href,
      moduleId: item.moduleId,
    })),
    actionsMenu,
    settingsMenu,
  ].filter((item) => item.href || item.items?.length > 0);
}

function addReportingNavigation(targetItems, reportingReports = []) {
  normalizeReportingReportsForShell(reportingReports).forEach((report) => {
    targetItems.push({
      id: `report-${String(report.reportKey).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      label: report.label || "Report",
      href: `reporting.html?report=${encodeURIComponent(report.reportKey)}`,
      moduleId: report.moduleId,
    });
  });
}

function addTimeKeepingNavigation(targetItems, moduleNavigation) {
  const timeKeeping = moduleNavigation.find((item) => item.href === "time-tracker.html");

  if (!timeKeeping) {
    return;
  }

  const timeKeepingMenu = {
    id: "time-keeping",
    label: timeKeeping.label || "Time Keeping",
    items: [
      {
        id: "time-tracker",
        label: "Time Tracker",
        href: "time-tracker.html",
      },
    ],
  };

  moduleNavigation
    .filter((item) => item.parent === "time-tracker.html")
    .forEach((item) => addModuleNavItem(timeKeepingMenu.items, item));

  targetItems.push(timeKeepingMenu);
}

function addSettingsModuleNavigation(targetItems, moduleNavigation) {
  moduleNavigation
    .filter((item) => item.parent === "settings.html")
    .forEach((item) => addModuleNavItem(targetItems, item));
}

function sortAdminModuleNavigation(items) {
  const order = new Map([
    ["calendar-settings.html", 0],
    ["files-settings.html", 1],
    ["tags.html", 2],
    ["notes-settings.html", 3],
    ["tasks-settings.html", 4],
    ["time-tracking-settings.html", 5],
    ["workbench-settings.html", 6],
    ["developer-example.html", Number.MAX_SAFE_INTEGER],
  ]);
  items.sort((left, right) => (
    (order.get(left.href) ?? 100) - (order.get(right.href) ?? 100) ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  ));
}

function addModuleNavItem(targetItems, item) {
  if (!item?.href) {
    return;
  }

  if (targetItems.some((existingItem) => existingItem.href === item.href)) {
    return;
  }

  targetItems.push({
    id: item.id || item.href.replace(/\.html$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase(),
    label: item.label,
    href: item.href,
    moduleId: item.moduleId,
  });
}

function normalizeWorkspaceMemberships(memberships) {
  return memberships
    .filter((membership) => membership.status === "active")
    .map((membership) => ({
      workspace_id: membership.workspace_id,
      workspaceName: membership.workspace_name,
      status: membership.status,
    }));
}

export const appShellService = {
  bootstrap,
};
