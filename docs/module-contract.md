# Module Manifest Contract

Longtail Forge modules are static ESM records registered from `src/core/modules/registry.js`. The 0.31.x branch formalized the manifest shape, validates registered first-party modules at startup, and routes core app-shell/module behavior through the registry service. Third-party loading is intentionally deferred until the registry and module lifecycle are more stable.

For implementation guidance, see `docs/module-development.md`. The disabled-by-default `developer-example` module is a working first-party stub that demonstrates route, page, setting, permission, event, notification, tag, and search declarations without adding business functionality.

## Startup Validation

The module registry validates every registered module before exposing route, migration, or metadata lists. Startup fails with an `Invalid module manifest configuration` error when a manifest has duplicate IDs, missing required fields, invalid field shapes, unknown fields, or dependencies that reference unregistered modules.

Unknown arbitrary manifest fields are rejected. Future extension data should wait for a deliberate extension namespace instead of being added ad hoc.

## Registry Service

`src/core/modules/registry.js` remains the static first-party registration list. It does not perform filesystem discovery and does not load third-party modules yet.

`src/core/modules/modules.service.js` is the framework-facing registry service. It provides module lookup, route lists, migration sources, enabled workspace module state, navigation/settings contribution collection, permission and API scope collection, audit record type collection, event type and event hook collection, event summary collection, taggable type lists, reserved search contribution lists, notification contribution lists, and Workbench/timer/work-item contribution collection.

Workspace-aware contribution helpers filter disabled modules, missing module dependencies, workspace capability mismatches, and user permission mismatches. Capability lists are treated as "any of these capabilities makes the contribution relevant" so Business, Personal, and Family workspaces can share module manifests without duplicate definitions.

## Active Fields

These fields are currently accepted by the manifest validator:

- `id`: required stable kebab-case module identifier used in storage, settings, dependency declarations, and module checks.
- `name`: required database/module label.
- `displayName`: required UI label.
- `description`: required human-readable summary.
- `terminology`: optional display-only labels grouped by workspace type. Supported groups are `default`, `business`, `personal`, and `family`; supported fields include `label`, `singular`, `plural`, `shortLabel`, `navigationLabel`, `description`, `createButton`, and `emptyState`.
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
- `auditRecordTypes`: optional audit record type descriptors accepted by the audit service.
- `timerSources`: optional timer-capable source declarations.
- `workItemSources`: optional actionable Workbench item source declarations.
- `eventTypes`: optional module event descriptors emitted through the internal event bus.
- `eventSummaries`: optional activity-safe and notification-safe event summary descriptors.
- `hooks`: optional hook object with lifecycle functions and `events` subscriptions.
- `frameworkDependencies`: optional framework service dependency IDs.
- `moduleDependencies`: optional registered module IDs that must exist.
- `workspaceCapabilityRequirements`: optional workspace capability keys that make the module relevant.
- `notificationEvents`: optional module-declared notification event descriptors.
- `notificationTemplates`: optional module-declared notification template descriptors.
- `taggableTypes`: optional module-declared taggable record type descriptors.
- `seedHooks`: optional reserved startup hook array.
- `repairHooks`: optional reserved startup repair hook array.

## Reserved Fields

These fields are accepted only as arrays today. The validator checks their basic shape, but runtime behavior is reserved for later framework versions:

- `searchableTypes`

Notifications are framework-owned. Modules declare notification events and templates through the manifest, but individual modules should not create duplicate notification UI.

## Contribution Shapes

Navigation items require `label` and `href`; they may include `parent`, `requiredPermissions`, and display-only `terminology`.

The authenticated app shell reads module navigation through `/api/app-shell/bootstrap`. The backend combines framework-owned navigation such as Dashboard, Workbench, workspace settings, user settings, workspace switching, API keys, and audit links with enabled module navigation from the registry. The browser app shell renders the returned tree directly and keeps the static browser nav only as a fallback while bootstrap data is loading or unavailable.

Protected view descriptors require `id`, `path`, `moduleId`, and `file`; they may include `requiredPermissions`, `requiredWorkspaceCapabilities`, and `allowDisabledRead`. The static view service serves protected module pages only when a registered view matches the requested path. Unknown protected HTML files are not served merely because they exist under `views/protected`.

