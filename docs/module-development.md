# Module Development Guide

This guide explains how to build against the current first-party module contract. The contract source of truth is `docs/module-contract.md`; the disabled-by-default `developer-example` module shows a compact working manifest.

## Create A Module Manifest

Create a static ESM module record and register it in `src/core/modules/registry.js`. Third-party discovery is still deferred, so modules are intentionally explicit.

Required fields include `id`, `name`, `displayName`, `description`, `category`, `version`, and `enabledByDefault`. Keep `id` stable and kebab-case because it is used in `modules`, `workspace_modules`, route guards, settings, dependencies, and contribution filtering.

Use `enabledByDefault: false` for examples or optional features that should not appear in new workspaces automatically. Use `canDisable: false` only for framework-core modules.

## Register Routes

Browser/session routes go in `browserApiRoutes` and are mounted under `/api` after authentication. The framework wraps optional module browser routes with write protection so disabled modules cannot receive normal writes.

Public API routes go in `publicApiRoutes` and should use API key middleware with a module-declared scope. Describe those endpoints in `publicApiEndpoints` so docs and sanity checks can discover them.

## Module Settings

Declare settings in `settings`. A setting with `moduleStatus: true` controls the module enablement row in `workspace_modules`. Writable non-status settings need explicit server-side handling before they should be accepted by settings saves.

Use `info` settings for documentation-only or read-only example fields.

## Permissions

Declare user-facing permission metadata in `permissions`, and keep `requiredPermissions` as the compact compatibility list used by navigation, view, and contribution filters.

Use `defaultRolePermissions` for additive default grants. Startup sync inserts missing permissions and role mappings but does not remove existing grants.

## Navigation

Declare app-shell links in `navigation`. Navigation is returned through `/api/app-shell/bootstrap` and is filtered by module status, workspace capabilities, dependencies, and user permissions.

Disabled modules should not contribute normal navigation.

## Workbench And Timers

Declare Workbench cards in `workbench` when a module has a live workflow surface. Cards identify the renderer and basic filtering metadata; the Workbench page stays framework-owned.

Declare actionable records in `workItemSources`. A source module should expose its own list route, such as `/api/tasks/workbench-items`, that returns normalized records with `source_module_id`, `source_type`, `source_id`, `source_label`, `source_url`, project context, status, assignment fields, and any attached timer summary.

Declare timer-capable records in `timerSources`. Each timer source should publish lifecycle routes for listing, starting, pausing, finalizing, and removing timers. Time Tracking owns active timer persistence and time-entry finalization; source modules provide record context and source-specific permission checks.

Manual timers use `source_type: "manual"` and the shared active timer routes. Task timers use `source_module_id: "tasks"`, `source_type: "task"`, and `source_id: task_id`; they require both Tasks and Time Tracking plus `tasks.view` and `time_entries.create`. Future Support Ticket timers should use `source_module_id: "support-tickets"`, `source_type: "ticket"`, and `source_id: ticket_id` while reusing the same active timer engine.

Finalized sourced timers should create normal time entries with any source-specific metadata the Time Entries module already understands, such as `task_id` for task timers. If a source module is disabled, existing active timers should remain visible in a recovery state so time is not stranded.

## Views And Assets

Register authenticated module pages through `protectedViews`. Protected module pages are served only when a registered descriptor matches the requested path.

Declare module-specific browser scripts or styles in `browserAssets`. Shared app-shell assets remain framework-owned.

## Shared Icon And Action Controls

Use `window.LongtailForge.icons` for common action icons and compact action buttons. The shared helper is framework-owned, uses a local Lucide-derived inline SVG subset, and renders by stable semantic names such as `add`, `edit`, `archive`, `restore`, `delete`, `start`, `pause`, `save`, `close`, `copy`, `refresh`, and `more`.

Modules may use `createIcon`, `createIconButton`, or `decorateButton` for common actions, but module behavior, permission checks, API calls, and confirmation flows should remain in the owning module. Icon-only controls need an accessible label, and destructive controls should pass the danger variant or keep the existing `danger-button` class.

Do not ship duplicate icon registries for common app actions. Module-specific icons may be added later through a documented extension point; until then, add common icons to the shared registry instead of loading remote icon fonts, CDN icon scripts, or module-local copies.

## Cross-screen Dialog Actions

Use `window.LongtailForge.moduleActions.register()` when a module needs an add/edit dialog that can open from another framework-owned surface such as Workbench. The framework owns action discovery, availability checks, dispatch, focus return, and completion callbacks. The module owns the dialog markup, form state, validation, API calls, save/reset behavior, and record-specific permission handling. Action dispatch is callback-only: do not register page URLs for embedded frames, and do not make framework code import module-specific form internals.

