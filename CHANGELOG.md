## Version 0.32.10-0.32.13 Planning - 2026-06-09 01:59 -04:00

- Reworked the planned file framework roadmap into efficient passes for contract/schema/hooks, secure API and lifecycle events, reusable UI plus first module integrations, and final 0.32.x module-boundary/help closeout.
- Added explicit framework-owned file lifecycle event hooks for upload, attach, scan, quarantine, availability, download, report, remove, and delete flows.
- Recorded planning decisions that modules consume files through manifest declarations, framework APIs, shared UI helpers, and safe lifecycle events instead of owning separate file storage or attachment systems.
- No package version was bumped because this was a documentation-only planning pass, not an implemented release.

## Version 0.32.9.6 - 2026-06-09 01:29 -04:00

- Bumped the app version to `0.32.9.6`.
- Standardized the listed protected workspace pages on the shared dashboard/workspace content width through centralized CSS variables.
- Removed redundant `Project Name (Client Name)` labels from Projects table and bulk edit rows when a specific business-client project filter is selected.
- Fixed reporting scope hierarchy metadata and tree ordering so child clients nest under parent clients in Reporting.
- Adjusted reporting project rollups and dashboard reporting totals to avoid double-counting selected child projects when a parent project is already selected with descendants included.
- Fixed the Reporting project selector to use parent-before-child project tree traversal so child projects remain under their actual parent project.
- Added expandable Reporting project summary rows so parent project rollups can reveal child project subtotals without changing footer totals.
- Added a Search page index rebuild control for workspace-settings managers and scheduled a non-fatal startup search index rebuild to automate historical index catch-up.
- Expanded focused regressions for page width contracts, reporting hierarchy rollups, project labels, and search index maintenance.

## Version 0.32.9.5 - 2026-06-09 00:59 -04:00

- Bumped the app and first-party module versions to `0.32.9.5`.
- Closed the 0.32.9 Help Center rollout with end-to-end workflow regression coverage for authenticated Help access, framework and active-module Help discovery, disabled-module hiding, Help-specific search, safe Help search links/snippets, and Settings-menu placement.
- Updated README and framework/module documentation for the completed Help Center route/API, manifest contribution, baseline framework article, and Help search indexing behavior.
- Recorded 0.32.9 closeout decisions and kept Knowledge Base authoring, public API Help routes, autocomplete/typeahead, and richer module-authored Help content deferred.
- Archived older completed roadmap material while keeping 0.32.9 as the most recently completed roadmap section and 0.32.9.6 as the next active work.

## Version 0.32.9.4 - 2026-06-09 00:46 -04:00

- Bumped the app and first-party module versions to `0.32.9.4`.
- Added baseline framework-owned Help articles for getting started, workspaces, users and permissions, clients and projects, time tracking, tasks, notifications, tags, search, settings, modules, and the Help Center itself.
- Kept the initial framework Help content short, current-state, task-oriented, and separate from developer docs and roadmap history.
- Preserved framework owner/source metadata in Help Center article payloads and indexed each framework article as a Help search record.
- Added `scripts/help-content-regression.mjs` and wired it into `npm run check`.
- Updated search rebuild/lifecycle regressions for the expanded baseline framework Help article count.

## Version 0.32.9.3 - 2026-06-09 00:26 -04:00

- Bumped the app and first-party module versions to `0.32.9.3`.
- Added framework-owned Help search indexing with `record_type = help_article` and `source = Help`.
- Indexed framework Help articles and active module-declared Help articles through the existing search indexer registry and rebuild/repair boundary.
- Added source filtering to `GET /api/search` and updated the Search page Source filter to submit the search source label.
- Routed Help search results to `help.html?article=<article-id>` without exposing raw indexed Help body text in browser results.
- Extended rebuild cleanup so rows for inactive module/type pairs are removed during workspace/module rebuilds.
- Added `scripts/help-search-regression.mjs` and updated existing search regressions for Help search coverage.

## Version 0.32.9.2 - 2026-06-09 00:03 -04:00

- Bumped the app and first-party module versions to `0.32.9.2`.
- Added protected framework-owned `help.html` with a two-column Help Center layout, active article navigation, and browser loading/empty/error states.
- Added protected `/api/help` and `/api/help/articles/:articleIdOrSlug` routes backed by the framework Help service.
- Added a minimal framework-owned Help Center starter article while keeping the fuller framework article set in the later 0.32.9.4 pass.
- Added Help to the Settings menu after User so it appears before the existing Log Out action.
- Added `scripts/help-center-surface-regression.mjs` and wired it into `npm run check`.

## Version 0.32.9.1 - 2026-06-08 17:42 -04:00

- Bumped the app and first-party module versions to `0.32.9.1`.
- Added the framework-owned Help contribution contract with optional module manifest `help.sections` and `help.articles` declarations.
- Added validation for stable help IDs/slugs, section/article ownership, article summaries/content sources, safe relative content paths, duplicate IDs/slugs, and section references.
- Added registry/service helpers for listing all Help declarations and active workspace-visible Help declarations, with disabled-module help hidden from active discovery.
- Added a developer-example help declaration and wired `scripts/help-contract-regression.mjs` into `npm run check`.
- Updated module contract and development docs for manifest-declared Help pages.

## Version 0.32.9 Planning - 2026-06-08 17:33 -04:00

- Expanded the 0.32.9 roadmap into Help Center implementation passes covering the manifest contribution contract, framework-owned Help Center UI/API, Help search indexing and filters, initial framework help pages, and release closeout.
- Recorded the planning decision that Help Center is framework-owned product/module documentation, while modules contribute help pages and user-authored Knowledge Base remains separate future module work.
- No package version was bumped because this was a roadmap/decision planning update, not a completed 0.32.9 implementation pass.

## Version 0.32.8.6 - 2026-06-08 17:15 -04:00

- Bumped the app, first-party module, and search service versions to `0.32.8.6`.
- Moved authenticated-shell search into an icon-triggered dropdown placed before Dashboard.
- Moved the notifications panel trigger into an icon-only bell at the end of navigation after Settings while retaining unread count, panel actions, and the notifications page link.
- Updated responsive navigation styling and expanded `scripts/search-shell-regression.mjs` to cover the new shell control placement and accessibility hooks.

## Version 0.32.8.5 - 2026-06-08 17:06 -04:00

- Bumped the app, first-party module, and search service versions to `0.32.8.5`.
- Added `scripts/search-workflow-regression.mjs` covering indexed Task, Time Entry, Client, and Project discovery through browser search, record edit re-indexing, stable pagination, permission pruning, and global search UI state hooks.
- Wired the search workflow regression into `npm run check`.
- Updated README, architecture, module contract, module development docs, decisions, and roadmap closeout notes for the completed 0.32.8 browser search release.
- Kept public API search deferred to `TODO.md` Medium Term / Search Capability Expansion.

## Version 0.32.8.4 - 2026-06-08 16:50 -04:00

- Bumped the app, first-party module, and search service versions to `0.32.8.4`.
- Added protected framework-owned `search.html` with URL-driven query, module, record type, client, project, tag, status, and page controls.
- Added `/js/search.js` to fetch permission-shaped results from `GET /api/search`, render grouped results, route result titles through API-provided target URLs, and keep filter changes reflected in the URL.
- Added search result loading, prompt, empty, error, and pagination states without exposing hidden/pruned result counts.
- Added responsive search page styling for the filter panel, grouped result rows, result metadata, tags, and pagination.
- Added `scripts/search-results-page-regression.mjs` and wired it into `npm run check`.
- Deferred public API search out of 0.32.8 per the recorded design decision and moved the future `GET /api/v1/search` scope to `TODO.md` under Medium Term / Search Capability Expansion.

## Version 0.32.8.3 - 2026-06-08 16:27 -04:00

- Bumped the app, first-party module, and search service versions to `0.32.8.3`.
- Added active `searchTargets` to the authenticated app shell bootstrap from enabled module searchable type declarations.
- Added a compact framework-owned global search form to the shared authenticated header with a query field and all/record-type selector.
- Kept the header control lightweight by submitting URL parameters to `search.html` without fetching results, adding typeahead, or adding dashboard-specific behavior.
- Added responsive header search styling that preserves existing page actions and navigation controls on dense pages.
- Added `scripts/search-shell-regression.mjs` covering shell search target exposure, navigation markup, URL parameter submission, no direct result fetch, and responsive CSS hooks.

## Version 0.32.8.2 - 2026-06-08 16:15 -04:00

- Bumped the app, first-party module, and search service versions to `0.32.8.2`.
- Added result-level browser search permission shaping after full-text matching, including real client/project record scope checks for visible results.
- Changed browser search pagination to page over permission-visible results instead of raw adapter matches.
- Expanded browser search result payloads with snippet, source label, status, score when available, updated timestamp, client/project context, assigned tags, and safe target URL/action hints.
- Kept raw indexed body text and denormalized tag text out of browser search responses.
- Expanded `scripts/search-api-regression.mjs` to cover per-result permission pruning, disabled-module hiding, context enrichment, tag enrichment, target hints, and safe payload fields.

## Version 0.32.8.1 - 2026-06-08 16:00 -04:00

- Bumped the app, first-party module, and search service versions to `0.32.8.1`.
- Added protected browser `GET /api/search` with authenticated active-workspace scope, query/module/record type/client/project/tag filters, and page/limit pagination.
- Routed browser search through the framework search service while keeping SQLite FTS5 and indexed `LIKE` fallback behind the adapter boundary.
- Added backend-neutral browser search metadata and pagination metadata while returning a browser-safe result contract without raw indexed body text.
- Added target-level read-permission filtering for the first browser API pass; deeper per-result shaping remains planned for 0.32.8.2.
- Added `scripts/search-api-regression.mjs` covering authentication, filter parsing, structured validation errors, stable pagination, safe result payloads, and real HTTP route behavior.
- Recorded 0.32.8 planning decisions, including no typeahead yet, shared-header placement, no advanced search behavior, and explicit deferral of `GET /api/v1/search`.

## Version 0.32.7.6 - 2026-06-08 15:28 -04:00

- Bumped the app and first-party module versions to `0.32.7.6`.
- Added `scripts/search-lifecycle-regression.mjs` covering initial module indexing, idempotent rebuilds, re-index after edits, workspace scoping, disabled-module active-search hiding, and permission-aware search request filters.
- Wired the final search lifecycle regression into `npm run check`.
- Updated module development documentation for rebuild-capable search indexers and the completed 0.32.7 indexing/rebuild lifecycle.
- Closed the 0.32.7 roadmap checklist while keeping global search API routes, browser UI, public API search, fuzzy search, synonyms, external engines, and advanced relevance tuning in later versions.

## Version 0.32.7.5 - 2026-06-08 15:18 -04:00

- Bumped the app and first-party module versions to `0.32.7.5`.
- Added SQLite adapter-owned FTS rebuild/repair support that rebuilds FTS rows from canonical `search_index` rows.
- Added missing FTS row repair, orphaned FTS row cleanup, and dry-run/skipped repair summaries.
- Exposed framework search service repair plumbing while keeping FTS-specific behavior inside the SQLite adapter boundary.
- Included FTS repair counts in workspace/module rebuild summaries without exposing broad app-wide repair through protected browser routes.
- Added `scripts/search-fts-repair-regression.mjs` and wired it into `npm run check`.
- Updated roadmap, decisions, architecture, and module contract documentation for the 0.32.7.5 FTS repair release.

