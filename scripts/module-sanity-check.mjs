import assert from "node:assert/strict";
import { modulesService } from "../src/core/modules/modules.service.js";
import { resolveModuleDefinitionTerminology, resolveWorkspaceTerminology } from "../src/core/modules/terminology.js";

const KNOWN_FRAMEWORK_DEPENDENCIES = new Set([
  "api-key-auth",
  "audit-service",
  "billing-formatters",
  "client-projects",
  "module-access",
  "permissions-service",
  "timezone-normalization",
  "workspace-settings",
]);

const modules = modulesService.listModules();
let checks = 0;

function check(name, assertion) {
  assertion();
  checks += 1;
}

function assertUnique(name, values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  assert.deepEqual([...duplicates].sort(), [], `${name} duplicates: ${[...duplicates].sort().join(", ")}`);
}

check("registered modules are available", () => {
  assert.ok(modules.length >= 5);
  assert.ok(modules.some((moduleDefinition) => moduleDefinition.id === "developer-example"));
});

check("module IDs are unique", () => {
  assertUnique("module id", modules.map((moduleDefinition) => moduleDefinition.id));
});

check("public API endpoint descriptors are unique", () => {
  assertUnique(
    "public API endpoint",
    modules.flatMap((moduleDefinition) => (
      moduleDefinition.publicApiEndpoints || []
    ).map((endpoint) => `${endpoint.method.toUpperCase()} ${endpoint.path}`)),
  );
});

check("registered public routes are unique where inspectable", () => {
  assertUnique(
    "registered public route",
    modulesService.listModuleRouteEntries("public").flatMap((entry) => (
      inspectRouterRoutes(entry.router).map((route) => `${route.method} ${route.path}`)
    )),
  );
});

check("registered browser routes are unique where inspectable", () => {
  assertUnique(
    "registered browser route",
    modulesService.listModuleRouteEntries("browser").flatMap((entry) => (
      inspectRouterRoutes(entry.router).map((route) => `${route.method} ${route.path}`)
    )),
  );
});

check("protected view paths are unique", () => {
  assertUnique(
    "protected view path",
    modules.flatMap((moduleDefinition) => (
      moduleDefinition.protectedViews || []
    ).map((view) => normalizePath(view.path))),
  );
});

check("permission IDs are unique", () => {
  assertUnique("permission id", modulesService.listModulePermissionEntries().map((permission) => permission.id));
});

check("API scopes are unique", () => {
  assertUnique("API scope", modulesService.listModuleApiScopeEntries().map((scope) => scope.id));
});

check("notification event IDs are unique", () => {
  const events = modulesService.listNotificationEvents();

  assertUnique("notification event id", events.map((event) => event.id));

  for (const event of events) {
    assert.ok(event.moduleId, `notification event ${event.id} moduleId is required`);
    assert.ok(event.label, `notification event ${event.id} label is required`);
    assert.ok(event.description, `notification event ${event.id} description is required`);
    assert.equal(typeof event.defaultEnabled, "boolean", `notification event ${event.id} defaultEnabled is required`);
    assert.ok(["low", "normal", "high", "urgent"].includes(event.defaultPriority), `notification event ${event.id} defaultPriority is invalid`);
    assert.ok(event.recipientResolver || event.recipientMode, `notification event ${event.id} recipientResolver or recipientMode is required`);
  }
});

check("notification templates are well formed", () => {
  const events = new Set(modulesService.listNotificationEvents().map((event) => event.id));
  const templates = modulesService.listNotificationTemplates();

  assertUnique("notification template id", templates.map((template) => template.id));

  for (const template of templates) {
    assert.ok(template.id, "notification template id is required");
    assert.ok(template.moduleId, `notification template ${template.id} moduleId is required`);
    assert.ok(template.event, `notification template ${template.id} event is required`);
    assert.ok(events.has(template.event), `notification template ${template.id} references unknown event ${template.event}`);
    assert.ok(template.title, `notification template ${template.id} title is required`);
    assert.ok(template.body, `notification template ${template.id} body is required`);
    if (template.url !== undefined) {
      assert.equal(typeof template.url, "string", `notification template ${template.id} url must be a string`);
      assert.equal(/^[a-z][a-z0-9+.-]*:/i.test(template.url), false, `notification template ${template.id} url must be relative`);
    }
  }
});

