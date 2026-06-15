# View-Building Contract

As of 0.33.5.15.6, this document defines the first framework-owned view-building boundary, records the inventory that the 0.33.5.15 helper work should address, documents the initial helper implementation, records the first Lists protected-workspace pilot plus Client/Project modal adoption, documents the static guardrails for those converted surfaces, and closes the helper line with current-state module adoption guidance. The helper does not change module APIs, database schema, permissions, or business workflows.

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
| Lists | `views/protected/lists.html` is now a minimal host and `public/js/lists.js` builds the protected workspace with `LongtailForge.view` helpers while keeping module-owned data loading, labels, validation, and save behavior. | Filters, collapsible selector/index, split list/detail workspace, detail header, metadata/badges, action strip, summary panels, item entry fields, item rows, linked-record rows, tables. | Converted in 0.33.5.15.3 as the first pilot. Preserve all Lists routes, save payloads, permissions, Business context, and Personal/Family context. |
| Clients/Projects | `public/js/clients-projects.js` still owns the Clients/Projects page and editor bodies, but Add/Edit Client and Add/Edit Project dialog shells now use `LongtailForge.view` modal/form/footer helpers. | Add/Edit Client dialog, Add/Edit Project dialog, related-project/client tables, shared modal footer/action placement, filter controls. | Modal helper adoption shipped in 0.33.5.15.4 at the shared dialog source. Full page/table/filter conversion remains deferred. |
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

The first helper implementation exposes direct functions such as `createPageHeader`, `createStatusMessage`, `createFilterPanel`, `createCollapsibleIndexPanel`, `createSplitListDetail`, `createDataTable`, `createDetailActionStrip`, `createInfoPanel`, `createModal`, `createModalForm`, `createFieldGrid`, and `createActionButton`.

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
