# Clients/Projects Strict Guardrail Inventory

Current as of 0.33.5.18.14.2. Clients and Projects guardrails are reporting-only in this slice. `client-projects.clients` and `client-projects.projects` are active read descriptors with framework-rendered read anatomy and `views/protected/clients.html` plus `views/protected/projects.html` are minimal hosts, but these surfaces are not strict declarative surfaces yet.

This inventory prepares strict enforcement for the Clients and Projects page conversion without changing routes, write payloads, permissions, schema, or workflow behavior.

## Inventoried Surfaces

| Surface | Current Owner | Future Framework-Owned Anatomy | Clients/Projects-Owned Meaning |
| --- | --- | --- | --- |
| Clients page host | Minimal `views/protected/clients.html` host plus descriptor render in `public/js/clients-projects.js`. | Page header, status, filters, hierarchy/list/table shell, page action, row action placement, empty/loading/error states. | Business-only Client availability, readable Client labels, Client status/tag filtering, Add/Edit Client opener, save/refresh behavior. |
| Projects page host | Minimal `views/protected/projects.html` host plus descriptor render in `public/js/clients-projects.js`. | Page header, status, filters, hierarchy/list/table shell, page action, row action placement, empty/loading/error states. | Project hierarchy display data, Personal/Family project-only scope, workspace project behavior, readable Project and Client labels, Add/Edit Project opener, save/refresh behavior. |
| Shared Clients/Projects browser adapter | `public/js/clients-projects.js` | Descriptor mounting, registered module-action behavior handlers, option-source hydration, related list/table/action shells, and shared table/list/index/bulk/action shell calls where descriptors cannot express the fragment. | Route calls, query-param openers, editor field bodies, related-row shaping, billing defaults, task-default editors, tag assignment, parent selectors, payload construction, validation, refresh/focus callbacks. |
| Module manifest | `src/modules/client-projects/module.js` | `viewSurfaces` descriptors for `client-projects.clients` and `client-projects.projects`; future strict guardrails once remaining action/bulk/related-table cleanup completes. | Module permissions, workspace capability gates, link/tag/file/search contributions, and module-owned behavior IDs. |
| Read routes | `/api/clients`, `/api/projects`, `/api/client-projects` | Descriptor `dataSource` calls and option-source mounting only. | Server-owned filtering, hierarchy ordering, permission pruning, readable labels, Business-only Client scope, Personal/Family project scope, option payloads. |

## Framework-Owned Guardrail Candidates

Future strict enforcement may fail reintroduced hand-built anatomy for:

- Protected page hosts and page-header/status shells.
- Filter panels, filter field grids, sidebar/drawer placement, and filter status/empty states.
- Hierarchy index/list shells, table wrappers, table headers/cells, and display-only hierarchy indentation.
- Related table/list shells.
- Page action placement, dense row action placement, and modal action/footer placement where the shared helper can express the shell.
- Bulk-toolbar shell, selected-count placement, and framework-owned toolbar status anatomy.
- Empty/loading/error/status shells.
- Minimal host script ordering for `view-builder.js`, `view-renderer.js`, and the Clients/Projects adapter.

## Allowed Clients/Projects Escape Hatches

Future strict enforcement must continue allowing Clients/Projects-owned code for:

- Canonical read/write route calls to `/api/clients`, `/api/projects`, and `/api/client-projects`.
- Server-owned data shaping, filtering, paging decisions, permission pruning, hierarchy ordering, and readable labels.
- Client/project hierarchy rules, parent/reparent validation, cycle prevention, archived-parent behavior, and workspace-level Project behavior.
- Billing metadata/default editors and Project task-default editors.
- Tag assignment and tag picker behavior; descriptors may render chip display but do not own assignment semantics.
- Query-param openers such as `?client=`, `?project=`, `?addClient=true`, and `?addProject=true`.
- Business-only Client availability and Personal/Family project-only scope.
- Save payload construction, validation, confirmations, refresh/focus callbacks, audit/search/event side effects, and permission implications.
- Existing Add/Edit Client and Add/Edit Project dialog bodies, provided the already-converted shared modal shell/footer standard stays intact.

