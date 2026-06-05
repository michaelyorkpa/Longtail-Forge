import {
  getModule as getRegisteredModule,
  listModuleBrowserAssets as listRegisteredModuleBrowserAssets,
  listModuleApiScopeEntries as listRegisteredModuleApiScopeEntries,
  listModuleApiScopes as listRegisteredModuleApiScopes,
  listModuleMigrationSources,
  listModulePermissionEntries as listRegisteredModulePermissionEntries,
  listModulePermissions as listRegisteredModulePermissions,
  listModuleProtectedViews as listRegisteredModuleProtectedViews,
  listModulePublicViews as listRegisteredModulePublicViews,
  listModuleResourceDefinitions as listRegisteredModuleResourceDefinitions,
  listModuleRolePermissionDefaults as listRegisteredModuleRolePermissionDefaults,
  listModuleRouteEntries as listRegisteredModuleRouteEntries,
  listModuleRoutes as listRegisteredModuleRoutes,
  listModules as listRegisteredModules,
  listNotificationEvents as listRegisteredNotificationEvents,
  listNotificationTemplates as listRegisteredNotificationTemplates,
  listSearchableTypes as listRegisteredSearchableTypes,
  listTaggableTypes as listRegisteredTaggableTypes,
} from "./registry.js";
import { querySql, runSql, sqlText } from "../../db/sqlite.js";
import { permissionsRepository } from "../../repositories/permissions.repo.js";
import { AppError } from "../../utils/app-error.js";
import { getWorkspaceCapabilities } from "../../utils/workspaces.js";

const TIME_TRACKING_MODULE_ID = "time-tracking";
const TASKS_MODULE_ID = "tasks";
const AVAILABLE_FRAMEWORK_DEPENDENCIES = new Set([
  "api-key-auth",
  "audit-service",
  "billing-formatters",
  "client-projects",
  "module-access",
  "permissions-service",
  "timezone-normalization",
  "workspace-settings",
]);

function listModules() {
  return listRegisteredModules();
}

function getModule(moduleId) {
  return getRegisteredModule(moduleId);
}

function listModuleRoutes(type) {
  return listRegisteredModuleRoutes(type);
}

function listModuleRouteEntries(type) {
  return listRegisteredModuleRouteEntries(type);
}

function listModulePermissions() {
  return listRegisteredModulePermissions();
}

function listModulePermissionEntries() {
  return listRegisteredModulePermissionEntries();
}

function listModuleRolePermissionDefaults() {
  return listRegisteredModuleRolePermissionDefaults();
}

function listModuleResourceDefinitions() {
  return listRegisteredModuleResourceDefinitions();
}

function listModuleApiScopes() {
  return listRegisteredModuleApiScopes();
}

function listModuleApiScopeEntries() {
  return listRegisteredModuleApiScopeEntries();
}

function getModuleForApiScope(scope) {
  return listModuleApiScopeEntries().find((entry) => entry.scope === scope)?.moduleId || "";
}

function listTaggableTypes() {
  return listRegisteredTaggableTypes();
}

function listSearchableTypes() {
  return listRegisteredSearchableTypes();
}

function listNotificationEvents() {
  return listRegisteredNotificationEvents();
}

function listNotificationTemplates() {
  return listRegisteredNotificationTemplates();
}

function listModulePublicViews() {
  return listRegisteredModulePublicViews().map(normalizeViewContribution);
}

function listModuleBrowserAssets() {
  return listRegisteredModuleBrowserAssets().map(normalizeAssetContribution);
}

