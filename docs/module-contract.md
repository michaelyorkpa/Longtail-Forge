# Module Manifest Contract

Longtail Forge modules are static ESM records registered from `src/core/modules/registry.js`. The 0.31.x branch formalized the manifest shape, validates registered first-party modules at startup, and routes core app-shell/module behavior through the registry service. Third-party loading is intentionally deferred until the registry and module lifecycle are more stable.

For implementation guidance, see `docs/module-development.md`. The disabled-by-default `developer-example` module is a working first-party stub that demonstrates route, page, setting, permission, event, notification, tag, and search declarations without adding business functionality.

## Startup Validation

The module registry validates every registered module before exposing route, migration, or metadata lists. Startup fails with an `Invalid module manifest configuration` error when a manifest has duplicate IDs, missing required fields, invalid field shapes, unknown fields, or dependencies that reference unregistered modules.

Unknown arbitrary manifest fields are rejected. Future extension data should wait for a deliberate extension namespace instead of being added ad hoc.

## Registry Service

`src/core/modules/registry.js` remains the static first-party registration list. It does not perform filesystem discovery and does not load third-party modules yet.

`src/core/modules/modules.service.js` is the framework-facing registry service. It provides module lookup, route lists, migration sources, enabled workspace module state, navigation/settings contribution collection, permission and API scope collection, audit record type collection, event type and event hook collection, event summary collection, taggable type lists, searchable type lists, Linked Context provider lists, notification contribution lists, and Workbench/timer/work-item contribution collection.

Workspace-aware contribution helpers filter disabled modules, missing module dependencies, workspace capability mismatches, and user permission mismatches. Capability lists are treated as "any of these capabilities makes the contribution relevant" so Business, Personal, and Family workspaces can share module manifests without duplicate definitions.

As of 0.33.5.18.6.5.3, Tasks, Notes, and Lists are documented first-party workflow modules with module-owned storage behavior and workspace module-status settings. Tasks contributes task storage, recurrence, reminders, lightweight checklists, parent/child blocking relationships, task timer source routes, searchable/taggable/attachable declarations, a Linked Context target provider descriptor, current-state product Help pages loaded from Markdown source paths, resume-safe task context, and a Notes-linked panel integration that consumes the Notes-owned helper instead of querying Notes storage; its developer handoff lives in `docs/tasks-module.md`. Notes contributes storage, Primary Context fields, Linked Context rows, Library-linking contracts, hierarchical Library collections, Markdown/revision/secure-note behavior, searchable/taggable/attachable declarations, a Linked Context target provider descriptor, current-state product Help pages loaded from Markdown source paths, conservative owner notifications, the protected Notes Library UI, the shared Add/Edit Linked Context picker adoption, the reusable Linked Context panel helper, and safe Active Work resume-context candidates for future framework consumers; its developer handoff lives in `docs/notes-module.md`, the shared context terminology contract lives in `docs/workflow-context-contract.md`, the shared provider/shell contract lives in `docs/linked-context-picker-contract.md`, and import planning lives in `docs/notes-import-planning.md`. Lists contributes storage for lists, list items, explicit catalog suggestions, and linked records; workspace-aware Shopping/Procurement labels; service/API/UI workflows for item execution, reusable lists, bill-of-materials finalization, linked records, progress summaries, a Linked Context target provider descriptor, and resume-safe context; searchable/taggable/attachable declarations; current-state product Help pages loaded from Markdown source paths; and the protected Lists UI. Its developer handoff lives in `docs/lists-module.md`. These modules stay on framework services for permissions, tags, search sync, file attachments, audit, events, Help, and module lifecycle, and none of them writes directly to framework search, file storage, or Notes tables owned by another module.

