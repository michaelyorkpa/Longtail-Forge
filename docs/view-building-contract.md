# View-Building Contract

As of 0.33.5.15.6, this document defines the first framework-owned view-building boundary, records the inventory that the 0.33.5.15 helper work should address, documents the initial helper implementation, records the first Lists protected-workspace pilot plus Client/Project modal adoption, documents the static guardrails for those converted surfaces, and closes the helper line with current-state module adoption guidance. Updated through 0.33.5.18.12.5, it also records the current helper and descriptor implementation, the converted Lists, Notes, Tasks, and Files browse protected-workspace surfaces, the strict guardrails for the converted module surfaces, the completed Tasks conversion guidance, the finalized cross-module converted modal action ownership standard, Task/Notes stacked child-dialog parity, Notes/Tasks footer visual parity, the Notes notification follow-bell pass, the Files filter sidebar/readable scope-control/list-shell/compact browse reset pass, the Files backend attachment-context route, the Files attachable target option provider, the Files-owned File Context modal shell/read-only metadata pass, the File Context row-open/save wiring pass, the Files preview availability/content routes, the Files Preview modal action, the browse/edit/preview closeout boundary for the 0.33.5.18.12 handoff, the shared Files upload control shell standardization, the shared Files attachment-panel shell standardization, the Files row/attachment action-wiring pass, the Files visual-state/control parity pass, and the reporting-only Files strict guardrail inventory. The helper does not change module APIs, database schema, permissions, or business workflows.

The earlier surface contract in `docs/ui-surface-contract.md` defines shared tokens, CSS classes, modal/footer/overlay shells, drawer/slideout shells, dense actions, chips, and focus behavior. This document defines the next layer above that: the common DOM structures the framework should help modules build.

## Framework Namespace

The browser helper namespace for the implementation slice is `window.LongtailForge.view`.

The helper file may be `public/js/shared/view-builder.js`, but the browser API should stay short and stable as `LongtailForge.view`. Do not expose a second `viewBuilder` namespace unless a later compatibility decision requires it.

`LongtailForge.view` is implemented in `public/js/shared/view-builder.js` as a small DOM factory. It is intentionally framework-owned layout code rather than a component system.

## First Primitives

The first framework-owned primitives are:

- Page header
- Status message
- Empty state
- Filter panel
- Collapsible selector/index panel
- List shell with status mount
- Split list/detail workspace
- Data table with overflow wrapper
- Detail header
- Detail metadata/badge row
- Detail action strip
- Summary/info panel
- Modal shell
- Modal form
- Modal footer/action groups
- Field grid
- Inline item/action row
- Linked Context read-list shell
- Linked Context picker shell

These primitives should create safe, accessible DOM structures, apply the shared surface classes from `docs/ui-surface-contract.md`, and keep layout behavior consistent across protected views. They should stay small and boring: no virtual DOM, state manager, component lifecycle, router, build step, or frontend framework.

## Ownership Boundary

The framework owns view anatomy, surface classes, responsive behavior, dark-mode-safe tokens, accessible default structure, focus-visible-safe controls, status/empty state shells, overflow wrappers, and common action placement.

Modules own data loading, state decisions, validation, API calls, save payloads, route permissions, record labels, module-specific fields, and workflow behavior. Modules may pass labels, actions, form fields, table columns, rows, badges, and callbacks into framework helpers, but helpers must not learn module storage rules or mutate module-owned records directly.

Converted surfaces should keep legacy classes as compatibility aliases during the pilot when that avoids unrelated style or test breakage. New converted structures should use framework helper output and framework surface classes as the primary layout source. Do not add new one-off classes for framework-owned anatomy.

## Converted Modal Action Standard

As of 0.33.5.18.10.8.1, converted add/edit modals should treat the modal shell, title/heading row, heading action slot, footer
shell, footer utility group, footer commit group, sticky footer behavior, action button primitive
styling, focus return, and modal stack behavior as framework-owned anatomy. The owning module decides
which actions appear, which labels/icons are correct for the record, when actions are enabled, and what
the action does.

The shared footer standard is:

- Utility actions such as Tags, Files, and Copy Link live in `.surface-modal-footer-utilities` and use
  icon plus short visible text on normal converted add/edit modals. Dense icon-only utility buttons are
  allowed only when the surface deliberately opts into a compact treatment and keeps accessible labels,
  titles, native button types, and regression coverage.
- Utility actions that open substantial picker or upload content, including Tags and Files, should open
  stacked child dialogs through `LongtailForge.view.showModal()` / `closeModal()` rather than expanding
  inline inside the parent editor body. The framework owns the child dialog shell and stack behavior;
  modules own helper mounting, target IDs, visibility, save-first states, and refresh behavior.
- Commit actions live in `.surface-modal-footer-commit`. Cancel and Save should follow the compact
  Tasks pattern: recognizable icon buttons with accessible labels, titles, native button types, and
  consistent secondary/primary roles.
- One contextual record-level action may live beside the modal title in the heading action slot. For
  saved records that can emit notifications, that action should be the Follow Notifications bell. A
  duplicate top Close button should not be used when the footer already has Cancel or Close behavior.

Notification follow buttons stay split by ownership: the framework owns subscription helpers and common
bell display, while the owning module must produce meaningful record notifications before the bell is
shown as an active workflow. As of 0.33.5.18.10.8.4, Notes emits meaningful non-secure note
notifications and uses a heading Follow Notifications bell for saved non-secure notes. The framework
still owns the subscription API, target access recheck, delivery, preferences, and target decoration;
Notes owns event declarations, event emission, secure-note suppression, and the bell's saved/secure
availability rules.

As of 0.33.5.18.10.8.2, Tasks follows the same stacked child-dialog pattern that Notes already uses
for substantial modal footer utilities. The Task footer Tags and Files buttons open child dialogs
through `LongtailForge.view.showModal()` with the parent Task editor and triggering footer button, while
the Tags picker and Files attachment helper remain mounted by their owning helpers. The parent editor no
longer grows inline Tags or Files panels inside its body.

As of 0.33.5.18.10.8.3, Notes and Tasks use the same footer visual treatment for converted add/edit
modals: Tags, Files, and Copy Link are icon-plus-text utility actions in the left footer group, while
Cancel and Save remain compact icon commit controls in the right footer group. Copy-link URL
construction, clipboard fallback, picker staging, file attachment availability, save payloads, and
validation stay module-owned.

As of 0.33.5.18.10.8.5, the converted modal action standard is closed for Tasks and Notes and becomes
the starting guardrail for Files and later module conversions. Converted modules should pass utility
and commit actions through `renderDescriptorModalForm()` / shared modal helpers, keep one contextual
heading action when appropriate, and use stacked child dialogs for substantial footer utilities. Strict
guardrails should reject module-specific modal footer/heading anatomy where the shared helper can
express the pattern, duplicate top Close buttons on add/edit modals that already have footer dismissal,
inline parent-body Tags/Files picker panels, and active follow bells without module-produced
notifications.

## Inventory Snapshot

The current protected UI still mixes static HTML shells with browser-script DOM construction. The first inventory found these repeated patterns:

