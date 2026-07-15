import {
  getModule as getRegisteredModule,
  listModuleBrowserAssets as listRegisteredModuleBrowserAssets,
  listModuleApiScopeEntries as listRegisteredModuleApiScopeEntries,
  listModuleAuditRecordTypes as listRegisteredModuleAuditRecordTypes,
  listModuleEventHooks as listRegisteredModuleEventHooks,
  listModuleEventSummaries as listRegisteredModuleEventSummaries,
  listModuleEventTypes as listRegisteredModuleEventTypes,
  listHelpArticles as listRegisteredHelpArticles,
  listHelpContributions as listRegisteredHelpContributions,
  listHelpSections as listRegisteredHelpSections,
  listModuleApiScopes as listRegisteredModuleApiScopes,
  listModuleMigrationSources,
  listModulePermissionEntries as listRegisteredModulePermissionEntries,
  listModulePermissions as listRegisteredModulePermissions,
  listModuleProtectedViews as listRegisteredModuleProtectedViews,
  listModuleViewSurfaces as listRegisteredModuleViewSurfaces,
  listModulePublicViews as listRegisteredModulePublicViews,
  listModuleResourceDefinitions as listRegisteredModuleResourceDefinitions,
  listModuleRolePermissionDefaults as listRegisteredModuleRolePermissionDefaults,
  listModuleRouteEntries as listRegisteredModuleRouteEntries,
  listModuleRoutes as listRegisteredModuleRoutes,
  listModules as listRegisteredModules,
  listLinkedContextProviders as listRegisteredLinkedContextProviders,
  listNotificationEvents as listRegisteredNotificationEvents,
  listNotificationFollowTargets as listRegisteredNotificationFollowTargets,
  listNotificationTemplates as listRegisteredNotificationTemplates,
  listAttachableTypes as listRegisteredAttachableTypes,
  listSearchableTypes as listRegisteredSearchableTypes,
  listTagPropagationRules as listRegisteredTagPropagationRules,
  listTaggableTypes as listRegisteredTaggableTypes,
} from "./registry.js";
import { withAssetVersion } from "../asset-version.js";
import { internalEventBus } from "../events/event-bus.js";
import { resolveContributionTerminology, resolveModuleDefinitionTerminology } from "./terminology.js";
import {
  FRAMEWORK_VIEW_SURFACE_MODULE_ID,
  listFrameworkProtectedViews,
  listFrameworkViewSurfaces,
} from "../view-surfaces/framework-view-surfaces.js";
import {
  listFrameworkPermissionEntries,
  listFrameworkResourceDefinitions,
  listFrameworkRolePermissionDefaults,
} from "../permissions/framework-permission-catalog.js";
import { db } from "../database.js";
import { permissionsRepository } from "../../repositories/permissions.repo.js";
import { AppError } from "../../utils/app-error.js";
import { getWorkspaceCapabilities } from "../../utils/workspaces.js";

const MODULE_INSERT_COLUMNS = [
  "module_id",
  "name",
  "description",
  "category",
  "status",
  "version",
  "created_at",
  "updated_at",
];
const MODULE_INSERT_VALUE_EXPRESSIONS = {
  module_id: ":moduleId",
  name: ":name",
  description: ":description",
  category: ":category",
  status: ":status",
  version: ":version",
  created_at: ":createdAt",
  updated_at: ":updatedAt",
};
const MODULE_UPSERT_SQL = `${db.dialect.conflict.buildInsertOnConflictDoUpdate({
  columns: MODULE_INSERT_COLUMNS,
  conflictColumns: ["module_id"],
  tableName: "modules",
  updateColumns: ["name", "description", "category", "status", "version", "updated_at"],
  valueExpressions: MODULE_INSERT_VALUE_EXPRESSIONS,
})};`;
const WORKSPACE_MODULE_INSERT_COLUMNS = [
  "workspace_id",
  "module_id",
  "status",
  "enabled_at",
  "disabled_at",
  "updated_at",
];
const WORKSPACE_MODULE_INSERT_VALUE_EXPRESSIONS = {
  workspace_id: ":workspaceId",
  module_id: ":moduleId",
  status: ":status",
  enabled_at: ":enabledAt",
  disabled_at: ":disabledAt",
  updated_at: ":updatedAt",
};
const WORKSPACE_MODULE_INSERT_SQL = `${db.dialect.conflict.buildInsertOnConflictDoNothing({
  columns: WORKSPACE_MODULE_INSERT_COLUMNS,
  conflictColumns: ["workspace_id", "module_id"],
  tableName: "workspace_modules",
  valueExpressions: WORKSPACE_MODULE_INSERT_VALUE_EXPRESSIONS,
})};`;
const FRAMEWORK_VIEW_SURFACE_MODULE = Object.freeze({
  id: FRAMEWORK_VIEW_SURFACE_MODULE_ID,
  workspaceCapabilityRequirements: [],
});
let moduleEventHookUnsubscribers = [];
let moduleEventHooksRegistered = false;
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