async function syncModuleRegistry(workspaceId) {
  const modules = listModules();
  const existingModuleRows = await querySql("SELECT module_id, version FROM modules;");
  const existingModulesById = new Map(existingModuleRows.map((row) => [row.module_id, row]));
  const now = new Date().toISOString();
  const statements = modules.flatMap((moduleDefinition) => {
    const moduleStatus = "active";
    const workspaceStatus = moduleDefinition.enabledByDefault ? "enabled" : "disabled";

    return [
      `
INSERT INTO modules (module_id, name, description, category, status, version, created_at, updated_at)
VALUES (
  ${sqlText(moduleDefinition.id)},
  ${sqlText(moduleDefinition.name)},
  ${sqlText(moduleDefinition.description)},
  ${sqlText(moduleDefinition.category)},
  ${sqlText(moduleStatus)},
  ${sqlText(moduleDefinition.version)},
  ${sqlText(now)},
  ${sqlText(now)}
)
ON CONFLICT(module_id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  status = excluded.status,
  version = excluded.version,
  updated_at = excluded.updated_at;
`,
      `
INSERT INTO workspace_modules (workspace_id, module_id, status, enabled_at, disabled_at, updated_at)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlText(moduleDefinition.id)},
  ${sqlText(workspaceStatus)},
  ${moduleDefinition.enabledByDefault ? sqlText(now) : "NULL"},
  ${moduleDefinition.enabledByDefault ? "NULL" : sqlText(now)},
  ${sqlText(now)}
)
ON CONFLICT(workspace_id, module_id) DO NOTHING;
`,
    ];
  });

  if (statements.length > 0) {
    await runSql(statements.join("\n"));
  }

  for (const moduleDefinition of modules) {
    const existingModule = existingModulesById.get(moduleDefinition.id);

    if (!existingModule) {
      await runModuleLifecycleHook(moduleDefinition, "onModuleInstalled", { workspaceId });
    } else if (existingModule.version !== moduleDefinition.version) {
      await runModuleLifecycleHook(moduleDefinition, "onModuleUpdated", {
        previousVersion: existingModule.version,
        workspaceId,
      });
    }
  }

  await syncModulePermissionContracts();
}

async function syncModulePermissionContracts() {
  await permissionsRepository.ensurePermissionContracts(
    listModulePermissionEntries(),
    listModuleRolePermissionDefaults(),
  );
}

async function decorateWorkspaceSettings(settings, workspaceId) {
  const moduleContext = await readWorkspaceModuleContext(workspaceId);
  const moduleSettings = await readWorkspaceModuleSettings(workspaceId, settings, moduleContext);

  return {
    ...settings,
    workspaceId,
    workspace_id: workspaceId,
    tasksEnabled: moduleContext.moduleStatusById[TASKS_MODULE_ID] === "enabled",
    timeTrackingEnabled: moduleContext.moduleStatusById[TIME_TRACKING_MODULE_ID] === "enabled",
    enabledModules: moduleContext.enabledModules,
    moduleSettings,
    modules: moduleContext.modules,
  };
}

async function readWorkspaceModuleSettings(workspaceId, settings, moduleContext = null) {
  const [resolvedModuleContext, workspaceCapabilities] = await Promise.all([
    moduleContext || readWorkspaceModuleContext(workspaceId),
    readWorkspaceCapabilities(workspaceId),
  ]);
  const availableTools = new Set(workspaceCapabilities.availableTools || []);

  return resolvedModuleContext.modules
    .filter((moduleDefinition) => moduleSettingsMatchWorkspace(moduleDefinition, availableTools))
    .map((moduleDefinition) => ({
      moduleId: moduleDefinition.id,
      name: moduleDefinition.name,
      displayName: moduleDefinition.displayName,
      status: moduleDefinition.status,
      canDisable: moduleDefinition.canDisable,
      settings: (moduleDefinition.settings || []).map((setting) => ({
        ...setting,
        moduleId: moduleDefinition.id,
        readOnly: setting.readOnly === true || (setting.moduleStatus === true && moduleDefinition.canDisable === false),
        value: readModuleSettingValue(moduleDefinition, setting, settings),
      })),
    }))
    .filter((moduleDefinition) => moduleDefinition.settings.length > 0);
}

