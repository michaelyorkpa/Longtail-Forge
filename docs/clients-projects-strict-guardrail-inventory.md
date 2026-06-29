# Clients/Projects Strict Guardrail Inventory

Current as of 0.33.5.18.14.5. Clients and Projects strict enforcement is active for `client-projects.clients` and `client-projects.projects`. These surfaces use minimal protected hosts, framework-rendered page/read anatomy, slide-out filter surfaces, descriptor row-selection checkbox anatomy, secondary-row tag display, icon-only repeated edit controls, shared bulk-toolbar shell regions, service-owned hierarchy ordering, and fail-on-violation guardrails for the converted page path.

This inventory records the active strict boundary for the Clients and Projects page conversion without changing routes, write payloads, permissions, schema, or workflow behavior.

## Inventoried Surfaces

| Surface | Current Owner | Future Framework-Owned Anatomy | Clients/Projects-Owned Meaning |
| --- | --- | --- | --- |
| Clients page host | Minimal `views/protected/clients.html` host plus descriptor render in `public/js/clients-projects.js`. | Page header, status, filters, hierarchy/list/table shell, row-selection checkbox shell, page action, row action placement, empty/loading/error states. | Business-only Client availability, readable Client labels, Client status/tag filtering, Add/Edit Client opener, save/refresh behavior. |
| Projects page host | Minimal `views/protected/projects.html` host plus descriptor render in `public/js/clients-projects.js`. | Page header, status, filters, hierarchy/list/table shell, row-selection checkbox shell, page action, row action placement, empty/loading/error states. | Project hierarchy display data, Personal/Family project-only scope, workspace project behavior, readable Project and Client labels, Add/Edit Project opener, save/refresh behavior. |
| Shared Clients/Projects browser adapter | `public/js/clients-projects.js` | Descriptor mounting, registered module-action behavior handlers, option-source hydration, related list/table/action shells, shared bulk-toolbar shell calls, and shared table/list/index/action shell calls where descriptors cannot express the fragment. | Route calls, selected IDs, allowed bulk action controls, query-param openers, editor field bodies, related-row shaping, billing defaults, task-default editors, tag assignment, parent selectors, payload construction, validation, refresh/focus callbacks. |
| Module manifest | `src/modules/client-projects/module.js` | `viewSurfaces` descriptors for `client-projects.clients` and `client-projects.projects`; strict guardrails now fail if framework-owned page anatomy, inline top filters, standalone Tags columns, or text repeated row actions return. | Module permissions, workspace capability gates, link/tag/file/search contributions, and module-owned behavior IDs. |
| Read routes | `/api/clients`, `/api/projects`, `/api/client-projects` | Descriptor `dataSource` calls and option-source mounting only. | Server-owned filtering, hierarchy ordering, permission pruning, readable labels, Business-only Client scope, Personal/Family project scope, option payloads. |

## Framework-Owned Guardrail Candidates

Strict enforcement fails reintroduced hand-built anatomy for:

- Protected page hosts and page-header/status shells.
- Inline top filter panels, filter field grids, sidebar/drawer placement, and filter status/empty states.
- Hierarchy index/list shells, table wrappers, table headers/cells, secondary tag rows, and display-only hierarchy indentation.
- Related table/list shells.
- Page action placement, dense row action placement, icon-only repeated table edit controls, and modal action/footer placement where the shared helper can express the shell.
- Bulk-toolbar shell, selected-count placement, row-selection checkbox shell, and framework-owned toolbar status anatomy.
- Empty/loading/error/status shells.
- Minimal host script ordering for `view-builder.js`, `view-renderer.js`, and the Clients/Projects adapter.

## Allowed Clients/Projects Escape Hatches

Strict enforcement continues allowing Clients/Projects-owned code for:

- Canonical read/write route calls to `/api/clients`, `/api/projects`, and `/api/client-projects`.
- Server-owned data shaping, filtering, paging decisions, permission pruning, hierarchy ordering, and readable labels.
- Client/project hierarchy rules, parent/reparent validation, cycle prevention, archived-parent behavior, and workspace-level Project behavior.
- Billing metadata/default editors and Project task-default editors.
- Tag assignment and tag picker behavior; descriptors may render chip display but do not own assignment semantics.
- Query-param openers such as `?client=`, `?project=`, `?addClient=true`, and `?addProject=true`.
- Business-only Client availability and Personal/Family project-only scope.
- Bulk selected-ID collection, allowed Client/Project bulk actions, Project Client reassignment options, billing/status payloads, confirmations, granular route calls, partial-failure messaging, refresh behavior, and Business-only Client reassignment gating.
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