| Surface | Current Construction | Repeated Patterns | Pilot Direction |
| --- | --- | --- | --- |
| Lists | `views/protected/lists.html` is now a minimal host and `public/js/lists.js` builds the protected workspace with `LongtailForge.view` helpers while keeping module-owned data loading, labels, validation, and save behavior. | Filters, collapsible selector/index, split list/detail workspace, detail header, metadata/badges, action strip, summary panels, item entry fields, item rows, linked-record rows, tables. | Converted in 0.33.5.15.3 as the first pilot. Preserve all Lists routes, save payloads, permissions, Business context, and Personal/Family context. |
| Clients/Projects | `public/js/clients-projects.js` still owns the Clients/Projects page and editor bodies, but Add/Edit Client and Add/Edit Project dialog shells now use `LongtailForge.view` modal/form/footer helpers. | Add/Edit Client dialog, Add/Edit Project dialog, related-project/client tables, shared modal footer/action placement, filter controls. | Modal helper adoption shipped in 0.33.5.15.4 at the shared dialog source. Full page/table/filter conversion remains deferred. |
| Tasks | `views/protected/tasks.html` is now a minimal host for `tasks.workspace`. `public/js/tasks.js` renders the descriptor-backed page shell, mounts a non-collapsible Saved Task Views dropdown panel, mounts a collapsed Sorting and Filters panel, sends selected views through the Tasks-owned `task_view` query contract, mounts the existing task list through the descriptor `tasks-main-list` detail region, uses the shared list shell/status/table-overflow wrapper for the main list surface, uses the shared collapsed bulk-action toolbar shell while keeping bulk control behavior module-owned, renders descriptor-backed task lifecycle row actions through the shared dense action strip, renders descriptor-backed assignment/scheduling/recurrence/timer row workflow actions through the shared action menu, and renders task row context/relationship chips through the shared detail badge row while keeping workflow and relationship handlers module-owned. `public/js/task-dialog.js` now renders the shared add/edit task dialog shell through `renderDescriptorModalForm()`, exposes `openTaskEditor()` as the canonical Task editor opener, keeps the main editor fields in one framework-owned Task Details section, renders top detail/read summary metadata through `createDetailBadgeRow()`, builds the recurrence child editor shell with `createModalForm()` / modal stack helpers, keeps Checklist row rendering/actions inside the shared Checklist section shell, and keeps Task Timer plus tags/files/notes/copy/follow utility behavior inside framework-placed section/footer/heading shells while preserving task-specific behavior. The Task modal Notes panel consumes the Notes-owned linked-panel helper, which renders linked note rows through `createLinkedContextList()`. | Page header/status, slide-out filter sidebar, task view selector, collapsed filter controls, main task-list region, list shell, bulk toolbar shell, data table rows, dense lifecycle action strip, workflow action menu, modal shell/form/footer, child modal shell/stacking, section shells, utility footer/heading placement, field grids, detail badge row/chips, linked-context read list. | Descriptor-backed shell/read path shipped in 0.33.5.18.7.1; filter-sidebar anatomy shipped in 0.33.5.18.7.2; task-view query contract shipped in 0.33.5.18.7.3; read-only list binding shipped in 0.33.5.18.7.4; collapsed bulk-toolbar shell shipped in 0.33.5.18.8.1; non-destructive bulk behavior wiring shipped in 0.33.5.18.8.2; archive/restore lifecycle bulk wiring shipped in 0.33.5.18.8.3 without adding a task delete model; list-shell boundary shipped in 0.33.5.18.8.4 without moving task rows into the framework; modal-shell boundary shipped in 0.33.5.18.9.1 without moving recurrence, checklist, timer, tags, files, notes, payloads, or validation into the framework; canonical opener boundary shipped in 0.33.5.18.9.2 so other surfaces pass defaults/context/refresh hooks into one Task editor instead of duplicating forms; modal section/context boundary shipped in 0.33.5.18.9.3 so nullable Client/Project context follows Notes/List direction without exposing raw IDs; recurrence/reminder preservation shipped in 0.33.5.18.9.4 so recurrence uses a shared child-modal shell while recurrence state/rules and reminder overrides stay Tasks-owned; checklist preservation shipped in 0.33.5.18.9.5 so checklist row rendering, routes, progress, and service side effects remain Tasks-owned inside the shared section shell; timer and utility preservation shipped in 0.33.5.18.9.6 so Task Timer state, Tags, Files, linked Notes, Copy Link, and notification follow/unfollow remain Tasks-owned or owning-module-owned inside framework-placed shells; lifecycle row action wiring shipped in 0.33.5.18.10.1 so Complete, Reopen, Block/Unblock, Archive, and Restore use framework action-strip placement without adding task delete controls or moving route/service meaning out of Tasks; non-lifecycle workflow wiring shipped in 0.33.5.18.10.2 so Assign, Due Date, Due Time, and Recurrence open the canonical editor with field focus while Start/Pause/Resume Timer use existing timer routes; detail/read panel cleanup shipped in 0.33.5.18.10.3 so the modal summary metadata uses the shared detail badge row without adding a persistent detail column; relationship and linked-context cleanup shipped in 0.33.5.18.10.4 so relationship/context chips and linked note rows use shared anatomy while Tasks and Notes keep relationship and linked-note rules; strict guardrail inventory shipped in 0.33.5.18.10.5 so remaining framework-owned candidates and intentional Tasks-owned escape hatches were mapped before enforcement; strict guardrail enforcement shipped in 0.33.5.18.10.6 so `tasks.workspace` now fails on raw template chrome, protected-page anatomy, modal shell/footer construction, standard field-grid markup strings, and standard action placement outside descriptor/rendered helpers while documented task rows, recurrence, checklist, timer, bulk, relationship, utility, payload, and validation fragments remain Tasks-owned. Later Tasks slices should continue modal fields deliberately without moving the task list into the sidebar. |
| Notes | `views/protected/notes.html` and `public/js/notes.js` build the library filters, note list/detail surfaces, editor state, linked context, revisions, and preview flows. | Filter panel, list/detail workspace, detail header, action strip, modal form, field grid, status/empty states. | Defer conversion until after Lists and Client/Project modal pilot proves the helper shape. Preserve secure-note and Library behavior. |
| Files | `views/protected/files.html` is now a minimal host for the framework-owned `files.browse` descriptor. `public/js/files.js` mounts readable browse filters through the descriptor `files.browse.filters` drawer region, mounts a compact status plus attachment table through shared list shell and data table helpers in the descriptor `files.browse.results` main region, exposes `LongtailForge.filesDialog.openFileEditor()` for the Files-owned File Context modal shell, exposes `LongtailForge.filesDialog.openFilePreview()` for the Files-owned Preview modal, opens the context modal from persisted browse rows, opens the preview modal from explicit row Preview actions, and preserves row download/delete/restore behavior on the Files-owned browser path; `public/js/shared/file-attachments.js` still owns attachment panels elsewhere. | Page header, slide-out filter sidebar, client/project selects, advanced target filters, list shell, data table, empty state, status text, truncated file/target/Client/Project labels, safe file-type badge, dense row actions, row-open/focus affordance, modal shell/form/footer, preview modal shell/content area, read-only metadata rows, inline item/action rows, attachment list cards. | Descriptor host adoption shipped in 0.33.5.18.11.1 without moving query behavior, row actions, upload, storage, scan, quarantine, delete/restore, download, or attachment-panel semantics out of the Files service/browser helpers. Filter sidebar/readable scope controls shipped in 0.33.5.18.11.2 while preserving the service-owned attachments route and Business-only client filter submission. Browse list shell and readable row anatomy shipped in 0.33.5.18.11.3 with safe file-type badges, truncated readable labels, and icon-only row controls while Files keeps route/action semantics. The inline detail/summary anatomy from 0.33.5.18.11.4 was intentionally reset in 0.33.5.18.11.5: normal Files browse is a compact filterable listing with no Browse Summary, selected-file detail header, inline Preview, inline Metadata, or selected-row state. The 0.33.5.18.11.6 backend route adds attachment-context mutation without adding UI. The 0.33.5.18.11.7 backend provider adds permission-shaped target options for the later File Context modal. The 0.33.5.18.11.8 shell adds the shared-helper File Context modal with read-only metadata and Target/Project/Business Client controls. The 0.33.5.18.11.9 row-open/save pass opens that modal from persisted rows with click or Enter, keeps row Download/Delete/Restore actions isolated, and saves attachment context through `PATCH /api/files/attachments/:fileAttachmentId/context` while preserving service-owned validation. The 0.33.5.18.11.10 backend route adds attachment-scoped preview availability descriptors without browser preview UI or content handlers. The 0.33.5.18.11.11 backend route adds authenticated preview content handlers for image, text, and Markdown attachments. The 0.33.5.18.11.12 browser pass adds the explicit Preview row action and shared-helper Preview modal without adding a persistent preview pane or Inspector behavior. The 0.33.5.18.12 upload/action branch standardized upload shells, attachment-panel shells, row/attachment actions, and visual states through shared helpers. The 0.33.5.18.12.5 inventory maps remaining framework-owned candidates and Files-owned escape hatches before strict enforcement, while keeping `files.browse` reported until 0.33.5.18.12.6. |
| Help | `views/protected/help.html` and `public/js/help.js` build navigation groups and article body DOM from Markdown. | Collapsible navigation/index, article header, status/empty state, table/code overflow wrappers. | Do not convert Markdown rendering into generic helpers unless the helper remains safe-text/DOM-first and Help keeps content safety ownership. |
| Workbench | `views/protected/workbench.html` and `public/js/workbench.js` build recovery cards, timer cards, action rows, tag chips, and focus/context panels. | Page header, status, empty state, summary panels, inline item/action rows, chips. | Keep Workbench framework-owned. Helpers may support cards/actions, but module work-item providers keep record meaning. |
| Dashboard | `views/protected/dashboard.html` and `public/js/dashboard.js` build module summary panels, tables, chart markers, and billable summaries. | Page header, summary/info panels, data tables, empty states. | Keep Dashboard overview-focused and framework-owned. Helpers may standardize panels/tables without turning Dashboard into a workflow surface. |
| Reporting | `views/protected/reporting.html` and `public/js/reporting.js` currently own hard-coded report host tables and filters. | Filter panel, data table with overflow, status/empty state. | Future 0.33.6 reporting work should consume the helper boundary when it builds the framework reporting host. |
| Admin and Settings | API Keys, Audit Log, Notifications, User Admin, User Settings, Workspace Settings, Files Settings, and module settings combine static forms/tables with script-rendered rows and dialogs. | Field grids, settings groups, data tables, modal shell/form/footer, dense actions, status messages. | Convert opportunistically after the pilot. Do not block the Lists pilot on repo-wide admin/settings conversion. |