async function readWorkspaceModuleContext(workspaceId) {
  const installedModules = listModules();
  const rows = await querySql(`
SELECT module_id, status
FROM workspace_modules
WHERE workspace_id = ${sqlText(workspaceId)}
ORDER BY module_id;
`);
  const statusById = rows.reduce((statusMap, row) => {
    statusMap[row.module_id] = row.status === "enabled" ? "enabled" : "disabled";
    return statusMap;
  }, {});
  const modules = installedModules.map((moduleDefinition) => {
    const status = statusById[moduleDefinition.id] || "disabled";

    return {
      id: moduleDefinition.id,
      name: moduleDefinition.name,
      displayName: moduleDefinition.displayName || moduleDefinition.name,
      category: moduleDefinition.category,
      version: moduleDefinition.version,
      status,
      canDisable: moduleDefinition.canDisable !== false,
      historicalReadAccess: moduleDefinition.historicalReadAccess !== false,
      navigation: moduleDefinition.navigation || [],
      dashboard: moduleDefinition.dashboard || [],
      reporting: moduleDefinition.reporting || [],
      publicApiEndpoints: moduleDefinition.publicApiEndpoints || [],
      requiredPermissions: moduleDefinition.requiredPermissions || [],
      settings: moduleDefinition.settings || [],
      workspaceCapabilityRequirements: moduleDefinition.workspaceCapabilityRequirements || [],
    };
  });
  const moduleStatusById = modules.reduce((statusMap, moduleDefinition) => {
    statusMap[moduleDefinition.id] = moduleDefinition.status;
    return statusMap;
  }, {});

  return {
    enabledModules: modules
      .filter((moduleDefinition) => moduleDefinition.status === "enabled")
      .map((moduleDefinition) => moduleDefinition.id),
    moduleStatusById,
    modules,
  };
}

async function listEnabledModules(workspaceId) {
  const moduleContext = await readWorkspaceModuleContext(workspaceId);

  return moduleContext.modules.filter((moduleDefinition) => moduleDefinition.status === "enabled");
}

async function listAvailableApiScopes(workspaceId) {
  await syncModuleRegistry(workspaceId);
  const enabledModuleIds = new Set(await readEnabledModuleIds(workspaceId));

  return listModuleApiScopeEntries()
    .filter((scope) => enabledModuleIds.has(scope.moduleId))
    .map((scope) => ({
      id: scope.scope,
      scope: scope.scope,
      moduleId: scope.moduleId,
      label: scope.label,
      description: scope.description,
      access: scope.access,
    }));
}

async function readEnabledModuleIds(workspaceId) {
  const rows = await querySql(`
SELECT module_id
FROM workspace_modules
WHERE workspace_id = ${sqlText(workspaceId)}
  AND status = 'enabled'
ORDER BY module_id;
`);

  return rows.map((row) => row.module_id);
}

async function canReadModule(workspaceId, moduleId) {
  const moduleDefinition = getModule(moduleId);

  if (!moduleDefinition) {
    return false;
  }

  return moduleDefinition.historicalReadAccess !== false ||
    await readModuleStatus(workspaceId, moduleId) === "enabled";
}

async function canWriteModule(workspaceId, moduleId) {
  return Boolean(workspaceId && moduleId) &&
    await readModuleStatus(workspaceId, moduleId) === "enabled";
}

async function readModuleStatus(workspaceId, moduleId) {
  const rows = await querySql(`
SELECT status
FROM workspace_modules
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = ${sqlText(moduleId)}
LIMIT 1;
`);

  return rows[0]?.status === "enabled" ? "enabled" : "disabled";
}

async function setModuleStatus(workspaceId, moduleId, enabled, options = {}) {
  const moduleDefinition = getModule(moduleId);
  const previousStatus = await readModuleStatus(workspaceId, moduleId);
  const nextStatus = enabled ? "enabled" : "disabled";

  try {
    if (enabled) {
      await assertModuleCanBeEnabled(workspaceId, moduleId);
    } else {
      await assertModuleCanBeDisabled(workspaceId, moduleId);
    }
  } catch (error) {
    await recordModuleStateFailure(workspaceId, moduleDefinition, enabled, error, { ...options, moduleId });
    throw error;
  }

  if (previousStatus === nextStatus) {
    return;
  }

  const now = new Date().toISOString();

  await runSql(`
UPDATE workspace_modules
SET status = ${sqlText(nextStatus)},
    enabled_at = CASE WHEN ${sqlText(nextStatus)} = 'enabled' THEN COALESCE(enabled_at, ${sqlText(now)}) ELSE enabled_at END,
    disabled_at = CASE WHEN ${sqlText(nextStatus)} = 'disabled' THEN ${sqlText(now)} ELSE NULL END,
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = ${sqlText(moduleId)}
;
`);

  await runModuleLifecycleHook(moduleDefinition, enabled ? "onModuleEnabled" : "onModuleDisabled", {
    moduleId,
    nextStatus,
    previousStatus,
    session: options.session || null,
    workspaceId,
  });
  await recordModuleStateChanged(workspaceId, moduleDefinition, previousStatus, nextStatus, options);
}

