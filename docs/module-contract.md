# Module Manifest Contract

Longtail Forge modules are static ESM records registered from `src/core/modules/registry.js`. Version 0.31.10 formalizes the manifest shape and validates registered first-party modules at startup. Third-party loading is intentionally deferred until the registry and module lifecycle are more stable.

## Startup Validation

The module registry validates every registered module before exposing route, migration, or metadata lists. Startup fails with an `Invalid module manifest configuration` error when a manifest has duplicate IDs, missing required fields, invalid field shapes, unknown fields, or dependencies that reference unregistered modules.

Unknown arbitrary manifest fields are rejected. Future extension data should wait for a deliberate extension namespace instead of being added ad hoc.

## Registry Service

`src/core/modules/registry.js` remains the static first-party registration list. It does not perform filesystem discovery and does not load third-party modules yet.

`src/core/modules/modules.service.js` is the framework-facing registry service. It provides module lookup, route lists, migration sources, enabled workspace module state, navigation/settings contribution collection, permission and API scope collection, event type and event hook collection, reserved tag/search/notification contribution lists, and Workbench/timer/work-item contribution collection.

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
- `protectedViews`: optional authenticated module page descriptors.
- `publicViews`: optional public module page descriptors, reserved for later public module pages.
- `browserAssets`: optional browser asset descriptors for module-specific scripts or styles.
- `navigation`: optional app-shell link descriptors.
- `dashboard`: optional Dashboard panel descriptors.
- `reporting`: optional reporting contribution descriptors.
- `workbench`: optional Workbench card contribution descriptors.
- `settings`: optional module settings descriptors.
- `permissions`: optional permission descriptors with user-facing labels and descriptions.
- `requiredPermissions`: optional permission IDs expected by the module.
- `defaultRolePermissions`: optional role-to-permission defaults to sync into `role_permissions`.
- `resourceDefinitions`: optional module resource keys and supported operations.
- `publicApiEndpoints`: optional public API documentation/discovery descriptors.
- `apiScopes`: optional API key scope descriptors provided by the module.
- `timerSources`: optional timer-capable source declarations.
- `workItemSources`: optional actionable Workbench item source declarations.
- `eventTypes`: optional module event descriptors emitted through the internal event bus.
- `hooks`: optional hook object with lifecycle functions and `events` subscriptions.
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

Notifications are framework-owned. Modules will declare notification events and templates through the manifest, but individual modules should not create duplicate notification UI.

## Contribution Shapes

Navigation items require `label` and `href`; they may include `parent` and `requiredPermissions`.

The authenticated app shell reads module navigation through `/api/app-shell/bootstrap`. The backend combines framework-owned navigation such as Dashboard, Workbench, workspace settings, user settings, workspace switching, API keys, and audit links with enabled module navigation from the registry. The browser app shell renders the returned tree directly and keeps the static browser nav only as a fallback while bootstrap data is loading or unavailable.

Protected view descriptors require `id`, `path`, `moduleId`, and `file`; they may include `requiredPermissions`, `requiredWorkspaceCapabilities`, and `allowDisabledRead`. The static view service serves protected module pages only when a registered view matches the requested path. Unknown protected HTML files are not served merely because they exist under `views/protected`.

Framework-owned protected views are registered by the framework rather than by optional workflow modules. Dashboard, Workbench, Workspace Settings, User Settings, API Keys, Audit Log, Reporting, and legacy Organization Settings remain framework-owned in 0.31.15. Workbench is specifically not owned by Tasks, Time Tracking, Notes, Support Tickets, or any other workflow module.

When a protected module view belongs to a disabled module, the view service returns a disabled-module response unless the descriptor sets `allowDisabledRead: true` and the module allows historical reads. Permission checks are server-side; `requiredPermissions` on the view descriptor is treated as the page-level gate before the module's APIs enforce record-level access.