Framework-owned protected views are registered by the framework rather than by optional workflow modules. Dashboard, Workbench, Workspace Settings, User Settings, API Keys, Audit Log, and Reporting remain framework-owned. Workbench is specifically not owned by Tasks, Time Tracking, Notes, Support Tickets, or any other workflow module.

When a protected module view belongs to a disabled module, the view service returns a disabled-module response unless the descriptor sets `allowDisabledRead: true` and the module allows historical reads. Permission checks are server-side; `requiredPermissions` on the view descriptor is treated as the page-level gate before the module's APIs enforce record-level access.

Browser asset descriptors require `id`, `moduleId`, `path`, and `type` (`script` or `style`); they may include `views`, `requiredPermissions`, and `requiredWorkspaceCapabilities`. Common app-shell assets such as navigation, theme initialization, workspace switching, global search placeholders, notification placeholders, and shared CSS remain framework-owned. Module-specific page scripts/styles should be declared by the owning module and loaded only on the pages that need them.

Dashboard items require `id`, `label`, `renderer`, and `moduleId`; they may include `description`, `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiresEnabledModules`, `sortOrder`, and display-only terminology. Dashboard contributions should describe module-provided cards, summary sections, empty states, or links while the Dashboard page chrome and general layout remain framework-owned. Dashboard contributions from disabled modules are hidden unless a future contribution explicitly allows historical dashboard reads.

Workbench cards require `id`, `label`, `renderer`, and `moduleId`; they may include `description`, `sourceType`, `listRoute`, `actions`, `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiresEnabledModules`, `defaultCollapsed`, and `sortOrder`. Workbench cards from disabled modules should be hidden. The Workbench page owns layout, filters, loading state, status messaging, and generic action dispatch, while module renderers own record-specific presentation.

Timer sources declare record types that can start or control timers. A timer source requires `sourceType`, `moduleId`, and `label`; it may include `listRoute`, `startRoute`, `pauseRoute`, `finalizeRoute`, `removeRoute`, `requiredPermissions`, and `requiredModules`. First-party timer sources should provide all five lifecycle route descriptors: list active/paused timers, start/resume, pause, finalize into a time entry, and remove/discard. Time Tracking owns active timer persistence and finalization. Source modules expose record context and routes; they do not own duplicate timer engines.

Workbench item sources expose actionable records to the Workbench page. They require `sourceType`, `moduleId`, `label`, and `listRoute`; they may include `requiredPermissions`, `requiredModules`, `filterHints`, and `sortHints`. Source modules should expose dedicated list routes rather than pointing at the aggregate Workbench bootstrap payload. Records should normalize to `source_module_id`, `source_type`, `source_id`, `source_label`, `source_url`, `source`, `title`, `description`, `client_id`, `client_name`, `project_id`, `project_name`, `status`, `priority`, `due_at`, `assignee_ids`, `timer_status`, and `elapsed_seconds`.

The Workbench timer payload includes both flat compatibility fields and a nested `source` object with `module_id`, `type`, `id`, `label`, `url`, and `enabled`. Manual timers use `source_type = manual`. Task timers use `source_module_id = tasks`, `source_type = task`, and `source_id = task_id`; they require both Tasks and Time Tracking to be enabled, task read access, and time entry create access. Future Support Ticket timers should use `source_module_id = support-tickets`, `source_type = ticket`, and `source_id = ticket_id`, and should finalize through the same active timer engine into normal time entries with ticket metadata.

The browser Dashboard and Workbench scripts dispatch registered contribution renderers by `renderer` ID. First-party renderers such as `task-summary`, `billing-summary`, `active-work-timers`, and `task-workbench-items` live in framework page scripts for now, but their availability is driven by module contributions returned from the backend registry.

Settings items require `id`, `label`, and `type`. Supported field types are `boolean`, `text`, `number`, `select`, `multi-select`, and `info`. Settings may include `description`, `placeholder`, `options`, `min`, `max`, `step`, `required`, `inputmode`, `requiredPermissions`, `readOnly`, `readOnlyReason`, `disabledReason`, and `moduleStatus`.

A setting with `moduleStatus: true` controls the module enablement row through `workspace_modules`; it must be validated and saved by the server through the registry service. Related module options use `moduleStatus: false` and require an explicit server-side settings handler before they can be writable. The browser settings UI renders field definitions and values from the backend `moduleSettings` payload instead of hard-coding first-party module toggles.

