import assert from "node:assert/strict";
import { modulesService } from "../src/core/modules/modules.service.js";

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
  assertUnique("notification event id", modulesService.listNotificationEvents().map((event) => event.id));
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