## Version 0.32.7.4 - 2026-06-08 15:07 -04:00

- Bumped the app and first-party module versions to `0.32.7.4`.
- Added framework-owned search index rebuild service methods for workspace, module, and local app-wide rebuild scopes.
- Added a protected active-workspace rebuild endpoint gated by `workspace_settings.manage`, while keeping app-wide rebuilds in local maintenance tooling only.
- Added `scripts/search-index-rebuild.mjs` for local workspace/module/app-wide rebuilds with optional dry-run mode.
- Extended initial module indexers so Tasks, Time Entries, Clients, and Projects can enumerate workspace documents for rebuilds.
- Added rebuild summaries with scanned, indexed, skipped, removed, failed, and repaired counts, plus stale canonical row removal for rebuilt targets.
- Added `scripts/search-rebuild-regression.mjs` and wired it into `npm run check`.
- Updated roadmap, decisions, architecture, and module contract documentation for the 0.32.7.4 rebuild tooling release.

## Version 0.32.7.3 - 2026-06-08 14:40 -04:00

- Bumped the app and first-party module versions to `0.32.7.3`.
- Added a shared server-side search index sync helper for single-record re-index/remove calls with clear failure logging.
- Wired Tasks, Time Entries, Clients, and Projects mutations to update canonical search rows after successful create/update/archive/restore/delete flows.
- Re-indexed downstream project/time-entry search rows when client archives or project moves/renames affect indexed metadata.
- Added `scripts/search-index-sync-regression.mjs` and wired it into `npm run check`.
- Updated roadmap, decisions, architecture, and module contract documentation for the 0.32.7.3 event-driven synchronization release.

## Version 0.32.7.2 - 2026-06-08 14:24 -04:00

- Bumped the app and first-party module versions to `0.32.7.2`.
- Added module-owned search indexers for Tasks, Time Entries, Clients, and Projects, each registered by stable framework indexer ID.
- Added searchable type manifest declarations for `task`, `time_entry`, `client`, and `project` with read permissions, scope fields, status metadata, source labels, and tag text support.
- Added canonical tag text lookup for module indexers while keeping exact tag filtering tied to canonical tag assignments.
- Expanded search regression coverage so each initial module can re-index one real record through the framework service and produce normalized `search_index` rows.
- Updated roadmap, decisions, architecture, module contract, and module development documentation for the 0.32.7.2 module indexer release.

## Version 0.32.7.1 - 2026-06-08 14:12 -04:00

- Bumped the app and first-party module versions to `0.32.7.1`.
- Added formal framework-owned single-record search indexing methods for indexing one normalized document, removing one indexed record, and re-indexing one record through the module indexer registry.
- Kept `search_index` as the canonical write target while leaving SQLite FTS synchronization and single-record FTS cleanup inside the SQLite adapter.
- Added predictable indexing semantics for idempotent upserts, stale-row removal when an indexer returns no searchable document, and structured indexing error results.
- Expanded search regression coverage for single-record upsert, canonical/FTS removal, idempotent re-indexing, stale-index cleanup, missing-indexer errors, and fallback search behavior.
- Updated roadmap, decisions, architecture, module contract, and module development documentation for the 0.32.7.1 indexing service write-method release.

## Version 0.32.6.7 - 2026-06-08 13:42 -04:00

- Bumped the app and first-party module versions to `0.32.6.7`.
- Closed the 0.32.6 search framework contract with expanded regression coverage for adapter-backed search, SQLite FTS5/fallback behavior, canonical `search_index` ownership, client/project scope filters, exact tag filters, and invalid searchable declarations.
- Updated README, architecture, module contract, roadmap, and decisions documentation for the completed search foundation.
- Archived older completed roadmap sections while keeping the completed 0.32.6 section as the active roadmap's latest completed section.
- Planned 0.32.7 as six search indexing/rebuild sub-version passes on 2026-06-08 13:53 -04:00, keeping global search API/UI work in 0.32.8.

## Version 0.32.6.6 - 2026-06-08 12:50 -04:00

- Bumped the app and first-party module versions to `0.32.6.6`.
- Added adapter-owned SQLite FTS5 setup that creates `search_index_fts` only when the active SQLite build supports FTS5.
- Added prototype search document writes through the framework search service, keeping `search_index` canonical and synchronizing FTS rows when available.
- Added SQLite search execution through FTS5 or indexed `LIKE` fallback, with forced fallback support for observable regression coverage.
- Documented that 0.32.7 rebuild tooling will regenerate FTS rows from canonical `search_index` rows and repair missing/orphaned FTS entries.
- Updated roadmap, decisions, architecture, and module contract documentation for 0.32.6.6.
- Fixed the Projects page Client filter so it only offers active clients while preserving the workspace projects option.
- Fixed Workbench `Open Task` so it opens the Tasks edit modal in place instead of redirecting to the Tasks page edit URL.
- Added a top-heading Time Entries shortcut to Time Tracker and widened the shared time entry dialog to avoid horizontal modal overflow.

## Version 0.32.6.5 - 2026-06-08 12:29 -04:00

- Bumped the app and first-party module versions to `0.32.6.5`.
- Added a backend-neutral permission-safe search request model that scopes searches to the active workspace, hides disabled-module targets, and carries declared read permissions per target.
- Documented search metadata semantics for visibility, record status, source labels, and canonical tag assignment filtering.
- Expanded search contract regression coverage for workspace escape prevention, disabled-module target hiding, adapter-neutral query shaping, and per-target permission metadata.
- Updated architecture, module contract, module development, roadmap, and decisions documentation for 0.32.6.5.

## Version 0.32.6.4 - 2026-06-08 11:51 -04:00

- Bumped the app and first-party module versions to `0.32.6.4`.
- Added active searchable type discovery that filters declarations by enabled workspace modules and required module dependencies.
- Made `bodyFields` an explicit required searchable type declaration field.
- Added framework search document normalization so module-owned indexers return normalized `search_index`-shaped documents instead of writing search tables directly.
- Expanded search and module sanity regressions for required body fields, disabled-module filtering, and normalized search document output.
- Updated architecture, module contract, module development, roadmap, and decisions documentation for 0.32.6.4.

## Version 0.32.6.3 - 2026-06-08 11:43 -04:00

- Bumped the app and first-party module versions to `0.32.6.3`.
- Added migration `040_add_search_index.sql` with the canonical `search_index` framework search metadata table.
- Added basic SQLite fallback/filter indexes for workspace + record type, module, client, project, record status, indexed timestamp, title, and body.
- Updated search service capabilities to report the canonical `search_index` metadata table.
- Expanded search and fresh database regressions to verify the `search_index` schema, indexes, migration marker, and absence of FTS virtual tables in this pass.
- Updated architecture, database, module contract, module development, roadmap, and decisions documentation for 0.32.6.3.

## Version 0.32.6.2 - 2026-06-08 11:33 -04:00

- Bumped the app and first-party module versions to `0.32.6.2`.
- Added the search backend adapter registry and the first SQLite search adapter.
- Added SQLite FTS5 capability detection using compile options and a safe temporary virtual-table probe.
- Reported runtime search backend capabilities from the framework search service, including `sqlite-fts5` versus indexed `LIKE` fallback mode.
- Expanded search contract regression coverage for adapter discovery, FTS5 detection, fallback reporting, and the no-external-search requirement.
- Updated architecture, module contract, module development, roadmap, and decisions documentation for 0.32.6.2.

## Version 0.32.6.1 - 2026-06-08 11:13 -04:00

- Bumped the app and first-party module versions to `0.32.6.1`.
- Added the framework-owned search service shell with capability discovery, searchable declaration validation, registry-driven searchable type lookup, and permission-safe search filter composition.
- Promoted `searchableTypes` from reserved groundwork to an active validated module manifest contract.
- Added the framework search indexer registry so module manifests use stable string indexer IDs while backend services can register resolver functions internally.
- Added `scripts/search-contract-regression.mjs` and wired it into `npm run check`.
- Expanded module sanity checks and docs for searchable type declarations, search ownership, registry-ID indexers, and the deferred API/UI/indexing/rebuild boundaries.
- Updated roadmap and decisions bookkeeping for 0.32.6.1.

## Version 0.32.5.5.1 - 2026-06-08 09:53 -04:00

- Bumped the app and first-party module versions to `0.32.5.5.1`.
- Reworked the upcoming 0.32.6 search framework roadmap into sub-versioned implementation slices, added open design questions, and recorded the planning boundary in `DECISIONS.md` on 2026-06-08 10:53 -04:00.
- Restored the full Notifications page initialization path so the notification inbox loads independently from preference helper/API availability.
- Hardened `notifications.html` filter handling so Active, Unread, Read, and Dismissed update `aria-pressed` and reload the selected notification status.
- Exposed the app-shell notification count refresh hook to full-page notification actions so Mark Read, Mark All Read, and Dismiss keep the list and header badge aligned.
- Cache-busted the Notifications page script and expanded notification regression coverage for inbox initialization, filter wiring, optional preference fallback, and shell count refresh.
- Updated roadmap and decisions bookkeeping for 0.32.5.5.1 Pass 1.
- Added API-decorated notification update type labels through `updateTypeLabel` and `displayType` while preserving raw `event_type`.
- Stored safe changed-field metadata for new event-created notifications so task updates can display labels like "Description Added", "Status Updated", "Priority Updated", "Due Date Updated", "Recurrence Updated", or the fallback "Task Updated".
- Rendered update type badges on both the full Notifications page and notification bell dropdown without changing target title/link behavior.
- Expanded notification regression coverage for created labels, description-specific task update labels, unknown update fallback labels, inaccessible-target label stability, and shared full-page/dropdown rendering.
- Updated roadmap and decisions bookkeeping for 0.32.5.5.1 Pass 2.
- Completed the 0.32.5.5.1 regression closeout with explicit checks for Notifications page hooks, Active/Unread/Read/Dismissed API filters, preference-independent page initialization, filter reload behavior, and shared update type label rendering.
- Updated roadmap and decisions bookkeeping for 0.32.5.5.1 Pass 3.
- Hardened the Notifications page against optional icon helper failures, added visible loading/script-failure placeholders, and cache-busted the page script again so stale browser assets do not leave the inbox and filters blank.
- Switched the Notifications page assets to root-relative URLs and cache-busted the page script to `v=5` so the protected-route URL form cannot request login HTML instead of the notification JavaScript.
- Scoped the Notifications page script and cache-busted it to `v=6` so page-local constants do not redeclare app-shell globals such as `notificationList`.

## Version 0.32.5.5 - 2026-06-07 19:54 -04:00