The shared browser settings renderer honors setting metadata by type and does not special-case first-party setting IDs. Browser settings payloads submit module state and module-specific values through `moduleSettings`; deprecated top-level module flags such as `timeTrackingEnabled`, `tasksEnabled`, and `taskTimersEnabled` are compatibility response fields only for current browser code and old callers.

The `/api/settings` save contract accepts a `moduleSettings` object keyed by module ID and setting ID. The server rejects unknown module IDs, unknown setting IDs, read-only fields, invalid value types, invalid select options, writable settings that do not have a server-side handler, and old top-level module setting aliases.

Module settings navigation is derived from registered module protected views whose descriptors identify settings pages. The app shell may group those pages under Settings -> Workspace -> Modules, but it should not hard-code first-party module settings links.

Permission descriptors require `id`, `moduleId`, `label`, and `description`; they may include `resource` and `operation`. `requiredPermissions` remains as a compact compatibility list for route/view contribution filtering, while `permissions` is the user-facing contract used for database sync and future permission UI. Startup sync inserts or updates declared permissions and inserts default role mappings without deleting existing role permissions.

Resource definitions require `key`, `moduleId`, and `label`; they may include supported operations such as `read`, `create`, `update`, `delete`, `archive`, `restore`, `assign`, `manage`, and display-only `terminology`. The current permission engine still maps known action prefixes to resource keys, but module manifests now provide the resource contract future modules and permission UI can consume.

Default role permission mappings require `roleId` and `permissions`. They are additive: the framework inserts missing `role_permissions` rows and does not remove existing rows that were granted by migrations, admins, or older versions.

Public API endpoint descriptors require `method`, `path`, and `scope`. API scope descriptors require `id`, `moduleId`, `label`, and `description`; they may include `access` (`read` or `write`) and display-only `terminology`. Legacy string scopes are still accepted by the validator and normalized by the registry. The API key UI reads available scopes from enabled module metadata, so disabled optional module scopes are not offered for new keys. Existing API keys still rely on route-level scope checks and module write guards, so writes to disabled modules remain blocked.

Notification permissions are framework-owned. `notifications.view_own` covers current-user notification reads, `notifications.manage_preferences` covers personal notification preferences, and `notifications.manage_workspace_defaults` covers workspace-level default notification settings. Notification APIs must be recipient/workspace scoped, must re-check target record access before opening a notification target, and must not expose private notifications to workspace admins unless a later version explicitly designs that capability.

Tag permissions are contributed by the first-party `tags` module. `tags.manage` covers workspace tag definition management, `tags.view` covers viewing tag definitions and assignments, `tags.assign` covers adding tag assignments to registered target records, and `tags.remove` covers removing assignments. Tags are classification metadata only; visibility, permissions, billing status, workflow status, and archival state must stay in real fields rather than being inferred from tags.

Taggable type descriptors require `targetType`, `moduleId`, `label`, `description`, `tableName`, `idField`, `labelField`, `workspaceField`, `requiredReadPermission`, and `requiredTagPermission`. They may include `clientField`, `projectField`, `requiredModules`, and display-only terminology. The framework discovers taggable target types from module manifests through `modulesService.listTaggableTypes()` instead of maintaining a permanent hard-coded list. Runtime tag assignments use the declared table and field metadata to verify that the target exists, belongs to the active workspace, and can be scoped for permission checks.

The `tags` module contributes browser routes under `/api/tags`. `GET /api/tags`, `POST /api/tags`, `PUT /api/tags/:tagId`, `POST /api/tags/:tagId/archive`, and `POST /api/tags/:tagId/restore` manage workspace tag definitions. `GET /api/tags/assignments` reads tags for a registered target, and `PUT /api/tags/assignments` replaces that target's manual tag set in one save. The module also contributes `tags.html` and the shared browser tag helper for tag chips and reusable pickers. Disabling the `tags` module removes the interface and blocks tag APIs without requiring first-party record modules to know how tag storage works.