## 0.33.5.18.14.3 Bulk Controls and Selection Behavior

This slice moves Client and Project bulk-control chrome into shared shells without moving bulk workflow meaning into the framework:

- the Clients and Projects descriptors declare table `selection` metadata, and `public/js/shared/view-renderer.js` owns the selectable-row checkbox anatomy plus stable `data-view-row-select` hooks.
- Clients and Projects mount before-table descriptor regions for bulk controls, and `public/js/clients-projects.js` registers `client-projects.clients.bulk` and `client-projects.projects.bulk` behavior handlers for those regions.
- bulk toolbars render through `LongtailForge.view.createBulkActionToolbar()` while the Clients/Projects adapter still owns the toolbar body controls.
- selected Client and Project IDs, allowed status/billing/Client-reassignment choices, confirmations, granular `/api/clients/:id` and `/api/projects/:id` route calls, partial-failure messages, refresh behavior, and audit/search/event side effects remain Clients/Projects-owned.
- Business workspaces may expose Project Client reassignment. Personal and Family workspaces must not show Client reassignment controls or submit Client IDs from bulk Project updates.
- this slice does not add bulk endpoints, strict fail-on-violation guardrails, hierarchy move/reparent behavior, route changes, schema changes, or write-payload changes.

## 0.33.5.18.14.4 Hierarchy Ordering and Reparent Safety

This slice keeps hierarchy rules in Clients/Projects service and editor paths while the converted read pages remain descriptor-mounted:

- `/api/projects` uses service-owned Projects read ordering: workspace-level Projects sort first, then Client-backed Projects group by readable Client hierarchy, and Projects sort parent-before-child inside each group with alphabetical secondary ordering.
- the converted Projects page consumes the ordered `/api/projects?include_depth=true` read model; browser code may render descriptor rows but is not the canonical hierarchy sort source for the page.
- descriptor row actions and query openers continue to route through registered Add/Edit behavior handlers that open the existing Client/Project editors.
- existing Client/Project editors remain the reparent entry points, including readable parent selectors, move confirmation, and validated route payloads.
- Project move planning continues to reject cycles, self-parenting, archived parent Projects, archived Client targets, and cross-Client or cross-workspace parent assignments.
- Business-only Client behavior, Personal/Family workspace-level Project behavior, workspace Project parent options, and Project Client derivation remain Clients/Projects-owned.
- this slice does not add drag/drop hierarchy editing, new routes, schema changes, new write payloads, strict fail-on-violation guardrails, filter/sidebar cleanup, secondary-row tag display, or icon-only repeated row actions.

## 0.33.5.18.14.5 Strict Guardrails and Cleanup

This slice promotes Clients and Projects from reporting-only descriptors to strict declarative surfaces without moving business meaning into the framework:

- Clients and Projects filters render through the shared left-side slide-out filter surface instead of the previous inline top Filters panel.
- `client-projects.clients` and `client-projects.projects` remove the standalone Tags table column and render tag chips through descriptor secondary table rows under the record context columns.
- repeated Client and Project table edit controls use the shared icon-only edit action with accessible labels and titles; the repeated action-column control no longer renders text.
- `public/js/clients-projects.js` no longer keeps the legacy page-table, top-filter, or standalone bulk-dialog fallback path for converted Clients/Projects pages.
- strict guardrails now fail if protected page anatomy, inline top filter panels, standalone Tags columns, text-based repeated table actions, legacy table/list chrome, or static page bulk dialog shells return outside descriptors/shared helpers.
- framework-owned cleanup remains limited to descriptor mounting, data binding, row-selection anatomy, filter drawer placement, secondary tag-row anatomy, action-column button anatomy, shared bulk-toolbar shell placement, related read shells, and registered behavior dispatch.
- Clients/Projects continues to own option hydration, selected IDs, allowed bulk controls, route calls, payloads, confirmations, partial-failure messaging, dialog bodies, tag picker behavior, billing/default editors, parent selectors, hierarchy validation, readable labels, query-param openers, refresh hooks, and workspace gating.
- there are no database schema, route payload, permission, or workflow changes.

## Not In Scope

- No route, schema, permission, write-payload, workflow, billing, tag-assignment, or hierarchy mutation changes.
- No persistent Inspector, dashboard-style detail pane, inline editor redesign, or drag/drop hierarchy editing.
- No framework ownership of Client records, Project records, tag assignment, billing defaults, task defaults, or permission semantics.
