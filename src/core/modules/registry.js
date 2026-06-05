import { clientProjectsModule } from "../../modules/client-projects/module.js";
import { tasksModule } from "../../modules/tasks/module.js";
import { timeTrackingModule } from "../../modules/time-tracking/module.js";
import { usersModule } from "../../modules/users/module.js";
import { validateModuleManifests } from "./manifest-contract.js";

const moduleDefinitions = [
  clientProjectsModule,
  tasksModule,
  timeTrackingModule,
  usersModule,
];

validateModuleManifests(moduleDefinitions);

function cloneModuleDefinition(definition) {
  const hooks = { ...(definition.hooks || {}) };
  if (Array.isArray(hooks.events)) {
    hooks.events = hooks.events.map((hook) => ({ ...hook }));
  }

  return {
    ...definition,
    browserApiRoutes: [...(definition.browserApiRoutes || [])],
    publicApiRoutes: [...(definition.publicApiRoutes || [])],
    navigation: [...(definition.navigation || [])],
    protectedViews: [...(definition.protectedViews || [])],
    publicViews: [...(definition.publicViews || [])],
    browserAssets: [...(definition.browserAssets || [])],
    dashboard: [...(definition.dashboard || [])],
    reporting: [...(definition.reporting || [])],
    workbench: [...(definition.workbench || [])],
    settings: [...(definition.settings || [])],
    permissions: [...(definition.permissions || [])],
    requiredPermissions: [...(definition.requiredPermissions || [])],
    defaultRolePermissions: [...(definition.defaultRolePermissions || [])],
    resourceDefinitions: [...(definition.resourceDefinitions || [])],
    publicApiEndpoints: [...(definition.publicApiEndpoints || [])],
    apiScopes: [...(definition.apiScopes || [])],
    timerSources: [...(definition.timerSources || [])],
    workItemSources: [...(definition.workItemSources || [])],
    taggableTypes: [...(definition.taggableTypes || [])],
    searchableTypes: [...(definition.searchableTypes || [])],
    notificationEvents: [...(definition.notificationEvents || [])],
    notificationTemplates: [...(definition.notificationTemplates || [])],
    auditRecordTypes: [...(definition.auditRecordTypes || [])],
    eventTypes: [...(definition.eventTypes || [])],
    hooks,
    frameworkDependencies: [...(definition.frameworkDependencies || [])],
    moduleDependencies: [...(definition.moduleDependencies || [])],
    seedHooks: [...(definition.seedHooks || [])],
    repairHooks: [...(definition.repairHooks || [])],
    workspaceCapabilityRequirements: [...(definition.workspaceCapabilityRequirements || [])],
  };
}

function listModules() {
  return moduleDefinitions.map(cloneModuleDefinition);
}

function getModule(moduleId) {
  const moduleDefinition = moduleDefinitions.find((definition) => definition.id === moduleId);

  return moduleDefinition ? cloneModuleDefinition(moduleDefinition) : null;
}

function listModuleRoutes(type) {
  if (type === "browser") {
    return moduleDefinitions.flatMap((definition) => definition.browserApiRoutes || []);
  }

  if (type === "public") {
    return moduleDefinitions.flatMap((definition) => definition.publicApiRoutes || []);
  }

  return [];
}

function listModuleRouteEntries(type) {
  const routeField = type === "public"
    ? "publicApiRoutes"
    : type === "browser"
      ? "browserApiRoutes"
      : "";

  if (!routeField) {
    return [];
  }

  return moduleDefinitions.flatMap((definition) => (
    definition[routeField] || []
  ).map((router) => ({
    moduleId: definition.id,
    router,
    type,
  })));
}

function listBrowserApiRoutes() {
  return listModuleRoutes("browser");
}

function listPublicApiRoutes() {
  return listModuleRoutes("public");
}

function listModuleMigrationSources() {
  return moduleDefinitions
    .filter((definition) => definition.migrationsDir)
    .map((definition) => ({
      moduleId: definition.id,
      migrationsDir: definition.migrationsDir,
    }));
}

function listModuleProtectedViews() {
  return listContribution("protectedViews");
}