function listPermissionEntries() {
  return [
    ...listFrameworkPermissionEntries(),
    ...listModulePermissionEntries(),
  ];
}

function listRolePermissionDefaults() {
  return [
    ...listFrameworkRolePermissionDefaults(),
    ...listModuleRolePermissionDefaults(),
  ];
}

function listResourceDefinitions() {
  return [
    ...listFrameworkResourceDefinitions(),
    ...listModuleResourceDefinitions(),
  ];
}

async function listActiveResourceDefinitions(workspaceId, session = null) {
  if (!workspaceId) {
    return [];
  }

  const [moduleResources, workspaceCapabilities] = await Promise.all([
    listWorkspaceContributions(workspaceId, session, "resourceDefinitions"),
    readWorkspaceCapabilities(workspaceId),
  ]);
  const workspaceType = workspaceCapabilities.workspaceType || "business";
  const frameworkResources = [];

  for (const resource of listFrameworkResourceDefinitions()) {
    const resolvedResource = resolveContributionTerminology(resource, workspaceType, "resourceDefinitions");

    if (await requiredPermissionsAllowed(resolvedResource, session)) {
      frameworkResources.push(resolvedResource);
    }
  }

  return [...frameworkResources, ...moduleResources]
    .map(normalizeResourceDefinition)
    .sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key));
}

function normalizeResourceDefinition(resource) {
  return {
    key: String(resource.key || "").trim(),
    moduleId: String(resource.moduleId || "").trim(),
    label: String(resource.label || resource.key || "").trim(),
    operations: [...new Set((resource.operations || []).map((operation) => String(operation || "").trim()).filter(Boolean))],
  };
}

function listModuleApiScopes() {
  return listRegisteredModuleApiScopes();
}

function listModuleApiScopeEntries() {
  return listRegisteredModuleApiScopeEntries();
}

function listModuleAuditRecordTypes() {
  return listRegisteredModuleAuditRecordTypes();
}

function listModuleEventHooks() {
  return listRegisteredModuleEventHooks().map(({ handler: _handler, ...hook }) => hook);
}

function listModuleEventSummaries() {
  return listRegisteredModuleEventSummaries();
}

function listModuleEventTypes() {
  return listRegisteredModuleEventTypes();
}

function onInternalEvent(eventName, handler, options = {}) {
  return internalEventBus.on(eventName, handler, options);
}

function getModuleForApiScope(scope) {
  return listModuleApiScopeEntries().find((entry) => entry.scope === scope)?.moduleId || "";
}

function listTaggableTypes() {
  return listRegisteredTaggableTypes();
}

function listTagPropagationRules() {
  return listRegisteredTagPropagationRules();
}

async function listActiveTagPropagationRules(workspaceId) {
  if (!workspaceId) {
    return [];
  }

  const enabledModuleIds = new Set(await readEnabledModuleIds(workspaceId));

  return listTagPropagationRules().filter((rule) => (
    enabledModuleIds.has(rule.sourceModuleId) &&
    enabledModuleIds.has(rule.targetModuleId) &&
    requiredModulesEnabled(rule, enabledModuleIds)
  ));
}

function listSearchableTypes() {
  return listRegisteredSearchableTypes();
}

function listAttachableTypes() {
  return listRegisteredAttachableTypes();
}

function listLinkedContextProviders() {
  return listRegisteredLinkedContextProviders();
}

async function listActiveLinkedContextProviders(workspaceId, session = null) {
  if (!workspaceId) {
    return [];
  }

  const providers = await listWorkspaceContributions(workspaceId, session, "linkedContextProviders");
  return providers.sort((left, right) => (
    String(left.targetType || "").localeCompare(String(right.targetType || "")) ||
    String(left.label || "").localeCompare(String(right.label || "")) ||
    String(left.id || "").localeCompare(String(right.id || ""))
  ));
}

async function listActiveAttachableTypes(workspaceId) {
  if (!workspaceId) {
    return [];
  }

  const enabledModuleIds = new Set(await readEnabledModuleIds(workspaceId));
  const workspaceCapabilities = await readWorkspaceCapabilities(workspaceId);
  const workspaceType = workspaceCapabilities.workspaceType || "business";

  return listAttachableTypes()
    .filter((type) => requiredModulesEnabled(type, enabledModuleIds))
    .filter((type) => contributionSupportsWorkspaceType(type, workspaceType));
}