## Adoption Rules

- Converted surfaces should use `LongtailForge.view` helpers for framework-owned anatomy when the helper exists.
- Converted surfaces should keep business logic in module files and shared layout logic in framework helpers.
- Converted surfaces should not call `document.createElement("dialog")` directly when the shared modal helper fits the use case.
- Converted surfaces should not create new one-off modal footer/action classes when a framework helper exists.
- Converted modal surfaces should not bypass the shared heading action slot, utility footer group,
  commit footer group, or stacked child-dialog pattern for standardized add/edit modal actions.
- Converted surfaces should not introduce hard-coded light backgrounds outside theme tokens.
- Converted surfaces should not create non-wrapping action rows for dense/detail surfaces.
- Non-converted surfaces may continue existing markup during the pilot, but inventory and guardrail scripts should report what remains so conversion is deliberate.

## Implementation Notes For 0.33.5.15.2

The first helper implementation exposes direct functions such as `createPageHeader`, `createStatusMessage`, `createFilterPanel`, `createCollapsibleIndexPanel`, `createSplitListDetail`, `createDataTable`, `createListShell`, `createDetailBadgeRow`, `createDetailActionStrip`, `createInfoPanel`, `createModal`, `createModalForm`, `showModal`, `closeModal`, `closeChildModals`, `isTopModal`, `createFieldGrid`, `createLinkedContextList`, and `createActionButton`.

It also exposes `createEmptyState`, `createDetailHeader`, `createInlineActionRow`, and `createElement` because those primitives are part of the documented inventory and keep consuming modules from recreating the same safe DOM boilerplate.

Helpers should prefer safe text assignment, native button types, accessible labels/titles, optional ARIA labels where structure needs them, and stable dimensions or wrappers for fixed-format UI such as tables, toolbars, panels, and row actions. They should return DOM nodes and allow module-owned callbacks without owning app state.

## Implementation Notes For 0.33.5.15.3

The Lists protected workspace now uses `LongtailForge.view` to construct the page header, status message, filter panel, collapsible selector/index, split list/detail workspace, data tables, detail header, detail action strip, summary/info panels, item-entry field grid, inline item action rows, empty states, and the minimal Create/Edit List modal form shell.

The Lists module still owns API routes, save payloads, permission-shaped data loading, workspace-type decisions, client/project visibility, task-link picker behavior, list-item workflows, and all record labels. Legacy Lists classes remain as compatibility aliases during the pilot, but the static protected HTML no longer owns the converted workspace anatomy.

## Implementation Notes For 0.33.5.15.4

The shared Client/Projects browser source now uses `LongtailForge.view` for Add Client, Edit Client, Add Project, and Edit Project modal shells and footer placement. The Clients page no longer carries a static Add Client dialog; the browser builds that shell through `createModalForm` before binding existing page handlers.

Client/Projects keeps ownership of editor bodies, client/project hierarchy rules, billing defaults, tag pickers, save payloads, API calls, permission checks, workspace-type gates, and module-action host callbacks. The Workbench, Clients, and Projects protected pages load the shared view-builder helper before `clients-projects.js` so shared module actions use the same modal helpers.

## Implementation Notes For 0.33.5.15.5

The converted-surface guardrails are intentionally focused on surfaces already adopted in the 0.33.5.15 line: the Lists protected workspace and the shared Client/Project Add/Edit dialog functions. They do not fail on non-converted page tables, bulk editors, or other protected views that remain inventory-only until a later explicit conversion slice.

