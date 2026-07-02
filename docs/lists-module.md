# Lists Module Developer Guide

This document describes the current Lists implementation as of 0.33.5.21.2. It is a developer handoff for the first-party `lists` module, not a product Help page and not a future Workbench or Knowledge Base design.

## Module Boundaries

Lists is a first-party workflow module registered by `src/modules/lists/module.js`. The module owns list-specific schema, migrations, routes, service methods, repository reads/writes, access-policy helpers, search indexer shape, and the protected Lists browser workspace.

The framework owns module registration, route mounting, protected view serving, app-shell navigation, permissions, tags, search persistence, file storage, audit logging, internal events, Help discovery, and module enablement. Lists consumes those framework services through declarations and service calls instead of adding parallel storage or UI systems.

Important files:

- `src/modules/lists/module.js`: manifest, permissions, Help declarations, searchable/taggable/attachable declarations, navigation, settings, and event metadata.
- `src/modules/lists/lists.routes.js`: authenticated browser API routes mounted under `/api/lists`.
- `src/modules/lists/lists.service.js`: workflow boundary for list lifecycle, items, reusable lists, catalog suggestions, linked records, search sync, audit, and events.
- `src/modules/lists/lists.repo.js`: module-owned SQL for Lists tables only.
- `src/modules/lists/access-policy.js`: Lists permissions, resource definitions, operation mapping, access decisions, and lifecycle sanitization.
- `src/modules/lists/storage-contract.js`: stable list types, statuses, item purchase statuses, context validation, and storage constants.
- `src/modules/lists/search-indexers.js`: `lists.records` search indexer.
- `public/js/lists.js` and `views/protected/lists.html`: protected browser workspace and UI behavior.

## Workspace Labels

The stable module ID is `lists`. Shared code, permissions, database tables, API routes, audit records, events, search declarations, tag targets, file targets, and Help IDs use Lists terminology.

Workspace-facing labels adapt by workspace type:

- Business workspaces show Procurement Lists.
- Personal and family workspaces show Shopping Lists.
- Framework and module contracts still use the stable `lists` ID.

Business workspaces can associate a list with a client and project. Selecting a project derives the client from the project. Personal and family workspaces hide client controls, keep lists workspace scoped, and allow workspace projects as optional list context.

## Core Records

Primary list storage lives in `lists`:

- Identity and scope: `list_id`, `workspace_id`, optional `client_id`, optional `project_id`, creator/updater fields.
- Content and state: title, description, list type, status, reusable marker, source list lineage, completion/finalization/archive/delete timestamps.
- Resume-safe context: progress and resume context are derived at read time rather than stored as a separate Lists-owned resume table.

List item storage lives in `list_items`:

- Identity and ownership: `list_item_id`, `workspace_id`, `list_id`, creator/updater fields.
- Execution fields: item name, quantity, unit, needed-by date, assigned user, vendor, notes, estimated cost, actual cost, tracking ID, sort order.
- Progress fields: checked timestamp/user, completed timestamp/user, deleted timestamp, and purchase/order status.

Checking, completing, and receiving an item are separate states. A purchase status of `received` does not automatically check or complete the item.

## List Statuses

Lists use these statuses:

- `active`: normal editable working list.
- `completed`: finished list that can be reopened.
- `finalized`: read-only historical record for reproducible work such as a bill of materials.
- `archived`: historical record kept out of normal browsing.
- `deleted`: soft-deleted record hidden from normal reads.

Finalized lists are read-only for normal item and list edits. Users can duplicate finalized or bill-of-materials-style lists into active working copies when they have duplicate permission.

## Reusable Lists And Catalog Suggestions

Reusable lists are normal `lists` rows marked with `is_reusable`. They are not live parents. Duplicating a reusable list creates an independent active list and snapshots useful item structure while resetting checked/completed state, actual costs, tracking IDs, and purchase/order status.

Catalog-backed item suggestions live in `list_item_catalog`. Suggestions are explicit catalog rows or explicitly saved reusable items, not automatic learning from every manual item entry. Ranking is deterministic and scoped by workspace, list type, project/client context, use count, and recency.

Historical list items snapshot values from catalog suggestions. Later catalog edits update future suggestions and do not rewrite existing list items.

Catalog item create/update history uses the `list_item_catalog` audit record type and `lists.catalog_item.created` / `lists.catalog_item.updated` lifecycle events. Catalog audit/event payloads must stay permission-safe and should not expose raw item URLs or private catalog metadata.

## Index Queries

The Lists service owns index filtering, sorting, progress summaries, linked-record context, reusable-list views, and catalog suggestion ranking. Browser code sends query intent to `/api/lists` and renders the returned canonical payload instead of rebuilding the authoritative list view locally.

The default Lists index is active, non-reusable working lists. Explicit service-owned filters support list status, list type, reusable lists, business client/project context, assigned list items, needed-by dates, linked records, and Tags/No Tags through the framework tag service.