Secure notes use application-managed envelope encryption in the first implementation. `LONGTAIL_SECURE_NOTES_MASTER_KEY` or `SECURE_NOTES_MASTER_KEY` provides the server-side master/key-encryption key from environment/config/secrets storage. `LONGTAIL_SECURE_NOTES_KEY_VERSION` identifies the current write key version and is stored on secure notes and secure revisions so a future rotation pass can distinguish encrypted records without changing the Notes model. Notes generates a random per-note data encryption key, encrypts the secure body with AES-256-GCM, wraps the per-note key with the configured server-side key, and stores encrypted payload, encrypted data key, algorithm metadata, key version, nonces, auth tags, payload version, and encrypted timestamp. The permission-gated secure-note health surface reports whether secure-note encryption is configured, plus algorithm, payload, and key-version metadata, without exposing key material. Secure-note body text is not stored in normal body, excerpt, plaintext index, metadata JSON, audit/event/search rows, notifications, or browser storage. Browser/API responses also strip the encryption envelope fields so encrypted payloads and wrapped keys remain storage-only server metadata. Secure revision history lists and restore responses are metadata-only; decrypted secure revision bodies are exposed only by the dedicated revision-read endpoint after secure revision checks. Titles remain plaintext metadata in 0.33.2.x and the UI warns users not to put secrets in titles. The browser labels secure notes, keeps previews body-closed, hides client-visible visibility while creating secure notes, locks security-mode changes on existing notes, and normalizes secure/decrypt failures to a safe locked-state message. This protects database-at-rest exposure but is not zero-knowledge because a configured app server can decrypt after session and permission checks. Secure-note access is owner-only plus explicit `notes.secure.*` admins; normal Notes, Library, collection, linked-record, tag, and file permissions do not grant secure body access. Secure notes cannot be `client_visible`, and framework-managed file attachments remain blocked until a deliberate secure-attachment model exists. Existing plaintext `security_mode = secure` placeholders are blocked from activation until manually recreated or explicitly migrated through reviewed tooling. Operators must back up the server-side secure-note key outside the database; losing or misconfiguring it makes secure-note bodies fail closed and may make encrypted secure-note content unrecoverable.

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
- `linkedContextProviders`: optional module-owned Linked Context target provider descriptors.
- `eventTypes`: optional module event descriptors emitted through the internal event bus.
- `eventSummaries`: optional activity-safe and notification-safe event summary descriptors.
- `hooks`: optional hook object with lifecycle functions and `events` subscriptions.
- `frameworkDependencies`: optional framework service dependency IDs.
- `moduleDependencies`: optional registered module IDs that must exist.
- `workspaceCapabilityRequirements`: optional workspace capability keys that make the module relevant.
- `notificationEvents`: optional module-declared notification event descriptors.
- `notificationTemplates`: optional module-declared notification template descriptors.
- `notificationFollowTargets`: optional module-declared target types that users may follow for per-record notification overrides.
- `taggableTypes`: optional module-declared taggable record type descriptors.
- `searchableTypes`: optional module-declared searchable record type descriptors.
- `attachableTypes`: optional module-declared file attachment target descriptors.
- `help`: optional module-declared Help Center contribution block with `sections` and `articles`.
- `seedHooks`: optional reserved startup hook array.
- `repairHooks`: optional reserved startup repair hook array.

## Reserved Fields

There are no search-reserved manifest fields as of 0.32.9.1. `searchableTypes` is an active validated contract. Help uses the active validated `help` contribution block. Future extension data should be promoted deliberately with validator coverage instead of being accepted as arbitrary metadata.

Notifications are framework-owned. Modules declare notification events, templates, and followable target types through the manifest, but individual modules should not create duplicate notification UI.

## Contribution Shapes

Navigation items require `label` and `href`; they may include `parent`, `requiredPermissions`, and display-only `terminology`.

The authenticated app shell reads module navigation through `/api/app-shell/bootstrap`. The backend combines framework-owned navigation such as Dashboard, Workbench, workspace settings, user settings, workspace switching, API keys, and audit links with enabled module navigation from the registry. The browser app shell renders the returned tree directly and keeps the static browser nav only as a fallback while bootstrap data is loading or unavailable.