Converted surfaces should not directly create dialog elements when the shared modal helper fits, should preserve helper-built modal/footer/action classes, should avoid new hard-coded light backgrounds, and should keep dense/detail action rows wrapping through shared view CSS. Legacy compatibility aliases may remain during the pilot, but they should not replace the framework-owned surface classes supplied by `LongtailForge.view`.

The guardrails also keep the helper boundary boring: `public/js/shared/view-builder.js` remains layout-only and must not take ownership of API calls, browser storage, save payloads, permission decisions, or module-specific business rules.

## Implementation Notes For 0.33.5.15.6

The 0.33.5.15 closeout keeps the imperative helper layer as the supported current contract for converted module views. Modules may adopt `LongtailForge.view` where a slice explicitly converts a surface, and they may keep unconverted page areas hand-built until a later roadmap item names that conversion.

Developer documentation now treats framework view building as a boundary layered on top of the shared surface contract: the framework owns common anatomy, theme-safe wrappers, overflow behavior, modal/footer placement, and accessible defaults; modules own records, API calls, validation, save payloads, permission checks, labels, and workflow decisions.

The next 0.33.5.16 descriptor work should layer on top of these helpers rather than replacing them. Imperative helpers remain the escape hatch for module surfaces that are not ready for declarative descriptors.

## Implementation Notes For 0.33.5.16.4

The first declarative renderer shell lives in `public/js/shared/view-renderer.js` and extends the browser namespace as `LongtailForge.view.renderSurface(descriptor, host)`. It takes a validated view descriptor and a host element, clears the host, and renders static framework anatomy by composing the existing `LongtailForge.view` primitives.

The renderer supports the initial `single-column`, `split-list-detail`, and `table-page` layout shells. It can render page headers, filter panels, selector/index shells, split workspaces, table shells, detail headers, action strips, info panels, modal form shells, field grids, and empty/status placeholders. This shell is descriptor-in/static-DOM-out only: it does not fetch data, receive app-shell descriptors, register behavior handlers, own a client state store, implement a virtual DOM, or convert Lists.

## Implementation Notes For 0.33.5.16.5

Validated active descriptors now reach the browser through the existing app-shell bootstrap payload at `/api/app-shell/bootstrap`. `public/js/navigation.js` copies `viewSurfaces` into `LongtailForge.workspaceContext.viewSurfaces` alongside the existing module, navigation, permission, and search context.

Descriptor delivery stays permission-safe. The backend only includes descriptors whose owning module is enabled, whose bound protected view is available for the workspace, and whose protected-view permissions are allowed for the current session. Disabled modules and unavailable or unauthorized protected views do not leak descriptors through bootstrap. This slice still does not fetch descriptor data, bind live rows, register behaviors, or convert Lists.

## Implementation Notes For 0.33.5.16.6

The descriptor renderer now owns the first data-binding pass. When a descriptor includes `dataSource.route`, `LongtailForge.view.renderSurface(descriptor, host)` renders a loading state, fetches the route through `LongtailForge.api.getJson`, maps response records through `dataSource.fieldBindings`, and redraws framework-owned table, detail, index, summary, field, and item-collection anatomy from the mapped descriptor fields.

Rendered data-bound surfaces expose `surface.refresh()`, which re-fetches the descriptor data source and redraws the same framework-owned containers without requiring modules to rebuild the layout by hand. Loading, empty, and error states are framework-owned defaults. This slice still does not register declarative behaviors, wire action routes, interpret save payloads, or convert Lists.

## Implementation Notes For 0.33.5.16.7

This slice corrects a framework view defect surfaced by the live Lists pilot: a split-layout selector/index was built as a multi-column `createDataTable` crammed into the narrow index track, so cells wrapped one word per line. `LongtailForge.view` now exposes `createIndexList`, a single-column, keyboard-selectable selector primitive with a primary label, optional chip row, optional secondary meta lines, and a selected/`aria-current` state. Split-layout selectors should use this primitive; data tables are reserved for tabular detail content.

The framework `.view-split-list-detail` primitive now owns split column sizing and responsive collapse and fills the available content width. The legacy one-off `.lists-workspace` grid that overrode it was removed so the framework is the single owner of the split layout, and `public/js/lists.js` renders its selector through `createIndexList`. The descriptor renderer also builds `indexPanel` selectors through the same primitive, so the declarative path inherits the corrected selector. The remaining space beside the detail pane is the app-standard `.wide-page` width cap shared by every page, not a Lists defect, and is intentionally unchanged.

## Implementation Notes For 0.33.5.16.8

The descriptor renderer now supports declarative actions. Modules register behavior handlers with `LongtailForge.view.registerBehavior(id, handler)`, and descriptor `behavior` actions call those handlers with safe context: `{ action, record, workspaceContext, refresh, openModal, api }`. The framework owns discovery, dispatch, status/error display, and descriptor modal shell opening; modules own the handler body, validation, save payloads, and workflow meaning.

Route actions use descriptor `route`, `method`, `confirm`, role metadata, and optional browser-visible `requiredPermissions` metadata before calling the shared browser API client. API routes remain the authoritative permission boundary. Missing behavior handlers, denied action metadata, and route failures render recoverable framework status messages without breaking the rest of the surface. Lists workflow actions remain on the existing imperative Lists code until a later explicit conversion slice.

## Implementation Notes For 0.33.5.16.9

Lists now provides the first live read-only proof surface through a `viewSurfaces` descriptor named `lists.workspace`. The Lists protected page remains a minimal host, loads `view-renderer.js`, and asks `LongtailForge.view.renderSurface()` to create the read shell for the page header, filters, selector/index, split workspace, and descriptor summary-panel intent.

This slice keeps the existing Lists module workflow as the source of truth for filtered list reads, detail hydration, URL selection, mutating actions, item entry, item rows, modal save behavior, linked-record management, permissions, and Business/Personal/Family scope behavior. The renderer gained select-field support and generic `data-view-input` hooks so existing module-owned binding code can attach to descriptor-created controls without hand-building framework anatomy.

## Implementation Notes For 0.33.5.16.11

Lists now declares item entry fields, advanced item fields, item table columns, item row action placement, list-level workflow actions, linked-record picker/row placement, and the create/edit list modal shell in the `lists.workspace` descriptor. The browser module consumes those descriptor blocks to bind existing Lists save, catalog-suggestion, reorder, check/uncheck, complete, delete, link, remove-link, duplicate, finalize, archive, restore, reusable-list, and modal workflows.

Descriptor field metadata may include basic browser attributes plus `placement` and `behavior` hints. The hints describe where module-owned bindings attach; they do not move Lists validation, payload construction, permissions, catalog lookup, linked-record permission checks, or service behavior into the framework.

## Implementation Notes For 0.33.5.16.12

The declarative closeout adds strict static guardrails for surfaces that have fully adopted descriptor rendering. In this slice, strict enforcement applies to `lists.workspace` only: the protected HTML must remain a minimal host, and `public/js/lists.js` must not directly build framework-owned page header, filter panel, split layout, table, dialog, action strip, field-grid, or inline-action anatomy.