Deterministic sorts are service-owned. Supported ordering includes recent activity, needed-by date, incomplete/progress count, title, type, status, finalized date, and reusable/source context ordering. Permission checks happen before labels, links, tags, source context, progress summaries, or catalog suggestions are returned.

As of 0.33.5.20.4, Lists index rows use the shared visible-record batch helper for enrichment. After readable rows are selected, the service batches list item progress, linked-record rows, linked target summaries, source-list context, and framework tag decoration by visible `list_id` values instead of reading those relationships once per row. Lists still owns the meaning of progress, source context, linked-record availability, and resume context; the framework helper only standardizes visible-ID batching and row grouping.

## Linked Records

Linked records live in `list_links`. Initial supported target types are task, note, project, and business-workspace client.

Link creation, removal, and reads check both list access and linked-target access. A user who can read a list does not automatically gain access to a linked note, task, project, client, file, ticket, or future Knowledge Base record.

Readable linked targets return permission-safe summaries with type, ID, label, module ID, source URL, and role. Inaccessible linked targets can remain present as unavailable placeholders without exposing labels or URLs.

Linked tasks provide execution context without turning list items into task records. Linked notes provide reference context without making notes checklist storage.

The protected Lists workspace uses a picker-based task link flow for task targets. It loads readable active task labels from the Tasks API, writes the selected task ID into the Lists-owned link payload, and keeps raw record ID entry only for non-task target types.

## Resume-Safe Context

Lists expose derived `progress` and `resumeContext` payloads for future framework-owned resume state:

- `progress.totalItemCount`
- `progress.checkedItemCount`
- `progress.completedItemCount`
- `progress.nextUncheckedItemLabel`
- `progress.earliestNeededByDate`
- `progress.lastActivityAt`
- `resumeContext.sourceUrl`
- permission-safe linked-record summaries

This data is safe for future Workbench/resume consumers, but Lists does not own Workbench ranking, `work_resume_state` storage, or resume API routes.

Deleted lists should not appear as active resume candidates. Completed, finalized, and archived lists remain useful historical context without becoming primary active work by default.

## Manifest Declarations

Lists declares these framework integration points in `module.js`:

- `permissions`, `requiredPermissions`, `defaultRolePermissions`, and `resourceDefinitions`.
- `browserApiRoutes`, `protectedViews`, `browserAssets`, navigation, and a module-status setting.
- `viewSurfaces[0]` with the `lists.workspace` descriptor for the protected workspace shell, filters, selector, detail action strip, item form, item rows, linked-record picker/rows, and create/edit modal anatomy.
- `auditRecordTypes`, `eventTypes`, and lifecycle event declarations.
- `taggableTypes` for list tags through the framework tag service.
- `searchableTypes` using the `lists.records` indexer.
- `attachableTypes` using the framework file service.
- `publicApiRoutes`, `publicApiEndpoints`, and the `lists:read` scope for read-only public Lists access.
- `help.sections` and `help.articles` for current-state product Help.

Lists declares read-only public API routes for list summaries and list detail reads. Lists write routes, item mutations, reusable-list operations, catalog management, finalization, timer sources, dashboard cards, workbench cards, and notification events are not public API surfaces in the current release.

The Lists descriptor defines framework-owned placement and action metadata. `public/js/lists.js` still owns filtered reads, canonical detail hydration, Business client/project controls, Personal/Family scope behavior, item/link payloads, validation, task-picker binding, and the API calls behind workflow behaviors.

## Search, Tags, And Files

Search is framework-owned. Lists registers `lists.records`, returns normalized search documents, and requests persistence through `searchIndexSyncService`. Lists must not write directly to `search_index` or SQLite FTS tables.

Tags are framework-owned. Lists declares a `list` taggable target so permitted users can assign workspace tags through the shared tag service. Tags classify records for retrieval and grouping; they do not drive permissions, status, visibility, billing, or module behavior.

Files are framework-owned. Lists declares an attachable `list` target so file storage, download routes, permission checks, lifecycle events, and shared attachment behavior stay in the file framework.

## Help

Lists contributes current-state product Help through `help.sections` and `help.articles` in the module manifest. Help covers usage, items, statuses, reusable lists, business context, linked records, search/tags/files, and resume context.

Help content should explain implemented workflows and module boundaries. Roadmap promises, future Workbench behavior, and user-authored operational knowledge belong in `ROADMAP.md`, future framework work, or the future Knowledge Base module.

## What Lists Should Not Own

Lists should not own:

- Framework permission storage, role sync, or module enablement.
- Global navigation chrome, app shell rendering, or protected view serving.
- Global search routes, search persistence, FTS storage, or search results UI.
- Tag definitions, tag propagation, effective-tag computation, or tag permissions.
- File storage, upload/download routes, scanner/quarantine state, or shared file UI.
- Audit infrastructure, notification delivery, or internal event dispatch.
- Help Center chrome, Help search indexing, or user-authored Knowledge Base content.
- Workbench ranking, framework resume-state storage, or resume API routes.
- Generic notes, bookmarks, inventory, purchasing, accounting, vendor management, manufacturing, or ERP behavior.
