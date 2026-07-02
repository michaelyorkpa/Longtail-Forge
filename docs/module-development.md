# Module Development Guide

This guide explains how to build against the current first-party module contract. The contract source of truth is `docs/module-contract.md`; the disabled-by-default `developer-example` module shows a compact working manifest.

For current first-party workflow modules, see `docs/tasks-module.md` for Tasks, `docs/notes-module.md` for Notes, and `docs/lists-module.md` for Lists. Tasks demonstrates commitments, next actions, blocked reasons, resume notes, activity/completion metadata, lightweight checklists, parent/child blocking relationships, recurrence, timers, search/tags/files declarations, Help, resume-safe context, and consuming a Notes-owned Linked Context panel without owning Notes permission logic. Notes demonstrates Library behavior, revisions, Markdown, secure-note boundaries, Primary Context and Linked Context contracts, safe Active Work resume-context candidates, tags, search, files, and Help. Lists demonstrates operational list storage, item execution, reusable workflows, catalog suggestions, linked records, search/tags/files declarations, Help, and resume-safe context. Shared workflow context terminology lives in `docs/workflow-context-contract.md`.

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

## Resume State

Use resume state when a module has work the current user may need to pick back up later. The framework owns `work_resume_state`, `/api/work-resume`, dismissal, read filtering, and future Workbench consumption. Modules own only the decision that a lifecycle event is resumable and the safe snapshot fields for their source records.

To participate:

1. Emit safe internal lifecycle events from the module service after successful writes.
2. Register a resume-state producer in service code with `registerResumeStateProducer()`.
3. Shape explicit recovery fields in the producer payload, such as title, source URL, status, priority, due date, next action, handoff note, blocked reason, and safe metadata.
4. Register a read resolver with `registerResumeStateReadResolver()` so the framework can re-check source visibility before returning a row.
5. Add regressions for workspace scope, disabled modules, permission-denied reads, deleted/completed/archived/finalized filtering, dismissal refresh, and unsafe metadata exclusion.

Do not copy freeform bodies, comments, rendered HTML, secure/encrypted fields, attachment internals, protected storage paths, scanner details, private-note hints, or inaccessible linked-record labels into resume state. Private and secure Notes are excluded from global resume-state rows in the current foundation. Time Tracking should update sourced task timer resume state on the source task record; manual active timers remain Time Tracking-owned.

## Views And Assets

Register authenticated module pages through `protectedViews`. Protected module pages are served only when a registered descriptor matches the requested path.

Declare module-specific browser scripts or styles in `browserAssets`. Shared app-shell assets remain framework-owned.

## Shared UI Surfaces

Use `docs/ui-surface-contract.md` and `docs/ui-layout-guide.md` before adding or converting module UI. Framework-owned surface classes cover modal groups, modal section headings and bodies, modal footers, overlay hosts, drawers, slideouts, main-screen internal panels, chips, dividers, focus states, and dense row/list action clusters. Modules should use those shared classes for shell structure and theme behavior while keeping record fields, picker bodies, validation, save payloads, permissions, and business meaning module-owned.

Use `LongtailForge.overlayHost.create({ host })` for small module-owned panels opened from compact row actions or other non-modal utility controls. The overlay host owns placement, Escape/click-away handling, focus handling, responsive bottom-sheet behavior, and one-open-overlay state; the module or framework service still owns picker/upload content and persistence. Converted add/edit modal utilities that open substantial picker or upload content, such as Tags and Files, should use stacked child dialogs through `LongtailForge.view.showModal()` / `closeModal()` so the parent editor body does not grow or shift.

Use `LongtailForge.view.showModal()` and `LongtailForge.view.closeModal()` for converted add/edit dialogs that may open stacked secondary dialogs above the parent editor. The framework owns parent/child stack guardrails and safe child closure; the module owns staged state, validation, save payloads, and the secondary dialog body.

Use `.surface-main-panel` for main-screen filters, bulk toolbars, settings groups, notification/timer panels, and contextual work panels. Use `.surface-dense-actions` for row-local action clusters instead of reusing modal footer classes. Drawer and slideout shells are available for future side panels and become full-screen overlays on narrow screens.

## View-Building Helpers

Use `docs/view-building-contract.md` before adopting or extending `LongtailForge.view`. The view-building helper layer is for common DOM anatomy: page headers, status messages, empty states, filter panels, collapsible selector/index panels, split list/detail workspaces, data tables with overflow wrappers, detail headers, metadata/badge rows, action strips, summary panels, modal shells/forms/footers, field grids, and inline item/action rows.