The guardrail also inventories every protected view and reports whether it has a descriptor surface. Tags and Developer Example remain descriptor fixtures and app-shell delivery proofs, not strict-converted UI surfaces. New strict surfaces should be added deliberately after a roadmap slice converts their protected HTML, descriptor, data bindings, and behavior adapter.

Developer authoring guidance for descriptor + data + behavior boundaries now lives in `docs/declarative-view-surfaces.md`.

## Implementation Notes For 0.33.5.18.1

The 0.33.5.18 View Conversion Backlog extends the declarative contract to the remaining workflow surfaces (Notes, Tasks, Files, Clients/Projects pages). 0.33.5.18.1 is framework-only and adds just the shared capabilities needed by two or more of those surfaces, keeping the descriptor small:

- Filter-to-refetch binding: descriptor `filters` now drive `dataSource` query parameters. Each filter contributes `queryKey` (defaulting to its `field`) and value to the fetched route; defaults seed the first load, and changing a filter calls `surface.refresh()` with the new query string.
- Mount regions: a descriptor `regions[]` entry (also `detail.regions[]`) declares `{ id, behavior, title }`. The framework renders a titled, surface-classed region container and invokes the registered mount behavior with a safe context (`container`, `record`, `api`, `refresh`, `openModal`, `workspaceContext`). This is the keystone that gives module-owned widgets (tag pickers, file panels, Markdown preview, timers, checklists) a framework-placed home without growing the descriptor language. Missing mount behaviors render a recoverable error and do not break the surface.
- Rich item rows: `detail.itemRows` now supports `itemTitleField`, `itemSubtitleField`, `chips`, `metaFields`, and `rowActions`. Row actions are state-gated by a `visibleWhen` predicate (`equals` / `in` / `truthy` / `falsy`) evaluated against the row record, and route actions interpolate `{token}` placeholders from that record.

Tree/hierarchical index, multi-select bulk toolbar, pagination, and general form-field `visibleWhen` are intentionally deferred to the first surface that needs them, so each is proven against a real consumer rather than built speculatively. The imperative `LongtailForge.view` helpers and `renderDescriptor*` functions remain the supported escape hatch for fragments a descriptor cannot express; they must not be used to hand-build anatomy a descriptor field or shared capability already covers.

## Implementation Notes For 0.33.5.18.2

The framework list/detail layout is now `stacked`, and the `split-list-detail` layout is retired. Supported descriptor `layout` values are `single-column`, `stacked`, and `table-page`.

- `stacked` renders, top to bottom: page header + surface actions, a collapsible filters panel, a height-capped scrollable index panel (`.view-stacked .view-collapsible-index-body` — ~5 rows, `overflow-y: auto`), then a full-width detail panel (`.view-stacked-detail`). This replaces the side-by-side split and also resolves the detail action-strip overflow the narrow split track caused.
- `createFilterPanel` now renders a collapsible `<details>` (collapsed by default on rendered surfaces, `open` option to expand).
- `createCollapsibleIndexPanel` supports an optional `summaryActions` node or node list for framework-owned summary-line controls such as right-aligned pagination. Summary actions hide automatically while the panel is collapsed; modules may supply the control behavior without rebuilding the panel anatomy.
- Deprecated, retained for compatibility only: the `createSplitListDetail` primitive and `.view-split-list-detail` CSS. They are no longer wired into the renderer and `split-list-detail` is no longer a valid `layout`; do not use them in new work. Use `stacked`.

## Implementation Notes For 0.33.5.18.6.10.2

The descriptor renderer supports `layout: "sidebar-detail"` with an optional ordered `sidebarPanels[]` array. When present, the framework renders those panels top-to-bottom in the left sidebar and keeps the primary detail surface in the main region. Supported panel types are `filters`, `navigation`, and `index`.

The framework owns sidebar panel shell anatomy: stable heading/summary markup, optional non-collapsible panel sections, initial open/closed state, scroll-safe body regions, and footer slots for controls such as sort and pagination. Modules still own panel labels, content, queries, record reads, filtering, selection state, and behavior handlers. Navigation panels and panel footers use the same module-owned behavior mount boundary as descriptor regions.

Descriptors without `sidebarPanels[]` keep the implicit Filters plus Index sidebar fallback, so adopting the new ordered panel contract is opt-in per surface.

## Implementation Notes For 0.33.5.18.6.11

The reusable action/workflow surface pattern is `layout: "slide-out-sidebar"`. It is the preferred anatomy for future Tasks, Tickets, Notes, Lists, Files, and Clients/Projects conversions when a surface needs filters, libraries, navigation, or record browsing beside a primary record/detail view. The drawer opens from the screen-left edge; the primary/detail region remains in the central main content panel at full available width.

`slide-out-sidebar` reuses the ordered `sidebarPanels[]` contract from `sidebar-detail`, but changes the page anatomy. The framework owns the off-canvas drawer, funnel/filter trigger, backdrop, trigger/Escape/backdrop close behavior, focus movement into the drawer, focus return to the trigger, ARIA open state, body scroll locking, reduced-motion fallback, panel body/footer overflow, and surface classes. Modules own panel content, reads, filters, record selection, sort/pagination behavior, and module-specific rules for whether an action keeps the drawer open or returns the user to the main detail.

The main/detail panel for a slide-out action surface should be top-anchored in the content area and must not be squeezed, resized, or re-centered when the drawer opens. The funnel trigger should stay near the screen-left lower viewport edge, using the footer-visible offset so it lifts above the footer without overlapping it.

This is not the retired center `split-list-detail` behavior and not the rejected persistent split-column `sidebar-detail` anatomy. `split-list-detail` remains compatibility-only, and `sidebar-detail` is a historical/intermediate split-column layout rather than the default direction for future action/workflow surfaces.

## Implementation Notes For 0.33.5.18.10.7

Tasks is now a completed `slide-out-sidebar` adopter and a template for future list-first workflow conversions. Unlike Notes, Tasks keeps the task list as the primary main-panel surface; the slide-out sidebar is limited to Saved Task Views, sorting, and filters. Opening the drawer must not move, squeeze, or replace the task list.

The converted Tasks page uses framework-owned anatomy for the page shell, drawer shell, sidebar panels, task-view selector placement, main list shell, collapsed bulk toolbar shell, row lifecycle action strip, row workflow action menu, modal shell/footer, modal field-grid placement, detail badge rows, linked-context row anatomy, and modal utility/footer placement. Tasks continues to own task rows, canonical query semantics, task view meanings, bulk payloads, lifecycle and workflow behavior handlers, relationship rules, recurrence/checklist/timer behavior, task modal payloads, validation, permissions, readable metadata values, and refresh callbacks.

`LongtailForge.tasksDialog.openTaskEditor()` is the canonical browser entry point for add/edit/duplicate Task flows across the Tasks page, Workbench, registered module actions, future Quick Action Center calls, and future module-triggered task creation. New surfaces should invoke that opener or the registered module action with defaults/source context/focus targets rather than creating alternate task forms. This keeps one Task editor while allowing the framework to own action dispatch, focus return, and host lifecycle around the module-owned dialog.