Browser asset descriptors require `id`, `moduleId`, `path`, and `type` (`script` or `style`); they may include `views`, `requiredPermissions`, and `requiredWorkspaceCapabilities`. Common app-shell assets such as navigation, theme initialization, workspace switching, global search placeholders, notification placeholders, and shared CSS remain framework-owned. Module-specific page scripts/styles should be declared by the owning module and loaded only on the pages that need them.

Dashboard items require `id` and `label`; renderer/count/link metadata may be added by module-specific dashboard features.

Workbench cards require `id`, `label`, `renderer`, and `moduleId`; they may include `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiresEnabledModules`, `defaultCollapsed`, and `sortOrder`. Workbench cards from disabled modules should be hidden. Framework-owned Workbench cards, such as active timers, are allowed for core workflow areas.

Timer sources declare record types that can start or control timers. A timer source requires `sourceType`, `moduleId`, and `label`; it may include `listRoute`, `startRoute`, `pauseRoute`, `finalizeRoute`, `requiredPermissions`, and `requiredModules`. Time Tracking owns active timer persistence and finalization. Source modules expose record context and routes; they do not own duplicate timer engines.

Workbench item sources expose actionable records to the Workbench page. They require `sourceType`, `moduleId`, `label`, and `listRoute`; they may include `requiredPermissions`, `requiredModules`, `filterHints`, and `sortHints`. Records should normalize to `source_module_id`, `source_type`, `source_id`, `source_label`, `source_url`, `title`, `description`, `client_id`, `client_name`, `project_id`, `project_name`, `status`, `priority`, `due_at`, `assignee_ids`, `timer_status`, and `elapsed_seconds`.

Settings items require `id`, `label`, and `type`. Supported field types are `boolean`, `text`, `number`, `select`, `multi-select`, and `info`. Settings may include `description`, `placeholder`, `options`, `min`, `max`, `step`, `requiredPermissions`, `readOnly`, and `moduleStatus`.

A setting with `moduleStatus: true` controls the module enablement row through `workspace_modules`; it must be validated and saved by the server through the registry service. Related module options use `moduleStatus: false` and require an explicit server-side settings handler before they can be writable. The browser settings UI renders field definitions and values from the backend `moduleSettings` payload instead of hard-coding first-party module toggles.

The `/api/settings` save contract accepts a `moduleSettings` object keyed by module ID and setting ID. The server rejects unknown module IDs, unknown setting IDs, read-only fields, invalid value types, invalid select options, and writable settings that do not have a server-side handler. Legacy booleans such as `timeTrackingEnabled`, `tasksEnabled`, and `taskTimersEnabled` are still accepted as compatibility aliases for their registry settings.

Permission descriptors require `id`, `moduleId`, `label`, and `description`; they may include `resource` and `operation`. `requiredPermissions` remains as a compact compatibility list for route/view contribution filtering, while `permissions` is the user-facing contract used for database sync and future permission UI. Startup sync inserts or updates declared permissions and inserts default role mappings without deleting existing role permissions.

Resource definitions require `key`, `moduleId`, and `label`; they may include supported operations such as `read`, `create`, `update`, `delete`, `archive`, `restore`, `assign`, and `manage`. The current permission engine still maps known action prefixes to resource keys, but module manifests now provide the resource contract future modules and permission UI can consume.

Default role permission mappings require `roleId` and `permissions`. They are additive: the framework inserts missing `role_permissions` rows and does not remove existing rows that were granted by migrations, admins, or older versions.

Public API endpoint descriptors require `method`, `path`, and `scope`. API scope descriptors require `id`, `moduleId`, `label`, and `description`; they may include `access` (`read` or `write`). Legacy string scopes are still accepted by the validator and normalized by the registry. The API key UI reads available scopes from enabled module metadata, so disabled optional module scopes are not offered for new keys. Existing API keys still rely on route-level scope checks and module write guards, so writes to disabled modules remain blocked.