Keep helper usage boring and behavior-preserving. Helpers may create accessible DOM nodes, apply framework surface classes, wire button types and labels, and return elements for module callbacks. Modules still own data loading, state, validation, API calls, save payloads, route permissions, labels, and record-specific workflow behavior. Do not move module storage rules, permission rules, or save semantics into `LongtailForge.view`.

Before converting a module view, identify which pieces are framework-owned anatomy and which pieces are module-owned behavior. Convert the shell, filters, tables, detail headers, field grids, modal shells, modal footers, and action rows through helpers where they fit, then keep existing module services, routes, payload readers, permission checks, and workflow labels in the module file.

Do not call `document.createElement("dialog")` directly in converted surfaces when `createModal` or `createModalForm` fits. Do not overwrite helper-built modal footer/action classes with one-off class strings, and do not add hard-coded light backgrounds or non-wrapping action rows to converted helper-owned structures. If a surface still needs custom behavior, leave that surface explicitly unconverted until a later roadmap slice can name and test the custom boundary.

For manifest-driven protected views, read `docs/declarative-view-surfaces.md` before adding or tightening a `viewSurfaces` descriptor. Declarative surfaces move framework-owned anatomy into manifest data and renderer helpers, while module adapters keep behavior handlers, validation, payload construction, permissions, and workflow calls. As of 0.33.5.18.15, strict declarative guardrails enforce `lists.workspace`, `notes.workspace`, `tasks.workspace`, `files.browse`, `client-projects.clients`, and `client-projects.projects`. Tags management and Developer Example descriptors remain reported descriptor proofs, and Admin/Settings, Reporting, Dashboard, Workbench, pagination/server-side paging, Inspector behavior, and non-view workflow changes remain deferred until a later roadmap slice explicitly converts or changes them.

## Shared Icon And Action Controls

Use `window.LongtailForge.icons` for common action icons and compact action buttons. The shared helper is framework-owned, uses a local Lucide-derived inline SVG subset, and renders by stable semantic names such as `add`, `edit`, `archive`, `restore`, `delete`, `start`, `pause`, `save`, `close`, `copy`, `refresh`, `more`, `link`, `eye`, `list`, and `list-checks`.

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

Notifications are framework-owned. Modules may declare notification metadata in `notificationEvents`, `notificationTemplates`, and `notificationFollowTargets`, but modules should not create duplicate notification UI. Follow targets describe which module records a user may subscribe to individually; the framework owns subscription storage, APIs, permission checks, and delivery expansion. Notification-producing internal events are queued as durable jobs: modules emit the internal event, the framework stores a `notification.event` job, and the worker resolves recipients and creates notification records through the notification service. Modules should not bypass this by writing notification records directly during normal event fan-out. As of 0.33.5.20.5, `GET /api/notifications` is a bounded recipient read with status/module/event/priority filtering, stable created-at ordering, server-owned module filter options, permission-checked recipient scope, and next-cursor metadata.

## Durable Background Jobs

Long-running, time-sensitive, or retryable side effects should use the framework job runner instead of module-owned timers or ad hoc background loops. Search indexing side effects queue `search.index` jobs, notification fan-out queues `notification.event` jobs, and Tasks owns `task.reminder` and `task.recurrence` job producers while Files owns the `file.scan` handler. As of 0.33.5.21.7.2, task reminder producers only pre-enqueue occurrences inside the documented 30-day scheduling horizon, and the durable `task.reminder` sweep tops up existing active due-dated tasks every 12 hours through the jobs table. As of 0.33.5.21.7.1, Files upload requests queue `file.scan` and leave the attachment pending/unavailable until the worker completes scanning. `import.future` is a reserved framework job type for later import producers.

As of 0.33.5.21.7.3, job handlers must be safe for normal at-least-once worker behavior. A handler should re-read current state before side effects, skip stale work, use active dedupe keys for replaceable pending/running/failed work, and make irreversible side effects idempotent when a retry can repeat them. Current examples are `search.index` canonical upsert/delete work, `notification.event` deterministic recipient notification IDs for delivery-keyed fan-out, `task.reminder` stable reminder delivery keys, `task.recurrence` existing-instance checks, `file.scan` pending-row checks, and the reserved no-op `import.future` handler.

As of 0.33.5.21.7.4, completed and dead-letter job rows are bounded history, not durable module state. Framework startup maintenance prunes old `completed` and `dead` rows according to runtime retention windows while preserving active `pending`, `running`, and `failed` work. Module producers should keep dedupe and idempotency decisions in active jobs or owner records rather than requiring completed/dead history to exist forever.

Job handlers should stay close to the owner of the business meaning. A module service may queue work after a successful mutation, but the handler should re-read current state, skip stale work, and rely on durable runner retries for transient failures. Do not create module-specific worker loops, direct notification writes, direct search table writes, or scanner/import flows that bypass the `jobs` table.

