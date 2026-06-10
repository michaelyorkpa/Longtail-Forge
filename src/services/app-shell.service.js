import { config } from "../config.js";
import { modulesService } from "../core/modules/modules.service.js";
import { userWorkspacesRepository } from "../repositories/user-workspaces.repo.js";
import { usersRepository } from "../repositories/users.repo.js";
import { permissionsService } from "./permissions.service.js";
import { settingsService } from "./settings.service.js";
import { normalizeThemeMode } from "../utils/normalizers.js";
import { notificationsService } from "./notifications.service.js";
import { searchService } from "./search.service.js";

async function bootstrap(session) {
  const [
    workspaceContext,
    workspaces,
    user,
    moduleNavigation,
    moduleSettingsNavigation,
    permissionHints,
    notificationSummary,
    searchTargets,
  ] = await Promise.all([
    settingsService.readWorkspaceBootstrap(session),
    userWorkspacesRepository.readForUser(session.user_id),
    usersRepository.readById(session.home_workspace_id || session.workspace_id, session.user_id),
    modulesService.listModuleNavigation(session.workspace_id, session),
    modulesService.listModuleSettingsNavigation(session.workspace_id, session),
    readPermissionHints(session),
    readNotificationSummary(session),
    readSearchTargets(session),
  ]);
  const navigation = await buildNavigation(workspaceContext, moduleNavigation, moduleSettingsNavigation, permissionHints);

  return {
    app: {
      name: config.appName,
      version: config.appVersion,
    },
    activeWorkspaceId: session.active_workspace_id || session.workspace_id,
    enabledModules: workspaceContext.enabledModules || [],
    moduleNavigation,
    moduleSettingsNavigation,
    navigation,
    notificationSummary,
    permissionHints,
    searchTargets,
    themeMode: normalizeThemeMode(user?.theme_mode),
    timezone: session.timezone || user?.timezone || "",
    user: {
      user_id: session.user_id,
      username: session.username,
      themeMode: normalizeThemeMode(user?.theme_mode),
      timezone: session.timezone || user?.timezone || "",
    },
    workspaceContext,
    workspaces: normalizeWorkspaceMemberships(workspaces),
  };
}

async function readSearchTargets(session) {
  const searchableTypes = await searchService.listActiveSearchableTypes(session.workspace_id);

  return searchableTypes.map((type) => ({
    id: `${type.moduleId}:${type.recordType}`,
    moduleId: type.moduleId,
    recordType: type.recordType,
    label: type.label || type.sourceLabel || type.recordType,
    sourceLabel: type.sourceLabel || type.label || type.moduleId,
  }));
}

async function readNotificationSummary(session) {
  try {
    return await notificationsService.unreadCount(session);
  } catch {
    return { count: 0, unreadCount: 0 };
  }
}

async function readPermissionHints(session) {
  const [
    canManageWorkspaceSettings,
    canManageProjects,
    canManageUsers,
    canViewAuditLogs,
  ] = await Promise.all([
    permissionsService.can(session, "workspace_settings.manage", {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
    permissionsService.can(session, "projects.manage", {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
    permissionsService.can(session, "users.manage", {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
    permissionsService.can(session, "audit_logs.view", {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
  ]);

  return {
    auditLogsView: canViewAuditLogs,
    projectsManage: canManageProjects,
    usersManage: canManageUsers,
    workspaceSettingsManage: canManageWorkspaceSettings,
  };
}

async function buildNavigation(workspaceContext, moduleNavigation, moduleSettingsNavigation, permissionHints) {
  const capabilities = workspaceContext.workspaceCapabilities || {};
  const workspaceType = workspaceContext.workspaceType || capabilities.workspaceType || "business";
  const availableTools = new Set(Array.isArray(capabilities.availableTools) ? capabilities.availableTools : []);
  const modulesById = new Map((workspaceContext.modules || []).map((moduleDefinition) => [moduleDefinition.id, moduleDefinition]));
  const clientProjectsLabel = moduleDisplayLabel(modulesById, "client-projects", "Projects");
  const moduleNavByHref = new Map(moduleNavigation.map((item) => [item.href, item]));
  const frameworkOwnedTopLevelHrefs = new Set(["time-tracker.html", "tasks.html", "projects.html", "clients.html", "reporting.html"]);
  const standaloneModuleNavigation = moduleNavigation.filter((item) => (
    item.href &&
    !item.parent &&
    !frameworkOwnedTopLevelHrefs.has(item.href)
  ));
  const projectsMenu = {
    id: "projects",
    label: clientProjectsLabel,
    items: [],
  };
  const reportingMenu = {
    id: "reporting",
    label: "Reporting",
    items: [],
  };
  const workspaceSettingsMenu = {
    id: "workspace-settings-group",
    label: "Workspace",
    items: [],
  };
  const modulesSettingsMenu = {
    id: "module-settings-group",
    label: "Modules",
    items: [],
  };

  addTimeKeepingNavigation(projectsMenu.items, moduleNavigation);
  addModuleNavItem(projectsMenu.items, moduleNavByHref.get("tasks.html"));
  addModuleNavItem(projectsMenu.items, moduleNavByHref.get("notes.html"));
  projectsMenu.items.push({
    id: "files",
    label: "Files",
    href: "files.html",
  });

  if (availableTools.has("projects") || availableTools.has("clients_projects")) {
    projectsMenu.items.push({
      id: "projects-settings",
      label: "Project Settings",
      href: "projects.html",
    });
  }

  addModuleNavItem(reportingMenu.items, moduleNavByHref.get("reporting.html"));

  if (permissionHints.workspaceSettingsManage) {
    workspaceSettingsMenu.items.push({
      id: "workspace-settings",
      label: "Workspace Settings",
      href: "workspace-settings.html",
    });
  }

  if (availableTools.has("clients_projects")) {
    addModuleNavItem(workspaceSettingsMenu.items, moduleNavByHref.get("clients.html"));
  }

  addSettingsModuleNavigation(workspaceSettingsMenu.items, moduleNavigation);

  moduleSettingsNavigation.forEach((item) => addModuleNavItem(modulesSettingsMenu.items, item));

  if (modulesSettingsMenu.items.length > 0) {
    workspaceSettingsMenu.items.push(modulesSettingsMenu);
  }

  if (availableTools.has("team_members") && permissionHints.usersManage) {
    addModuleNavItem(workspaceSettingsMenu.items, moduleNavByHref.get("user-admin.html"));
  }

  if (workspaceType === "business" && permissionHints.workspaceSettingsManage) {
    workspaceSettingsMenu.items.push({
      id: "api-keys",
      label: "API Keys",
      href: "api-keys.html",
    });
  }

  if (permissionHints.auditLogsView) {
    workspaceSettingsMenu.items.push({
      id: "audit-log",
      label: "Audit Log",
      href: "audit-log.html",
    });
  }

  const settingsMenu = {
    id: "settings",
    label: "Settings",
    items: [
      workspaceSettingsMenu,
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
    projectsMenu,
    reportingMenu,
    settingsMenu,
  ].filter((item) => item.href || item.items?.length > 0);
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

function moduleDisplayLabel(modulesById, moduleId, fallback) {
  const moduleDefinition = modulesById.get(moduleId);
  return moduleDefinition?.shortLabel || moduleDefinition?.displayName || moduleDefinition?.name || fallback;
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