function listHelpSections() {
  return listRegisteredHelpSections();
}

function listHelpArticles() {
  return listRegisteredHelpArticles();
}

function listHelpContributions() {
  return listRegisteredHelpContributions();
}

async function listActiveHelpContributions(workspaceId, session = null) {
  const [sections, articles] = await Promise.all([
    listActiveHelpSections(workspaceId, session),
    listActiveHelpArticles(workspaceId, session),
  ]);

  return { sections, articles };
}

async function listActiveHelpSections(workspaceId, session = null) {
  return listActiveHelpItems(workspaceId, session, listHelpSections());
}

async function listActiveHelpArticles(workspaceId, session = null) {
  return listActiveHelpItems(workspaceId, session, listHelpArticles());
}

async function listActiveSearchableTypes(workspaceId) {
  if (!workspaceId) {
    return [];
  }

  const enabledModuleIds = new Set(await readEnabledModuleIds(workspaceId));

  return listSearchableTypes()
    .filter((type) => requiredModulesEnabled(type, enabledModuleIds));
}

function listNotificationEvents() {
  return listRegisteredNotificationEvents();
}

function listNotificationFollowTargets() {
  return listRegisteredNotificationFollowTargets();
}

function listNotificationTemplates() {
  return listRegisteredNotificationTemplates();
}

function listModuleSettingsForWorkspaceType(workspaceType = "business") {
  const workspaceCapabilities = getWorkspaceCapabilities(workspaceType);
  const availableTools = new Set(workspaceCapabilities.availableTools || []);
  const moduleDefinitions = listModules()
    .map((rawModuleDefinition) => resolveModuleDefinitionTerminology(rawModuleDefinition, workspaceCapabilities.workspaceType))
    .filter((moduleDefinition) => moduleSettingsMatchWorkspace(moduleDefinition, availableTools));
  const moduleStatusById = Object.fromEntries(moduleDefinitions.map((moduleDefinition) => [
    moduleDefinition.id,
    moduleDefinition.enabledByDefault ? "enabled" : "disabled",
  ]));

  return moduleDefinitions
    .map((moduleDefinition) => {
      const status = moduleDefinition.enabledByDefault ? "enabled" : "disabled";
      const decoratedModule = {
        ...moduleDefinition,
        status,
        canDisable: moduleDefinition.canDisable !== false,
      };

      return {
        moduleId: moduleDefinition.id,
        name: moduleDefinition.name,
        displayName: moduleDefinition.displayName,
        status,
        canDisable: moduleDefinition.canDisable !== false,
        settings: (moduleDefinition.settings || []).map((setting) =>
          decorateModuleSetting(decoratedModule, setting, {}, moduleStatusById),
        ),
      };
    })
    .filter((moduleDefinition) => moduleDefinition.settings.length > 0);
}

function listModulePublicViews() {
  return listRegisteredModulePublicViews().map(normalizeViewContribution);
}

function listModuleBrowserAssets() {
  return listRegisteredModuleBrowserAssets().map(normalizeAssetContribution);
}

async function listActiveModuleBrowserAssets(workspaceId, session = null, viewTarget = "") {
  const assets = await listWorkspaceContributions(workspaceId, session, "browserAssets");
  const normalizedTarget = String(viewTarget || "").trim();

  return assets
    .filter((asset) => !normalizedTarget || asset.views?.includes(normalizedTarget))
    .map(normalizeAssetContribution)
    .sort((left, right) => left.moduleId.localeCompare(right.moduleId) || left.id.localeCompare(right.id));
}

async function syncModuleRegistry(workspaceId) {
  registerModuleEventHooks();
  const modules = listModules();
  const existingModuleRows = await db.query("SELECT module_id, version FROM modules;");
  const existingModulesById = new Map(existingModuleRows.map((row) => [row.module_id, row]));
  const now = new Date().toISOString();

  await db.transaction(async (transaction) => {
    for (const moduleDefinition of modules) {
      await transaction.run(MODULE_UPSERT_SQL, moduleSyncParams(moduleDefinition, now));
    }

    await syncWorkspaceModuleRows(transaction, workspaceId, modules, now);
    await repairRequiredWorkspaceModules(workspaceId, modules, now, transaction);
  });

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
    listPermissionEntries(),
    listRolePermissionDefaults(),
  );
}