check("taggable type declarations are well formed", () => {
  const taggableTypes = modulesService.listTaggableTypes();

  assertUnique("taggable target type", taggableTypes.map((type) => type.targetType));

  for (const type of taggableTypes) {
    assert.ok(type.targetType, "taggable targetType is required");
    assert.ok(type.moduleId, `taggable type ${type.targetType} moduleId is required`);
    assert.ok(type.label, `taggable type ${type.targetType} label is required`);
    assert.ok(type.description, `taggable type ${type.targetType} description is required`);
    assert.ok(type.idField, `taggable type ${type.targetType} idField is required`);
    assert.ok(type.labelField, `taggable type ${type.targetType} labelField is required`);
    assert.ok(type.workspaceField, `taggable type ${type.targetType} workspaceField is required`);
    assert.ok(type.requiredReadPermission, `taggable type ${type.targetType} requiredReadPermission is required`);
    assert.ok(type.requiredTagPermission, `taggable type ${type.targetType} requiredTagPermission is required`);
  }

  assert.ok(taggableTypes.some((type) => type.targetType === "task"), "task taggable type should be registered");
  assert.ok(taggableTypes.some((type) => type.targetType === "time_entry"), "time_entry taggable type should be registered");
  assert.ok(taggableTypes.some((type) => type.targetType === "client"), "client taggable type should be registered");
  assert.ok(taggableTypes.some((type) => type.targetType === "project"), "project taggable type should be registered");
});

check("searchable type declarations are well formed", () => {
  const searchableTypes = modulesService.listSearchableTypes();

  assertUnique("searchable record type", searchableTypes.map((type) => type.recordType));

  for (const type of searchableTypes) {
    assert.ok(type.recordType, "searchable recordType is required");
    assert.ok(type.moduleId, `searchable type ${type.recordType} moduleId is required`);
    assert.ok(type.idField, `searchable type ${type.recordType} idField is required`);
    assert.ok(type.titleField, `searchable type ${type.recordType} titleField is required`);
    assert.ok(type.summaryField, `searchable type ${type.recordType} summaryField is required`);
    assert.ok(Array.isArray(type.bodyFields) && type.bodyFields.length > 0, `searchable type ${type.recordType} bodyFields are required`);
    assert.ok(type.workspaceField, `searchable type ${type.recordType} workspaceField is required`);
    assert.ok(type.requiredReadPermission, `searchable type ${type.recordType} requiredReadPermission is required`);
    assert.equal(typeof type.indexer, "string", `searchable type ${type.recordType} indexer must be a registry ID string`);
    assert.ok(type.indexer, `searchable type ${type.recordType} indexer is required`);
  }
});

check("help declarations are well formed", () => {
  const { sections, articles } = modulesService.listHelpContributions();

  assertUnique("help section id", sections.map((section) => section.id));
  assertUnique("help article id", articles.map((article) => article.id));
  assertUnique("help article slug", articles.map((article) => article.slug));

  const sectionIds = new Set(sections.map((section) => section.id));

  for (const section of sections) {
    assert.ok(section.id, "help section id is required");
    assert.ok(section.moduleId, `help section ${section.id} moduleId is required`);
    assert.equal(section.ownerType || "module", "module", `help section ${section.id} should be module-owned in module manifests`);
    assert.ok(section.title, `help section ${section.id} title is required`);
  }

  for (const article of articles) {
    assert.ok(article.id, "help article id is required");
    assert.ok(article.moduleId, `help article ${article.id} moduleId is required`);
    assert.equal(article.ownerType || "module", "module", `help article ${article.id} should be module-owned in module manifests`);
    assert.ok(article.title, `help article ${article.id} title is required`);
    assert.ok(article.summary || article.description, `help article ${article.id} summary or description is required`);
    assert.ok(article.body || article.contentPath, `help article ${article.id} body or contentPath is required`);
    if (article.sectionId) {
      assert.ok(sectionIds.has(article.sectionId), `help article ${article.id} references unknown section ${article.sectionId}`);
    }
  }
});

check("module dependencies reference registered modules", () => {
  const moduleIds = new Set(modules.map((moduleDefinition) => moduleDefinition.id));

  for (const moduleDefinition of modules) {
    for (const dependencyId of moduleDefinition.moduleDependencies || []) {
      assert.ok(moduleIds.has(dependencyId), `${moduleDefinition.id} references missing module dependency ${dependencyId}`);
    }
  }
});

