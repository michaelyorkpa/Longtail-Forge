# Declarative View Surfaces

This guide describes the current `viewSurfaces` authoring contract as of 0.33.5.16.12.

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

## Guardrails

Strict guardrails currently enforce `lists.workspace`. Tags and Developer Example descriptors are inventoried and delivered through the descriptor pipeline, but their protected views are not strict-converted surfaces in this closeout.

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

The inventory below is current for 0.33.5.16.12. `strict` means the static guardrail fails on declarative-surface violations. `reported` means the view is known to the inventory but is not strict-converted in this slice.

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
| Notes | notes | notes.html | - | reported |
| Notifications | notifications | notifications.html | - | reported |
| Reporting | reporting | reporting.html | - | reported |
| Search | search | search.html | - | reported |
| Tags | tags | tags.html | tags.management | reported |
| Tasks | tasks | tasks.html | - | reported |
| Tasks Settings | tasks-settings | tasks-settings.html | - | reported |
| Time Entries | time-entries | time-entries.html | - | reported |
| Time Tracker | time-tracker | time-tracker.html | - | reported |
| Time Tracking Settings | time-tracking-settings | time-tracking-settings.html | - | reported |
| User Admin | user-admin | user-admin.html | - | reported |
| User Settings | user-settings | user-settings.html | - | reported |
| Workbench | workbench | workbench.html | - | reported |
| Workspace Settings | workspace-settings | workspace-settings.html | - | reported |
