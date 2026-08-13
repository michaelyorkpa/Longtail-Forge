// @ts-check
import { bundledModuleCatalog } from "./bundled-module-catalog.generated.js";
import { validateAndOrderBundledModuleCatalog } from "./module-entry.js";

/**
 * Registered first-party module entries, structurally checked at development
 * time and fully validated as one runtime catalog before any lookup is exposed.
 * @type {readonly Readonly<import("../../types/framework-contracts.js").BundledModuleCatalogEntry>[]}
 */
const orderedModuleEntries = validateAndOrderBundledModuleCatalog(bundledModuleCatalog);
/** @type {import("../../types/framework-contracts.js").ModuleManifest[]} */
const moduleDefinitions = orderedModuleEntries.map((entry) => entry.moduleEntry.manifest);

/**
 * @param {import("../../types/framework-contracts.js").ModuleManifest} definition
 */
function cloneModuleDefinition(definition) {
  const hooks = { ...(definition.hooks || {}) };
  if (Array.isArray(hooks.events)) {
    hooks.events = hooks.events.map((hook) => ({ ...hook }));
  }

  return /** @type {import("../../types/framework-contracts.js").NormalizedModuleManifest} */ (/** @type {unknown} */ ({
    ...definition,
    browserApiRoutes: [...(definition.browserApiRoutes || [])],
    publicApiRoutes: [...(definition.publicApiRoutes || [])],
    navigation: [...(definition.navigation || [])],
    protectedViews: [...(definition.protectedViews || [])],
    viewSurfaces: [...(definition.viewSurfaces || [])],
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
    linkedContextProviders: [...(definition.linkedContextProviders || [])],
    taggableTypes: [...(definition.taggableTypes || [])],
    tagPropagation: [...(Array.isArray(definition.tagPropagation) ? definition.tagPropagation : [])],
    searchableTypes: [...(definition.searchableTypes || [])],
    attachableTypes: [...(definition.attachableTypes || [])],
    protectedContentConsumers: [...(definition.protectedContentConsumers || [])],
    help: cloneHelpContribution(/** @type {import("../../types/help-static-contracts.js").HelpContribution | undefined} */ (/** @type {unknown} */ (definition.help))),
    notificationEvents: [...(definition.notificationEvents || [])],
    notificationFollowTargets: [...(definition.notificationFollowTargets || [])],
    notificationTemplates: [...(definition.notificationTemplates || [])],
    auditRecordTypes: [...(definition.auditRecordTypes || [])],
    eventTypes: [...(definition.eventTypes || [])],
    eventSummaries: [...(Array.isArray(definition.eventSummaries) ? definition.eventSummaries : [])],
    hooks,
    frameworkDependencies: [...(definition.frameworkDependencies || [])],
    moduleDependencies: [...(definition.moduleDependencies || [])],
    seedHooks: [...(definition.seedHooks || [])],
    repairHooks: [...(definition.repairHooks || [])],
    workspaceCapabilityRequirements: [...(definition.workspaceCapabilityRequirements || [])],
  }));
}

/** @returns {import("../../types/framework-contracts.js").NormalizedModuleManifest[]} */
function listModules() {
  return moduleDefinitions.map(cloneModuleDefinition);
}

function listModuleEntries() {
  return [...orderedModuleEntries];
}

/** @param {string} moduleId @returns {import("../../types/framework-contracts.js").NormalizedModuleManifest | null} */
function getModule(moduleId) {
  const moduleDefinition = moduleDefinitions.find((definition) => definition.id === moduleId);

  return moduleDefinition ? cloneModuleDefinition(moduleDefinition) : null;
}

/**
 * @param {string} type
 */
function listModuleRoutes(type) {
  if (type === "browser") {
    return moduleDefinitions.flatMap((definition) => definition.browserApiRoutes || []);
  }

  if (type === "public") {
    return moduleDefinitions.flatMap((definition) => definition.publicApiRoutes || []);
  }

  return [];
}

/**
 * @param {string} type
 */
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

/** @returns {Array<import("../../types/framework-contracts.js").CatalogContribution & {id: string, moduleId: string, path: string, file?: string, allowDisabledRead?: boolean}>} */
function listModuleProtectedViews() {
  return moduleDefinitions.flatMap((definition) => (
    /** @type {Array<import("../../types/framework-contracts.js").CatalogContribution & {id: string, moduleId: string, path: string, file?: string, allowDisabledRead?: boolean}>} */ (definition.protectedViews || [])
  ).map((view) => ({ ...view, moduleId: view.moduleId || definition.id })));
}

/** @returns {import("../../types/framework-contracts.js").ViewSurfaceDescriptor[]} */
function listModuleViewSurfaces() {
  return moduleDefinitions.flatMap((definition) => (
    definition.viewSurfaces || []
  ).map((surface) => ({ ...surface, moduleId: surface.moduleId || definition.id })));
}

/** @returns {Array<import("../../types/framework-contracts.js").CatalogContribution & {id: string, moduleId: string, path: string, file?: string, allowDisabledRead?: boolean}>} */
function listModulePublicViews() {
  return moduleDefinitions.flatMap((definition) => (
    /** @type {Array<import("../../types/framework-contracts.js").CatalogContribution & {id: string, moduleId: string, path: string, file?: string, allowDisabledRead?: boolean}>} */ (definition.publicViews || [])
  ).map((view) => ({ ...view, moduleId: view.moduleId || definition.id })));
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
      return /** @type {import("../../types/framework-contracts.js").PermissionContribution[]} */ (declaredPermissions)
        .map((permission) => normalizePermission(definition, permission));
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
  return /** @type {import("../../types/framework-contracts.js").TaggableTypeContribution[]} */ (listContribution("taggableTypes"));
}