Notification event descriptors require `id`, `moduleId`, `label`, `description`, `defaultEnabled`, and `defaultPriority` (`low`, `normal`, `high`, or `urgent`). They may include `recipientResolver` for a named module/framework resolver or `recipientMode` for a framework-recognized mode such as `actor`, `assignees`, `workspace_admins`, or `explicit_users`. Notification template descriptors require `id`, `moduleId`, `event`, `title`, and `body`; they may include a relative `url` or `recordLinkPattern`. The framework stores notification records in a workspace-scoped, recipient-specific `notifications` table with module, event, record, status, priority, URL, and metadata fields.

The notification service creates single or multi-recipient records, lists current-user notifications, counts unread records, marks one or all notifications read, dismisses notifications, archives older read/dismissed records, and decorates target metadata before returning links. Browser notification routes are framework routes under `/api/notifications`; they only return the active user's own notifications in the active workspace. Target links are hidden when the recipient cannot access the target record.

The authenticated app shell owns the notification bell/dropdown and reads unread counts from `/api/app-shell/bootstrap` plus `/api/notifications/unread-count`. `notifications.html` is a framework-owned protected page for listing, filtering, marking read, dismissing, and configuring notification preferences. User preferences are stored per workspace/user/event type, while workspace defaults are stored per workspace/event type with an enabled flag and priority override.

Audit record type descriptors require `recordType`, `moduleId`, `label`, and `description`. The audit service accepts framework-owned record types plus module-declared record types. Unknown audit record types are rejected unless a caller explicitly sets an unknown-type allowance for a future import/repair path. Audit change types remain framework-owned common values: `create`, `update`, `delete`, `archive`, `restore`, `login`, `logout`, and `settings_change`.

Event type descriptors require `event`, `moduleId`, `label`, and `description`; they may include `recordType` and display-only `terminology`. The first active module event descriptors are Tasks events: `task.created`, `task.updated`, `task.completed`, `task.archived`, and `task.restored`.

Lifecycle hooks remain direct functions on `hooks`: `onModuleEnabled`, `onModuleDisabled`, `onModuleInstalled`, `onModuleUpdated`, and `onModuleRepaired`. Event subscriptions live under `hooks.events` as descriptors with `event`, optional `id`, and `handler`.

Internal events are server-side only. Event payloads normalize to `workspace_id`, `actor_user_id`, `module_id`, `record_type`, `record_id`, `previous_value`, `new_value`, `source`, `metadata`, `session`, and `emitted_at`. Hook failures are logged and reported in dispatch results, but they do not throw back into the core save that emitted the event.

The 0.31.17 event bus is deliberately lightweight. It supports future search indexing, activity feed updates, notifications, integrations, webhooks, and background jobs, but this version only wires module lifecycle events and Tasks events.

Activity feed and notification summaries are not full activity feed or notification implementations. They are safe summary helpers for future consumers. `eventSummaries` entries require `event` and `moduleId`; they may provide `activity.label`, `activity.summary`, `activity.url`, `notification.title`, `notification.body`, `notification.url`, and `notification.recipientHints`. Summary helpers return human-readable text and safe relative URLs instead of raw event or audit JSON.

Terminology stays separate: Workbench is the user's live workflow desktop, activity feed is a permission-safe historical timeline, audit log is the authoritative admin/security record, and notifications are directed user alerts.

Workspace-type module terminology is display-only. The resolver merges `default`, then `personal` for Family workspaces, then the exact workspace type. Resolved labels may affect module names, navigation, dashboard cards, Workbench cards, empty states, create buttons, record/resource nouns, notification/event display labels, permission display labels, and API scope descriptions, but they must not change module IDs, route names, permission IDs, API scope IDs, audit record types, database tables, stored records, or historical audit/event data.

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
  auditRecordTypes: [{
    recordType: "example_work",
    moduleId: "example-work",
    label: "Example Work",
    description: "Example work records and audit history.",
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
  eventSummaries: [{
    event: "example.created",
    moduleId: "example-work",
    activity: {
      label: "Example Created",
      summary: ({ event }) => `Created ${event.new_value?.title || "example work"}.`,
      url: ({ event }) => `example-work.html?item=${encodeURIComponent(event.record_id || "")}`,
    },
    notification: {
      title: "Example Created",
      body: ({ event }) => `${event.new_value?.title || "Example work"} was created.`,
      url: ({ event }) => `example-work.html?item=${encodeURIComponent(event.record_id || "")}`,
      recipientHints: ["assignees"],
    },
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