## Implementation Notes For 0.33.5.18.11.1

Files now exposes the framework-owned `files.browse` descriptor through the same app-shell `viewSurfaces` payload as module descriptors. Files stays framework-owned rather than becoming a lifecycle-managed workflow module: the descriptor registry contributes the protected view gate, the modules service merges that descriptor into active surface delivery, and `files.view` filters descriptor visibility for the current session.

The protected Files page is a minimal host that loads the shared view builder, descriptor renderer, and Files adapter. The first Files slice does not move query construction, attachment reads, delete/restore actions, download URLs, upload helpers, storage accounting, scan/quarantine behavior, or record attachment semantics out of the existing Files routes and services. Instead, `public/js/files.js` mounts the current browse UI through the descriptor `files.browse.legacy` region so later slices can convert filters, lists, attachment cards, and actions one piece at a time.

## Implementation Notes For 0.33.5.18.11.2

Files now uses the shared `slide-out-sidebar` descriptor layout for the browse surface. The framework descriptor owns the drawer/main placement and names `files.browse.filters` for the sidebar panel plus `files.browse.results` for the main browse region. The shared renderer continues to own the filter trigger, off-canvas drawer, backdrop, Escape handling, focus return, and scroll locking.

The Files adapter still owns query construction, service-route calls, row shaping, download/delete/restore handlers, and workspace-specific visibility decisions. Normal browse filters show readable Client and Project selects populated from the existing `/api/client-projects` provider and shared client/project option normalizer. Raw module, target type, target ID, and fallback project ID filters are available only inside the explicit advanced target filter disclosure. Client filters are hidden, disabled, and omitted from submitted Files route queries outside Business workspaces.

## Implementation Notes For 0.33.5.18.11.3

The Files browse results behavior now uses `LongtailForge.view.createListShell()` for the status mount and `LongtailForge.view.createDataTable()` for the attachment table wrapper, header, empty state, and row cells. The framework-owned descriptor still points at `/api/files/attachments`; this slice does not add a parallel read endpoint or move Files reads into the generic renderer.

Files continues to own each attachment row object before it reaches the shared table helper. The adapter shapes the safe display filename, module label, target label, Client label, Project label, status/scan label, attached timestamp, file size display value, and download/delete/restore availability. Normal rows do not fall back to raw target/client/project IDs when a readable label is unavailable.

The browse table is optimized for scanning: the file cell uses a safe file-type badge with short extension text such as `JPG` before a truncated filename, target/Client/Project labels truncate with hover/focus reveal, and repeated Download/Delete/Restore actions are icon-only controls with accessible labels and titles. Truncated row labels should not use native `title` attributes or expand inside the table on hover; Files uses one body-level floating tooltip so the reveal sits above scroll/overflow containers. These are display choices only; download routes, scan gates, delete confirmation, restore behavior, permissions, retention, audit, and lifecycle semantics remain Files-owned.

## Implementation Notes For 0.33.5.18.11.6

Files now exposes `PATCH /api/files/attachments/:fileAttachmentId/context` as a Files-owned backend mutation for later File Context editing UI. The route edits the attachment row context only; it does not rename files, replace binaries, move storage, alter scan/quarantine state, or expose storage controls. Client and Project payload values are treated as selector hints and are rejected when they conflict with the resolved registered target.

The Files service resolves both old and new contexts through the attachable type registry, validates workspace ownership, requires old-context remove permission and new-context attach permission, derives saved Client/Project from the target's registered fields, rejects duplicate active attachment contexts, records previous/next context audit metadata, and emits safe `file.attachment.context_updated` lifecycle events for the old and new record scopes. The event and audit payloads must stay free of storage keys, protected paths, file hashes, scanner internals, signed URLs, and raw filesystem data.

## Implementation Notes For 0.33.5.18.11.7

Files now exposes `GET /api/files/attachable-targets` as the read-only option provider that later File Context modal slices will consume. The provider uses the registered attachable type declarations, active workspace module filtering, target table/workspace metadata, target read permission, target attach permission, and module-owned access checks before shaping any option.

The provider returns readable target labels, module labels, target type labels, safe context labels, and internal option values for the selected module/target/Client/Project context. Raw protected IDs may remain in option values because later save wiring needs them, but labels and context hints must not fall back to those IDs. Business workspaces may receive Client and Project filter options when readable labels exist; Personal and Family workspaces hide Client filter payloads and strip Client values from normal target option responses. Provider responses must not expose storage keys, protected paths, scanner internals, file hashes, secure-note internals, signed URLs, raw filesystem data, or unreadable target labels.

## Implementation Notes For 0.33.5.18.11.8

Files now exposes `LongtailForge.filesDialog.openFileEditor()` as the canonical Files-owned browser opener for the File Context editor shell. The opener creates a temporary `renderDescriptorModalForm()` modal, uses the shared footer/action helpers for Close, appends the dialog to the page, and opens it through `LongtailForge.view.showModal()` so Close/Escape returns focus to the triggering element.

The modal is read-oriented until the next slice wires row-open and save behavior. It shows file name, file type, size, status, scan state, uploaded timestamp, attached timestamp, and uploader when available as read-only metadata rows. The controls introduced in this shell slice are Target, Project, and Business-only Client selectors. The Client selector is hidden, disabled, and unnamed for Personal and Family workspaces, while Business Client and Project selections filter the target option request where possible.

Target choices load from `GET /api/files/attachable-targets`; the modal does not call the attachment-context PATCH route yet. This slice deliberately does not add row-click behavior, preview UI, filename rename, file replacement, storage provider/key controls, scan/quarantine controls, hard delete, permanent purge, or download-only metadata editing.

## Implementation Notes For 0.33.5.18.11.9

Files browse rows with persisted file attachment IDs now open the canonical File Context modal on row click and on Enter when the row itself has keyboard focus. Space activation is intentionally not wired in this slice because Files keeps native table semantics rather than recasting rows as button controls. Row Download/Delete/Restore controls, anchors, buttons, inputs, selects, and textareas are excluded from row-open behavior through a Files-owned action-isolation helper.

The File Context footer now includes an icon-only Save action in the shared modal footer. Save is disabled while target options load, when no target is selected, or when the selected option is only the disabled current-target fallback. Client/Project selector changes filter target choices, while target changes do not rewrite the visible Client/Project dropdown values. The Files service remains authoritative for deriving and validating saved Client/Project context.

The save handler calls `PATCH /api/files/attachments/:fileAttachmentId/context` with only `moduleId`, `targetType`, `targetId`, and optional Business `clientId` / `projectId` selector hints. On success the modal closes, the Files list refreshes, and focus returns to the refreshed attachment row when it is still present. Save failures leave the modal open, re-enable controls, and show an inline error. This save slice did not yet add preview, rename, replacement, storage, scan/quarantine, hard-delete, purge, or download-only metadata editing.

## Implementation Notes For 0.33.5.18.11.10

Files now exposes `GET /api/files/attachments/:fileAttachmentId/preview` as the attachment-scoped preview availability descriptor route. The route reads the selected active attachment, resolves its registered target, requires read access to that target, and evaluates `files.download` with the attachment's Client/Project context before shaping any previewable state.