Protected view descriptors require `id`, `path`, `moduleId`, and `file`; they may include `requiredPermissions`, `requiredWorkspaceCapabilities`, and `allowDisabledRead`. The static view service serves protected module pages only when a registered view matches the requested path. Unknown protected HTML files are not served merely because they exist under `views/protected`.

Framework-owned protected views are registered by the framework rather than by optional workflow modules. Dashboard, Workbench, Workspace Settings, User Settings, API Keys, Audit Log, and Reporting remain framework-owned. Workbench is specifically not owned by Tasks, Time Tracking, Notes, Support Tickets, or any other workflow module.

When a protected module view belongs to a disabled module, the view service returns a disabled-module response unless the descriptor sets `allowDisabledRead: true` and the module allows historical reads. Permission checks are server-side; `requiredPermissions` on the view descriptor is treated as the page-level gate before the module's APIs enforce record-level access.

Browser asset descriptors require `id`, `moduleId`, `path`, and `type` (`script` or `style`); they may include `views`, `requiredPermissions`, and `requiredWorkspaceCapabilities`. Common app-shell assets such as navigation, theme initialization, workspace switching, global search placeholders, notification placeholders, and shared CSS remain framework-owned. Module-specific page scripts/styles should be declared by the owning module and loaded only on the pages that need them.

Framework-owned UI surface contracts live in `docs/ui-surface-contract.md`. Shared CSS classes and browser helpers define modal group structure, modal footer/action placement, overlay host behavior, drawer/slideout shells, main-screen internal panels, dense row/list action placement, chips, dividers, and focus treatment. Modules should consume these classes and helpers rather than inventing one-off modal boxes, footer layouts, overlay behavior, or record-row action shells. Modules remain responsible for their own fields, picker content, validation, API calls, permission checks, and record-specific business semantics.

Framework-owned view-building primitives live in `docs/view-building-contract.md`. `LongtailForge.view` is implemented in `public/js/shared/view-builder.js` as the current imperative helper namespace. The helper layer owns common DOM anatomy such as page headers, status messages, empty states, filter panels, collapsible selector/index panels, split list/detail workspaces, data tables with overflow wrappers, detail headers, metadata/badge rows, action strips, summary panels, modal shells/forms/footers, field grids, inline item/action rows, and the shared Linked Context picker shell. It must stay smaller than a frontend framework: modules keep data loading, state, validation, API calls, save payloads, route permissions, labels, and workflow behavior.

Converted module surfaces should use `LongtailForge.view` helpers for framework-owned anatomy when a matching helper exists. Converted surfaces should not directly create dialog shells, modal footer structures, or dense/detail action rows that the helper already owns, and should not introduce hard-coded light backgrounds outside shared theme tokens. Non-converted surfaces may remain hand-built until an explicit conversion slice names them; the framework view-building contract is adopted surface by surface, not by silently rewriting every protected page.

`viewSurfaces` is the declarative manifest field for framework-rendered protected views. As of 0.33.5.16.12, the backend validates descriptor shape and references, resolves descriptor labels through the existing workspace terminology resolver, exposes active descriptors through the existing app-shell bootstrap payload, and the browser renderer at `public/js/shared/view-renderer.js` can fetch descriptor data sources through `LongtailForge.api.getJson`, render descriptor select filters, expose stable generic field hooks, preserve basic field attributes, dispatch declarative actions through route metadata or registered behavior handlers, and expose descriptor-backed wrappers for action strips, field grids, tables, modal forms, inline action rows, and linked-record panels. Lists now uses a descriptor for its protected workspace read shell, item form fields, item table/action placement, list-level workflow actions, linked-record picker/row placement, and create/edit modal shell. Strict declarative guardrails currently enforce `lists.workspace` only; Tags and Developer Example descriptors are inventoried but not strict-converted surfaces. A descriptor requires `id`, `moduleId`, `viewId`, `layout`, and `dataSource.fieldBindings`. Supported layouts are `single-column`, `split-list-detail`, and `table-page`. Descriptors may declare `pageHeader`, `filters`, `indexPanel`, `table`, `detail`, `modals`, and `actions` using framework-owned anatomy names. Descriptor `moduleId` values must reference a known module, `viewId` values must bind to a protected view for that module, surface IDs must be unique across loaded modules, action `requiredPermissions` must reference known core or module permissions, action roles are limited to `primary`, `secondary`, `destructive`, and `utility`, and descriptor routes must be local app paths with supported HTTP methods.