Notification summaries should use safe event summary helpers rather than raw event or audit JSON.

## Tags And Search

Tags are framework-owned classification metadata. Modules declare taggable records in `taggableTypes`; each descriptor identifies the target type, owning module, ID field, display label field, workspace field, optional client/project fields, and required read/tag permissions. Do not add module-owned tag tables or comma-separated tag text columns.

Use the tag service for all record tag reads and writes. Record list/read flows should call `decorateRecordsForTarget()` or `decorateRecordsWithEffectiveTags()` so browser payloads include `directTags`, `propagatedTags`, `effectiveTags`, and the compatibility `tags` array. Save flows should call `replaceAssignments()` only with direct/manual tag IDs from the shared picker; propagated and system tags are read-only context on that record. Simple "No Tags" filters should pass the shared no-effective-tags sentinel through `filterRecordsByTags()` instead of hand-filtering module data.

Modules that participate in tag propagation declare `tagPropagation` descriptors and register relationship resolvers by stable ID. Let the tag service handle materialization, suppression, repair, and event emission. Consuming modules should request refreshes around stable relationship changes, but should not copy parent tags themselves or treat tags as permissions, visibility, billing, workflow, or archive state.

Search is framework-owned. Modules may provide `searchableTypes` descriptors with record fields, required read permission, and a stable string `indexer` ID that the framework search indexer registry resolves internally. Required fields are `recordType`, `moduleId`, `idField`, `titleField`, `summaryField`, `bodyFields`, `workspaceField`, `requiredReadPermission`, and `indexer`; `clientField`, `projectField`, tag text, visibility, record status, and source metadata are optional. Do not put direct function references in manifests, and do not build module-owned global search routes or duplicate search UI. Active searchable type lookup filters out disabled modules and unmet required modules, and active search request shaping carries each target's declared read permission. Module-owned indexers should read records through the owning module service/repository and return data that can be passed through `searchService.normalizeSearchDocument()`; they should not write directly to search tables. Search indexing side effects are queued as durable jobs: after successful create/update/archive/restore/delete flows, modules should call `searchIndexSyncService` so the framework queues a `search.index` job and the worker performs canonical `search_index` and backend FTS writes. Framework search service methods such as `indexSearchDocument()`, `removeSearchDocument()`, and `reindexSearchRecord()` remain direct persistence methods for worker handlers, focused tests, and maintenance tools, not normal module mutation side effects. Rebuild-capable indexers should also return workspace documents when called without a `recordId` in rebuild mode so framework rebuild tooling can upsert canonical rows, remove stale rows, clean up inactive module/type rows, and ask the active adapter to repair backend storage. Keep module search declarations backend-neutral: SQLite FTS and future PostgreSQL full-text syntax belong in adapters. Treat visibility, record status, and source as search metadata, not permission or workflow authority. Exact tag filters use canonical tag assignments; denormalized tag text is only for text matching/ranking. Initial first-party indexers cover Tasks, Time Entries, Clients, and Projects; browser search routes, the shared authenticated-shell search entry, and the `search.html` results page are framework-owned and return or route to permission-shaped search results, with workflow regressions covering discovery, edits, pagination, permissions, Help article search, and UI states. Public API search remains separate roadmap work.

## Markdown Rendering

Markdown rendering is framework-owned. Use `src/core/markdown/markdown.service.js` for generic Markdown rendering, plain-text extraction, excerpts, source normalization, and safe URL checks. If a module needs module-specific behavior, such as Notes wiki links or secure-note placeholders, keep that behavior in a thin module adapter over the framework service instead of adding another parser or regex renderer.

The approved syntax set is CommonMark plus explicitly supported tables, task lists, and safe underline using the `++text++` token. Raw HTML, raw underline tags, scriptable links, unsafe image sources, automatic URL linking, typographer replacements, broad extension bundles, and renderer rewrites of saved source are not part of the current contract. Saved Markdown should remain unchanged; render/search/preview output is where normalization and safety handling happen.

The framework service supports default document rendering and explicit `user-authored` rendering. Document rendering keeps CommonMark soft-line behavior for repo-authored Help and future documentation-style content. Notes is the reference module for user-authored Markdown and opts into `user-authored` rendering so single newlines in note bodies display as visible line breaks in both saved reads and draft preview without rewriting stored Markdown.

`src/modules/notes/markdown.js` validates unsafe note input, preserves wiki-link handling, and delegates safe rendering/plain text/excerpts to the framework service. Saved Notes detail reads expose `body_html`, while draft preview uses the protected `POST /api/notes/preview` route so browser preview stays aligned with saved rendering. The browser editor remains a textarea with authoring helpers in `public/js/shared/notes-editor.js`; do not replace it with WYSIWYG behavior unless a later roadmap version explicitly changes that product decision.