The descriptor classifies state as `previewable`, `download_only`, `too_large_for_preview`, `unavailable`, or `unauthorized`, and classifies kind as `image`, `text`, `markdown`, or `unsupported`. In the descriptor-only slice it returned readable filename/file-type metadata without content bytes or content routes; it does not return rendered Markdown, image streams, text bodies, signed URLs, storage keys, storage paths, hashes, scanner internals, or protected filesystem data. Unsupported available files are `download_only`, oversized text/Markdown files are `too_large_for_preview`, and deleted, quarantined, pending, or failed-scan files are `unavailable`.

Preview descriptor reads do not record audit or lifecycle events in this descriptor-only slice because no preview content is read or displayed. If a later content or user-facing preview action needs tracking, it should use a distinct action such as `file.previewed`.

## Implementation Notes For 0.33.5.18.11.11

Files now exposes `GET /api/files/attachments/:fileAttachmentId/preview/content` as the authenticated content handler behind previewable attachment descriptors. Previewable descriptors set `contentAvailable: true` and include the route-backed `contentUrl`; download-only, too-large, unavailable, and unauthorized descriptors keep content unavailable.

Image previews for JPG, JPEG, PNG, and GIF stream through the Files storage adapter and the authenticated Files route with `no-store`, `nosniff`, sandboxed inline headers, and no storage path or key exposure. Text previews for TXT return capped UTF-8 JSON content. Markdown previews for MD are capped before rendering and use the shared server Markdown service, so raw HTML remains disabled and unsafe links/images remain neutralized by the existing Markdown platform contract.

Preview content keeps the same attachment-scoped target read and context-scoped `files.download` checks as the descriptor route. Unsupported, oversized, unavailable, failed-scan, deleted, quarantined, pending, and unauthorized attachments do not return preview content. This backend-only slice does not add browse-row Preview controls, a preview modal, Inspector behavior, or preview audit/lifecycle events; user-facing preview tracking can be added with the modal slice if it becomes useful.

## Implementation Notes For 0.33.5.18.11.12

Files browse rows now include an explicit icon-only Preview action for rows that are locally likely to be previewable: available, scan-passed/not-required image, TXT, or MD attachments within the text/Markdown preview size cap. Available downloadable rows that are not previewable show a quiet download-only marker instead of a noisy detail panel. The marker and the Preview button both participate in row action isolation, so clicking row Preview does not open File Context and row click/Enter still opens only the File Context modal.

`LongtailForge.filesDialog.openFilePreview()` builds a dedicated shared-helper modal. It first reads the attachment-scoped preview descriptor, then loads the route-backed content URL only when the descriptor remains previewable. Image previews render from the authenticated Files content route, text previews render with `textContent` in a scroll-safe code region, and Markdown previews render the server-sanitized HTML returned by the shared Markdown service. The browser does not add another Markdown parser.

The Preview modal includes an icon-only Download action when the file remains downloadable and a Close action that returns focus through the shared modal stack. Loading, download-only, too-large, unavailable, permission, and image-load failure states stay inside the modal. The File Context modal may also expose the same icon-only Preview action to the left of Close/Save for previewable attachments; that action opens the same standalone Preview modal flow as the Files list instead of turning File Context into an inline preview surface. The Files page still has no persistent preview pane, inline Browse Summary, selected-file detail, inline Metadata panel, selected-row state, or Inspector integration.

The File Context selector order is Client, Project, then Target. Client and Project dropdowns are populated from the shared `/api/client-projects` option source with Client/Project hierarchy ordering and remain stable while users filter targets. The target dropdown is loaded from the registered attachable target provider for the selected Client/Project context and is not restricted to the current attachment module/type, so readable Notes and Tasks may both appear. Target labels omit Client/Project context already selected in the Context controls. A stored file can be linked to a task and a note through separate active `file_attachments` rows for the same `file_id`; this modal edits the selected attachment row only and does not create an additional link.

## Implementation Notes For 0.33.5.18.11.5

The Files browse results behavior is intentionally compact again. `LongtailForge.view.createListShell()` owns the result/status wrapper and `LongtailForge.view.createDataTable()` owns the table wrapper, header, empty state, overflow behavior, and cell placement. Files mounts one table remount target in the descriptor `files.browse.results` region and keeps only the small status/live region for loading, empty, error, or visible-count messages.

Normal Files browse no longer renders the 0.33.5.18.11.4 inline Browse Summary, selected-file header, inline Preview panel, inline Metadata panel, or selected-row state. Rows do not stay selected and do not drive a page-level detail panel. The readable row contract from 0.33.5.18.11.3 remains: safe file-type badge, truncated filename/target/Client/Project labels with the custom body-level reveal, status, attached timestamp, and icon-only Download/Delete/Restore controls. The listing should use one clear table frame inside the Files page rather than nesting another framed main panel around it, and normal desktop widths should truncate row text instead of forcing a horizontal scrollbar.

Files still owns the `/api/files/attachments` read model, route calls, action availability decisions, and workspace-specific Client visibility. This reset does not change storage, scan/quarantine, lifecycle, upload, delete, restore, report, attachment validation, permissions, schema, or backend Files routes. File Context editing and Preview should return as dedicated route-backed modal workflows, not as inline browse-page dashboard panels.

## Implementation Notes For 0.33.5.18.11.13

The Files browse/edit/preview closeout locks the revised Files page state before the upload/action branch starts. Files page is compact browse/recovery. Filter sidebar owns browse filtering. Main panel owns the listing only. Row click opens File Context. Preview opens the Files Preview modal. Download downloads, and Delete/Restore mutate lifecycle through existing Files routes.

The 0.33.5.18.11.4 inline detail/summary anatomy was intentionally replaced by modal-based edit/preview behavior. Normal browse does not render inline Browse Summary, selected-file header, inline Preview panel, inline Metadata panel, selected-row detail, or Inspector integration. File metadata is read-only inside the File Context modal; editable context is attachment-scoped and route-backed through `PATCH /api/files/attachments/:fileAttachmentId/context`. Preview is attachment-scoped and route-backed through the descriptor/content routes.

The 0.33.5.18.12 upload/action branch should preserve this boundary. Upload shell, reusable attachment panel shell, existing row/attachment actions, visual parity, and strict guardrails may be converted, but already-shipped File Context and Files Preview routes/modals should not be reimplemented. Rename, replacement, storage moves, hard purge, permanent delete, raw storage controls, and unsafe direct metadata editing remain out of scope unless the Files service first ships explicit route, permission, audit, and regression support.

## Implementation Notes For 0.33.5.18.12.1

The shared Files attachment helper now renders the upload/dropzone area through `LongtailForge.view.createListShell()` when the view helper is available. The shell owns the upload status mount, accepted-file hint placement, upload action row, and per-file result placement, with stable `data-file-upload-shell`, `data-file-upload-status`, and `data-file-upload-results` hooks for future guardrails. Because Notes, Tasks, and Workbench load the attachment helper before the view builder, the helper resolves `LongtailForge.view` lazily and keeps a plain DOM fallback.