- Bumped the app and first-party module versions to `0.32.5.5`.
- Replaced the shared checkbox-style tag picker with a WordPress-like token entry control that supports typed tag entry, existing-tag suggestions, removable selected chips, Enter/comma tokenization, and inline status feedback.
- Added shared browser-side tag creation through `window.LongtailForge.tags.createTag`, including duplicate slug/name conflict recovery by reloading and reusing matching active tags.
- Preserved the existing shared picker API for record dialogs through `readTagIds` and `setSelected`, keeping record modules integrated through the shared tag helper.
- Added shared tag picker styling and regression coverage for inline creation, tokenization, duplicate reuse, removable chips, accessibility attributes, and selected-ID reads.
- Updated roadmap and decisions bookkeeping for 0.32.5.5 Pass 1.
- Wired task add/edit and time entry add/edit dialogs to pass their loaded workspace tag options into the shared inline tag picker while preserving selected tag save payloads.
- Kept Stopwatch and Clients/Projects tag pickers visible even when the workspace has no pre-created tags, allowing users to create the first tag inline from record workflows.
- Added record-workflow regression coverage for task, time entry, stopwatch, client, and project tag picker wiring, selected tag payloads, and display-only list rendering.
- Updated roadmap and decisions bookkeeping for 0.32.5.5 Pass 2.
- Added tag usage counts to the tag list query and Tags management page without per-tag lookup calls.
- Enriched Tags page rows with slug, status, updated date, record ID, and usage metadata so similar tags are easier to distinguish.
- Added proactive normalized-slug conflict feedback on the Tags page while preserving the tag service as the authoritative duplicate guard.
- Added Tags management page regression coverage and updated tag service coverage for usage counts.
- Updated roadmap and decisions bookkeeping for 0.32.5.5 Pass 3.
- Fixed confirmed project hierarchy moves so the browser sends `confirm_downstream_update: true` as a top-level API payload field, allowing parent project changes with historical record maintenance to persist after the Move confirmation.
- Added project hierarchy move regression coverage for the browser confirmation payload contract.
- Fixed Project Settings and filtered project table ordering so child projects render immediately below their parent project instead of sorting after similarly named siblings.
- Extended project hierarchy regression coverage to protect parent-before-child project ordering.
- Added `tags` to permission operation override resource mapping so tag create/update/delete restrictions apply consistently to non-protected users.
- Hid task and time-entry inline tag controls when the shared Tags helper is unavailable, while preserving display-only historical tag rendering.
- Extended tag service and browser-helper regression coverage for denied inline creation, denied assignment/removal, allowed existing-tag assignment, disabled Tags module API guards, clear inline error feedback, and module-disabled picker fallback behavior.
- Updated roadmap and decisions bookkeeping for 0.32.5.5 Pass 4.

## Version 0.32.5.4 - 2026-06-06 20:05 -04:00

- Bumped the app and first-party module versions to `0.32.5.4`.
- Added an active notification status filter for unread/read notifications so dismissed and archived notifications stay out of the bell dropdown and default inbox view.
- Updated the notification dropdown to load active notifications, remove dismissed items immediately after successful dismissal, show an empty state after the last dismissal, refresh unread counts, and preserve visible items on failed actions with an error status.
- Tightened notification dropdown title styling with a compact panel-specific title class while preserving target hover context.
- Updated the full Notifications page default filter to Active so "View all" from the dropdown shows the same active notification set.
- Added notification regression coverage for active/dismissed filters and dropdown UI contract behavior.
- Updated roadmap and decisions bookkeeping for 0.32.5.4 Pass 1.
- Added a shared browser notification preference helper so Notifications and User Settings render and save the same framework-owned preference model.
- Grouped notification preferences by module and kept labels user-readable while storing saves by stable event type IDs.
- Added User Settings notification preference controls separate from module enablement/settings controls.
- Disabled user-level event toggles when workspace notification defaults disable the event, while preserving the separate workspace default and user preference models.
- Added audit logging for notification preference and workspace default changes.
- Added notification regression coverage for shared preference rendering, User Settings wiring, workspace-disabled preference controls, and preference/default audit records.
- Updated roadmap and decisions bookkeeping for 0.32.5.4 Pass 2.
- Added framework-owned `notification_subscriptions` storage for per-target notification follows.
- Added `/api/notifications/subscriptions` browser APIs to read, follow, and unfollow one target for the active user.
- Added module-declared `notificationFollowTargets` metadata and declared Tasks task records as followable notification targets.
- Expanded notification delivery so a user following a specific task receives target notifications even when their broader user preference mutes that event type, while workspace defaults still apply.
- Added task notification follow/unfollow controls in the task dialog and a quick Follow Notifications task row action.
- Added audit logging for notification follow/unfollow changes.
- Documented the notification follow target manifest contract and added regression coverage for subscription APIs, delivery overrides, permission checks, and task UI hooks.
- Updated roadmap and decisions bookkeeping for 0.32.5.4 Pass 3.
- Completed the 0.32.5.4 regression closeout with explicit checks for dropdown dismissal, dropdown/inbox active filtering, grouped preference rendering/saves, shared User Settings preference wiring, and per-target subscription override/unfollow behavior.
- Updated roadmap bookkeeping for 0.32.5.4 Pass 4.

## Version 0.32.5.3 - 2026-06-06 17:24 -04:00

- Bumped the app and first-party module versions to `0.32.5.3`.
- Added a framework-owned shared icon helper at `window.LongtailForge.icons` with a local Lucide-derived inline SVG subset for common action icons.
- Added shared `.icon`, `.icon-button`, `.action-button`, and `.action-group` styles with theme-driven `currentColor`, 44px icon-only targets, and preserved danger styling.
- Loaded the shared icon helper on protected app views so module/page scripts can rely on the framework helper during conversion passes.
- Documented the shared icon/action-control contract for module authors and added local Lucide attribution.
- Added shared icon regression coverage and wired it into `npm run check`.
- Converted Time Tracker and task timer controls to shared icon-plus-text action buttons while preserving visible wording for timer actions.
- Converted dense Tasks row actions to shared icon-only controls with accessible labels/titles and preserved danger styling for Archive.
- Added icon control conversion regression coverage and wired it into `npm run check`.
- Converted repeated Tags, Clients/Projects, Time Entries, and notification quick actions to shared icon-only controls where the actions remain obvious.
- Added shared `up` and `down` icons for project default sort controls.
- Added remaining icon action regression coverage and wired it into `npm run check`.
- Added icon accessibility contract regression coverage for labels, titles, decorative SVG behavior, native buttons, disabled/focus/danger styling, 44px touch targets, and local-only icon dependencies.
- Documented icon-only control accessibility expectations.
- Updated roadmap/archive and decisions bookkeeping for 0.32.5.3 Passes 1, 2, 3, and 4.

## Version 0.32.5.2 - 2026-06-06 11:32 -04:00

- Bumped the app and first-party module versions to `0.32.5.2`.
- Added a shared browser-side module action registry and modal host for cross-screen module-owned add/edit dialogs.
- Registered first-party modal actions for Tasks, Time Entries, Projects, and Business-only Clients.
- Updated Workbench `Add Task` to open the module-owned task form through the shared action host instead of navigating to `tasks.html?new=1`.
- Added module-action completion signals to task, time-entry, client, and project save paths so hosts can close and refresh after module-owned saves.
- Added project and time-entry query openers needed by registered edit/add actions.
- Added module-action regression coverage and wired it into `npm run check`.
- Extended module actions with callback-backed module-owned dialog openers, `canOpen` checks, action metadata, host lifecycle callbacks, status handoff, and focus return as the non-iframe contract for future passes.
- Documented the browser-side dialog action contract in the module development and module contract docs.
- Fixed Settings navigation composition so User Settings appears only under Settings -> User and User Admin appears only once under Settings -> Workspace.
- Added a Tasks-owned reusable task dialog helper and switched Tasks page and Workbench `Add Task` flows to use it instead of the iframe/page bridge.
- Added a Time Tracking-owned reusable time entry dialog helper and switched Time Entry module actions plus Edit Entries row edits to use helper-owned dialogs instead of embedded page frames.
- Added Clients/Projects-owned reusable Project and Business-only Client dialog helpers and switched registered Client/Project module actions to helper-owned dialogs instead of embedded page frames.
- Retired the iframe-based module action bridge so the shared registry dispatches only module-owned dialog callbacks and regression coverage fails on frame-based first-party actions.
- Added task-timer lifecycle status transitions so starting an eligible open task timer moves the task to in-progress, discard/reset reverts only timer-started transitions, saved time leaves the task in-progress, and timer-driven status changes are audited distinctly.
- Added active timer source metadata storage plus task-timer status regression coverage for start, pause, discard/reset, finalize, completed-task rejection, and archived-task rejection.
- Replaced the separate Manual Entry and Edit Entries pages with a unified Time Entries screen that provides an `Add Time Entry` toolbar action, filter controls, sort controls, scannable rows, and modal-owned add/edit workflows.
- Updated Time Tracking navigation, protected-view registration, tags asset targeting, and audit record URLs to use `time-entries.html`.
- Added Time Entries screen regression coverage for add/edit modal hooks, filters, sorting, and tag/billable payload preservation.
- Added project-level default task assignee modes for Task Creator, Project Admin, and Unassigned, with Project Admin fallback through oldest active project admin, Business client admin, then workspace admin.
- Added project default assignee storage, Project Defaults UI, task-create resolution, and regression coverage for each default mode and fallback path.
- Updated Workbench task ordering to consume Tasks module project default sort metadata, kept the priority sort path covered, and fixed the Tasks page quick-filter reset from Completed/Archived back to All.
- Added Workbench task ordering regression coverage for project default sorting, priority sorting, and the Tasks All quick-filter reset.
- Updated roadmap and decisions bookkeeping for 0.32.5.2 Passes 1, 2, 3, 4, 5, 6, 7, 8, 9, and 10.

## Version 0.32.5.1 - 2026-06-06 10:32 -04:00

- Bumped the app and first-party module versions to `0.32.5.1`.
- Replaced hard-coded white task control, bulk action, bulk assignee, and dialog footer backgrounds with shared theme surface tokens.
- Made the Tasks page filter controls static instead of sticky so the filter area no longer floats over smaller laptop viewports.
- Added a Workbench task `Complete` action that uses the existing Tasks module completion API and preserves timer, permission, recurrence, audit, and notification behavior.
- Updated task notification summaries and framework notification decoration so task notifications display the task title, with client/project hover context in Business workspaces and project-only context in Personal/Family workspaces.
- Updated roadmap/archive and decisions bookkeeping for 0.32.5.1.
- Rewrote the upcoming 0.32.5.2 framework/backend tidying roadmap into ordered implementation passes with implementation checklists and clarification questions.

## Version 0.32.5 - 2026-06-06 09:28 -04:00

