# Declarative View Surfaces

This guide describes the current `viewSurfaces` authoring contract as of 0.33.5.18.10.7.

Declarative view surfaces are framework-rendered protected surfaces described by module manifest data. They are for common app anatomy: page headers, filters, selector/index panels, split layouts, tables, detail headers, action strips, summary panels, field grids, modal shells, modal footers, item rows, and linked-record panels.

Modules still own business behavior. A module descriptor may name fields, routes, permissions, labels, and behavior IDs, but the module browser script or service still owns data meaning, validation, save payloads, API calls, permission enforcement, and workflow decisions.

## Authoring Steps

1. Declare a protected view in `protectedViews`.
2. Add a `viewSurfaces` descriptor bound to that view by `moduleId` and `viewId`.
3. Keep the protected HTML view as a minimal host that loads `view-builder.js`, `view-renderer.js`, and the module adapter script.
4. Expose a normalized data route and map response fields through `dataSource.fieldBindings`.
5. Put common anatomy in the descriptor: header, filters, index, table, detail, item rows, linked records, modals, and actions.
6. Register module-owned behavior handlers with `LongtailForge.view.registerBehavior(id, handler)` for actions that are not simple route actions.
7. Keep module-specific field binding, task pickers, catalog suggestions, payload construction, and permission-shaped workflow calls in the module adapter.
8. Add a focused regression before enabling strict guardrails for the surface.

## Layouts (0.33.5.18.2)

Supported `layout` values: `single-column`, `stacked`, `sidebar-detail`, `slide-out-sidebar`, and `table-page`. The `split-list-detail` layout is **retired** (the `createSplitListDetail` primitive and `.view-split-list-detail` CSS remain only as deprecated compatibility shims).

- `stacked` is the standard list/detail layout: a collapsible filters panel, a height-capped scrollable index panel on top, then a full-width detail panel below. Filters render collapsed by default.
- `slide-out-sidebar` is the preferred action/workflow surface anatomy when filters, libraries, or navigation need to sit beside a primary record or list surface without squeezing the main content.

## Shared Capabilities (0.33.5.18.1)

The 0.33.5.18 conversions use three shared capabilities added in 0.33.5.18.1:

- Filter-to-refetch: add `filters[]` with a `queryKey` (defaults to `field`). The framework appends non-empty filter values to the `dataSource` route, seeds the first load from `default`, and refetches when a filter changes. Authors do not write fetch or query-string code.
- Mount regions: add `regions[]` (or `detail.regions[]`) entries shaped `{ id, behavior, title }`. The framework renders the region container and calls the registered behavior with `{ container, record, api, refresh, openModal, workspaceContext }`. Use this to host module-owned widgets (tag pickers, file panels, Markdown preview, timers, checklists) instead of hand-building them in the page. A missing behavior renders a recoverable error.
- Rich item rows: `detail.itemRows` supports `itemTitleField`, `itemSubtitleField`, `chips`, `metaFields`, and `rowActions`. Gate row actions with `visibleWhen` (`equals` / `in` / `truthy` / `falsy`) against the row record; route actions interpolate `{token}` placeholders from that record.

Capabilities intentionally NOT yet in the descriptor (use an escape-hatch behavior, or wait for the surface that introduces them): hierarchical/tree index, descriptor-declared multi-select bulk toolbar actions, pagination/load-more, and general form-field `visibleWhen`. The imperative `LongtailForge.view` helpers and `renderDescriptor*` functions remain the escape hatch for genuinely custom fragments; do not use them to rebuild anatomy a descriptor already covers. As of 0.33.5.18.10.4, `LongtailForge.view.createBulkActionToolbar` provides a framework-owned collapsed shell for module-owned bulk-control bodies, `LongtailForge.view.createListShell` provides a framework-owned list wrapper/status mount for module-owned row bodies, `LongtailForge.view.createDetailActionStrip()` provides framework-owned placement for descriptor-backed Task row lifecycle actions, `LongtailForge.view.createDetailActionMenu()` provides framework-owned placement for descriptor-backed Task row workflow actions, `LongtailForge.view.createDetailBadgeRow()` provides framework-owned detail/read metadata and task context/relationship badge-row anatomy, `LongtailForge.view.createLinkedContextList()` provides framework-owned linked-context read-list anatomy for already-linked records, `renderDescriptorModalForm()` provides the framework-owned shell/footer/grid for the shared Tasks add/edit modal, `createModalForm()` plus the modal stack helpers provide the framework-owned recurrence child shell, and `LongtailForge.tasksDialog.openTaskEditor()` is the canonical browser opener for that modal. Tasks uses one framework-owned Task Details section, a framework-owned top summary badge row, framework-owned row context badge anatomy, and Notes-owned linked-note rows rendered through the shared linked-context read list while keeping row lifecycle visibility/handlers, assignment/scheduling/recurrence editor dispatch, timer route calls, non-destructive bulk status, priority, assignee, due-date, due-time, tag, archive, restore, relationship rules, task modal payloads, validation, primary-context rules, readable metadata values, recurrence state/rules, reminder overrides, checklist rows/actions/progress, timer state, tags, files, linked notes, copy-link, notification follow, callbacks, refresh hooks, and focus return behavior on module-owned route/service/browser paths. Tasks does not expose task delete controls because no shipped task delete workflow exists.

