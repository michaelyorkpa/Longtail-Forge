# View-Building Contract

As of 0.33.5.15.6, this document defines the first framework-owned view-building boundary, records the inventory that the 0.33.5.15 helper work should address, documents the initial helper implementation, records the first Lists protected-workspace pilot plus Client/Project modal adoption, documents the static guardrails for those converted surfaces, and closes the helper line with current-state module adoption guidance. Updated through 0.33.5.18.11.4, it also records the current helper and descriptor implementation, the converted Lists, Notes, Tasks, and Files browse protected-workspace surfaces, the strict guardrails for the converted module surfaces, the completed Tasks conversion guidance, the finalized cross-module converted modal action ownership standard, Task/Notes stacked child-dialog parity, Notes/Tasks footer visual parity, the Notes notification follow-bell pass, and the Files filter sidebar/readable scope-control/list-shell/detail-summary pass. The helper does not change module APIs, database schema, permissions, or business workflows.

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
| Files | `views/protected/files.html` is now a minimal host for the framework-owned `files.browse` descriptor. `public/js/files.js` mounts readable browse filters through the descriptor `files.browse.filters` drawer region, mounts the browse status, summary panel, attachment rows, and selected-file read panels through shared list shell, info panel, detail header, detail badge row, and data table helpers in the descriptor `files.browse.results` main region, and preserves row download/delete/restore behavior on the Files-owned browser path; `public/js/shared/file-attachments.js` still owns attachment panels elsewhere. | Page header, slide-out filter sidebar, client/project selects, advanced target filters, list shell, data table, empty state, summary/status panels, detail header, metadata badge/detail rows, preview/availability panel, inline item/action rows, attachment list cards. | Descriptor host adoption shipped in 0.33.5.18.11.1 without moving query behavior, row actions, upload, storage, scan, quarantine, delete/restore, download, or attachment-panel semantics out of the Files service/browser helpers. Filter sidebar/readable scope controls shipped in 0.33.5.18.11.2 while preserving the service-owned attachments route and Business-only client filter submission. Browse list shell and readable row anatomy shipped in 0.33.5.18.11.3 with safe file-type badges, truncated readable labels, and icon-only row controls while Files keeps route/action semantics. Detail, preview/availability, metadata, and browse summary anatomy shipped in 0.33.5.18.11.4 while Files still owns route-backed availability, scan/delete/quarantine meaning, and safe row shaping. Later Files slices should convert upload, attachment panels, and remaining actions deliberately. |
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

## Implementation Notes For 0.33.5.18.11.4

The Files browse results behavior now adds a selected-file read anatomy around the existing attachment table. `LongtailForge.view.createListShell()` still owns the result/status wrapper; Files mounts a summary panel above the table and a selected-file detail grid below it. The table remains a shared `createDataTable()` surface, with Files adding row-selection behavior after the helper renders rows.

Selected file details use framework-owned read primitives: `createDetailHeader()` for the selected filename/context heading, `createDetailBadgeRow()` for compact status/scan/type/size badges, and `createInfoPanel()` for preview/availability and metadata detail rows. The metadata is intentionally display-only: status, scan status, module/target, Client, Project, size, uploaded/attached timestamps, uploader label when available, deleted timestamp when present, and a safe availability hint.

Files still owns the read model, route calls, and availability decisions. The browse detail panel consumes the permission-checked `/api/files/attachments` payload and the existing Files-owned row shaping; it does not introduce a parallel detail endpoint, infer downloadability from descriptor-only fields, expose storage keys, show protected paths, reveal scanner internals, display raw target/client/project IDs, or move upload/delete/restore/report/quarantine semantics into the framework.

## Implementation Notes For 0.33.5.18.6.5.2

`LongtailForge.view.createLinkedContextPicker(options)` adds the shared framework shell for Linked Context picker anatomy. It renders the Target select, Search input, Record dropdown, `Use Target` action, existing linked-context rows, row Remove actions, empty state, and read-only/permission-disabled state while exposing those controls through `element.viewParts`.

The helper is intentionally layout-only. Providers and consuming modules still own available target decisions, search/filter requests, record sorting, display labels, secondary labels, URLs, Primary Context hints, save payloads, API calls, and permission enforcement. The shell renders provider-supplied labels as text and must not synthesize module-specific strings such as target-type prefixes, client/status suffixes, or raw IDs.

## Implementation Notes For 0.33.5.18.6.7.1

Converted modal surfaces should open and close through `LongtailForge.view.showModal(dialog, options)` and `LongtailForge.view.closeModal(dialog, value)` instead of calling `dialog.showModal()` / `dialog.close()` directly when stacked secondary dialogs are possible. The helper records parent/child dialog relationships, tracks the top dialog, prevents non-top dialogs from reacting to Escape or backdrop-style clicks, and closes child dialogs when the parent editor closes.

The stack helper owns only dialog lifecycle guardrails and focus return. Modules still own the dialog body, staged form state, save payloads, validation, permissions, target lookups, and whether a secondary utility opens as a modal, overlay, or inline panel for the current roadmap slice.