The upload action itself uses `LongtailForge.view.createActionButton()` when available, but the helper still owns submit/drop handling, `FileReader` base64 conversion, accepted extension/category mapping, batch payload construction, target/module/client/project/visibility values, `/api/files/batch` calls, partial-failure result rows, upload events, attachment refresh, and host callbacks. This slice does not add upload UI to the Files browse page, File Context modal, or Files Preview modal.

## Implementation Notes For 0.33.5.18.12.2

The shared Files attachment helper now wraps its reusable attachment panel through framework-owned shell anatomy when `LongtailForge.view` is available. The panel itself uses the shared list shell status slot, the attachment list and upload-result rows use shared list shells without duplicate status chrome, and loading/error/empty/save-first states use the shared empty-state helper. Stable hooks include `data-file-attachment-panel`, `data-file-attachments-status`, `data-file-attachments-list`, `data-file-attachment-item`, `data-file-attachment-actions`, and the existing upload hooks.

This is still a Files-owned behavior helper. Attachment reads, upload payload construction, download links, remove/delete/restore route calls, delete confirmation, events, refresh, host callbacks, saved-record mounting, and unsaved-record save-first messaging remain in `public/js/shared/file-attachments.js` and the Files service/browser routes. Deleted, quarantined, pending-scan, scan-error, and otherwise unavailable files stay visible with quiet recovery-safe copy instead of disappearing from the owning record's Files dialog.

The attachment helper remains compatible with Notes and Tasks stacked child dialogs. It does not add inline File Context, Preview, Metadata, Inspector, rename, binary replacement, storage move, hard purge, permanent delete, or raw storage controls. Future edit or preview affordances should call the canonical route-backed Files modal workflows rather than growing inline attachment-panel bodies.

## Implementation Notes For 0.33.5.18.12.3

Files row actions and shared attachment-panel actions now use the same Files action vocabulary for the shipped workflows: `files.preview`, `files.download`, `files.report`, `files.quarantine`, `files.removeAttachment`, `files.delete`, and `files.restore`. The Files page still owns row shaping and route calls, while the shared view helpers own dense/action placement and accessible button anatomy.

Report and Quarantine call the existing Files routes, keep confirmation flows, refresh after mutation, and rely on the Files service for permission checks, report reason validation, quarantine lifecycle behavior, audit, and retention semantics. Direct Quarantine visibility is shaped by explicit `files.manage_quarantine` evidence from workspace permissions or the app-shell `filesManageQuarantine` hint; the service route remains authoritative. File Context edit and Files Preview remain the route-backed 0.33.5.18.11 modal workflows rather than inline attachment-panel or browse-page bodies.

This slice does not add rename, move, hard purge, permanent delete, binary replacement, storage moves, direct metadata editing, inline Preview, inline Metadata, selected-file detail, or Inspector behavior. Unsupported files remain download-only, with Download continuing to use `/api/files/:fileId/download`.

## Implementation Notes For 0.33.5.18.12.4

Files visual states now use shared chip and dense-action anatomy while preserving the compact browse boundary. Browse rows render availability and review-state chips in the Status column, and the shared attachment helper renders size/status/review/visibility metadata as wrapping chips. Deleted files appear as unavailable, quarantined files appear as in review, pending/error scan states appear as review pending or review needed, and normal UI avoids quarantine/scan wording except where route/action IDs remain internal.

The Files page keeps icon-only controls for dense repeated Preview, Download, Delete, and Restore actions, while ambiguous Report and Review actions use visible text with accessible labels and titles. The Review control still calls the existing quarantine route and preserves Files service permission, audit, lifecycle, and restore/download behavior. File Context and Preview controls are included in visual parity checks but remain the route-backed modal workflows from 0.33.5.18.11.

Files row action strips and attachment action rows now wrap on narrow widths, with stable chip/action dimensions so controls do not overlap filenames, row metadata, or attachment content. This slice does not add inline Preview, inline Metadata, selected-file detail, selected-row state, nested dashboard-like browse panels, Inspector behavior, rename, replacement, storage moves, hard purge, permanent delete, or raw storage controls.

## Implementation Notes For 0.33.5.18.12.5

`docs/files-strict-guardrail-inventory.md` is the reporting-only Files strict guardrail inventory for the 0.33.5.18.12 enforcement handoff. It maps framework-owned candidates in `public/js/files.js` and `public/js/shared/file-attachments.js`, including the page/header host, slide-out filters, list/table shell, attachment panel shell, upload/dropzone shell, empty/status states, dense actions, File Context modal placement, Preview modal placement, and modal stack behavior.

The inventory also records the allowed Files-owned escape hatches that future strict checks must preserve: file reads, base64 upload payloads, accepted categories, attachment reads, host callbacks, scan/review/download/preview availability, Files route calls, confirmations, permission-shaped visibility, target metadata, deleted/unavailable/in-review recovery states, and the already-shipped `LongtailForge.filesDialog.openFileEditor()` and `LongtailForge.filesDialog.openFilePreview()` workflows. These modal openers remain Files-owned route-backed workflows even when their shells use shared modal helpers.

This slice keeps `files.browse` as a reported descriptor surface rather than a strict-converted surface. `scripts/files-strict-guardrail-inventory-regression.mjs` proves the inventory exists, confirms Files is still reported, checks the helper-backed anatomy and escape-hatch map, and reports the remaining direct DOM construction count without failing it. The 0.33.5.18.12.6 enforcement slice may turn the mapped framework-owned candidates into fail-on-violation checks, while continuing to forbid inline Browse Summary, inline Preview, inline Metadata, selected-file detail, selected-row state, Inspector-style browse behavior, raw storage controls, and direct route bypasses.

## Implementation Notes For 0.33.5.18.6.5.2

`LongtailForge.view.createLinkedContextPicker(options)` adds the shared framework shell for Linked Context picker anatomy. It renders the Target select, Search input, Record dropdown, `Use Target` action, existing linked-context rows, row Remove actions, empty state, and read-only/permission-disabled state while exposing those controls through `element.viewParts`.

The helper is intentionally layout-only. Providers and consuming modules still own available target decisions, search/filter requests, record sorting, display labels, secondary labels, URLs, Primary Context hints, save payloads, API calls, and permission enforcement. The shell renders provider-supplied labels as text and must not synthesize module-specific strings such as target-type prefixes, client/status suffixes, or raw IDs.

## Implementation Notes For 0.33.5.18.6.7.1

Converted modal surfaces should open and close through `LongtailForge.view.showModal(dialog, options)` and `LongtailForge.view.closeModal(dialog, value)` instead of calling `dialog.showModal()` / `dialog.close()` directly when stacked secondary dialogs are possible. The helper records parent/child dialog relationships, tracks the top dialog, prevents non-top dialogs from reacting to Escape or backdrop-style clicks, and closes child dialogs when the parent editor closes.

The stack helper owns only dialog lifecycle guardrails and focus return. Modules still own the dialog body, staged form state, save payloads, validation, permissions, target lookups, and whether a secondary utility opens as a modal, overlay, or inline panel for the current roadmap slice.