Descriptor text fields may use either literal display text or terminology keys. Literal fields such as `label`, `title`, and `description` are stable fallbacks. Key fields such as `labelKey`, `titleKey`, and `descriptionKey` reference the resolved module terminology for the current workspace type. The resolver applies `default`, then `personal` for Family workspaces, then the exact workspace type, matching the existing module terminology rules. If a key resolves, it replaces the matching literal field for display; if a key is missing, the literal field remains. Terminology keys affect descriptor display text only. They must not change descriptor IDs, module IDs, view IDs, routes, permission IDs, data-source field bindings, behavior IDs, stored records, or business workflow behavior.

Modules contribute declarative view data, normalized data endpoints, field-binding maps, and named behavior IDs for custom actions. The framework owns common page/layout/modal/table/action anatomy, surface classes, overflow wrappers, responsive behavior, focus/accessibility defaults, terminology resolution, permission-safe app-shell descriptor delivery, descriptor data-source fetching, field-binding projection, default loading/empty/error states, refresh, and descriptor-to-DOM rendering through the existing `LongtailForge.view` primitives. Modules keep ownership of record labels and fields, validation, save payloads, API routes, permission checks, service logic, behavior handlers, and workflow decisions.

Dashboard items require `id`, `label`, `renderer`, and `moduleId`; they may include `description`, `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiresEnabledModules`, `sortOrder`, and display-only terminology. Dashboard contributions should describe module-provided cards, summary sections, empty states, or links while the Dashboard page chrome and general layout remain framework-owned. Dashboard contributions from disabled modules are hidden unless a future contribution explicitly allows historical dashboard reads.

Workbench cards require `id`, `label`, `renderer`, and `moduleId`; they may include `description`, `sourceType`, `listRoute`, `actions`, `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiresEnabledModules`, `defaultCollapsed`, and `sortOrder`. Workbench cards from disabled modules should be hidden. The Workbench page owns layout, filters, loading state, status messaging, and generic action dispatch, while module renderers own record-specific presentation.

Timer sources declare record types that can start or control timers. A timer source requires `sourceType`, `moduleId`, and `label`; it may include `listRoute`, `startRoute`, `pauseRoute`, `finalizeRoute`, `removeRoute`, `requiredPermissions`, and `requiredModules`. First-party timer sources should provide all five lifecycle route descriptors: list active/paused timers, start/resume, pause, finalize into a time entry, and remove/discard. Time Tracking owns active timer persistence and finalization. Source modules expose record context and routes; they do not own duplicate timer engines.

Workbench item sources expose actionable records to the Workbench page. They require `sourceType`, `moduleId`, `label`, and `listRoute`; they may include `requiredPermissions`, `requiredModules`, `filterHints`, and `sortHints`. Source modules should expose dedicated list routes rather than pointing at the aggregate Workbench bootstrap payload. Records should normalize to `source_module_id`, `source_type`, `source_id`, `source_label`, `source_url`, `source`, `title`, `description`, `client_id`, `client_name`, `project_id`, `project_name`, `status`, `priority`, `due_at`, `assignee_ids`, `timer_status`, and `elapsed_seconds`.