- Bumped the app and first-party module versions to `0.32.5`.
- Added a disableable first-party `tags` module that contributes tag routes, tag management navigation, `tags.html`, browser assets, tag permissions, and tag audit record types through the module manifest.
- Removed tag-specific hard-coding from framework app-shell navigation, framework protected view registration, framework route mounting, and framework audit record type registration.
- Added generic tag service helpers for decorating and filtering taggable records by module-declared target type metadata.
- Added shared browser tag UI helpers for loading tags, rendering tag chips, and mounting a reusable checkbox picker.
- Added tag assignment saves, tag response decoration, and tag filtering for Tasks and Time Entries, plus tag response decoration, filtering, and assignment saves for Clients and Projects.
- Added visible tag chips on task rows, time-entry edit rows, client rows, and project rows, with shared tag pickers on task, time tracker finalization, manual-entry, edit-entry, client, and project forms.
- Added direct time-entry tag filtering to Reporting without making Reporting own tag storage or picker behavior.
- Added 0.32.5 core-record tagging regression coverage and wired it into `npm run check`.
- Updated roadmap/archive, decisions, and module contract/architecture documentation for the disableable tagging module standard.

## Version 0.32.4 - 2026-06-06 08:31 -04:00

- Bumped the app and first-party module versions to `0.32.4`.
- Added a framework tag repository and service for tag create/update/archive/restore, listing/search, assignment reads, assign/remove, and replacement saves.
- Added `/api/tags` and `/api/tags/assignments` browser routes with workspace, target, permission, module-state, and active-tag validation.
- Extended taggable manifest metadata with `tableName` for runtime target lookup and corrected Clients/Projects taggable ID fields to match their database tables.
- Added framework audit record types and audit logging for tag definition changes, assignment add/remove events, and bulk assignment replacements.
- Added a basic framework-owned `tags.html` management page under Workspace settings for listing, creating, editing, archiving, and restoring tags.
- Added tag service regression coverage and wired it into `npm run check`.
- Updated module contract, architecture notes, permissions notes, decisions, and roadmap/archive bookkeeping for 0.32.4.

## Version 0.32.3.3 - 2026-06-06 08:09 -04:00

- Bumped the app and first-party module versions to `0.32.3.3`.
- Hardened Dashboard and Workbench manifest contribution contracts with renderer IDs, module IDs, permission/capability/module requirements, sort order, and source/action metadata.
- Made Dashboard panels come from permission-filtered module contributions and dispatch browser renderers by registered renderer ID.
- Made Workbench cards render only when registered card contributions are active, while keeping task and timer behavior intact.
- Added registered Dashboard/Workbench metadata for Clients & Projects, Tasks, and Time Tracking first-party contributions.
- Added Dashboard/Workbench regression coverage and wired it into `npm run check`.
- Updated module contract, architecture notes, decisions, and roadmap/archive bookkeeping for 0.32.3.3.

## Version 0.32.3.2 - 2026-06-06 07:55 -04:00

- Bumped the app and first-party module versions to `0.32.3.2`.
- Added shared browser settings normalizers and status helpers for registry-driven settings pages.
- Removed first-party setting ID special cases from the shared settings renderer and added support for richer setting metadata including numeric bounds, required fields, input modes, and read-only reasons.
- Updated Workspace Settings, module settings, and Create Workspace flows to submit module state through `moduleSettings` without carrying top-level legacy module flags in browser save payloads.
- Made module settings navigation derive from registered module settings views instead of app-shell hard-coded Tasks and Time Tracking links.
- Reduced the static browser navigation fallback to framework-owned links while keeping bootstrap navigation authoritative for module-owned links.
- Added UI contract regression coverage and wired it into `npm run check`.
- Updated module contract, architecture, UI guide, settings matrix, decisions, and roadmap/archive bookkeeping for 0.32.3.2.

## Version 0.32.3.1 - 2026-06-05 23:32 -04:00

- Bumped the app and first-party module versions to `0.32.3.1`.
- Added `docs/ui-layout-guide.md` and `docs/settings-control-matrix.md` for UI/settings cleanup rules.
- Added shared browser settings controls in `public/js/shared/settings-controls.js`.
- Refactored Workspace Settings and module settings pages to use the shared module settings renderer.
- Updated Create Workspace to render registry-driven module status controls instead of a hard-coded Time Tracking checkbox.
- Updated workspace creation to accept `moduleSettings` and apply submitted module status controls through `modulesService.setModuleStatus`, while keeping deprecated `timeTrackingEnabled` compatibility when `moduleSettings` is absent.
- Added regression coverage for Create Workspace module combinations, locked required module controls, matching module availability rules, and nav filtering after creating workspaces with disabled modules.
- Updated TODO, roadmap/archive, decisions, and changelog bookkeeping for 0.32.3.1.

## Version 0.32.3 - 2026-06-05 22:46 -04:00

- Bumped the app and first-party module versions to `0.32.3`.
- Added the framework-owned `tags` and `tag_assignments` tables with workspace-scoped tag definitions, assignment rows, source tracking, status checks, and lookup/duplicate-prevention indexes.
- Seeded core tag permissions and default role mappings for workspace administrators and scoped roles.
- Promoted module `taggableTypes` declarations into an active validated manifest contract.
- Registered initial taggable target types for tasks, time entries, clients, projects, and the developer example module.
- Updated fresh database and module sanity regressions to cover the tags schema and manifest contract.
- Updated roadmap/archive bookkeeping, decisions, module contract documentation, and the permissions matrix for 0.32.3.

## Version 0.32.2 - 2026-06-05 22:30 -04:00

- Bumped the app and first-party module versions to `0.32.2`.
- Added notification user preference and workspace default tables with saved enabled state and workspace priority overrides.
- Added notification preference APIs and wired event delivery to honor workspace defaults plus user mutes.
- Added a framework-owned app-shell notification bell/dropdown with unread counts, recent notifications, read/dismiss actions, and a link to the full notification page.
- Added `notifications.html` with notification listing, unread/read/dismissed filters, source filtering, pagination, empty states, read/dismiss actions, and preference/default controls.
- Added initial notification events for `task.assigned`, `task.due_soon`, `task.overdue`, `timer.still_running`, and `module.disabled`; task assignment changes now emit `task.assigned`.
- Expanded notification regression coverage for app-shell counts, protected page access, preferences, workspace defaults, muted delivery, and target-link visibility.
- Updated notification documentation, the permissions matrix, decisions, and roadmap/archive bookkeeping for 0.32.2.

## Version 0.32.1 - 2026-06-05 17:32 -04:00

- Bumped the app and first-party module versions to `0.32.1`.
- Added a framework notification repository and service for creating notifications, creating multi-recipient notifications, listing current-user notifications, unread counts, read/read-all, dismiss, cleanup archiving, and target metadata decoration.
- Added browser notification routes for `GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/:notificationId/read`, `POST /api/notifications/read-all`, and `POST /api/notifications/:notificationId/dismiss`.
- Wired module-declared notification events into the internal event bus using safe notification summaries/templates, with disabled-module blocking.
- Added task lifecycle notification declarations for existing task events so assignees can receive framework notifications when task events are emitted.
- Added notification regression coverage for recipient scoping, unread/read/dismiss flows, target-link access checks, event-driven creation, and disabled-module blocking.
- Updated notification documentation, the permissions matrix, decisions, and roadmap/archive bookkeeping for 0.32.1.

## Version 0.32.0 - 2026-06-05 17:14 -04:00

- Bumped the app and first-party module versions to `0.32.0`.
- Added the framework-owned `notifications` table with workspace, recipient, module, event, record, status, priority, timestamps, URL, and metadata fields.
- Added notification indexes for recipient/status/date reads, module filtering, record lookups, event filtering, and retention cleanup.
- Added framework-owned notification permissions and default role mappings for own-notification reads, personal preferences, and workspace defaults.
- Promoted notification manifest events/templates into a validated contract and documented the 0.32.0 notification foundation.
- Marked the 0.32.0 roadmap section complete and archived the completed 0.31.25 roadmap section.

## Version 0.31.25 - 2026-06-05 14:22 -04:00

- Bumped the app and first-party module versions to `0.31.25`.
- Added manifest `terminology` support for display-only workspace-type labels.
- Added a terminology resolver with Business, Personal, Family, and default fallback behavior, including Family-to-Personal fallback.
- Applied resolved terminology to obvious app-shell, module registry, navigation, dashboard, Workbench, module settings, and API scope display surfaces.
- Added first-party terminology metadata, including Business `Clients & Projects` and Personal/Family `Projects` labels for the stable `client-projects` module.
- Added resolver coverage to the module sanity check and documented the display-only terminology contract.
- Grouped Projects page task-owned project defaults inside a Task module box, nested the project task sort controls under `Sort order`, and matched the Project Defaults summary weight to Project Rounding.
- Moved Projects page Save Project and Archive actions into the existing Project Settings modal footer next to Close.

## Version 0.31.24.2 - 2026-06-05 12:15 -04:00

- Bumped the app and first-party module versions to `0.31.24.2`.
- Replaced per-query sqlite process spawning with a queued persistent sqlite adapter while preserving the existing database helper API.
- Added an explicit sqlite close hook for regression scripts and temporary database cleanup.
- Added request-scoped permission caching for current user and role assignment reads.
- Added performance sort indexes for tasks, task assignees, time entries, clients, projects, and user role assignments.
- Added `scripts/performance-regression.mjs` and wired it into `npm run check`.
- Reduced fresh-database performance regression timings to single-digit milliseconds for core service reads.
- Refreshed documentation after the 0.31.x module-readiness and performance passes, including README current-state notes, database docs, architecture notes, permissions matrix, storage verification notes, licensing notes, product notes, and TODO scratchpad cleanup.

## Version 0.31.24.1 - 2026-06-05 10:54 -04:00

- Bumped the app and first-party module versions to `0.31.24.1`.
- Removed client/scope UI from Personal and Family project/task flows while keeping projects workspace scoped.
- Changed workspace project labels to the workspace name only and kept workspace scope options first in client/scope selectors.
- Made Personal and Family workspace settings hide default billing rate and fiscal year controls, relabel the period control as Time Reporting Period, and save default billing rate as nullable.
- Added project-owned task defaults for status, priority, and sort order, with new tasks defaulting assignees to the creator.
- Made task recurrence collapsible, truncated task Scope and Assignees cells with hover titles, and widened sticky modal footers to the modal bottom edge.
- Fixed parent-client reporting so descendant client projects appear in parent scope rollups and project summaries.

## Version 0.31.24 - 2026-06-05 07:13 -04:00

- Adopted WCAG 2.2 AA as the Longtail Forge browser UI accessibility target.
- Added `docs/accessibility.md` with the accessibility workflow, manual release checklist, and shared UI pattern guidance.
- Added `scripts/accessibility-regression.mjs` and wired it into `npm run check`.
- Added shared visible focus styling and reduced-motion handling in `public/css/longtail-forge.css`.
- Added `aria-describedby` wiring to shared modal dialogs.
- Added accessible labels for one-time generated secret fields in API Keys and User Admin.
- Completed the reordered 0.31 cleanup pass without changing package metadata beyond `0.31.24`.
- Updated Tasks overdue logic so due times are respected before midnight in task filters and dashboard summaries.
- Reworked Tasks bulk changes to remove the Bulk Action dropdown and apply selected status, priority, and assignee replacements in combination.
- Added a Duplicate task action, collapsible task reminders, sticky modal action footers, and bottom-aligned task row actions with truncated hoverable Scope values.
- Restored Business workspace task scope options for both `All Projects` and workspace-specific Projects while hiding client/scope controls outside Business workspaces.
- Followed up on 0.31.24 cleanup by moving task action buttons into a full-width single-line row, making the bulk assignee selector clearer, and surfacing bulk errors more explicitly.
- Replaced the Tasks bulk assignee multi-select with explicit checkboxes and cache-busted the Tasks CSS/JS so browser refreshes pick up the fixed bulk UI.
- Set the floating Tasks filter panel, bulk panel, and sticky modal footers to solid white backgrounds.
- Cleaned up the Tasks bulk assignee picker into checkbox and assignee-name columns with truncated hover-reveal labels.
- Hid Add Client project-dialog shortcuts in Personal and Family workspaces and cache-busted the Projects page script.
- Bumped the app and first-party module versions to `0.31.24`.

