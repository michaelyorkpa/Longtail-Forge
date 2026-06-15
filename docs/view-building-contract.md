# View-Building Contract

As of 0.33.5.15.1, this document defines the first framework-owned view-building boundary and records the inventory that the 0.33.5.15 helper work should address. It is a contract and inventory slice only: it does not add `LongtailForge.view`, change module APIs, change database schema, change permissions, or alter business workflows.

The earlier surface contract in `docs/ui-surface-contract.md` defines shared tokens, CSS classes, modal/footer/overlay shells, drawer/slideout shells, dense actions, chips, and focus behavior. This document defines the next layer above that: the common DOM structures the framework should help modules build.

## Framework Namespace

The browser helper namespace for the implementation slice is `window.LongtailForge.view`.

The helper file may be `public/js/shared/view-builder.js`, but the browser API should stay short and stable as `LongtailForge.view`. Do not expose a second `viewBuilder` namespace unless a later compatibility decision requires it.

## First Primitives

The first framework-owned primitives are:

- Page header
- Status message
- Empty state
- Filter panel
- Collapsible selector/index panel
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

These primitives should create safe, accessible DOM structures, apply the shared surface classes from `docs/ui-surface-contract.md`, and keep layout behavior consistent across protected views. They should stay small and boring: no virtual DOM, state manager, component lifecycle, router, build step, or frontend framework.

## Ownership Boundary

The framework owns view anatomy, surface classes, responsive behavior, dark-mode-safe tokens, accessible default structure, focus-visible-safe controls, status/empty state shells, overflow wrappers, and common action placement.

Modules own data loading, state decisions, validation, API calls, save payloads, route permissions, record labels, module-specific fields, and workflow behavior. Modules may pass labels, actions, form fields, table columns, rows, badges, and callbacks into framework helpers, but helpers must not learn module storage rules or mutate module-owned records directly.

Converted surfaces should keep legacy classes as compatibility aliases during the pilot when that avoids unrelated style or test breakage. New converted structures should use framework helper output and framework surface classes as the primary layout source. Do not add new one-off classes for framework-owned anatomy.

## Inventory Snapshot

The current protected UI still mixes static HTML shells with browser-script DOM construction. The first inventory found these repeated patterns:

| Surface | Current Construction | Repeated Patterns | Pilot Direction |
| --- | --- | --- | --- |
| Lists | `views/protected/lists.html` plus `public/js/lists.js` hand-build list rows, detail sections, item forms, linked records, summary panels, badges, and actions. `lists.js` has about 90 `createElement` calls. | Filters, collapsible selector/index, split list/detail workspace, detail header, metadata/badges, action strip, summary panels, item entry fields, item rows, linked-record rows, tables. | First conversion target in 0.33.5.15.3 after helpers exist. Preserve all Lists routes, save payloads, permissions, Business context, and Personal/Family context. |
| Clients/Projects | `public/js/clients-projects.js` is the largest current hand-built surface, with about 191 `createElement` calls and several direct `dialog` builders. | Add/Edit Client dialog, Add/Edit Project dialog, related-project/client tables, shared modal footer/action placement, filter controls. | Modal helper adoption in 0.33.5.15.4 at the shared dialog source. Do not broaden into full page conversion in that slice. |
| Tasks | `views/protected/tasks.html`, `public/js/tasks.js`, and `public/js/task-dialog.js` mix static task form markup with script-rendered rows, chips, actions, checklist rows, and dialog fallback markup. | Page header/status, filter panels, data table rows, dense row actions, modal shell/form/footer, field grids, chips. | Keep as already partially converted to surface classes. Later view-helper adoption should be explicit and behavior-preserving. |
| Notes | `views/protected/notes.html` and `public/js/notes.js` build the library filters, note list/detail surfaces, editor state, linked context, revisions, and preview flows. | Filter panel, list/detail workspace, detail header, action strip, modal form, field grid, status/empty states. | Defer conversion until after Lists and Client/Project modal pilot proves the helper shape. Preserve secure-note and Library behavior. |
| Files | `views/protected/files.html`, `public/js/files.js`, and `public/js/shared/file-attachments.js` build browse tables, attachment panels, upload forms, file cards, and row actions. | Data table, empty state, summary/status panels, inline item/action rows, attachment list cards. | Keep framework file service ownership. Future view-helper adoption should not bypass file permission, scan, storage, or download routes. |
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
- Converted surfaces should not introduce hard-coded light backgrounds outside theme tokens.
- Converted surfaces should not create non-wrapping action rows for dense/detail surfaces.
- Non-converted surfaces may continue existing markup during the pilot, but inventory and guardrail scripts should report what remains so conversion is deliberate.

## Implementation Notes For 0.33.5.15.2

The first helper implementation should expose direct functions such as `createPageHeader`, `createStatusMessage`, `createFilterPanel`, `createCollapsibleIndexPanel`, `createSplitListDetail`, `createDataTable`, `createDetailActionStrip`, `createInfoPanel`, `createModal`, `createModalForm`, `createFieldGrid`, and `createActionButton`.

Helpers should prefer safe text assignment, native button types, accessible labels/titles, optional ARIA labels where structure needs them, and stable dimensions or wrappers for fixed-format UI such as tables, toolbars, panels, and row actions. They should return DOM nodes and allow module-owned callbacks without owning app state.