Linked Context providers expose selectable records to shared Linked Context pickers. A provider descriptor requires `id`, `moduleId`, `targetType`, `label`, `description`, `provider`, `responseContract`, `requiredReadPermission`, and `requiredPermissions`; it may include `requiredModules`, `requiredWorkspaceCapabilities`, `workspaceTypes`, and terminology. Provider results use the `linked-context-target.v1` response contract in `docs/linked-context-picker-contract.md`. Source modules own target lookup, permission-safe filtering, sorting, safe display labels, secondary labels, source URLs, and Primary Context hints. The framework may list active providers and render provider-supplied labels through the shared Linked Context picker shell, but it must not construct module-specific labels or sort module-owned records itself.

The Workbench timer payload includes both flat compatibility fields and a nested `source` object with `module_id`, `type`, `id`, `label`, `url`, and `enabled`. Manual timers use `source_type = manual`. Task timers use `source_module_id = tasks`, `source_type = task`, and `source_id = task_id`; they require both Tasks and Time Tracking to be enabled, task read access, and time entry create access. Future Support Ticket timers should use `source_module_id = support-tickets`, `source_type = ticket`, and `source_id = ticket_id`, and should finalize through the same active timer engine into normal time entries with ticket metadata.

The browser Dashboard and Workbench scripts dispatch registered contribution renderers by `renderer` ID. First-party renderers such as `task-summary`, `billing-summary`, `active-work-timers`, and `task-workbench-items` live in framework page scripts for now, but their availability is driven by module contributions returned from the backend registry.

Work resume state is framework-owned recovery infrastructure. Modules do not create their own global resume tables, ranking feeds, browser resume APIs, or Workbench "left off" UI. The framework stores current-user recovery snapshots in `work_resume_state`, exposes protected browser reads through `/api/work-resume`, and keeps public `/api/v1` resume-state routes deferred. Producer modules decide which safe lifecycle events are resumable and shape explicit payload fields through the resume-state producer contract. Read-time access remains authoritative: every returned row must pass a module-owned read resolver, and disabled, missing, deleted, completed, archived, finalized, or permission-denied records stay out of primary left-off results.

Resume-state producer definitions are registered in service code, not in module manifests. A producer declares a stable ID, source module ID, source record type, subscribed safe event names, and a payload builder. Payload builders may return explicit fields such as module/record identity, title, source URL, client/project IDs, last action, last worked timestamp, status, priority, due date, next action, handoff note, blocked reason, rank hint, and sanitized metadata. They must not mine or copy arbitrary bodies, comments, rendered HTML, secure/encrypted fields, attachment internals, protected storage paths, scanner data, or hidden linked-record labels. A producer may return a removal action for source records that should no longer have resume state.

Resume-state read resolvers are module-owned permission checks registered by module/record type. A resolver receives the current session, workspace/user IDs, source record identity, and stored row, then returns whether the current user can still read the source plus optional lifecycle flags such as `deleted`, `completed`, `archived`, or `finalized`. The framework uses those flags for filtering; the resolver remains the source of truth for source-record visibility. First-party initial producers cover Tasks, Lists, Notes, and Time Tracking. Private and secure Notes are excluded from global resume-state rows in this foundation release, and sourced task timers update the source task row while manual active timers remain Time Tracking-owned.

Cross-screen add/edit dialog actions are registered in browser code through `window.LongtailForge.moduleActions.register()`, not through a manifest field. A dialog action must identify its `actionId`, `moduleId`, `recordType`, `mode`, label, required modules, required permissions, and required workspace capabilities, then provide a module-owned `open(params, hostContext)` callback. The framework action dispatcher owns discovery, availability filtering, dispatch, host lifecycle, focus return, and completion callbacks. Modules own dialog rendering, form state, validation, API calls, save behavior, reset behavior, and record-specific permission handling. The dispatcher does not embed module pages, create iframes, or import module-specific form internals. Settings and setting modals are excluded from this action contract and remain in settings pages. Future manifest metadata may declare action descriptors, but browser opener functions should remain module-owned assets rather than framework imports of module form internals.

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

