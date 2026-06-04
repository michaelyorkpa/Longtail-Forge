import {
  getModule as getRegisteredModule,
  listModuleApiScopes as listRegisteredModuleApiScopes,
  listModuleMigrationSources,
  listModulePermissions as listRegisteredModulePermissions,
  listModuleRoutes as listRegisteredModuleRoutes,
  listModules as listRegisteredModules,
  listNotificationEvents as listRegisteredNotificationEvents,
  listNotificationTemplates as listRegisteredNotificationTemplates,
  listSearchableTypes as listRegisteredSearchableTypes,
  listTaggableTypes as listRegisteredTaggableTypes,
} from "./registry.js";
import { querySql, runSql, sqlText } from "../../db/sqlite.js";
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

function listModulePermissions() {
  return listRegisteredModulePermissions();
}

function listModuleApiScopes() {
  return listRegisteredModuleApiScopes();
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

async function syncModuleRegistry(workspaceId) {
  const modules = listModules();
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
}

async function decorateWorkspaceSettings(settings, workspaceId) {
  const moduleContext = await readWorkspaceModuleContext(workspaceId);

  return {
    ...settings,
    workspaceId,
    workspace_id: workspaceId,
    tasksEnabled: moduleContext.moduleStatusById[TASKS_MODULE_ID] === "enabled",
    timeTrackingEnabled: moduleContext.moduleStatusById[TIME_TRACKING_MODULE_ID] === "enabled",
    enabledModules: moduleContext.enabledModules,
    modules: moduleContext.modules,
  };
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

async function setModuleStatus(workspaceId, moduleId, enabled) {
  if (enabled) {
    await assertModuleCanBeEnabled(workspaceId, moduleId);
  }

  const now = new Date().toISOString();
  const status = enabled ? "enabled" : "disabled";

  await runSql(`
UPDATE workspace_modules
SET status = ${sqlText(status)},
    enabled_at = CASE WHEN ${sqlText(status)} = 'enabled' THEN COALESCE(enabled_at, ${sqlText(now)}) ELSE enabled_at END,
    disabled_at = CASE WHEN ${sqlText(status)} = 'disabled' THEN ${sqlText(now)} ELSE NULL END,
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = ${sqlText(moduleId)}
;
`);
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

async function listModuleNavigation(workspaceId, session = null) {
  return listWorkspaceContributions(workspaceId, session, "navigation");
}

async function listModuleSettings(workspaceId, session = null) {
  return listWorkspaceContributions(workspaceId, session, "settings");
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
  getTimerSource,
  getWorkItemSource,
  listEnabledModules,
  listModuleApiScopes,
  listModuleMigrationSources,
  listModuleNavigation,
  listModulePermissions,
  listModuleRoutes,
  listModules,
  listModuleSettings,
  listNotificationEvents,
  listNotificationTemplates,
  listSearchableTypes,
  listTaggableTypes,
  listTimerSources,
  listWorkbenchCards,
  listWorkItemSources,
  readEnabledModuleIds,
  readModuleStatus,
  readWorkspaceModuleContext,
  setModuleStatus,
  syncModuleRegistry,
};