async function decorateWorkspaceSettings(settings, workspaceId) {
  const moduleContext = await readWorkspaceModuleContext(workspaceId);
  const moduleSettings = await readWorkspaceModuleSettings(workspaceId, settings, moduleContext);

  return {
    ...settings,
    workspaceId,
    workspace_id: workspaceId,
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
      settings: (moduleDefinition.settings || []).map((setting) =>
        decorateModuleSetting(moduleDefinition, setting, settings, resolvedModuleContext.moduleStatusById),
      ),
    }))
    .filter((moduleDefinition) => moduleDefinition.settings.length > 0);
}

async function readWorkspaceModuleContext(workspaceId) {
  const installedModules = listModules();
  await ensureWorkspaceModuleRows(workspaceId, installedModules);
  const [rows, workspaceCapabilities] = await Promise.all([
    db.query(`
SELECT module_id, status
FROM workspace_modules
WHERE workspace_id = :workspaceId
ORDER BY module_id;
`, { workspaceId: text(workspaceId) }),
    readWorkspaceCapabilities(workspaceId),
  ]);
  const workspaceType = workspaceCapabilities.workspaceType || "business";
  const statusById = rows.reduce((statusMap, row) => {
    statusMap[row.module_id] = row.status === "enabled" ? "enabled" : "disabled";
    return statusMap;
  }, {});
  const modules = installedModules.map((rawModuleDefinition) => {
    const moduleDefinition = resolveModuleDefinitionTerminology(rawModuleDefinition, workspaceType);
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
      viewSurfaces: moduleDefinition.viewSurfaces || [],
      dashboard: moduleDefinition.dashboard || [],
      reporting: moduleDefinition.reporting || [],
      publicApiEndpoints: moduleDefinition.publicApiEndpoints || [],
      requiredPermissions: moduleDefinition.requiredPermissions || [],
      settings: moduleDefinition.settings || [],
      permissions: moduleDefinition.permissions || [],
      resourceDefinitions: moduleDefinition.resourceDefinitions || [],
      apiScopes: moduleDefinition.apiScopes || [],
      eventTypes: moduleDefinition.eventTypes || [],
      eventSummaries: moduleDefinition.eventSummaries || [],
      timerSources: moduleDefinition.timerSources || [],
      workItemSources: moduleDefinition.workItemSources || [],
      terminology: moduleDefinition.terminology || {},
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
  const [enabledModuleIds, workspaceCapabilities] = await Promise.all([
    readEnabledModuleIds(workspaceId),
    readWorkspaceCapabilities(workspaceId),
  ]);
  const enabledModuleIdSet = new Set(enabledModuleIds);
  const workspaceType = workspaceCapabilities.workspaceType || "business";

  return listModuleApiScopeEntries()
    .filter((scope) => enabledModuleIdSet.has(scope.moduleId))
    .filter((scope) => apiScopeSupportsWorkspaceType(scope, workspaceType))
    .map((scope) => {
      const resolvedScope = resolveContributionTerminology(scope, workspaceType, "apiScopes");

      return {
        id: scope.scope,
        scope: scope.scope,
        moduleId: scope.moduleId,
        label: resolvedScope.label,
        description: resolvedScope.description,
        access: scope.access,
      };
    });
}

function apiScopeSupportsWorkspaceType(scope, workspaceType) {
  return contributionSupportsWorkspaceType(scope, workspaceType);
}

function contributionSupportsWorkspaceType(contribution, workspaceType) {
  if (Array.isArray(contribution.workspaceTypes) && contribution.workspaceTypes.length > 0) {
    return contribution.workspaceTypes.includes(workspaceType);
  }

  return true;
}

async function readEnabledModuleIds(workspaceId) {
  const rows = await db.query(`
SELECT module_id
FROM workspace_modules
WHERE workspace_id = :workspaceId
  AND status = 'enabled'
ORDER BY module_id;
`, { workspaceId: text(workspaceId) });

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
  const moduleDefinition = getModule(moduleId);

  if (!workspaceId || !moduleDefinition) {
    return "disabled";
  }

  await ensureWorkspaceModuleRows(workspaceId, [moduleDefinition]);

  const rows = await db.query(`
SELECT status
FROM workspace_modules
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
LIMIT 1;
`, {
    moduleId: text(moduleId),
    workspaceId: text(workspaceId),
  });

  return rows[0]?.status === "enabled" ? "enabled" : "disabled";
}

async function ensureWorkspaceModuleRows(workspaceId, modules) {
  const moduleDefinitions = modules.filter(Boolean);

  if (!workspaceId || moduleDefinitions.length === 0) {
    return;
  }

  const now = new Date().toISOString();

  await db.transaction(async (transaction) => {
    await syncWorkspaceModuleRows(transaction, workspaceId, moduleDefinitions, now);
    await repairRequiredWorkspaceModules(workspaceId, moduleDefinitions, now, transaction);
  });
}

async function syncWorkspaceModuleRows(database, workspaceId, modules, now) {
  for (const moduleDefinition of modules) {
    const workspaceStatus = moduleDefinition.enabledByDefault ? "enabled" : "disabled";

    await database.run(WORKSPACE_MODULE_INSERT_SQL, {
      disabledAt: moduleDefinition.enabledByDefault ? null : text(now),
      enabledAt: moduleDefinition.enabledByDefault ? text(now) : null,
      moduleId: text(moduleDefinition.id),
      status: workspaceStatus,
      updatedAt: text(now),
      workspaceId: text(workspaceId),
    });
  }
}

async function repairRequiredWorkspaceModules(workspaceId, modules, now, database = db) {
  const requiredModuleIds = modules
    .filter((moduleDefinition) => moduleDefinition.canDisable === false)
    .map((moduleDefinition) => moduleDefinition.id);

  if (requiredModuleIds.length === 0) {
    return;
  }

  await database.run(`
UPDATE workspace_modules
SET status = 'enabled',
    enabled_at = COALESCE(enabled_at, :now),
    disabled_at = NULL,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND module_id IN (:requiredModuleIds)
  AND status <> 'enabled';
`, {
    now: text(now),
    requiredModuleIds: normalizeIdList(requiredModuleIds),
    workspaceId: text(workspaceId),
  });
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

  await db.run(`
UPDATE workspace_modules
SET status = :nextStatus,
    enabled_at = CASE WHEN :nextStatus = 'enabled' THEN COALESCE(enabled_at, :now) ELSE enabled_at END,
    disabled_at = CASE WHEN :nextStatus = 'disabled' THEN :now ELSE NULL END,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
;
`, {
    moduleId: text(moduleId),
    nextStatus,
    now: text(now),
    workspaceId: text(workspaceId),
  });

  await runModuleLifecycleHook(moduleDefinition, enabled ? "onModuleEnabled" : "onModuleDisabled", {
    moduleId,
    nextStatus,
    previousStatus,
    session: options.session || null,
    workspaceId,
  });
  await recordModuleStateChanged(workspaceId, moduleDefinition, previousStatus, nextStatus, options);
  await emitInternalEvent(nextStatus === "enabled" ? "module.enabled" : "module.disabled", {
    session: options.session || null,
    workspaceId,
    moduleId,
    recordType: "module",
    recordId: moduleId,
    previousValue: {
      module_id: moduleId,
      status: previousStatus,
    },
    newValue: {
      module_id: moduleId,
      status: nextStatus,
    },
    source: options.source || "manual",
    metadata: {
      module_id: moduleId,
      workspace_id: workspaceId,
    },
  });
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

  try {
    return await hook({
      ...context,
      module: moduleDefinition,
      modulesService,
    });
  } catch (error) {
    console.error(`[modules] Lifecycle hook '${hookName}' failed for '${moduleDefinition?.id || "unknown"}':`, error);
    return null;
  }
}

function registerModuleEventHooks(options = {}) {
  if (moduleEventHooksRegistered && !options.force) {
    return listModuleEventHooks();
  }

  for (const unsubscribe of moduleEventHookUnsubscribers) {
    unsubscribe();
  }

  moduleEventHookUnsubscribers = [];

  for (const hook of listRegisteredModuleEventHooks()) {
    moduleEventHookUnsubscribers.push(internalEventBus.on(hook.event, async (event) => {
      const moduleDefinition = getModule(hook.moduleId);
      await hook.handler({
        event,
        module: moduleDefinition,
        modulesService,
      });
    }, {
      id: hook.id,
      moduleId: hook.moduleId,
    }));
  }

  moduleEventHooksRegistered = true;
  return listModuleEventHooks();
}

async function emitInternalEvent(eventName, payload = {}) {
  registerModuleEventHooks();
  return internalEventBus.emit(eventName, payload);
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
  return listSettingsContributions(workspaceId, session);
}

async function listSettingsContributions(workspaceId, session = null) {
  const settings = await listWorkspaceContributions(workspaceId, session, "settings");

  return settings.map((setting) => ({
    ...setting,
    target: setting.target || "module",
  })).sort((left, right) => (
    left.placement.localeCompare(right.placement) ||
    left.moduleId.localeCompare(right.moduleId) ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  ));
}

async function listModuleSettingsNavigation(workspaceId, session = null) {
  const [moduleContext, workspaceCapabilities] = await Promise.all([
    readWorkspaceModuleContext(workspaceId),
    readWorkspaceCapabilities(workspaceId),
  ]);
  const enabledModuleIds = new Set(moduleContext.enabledModules);
  const availableTools = new Set(workspaceCapabilities.availableTools || []);
  const modulesById = new Map(listModules().map((moduleDefinition) => [moduleDefinition.id, moduleDefinition]));
  const workspaceType = workspaceCapabilities.workspaceType || "business";
  const items = [];

  for (const view of listRegisteredModuleProtectedViews().map(normalizeViewContribution)) {
    const moduleDefinition = modulesById.get(view.moduleId);

    if (!moduleDefinition || !enabledModuleIds.has(view.moduleId) || !isModuleSettingsView(view)) {
      continue;
    }

    if (!requiredCapabilitiesAvailable(view, moduleDefinition, availableTools)) {
      continue;
    }

    if (!(await requiredPermissionsAllowed(view, session))) {
      continue;
    }

    const resolvedModule = resolveModuleDefinitionTerminology(moduleDefinition, workspaceType);

    items.push({
      id: view.id,
      label: resolvedModule.shortLabel || resolvedModule.displayName || resolvedModule.name,
      href: view.path.replace(/^\//, ""),
      moduleId: view.moduleId,
    });
  }

  return items.sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
}

async function listActiveViewSurfaces(workspaceId, session = null) {
  if (!workspaceId) {
    return [];
  }

  const [moduleContext, workspaceCapabilities] = await Promise.all([
    readWorkspaceModuleContext(workspaceId),
    readWorkspaceCapabilities(workspaceId),
  ]);
  const enabledModuleIds = new Set(moduleContext.enabledModules);
  const availableTools = new Set(workspaceCapabilities.availableTools || []);
  const workspaceType = workspaceCapabilities.workspaceType || "business";
  const modulesById = new Map(listModules().map((moduleDefinition) => [moduleDefinition.id, moduleDefinition]));
  const protectedViewsByKey = new Map([
    ...listRegisteredModuleProtectedViews().map(normalizeViewContribution),
    ...listFrameworkProtectedViews().map(normalizeViewContribution),
  ].map((view) => [`${view.moduleId}:${view.id}`, view]));
  const viewSurfaceEntries = [
    ...listRegisteredModuleViewSurfaces().map((surface) => ({ surface, frameworkOwned: false })),
    ...listFrameworkViewSurfaces().map((surface) => ({ surface, frameworkOwned: true })),
  ];
  const surfaces = [];

  for (const { surface, frameworkOwned } of viewSurfaceEntries) {
    const moduleDefinition = frameworkOwned
      ? FRAMEWORK_VIEW_SURFACE_MODULE
      : modulesById.get(surface.moduleId);
    const protectedView = protectedViewsByKey.get(`${surface.moduleId}:${surface.viewId}`);

    if (!frameworkOwned && (!moduleDefinition || !protectedView || !enabledModuleIds.has(surface.moduleId))) {
      continue;
    }

    if (frameworkOwned && (!moduleDefinition || !protectedView)) {
      continue;
    }

    if (!requiredModulesEnabled(frameworkOwned ? omitOwningModuleRequirement(surface) : surface, enabledModuleIds)) {
      continue;
    }

    if (!requiredCapabilitiesAvailable(protectedView, moduleDefinition, availableTools)) {
      continue;
    }

    if (!requiredCapabilitiesAvailable(surface, moduleDefinition, availableTools)) {
      continue;
    }

    if (!(await requiredPermissionsAllowed(protectedView, session))) {
      continue;
    }

    if (!(await requiredPermissionsAllowed(surface, session))) {
      continue;
    }

    surfaces.push(normalizeViewSurfaceContribution(
      moduleDefinition,
      resolveContributionTerminology(surface, workspaceType, "viewSurfaces"),
      protectedView,
    ));
  }

  return surfaces.sort((left, right) => left.moduleId.localeCompare(right.moduleId) || left.id.localeCompare(right.id));
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

async function listDashboardPanels(workspaceId, session = null) {
  const panels = await listWorkspaceContributions(workspaceId, session, "dashboard");

  return panels.map(normalizeDashboardPanel).sort((left, right) => (
    Number(left.sortOrder) - Number(right.sortOrder) ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  ));
}

async function listReportingReports(workspaceId, session = null) {
  const reports = await listWorkspaceContributions(workspaceId, session, "reporting");

  return reports.sort((left, right) => (
    Number(left.sortOrder) - Number(right.sortOrder) ||
    String(left.category || "").localeCompare(String(right.category || "")) ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  ));
}

function normalizeDashboardPanel(panel) {
  return {
    ...panel,
    placement: String(panel.placement || "").trim() || "main",
  };
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
  const workspaceType = workspaceCapabilities.workspaceType || "business";
  const contributions = [];

  for (const moduleDefinition of modulesById.values()) {
    if (!enabledModuleIds.has(moduleDefinition.id)) {
      continue;
    }

    for (const contribution of moduleDefinition[fieldName] || []) {
      const normalized = normalizeContribution(
        moduleDefinition,
        resolveContributionTerminology(contribution, workspaceType, fieldName),
      );

      if (!moduleContributionRequirementsAvailable(normalized, moduleDefinition, {
        availableTools,
        enabledModuleIds,
      })) {
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

function moduleContributionRequirementsAvailable(contribution, moduleDefinition, context = {}) {
  const enabledModuleIds = context.enabledModuleIds instanceof Set
    ? context.enabledModuleIds
    : new Set(context.enabledModuleIds || []);
  const availableTools = context.availableTools instanceof Set
    ? context.availableTools
    : new Set(context.availableTools || []);

  return requiredModulesEnabled(contribution, enabledModuleIds) &&
    requiredCapabilitiesAvailable(contribution, moduleDefinition, availableTools);
}

async function listActiveHelpItems(workspaceId, session, items) {
  if (!workspaceId) {
    return [];
  }

  const [enabledModuleIds, workspaceCapabilities] = await Promise.all([
    readEnabledModuleIds(workspaceId),
    readWorkspaceCapabilities(workspaceId),
  ]);
  const enabledModuleIdSet = new Set(enabledModuleIds);
  const availableTools = new Set(workspaceCapabilities.availableTools || []);
  const workspaceType = workspaceCapabilities.workspaceType || "business";
  const modulesById = new Map(listModules().map((moduleDefinition) => [moduleDefinition.id, moduleDefinition]));
  const activeItems = [];

  for (const item of items) {
    if (!requiredModulesEnabled(item, enabledModuleIdSet)) {
      continue;
    }

    const moduleDefinition = modulesById.get(item.moduleId);
    const resolvedItem = resolveContributionTerminology(item, workspaceType, "help");

    if (moduleDefinition && !requiredCapabilitiesAvailable(resolvedItem, moduleDefinition, availableTools)) {
      continue;
    }

    if (!(await requiredPermissionsAllowed(resolvedItem, session))) {
      continue;
    }

    activeItems.push(normalizeContribution(moduleDefinition || { id: item.moduleId || "" }, resolvedItem));
  }

  return activeItems;
}

function normalizeContribution(moduleDefinition, contribution) {
  return {
    ...contribution,
    moduleId: contribution.moduleId || moduleDefinition.id,
  };
}

function normalizeViewSurfaceContribution(moduleDefinition, surface, protectedView) {
  return {
    ...surface,
    moduleId: surface.moduleId || moduleDefinition.id,
    viewId: surface.viewId,
    viewPath: protectedView.path.replace(/^\//, ""),
  };
}

function normalizeViewContribution(view) {
  return {
    ...view,
    path: normalizeViewPath(view.path),
    file: String(view.file || "").trim(),
  };
}

function omitOwningModuleRequirement(contribution) {
  const { moduleId: _moduleId, ...rest } = contribution;

  return rest;
}

function normalizeAssetContribution(asset) {
  return {
    ...asset,
    path: withAssetVersion(asset.path),
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

  if (Object.hasOwn(settings, setting.id)) {
    return settings[setting.id];
  }

  return defaultSettingValue(setting);
}

function decorateModuleSetting(moduleDefinition, setting, settings, moduleStatusById = {}) {
  const statusMetadata = setting.moduleStatus === true
    ? readModuleStatusSettingMetadata(moduleDefinition, moduleStatusById)
    : { readOnly: false, readOnlyReason: "" };

  return {
    ...setting,
    moduleId: moduleDefinition.id,
    readOnly: setting.readOnly === true || statusMetadata.readOnly,
    readOnlyReason: setting.readOnlyReason || setting.disabledReason || statusMetadata.readOnlyReason,
    value: readModuleSettingValue(moduleDefinition, setting, settings),
  };
}

function readModuleStatusSettingMetadata(moduleDefinition, moduleStatusById) {
  if (moduleDefinition.canDisable === false) {
    return {
      readOnly: true,
      readOnlyReason: "Required module.",
    };
  }

  const enabledModuleIds = new Set(Object.entries(moduleStatusById)
    .filter(([, status]) => status === "enabled")
    .map(([moduleId]) => moduleId));

  if (moduleDefinition.status !== "enabled") {
    const missingDependencies = (moduleDefinition.moduleDependencies || [])
      .filter((moduleId) => !enabledModuleIds.has(moduleId));

    if (missingDependencies.length > 0) {
      return {
        readOnly: true,
        readOnlyReason: `Requires enabled modules: ${missingDependencies.join(", ")}.`,
      };
    }
  }

  const dependentModules = listModules()
    .filter((candidate) => (
      candidate.id !== moduleDefinition.id &&
      enabledModuleIds.has(candidate.id) &&
      (candidate.moduleDependencies || []).includes(moduleDefinition.id)
    ))
    .map((candidate) => candidate.displayName || candidate.name || candidate.id);

  if (dependentModules.length > 0) {
    return {
      readOnly: true,
      readOnlyReason: `Required by enabled modules: ${dependentModules.join(", ")}.`,
    };
  }

  return {
    readOnly: false,
    readOnlyReason: "",
  };
}

function isModuleSettingsView(view) {
  return String(view.id || "").endsWith("-settings") || String(view.path || "").endsWith("-settings.html");
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
    if (!(await permissionsService.canInAnyScope(session, permissionId, {
      workspace_id: session.workspace_id,
      operation: "read",
    }))) {
      return false;
    }
  }

  return true;
}

async function readWorkspaceCapabilities(workspaceId) {
  const rows = await db.query(`
SELECT workspace_type
FROM workspaces
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId: text(workspaceId) });

  return getWorkspaceCapabilities(rows[0]?.workspace_type);
}

function moduleSyncParams(moduleDefinition, now) {
  return {
    category: text(moduleDefinition.category),
    createdAt: text(now),
    description: text(moduleDefinition.description),
    moduleId: text(moduleDefinition.id),
    name: text(moduleDefinition.name),
    status: "active",
    updatedAt: text(now),
    version: text(moduleDefinition.version),
  };
}

function normalizeIdList(ids) {
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => text(id).trim())
    .filter(Boolean))];
}

function text(value) {
  return String(value ?? "");
}

export const modulesService = {
  canReadModule,
  canWriteModule,
  decorateWorkspaceSettings,
  emitInternalEvent,
  getModule,
  getModuleForApiScope,
  getTimerSource,
  getWorkItemSource,
  listEnabledModules,
  listActiveResourceDefinitions,
  listActiveViewSurfaces,
  listDashboardPanels,
  listReportingReports,
  listAvailableApiScopes,
  listActiveHelpArticles,
  listActiveHelpContributions,
  listActiveHelpSections,
  listModuleApiScopes,
  listModuleApiScopeEntries,
  listModuleAuditRecordTypes,
  listModuleEventHooks,
  listModuleEventSummaries,
  listModuleEventTypes,
  listHelpArticles,
  listHelpContributions,
  listHelpSections,
  listModuleMigrationSources,
  listModulePermissionEntries,
  listPermissionEntries,
  listModuleNavigation,
  listModulePermissions,
  listModuleRouteEntries,
  listModuleRoutes,
  listModuleSettingsForWorkspaceType,
  listModuleSettingsNavigation,
  listModules,
  listAttachableTypes,
  listLinkedContextProviders,
  listActiveLinkedContextProviders,
  listActiveAttachableTypes,
  listActiveSearchableTypes,
  listActiveModuleBrowserAssets,
  listModuleBrowserAssets,
  listModuleSettings,
  listSettingsContributions,
  listNotificationEvents,
  listNotificationFollowTargets,
  listModulePublicViews,
  listModuleResourceDefinitions,
  listModuleRolePermissionDefaults,
  listResourceDefinitions,
  listRolePermissionDefaults,
  listNotificationTemplates,
  listSearchableTypes,
  listTagPropagationRules,
  listActiveTagPropagationRules,
  listTaggableTypes,
  listTimerSources,
  listWorkbenchCards,
  listWorkItemSources,
  moduleContributionRequirementsAvailable,
  onInternalEvent,
  readEnabledModuleIds,
  resolveProtectedModuleView,
  readModuleStatus,
  readWorkspaceModuleSettings,
  readWorkspaceModuleContext,
  registerModuleEventHooks,
  setModuleStatus,
  syncModuleRegistry,
};
