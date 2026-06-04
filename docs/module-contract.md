# Module Manifest Contract

Longtail Forge modules are static ESM records registered from `src/core/modules/registry.js`. Version 0.31.10 formalizes the manifest shape and validates registered first-party modules at startup. Third-party loading is intentionally deferred until the registry and module lifecycle are more stable.

## Startup Validation

The module registry validates every registered module before exposing route, migration, or metadata lists. Startup fails with an `Invalid module manifest configuration` error when a manifest has duplicate IDs, missing required fields, invalid field shapes, unknown fields, or dependencies that reference unregistered modules.

Unknown arbitrary manifest fields are rejected. Future extension data should wait for a deliberate extension namespace instead of being added ad hoc.

## Registry Service

`src/core/modules/registry.js` remains the static first-party registration list. It does not perform filesystem discovery and does not load third-party modules yet.

`src/core/modules/modules.service.js` is the framework-facing registry service. It provides module lookup, route lists, migration sources, enabled workspace module state, navigation/settings contribution collection, permission and API scope collection, reserved tag/search/notification contribution lists, and Workbench/timer/work-item contribution collection.

Workspace-aware contribution helpers filter disabled modules, missing module dependencies, workspace capability mismatches, and user permission mismatches. Capability lists are treated as "any of these capabilities makes the contribution relevant" so Business, Personal, and Family workspaces can share module manifests without duplicate definitions.

## Active Fields

These fields are currently accepted by the manifest validator:

- `id`: required stable kebab-case module identifier used in storage, settings, dependency declarations, and module checks.
- `name`: required database/module label.
- `displayName`: required UI label.
- `description`: required human-readable summary.
- `category`: required module grouping, such as `core-workflow` or `core-admin`.
- `version`: required module contract/version marker.
- `enabledByDefault`: required boolean controlling new workspace module status.
- `canDisable`: optional boolean that declares whether Workspace Settings may disable the module.
- `historicalReadAccess`: optional boolean that allows disabled data modules to keep read-only access to old records.
- `browserApiRoutes`: optional array of Express routers mounted under `/api` for signed-in browser use.
- `publicApiRoutes`: optional array of Express routers mounted before browser session authentication.
- `migrationsDir`: optional URL/string module migration folder. Core migrations still run first.
- `protectedViewsDir`: optional URL/string ownership hint for authenticated module pages.
- `publicViewsDir`: optional URL/string ownership hint for public module pages.
- `browserAssetsDir`: optional URL/string ownership hint for module browser assets.
- `navigation`: optional app-shell link descriptors.
- `dashboard`: optional Dashboard panel descriptors.
- `reporting`: optional reporting contribution descriptors.
- `workbench`: optional Workbench card contribution descriptors.
- `settings`: optional module settings descriptors.
- `requiredPermissions`: optional permission IDs expected by the module.
- `publicApiEndpoints`: optional public API documentation/discovery descriptors.
- `apiScopes`: optional API key scope IDs provided by the module.
- `timerSources`: optional timer-capable source declarations.
- `workItemSources`: optional actionable Workbench item source declarations.
- `frameworkDependencies`: optional framework service dependency IDs.
- `moduleDependencies`: optional registered module IDs that must exist.
- `workspaceCapabilityRequirements`: optional workspace capability keys that make the module relevant.
- `seedHooks`: optional reserved startup hook array.
- `repairHooks`: optional reserved startup repair hook array.

## Reserved Fields

These fields are accepted only as arrays today. The validator checks their basic shape, but runtime behavior is reserved for later framework versions:

- `taggableTypes`
- `searchableTypes`
- `notificationEvents`
- `notificationTemplates`
- `auditRecordTypes`
- `eventTypes`
- `hooks`

Notifications are framework-owned. Modules will declare notification events and templates through the manifest, but individual modules should not create duplicate notification UI.

## Contribution Shapes

Navigation items require `label` and `href`; they may include `parent` and `requiredPermissions`.

Dashboard items require `id` and `label`; renderer/count/link metadata may be added by module-specific dashboard features.

Workbench cards require `id`, `label`, `renderer`, and `moduleId`; they may include `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiresEnabledModules`, `defaultCollapsed`, and `sortOrder`. Workbench cards from disabled modules should be hidden. Framework-owned Workbench cards, such as active timers, are allowed for core workflow areas.

Timer sources declare record types that can start or control timers. A timer source requires `sourceType`, `moduleId`, and `label`; it may include `listRoute`, `startRoute`, `pauseRoute`, `finalizeRoute`, `requiredPermissions`, and `requiredModules`. Time Tracking owns active timer persistence and finalization. Source modules expose record context and routes; they do not own duplicate timer engines.

Workbench item sources expose actionable records to the Workbench page. They require `sourceType`, `moduleId`, `label`, and `listRoute`; they may include `requiredPermissions`, `requiredModules`, `filterHints`, and `sortHints`. Records should normalize to `source_module_id`, `source_type`, `source_id`, `source_label`, `source_url`, `title`, `description`, `client_id`, `client_name`, `project_id`, `project_name`, `status`, `priority`, `due_at`, `assignee_ids`, `timer_status`, and `elapsed_seconds`.

Settings items require `id`, `label`, and `type`; a setting with `moduleStatus: true` controls the module enablement row, while related sub-options can use `moduleStatus: false`.

Public API endpoint descriptors require `method`, `path`, and `scope`.

## Disable Policy

Disabling a module does not delete module data. Disabled modules hide normal navigation, block browser and public API writes, stop future background/module behavior when lifecycle hooks exist, and avoid creating new search, tag, or notification records. Disabled data modules may keep historical reads only when `historicalReadAccess` is true.

Active timers sourced from disabled modules remain visible in a limited recovery state so time is not stranded.

## Example

```js
const exampleModule = {
  id: "example-work",
  name: "Example Work",
  displayName: "Example Work",
  description: "Example work items for module contract development.",
  category: "core-workflow",
  version: "0.31.10",
  enabledByDefault: false,
  canDisable: true,
  historicalReadAccess: true,
  browserApiRoutes: [exampleRoutes],
  publicApiRoutes: [],
  migrationsDir: new URL("./migrations/", import.meta.url),
  protectedViewsDir: new URL("../../../views/protected/", import.meta.url),
  browserAssetsDir: new URL("../../../public/js/", import.meta.url),
  navigation: [{ label: "Example Work", href: "example-work.html" }],
  dashboard: [{ id: "example-summary", label: "Example Summary" }],
  workbench: [{
    id: "example-items",
    label: "Example Items",
    renderer: "example-items",
    moduleId: "example-work",
    requiredPermissions: ["example.view"],
    requiredWorkspaceCapabilities: ["projects"],
    requiresEnabledModules: ["example-work"],
    defaultCollapsed: false,
    sortOrder: 30,
  }],
  settings: [{ id: "exampleWorkEnabled", label: "Example Work", type: "boolean", moduleStatus: true }],
  requiredPermissions: ["example.view", "example.create"],
  publicApiEndpoints: [{ method: "GET", path: "/api/v1/example-work", scope: "example:read" }],
  apiScopes: ["example:read"],
  timerSources: [],
  workItemSources: [{
    sourceType: "example-item",
    moduleId: "example-work",
    label: "Example Items",
    listRoute: "/api/example-work/items",
    requiredPermissions: ["example.view"],
    requiredModules: ["example-work"],
    filterHints: { supported: ["all", "assigned-to-me"] },
    sortHints: { supported: ["due_at", "priority"] },
  }],
  frameworkDependencies: ["module-access", "permissions-service"],
  moduleDependencies: [],
  seedHooks: [],
  repairHooks: [],
};
```