Help is the reference framework-owned Markdown content consumer. Repo-authored Help files live under `help/`, article detail payloads include Markdown source fields plus safe rendered HTML fields, and Help search text comes from the shared Markdown plain-text path. Future Knowledge Base articles should consume the same service while keeping publication status, review workflow, source snapshots, and visibility rules inside the Knowledge Base module.

Files are framework-owned. Modules that can receive attachments should declare `attachableTypes` with the target type, owning module, table and field metadata, workspace/client/project fields where relevant, required read/attach/remove permissions, allowed file categories, allowed visibility values, and optional file lifecycle subscriptions. Do not create module-owned file metadata tables, direct static download routes, local storage paths, scan/quarantine state, upload routes, report flows, or download UI that bypasses `filesService`. As of the 0.32.13 closeout, the framework supplies schema, manifest validation, active target lookup, protected local storage, core file permissions, authenticated browser file routes, JSON/base64 upload handling, no-op scanner hooks for the trusted/admin-oriented upload surface, report-driven quarantine, safe download headers, audit logging, lifecycle events, a reusable `LongtailForge.fileAttachments.mount()` browser helper, framework attachment count reads, and a simple Files browse surface. Module screens should pass their manifest-declared module ID, target type, target ID, optional client/project context, accepted categories, and display callbacks into the shared helper, then keep business wording and placement local to the module.

Before adding a new first-party module that consumes files, read `docs/0.32-module-file-closeout.md` and confirm the existing attachable target, shared browser helper, lifecycle event, and permission contracts cover the use case.

## Help Contributions

Help Center is framework-owned product/module documentation. Modules may declare help pages through `help.sections` and `help.articles`, but modules should not create duplicate Help Center routes, browser chrome, or search integration. The framework-owned `help.html` page and `/api/help` routes discover active module help declarations for the current workspace, alongside the baseline framework-owned Help articles. Active Help articles are indexed by the framework as `record_type = help_article` with Markdown-derived body text and `source = Help`; framework articles use `module_id = framework`, while module-authored articles keep the declaring module ID. Search rebuilds re-read Help content through the Help service, so repo-authored Markdown changes are picked up during rebuild without module-owned search writers or file watchers.

Each help section needs `id`, `moduleId`, and `title`; optional fields include `description`, `sortOrder`, `audience`, `tags`, `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiredModules`, and terminology. Each article needs `id`, `moduleId`, `title`, summary or description, and either inline `body` or a safe relative Markdown `contentPath`; first-party product Help should use `contentPath` under the repo-owned `help/` tree. Optional article fields include `slug`, `sectionId`, `sortOrder`, `audience`, `tags`, `relatedArticleIds`, `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiredModules`, and terminology. Disabled modules are excluded from active Help discovery, so module-authored help should not be the only place a framework-critical behavior is documented.

The visible Help navigation is authored in `help/toc.md`. Use an explicit `default: relative/article.md` directive for the first article, headings for collapsible groups, and Markdown links to article files for visible article targets. Framework article files live under `help/framework/`; first-party module article files live under `help/modules/<module-id>/`. Keep each manifest `contentPath` aligned with the Markdown file and keep article IDs/slugs stable so existing Help URLs and search rows stay stable. Valid active articles that are not listed in `toc.md` appear in fallback navigation so module Help is still discoverable without leaking disabled-module content.

The Help service renders article Markdown through the shared framework Markdown service and returns safe rendered `bodyHtml` plus `bodyHtmlFormat: "html"` on article detail payloads. Article details keep the compatibility `body` field and also return `bodyFormat: "markdown"` plus `bodyMarkdown` so callers do not have to infer or rewrite the source format. The Help browser renders server-provided HTML through an allowlisted importer and keeps its client Markdown renderer only as a fallback for older payloads. Help search rebuilds read article text through the same shared Markdown plain-text path in the Help service, so after editing Markdown content, run the Help/search regressions or `npm run check` to re-index and verify the current file-backed article bodies.

Keep Help Center content about current product/module usage. Do not put roadmap promises, in-app authoring workflows, rich embeds, raw HTML, scripts, medical or diagnostic positioning, or workspace-authored operational knowledge into manifest-declared product Help. User-authored operational articles belong to the future Knowledge Base module, not to manifest-declared product help.

## Sanity Checks

Run `npm run check` before relying on a module change. The check suite validates JavaScript syntax, storage behavior, event bus behavior, audit extensibility, registered module uniqueness, route descriptors, permissions, API scopes, notification declarations, taggable type declarations, searchable type declarations, help declarations, and dependency references.