check("framework dependencies are known", () => {
  for (const moduleDefinition of modules) {
    for (const dependencyId of moduleDefinition.frameworkDependencies || []) {
      assert.ok(KNOWN_FRAMEWORK_DEPENDENCIES.has(dependencyId), `${moduleDefinition.id} references missing framework dependency ${dependencyId}`);
    }
  }
});

check("timer sources expose the lifecycle contract", () => {
  for (const moduleDefinition of modules) {
    for (const source of moduleDefinition.timerSources || []) {
      assert.ok(source.listRoute, `${moduleDefinition.id}:${source.sourceType} timer source listRoute is required`);
      assert.ok(source.startRoute, `${moduleDefinition.id}:${source.sourceType} timer source startRoute is required`);
      assert.ok(source.pauseRoute, `${moduleDefinition.id}:${source.sourceType} timer source pauseRoute is required`);
      assert.ok(source.finalizeRoute, `${moduleDefinition.id}:${source.sourceType} timer source finalizeRoute is required`);
      assert.ok(source.removeRoute, `${moduleDefinition.id}:${source.sourceType} timer source removeRoute is required`);
      assert.ok(source.requiredPermissions?.length > 0, `${moduleDefinition.id}:${source.sourceType} timer source permissions are required`);
      assert.ok(source.requiredModules?.includes(moduleDefinition.id), `${moduleDefinition.id}:${source.sourceType} timer source must require its owner module`);
    }
  }
});

check("work item sources expose dedicated list routes", () => {
  for (const moduleDefinition of modules) {
    for (const source of moduleDefinition.workItemSources || []) {
      assert.notEqual(
        source.listRoute,
        "/api/workbench/bootstrap",
        `${moduleDefinition.id}:${source.sourceType} work item source must not point at the aggregate Workbench bootstrap route`,
      );
      assert.ok(source.requiredModules?.includes(moduleDefinition.id), `${moduleDefinition.id}:${source.sourceType} work item source must require its owner module`);
    }
  }
});

check("workspace terminology resolver follows fallback order", () => {
  const terminology = {
    default: {
      label: "Default Label",
      plural: "Default Records",
    },
    personal: {
      label: "Personal Label",
    },
    family: {
      plural: "Family Records",
    },
    business: {
      label: "Business Label",
    },
  };

  assert.equal(resolveWorkspaceTerminology(terminology, "business").label, "Business Label");
  assert.equal(resolveWorkspaceTerminology(terminology, "personal").label, "Personal Label");
  assert.equal(resolveWorkspaceTerminology(terminology, "family").label, "Personal Label");
  assert.equal(resolveWorkspaceTerminology(terminology, "family").plural, "Family Records");
  assert.equal(resolveWorkspaceTerminology(terminology, "unknown").label, "Default Label");
});

check("workspace terminology changes display labels without changing IDs", () => {
  const clientProjects = modules.find((moduleDefinition) => moduleDefinition.id === "client-projects");
  const businessModule = resolveModuleDefinitionTerminology(clientProjects, "business");
  const personalModule = resolveModuleDefinitionTerminology(clientProjects, "personal");
  const familyModule = resolveModuleDefinitionTerminology(clientProjects, "family");

  assert.equal(businessModule.id, "client-projects");
  assert.equal(personalModule.id, "client-projects");
  assert.equal(familyModule.id, "client-projects");
  assert.equal(businessModule.displayName, "Clients & Projects");
  assert.equal(personalModule.displayName, "Projects");
  assert.equal(familyModule.displayName, "Projects");
  assert.deepEqual(
    businessModule.publicApiEndpoints.map((endpoint) => endpoint.scope),
    personalModule.publicApiEndpoints.map((endpoint) => endpoint.scope),
  );
});

function inspectRouterRoutes(router) {
  return (router?.stack || [])
    .filter((layer) => layer.route?.path)
    .flatMap((layer) => (
      Object.keys(layer.route.methods || {}).map((method) => ({
        method: method.toUpperCase(),
        path: normalizePath(layer.route.path),
      }))
    ));
}

function normalizePath(value) {
  const path = String(value || "").trim();
  return path.startsWith("/") ? path : `/${path}`;
}

console.log(`Module sanity check passed ${checks} checks.`);