async function assertModuleCanBeEnabled(workspaceId, moduleId) {
  const moduleDefinition = getModule(moduleId);

  if (!moduleDefinition) {
    throw new AppError(`Module '${moduleId}' is not registered.`, 400);
  }

  const missingFrameworkDependencies = (moduleDefinition.frameworkDependencies || [])
    .filter((dependencyId) => !AVAILABLE_FRAMEWORK_DEPENDENCIES.has(dependencyId));

  if (missingFrameworkDependencies.length > 0) {
    throw new AppError(
      `Module '${moduleId}' cannot be enabled because framework dependencies are unavailable: ${missingFrameworkDependencies.join(", ")}.`,
      400,
    );
  }

  const enabledModuleIds = new Set(await readEnabledModuleIds(workspaceId));
  const missingModuleDependencies = (moduleDefinition.moduleDependencies || [])
    .filter((dependencyId) => !enabledModuleIds.has(dependencyId));

  if (missingModuleDependencies.length > 0) {
    throw new AppError(
      `Module '${moduleId}' cannot be enabled because module dependencies are disabled: ${missingModuleDependencies.join(", ")}.`,
      400,
    );
  }
}

async function assertModuleCanBeDisabled(workspaceId, moduleId) {
  const moduleDefinition = getModule(moduleId);

  if (!moduleDefinition) {
    throw new AppError(`Module '${moduleId}' is not registered.`, 400);
  }

  if (moduleDefinition.canDisable === false) {
    throw new AppError(`Module '${moduleId}' cannot be disabled because it is a core framework module.`, 400);
  }

  const enabledModuleIds = new Set(await readEnabledModuleIds(workspaceId));
  const dependentModules = listModules().filter((candidate) => (
    candidate.id !== moduleId &&
    enabledModuleIds.has(candidate.id) &&
    (candidate.moduleDependencies || []).includes(moduleId)
  ));

  if (dependentModules.length > 0) {
    throw new AppError(
      `Module '${moduleId}' cannot be disabled because enabled modules depend on it: ${dependentModules.map((item) => item.id).join(", ")}.`,
      400,
    );
  }
}

async function runModuleLifecycleHook(moduleDefinition, hookName, context) {
  const hook = moduleDefinition?.hooks?.[hookName];

  if (typeof hook !== "function") {
    return null;
  }

  return hook({
    ...context,
    module: moduleDefinition,
    modulesService,
  });
}

async function recordModuleStateChanged(workspaceId, moduleDefinition, previousStatus, nextStatus, options) {
  const { auditService } = await import("../../services/audit.service.js");
  const moduleId = moduleDefinition?.id || options.moduleId || "";

  await auditService.record({
    session: options.session,
    workspaceId,
    action: nextStatus === "enabled" ? "module.enabled" : "module.disabled",
    changeType: "settings_change",
    recordType: "module",
    recordId: moduleId,
    recordLabel: moduleDefinition?.displayName || moduleDefinition?.name || moduleId,
    recordUrl: "workspace-settings.html",
    previousValue: {
      module_id: moduleId,
      status: previousStatus,
    },
    newValue: {
      module_id: moduleId,
      status: nextStatus,
    },
    metadata: {
      module_id: moduleId,
      workspace_id: workspaceId,
    },
    force: true,
  });
}

async function recordModuleStateFailure(workspaceId, moduleDefinition, enabling, error, options) {
  const { auditService } = await import("../../services/audit.service.js");
  const moduleId = moduleDefinition?.id || options.moduleId || "";

  await auditService.record({
    session: options.session,
    workspaceId,
    action: enabling ? "module.enable_failed" : "module.disable_failed",
    changeType: "settings_change",
    recordType: "module",
    recordId: moduleId,
    recordLabel: moduleDefinition?.displayName || moduleDefinition?.name || moduleId,
    recordUrl: "workspace-settings.html",
    previousValue: null,
    newValue: null,
    metadata: {
      error: error?.message || String(error),
      module_id: moduleId,
      workspace_id: workspaceId,
    },
    force: true,
  });
}

async function listModuleNavigation(workspaceId, session = null) {
  return listWorkspaceContributions(workspaceId, session, "navigation");
}

async function listModuleSettings(workspaceId, session = null) {
  return listWorkspaceContributions(workspaceId, session, "settings");
}