function listTagPropagationRules() {
  return /** @type {import("../../types/framework-contracts.js").TagPropagationContribution[]} */ (listContribution("tagPropagation"));
}

function listSearchableTypes() {
  return /** @type {import("../../types/framework-contracts.js").SearchableTypeContribution[]} */ (listContribution("searchableTypes"));
}

function listAttachableTypes() {
  return /** @type {import("../../types/framework-contracts.js").AttachableTypeContribution[]} */ (listContribution("attachableTypes"));
}

function listLinkedContextProviders() {
  return /** @type {import("../../types/framework-contracts.js").LinkedContextProviderContribution[]} */ (listContribution("linkedContextProviders"));
}

function listHelpSections() {
  return moduleDefinitions.flatMap((definition) => (
    definition.help?.sections || []
  ).map((section) => normalizeHelpItem(definition, /** @type {import("../../types/help-static-contracts.js").HelpSection} */ (/** @type {unknown} */ (section)))));
}

function listHelpArticles() {
  return moduleDefinitions.flatMap((definition) => (
    definition.help?.articles || []
  ).map((article) => normalizeHelpItem(definition, /** @type {import("../../types/help-static-contracts.js").HelpArticle} */ (/** @type {unknown} */ (article)))));
}

function listHelpContributions() {
  return {
    sections: listHelpSections(),
    articles: listHelpArticles(),
  };
}

/** @returns {import("../../types/framework-contracts.js").NotificationEventContribution[]} */
function listNotificationEvents() {
  return /** @type {import("../../types/framework-contracts.js").NotificationEventContribution[]} */ (listContribution("notificationEvents"));
}

/** @returns {import("../../types/framework-contracts.js").NotificationFollowTargetContribution[]} */
function listNotificationFollowTargets() {
  return /** @type {import("../../types/framework-contracts.js").NotificationFollowTargetContribution[]} */ (listContribution("notificationFollowTargets"));
}

/** @returns {import("../../types/framework-contracts.js").NotificationTemplateContribution[]} */
function listNotificationTemplates() {
  return /** @type {import("../../types/framework-contracts.js").NotificationTemplateContribution[]} */ (listContribution("notificationTemplates"));
}

function listModuleAuditRecordTypes() {
  return listContribution("auditRecordTypes");
}

/** @returns {import("../../types/framework-contracts.js").EventTypeContribution[]} */
function listModuleEventTypes() {
  return /** @type {import("../../types/framework-contracts.js").EventTypeContribution[]} */ (listContribution("eventTypes"));
}

function listModuleEventSummaries() {
  return listContribution("eventSummaries");
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

/**
 * @param {keyof import("../../types/framework-contracts.js").ModuleManifest} fieldName
 */
function listContribution(fieldName) {
  return moduleDefinitions.flatMap((definition) => {
    const value = definition[fieldName];
    const items = Array.isArray(value) ? value : [];
    return items.map((item) => {
      const contribution = /** @type {Record<string, unknown>} */ (item);
      return {
        ...contribution,
        moduleId: typeof contribution.moduleId === "string" && contribution.moduleId
          ? contribution.moduleId
          : definition.id,
      };
    });
  });
}

/**
 * @template {import("../../types/help-static-contracts.js").HelpSection|import("../../types/help-static-contracts.js").HelpArticle} Item
 * @param {import("../../types/framework-contracts.js").ModuleManifest} definition
 * @param {Item} item
 * @returns {Item & {ownerType: import("../../types/help-static-contracts.js").HelpOwnerType, moduleId: string}}
 */
function normalizeHelpItem(definition, item) {
  return {
    ...item,
    ownerType: item.ownerType || "module",
    moduleId: item.moduleId || definition.id,
  };
}

/**
 * @param {import("../../types/help-static-contracts.js").HelpContribution | undefined} help
 * @returns {import("../../types/help-static-contracts.js").HelpContribution}
 */
function cloneHelpContribution(help) {
  return {
    sections: [...(help?.sections || [])],
    articles: [...(help?.articles || [])],
  };
}

/**
 * @param {import("../../types/framework-contracts.js").ModuleManifest} definition
 * @param {import("../../types/framework-contracts.js").PermissionContribution} permission
 */
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

/**
 * @param {import("../../types/framework-contracts.js").ModuleManifest} definition
 * @param {string | import("../../types/framework-contracts.js").ApiScopeContribution} scope
 */
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

/** @param {string[]} values */
function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))].sort();
}

export {
  getModule,
  listBrowserApiRoutes,
  listModuleBrowserAssets,
  listModuleApiScopes,
  listModuleApiScopeEntries,
  listModuleAuditRecordTypes,
  listModuleMigrationSources,
  listModuleEventHooks,
  listModuleEventSummaries,
  listModuleEventTypes,
  listHelpArticles,
  listHelpContributions,
  listHelpSections,
  listModulePermissions,
  listModulePermissionEntries,
  listModuleProtectedViews,
  listModuleViewSurfaces,
  listModulePublicViews,
  listModuleResourceDefinitions,
  listModuleRolePermissionDefaults,
  listModuleRouteEntries,
  listModuleRoutes,
  listModuleEntries,
  listModules,
  listNotificationEvents,
  listNotificationFollowTargets,
  listNotificationTemplates,
  listPublicApiRoutes,
  listAttachableTypes,
  listLinkedContextProviders,
  listSearchableTypes,
  listTagPropagationRules,
  listTaggableTypes,
};