Tag propagation descriptors live in optional `tagPropagation` manifest metadata. A descriptor declares the source module/type, target module/type, relationship resolver ID, workspace field, source read permission, target tag permission, required modules, and timing hints. Resolver IDs are registered in the framework tag propagation registry; manifests should not embed function references. Active propagation rules require their modules and required modules to be enabled. The tag service materializes propagated assignments with source metadata, honors suppressions, emits safe tag assignment/effective-refresh events, and exposes repair tooling without asking consuming modules to duplicate propagation SQL.

The `tags` module contributes browser routes under `/api/tags`. `GET /api/tags`, `POST /api/tags`, `PUT /api/tags/:tagId`, `POST /api/tags/:tagId/archive`, and `POST /api/tags/:tagId/restore` manage workspace tag definitions. `GET /api/tags/assignments` reads direct, propagated, and effective tags for a registered target, `PUT /api/tags/assignments` replaces that target's manual tag set in one save, and `POST /api/tags/assignments/:assignmentId/suppress` suppresses a propagated assignment on the current record. Browser tag reads expose direct/manual tags, propagated tags, system tags, and combined effective tags; existing `tags` arrays remain combined effective tags for compatibility. The module also contributes `tags.html` and the shared browser tag helper for tag chips and reusable pickers. Disabling the `tags` module removes the interface and blocks tag APIs without requiring first-party record modules to know how tag storage works.

Search is a framework-owned service. Modules may declare searchable records in `searchableTypes`, but modules do not own global search routing, browser UI, permission filtering, or search storage. Searchable type descriptors require `recordType`, `moduleId`, `idField`, `titleField`, `summaryField`, `bodyFields`, `workspaceField`, `requiredReadPermission`, and `indexer`. They may include `clientField`, `projectField`, `requiredModules`, `tagsTextField`, `visibilityField`, `recordStatusField`, `sourceLabel`, `label`, `description`, and display-only terminology. The `indexer` value must be a stable string ID resolved through the framework search indexer registry; manifests should not contain direct function references. As of 0.32.9.5, the search service exposes capability discovery, declaration validation, registered searchable type lookup, enabled-workspace active searchable type lookup, permission-safe filter composition, backend-neutral search request shaping including `source`, backend adapter runtime capability reporting, canonical `search_index` metadata, normalized framework search document shaping, formal single-record indexing/removal/re-indexing methods, first module-owned indexers for Tasks, Time Entries, Clients, and Projects, framework-owned Help article indexing, service-owned event synchronization for initial module records, rebuild tooling for workspace/module/local app-wide scopes, adapter-owned SQLite FTS repair, adapter-backed search execution, and a protected browser `GET /api/search` route with result-level permission shaping. Active searchable types are filtered by enabled workspace modules and required module dependencies, so disabled modules may keep declarations without contributing active search types, active rebuild targets, active search request targets, authenticated-shell search target options, or results-page filter options. Help contributes framework-owned search types outside module manifests: Help articles use `record_type = help_article`, `source = Help`, `module_id = framework` for framework articles, and the owning module ID for module-declared articles. `search_index` is the source of truth for searchable-record metadata and stores workspace, module, record type, record ID, title, summary, body, tag text, client/project scope, visibility, record status, source, record timestamps, and indexed timestamp. Search request models must remain adapter-neutral: SQLite FTS syntax belongs in the SQLite adapter, PostgreSQL full-text syntax belongs in a future PostgreSQL adapter, and module declarations should not change for either backend. `visibility` describes search visibility metadata and does not replace record permissions. `record_status` supports active/archived/completed-style filtering without becoming a universal workflow state. `source` is a display/search label and not a permission source of truth. Exact tag filtering uses canonical tag assignments even when `tags_text` is denormalized for text matching or ranking. The SQLite adapter creates `search_index_fts` only when the active SQLite build supports FTS5; otherwise it uses indexed `LIKE` fallback over canonical `search_index` fields. FTS rows are synchronized from framework search service writes, removed through adapter-owned single-record removal, and repairable through adapter-owned rebuild from canonical `search_index`; FTS storage must not become the source of truth for permissions, visibility, workspace scope, module scope, or record lifecycle state. Module mutation services should call the framework sync helper after successful create/update/archive/restore/delete flows when a stable service mutation exists, and should log search sync failures without moving indexing side effects into browser code. Rebuild-capable module indexers should return workspace documents when called without a `recordId` in rebuild mode; the framework rebuild service performs normalization, canonical upserts, stale-row removal, inactive type cleanup, dry-run counting, protected active-workspace rebuilds, local app-wide rebuilds, and scoped adapter repair. Browser search routes call the framework search service and must not query SQLite FTS or canonical search tables directly. Browser results are pruned after full-text matching against the declared read permission and real result scope, then shaped with snippet, source label, status, optional score, context, tags, and safe target hints without exposing raw indexed body text or denormalized tag text. The shared authenticated shell owns the lightweight icon-triggered global search entry and submits URL parameters to the framework-owned `search.html` results page. The completed browser search workflow is covered by end-to-end regressions for initial indexed record discovery, record edit re-indexing, stable pagination, permission pruning, Help article search, and UI state hooks. Public API search remains separate roadmap work.

