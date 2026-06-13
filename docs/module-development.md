# Module Development Guide

This guide explains how to build against the current first-party module contract. The contract source of truth is `docs/module-contract.md`; the disabled-by-default `developer-example` module shows a compact working manifest.

For current first-party workflow modules, see `docs/tasks-module.md` for Tasks, `docs/notes-module.md` for Notes, and `docs/lists-module.md` for Lists. Tasks demonstrates commitments, next actions, blocked reasons, resume notes, activity/completion metadata, lightweight checklists, parent/child blocking relationships, recurrence, timers, search/tags/files declarations, Help, resume-safe context, and consuming a Notes-owned linked-record panel without owning Notes permission logic. Notes demonstrates Library behavior, revisions, Markdown, secure-note boundaries, linked-record picker and panel contracts, safe Active Work resume-context candidates, tags, search, files, and Help. Lists demonstrates operational list storage, item execution, reusable workflows, catalog suggestions, linked records, search/tags/files declarations, Help, and resume-safe context.

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

Use the tag service for all record tag reads and writes. Record list/read flows should call `decorateRecordsForTarget()` or `decorateRecordsWithEffectiveTags()` so browser payloads include `directTags`, `propagatedTags`, `effectiveTags`, and the compatibility `tags` array. Save flows should call `replaceAssignments()` only with direct/manual tag IDs from the shared picker; propagated and system tags are read-only context on that record. Simple "No Tags" filters should pass the shared no-effective-tags sentinel through `filterRecordsByTags()` instead of hand-filtering module data.

Modules that participate in tag propagation declare `tagPropagation` descriptors and register relationship resolvers by stable ID. Let the tag service handle materialization, suppression, repair, and event emission. Consuming modules should request refreshes around stable relationship changes, but should not copy parent tags themselves or treat tags as permissions, visibility, billing, workflow, or archive state.

Search is framework-owned. Modules may provide `searchableTypes` descriptors with record fields, required read permission, and a stable string `indexer` ID that the framework search indexer registry resolves internally. Required fields are `recordType`, `moduleId`, `idField`, `titleField`, `summaryField`, `bodyFields`, `workspaceField`, `requiredReadPermission`, and `indexer`; `clientField`, `projectField`, tag text, visibility, record status, and source metadata are optional. Do not put direct function references in manifests, and do not build module-owned global search routes or duplicate search UI. Active searchable type lookup filters out disabled modules and unmet required modules, and active search request shaping carries each target's declared read permission. Module-owned indexers should read records through the owning module service/repository and return data that can be passed through `searchService.normalizeSearchDocument()`; they should not write directly to search tables. Framework search service methods such as `indexSearchDocument()`, `removeSearchDocument()`, and `reindexSearchRecord()` persist or remove canonical `search_index` rows and let the SQLite adapter synchronize optional FTS rows when supported. Rebuild-capable indexers should also return workspace documents when called without a `recordId` in rebuild mode so framework rebuild tooling can upsert canonical rows, remove stale rows, clean up inactive module/type rows, and ask the active adapter to repair backend storage. Keep module search declarations backend-neutral: SQLite FTS and future PostgreSQL full-text syntax belong in adapters. Treat visibility, record status, and source as search metadata, not permission or workflow authority. Exact tag filters use canonical tag assignments; denormalized tag text is only for text matching/ranking. Initial first-party indexers cover Tasks, Time Entries, Clients, and Projects; browser search routes, the shared authenticated-shell search entry, and the `search.html` results page are framework-owned and return or route to permission-shaped search results, with workflow regressions covering discovery, edits, pagination, permissions, Help article search, and UI states. Public API search remains separate roadmap work.

Files are framework-owned. Modules that can receive attachments should declare `attachableTypes` with the target type, owning module, table and field metadata, workspace/client/project fields where relevant, required read/attach/remove permissions, allowed file categories, allowed visibility values, and optional file lifecycle subscriptions. Do not create module-owned file metadata tables, direct static download routes, local storage paths, scan/quarantine state, upload routes, report flows, or download UI that bypasses `filesService`. As of the 0.32.13 closeout, the framework supplies schema, manifest validation, active target lookup, protected local storage, core file permissions, authenticated browser file routes, JSON/base64 upload handling, no-op scanner hooks for the trusted/admin-oriented upload surface, report-driven quarantine, safe download headers, audit logging, lifecycle events, a reusable `LongtailForge.fileAttachments.mount()` browser helper, framework attachment count reads, and a simple Files browse surface. Module screens should pass their manifest-declared module ID, target type, target ID, optional client/project context, accepted categories, and display callbacks into the shared helper, then keep business wording and placement local to the module.

Before adding a new first-party module that consumes files, read `docs/0.32-module-file-closeout.md` and confirm the existing attachable target, shared browser helper, lifecycle event, and permission contracts cover the use case.

## Help Contributions

Help Center is framework-owned product/module documentation. Modules may declare help pages through `help.sections` and `help.articles`, but modules should not create duplicate Help Center routes, browser chrome, or search integration. The framework-owned `help.html` page and `/api/help` routes discover active module help declarations for the current workspace, alongside the baseline framework-owned Help articles. Active Help articles are indexed by the framework as `record_type = help_article` with `source = Help`; framework articles use `module_id = framework`, while module-authored articles keep the declaring module ID.

Each help section needs `id`, `moduleId`, and `title`; optional fields include `description`, `sortOrder`, `audience`, `tags`, `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiredModules`, and terminology. Each article needs `id`, `moduleId`, `title`, summary or description, and either inline `body` or a safe relative `contentPath`; optional fields include `slug`, `sectionId`, `sortOrder`, `audience`, `tags`, `relatedArticleIds`, `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiredModules`, and terminology. Disabled modules are excluded from active Help discovery, so module-authored help should not be the only place a framework-critical behavior is documented.

Keep Help Center content about product/module usage. User-authored operational articles belong to the future Knowledge Base module, not to manifest-declared product help.

## Sanity Checks

Run `npm run check` before relying on a module change. The check suite validates JavaScript syntax, storage behavior, event bus behavior, audit extensibility, registered module uniqueness, route descriptors, permissions, API scopes, notification declarations, taggable type declarations, searchable type declarations, help declarations, and dependency references.