## Version 0.31.22 - 2026-06-05 03:24 -04:00

- Added a fresh-start database baseline at `src/db/schema/current.sql` for new installs.
- Simplified the migration runner so fresh databases record one `0.31.22` baseline row instead of replaying migrations `001` through `031`.
- Preserved existing upgraded databases by recording the baseline marker without requiring historical migration checksum validation.
- Kept checksum validation for future post-baseline migrations.
- Added a fresh database regression to `npm run check`.
- Documented the active database baseline and future migration convention in `docs/database.md`.
- Bumped the app and first-party module versions to `0.31.22`.

## Version 0.31.21 - 2026-06-05 02:51 -04:00

- Added a cleanup migration that copies any remaining legacy active timer rows into `active_work_timers`, enforces one running timer per user, and drops obsolete `active_timers` and `active_task_timers` tables.
- Removed the old `organization-settings.html` and `clients-projects.html` compatibility pages from active protected view serving.
- Removed legacy route, service, repository, and `src/app.js` re-export shims and pointed active imports at canonical core/module paths.
- Removed top-level module-setting save aliases from `/api/settings`; module settings now save through `moduleSettings`.
- Removed browser-side legacy module setting input wiring from Workspace Settings.
- Updated active module/docs language for workspace-native settings and unified timer storage.
- Added a legacy cleanup regression to `npm run check`.
- Bumped the app and first-party module versions to `0.31.21`.

## Version 0.31.20 - 2026-06-05 02:15 -04:00

- Added a shared `/api/active-timers/all` route for manual and sourced active/paused timer listing.
- Added explicit active timer start and pause lifecycle routes alongside existing finalize and remove behavior.
- Added a dedicated `/api/tasks/workbench-items` source route with normalized task Workbench records and timer summaries.
- Updated timer source manifest metadata with remove routes and pointed Tasks work item metadata at its dedicated list route.
- Added nested timer source metadata to Workbench timer and task payloads while preserving flat compatibility fields.
- Documented timer-capable records, Workbench item sources, source metadata flow, task timers, and future Support Ticket timer values.
- Extended the module sanity check to validate timer source lifecycle routes and dedicated work-item source routes.
- Bumped the app and first-party module versions to `0.31.20`.

## Version 0.31.19 - 2026-06-05 02:00 -04:00

- Added a disabled-by-default `developer-example` first-party module that demonstrates manifest routes, view registration, browser assets, settings, permissions, API scopes, events, notification declarations, tag/search declarations, and event hooks.
- Added a small protected Developer Example page plus sample browser and public API routes for module contract validation.
- Added `docs/module-development.md` with practical module development guidance and linked it from `docs/module-contract.md`.
- Added a module sanity check script that validates registered modules, duplicate routes/IDs/scopes, notification templates, and dependency references.
- Added the module sanity check to `npm run check`.
- Bumped the app and first-party module versions to `0.31.19`.

## Version 0.31.18 - 2026-06-05 01:45 -04:00

- Activated module-declared `auditRecordTypes` metadata and registry/service helpers for audit record type discovery.
- Updated the audit service to accept framework-owned plus module-declared record types and reject unknown record types unless explicitly allowed.
- Kept audit change types framework-owned common values and added discovery for those values.
- Added activity-safe and notification-safe event summary helpers that return human-readable text, recipient hints, and safe relative URLs without exposing raw event JSON.
- Added first-party audit record type declarations and Tasks event summary descriptors.
- Documented audit, activity feed, notification summary, and Workbench terminology boundaries in `docs/module-contract.md`.
- Added audit extensibility regression coverage to `npm run check`.
- Bumped the app and first-party module versions to `0.31.18`.

## Version 0.31.17 - 2026-06-05 01:32 -04:00

- Added a lightweight server-side internal event bus with async dispatch, normalized event payloads, and hook failure reporting that does not interrupt core saves.
- Added manifest validation and registry/service helpers for active `eventTypes` metadata and `hooks.events` module subscriptions.
- Emitted `module.enabled` and `module.disabled` internal events from centralized module lifecycle changes.
- Emitted Tasks events for create, update/reopen, complete, archive, restore, and recurring instance creation.
- Documented event naming, payload, hook, and future consumer conventions in `docs/module-contract.md`.
- Added an event bus regression script to `npm run check`.
- Bumped the app and first-party module versions to `0.31.17`.

## Version 0.31.16 - 2026-06-05 01:12 -04:00

- Added manifest validation and registry normalization for module permission descriptors, role default mappings, resource definitions, and API scope descriptors.
- Added startup sync that inserts or updates module-declared permissions and adds missing default role permission rows without deleting existing grants.
- Added first-party permission/resource/API scope metadata for Clients/Projects, Tasks, Time Tracking, and Users.
- Updated API key scope discovery to read enabled-module scopes from the registry, hiding disabled optional module scopes from new API keys.
- Updated the API Keys browser UI to render scope labels/descriptions from registry metadata while keeping legacy string scopes compatible.
- Documented module permission, resource, API scope, and notification access expectations in `docs/module-contract.md`.
- Bumped the app and first-party module versions to `0.31.16`.

## Version 0.31.15 - 2026-06-05 00:52 -04:00

- Added module manifest support and validation for protected views, public view placeholders, and browser asset descriptors.
- Added module registry/service helpers for protected/public view and browser asset contributions.
- Registered first-party Tasks, Time Tracking, Clients/Projects, and User Admin protected views and module-specific browser assets.
- Updated protected HTML serving so module pages must be registered and pass module status, workspace capability, and permission checks before being served.
- Kept Dashboard, Workbench, Workspace Settings, User Settings, API Keys, Audit Log, Reporting, and legacy Organization Settings framework-owned.
- Documented module page and asset registration behavior in `docs/module-contract.md`, updated decisions, and bumped first-party module metadata to `0.31.15`.
- Bumped the app version to `0.31.15`.

## Version 0.31.14 - 2026-06-05 00:31 -04:00

- Added server-owned `moduleSettings` metadata to `/api/settings` so module settings pages can render registry-defined fields and current values.
- Added server-side module settings validation for unknown modules/settings, read-only fields, value types, select options, and missing writable handlers.
- Updated Workspace Settings, Tasks Settings, and Time Tracking Settings to render module controls from registry data instead of hard-coded first-party toggles.
- Kept workspace identity, billing, audit, reminder defaults, and user preferences separate from module-owned settings.
- Documented the registry-driven module settings contract in `docs/module-contract.md` and recorded the 0.31.14 decisions.
- Bumped the app version to `0.31.14`.

## Version 0.31.13 - 2026-06-04 23:52 -04:00

- Added authenticated `/api/app-shell/bootstrap` with app metadata, active workspace context, workspace switcher data, enabled modules, registry-driven navigation, notification placeholders, user theme/timezone basics, and permission hints.
- Added backend app-shell navigation assembly that combines framework links with enabled module navigation from the registry.
- Updated the browser app shell to render server-provided navigation while retaining the static navigation tree as a loading/fallback path.
- Preserved Dashboard, Workbench, Projects, Reporting, Settings, workspace switching, logout, and user settings behavior during the registry-driven navigation refactor.
- Documented the app-shell bootstrap navigation contract in `docs/module-contract.md`.
- Bumped the app version to `0.31.13`.

## Version 0.31.12 - 2026-06-04 17:12 -04:00

- Centralized module enable/disable state changes in `modulesService.setModuleStatus` with non-disableable module safety, dependency checks, lifecycle hook calls, and no-op handling for unchanged states.
- Added framework-level browser module write guards during route mounting and public API module write enforcement through API-key scope handling.
- Added module lifecycle hook support for enable, disable, install, update, and repair hook names in the manifest contract.
- Added forced audit records for `module.enabled`, `module.disabled`, `module.enable_failed`, and `module.disable_failed` events.
- Surfaced `canDisable` in workspace module metadata and documented lifecycle/disable behavior in `docs/module-contract.md`.
- Marked Clients/Projects and Users as non-disableable core modules while keeping Tasks and Time Tracking optional workflow modules.
- Updated first-party module metadata to version `0.31.12`.
- Bumped the app version to `0.31.12`.

## Version 0.31.11 - 2026-06-04 16:46 -04:00

- Refactored module registry behavior behind `modulesService` with module lookup, route lists, workspace-enabled module reads, contribution collection, permission lists, API scope lists, and reserved tag/search/notification list helpers.
- Added Workbench registry helpers for enabled Workbench cards, timer sources, work item sources, and source lookups, with module, capability, dependency, and permission filtering.
- Added dependency validation before enabling workspace modules so missing framework or module dependencies return clear errors.
- Updated Workbench bootstrap to include registry-collected Workbench cards, timer sources, and work item sources while preserving current normalized timer/task payloads.
- Updated Tasks and Time Tracking Workbench capability hints so registry filtering exposes their cards across supported workspace types.
- Documented the static registry versus framework-facing registry service split in `docs/module-contract.md`.
- Bumped the app version to `0.31.11`.

## Version 0.31.10 - 2026-06-04 16:26 -04:00

- Added startup module manifest validation for unique IDs, required fields, route arrays, navigation, dashboard, Workbench, timer source, work item source, settings, permissions, API scopes, reserved fields, dependencies, and unknown manifest fields.
- Formalized active and reserved module manifest fields in `docs/module-contract.md`, including Workbench cards, timer sources, work item sources, disable policy, notification ownership, and an example manifest.
- Updated first-party module manifests to the 0.31.10 contract with explicit `canDisable`, API scope, Workbench, timer source, and work item source declarations.
- Kept third-party plugin loading deferred while first-party modules follow the future manifest rules.
- Bumped the app version to `0.31.10`.

## Version 0.31.9.1 - 2026-06-04 15:13 -04:00

- Renamed Time Tracker stopwatch `Reset` actions to red `Discard` actions while keeping the 4-stopwatch limit.
- Renamed Workbench timer save actions to `Save & End`.
- Made Workbench manual timer billable state always re-inherit from the selected client/project and momentarily flash when changed.
- Made Workbench flash the newly activated timer after timer switching reorders the active timer to the top.
- Fixed repeated Workbench billable inheritance changes so the visible flash retriggers every time the inherited value changes.
- Renamed the Time Tracker stopwatch `Stop` action to `Save & End` to match Workbench wording.
- Compacted Time Tracker manual timer slots after save/discard so later timers move up instead of reopening with unused middle cards.
- Added a Workbench Tasks `Add Task` action that opens the existing Tasks page Add Task modal through `tasks.html?new=1`.
- Lifted Workbench manual timer slot limits while preserving the one-running-timer concurrency rule.
- Completed the documentation checkpoint before 0.31.10 by refreshing README current-state notes, the Table of Contents, changelog link, and documentation links.
- Bumped the app version to `0.31.9.1`.

