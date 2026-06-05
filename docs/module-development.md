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

Notifications are framework-owned. Modules may declare future notification metadata in `notificationEvents` and `notificationTemplates`, but modules should not create duplicate notification UI.

Notification summaries should use safe event summary helpers rather than raw event or audit JSON.

## Tags And Search

Tag and search declarations are still reserved groundwork. Modules may provide basic `taggableTypes` and `searchableTypes` descriptors for documentation and sanity checks, but the full tag/search implementations land later.

## Sanity Checks

Run `npm run check` before relying on a module change. The check suite validates JavaScript syntax, storage behavior, event bus behavior, audit extensibility, registered module uniqueness, route descriptors, permissions, API scopes, notification declarations, and dependency references.