Markdown rendering is a framework-owned content service. Modules may store Markdown source and own record semantics, but they must use `src/core/markdown/markdown.service.js` or a module adapter over it for safe HTML rendering, plain-text extraction, excerpts, source normalization, and safe URL handling. The approved syntax set is CommonMark plus explicitly enabled tables and task lists; broad extension bundles, raw HTML, unsafe links, unsafe image sources, renderer rewrites of saved source, and module-specific ad-hoc parsers remain out of scope. Notes owns note body storage, revisions, wiki-link behavior, secure-note access, and the `POST /api/notes/preview` draft preview route that renders through the Notes Markdown adapter. Help owns article discovery, metadata, ToC navigation, and active module scoping while rendering article Markdown through the shared service and indexing Help search text through the same plain-text path. Future Knowledge Base records will own publication status, review workflow, source snapshots, and visibility while consuming the same framework Markdown contract.

File attachments are a framework-owned service. Modules may declare attachable records in `attachableTypes`, but modules do not own file storage, storage keys, scan/quarantine state, download routing, attachment metadata tables, or file lifecycle event emission. Attachable type descriptors require `targetType`, `moduleId`, `label`, `description`, `tableName`, `idField`, `labelField`, `workspaceField`, `requiredReadPermission`, and `requiredAttachPermission`. They may include `clientField`, `projectField`, `requiredRemovePermission`, `allowedFileCategories`, `allowedVisibilityValues`, `maxFilesPerRecord`, `maxFileSizeBytes`, `lifecycleEvents`, `requiredModules`, and display-only terminology. The framework discovers attachable target types from manifests through `modulesService.listAttachableTypes()` and active workspace targets through `modulesService.listActiveAttachableTypes()` / `filesService.listActiveAttachableTypes()`, so disabled modules may keep declarations without contributing active attachment targets. As of the 0.32.13 closeout, storage metadata lives in `files`, record links live in `file_attachments`, file abuse reports live in `file_reports`, core file permissions are `files.view`, `files.upload`, `files.download`, `files.delete`, `files.manage_quarantine`, and `files.manage_workspace_settings`, and the protected local filesystem adapter validates server-generated storage keys stay under the configured data directory. Browser file routes are framework-owned: `POST /api/files`, `GET /api/files/:fileId`, `GET /api/files/:fileId/download`, `POST /api/files/:fileId/delete`, `GET /api/files/attachments`, `GET /api/files/attachments/counts`, `POST /api/files/attachments`, `POST /api/files/attachments/:fileAttachmentId/remove`, `POST /api/files/:fileId/report`, and the admin quarantine route. The first upload route accepts authenticated JSON/base64 payloads, enforces extension allowlists, simple content signature checks, size limits, active target checks, workspace ownership, permissions, no-op scanner hooks, and audit/event emission. Downloads go through authenticated app routes and are allowed only for available files with passing/non-required scan status and at least one readable active attachment. File lifecycle events are canonical `file.*` events with sanitized payloads; they must not include raw file contents, unsafe paths, secrets, or scanner internals. Browser screens should use `LongtailForge.fileAttachments.mount()` for upload/list/download/remove mechanics, passing module ID, target type, target ID, optional client/project context, accepted categories, and display callbacks. Modules still own record-specific placement and labels. The framework also exposes a simple Files page for workspace browsing and filtered attachment discovery, while actual attachment management stays on owning record screens. See `docs/0.32-module-file-closeout.md` for the 0.32.x boundary review before building Notes.