## Version 0.31.9 - 2026-06-04 14:46 -04:00

- Added the authenticated Workbench page after Dashboard and before Projects in the primary navigation.
- Added `/api/workbench/bootstrap` to return normalized active timers, task workbench items, module state, and source metadata for the Workbench MVP.
- Added Workbench timer cards for manual and sourced timers, including source badges, quick start/pause switching, save/discard actions, and disabled-source recovery display.
- Added a Workbench task card with fast filters, sorting, task timer start/pause/finalize actions, and links into the full task detail/edit modal.
- Added a collapsible Quick Notes placeholder and persisted Workbench card collapsed/expanded state in the browser.
- Bumped the app version to `0.31.9`.

## Version 0.31.8 - 2026-06-04 14:11 -04:00

- Added unified `active_work_timers` storage for manual and sourced timers, including task source metadata.
- Migrated existing manual and task active timer rows into the unified table while leaving legacy active timer tables in place.
- Refactored task timer start, pause, reset, and finalize flows through the shared Time Tracking active timer service.
- Kept one running timer per user/workspace across manual and task timer sources, with regression coverage for switching directions.
- Labeled reserved Timer Concurrency settings as future/non-functional while 0.31.8 keeps single-running-timer behavior.
- Bumped the app version to `0.31.8`.

## Version 0.31.7 - 2026-06-04 11:03 -04:00

- Added dedicated Tasks and Time Tracking settings pages, including Tasks reminder defaults and placeholder Timer Concurrency checkboxes.
- Moved Projects Settings back under the Projects menu and renamed the menu entry to `Projects Settings`.
- Made Projects Settings bulk changes collapsible and made Tasks sorting/filtering plus bulk actions collapsible while keeping quick filters visible.
- Added persisted task billable flags inherited from project/client scope and used them for task timers and finalized task time entries.
- Fixed Time Tracker reset so confirmed resets discard timer state, and the clear-info preference clears client, project, description, and billable fields.
- Refined 0.31.7 settings navigation so Clients sits under Workspace and module settings sit under Workspace -> Modules.
- Added an explicit All quick filter to Projects -> Tasks and made opening Sorting and Filters select it automatically.
- Tightened Projects Settings spacing, made Bulk Changes open automatically when projects are selected, and repaired the Server Maintenance task/time-entry billable data.
- Captured 0.31.x roadmap clarifications for unified timer storage, Workbench page MVP wiring, reserved manifest fields, documentation checkpoint naming, and disabled-source timer recovery.
- Bumped the app version to `0.31.7`.

## Version 0.31.6 - 2026-06-03 18:31 -04:00

- Added public `/api/v1/tasks` read, create, update, complete, reopen, archive, and restore endpoints with `tasks:read` and `tasks:write` API key scopes.
- Added task-linked reporting filters so finalized task timer time entries can be isolated by `task_id`.
- Updated public API, module contract, and permissions matrix documentation for the completed 0.31 Tasks branch.
- Extended permission regression coverage for task API scopes, disabled Tasks public API behavior, task endpoint metadata, and task-linked reporting.
- Ran the final 0.31 review pass across task permissions, module boundaries, timezone handling, recurrence, and timer linkage.
- Bumped the app version to `0.31.6`.

## Version 0.31.5 - 2026-06-03 17:17 -04:00

- Added `active_task_timers` persistence with one task timer per user per task and server-side project/client context capture.
- Added Task Timers as a separate Tasks module sub-option in Workspace Settings, gated by both Tasks and Time Tracking availability.
- Added task timer start, pause, reset, and finalize endpoints plus task detail modal stopwatch controls for eligible project-linked tasks.
- Made task timers and normal Time Tracking timers mutually exclusive by pausing the other timer type when one starts running.
- Saved finalized task timer time into `time_entries` with the task title as the description and `task_id` preserved for future reporting.
- Blocked task completion while any active task timer record remains for that task.
- Extended permission regression coverage for task timer gating, mutual exclusion, completion blocking, and finalized task time-entry links.
- Bumped the app version to `0.31.5`.

## Version 0.31.4 - 2026-06-03 16:51 -04:00

- Added a scoped task calendar window helper and browser API payload for due-date-backed calendar integrations.
- Expanded Dashboard task output into overdue, due-soon, and assigned-to-me sections with direct links into task detail.
- Added renderer/link metadata to the Tasks dashboard module contract so future dashboard sections can consume task summaries without page-specific coupling.
- Kept the full calendar UI deferred to 0.34.0 while exposing the task payload needed by that future surface.
- Extended permission regression coverage for task calendar scope filtering and Dashboard task links.
- Bumped the app version to `0.31.4`.

## Version 0.31.3 - 2026-06-03 16:36 -04:00

- Added task recurrence templates with workspace/client/project scope, assignment defaults, due pattern metadata, RRULE storage, optional end dates, and active/paused status.
- Linked recurring task instances back to their template and added completion behavior that creates the next instance while preventing duplicate retry creation.
- Added recurrence audit events for template create/update and generated task instances.
- Added recurring task controls to the task modal, including a separate recurrence settings dialog and current-instance versus all-future edit prompts.
- Extended permission regression coverage for scoped recurring task creation, completion, and duplicate protection.
- Bumped the app version to `0.31.3`.

## Version 0.31.2 - 2026-06-03 16:02 -04:00

- Added normalized task reminder offset storage with workspace, client, project, and task scopes.
- Added reminder inheritance for Business workspaces through Workspace -> Client -> Project -> Task and Personal/Family workspaces through Workspace -> Project -> Task.
- Added Workspace Settings reminder defaults, client/project reminder default controls, and task-level reminder override controls.
- Added computed pending reminder occurrence helpers for future notification delivery without requiring every-minute scheduler behavior in 0.31.2.
- Updated due-date handling so date-only tasks remain date-only, timed task display uses the session timezone, and date-only overdue logic waits until the local day has passed.
- Bumped the app version to `0.31.2`.

## Version 0.31.1 - 2026-06-03 15:25 -04:00

- Added saved Tasks sort preferences, quick filters for common task views, and active-default list behavior that keeps completed and archived tasks readable but out of the default view.
- Added task bulk actions for status, priority, assignee add/remove, and archive using server-side task permissions for each selected task.
- Added copyable task detail links, stronger Tasks page smoke helpers, completed/archived row styling, and dashboard task counts for overdue, due-soon, and assigned-to-me work.
- Added readable task audit summaries in Audit Log detail views while keeping raw task JSON available on demand.
- Bumped the app version to `0.31.1`.

## Version 0.31.0 - 2026-06-03 13:56 -04:00

- Added the first-party Tasks module with module metadata, navigation, Workspace Settings enablement, protected Tasks page, and browser `/api/tasks` routes.
- Added task persistence with workspace/client/project scope links, multiple concrete user assignees, fixed priority/status values, due date/time handling, archive/restore, and future source-link fields.
- Added task permissions, role mappings, assignment eligibility checks, module-disabled write protection, and audit events for task lifecycle changes.
- Updated the permissions matrix and permission regression harness for task visibility, creation, assignment, completion, archive/restore, module toggles, and Personal/Family client-scope denial.
- Fixed the Tasks Add/Edit modal so workspace-project task scopes use the active workspace name and assignee labels show display name plus email address.
- Replaced generic workspace-project labels across the app with active workspace labels such as `Raymond Tec Projects`.
- Bumped the app version to `0.31.0`.

## Version 0.30.17 - 2026-06-03 11:42 -04:00

- Enforced Business-only client access in browser and public APIs while keeping workspace projects available for Personal and Family workspaces.
- Made scoped role assignment work for Client Administrators and Project Administrators inside their assigned scope.
- Kept user lifecycle management workspace-level only and repaired the seeded permission contracts accordingly.
- Fixed scoped admin time-entry list visibility for team entries inside assigned scopes.
- Added explicit `reporting.view` enforcement for reporting and dashboard reads.
- Replaced the permissions matrix with a workspace-native 0.30.17 matrix and expanded permission regression coverage to 108 checks.
- Bumped the app version to `0.30.17`.

## Version 0.30.16.1 - 2026-06-03 07:48 -04:00

- Added the workspace-native storage migration that promotes `workspaces`, `workspace_settings`, `workspace_modules`, and `workspace_id` keyed app tables to the active schema.
- Migrated runtime sessions, settings, permissions, audit logs, API keys, clients/projects, time entries, active timers, public API context, and browser payloads to workspace-first contracts.
- Replaced workspace compatibility role and permission identifiers with `workspace_admin`, `workspace` scope, and `workspace_settings.manage`.
- Replaced the storage alias regression with a workspace-native storage regression and updated the permission regression harness.
- Renamed the Workspace Settings browser controller to `workspace-settings.js` and removed browser-side organization aliases.
- Fixed Time Tracker and Manual Entry selectors so inactive clients and inactive projects are not offered for new time work.
- Bumped the app version to `0.30.16.1`.

## Version 0.30.16 - 2026-06-02 23:54 -04:00

- Moved Projects settings navigation back under Settings, added the top-right Add Project action, and labeled the Projects settings filters and bulk-change controls.
- Updated the User Admin edit modal so Configure Permissions sits above Add Role, Add Role is centered, and current roles live in a Current Assignments box.
- Closed previously opened navigation menus when a new peer menu opens and refreshed theme mode from session data after login/session bootstrap.
- Added audit-log client/project filters, clickable client/project/record-type cells, truncation titles, and IP address storage/export/detail support.
- Added session IP capture so login, logout, and later audit entries can include the user IP address.
- Updated confirmed project moves to rewrite associated time-entry client/project labels and reject unconfirmed downstream updates.
- Kept inactive/archived clients out of project reassignment controls while retaining server-side rejection for archived parent assignments.
- Fixed workspace creation so it no longer inserts duplicate owner rows into `users`, added startup repair for existing duplicate `user_id` rows, and made user/session settings read the canonical user through workspace memberships.
- Fixed Projects Settings navigation visibility for Personal and Family workspaces by treating project tools separately from business client tools.
- Added an Audit Log "All workspaces" filter and made login/logout entries visible through every active workspace membership for the actor.
- Bumped the app version to `0.30.16`.

## Version 0.30.15 - 2026-06-02 23:27 -04:00

- Added nullable `parent_client_id` and `parent_project_id` hierarchy fields with workspace/parent indexes.
- Added server-side validation for client/project self-parenting, descendant cycles, workspace scope, and project parent/client compatibility.
- Added parent selectors and indented tree labels for client and project editors, filters, and reporting project options.
- Updated reporting summaries to include descendant clients/projects by default, with a direct-only toggle.
- Added audit metadata for parent moves and expanded permission regression coverage for nesting rules.
- Fixed Clients Settings rendering by loading the shared page controller script and corrected parent selector wiring for client saves.
- Fixed Add Project parent-project options so the list populates for the default selected client/workspace scope when the modal opens.
- Fixed new-project parent option filtering so root projects are not mistaken for descendants of an unsaved project.
- Prevented inactive/archived clients and projects from appearing as parent options, and added server-side rejection for archived parent assignments.
- Bumped the app version to `0.30.15`.

