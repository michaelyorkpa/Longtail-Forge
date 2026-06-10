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
  listModulePublicViews as listRegisteredModulePublicViews,
  listModuleResourceDefinitions as listRegisteredModuleResourceDefinitions,
  listModuleRolePermissionDefaults as listRegisteredModuleRolePermissionDefaults,
  listModuleRouteEntries as listRegisteredModuleRouteEntries,
  listModuleRoutes as listRegisteredModuleRoutes,
  listModules as listRegisteredModules,
  listNotificationEvents as listRegisteredNotificationEvents,
  listNotificationFollowTargets as listRegisteredNotificationFollowTargets,
  listNotificationTemplates as listRegisteredNotificationTemplates,
  listAttachableTypes as listRegisteredAttachableTypes,
  listSearchableTypes as listRegisteredSearchableTypes,
  listTagPropagationRules as listRegisteredTagPropagationRules,
  listTaggableTypes as listRegisteredTaggableTypes,
} from "./registry.js";
import { internalEventBus } from "../events/event-bus.js";
import { resolveContributionTerminology, resolveModuleDefinitionTerminology } from "./terminology.js";
import { querySql, runSql, sqlText } from "../../db/sqlite.js";
import { permissionsRepository } from "../../repositories/permissions.repo.js";
import { AppError } from "../../utils/app-error.js";
import { getWorkspaceCapabilities } from "../../utils/workspaces.js";

const TIME_TRACKING_MODULE_ID = "time-tracking";
const TASKS_MODULE_ID = "tasks";
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

async function listActiveAttachableTypes(workspaceId) {
  if (!workspaceId) {
    return [];
  }

  const enabledModuleIds = new Set(await readEnabledModuleIds(workspaceId));

  return listAttachableTypes()
    .filter((type) => requiredModulesEnabled(type, enabledModuleIds));
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

async function syncModuleRegistry(workspaceId) {
  registerModuleEventHooks();
  const modules = listModules();
  const existingModuleRows = await querySql("SELECT module_id, version FROM modules;");
  const existingModulesById = new Map(existingModuleRows.map((row) => [row.module_id, row]));
  const now = new Date().toISOString();
  const statements = [
    ...modules.map((moduleDefinition) => (
      `
INSERT INTO modules (module_id, name, description, category, status, version, created_at, updated_at)
VALUES (
  ${sqlText(moduleDefinition.id)},
  ${sqlText(moduleDefinition.name)},
  ${sqlText(moduleDefinition.description)},
  ${sqlText(moduleDefinition.category)},
  'active',
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
`
    )),
    buildWorkspaceModuleSyncSql(workspaceId, modules, now),
  ];

  if (statements.length > 0) {
    await runSql(statements.join("\n"));
  }

  await repairRequiredWorkspaceModules(workspaceId, modules, now);

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
    querySql(`
SELECT module_id, status
FROM workspace_modules
WHERE workspace_id = ${sqlText(workspaceId)}
ORDER BY module_id;
`),
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
  const moduleDefinition = getModule(moduleId);

  if (!workspaceId || !moduleDefinition) {
    return "disabled";
  }

  await ensureWorkspaceModuleRows(workspaceId, [moduleDefinition]);

  const rows = await querySql(`
SELECT status
FROM workspace_modules
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = ${sqlText(moduleId)}
LIMIT 1;
`);

  return rows[0]?.status === "enabled" ? "enabled" : "disabled";
}

async function ensureWorkspaceModuleRows(workspaceId, modules) {
  const moduleDefinitions = modules.filter(Boolean);

  if (!workspaceId || moduleDefinitions.length === 0) {
    return;
  }

  const now = new Date().toISOString();

  await runSql(buildWorkspaceModuleSyncSql(workspaceId, moduleDefinitions, now));
  await repairRequiredWorkspaceModules(workspaceId, moduleDefinitions, now);
}

function buildWorkspaceModuleSyncSql(workspaceId, modules, now) {
  return modules.map((moduleDefinition) => {
    const workspaceStatus = moduleDefinition.enabledByDefault ? "enabled" : "disabled";

    return `
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
`;
  }).join("\n");
}

async function repairRequiredWorkspaceModules(workspaceId, modules, now) {
  const requiredModuleIds = modules
    .filter((moduleDefinition) => moduleDefinition.canDisable === false)
    .map((moduleDefinition) => moduleDefinition.id);

  if (requiredModuleIds.length === 0) {
    return;
  }

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled',
    enabled_at = COALESCE(enabled_at, ${sqlText(now)}),
    disabled_at = NULL,
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id IN (${requiredModuleIds.map(sqlText).join(", ")})
  AND status <> 'enabled';
`);
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
  return listWorkspaceContributions(workspaceId, session, "settings");
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

  return panels.sort((left, right) => (
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
  emitInternalEvent,
  getModule,
  getModuleForApiScope,
  getTimerSource,
  getWorkItemSource,
  listEnabledModules,
  listDashboardPanels,
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
  listModuleNavigation,
  listModulePermissions,
  listModuleRouteEntries,
  listModuleRoutes,
  listModuleSettingsForWorkspaceType,
  listModuleSettingsNavigation,
  listModules,
  listAttachableTypes,
  listActiveAttachableTypes,
  listActiveSearchableTypes,
  listModuleBrowserAssets,
  listModuleSettings,
  listNotificationEvents,
  listNotificationFollowTargets,
  listModulePublicViews,
  listModuleResourceDefinitions,
  listModuleRolePermissionDefaults,
  listNotificationTemplates,
  listSearchableTypes,
  listTagPropagationRules,
  listActiveTagPropagationRules,
  listTaggableTypes,
  listTimerSources,
  listWorkbenchCards,
  listWorkItemSources,
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