Help Center is a framework-owned product documentation surface. Modules may declare help content in `help.sections` and `help.articles`, but modules do not own Help Center routes, browser chrome, search integration, or contribution validation. Section descriptors require `id`, `moduleId`, and `title`; they may include `description`, `sortOrder`, `audience`, `tags`, `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiredModules`, and display-only terminology. Article descriptors require `id`, `moduleId`, `title`, summary or description, and either inline `body` or a safe relative Markdown `contentPath`; first-party product Help should use `contentPath` under the repo-owned `help/` tree. Article descriptors may include `slug`, `sectionId`, `sortOrder`, `audience`, `tags`, `relatedArticleIds`, `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiredModules`, and display-only terminology. IDs must be stable manifest identifiers, article slugs must be URL-friendly, section/article IDs, article slugs, and article content paths must be unique inside the contribution, and article `sectionId` values must reference a section declared in the same block. Framework-owned Help validation also supports articles without a module ID so core app help does not pretend to belong to a disable-able module. Active Help discovery filters disabled modules and required module dependencies. As of 0.33.5.17.6, the framework serves protected `help.html` plus protected `/api/help` and `/api/help/articles/:articleIdOrSlug` routes for active Help Center content, loads Markdown article bodies through the Help service from safe paths under `help/`, exposes ToC-driven browser navigation from `help/toc.md`, renders article Markdown through the shared framework Markdown service, returns explicit `bodyFormat`/`bodyMarkdown` source fields plus safe `bodyHtml`/`bodyHtmlFormat` rendered fields, indexes active Help articles as `help_article` search rows with shared Markdown-derived body text and `source = Help`, and keeps product Help current-state focused on framework, module, and workflow usage. Help search rebuilds re-read active Help content through the Help service, route results back to Help Center article URLs/actions, and stay separate from future Knowledge Base metadata. Knowledge Base authoring remains later roadmap work.

Notification event descriptors require `id`, `moduleId`, `label`, `description`, `defaultEnabled`, and `defaultPriority` (`low`, `normal`, `high`, or `urgent`). They may include `recipientResolver` for a named module/framework resolver or `recipientMode` for a framework-recognized mode such as `actor`, `assignees`, `workspace_admins`, or `explicit_users`. Notification template descriptors require `id`, `moduleId`, `event`, `title`, and `body`; they may include a relative `url` or `recordLinkPattern`. Notification follow target descriptors require `targetType`, `moduleId`, `label`, `description`, and `requiredReadPermission`; they may include an `eventTypes` list to limit which module notification events can be delivered through per-target follows. The framework stores notification records in a workspace-scoped, recipient-specific `notifications` table with module, event, record, status, priority, URL, and metadata fields.

The notification service creates single or multi-recipient records, lists current-user notifications, counts unread records, marks one or all notifications read, dismisses notifications, archives older read/dismissed records, manages per-target follow subscriptions, and decorates target metadata before returning links. Browser notification routes are framework routes under `/api/notifications`; they only return the active user's own notifications in the active workspace. Target links are hidden when the recipient cannot access the target record. Per-target follows are scoped to one workspace, user, module, target type, and target ID; they can override that user's broader event mute for the followed target but do not mutate workspace defaults or other users' preferences.

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