## Version 0.30.14 - 2026-06-02 17:38 -04:00

- Documented the storage rename compatibility plan, including the remaining `organization_id` inventory, final migration order, alias retention rules, and legacy removal gate.
- Added `scripts/storage-alias-regression.mjs` and wired it into `npm run check` so legacy organization fields and workspace aliases stay synchronized during the compatibility phase.
- Updated workspace settings saves to write both `organizations`/`organization_settings` and `workspaces`/`workspace_settings`.
- Updated public API compatibility notes and release metadata for 0.30.14.

## Version 0.30.13 - 2026-06-02 17:11 -04:00

- Added app-level workspace creation settings tables for install-wide defaults and per-user workspace creation overrides.
- Added workspace owner transfer rules that pick the oldest active Workspace Administrator membership and block owner removal when no replacement administrator exists.
- Added Personal workspace fallback creation when membership changes leave a user with no active workspace.
- Updated user and session active-workspace repair so affected users do not point at a removed workspace membership.
- Extended the permission regression harness to cover owner transfer, owner-removal blocking, and no-workspace Personal fallback behavior.
- Bumped the app version to `0.30.13`.

## Version 0.30.12 - 2026-06-02 15:58 -04:00

- Added authenticated Reporting and Dashboard API routes backed by `reportingService`.
- Moved project/time/billing aggregation out of the Reporting and Dashboard browser controllers.
- Made Reporting workspace-type aware so personal and family workspaces default to workspace projects and hide business client scope filters.
- Converted Dashboard into a module-aware project/workspace hub while preserving Time Tracking current-month billable and chart widgets.
- Added reporting/dashboard extension metadata so future modules can contribute panels without raw page-script coupling.
- Fixed authenticated navigation so the lighter session workspace bootstrap cannot hide Time Tracking links after `/api/settings` exposes module navigation metadata.
- Added startup repair for literal `[REDACTED]` seed usernames, replacing the placeholder with the configured super admin username without editing checksum-tracked migration history.
- Bumped the app version to `0.30.12`.

## Version 0.30.11 - 2026-06-02 15:13 -04:00

- Added `public/js/shared/page-controller.js` with shared option, status, sorting, controller registration, and smoke-test helpers under `window.LongtailForge.pageController`.
- Registered Clients/Projects, Time Tracker, User Admin, and Edit Entries page controllers under `window.LongtailForge.controllers`.
- Added browser-console smoke and snapshot helpers for the four large frontend controllers.
- Updated the relevant protected pages to load the shared page-controller helper directly without adding a frontend build step.
- Bumped the app version to `0.30.11`.

## Version 0.30.10 - 2026-06-02 15:03 -04:00

- Formalized Projects as framework core and Clients as optional business context in roadmap and decisions.
- Added shared record-scope helpers for workspace/client/project validation and archived-state checks.
- Added a project update planner that centralizes move planning and downstream record behavior.
- Blocked archived clients from receiving new projects or project moves and blocked archived projects from receiving time entries or active timers while preserving read access.
- Added workspace owner lifecycle protection so owners cannot be deactivated or deleted before ownership transfer exists.
- Updated Reporting language to separate workspace project reporting scopes from client-linked project scopes.
- Extended the permission regression harness to cover archived downstream behavior and workspace owner lifecycle protection.
- Bumped the app version to `0.30.10`.

## Version 0.30.9 - 2026-06-02 14:14 -04:00

- Moved Time Tracking public API routes and service logic for `/api/v1/time-entries` into the Time Tracking module.
- Added module public API route mounting so module-owned public API paths load before browser session authentication.
- Documented Time Tracking module ownership and framework dependencies in `docs/time-tracking-module.md`.
- Updated navigation, Dashboard, and Workspace Settings to consume module metadata for Time Tracking links, dashboard panels, and module settings.
- Updated public API docs to list endpoints by module.
- Extended module-level smoke coverage for Time Tracking metadata, disabled historical reads, and disabled browser/public API write blocking.
- Bumped the app version to `0.30.9`.

## Version 0.30.8 - 2026-06-02 13:57 -04:00

- Added `docs/module-contract.md` to define the module metadata, route, asset, migration, hook, navigation, dashboard, permission, and workspace capability contract.
- Expanded existing module definitions with display names, public API placeholders, historical read policy, seed/repair hooks, navigation/dashboard contributions, required permissions, and workspace capability requirements.
- Added shared module access helpers and moved Time Tracking write enforcement onto the reusable module write guard.
- Moved workspace module decoration into `modulesService` so settings/bootstrap responses use shared framework module metadata.
- Extended the permission regression harness to verify disabled Time Tracking keeps historical reads but blocks time-entry and active-timer writes.
- Bumped the app version to `0.30.8`.

## Version 0.30.7 - 2026-06-02 13:39 -04:00

- Added a lightweight permission regression harness with fixtures for workspace admin, client admin, project admin, client user, project user, and external client user roles.
- Covered unauthenticated browser/API guards, API-key failure modes, mutation permissions, active timers, user administration, role assignments, workspace settings, and ownership/scope regressions.
- Added `LONGTAIL_DATABASE_FILE` for isolated test database runs and wired `npm run test:permissions`.
- Hardened role assignment updates so client/project scope IDs must belong to the active workspace.
- Bumped the app version to `0.30.7`.

## Version 0.30.6 - 2026-06-02 12:52 -04:00

- Completed the comprehensive code review pass and captured private findings plus drag-and-drop 0.30.7+ roadmap drafts in ignored `CODEREVIEW.md`.
- Archived completed roadmap sections into ignored `ROADMAP-ARCHIVE.md`, leaving `ROADMAP.md` focused on active and future work.
- Added `CODEREVIEW.md` and `ROADMAP-ARCHIVE.md` to `.gitignore`.
- Fixed time-entry ownership hardening so browser updates and public API creates cannot spoof `user_id`.
- Fixed project update authorization so source project scope is checked before any requested target-scope move.
- Bumped the app version to `0.30.6`.

## Version 0.30.5.6

- Reworked navigation so Reporting has a Time Reports submenu, Projects owns Time Keeping and Tasks, and Settings nests workspace administration links.
- Added permanent timer status labels for Unused, Active, and Paused states.
- Added hover titles to dashboard bar chart values.
- Reworked User Settings into two columns and moved section actions inside their fieldsets.
- Enforced duplicate workspace-name rejection in User Settings and the workspace creation API.
- Advanced workspace name suggestions to the next available per-user value and kept duplicate workspace checks scoped to the signed-in user's own workspace list.
- Added scoped duplicate project-name enforcement for workspace projects and business client projects, with clearer Projects page error messages.
- Tightened User Admin workspace membership visibility and labels, including owner email display for personal/family workspaces and a scrollable three-column membership list.
- Made Edit Entries project filtering available before a business client is selected.
- Persisted each user's last active workspace and restored it on login when the membership is still active.

## Version 0.30.5.5

- Added cached workspace bootstrap context from login/session/settings so workspace-dependent navigation and controls can draw with less first-paint flicker.
- Hid business client selectors from Time Tracker, Create Manual Entry, and Edit Entries for personal/family workspaces while preserving workspace-project selection.
- Renamed the Time Tracker checkbox to `Clear Info when Stopped/Reset` and limited it to the checked timer's elapsed-time clearing behavior.
- Replaced the active-timer browser unload warning with a red centered `Active` indicator above each running timer title.
- Added an explicit `Show UTC` Audit Log switch and a Super Admin-only workspace filter that also applies to filtered exports.
- Replaced the Edit Entry form UUID heading with a friendly project/date label.
- Moved `Log Out` to the bottom of the Settings menu.

## Version 0.30.5.4

- Widened User Settings to match the broader settings pages.
- Fixed Create Workspace name suggestions so changing the workspace type updates the generated name until the user enters a custom name.
- Added a User Settings removal modal for removing non-current workspace memberships from the signed-in user's workspace list.

## Version 0.30.5.3

- Added Audit Log pagination with Previous/Next controls and visible row-count status.
- Added a page-size selector beside Export All that defaults to 50 rows and supports 25, 50, 100, 250, and 500 rows per page.
- Kept audit filter dropdowns populated from the full workspace audit history while table rows load page-by-page.

## Version 0.30.5.2

- Widened Workspace Settings to match the broader settings/editor pages.
- Reworked Workspace Settings into two columns with Modules and Audit Log on the left and Fiscal Year and Billing Settings on the right.
- Condensed personal and family workspace billing settings to rounding-only controls.
- Added a Workspace Users modal with Edit Permissions shortcuts into User Admin.
- Added Time Tracking module toggles to workspace creation and Workspace Settings.
- Threaded Time Tracking module status through `/api/settings`, navigation visibility, and time-entry/active-timer mutation guards so disabled timekeeping keeps existing entries readable but immutable.

## Version 0.30.5.1

- Reworked the Projects page top controls so client and status filters sit side-by-side above inline bulk dropdowns.
- Moved Add Project into a centered top-list button and modal instead of an inline `Add Workspace Project` panel.
- Tightened Add Project modal layout so the name/status fields sit under the heading, billing settings stay intact, and Add/Cancel actions are centered together.
- Added a business-workspace Client selector to the Add Project modal, with Status left-aligned and an Add Client shortcut that opens the Clients page add-client modal.
- Adjusted project details so Client and Status sit side-by-side with Client first.
- Added an Add Client shortcut inside project details between the Client/Status row and Project Billing Settings.
- Made client detail Edit Projects links open the Projects page with that client preselected in the client filter.
- Reworked Projects into a checkbox table with inline bulk Status/Client/Billable dropdowns and modal-based project detail editing.
- Reworked Clients into a checkbox table with inline bulk Status/Billable dropdowns and modal-based client detail editing.
- Removed the standalone project Bulk Edit trigger after moving bulk project actions back onto the main Projects page.
- Added Edit Client and Add Client shortcuts to the project detail modal, and made client-detail URLs open the matching client editor modal.
- Updated protected page titles to use the active module and workspace name format.
- Hid client controls from personal and family workspaces while keeping status filtering available.
- Enforced personal workspaces as owner-only spaces in user creation and workspace membership assignment flows, including Super Admin assignment paths.
- Added startup repair to deactivate non-owner active memberships in existing personal workspaces.
- Simplified personal and family project billing to force non-billable projects, hide billing rate/period controls, and keep project-level rounding.
- Updated project rounding inheritance so workspace projects inherit workspace rounding while client-linked projects inherit client rounding.

## Version 0.30.5

- Scoped API key reads, revocation, authentication, and public API sessions to the key's workspace while keeping legacy organization fields backward-compatible.
- Added `workspace_id` to public API response envelopes and API key admin responses.
- Added workspace context to public API time-entry audit metadata and API key create/revoke audit metadata.
- Updated public API documentation for workspace-scoped API keys, workspace response envelopes, and compatibility expectations.
- Completed the 0.30.5 workspace behavior verification pass for API key scoping, public API workspace isolation, migrated data visibility, project-first time entries, and release checks.