## 0.33.5.18.13.3 Framework-Rendered Read Anatomy

This slice renders the Clients and Projects read pages through `LongtailForge.view.renderSurface()` while preserving module-owned meaning and dialog behavior:

- `client-projects.clients` binds to `/api/clients?include_depth=true` and declares status/tag filters, hierarchy metadata, billing display fields, and tag display inputs.
- `client-projects.projects` binds to `/api/projects?include_depth=true` and declares Client/status/tag filters, hierarchy metadata, readable Client context, billing display fields, task-default bindings, and tag display inputs.
- page headers, loading/error/empty/status placement, select filters, hierarchy display, table wrappers, chip display, page Add actions, and row action placement are descriptor/framework-rendered.
- Clients/Projects-owned browser behaviors hydrate tag and Client filter options, hide/disable Client filters outside Business workspaces, call the existing Add/Edit dialog API, preserve query-param openers after descriptor render, and refresh the descriptor surface after saves.
- The `/api/client-projects` route remains available for existing dialog and cross-module option workflows; it is not the new page read source of truth.
- `clients.html` and `projects.html` are minimal hosts that load `view-builder.js`, `view-renderer.js`, and the Clients/Projects adapter in that order.
- These minimal hosts still leave the canonical list routes, `/api/clients` and `/api/projects`, as the page read sources.

## 0.33.5.18.14.1 Action Registration Cleanup

This slice normalizes the remaining Add/Edit action path without changing the Clients/Projects dialog workflows:

- descriptor page Add/Edit actions and `?client=`, `?project=`, `?addClient=true`, and `?addProject=true` query openers dispatch through `LongtailForge.moduleActions.open(...)`.
- `public/js/shared/module-actions.js` owns the first-party `clients.add`, `clients.edit`, `projects.add`, and `projects.edit` action metadata.
- `public/js/clients-projects.js` publishes `LongtailForge.clientProjectDialog` as the module-owned dialog API consumed by the shared module action registry.
- the adapter keeps a fallback from those action IDs to the existing module-owned `openAddClientAction`, `openEditClientAction`, `openAddProjectAction`, and `openEditProjectAction` implementations for early-load or standalone use.
- the duplicate page-level Add Client compatibility shell, duplicate Add Client submit path, and adapter-level first-party action registration blocks are removed.
- dialog bodies, tag pickers, billing and task-default editors, parent selectors, payload construction, validation, save routes, refresh callbacks, and host-context completion remain Clients/Projects-owned.

## 0.33.5.18.14.2 Related Table and Detail Regions

This slice moves related Client/Project read context into shared shells without adding page-level detail state:

- Client detail reads mount a related Projects region through `LongtailForge.view.createCollapsibleIndexPanel()`, `createListShell()`, `createDataTable()`, and `createDetailActionStrip()`.
- related Project rows preserve display-only hierarchy metadata, readable Project labels, status, billing summary, task-default summary, tag display, and the existing Project editor action.
- the Project editor's Client and Parent Project context rows render through shared list/table/action helpers while dispatching Edit/Add actions through the canonical module-action bridge.
- Clients/Projects still owns related-row shaping, readable Client/Project labels, billing/task-default summaries, tag chip content, and allowed row actions.
- save, archive, parent/reparent, billing, tags, task defaults, reminders, audit, search, and permission behavior stay on existing Clients/Projects route/service paths.
- this slice does not add a persistent Inspector-style detail pane, selected-row dashboard, new route, schema change, or bulk-control conversion.

## Not In Scope

- No `client-projects.clients` or `client-projects.projects` strict enforcement yet.
- 14.3 remains responsible for bulk-control shell conversion.
- No route, schema, permission, write-payload, workflow, billing, tag-assignment, or hierarchy mutation changes.
- No persistent Inspector, dashboard-style detail pane, inline editor redesign, or drag/drop hierarchy editing.
- No framework ownership of Client records, Project records, tag assignment, billing defaults, task defaults, or permission semantics.