function listModulePublicViews() {
  return listContribution("publicViews");
}

function listModuleBrowserAssets() {
  return listContribution("browserAssets");
}

function listModulePermissions() {
  return uniqueStrings([
    ...moduleDefinitions.flatMap((definition) => definition.requiredPermissions || []),
    ...listModulePermissionEntries().map((entry) => entry.id),
  ]);
}

function listModulePermissionEntries() {
  return moduleDefinitions.flatMap((definition) => {
    const declaredPermissions = definition.permissions || [];

    if (declaredPermissions.length > 0) {
      return declaredPermissions.map((permission) => normalizePermission(definition, permission));
    }

    return (definition.requiredPermissions || []).map((permissionId) => ({
      id: permissionId,
      moduleId: definition.id,
      label: permissionId,
      description: `${definition.displayName || definition.name} permission ${permissionId}.`,
      resource: permissionId.split(".")[0],
      operation: permissionId.split(".")[1] || "",
    }));
  });
}

function listModuleRolePermissionDefaults() {
  return moduleDefinitions.flatMap((definition) => (
    definition.defaultRolePermissions || []
  ).map((mapping) => ({
    moduleId: definition.id,
    roleId: mapping.roleId,
    permissions: [...(mapping.permissions || [])],
  })));
}

function listModuleResourceDefinitions() {
  return listContribution("resourceDefinitions");
}

function listModuleApiScopes() {
  return uniqueStrings(listModuleApiScopeEntries().map((entry) => entry.scope));
}

function listModuleApiScopeEntries() {
  return moduleDefinitions.flatMap((definition) => (
    definition.apiScopes || []
  ).map((scope) => normalizeApiScope(definition, scope)));
}

function listTaggableTypes() {
  return listContribution("taggableTypes");
}

function listSearchableTypes() {
  return listContribution("searchableTypes");
}

function listNotificationEvents() {
  return listContribution("notificationEvents");
}

function listNotificationTemplates() {
  return listContribution("notificationTemplates");
}

function listModuleEventTypes() {
  return listContribution("eventTypes");
}

function listModuleEventHooks() {
  return moduleDefinitions.flatMap((definition) => (
    definition.hooks?.events || []
  ).map((hook, index) => ({
    ...hook,
    id: hook.id || `${definition.id}:${hook.event}:${index}`,
    moduleId: definition.id,
  })));
}

function listContribution(fieldName) {
  return moduleDefinitions.flatMap((definition) => (
    definition[fieldName] || []
  ).map((item) => ({ ...item, moduleId: item.moduleId || definition.id })));
}

function normalizePermission(definition, permission) {
  return {
    ...permission,
    id: permission.id,
    moduleId: permission.moduleId || definition.id,
    label: permission.label,
    description: permission.description,
    resource: permission.resource || permission.id.split(".")[0],
    operation: permission.operation || permission.id.split(".")[1] || "",
  };
}

function normalizeApiScope(definition, scope) {
  if (typeof scope === "string") {
    return {
      moduleId: definition.id,
      scope,
      id: scope,
      label: scope,
      description: `${definition.displayName || definition.name} API scope ${scope}.`,
      access: scope.endsWith(":write") ? "write" : "read",
    };
  }

  return {
    ...scope,
    moduleId: scope.moduleId || definition.id,
    scope: scope.id,
    access: scope.access || (String(scope.id || "").endsWith(":write") ? "write" : "read"),
  };
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))].sort();
}

export {
  getModule,
  listBrowserApiRoutes,
  listModuleBrowserAssets,
  listModuleApiScopes,
  listModuleApiScopeEntries,
  listModuleMigrationSources,
  listModuleEventHooks,
  listModuleEventTypes,
  listModulePermissions,
  listModulePermissionEntries,
  listModuleProtectedViews,
  listModulePublicViews,
  listModuleResourceDefinitions,
  listModuleRolePermissionDefaults,
  listModuleRouteEntries,
  listModuleRoutes,
  listModules,
  listNotificationEvents,
  listNotificationTemplates,
  listPublicApiRoutes,
  listSearchableTypes,
  listTaggableTypes,
};