## Version 0.30.4

- Added User Settings workspace creation with install-mode/type-limit rules for personal, family, and business workspace options.
- Added a workspace creation API that creates compatibility `organizations` and new `workspaces` records, settings rows, owner membership, owner role assignment, and module defaults.
- Added the `workspaces` and `workspace_settings` compatibility tables with backfills from existing organization records/settings.
- Added `workspace_id` compatibility columns/backfills and lookup indexes for projects, time entries, audit logs, API keys, role assignments, and workspace modules.
- Updated the app shell workspace selector to show the active workspace and hide unavailable navigation actions based on workspace capabilities.
- Updated package metadata, roadmap, decisions, and README bookkeeping for the 0.30.4 release.

## Version 0.30.3

- Added active workspace session storage, membership-backed session responses, and a workspace switch endpoint/UI that rejects unauthorized workspace changes.
- Scoped existing workspace reads and permission checks through the active workspace while preserving compatibility `organization_id` storage names.
- Exposed workspace memberships in User Admin and kept role/permission editing focused on the selected active workspace.
- Added assignable workspace membership controls to User Admin, allowing protected Super Admins to assign users to available workspaces while workspace admins remain limited to the active workspace.
- Added initial workspace-role assignment during user creation and workspace-type role limits for family/personal workspaces.
- Made project and time-entry client links nullable with a migration that preserves existing client/project relationships.
- Converted the Projects page to a flat workspace project list with client and status filters plus optional client assignment per project.
- Added a client `workspace_id` compatibility alias/backfill and disabled client-centric UI by default for personal and family workspaces.
- Added project multi-select bulk controls for status, client assignment, and billable state.
- Added workspace-level project creation/read support and updated Manual Entry, Time Tracker, Edit Entries, Reporting, and the public API to require projects while allowing clientless time entries.
- Bumped package metadata and roadmap/decision/API docs for the 0.30.3 release.

## Version 0.30.2

- Added `workspace_type` to the existing workspace-compatible `organizations` table with `business`, `personal`, and `family` support.
- Added workspace capability metadata for business, personal, and family tool availability and permission models.
- Exposed `workspaceType` and `workspaceCapabilities` from `/api/settings`.
- Added a Workspace Type selector to Workspace Settings.
- Enforced initial user-add rules so personal workspaces cannot add users and family workspaces are limited to 20 active users.
- Bumped package metadata and roadmap/decision bookkeeping for the 0.30.2 release.

## Version 0.30.1

- Added the `user_workspaces` membership table with app-level user IDs, workspace IDs, status, and timestamps.
- Added `owner_user_id` to the existing workspace-compatible `organizations` table.
- Backfilled existing users into workspace memberships and added startup repair so seeded users receive membership and workspaces receive an owner.
- Updated user creation, deactivation, reactivation, and deletion to keep workspace membership in sync.
- Added `workspace_membership` audit records for membership add, status, and removal changes.
- Shifted username conflict checks to app-level uniqueness in preparation for users belonging to multiple workspaces.

## Version 0.30.0

- Shifted the user-facing app language from organizations to workspaces for navigation, settings, billing inheritance labels, role scopes, and permission labels.
- Added `workspace-settings.html` as the Workspace Settings page while keeping `organization-settings.html` as a compatibility redirect.
- Added a disabled single-workspace selector to the authenticated app shell as the foundation for future workspace switching.
- Added `workspaceName` settings aliases and public API `workspace_id` response aliases while preserving legacy organization fields during migration.
- Updated workspace settings audit events to use workspace-focused record types and labels.
- Updated package metadata, README, roadmap, decisions, changelog, and public API docs for the 0.30.0 foundation release.

## Version 0.28.2

- Added shared UTC/timezone helpers for server-side timestamp normalization and browser-side local time display.
- Added startup repair for legacy database timestamps that do not include an explicit timezone.
- Added session timezone storage so authenticated requests can use the user's IANA timezone without re-querying the user row.
- Updated Manual Entry and Edit Entries to collect user-local wall-clock times and save UTC ISO timestamps.
- Updated Audit Log filtering, exports, and display to use the signed-in user's timezone while keeping stored audit rows in UTC.

## Version 0.28.1

- Added `display_name`, nullable `alt_email`, and IANA `timezone` profile fields to users.
- Migrated the existing `sadmin` and `Mike` usernames to email addresses with display names and timezone defaults.
- Added email validation for usernames in user creation, user profile saves, and User Admin edits.
- Added editable profile fields below the password form on User Settings.
- Added matching profile fields to the User Admin edit modal and surfaced display names in the user table.
- Kept user settings saves partial so appearance and profile updates do not overwrite each other.

## Version 0.28.0

- Added `active_timers` database support for running and paused timer state.
- Added authenticated `/api/active-timers` endpoints for listing, saving, finalizing, and clearing active timers.
- Updated Time Tracker timers to persist on start/resume, pause, edit, reset, timer removal, and stop without writing every second.
- Restored active timers on page load for the authenticated user and organization, including running elapsed-time reconstruction.
- Made starting one timer pause other persisted running timers for the same user and organization.
- Finalized persisted timers by creating a completed time entry and removing the active timer row.
- Cleaned up the README roadmap summary after the accidental README/ROADMAP overwrite.

## Version 0.27.0

- Expanded `public/js/shared/billing.js` into the shared calculation source for billing/reporting normalization, billing periods, effective rates, effective rounding, historic project reconciliation, date ranges, and client/project summaries.
- Reworked Dashboard current-month billables and trailing-month chart totals to use shared billing summaries.
- Reworked Reporting client/project report rows and totals to use shared billing summaries while preserving project billing-period overrides and custom date ranges.
- Kept the release frontend-first so future server-side invoice/API reporting can reuse the same calculation shape deliberately.

## Version 0.26.0

- Added `src/core/` as the shared backend infrastructure area for app bootstrap, database helpers, HTTP helpers, security exports, permissions, audit, API-key auth, and shared error handling.
- Added static module definitions and a module registry under `src/core/modules/`.
- Added `modules` and `organization_modules` tables with startup synchronization for default enabled modules.
- Made the migration runner module-aware while preserving existing checksum validation.
- Moved time-entry routes, service, and repository into `src/modules/time-tracking/`.
- Moved client/project routes, service, and repositories into `src/modules/client-projects/`.
- Added compatibility re-export shims for the old route, service, repository, and `src/app.js` paths so current behavior remains unchanged.

## Version 0.25.0

- Added stable public API routes under `/api/v1` while keeping browser routes under `/api`.
- Added API key storage with hashed keys, prefixes, active/revoked status, last-used timestamps, and separate scope rows.
- Added API key authentication for public API requests using `Authorization: Bearer` or `X-API-Key`.
- Added scoped public endpoints for clients, projects, and time entries with versioned response envelopes and pagination metadata.
- Added API key administration under Settings with create, one-time key display, scope selection, prefix display, last-used tracking, and revoke.
- Added audit records for API key creation, revocation, and public API time-entry creation.
- Added `docs/public-api.md` as the first public API contract reference.

## Version 0.24.0

- Added role, permission, role-permission, and scoped user-role-assignment database tables.
- Seeded Super Admin, Organization Administrator, Client Administrator, Project Administrator, Client User, Project User, and external Client User roles.
- Added `permissionsService` for session/action/resource permission checks and scoped client, project, and time-entry filtering.
- Applied permission checks across user administration, organization settings saves, client/project management, time entry creation/editing, reporting data reads, and audit-log viewing.
- Added role assignment management to the edit user modal with scoped client/project assignments, advanced controls, and audit logging.
- Widened the edit user modal, stacked role assignment controls, and moved per-assignment CRUD restrictions into a dedicated permissions modal.
- Changed Super Admin assignments to use `all` scope instead of an organization-specific scope.

## Version 0.23.3

- Added a protected Audit Log page under Settings.
- Added audit-log filters for date range, user, record type, and change type.
- Added audit detail and JSON viewer modals with readable previous, new, and metadata values.
- Added full and filtered audit-log CSV export routes and buttons.
- Added user-click filtering from the audit table and record links from the audit detail modal.

## Version 0.23.2

- Added audit-log settings to Organization Settings with logging enablement and retention period controls.
- Stored audit logging enablement, retention days, and audit-settings update timestamps in `organization_settings`.
- Made `auditService.record()` respect per-organization audit logging settings.
- Logged audit logging off/on transitions with forced audit records at the required point in the toggle flow.
- Added organization-scoped audit retention cleanup based on each organization's configured retention period.

## Version 0.23.1

- Added the `audit_logs` database table with indexes for organization, date, actor, record type, change type, and record ID.
- Added shared audit-log repository and `auditService.record()` infrastructure.
- Replaced active app-event CSV writes with structured database audit records.
- Added audit records for time entries, organization settings, users, clients, projects, login, logout, and password changes.
- Kept audit logs separate from future dashboard activity-feed behavior.

## Version 0.23.0

- Added granular authenticated client and project CRUD endpoints.
- Reworked client/project repository saves so one record can be created, updated, or archived without rewriting unrelated records.
- Kept `GET /api/client-projects` as the nested compatibility read model while deprecating whole-tree `PUT /api/client-projects` saves.
- Updated the client/project admin UI to use record-level client and project save endpoints.
- Added client/project lookup indexes for organization, status, client, and updated-date queries.

## Version 0.22.5.2

- Added shared plain-browser frontend helpers under `public/js/shared/` for API requests, modals, formatting, billing, and record matching.
- Wired Reporting and Dashboard to shared billing, formatting, and client/project matching helpers.
- Moved newly touched JSON request paths to the shared API client.

## Version 0.22.5.1

- Replaced browser confirmation dialogs with shared in-app confirmation modals.
- Kept the native `beforeunload` warning for unsaved timer time.
- Converted timer, client/project, edit-entry, and user-admin destructive warnings to the shared modal helper.

## Version 0.22.5.0

- Refactored Time Tracker timer-count changes so existing timers are preserved instead of rebuilding the grid.
- Appended only newly requested timers when increasing the timer count.
- Removed only timers above the selected count when decreasing the timer count.
- Added an in-app confirmation dialog before removing timers that have elapsed, paused, or running time.
- Added `window.timeTrackerDebug.snapshot()` and `window.timeTrackerDebug.runTimerCountSanityCheck()` for browser-console verification.

## Version 0.22.4

- Matched the Edit Entries page width to Dashboard and Reporting.
- Added authenticated time-entry deletion from the Edit Entries row actions.
- Show Edit Entries status as "N/A" when a time entry has no billable flag.
- Show Edit Entries status as "N/A" when the matched client or project is unbillable.
- Added editable hours, minutes, and seconds duration fields to the Edit Entry form.
- Kept project-level round-hours settings adjustable when client-level rounding is already set.
- Changed stopwatch save feedback to a concise green "Saved." message.
- Reset the stopwatch after a successful stop/save.