Notification permissions are framework-owned in 0.31.16. Notification APIs must be recipient/workspace scoped, must re-check target record access before opening a notification target, and must not expose private notifications to workspace admins unless a later version explicitly designs that capability.

Event type descriptors require `event`, `moduleId`, `label`, and `description`; they may include `recordType`. The first active module event descriptors are Tasks events: `task.created`, `task.updated`, `task.completed`, `task.archived`, and `task.restored`.

Lifecycle hooks remain direct functions on `hooks`: `onModuleEnabled`, `onModuleDisabled`, `onModuleInstalled`, `onModuleUpdated`, and `onModuleRepaired`. Event subscriptions live under `hooks.events` as descriptors with `event`, optional `id`, and `handler`.

Internal events are server-side only. Event payloads normalize to `workspace_id`, `actor_user_id`, `module_id`, `record_type`, `record_id`, `previous_value`, `new_value`, `source`, `metadata`, `session`, and `emitted_at`. Hook failures are logged and reported in dispatch results, but they do not throw back into the core save that emitted the event.

The 0.31.17 event bus is deliberately lightweight. It supports future search indexing, activity feed updates, notifications, integrations, webhooks, and background jobs, but this version only wires module lifecycle events and Tasks events.

## Disable Policy

Disabling a module does not delete module data. Disabled modules hide normal navigation, block browser and public API writes through framework guards, stop future background/module behavior when lifecycle hooks exist, and avoid creating new search, tag, or notification records. Disabled data modules may keep historical reads only when `historicalReadAccess` is true.

Modules with `canDisable: false` are treated as core framework modules and cannot be disabled through workspace module state changes. Disabling a module also fails when another enabled module declares it as a `moduleDependencies` requirement.

Module state transitions are audited as `module.enabled` and `module.disabled` records with `record_type = module`. Dependency or validation failures are audited as `module.enable_failed` or `module.disable_failed` when an actor/workspace context is available.

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
  protectedViews: [{
    id: "example-work",
    path: "/example-work.html",
    moduleId: "example-work",
    file: "example-work.html",
    requiredPermissions: ["example.view"],
    requiredWorkspaceCapabilities: ["example_work"],
    allowDisabledRead: true,
  }],
  browserAssets: [{
    id: "example-work-script",
    moduleId: "example-work",
    path: "/js/example-work.js",
    type: "script",
    views: ["example-work"],
  }],
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
  settings: [
    { id: "exampleWorkEnabled", label: "Example Work", type: "boolean", moduleStatus: true },
    { id: "exampleMode", label: "Mode", type: "select", options: [
      { label: "Simple", value: "simple" },
      { label: "Detailed", value: "detailed" },
    ] },
  ],
  permissions: [{
    id: "example.view",
    moduleId: "example-work",
    label: "View Example Work",
    description: "View example work records.",
    resource: "example_work",
    operation: "read",
  }],
  defaultRolePermissions: [
    { roleId: "workspace_admin", permissions: ["example.view"] },
  ],
  resourceDefinitions: [{
    key: "example_work",
    moduleId: "example-work",
    label: "Example Work",
    operations: ["read", "create", "update", "archive", "restore"],
  }],
  requiredPermissions: ["example.view", "example.create"],
  publicApiEndpoints: [{ method: "GET", path: "/api/v1/example-work", scope: "example:read" }],
  apiScopes: [{
    id: "example:read",
    moduleId: "example-work",
    label: "Read Example Work",
    description: "Read example work records through the public API.",
    access: "read",
  }],
  eventTypes: [{
    event: "example.created",
    moduleId: "example-work",
    label: "Example Created",
    description: "Emitted after an example work record is created.",
    recordType: "example_work",
  }],
  hooks: {
    events: [{
      id: "example-task-created",
      event: "task.created",
      handler: async ({ event, module }) => {
        // React to another module's event without interrupting the saved task.
      },
    }],
  },
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