Dialog-backed actions should register metadata plus an opener callback:

```js
window.LongtailForge.moduleActions.register({
  actionId: "example-work.add",
  moduleId: "example-work",
  recordType: "example-work-item",
  mode: "add",
  label: "Add Example Work",
  requiredModules: ["example-work"],
  requiredPermissions: ["example.create"],
  requiredWorkspaceCapabilities: ["projects"],
  open: async (params, hostContext) => {
    // Render a module-owned dialog, save through module-owned APIs, then call:
    hostContext.complete({ recordId: "created-record-id" });
  },
});
```

Use `canOpen(params, hostContext)` for module-specific checks that cannot be described by module state or workspace capability metadata alone. Call `hostContext.cancel()` when the user cancels and `hostContext.setStatus(message, { isError })` to hand status text back to the host.

Do not use this contract for settings or setting modals. Those stay in their settings pages and menus.

The current registry is browser-side. Future manifest metadata may describe action labels, record types, permissions, modules, and workspace capabilities declaratively, but opener functions should remain module-owned browser code rather than framework imports of module form internals.

## Migrations

Set `migrationsDir` only when the module owns database migrations. Keep example modules migration-free unless the example specifically needs schema behavior. Core migrations still run before module migrations.

## Events And Hooks

Declare event metadata in `eventTypes`. Subscribe to internal events through `hooks.events`.

Internal events are server-side only. Hook failures are logged and reported by dispatch results, but they do not interrupt the save that emitted the event.

Lifecycle hooks remain direct functions such as `hooks.onModuleEnabled` and `hooks.onModuleDisabled`.

## Enable And Disable

Use `modulesService.setModuleStatus` for module state changes. Do not update `workspace_modules` directly.

Disabling a module hides normal navigation and blocks normal browser/public API writes. Disabled modules may keep historical reads only when `historicalReadAccess` allows it.

## Framework Notifications

Notifications are framework-owned. Modules may declare notification metadata in `notificationEvents`, `notificationTemplates`, and `notificationFollowTargets`, but modules should not create duplicate notification UI. Follow targets describe which module records a user may subscribe to individually; the framework owns subscription storage, APIs, permission checks, and delivery expansion.

Notification summaries should use safe event summary helpers rather than raw event or audit JSON.

## Tags And Search

Tags are framework-owned classification metadata. Modules declare taggable records in `taggableTypes`; each descriptor identifies the target type, owning module, ID field, display label field, workspace field, optional client/project fields, and required read/tag permissions. Do not add module-owned tag tables or comma-separated tag text columns.

Search is framework-owned. Modules may provide `searchableTypes` descriptors with record fields, required read permission, and a stable string `indexer` ID that the framework search indexer registry resolves internally. Required fields are `recordType`, `moduleId`, `idField`, `titleField`, `summaryField`, `bodyFields`, `workspaceField`, `requiredReadPermission`, and `indexer`; `clientField`, `projectField`, tag text, visibility, record status, and source metadata are optional. Do not put direct function references in manifests, and do not build module-owned global search routes or duplicate search UI. Active searchable type lookup filters out disabled modules and unmet required modules, and active search request shaping carries each target's declared read permission. Module-owned indexers should read records through the owning module service/repository and return data that can be passed through `searchService.normalizeSearchDocument()`; they should not write directly to search tables. Framework search service methods such as `indexSearchDocument()`, `removeSearchDocument()`, and `reindexSearchRecord()` persist or remove canonical `search_index` rows and let the SQLite adapter synchronize optional FTS rows when supported. Rebuild-capable indexers should also return workspace documents when called without a `recordId` in rebuild mode so framework rebuild tooling can upsert canonical rows, remove stale rows, and ask the active adapter to repair backend storage. Keep module search declarations backend-neutral: SQLite FTS and future PostgreSQL full-text syntax belong in adapters. Treat visibility, record status, and source as search metadata, not permission or workflow authority. Exact tag filters use canonical tag assignments; denormalized tag text is only for text matching/ranking. Initial first-party indexers cover Tasks, Time Entries, Clients, and Projects; global search API routes and browser search UI land later.

## Sanity Checks

Run `npm run check` before relying on a module change. The check suite validates JavaScript syntax, storage behavior, event bus behavior, audit extensibility, registered module uniqueness, route descriptors, permissions, API scopes, notification declarations, taggable type declarations, searchable type declarations, and dependency references.