async function resolveProtectedModuleView(workspaceId, session, requestPath) {
  const pathName = normalizeViewPath(requestPath);

  if (!pathName) {
    return null;
  }

  const [moduleContext, workspaceCapabilities] = await Promise.all([
    readWorkspaceModuleContext(workspaceId),
    readWorkspaceCapabilities(workspaceId),
  ]);
  const moduleStatusById = moduleContext.moduleStatusById;
  const availableTools = new Set(workspaceCapabilities.availableTools || []);

  for (const view of listRegisteredModuleProtectedViews().map(normalizeViewContribution)) {
    if (normalizeViewPath(view.path) !== pathName) {
      continue;
    }

    const moduleDefinition = getModule(view.moduleId);

    if (!moduleDefinition) {
      return {
        status: "not_found",
        statusCode: 404,
        message: "Page not found.",
        view,
      };
    }

    const moduleStatus = moduleStatusById[view.moduleId] || "disabled";
    const disabledReadAllowed = view.allowDisabledRead === true && moduleDefinition.historicalReadAccess !== false;

    if (moduleStatus !== "enabled" && !disabledReadAllowed) {
      return {
        status: "module_disabled",
        statusCode: 403,
        message: `${moduleDefinition.displayName || moduleDefinition.name || view.moduleId} is disabled for this workspace.`,
        view,
      };
    }

    if (!requiredCapabilitiesAvailable(view, moduleDefinition, availableTools)) {
      return {
        status: "unavailable",
        statusCode: 404,
        message: "Page not found.",
        view,
      };
    }

    if (!(await requiredPermissionsAllowed(view, session))) {
      return {
        status: "unauthorized",
        statusCode: 403,
        message: "You do not have permission to view this page.",
        view,
      };
    }

    return {
      status: "ok",
      statusCode: 200,
      view,
    };
  }

  return null;
}

async function listWorkbenchCards(workspaceId, session = null) {
  const cards = await listWorkspaceContributions(workspaceId, session, "workbench");

  return cards.sort((left, right) => (
    Number(left.sortOrder) - Number(right.sortOrder) ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  ));
}

async function listTimerSources(workspaceId, session = null) {
  return listSourceContributions(workspaceId, session, "timerSources");
}

async function listWorkItemSources(workspaceId, session = null) {
  return listSourceContributions(workspaceId, session, "workItemSources");
}

async function getTimerSource(moduleId, sourceType) {
  return getSourceContribution(moduleId, sourceType, "timerSources");
}

async function getWorkItemSource(moduleId, sourceType) {
  return getSourceContribution(moduleId, sourceType, "workItemSources");
}

async function listSourceContributions(workspaceId, session, fieldName) {
  return listWorkspaceContributions(workspaceId, session, fieldName);
}

async function getSourceContribution(moduleId, sourceType, fieldName) {
  const moduleDefinition = getModule(moduleId);
  const source = (moduleDefinition?.[fieldName] || []).find((item) => item.sourceType === sourceType);

  return source ? normalizeContribution(moduleDefinition, source) : null;
}

async function listWorkspaceContributions(workspaceId, session, fieldName) {
  const [moduleContext, workspaceCapabilities] = await Promise.all([
    readWorkspaceModuleContext(workspaceId),
    readWorkspaceCapabilities(workspaceId),
  ]);
  const enabledModuleIds = new Set(moduleContext.enabledModules);
  const modulesById = new Map(listModules().map((moduleDefinition) => [moduleDefinition.id, moduleDefinition]));
  const availableTools = new Set(workspaceCapabilities.availableTools || []);
  const contributions = [];

  for (const moduleDefinition of modulesById.values()) {
    if (!enabledModuleIds.has(moduleDefinition.id)) {
      continue;
    }

    for (const contribution of moduleDefinition[fieldName] || []) {
      const normalized = normalizeContribution(moduleDefinition, contribution);

      if (!requiredModulesEnabled(normalized, enabledModuleIds)) {
        continue;
      }

      if (!requiredCapabilitiesAvailable(normalized, moduleDefinition, availableTools)) {
        continue;
      }

      if (!(await requiredPermissionsAllowed(normalized, session))) {
        continue;
      }

      contributions.push(normalized);
    }
  }

  return contributions;
}

function normalizeContribution(moduleDefinition, contribution) {
  return {
    ...contribution,
    moduleId: contribution.moduleId || moduleDefinition.id,
  };
}