As of 0.33.5.18.10.3, Tasks uses one framework-owned Task Details section and a framework-owned top summary badge row in the canonical modal while keeping row lifecycle visibility/handlers, assignment/scheduling/recurrence editor dispatch, timer route calls, non-destructive bulk status, priority, assignee, due-date, due-time, tag, archive, restore, task modal payloads, validation, primary-context rules, readable metadata values, recurrence state/rules, reminder overrides, checklist rows/actions/progress, timer state, tags, files, linked notes, copy-link, notification follow, callbacks, refresh hooks, and focus return behavior on module-owned route/service/browser paths.

## Guardrails

Strict guardrails currently enforce `lists.workspace`, `notes.workspace`, and `tasks.workspace`. Tasks declares `tasks.workspace` for the protected page shell/read path, with ordered sidebar panels for a non-collapsible saved task view selector and collapsed Sorting and Filters controls. The main task list is bound through the `tasks-main-list` detail region, and the list shell, bulk toolbar, row lifecycle action strip, row workflow action menu, add/edit modal shell, top detail/read metadata badge row, recurrence child-modal shell, Checklist section shell, Task Timer section shell, and utility footer/heading placement use shared framework helpers. Strict Tasks guardrails now fail if Tasks reintroduces raw template parsing, protected-page anatomy, modal shell/footer construction, standard field-grid markup strings, or standard action placement outside descriptor/rendered helpers. Tasks still owns selected-view query behavior, row data shaping, lifecycle and workflow behavior handlers, row utility actions, metadata value selection, recurrence/reminder/checklist/timer behavior, tags/files/notes/copy-link/notification behavior, bulk semantics, relationship rules, payloads, validation, and dialog workflows as documented escape hatches in `docs/tasks-strict-guardrail-inventory.md`. The 0.33.5.18.10.7 closeout also locks `LongtailForge.tasksDialog.openTaskEditor()` as the canonical module-owned Task editor opener for Tasks page, Workbench, future Quick Action Center, and future module-triggered task creation flows. Tags and Developer Example descriptors are inventoried and delivered through the descriptor pipeline, but their protected views are not strict-converted surfaces in this closeout. (Notes mounts a secondary Library navigation panel via the framework `createCollapsibleIndexPanel` primitive - an allowed exception until the descriptor can express a second nav panel.)

A strict declarative surface must:

- Keep protected HTML to a minimal host.
- Use descriptor data for framework-owned anatomy.
- Avoid direct module calls to `LongtailForge.view` primitives for page headers, filters, split layouts, tables, action strips, field grids, modal forms, or inline action rows.
- Avoid `document.createElement("dialog")`, `document.createElement("table")`, and `document.createElement("details")` in the module adapter for framework-owned anatomy.
- Avoid one-off layout/footer classes when a descriptor field or framework class exists.
- Keep business behavior module-owned: routes, payloads, validation, permissions, task pickers, catalog suggestions, and workflow decisions.

## Minimal Host

The protected HTML page should provide only document metadata, shared assets, a host element, and scripts. Lists is the current strict example:

```html
<main class="wide-page lists-page" data-lists-host></main>
<script src="js/shared/view-builder.js?v=2"></script>
<script src="js/shared/view-renderer.js?v=1"></script>
<script src="js/lists.js?v=5"></script>
```

The module adapter decorates descriptor-rendered nodes with compatibility hooks only where existing data binding still needs them.

## Protected View Inventory

The inventory below is current for 0.33.5.18.10.7. `strict` means the static guardrail fails on declarative-surface violations. `reported` means the view is known to the inventory but is not strict-converted in this slice.

| Module | View | File | Descriptor Surface | Guardrail |
| --- | --- | --- | --- | --- |
| API Keys | api-keys | api-keys.html | - | reported |
| Audit Log | audit-log | audit-log.html | - | reported |
| Client Projects | clients | clients.html | - | reported |
| Client Projects | projects | projects.html | - | reported |
| Dashboard | dashboard | dashboard.html | - | reported |
| Developer Example | developer-example | developer-example.html | developer-example.surface | reported |
| Files | files | files.html | - | reported |
| Files Settings | files-settings | files-settings.html | - | reported |
| Help | help | help.html | - | reported |
| Lists | lists | lists.html | lists.workspace | strict |
| Notes | notes | notes.html | notes.workspace | strict |
| Notifications | notifications | notifications.html | - | reported |
| Reporting | reporting | reporting.html | - | reported |
| Search | search | search.html | - | reported |
| Tags | tags | tags.html | tags.management | reported |
| Tasks | tasks | tasks.html | tasks.workspace | strict |
| Tasks Settings | tasks-settings | tasks-settings.html | - | reported |
| Time Entries | time-entries | time-entries.html | - | reported |
| Time Tracker | time-tracker | time-tracker.html | - | reported |
| Time Tracking Settings | time-tracking-settings | time-tracking-settings.html | - | reported |
| User Admin | user-admin | user-admin.html | - | reported |
| User Settings | user-settings | user-settings.html | - | reported |
| Workbench | workbench | workbench.html | - | reported |
| Workspace Settings | workspace-settings | workspace-settings.html | - | reported |
