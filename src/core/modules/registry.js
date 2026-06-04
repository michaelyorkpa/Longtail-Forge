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
  return {
    ...definition,
    browserApiRoutes: [...(definition.browserApiRoutes || [])],
    publicApiRoutes: [...(definition.publicApiRoutes || [])],
    navigation: [...(definition.navigation || [])],
    dashboard: [...(definition.dashboard || [])],
    reporting: [...(definition.reporting || [])],
    workbench: [...(definition.workbench || [])],
    settings: [...(definition.settings || [])],
    requiredPermissions: [...(definition.requiredPermissions || [])],
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

function listModulePermissions() {
  return uniqueStrings(moduleDefinitions.flatMap((definition) => definition.requiredPermissions || []));
}

function listModuleApiScopes() {
  return uniqueStrings(moduleDefinitions.flatMap((definition) => definition.apiScopes || []));
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

function listContribution(fieldName) {
  return moduleDefinitions.flatMap((definition) => (
    definition[fieldName] || []
  ).map((item) => ({ ...item, moduleId: item.moduleId || definition.id })));
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))].sort();
}

export {
  getModule,
  listBrowserApiRoutes,
  listModuleApiScopes,
  listModuleMigrationSources,
  listModulePermissions,
  listModuleRoutes,
  listModules,
  listNotificationEvents,
  listNotificationTemplates,
  listPublicApiRoutes,
  listSearchableTypes,
  listTaggableTypes,
};