function normalizeViewContribution(view) {
  return {
    ...view,
    path: normalizeViewPath(view.path),
    file: String(view.file || "").trim(),
  };
}

function normalizeAssetContribution(asset) {
  return {
    ...asset,
    path: String(asset.path || "").trim(),
    type: asset.type === "style" ? "style" : "script",
  };
}

function normalizeViewPath(value) {
  const pathName = String(value || "").trim();

  if (!pathName) {
    return "";
  }

  return pathName.startsWith("/") ? pathName : `/${pathName}`;
}

function moduleSettingsMatchWorkspace(moduleDefinition, availableTools) {
  const requiredCapabilities = moduleDefinition.workspaceCapabilityRequirements || [];

  if (requiredCapabilities.length === 0) {
    return true;
  }

  return requiredCapabilities.some((capability) => availableTools.has(capability));
}

function readModuleSettingValue(moduleDefinition, setting, settings) {
  if (setting.moduleStatus === true) {
    return moduleDefinition.status === "enabled";
  }

  if (setting.id === "taskTimersEnabled") {
    return settings.taskTimersEnabled !== false;
  }

  if (Object.hasOwn(settings, setting.id)) {
    return settings[setting.id];
  }

  return defaultSettingValue(setting);
}

function defaultSettingValue(setting) {
  if (Object.hasOwn(setting, "defaultValue")) {
    return setting.defaultValue;
  }

  if (setting.type === "boolean") {
    return false;
  }

  if (setting.type === "number") {
    return "";
  }

  if (setting.type === "multi-select") {
    return [];
  }

  return "";
}

function requiredModulesEnabled(contribution, enabledModuleIds) {
  const requiredModules = [
    contribution.moduleId,
    ...(contribution.requiresEnabledModules || []),
    ...(contribution.requiredModules || []),
  ];

  return requiredModules.every((moduleId) => !moduleId || enabledModuleIds.has(moduleId));
}

function requiredCapabilitiesAvailable(contribution, moduleDefinition, availableTools) {
  const contributionCapabilities = contribution.requiredWorkspaceCapabilities || [];
  const moduleCapabilities = moduleDefinition.workspaceCapabilityRequirements || [];
  const relevantCapabilities = contributionCapabilities.length > 0
    ? contributionCapabilities
    : moduleCapabilities;

  if (relevantCapabilities.length === 0) {
    return true;
  }

  return relevantCapabilities.some((capability) => availableTools.has(capability));
}

async function requiredPermissionsAllowed(contribution, session) {
  if (!session) {
    return true;
  }

  const requiredPermissions = contribution.requiredPermissions || [];
  const { permissionsService } = await import("../../services/permissions.service.js");

  for (const permissionId of requiredPermissions) {
    if (!(await permissionsService.can(session, permissionId, {
      workspace_id: session.workspace_id,
      operation: "read",
    }))) {
      return false;
    }
  }

  return true;
}

async function readWorkspaceCapabilities(workspaceId) {
  const rows = await querySql(`
SELECT workspace_type
FROM workspaces
WHERE workspace_id = ${sqlText(workspaceId)}
LIMIT 1;
`);

  return getWorkspaceCapabilities(rows[0]?.workspace_type);
}

export const modulesService = {
  canReadModule,
  canWriteModule,
  decorateWorkspaceSettings,
  getModule,
  getModuleForApiScope,
  getTimerSource,
  getWorkItemSource,
  listEnabledModules,
  listAvailableApiScopes,
  listModuleApiScopes,
  listModuleApiScopeEntries,
  listModuleMigrationSources,
  listModulePermissionEntries,
  listModuleNavigation,
  listModulePermissions,
  listModuleRouteEntries,
  listModuleRoutes,
  listModules,
  listModuleBrowserAssets,
  listModuleSettings,
  listNotificationEvents,
  listModulePublicViews,
  listModuleResourceDefinitions,
  listModuleRolePermissionDefaults,
  listNotificationTemplates,
  listSearchableTypes,
  listTaggableTypes,
  listTimerSources,
  listWorkbenchCards,
  listWorkItemSources,
  readEnabledModuleIds,
  resolveProtectedModuleView,
  readModuleStatus,
  readWorkspaceModuleSettings,
  readWorkspaceModuleContext,
  setModuleStatus,
  syncModuleRegistry,
};
