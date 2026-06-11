# Lists Module Developer Guide

This document describes the current Lists implementation as of 0.33.4.8.1. It is a developer handoff for the first-party `lists` module, not a product Help page and not a future Workbench or Knowledge Base design.

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

Business workspaces can associate a list with a client and project. Selecting a project derives the client from the project. Personal and family workspaces reject client/project list context.

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

## Linked Records

Linked records live in `list_links`. Initial supported target types are task, note, project, and business-workspace client.

Link creation, removal, and reads check both list access and linked-target access. A user who can read a list does not automatically gain access to a linked note, task, project, client, file, ticket, or future Knowledge Base record.

Readable linked targets return permission-safe summaries with type, ID, label, module ID, source URL, and role. Inaccessible linked targets can remain present as unavailable placeholders without exposing labels or URLs.

Linked tasks provide execution context without turning list items into task records. Linked notes provide reference context without making notes checklist storage.

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
- `auditRecordTypes`, `eventTypes`, and lifecycle event declarations.
- `taggableTypes` for list tags through the framework tag service.
- `searchableTypes` using the `lists.records` indexer.
- `attachableTypes` using the framework file service.
- `help.sections` and `help.articles` for current-state product Help.

Lists does not declare public API routes, public API scopes, timer sources, dashboard cards, workbench cards, or notification events in the current release.

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
