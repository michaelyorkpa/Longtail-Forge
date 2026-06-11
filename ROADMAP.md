# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.33.4 - Shopping / Procurement Lists Module

Decision:
Lists are a first-party operational list module for shopping, procurement, packing, supplies, parts, bill of materials, and checklist-style item tracking. Lists should support both one-off use and reusable workflows without becoming a general-purpose bookmarks, notes, inventory, or ERP module.

Reusable Lists and reusable item suggestions are part of the first design pass. Historical lists should remain useful as records of what was bought, packed, ordered, or used, especially for business/R&D workflows where a prior list may become the basis for a repeatable build or bill of materials.

### Questions and Design Clarifications

* [ ] Should `received` automatically check/complete a list item, or should receiving and checking remain separate user actions?
* [ ] Should finalized lists be strictly read-only except for duplicate/archive/restore actions, or should users with `lists.finalize` also be able to make correction edits with an audit trail?
* [ ] Should item suggestions be created automatically from repeated manual entries in the first release, or should the first release only suggest explicit catalog-backed items?
* [ ] Should reusable lists appear in the normal list index by default with a clear badge, or should the default index hide them behind a Reusable Lists filter/view?
* [ ] For business workspaces, should project-linked lists infer the client from the project and lock it, or allow users to choose client first and then filter projects?

Use the following decisions for the Lists module:

1. Receiving and checking/completion should remain separate.
   - Setting an item purchase/order status to `received` should not automatically mark the item checked/completed.
   - Keep purchase/order status and checked/completed state separate in the data model and API.
   - The UI may offer a convenience action such as "Receive and check off," but no silent automatic completion.

2. Finalized lists should be read-only in the first release.
   - Allow view, duplicate, archive, and restore actions.
   - Do not allow `lists.finalize` to imply correction-edit permission.
   - If finalized correction edits are added later, use a separate permission such as `lists.correct_finalized` and require an audit trail/change reason.

3. Item suggestions in the first release should only come from explicit/catalog-backed or explicitly saved reusable items.
   - Do not automatically generate suggestions from repeated manual entries in v1.
   - Leave room for future opt-in learned suggestions with normalization, dedupe rules, workspace scope, ignore/delete controls, and thresholds.

4. Reusable lists should not appear in the normal active list index by default.
   - Put them behind a dedicated Reusable Lists/Templates view or filter.
   - When shown, display a clear "Reusable" badge.
   - Primary action should be something like "Create list from reusable list."

5. In business workspaces, project-linked lists should infer and lock the client from the selected project.
   - The UI may let users choose client first to filter the project picker.
   - Once `project_id` is selected, derive `client_id` from the project.
   - Server-side validation should reject mismatched `client_id` / `project_id` combinations.

### Implementation Sub-Versions

Use these sub-versions as the implementation order for the Lists module. The detailed checklist below remains the source backlog; each sub-version owns the relevant checklist items and should be closed out with package version, changelog, decisions, and verification when implemented.

#### Version 0.33.4.8 - Use Case Coverage, Help, Verification, and Release Closeout

* [x] Verify personal/family workflows: grocery list, household shopping list, trip packing list, family project supply list, reusable grocery starter, reusable packing list, item suggestions, and shared item checking.
* [x] Verify business workflows: project parts list, R&D purchasing list, office supply list, on-site visit checklist, client/project procurement checklist, reusable project parts starter, reusable on-site checklist, finalized BOM-style list, and historical duplication.
* [x] Add or update Help Center content for Lists without turning Help into roadmap documentation.
* [x] Update developer/module docs where Lists exercises framework module contracts.
* [x] Run focused Lists service/API/UI tests.
* [x] Run focused permission, event, audit, search/tag/file integration tests where those integrations ship.
* [x] Run `npm run check`.
* [x] Run `npm run test:permissions`.
* [x] Run SQLite integrity check after Lists migrations and destructive lifecycle tests.
* [x] Verify `/api/app-info` reports the completed Lists closeout version.
* [x] Move completed roadmap sections to `ROADMAP-ARCHIVE.md` according to the existing release process.
* [x] Add Help content explaining how Lists work with Tasks, Notes, Files, Projects, Search, and reusable workflows.
* [x] Verify that list workflows support capture, execution, interruption, resumption, completion, duplication, and historical review.
* [x] Verify that empty, completed, finalized, archived, and deleted states provide useful next actions instead of dead ends.

* [x] Verify Lists expose enough safe state for future Workbench/resume use.
  * [x] Active incomplete lists expose progress.
  * [x] Interrupted lists expose last updated activity.
  * [x] Linked lists expose permission-safe task/project/client/note context.
  * [x] Finalized and archived lists remain useful historical context without appearing as active work by default.
  * [x] Deleted lists do not appear as resume candidates.

### Detailed Requirements Backlog

* Add Lists as an official first-party module.

  * [x] Module ID should be `lists`.
  * [x] Module should ship with Longtail Forge.
  * [x] Module should be enable/disable capable per workspace.
  * [x] Module should use framework-owned services for users, workspaces, permissions, module lifecycle, audit logging, events/hooks, search, tags, and notifications where available.
  * [x] Do not hard-code Lists behavior into framework-owned app shell, search, notification, file, tag, or permission services.
  * [x] Disabled Lists module should block new writes while preserving historical reads if `historicalReadAccess` is enabled.
  * [x] Lists should not replace Notes.
  * [x] Lists should not replace Tasks.
  * [x] Lists should not replace Files.
  * [x] Lists should not become a generic bookmarks/information-database module in the first pass.
  * [x] Lists should not become inventory, purchasing, accounting, vendor management, manufacturing, or ERP software in 0.33.4.

* Define workspace-aware module labels.

  * [x] Underlying module ID remains `lists` regardless of workspace type.
  * [x] Personal/family workspaces should label the module as `Shopping Lists`.
  * [x] Business workspaces should label the module as `Procurement Lists`.
  * [x] Shared code, permissions, API scopes, events, and database tables should use stable Lists terminology instead of label-specific Shopping/Procurement naming.
  * [x] UI copy may adapt based on workspace type.
  * [x] Do not create separate `shopping` and `procurement` modules.

* Define core list record model.

  * [ ] Add `lists` table.
  * [ ] Suggested fields:

    * [ ] `list_id`
    * [ ] `workspace_id`
    * [ ] `client_id` optional
    * [ ] `project_id` optional
    * [ ] `title`
    * [ ] `description`
    * [ ] `list_type`
    * [ ] `status`
    * [ ] `is_reusable`
    * [ ] `source_list_id` optional
    * [ ] `duplicated_from_list_id` optional
    * [ ] `created_by_user_id`
    * [ ] `updated_by_user_id`
    * [ ] `finalized_by_user_id` optional
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `completed_at` optional
    * [ ] `finalized_at` optional
    * [ ] `archived_at` optional
    * [ ] `deleted_at` optional
    * [ ] `metadata_json`

  * [ ] Every list must belong to one workspace.
  * [ ] Lists may optionally belong to one client in business workspaces.
  * [ ] Lists may optionally belong to one project.
  * [ ] A project-linked list must not cross workspace boundaries.
  * [ ] A project-linked list must not reference a project outside its client relationship.
  * [ ] Client linking should be hidden or unavailable in personal/family workspaces.
  * [ ] Keep list ownership simple in the first pass.
  * [ ] Do not support nested lists in 0.33.4.
  * [ ] Do not support complex list inheritance in 0.33.4.

* Define list item record model.

  * [ ] Add `list_items` table.
  * [ ] Suggested fields:

    * [ ] `list_item_id`
    * [ ] `workspace_id`
    * [ ] `list_id`
    * [ ] `catalog_item_id` optional
    * [ ] `item_name`
    * [ ] `quantity`
    * [ ] `unit`
    * [ ] `needed_by_date` optional
    * [ ] `vendor_name` optional
    * [ ] `url` optional
    * [ ] `estimated_cost` optional
    * [ ] `actual_cost` optional
    * [ ] `purchase_status`
    * [ ] `tracking_id` optional
    * [ ] `notes` optional
    * [ ] `assigned_user_id` optional
    * [ ] `created_by_user_id`
    * [ ] `updated_by_user_id`
    * [ ] `checked_at` optional
    * [ ] `checked_by_user_id` optional
    * [ ] `completed_at` optional
    * [ ] `completed_by_user_id` optional
    * [ ] `sort_order`
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `deleted_at` optional
    * [ ] `metadata_json`

  * [ ] Default `assigned_user_id` to the item creator where appropriate.
  * [ ] Items inherit workspace context from their parent list.
  * [ ] Items cannot move across workspace boundaries.
  * [ ] Items should support manual sort order.
  * [ ] Items should support checked/completed state.
  * [ ] Checking an item should not require the whole list to be completed.
  * [ ] Deleting a list item should soft-delete it where consistent with existing module behavior.
  * [ ] Do not make list items separately taggable in the first pass.
  * [ ] Do not attach timers directly to list items in the first pass.
  * [ ] Do not make list items full task records in the first pass.
  * [ ] List items copied from reusable item suggestions should store their own snapshot values.
  * [ ] Updating a reusable/catalog item later should not rewrite old list items.

* Define list types.

  * [ ] Start with:

    * [ ] `shopping`
    * [ ] `procurement`
    * [ ] `packing`
    * [ ] `supplies`
    * [ ] `parts`
    * [ ] `checklist`
    * [ ] `bill_of_materials`

  * [ ] Personal/family workspaces should default to `shopping`.
  * [ ] Business workspaces should default to `procurement`.
  * [ ] Packing lists should be available in both personal/family and business workspaces.
  * [ ] `checklist` is for lightweight list completion, not task checklists.
  * [ ] `parts` is for project/client/workbench part lists, not inventory management.
  * [ ] `bill_of_materials` is for reproducible historical or production-oriented item lists.
  * [ ] Do not add `bookmarks` as a list type in 0.33.4.
  * [ ] Do not build procurement approvals, purchase orders, inventory, receiving, vendor management, or manufacturing production runs in 0.33.4.

* Define list statuses.

  * [ ] Start with:

    * [ ] `active`
    * [ ] `completed`
    * [ ] `finalized`
    * [ ] `archived`
    * [ ] `deleted`

  * [ ] Active lists are normal editable lists.
  * [ ] Completed lists remain readable and may be reopened by permitted users.
  * [ ] Finalized lists represent reproducible historical records, such as a bill of materials or completed R&D/prototype order list.
  * [ ] Finalized lists should be read-only or mostly read-only for normal users.
  * [ ] Finalized lists may be duplicated into a new active list.
  * [ ] Archived lists are hidden from normal browsing but remain historically available to permitted users.
  * [ ] Deleted lists are soft-deleted unless a future retention policy allows hard delete.
  * [ ] Do not use tags as the source of truth for list status.

* Define list item purchase/order statuses.

  * [ ] Start with:

    * [ ] `needed`
    * [ ] `planned`
    * [ ] `ordered`
    * [ ] `received`
    * [ ] `cancelled`
    * [ ] `not_needed`

  * [ ] `needed` should be the default item status.
  * [ ] `ordered` may use tracking ID where available.
  * [ ] `received` may also mark the item checked/completed if that is the least surprising behavior.
  * [ ] Cancelled and not-needed items should remain visible unless filtered out.
  * [ ] Do not build a full order-management workflow in 0.33.4.

* Add Reusable Lists.

  * [ ] Allow permitted users to mark a list as reusable.
  * [ ] UI label should be `Reusable List`.
  * [ ] Internal field may be `is_reusable`.
  * [ ] Reusable Lists are normal list records that can be duplicated as starting points for future lists.
  * [ ] Reusable Lists should be useful for:

    * [ ] Grocery list starters.
    * [ ] Household shopping list starters.
    * [ ] Trip packing lists.
    * [ ] On-site visit packing/checklists.
    * [ ] Project parts starters.
    * [ ] Office supply lists.
    * [ ] R&D procurement starters.
    * [ ] Bill of materials starters.

  * [ ] Reusable Lists should not behave as live parents for duplicated lists.
  * [ ] Duplicating a Reusable List should create an independent list instance.
  * [ ] Editing a Reusable List after duplication should not mutate previous duplicated lists.
  * [ ] Reusable Lists may be active, archived, or deleted.
  * [ ] Reusable Lists should not usually be finalized unless the user deliberately wants a reusable finalized reference.
  * [ ] Reusable Lists should be filterable from the list index.
  * [ ] Reusable Lists should be clearly labeled in the UI.
  * [ ] Do not create a separate `list_templates` table unless implementation strongly favors it.
  * [ ] Prefer keeping reusable behavior on the `lists` table unless Codex identifies a cleaner existing module pattern.

* Add list duplication.

  * [ ] Allow permitted users to duplicate any accessible list.
  * [ ] Duplicating a list should create a new independent list record.
  * [ ] Duplicating should copy:

    * [ ] List title, with a safe generated title such as `Copy of {title}` or user-provided title.
    * [ ] Description.
    * [ ] List type.
    * [ ] Client/project context where permitted.
    * [ ] Items.
    * [ ] Item names.
    * [ ] Quantities.
    * [ ] Units.
    * [ ] Needed dates where appropriate.
    * [ ] Vendor/store.
    * [ ] URL.
    * [ ] Estimated cost.
    * [ ] Notes.
    * [ ] Assigned user where appropriate.
    * [ ] Sort order.

  * [ ] Duplicating should reset by default:

    * [ ] List status to `active`.
    * [ ] Item checked/completed state.
    * [ ] Item completed timestamps.
    * [ ] Item completed users.
    * [ ] Actual cost unless the duplication mode deliberately preserves it.
    * [ ] Purchase/order status back to `needed` or another safe default.
    * [ ] Tracking ID.

  * [ ] Duplicating a finalized list or bill of materials should preserve enough item detail to reproduce the work.
  * [ ] Duplicating a finalized list should still create a new active list by default.
  * [ ] Store `duplicated_from_list_id` on the new list where useful.
  * [ ] Do not create a live sync relationship between the source list and duplicated list in 0.33.4.
  * [ ] A future duplicate-exactly option may preserve checked state, actual costs, and purchase statuses, but this is not required in the first pass.

* Add reusable item catalog/suggestions.

  * [x] Add `list_item_catalog` table or equivalent service-owned reusable item table.
  * [x] Catalog items are workspace-scoped.
  * [x] Catalog items should not be shared across workspaces in 0.33.4.
  * [ ] Suggested fields:

    * [x] `catalog_item_id`
    * [x] `workspace_id`
    * [x] `item_name`
    * [x] `normalized_name`
    * [x] `quantity` optional
    * [x] `unit` optional
    * [x] `vendor_name` optional
    * [x] `url` optional
    * [x] `estimated_cost` optional
    * [x] `notes` optional
    * [x] `list_type` optional
    * [x] `created_by_user_id`
    * [x] `updated_by_user_id`
    * [x] `use_count`
    * [x] `last_used_at` optional
    * [x] `created_at`
    * [x] `updated_at`
    * [x] `archived_at` optional
    * [x] `metadata_json`

  * [x] Catalog items should support item autocomplete/suggestions.
  * [x] Catalog items may be tied to list types.
  * [x] Catalog items may be reused across lists in the same workspace.
  * [x] Creating a list item from a catalog item should copy values into the new list item.
  * [x] The list item remains the historical source of truth for that list.
  * [x] Updating a catalog item should not rewrite historical list items.
  * [x] Do not create global/shared item catalogs in 0.33.4.
  * [x] Do not build SKU, inventory, or vendor catalog management in 0.33.4.

* Add item usage tracking.

  * [x] Track item usage so Lists can suggest likely items for future lists.
  * [x] Usage tracking should be workspace-scoped.
  * [x] Usage tracking should consider list type.
  * [x] Usage tracking may consider client/project context in business workspaces.
  * [x] Add `list_item_usage` table if useful, or maintain usage metrics on `list_item_catalog` if that is sufficient for 0.33.4.
  * [ ] Suggested usage fields if using a separate table:

    * [ ] `list_item_usage_id`
    * [ ] `workspace_id`
    * [ ] `catalog_item_id`
    * [ ] `list_id`
    * [ ] `list_type`
    * [ ] `client_id` optional
    * [ ] `project_id` optional
    * [ ] `used_at`
    * [ ] `checked_at` optional
    * [ ] `completed_at` optional
    * [ ] `metadata_json`

  * [x] Track when catalog-backed items are added to lists.
  * [ ] Track when repeated manually-entered item names appear often enough to suggest catalog creation.
  * [ ] Do not require users to manually maintain a catalog before suggestions become useful.

* Add item suggestion ranking.

  * [x] Suggest items based on current workspace only.
  * [x] Prioritize items that frequently appear on recent lists.
  * [x] Prioritize items that match the current list type.
  * [x] Prioritize items that match current client/project context where applicable.
  * [x] Prioritize recently used items.
  * [ ] Down-rank items that were recently dismissed, cancelled, or marked not needed if dismissal tracking exists.
  * [x] First version may use a simple deterministic scoring function.
  * [ ] Example behavior: if `Milk` appeared on 5 of the last 8 shopping lists, it should rank near the top of suggested items for a new shopping list.
  * [x] Do not require machine learning or AI suggestions in 0.33.4.
  * [x] Keep suggestion behavior explainable and testable.

* Add bill of materials behavior.

  * [ ] Add `bill_of_materials` as a first-class list type.
  * [ ] Bill of materials lists should support business/R&D workflows where old lists become reproducible build records.
  * [ ] BOM-style lists should preserve historical item names, quantities, vendors, URLs, estimated costs, actual costs, and notes.
  * [ ] BOM-style lists may be finalized when they represent a known reproducible build.
  * [ ] Finalized BOM lists should be protected from casual edits.
  * [ ] Finalized BOM lists should be duplicate-able into a new active list.
  * [ ] Finalized BOM lists should remain searchable and historically readable by permitted users.
  * [ ] BOM behavior should not become inventory management in 0.33.4.
  * [ ] BOM behavior should not support multi-level assemblies, production runs, stock counts, or automatic purchasing in 0.33.4.

* Add generic list links.

  * [x] Add `list_links` table.
  * [x] Suggested fields:

    * [x] `list_link_id`
    * [x] `workspace_id`
    * [x] `list_id`
    * [x] `linked_module_id`
    * [x] `linked_record_type`
    * [x] `linked_record_id`
    * [x] `link_role`
    * [x] `created_by_user_id`
    * [x] `created_at`
    * [x] `removed_at` optional
    * [x] `metadata_json`

  * [x] Lists should be linkable to tasks.
  * [x] Lists should be linkable to notes.
  * [x] Lists should be linkable to projects.
  * [x] Lists should be linkable to clients in business workspaces.
  * [x] Client linking should be unavailable or hidden in personal/family workspaces.
  * [ ] Future supported linked records may include tickets, files, and Knowledge Base articles.
  * [x] List links must not cross workspace boundaries.
  * [x] Linked-record reads must respect the linked module's permissions.
  * [x] List access should not automatically grant access to linked notes, tasks, projects, clients, files, tickets, or KB articles.
  * [x] Linked-record metadata shown on list pages must be permission-safe.

* Add Lists permissions.

  * [ ] `lists.view`
  * [ ] `lists.view_all`
  * [ ] `lists.create`
  * [ ] `lists.update`
  * [ ] `lists.complete`
  * [ ] `lists.finalize`
  * [ ] `lists.archive`
  * [ ] `lists.restore`
  * [ ] `lists.delete`
  * [ ] `lists.duplicate`
  * [ ] `lists.manage_items`
  * [ ] `lists.manage_reusable`
  * [ ] `lists.manage_catalog`
  * [ ] `lists.manage_links`
  * [ ] `lists.manage_settings`
  * [ ] List reads must validate workspace, module state, and permissions.
  * [ ] List writes must validate workspace, module state, and permissions.
  * [ ] Item writes require access to the parent list.
  * [ ] Duplicating a list requires read access to the source list and create permission in the destination workspace.
  * [ ] Finalizing a list requires explicit finalize permission.
  * [ ] Managing reusable lists requires explicit reusable-list permission or normal list update permission where appropriate.
  * [ ] Managing catalog items requires explicit catalog permission or safe automatic catalog-upsert behavior.
  * [ ] Workspace admins should be able to manage all lists in their workspace unless a future private-list mode is added.
  * [ ] Do not add private/user-only lists in 0.33.4 unless already supported by the permission model.

* Add Lists resource definition.

  * [ ] Resource key: `lists`.
  * [ ] Supported operations:

    * [ ] `read`
    * [ ] `create`
    * [ ] `update`
    * [ ] `complete`
    * [ ] `finalize`
    * [ ] `archive`
    * [ ] `restore`
    * [ ] `delete`
    * [ ] `duplicate`
    * [ ] `manage_items`
    * [ ] `manage_reusable`
    * [ ] `manage_catalog`
    * [ ] `manage_links`
    * [ ] `manage`

* Add Lists audit record types.

  * [ ] `list`
  * [ ] `list_item`
  * [ ] `list_item_catalog`
  * [ ] `list_item_usage`
  * [x] `list_link`
  * [x] Audit list creation, updates, completion, finalization, archive/restore, deletion, duplication, reusable-list changes, item creation, item updates, item check/uncheck, item completion, item status changes, item deletion, catalog item creation/update, usage tracking where appropriate, and list link creation/removal.
  * [ ] Audit records should include workspace ID, actor user ID, list ID, item ID where applicable, safe title/item metadata, status, list type, and timestamps.
  * [ ] Audit records should not expose unsafe URL metadata or private linked-record details to unauthorized users.

* Add Lists lifecycle events.

  * [ ] `lists.list.created`
  * [ ] `lists.list.updated`
  * [ ] `lists.list.completed`
  * [ ] `lists.list.reopened`
  * [ ] `lists.list.finalized`
  * [ ] `lists.list.archived`
  * [ ] `lists.list.restored`
  * [ ] `lists.list.deleted`
  * [ ] `lists.list.duplicated`
  * [ ] `lists.list.marked_reusable`
  * [ ] `lists.list.unmarked_reusable`
  * [ ] `lists.item.created`
  * [ ] `lists.item.updated`
  * [ ] `lists.item.checked`
  * [ ] `lists.item.unchecked`
  * [ ] `lists.item.completed`
  * [ ] `lists.item.deleted`
  * [ ] `lists.catalog_item.created`
  * [ ] `lists.catalog_item.updated`
  * [x] `lists.link.created`
  * [x] `lists.link.removed`
  * [ ] Event payloads should include workspace ID, actor user ID, list ID, item ID where applicable, source list ID where applicable, safe title/item metadata, status, list type, context IDs where safe, and timestamps.
  * [ ] Event payloads should not include unsafe URL previews, hidden linked-record details, or private metadata.

* Add Lists indexes.

  * [ ] Workspace + list ID.
  * [ ] Workspace + status.
  * [ ] Workspace + list type.
  * [ ] Workspace + reusable flag.
  * [ ] Workspace + source list ID.
  * [ ] Workspace + duplicated from list ID.
  * [ ] Workspace + client ID.
  * [ ] Workspace + project ID.
  * [ ] Workspace + created by user ID.
  * [ ] Workspace + updated at.
  * [ ] Workspace + finalized at.
  * [ ] List items by workspace + list ID + sort order.
  * [ ] List items by workspace + list ID + purchase status.
  * [ ] List items by workspace + assigned user ID.
  * [ ] List items by workspace + needed by date.
  * [ ] Catalog items by workspace + normalized name.
  * [ ] Catalog items by workspace + list type.
  * [ ] Catalog items by workspace + usage count.
  * [ ] Catalog items by workspace + last used at.
  * [ ] Usage records by workspace + catalog item ID.
  * [ ] Usage records by workspace + list type + used at.
  * [ ] List links by workspace + list ID.
  * [ ] List links by workspace + linked module/type/record ID.

* Add Lists service methods.

  * [ ] Create list.
  * [ ] Read one list.
  * [ ] List lists.
  * [ ] Update list.
  * [ ] Complete list.
  * [ ] Reopen list.
  * [ ] Finalize list.
  * [ ] Archive list.
  * [ ] Restore list.
  * [ ] Soft-delete list.
  * [ ] Mark list reusable.
  * [ ] Unmark list reusable.
  * [ ] Duplicate list.
  * [ ] Create list item.
  * [ ] Update list item.
  * [ ] Reorder list items.
  * [ ] Check list item.
  * [ ] Uncheck list item.
  * [ ] Complete list item.
  * [ ] Delete list item.
  * [ ] Create or update catalog item.
  * [ ] Suggest catalog items.
  * [ ] Track catalog item usage.
  * [ ] Link list to record.
  * [ ] Remove list link.
  * [ ] List linked records.
  * [ ] Validate list access.
  * [ ] Validate item access through parent list.
  * [ ] Validate linked record access.
  * [ ] Generate search indexing payload.
  * [ ] Emit safe lifecycle events.

* Add browser API routes.

  * [ ] `GET /api/lists`
  * [ ] `POST /api/lists`
  * [ ] `GET /api/lists/:listId`
  * [ ] `PUT /api/lists/:listId`
  * [ ] `POST /api/lists/:listId/complete`
  * [ ] `POST /api/lists/:listId/reopen`
  * [ ] `POST /api/lists/:listId/finalize`
  * [ ] `POST /api/lists/:listId/archive`
  * [ ] `POST /api/lists/:listId/restore`
  * [ ] `POST /api/lists/:listId/delete`
  * [ ] `POST /api/lists/:listId/mark-reusable`
  * [ ] `POST /api/lists/:listId/unmark-reusable`
  * [ ] `POST /api/lists/:listId/duplicate`
  * [ ] `GET /api/lists/:listId/items`
  * [ ] `POST /api/lists/:listId/items`
  * [ ] `PUT /api/lists/:listId/items/:itemId`
  * [ ] `POST /api/lists/:listId/items/reorder`
  * [ ] `POST /api/lists/:listId/items/:itemId/check`
  * [ ] `POST /api/lists/:listId/items/:itemId/uncheck`
  * [ ] `POST /api/lists/:listId/items/:itemId/complete`
  * [ ] `POST /api/lists/:listId/items/:itemId/delete`
  * [x] `GET /api/lists/item-suggestions`
  * [x] `GET /api/lists/catalog-items`
  * [x] `POST /api/lists/catalog-items`
  * [x] `PUT /api/lists/catalog-items/:catalogItemId`
  * [x] `GET /api/lists/:listId/links`
  * [x] `POST /api/lists/:listId/links`
  * [x] `POST /api/lists/:listId/links/:linkId/remove`

* Add Lists navigation and protected views.

  * [ ] Add Lists navigation only when module is enabled.
  * [ ] Use workspace-aware label in navigation.
  * [ ] Add list index page.
  * [ ] Add list detail page.
  * [ ] Add create list form.
  * [ ] Add edit list form.
  * [ ] Add duplicate list workflow.
  * [ ] Add Reusable Lists filter/view.
  * [ ] Add list item add/edit controls.
  * [x] Add item suggestion/autocomplete controls.
  * [ ] Add item check/uncheck controls.
  * [ ] Add reorder controls.
  * [ ] Add list status controls.
  * [ ] Add finalize controls for bill of materials and historical production/R&D lists.
  * [x] Add linked-record panel.
  * [ ] Add disabled-module state.
  * [ ] Add loading, empty, error, permission-denied, active, completed, finalized, archived, and deleted states.
  * [ ] Keep layout consistent with existing authenticated module pages.

* Add list index workflow.

  * [ ] Show title.
  * [ ] Show description excerpt where useful.
  * [ ] Show list type.
  * [ ] Show status.
  * [ ] Show Reusable List indicator where applicable.
  * [ ] Show client/project context where applicable.
  * [ ] Show linked-record indicators where useful and permission-safe.
  * [ ] Show item progress.
  * [ ] Example: `7 / 12 complete`
  * [ ] Show estimated total cost where useful.
  * [ ] Show actual total cost where useful.
  * [ ] Show updated date.
  * [ ] Show finalized date where applicable.
  * [ ] Add filters for:

    * [ ] Status
    * [ ] List type
    * [ ] Reusable Lists
    * [ ] Client
    * [ ] Project
    * [ ] Assigned user
    * [ ] Needed by date
    * [ ] Archived state

  * [ ] Add sort by updated date, title, list type, status, needed by date, and finalized date.
  * [ ] Add pagination if the existing UI pattern expects it.

* Add list detail workflow.

  * [ ] Show title, description, type, status, reusable indicator, client/project context, created date, updated date, finalized date, and item progress.
  * [ ] Show list items in sort order.
  * [ ] Allow permitted users to add, edit, reorder, check, uncheck, complete, and delete items.
  * [ ] Allow permitted users to update quantity, unit, needed date, vendor/store, URL, estimated cost, actual cost, purchase status, tracking ID, notes, and assigned user.
  * [x] Show item suggestions while adding items.
  * [ ] Show estimated and actual cost totals.
  * [ ] Show purchase/order status clearly on business/procurement lists.
  * [ ] Show finalized/BOM state clearly when applicable.
  * [ ] Allow permitted users to duplicate the list.
  * [ ] Allow permitted users to mark/unmark a list as reusable.
  * [ ] Allow permitted users to manage linked records.
  * [ ] Keep personal shopping list UI simple and fast.
  * [ ] Avoid forcing business procurement fields into the primary personal/family shopping flow.
  * [ ] Finalized lists should prevent normal edits unless the user has permission to reopen or modify finalized records.

* Add personal/family use case coverage.

  * [x] Grocery list.
  * [x] Household shopping list.
  * [x] Trip packing/shopping list.
  * [x] Family project supply list.
  * [x] Reusable grocery list starter.
  * [x] Reusable packing list.
  * [x] Workspace-scoped grocery item suggestions.
  * [x] Shared list item checking should work cleanly for family-style workflows.
  * [x] UI should not feel overly procurement-heavy in personal/family workspaces.

* Add business use case coverage.

  * [x] Project parts list.
  * [x] R&D purchasing list.
  * [x] Office supply list.
  * [x] On-site visit packing/checklist.
  * [x] Client/project procurement checklist.
  * [x] Reusable on-site checklist.
  * [x] Reusable project parts starter.
  * [x] Bill of materials for reproducible R&D/prototype work.
  * [x] Finalized BOM-style historical list.
  * [x] Business UI should expose vendor/store, needed date, estimated cost, actual cost, purchase status, tracking ID, assignment, client/project context, and linked records clearly.
  * [x] Do not build purchase approvals, purchase orders, receiving, inventory, vendor catalogs, accounting export, production runs, or multi-level BOM assemblies in 0.33.4.

* Add Lists framework integrations.

  * [x] Lists should support tags once tagging integration is stable.
  * [x] Lists should be searchable once framework search integration is stable.
  * [ ] List records should be eligible for dashboard/activity feed events later.
  * [x] Lists should be available as a future attachment target if Files supports module attachments generically.
  * [ ] Lists should be available as a future note-link target if Notes supports module record linking generically.
  * [ ] Lists should be available as a future task-link target if Tasks supports module record linking generically.
  * [x] Lists should not require search, tags, dashboard activity, files, or notes integration to ship the first usable MVP.

* Add focused contract regressions.

  * [x] Lists cannot cross workspace boundaries.
  * [x] List items cannot cross workspace boundaries.
  * [x] List items cannot belong to a list in another workspace.
  * [x] Project-linked lists cannot reference projects outside the active workspace.
  * [x] Client-linked lists are hidden or blocked in personal/family workspaces.
  * [x] List links cannot cross workspace boundaries.
  * [x] List access does not grant unauthorized access to linked records.
  * [x] Disabled Lists module blocks new writes.
  * [x] Workspace-aware labels do not change the underlying module ID.
  * [x] Users without list read permission cannot read lists.
  * [x] Users without list write permission cannot create or update lists.
  * [x] Users without item management permission cannot add, edit, check, uncheck, reorder, or delete list items.
  * [x] Users without duplicate permission cannot duplicate lists.
  * [x] Users without finalize permission cannot finalize lists.
  * [x] Checking one item does not complete the whole list unless all-items-complete behavior is deliberately implemented.
  * [x] Duplicating a list resets checked/completed state by default.
  * [x] Duplicating a list creates an independent list, not a live synced child.
  * [x] Editing a Reusable List does not mutate previous duplicated lists.
  * [x] Updating a catalog item does not rewrite historical list items.
  * [x] Item suggestions are scoped to the current workspace only.
  * [x] Item suggestions prefer recent and frequent items from matching list types.
  * [x] Finalized lists are protected from casual edits.
  * [x] Finalized bill of materials lists remain duplicate-able.
  * [x] Archived lists are hidden from normal browsing but remain available to permitted historical reads.
  * [x] Deleted lists and deleted items are soft-deleted where consistent with existing module behavior.
  * [x] List events emit safe payloads.
  * [x] Lists do not replace Notes, Tasks, Files, Search, or Knowledge Base records.

## Version 0.33.5.0 - Task Module QoL Updates

### Task Next Action and Resume Metadata

Decision:
Tasks should carry enough plain-language context for Dashboard, Workbench, notifications, search, and future resume state to explain what the user can do next without guessing from title/status/due date alone.

- [ ] Add optional `next_action` field to tasks.
  - [ ] Keep it short and plain-language.
  - [ ] Example: "Send draft invoice to CTU."
  - [ ] Show it in the task detail dialog.
  - [ ] Include it in task API responses where the user can read the task.
  - [ ] Include it in task search/resume-safe payloads where appropriate.

- [ ] Add optional `blocked_reason` field to tasks.
  - [ ] Show when task status is `blocked`.
  - [ ] Prompt for it when moving a task to `blocked`, but do not hard-require it in the first pass unless implementation is simple.
  - [ ] Include it in safe task summaries for Workbench and notifications.

- [ ] Add optional `resume_note` or `handoff_note` field to tasks.
  - [ ] This is the human-written "where I left off" field.
  - [ ] Example: "Waiting on CTU to confirm PO number; invoice draft is otherwise ready."
  - [ ] Keep it separate from the full task description.
  - [ ] Include it in task detail and permission-safe task reads.
  - [ ] Do not auto-generate this in 0.33.5.0.

- [ ] Add task activity timestamps useful for resume ranking.
  - [ ] `last_worked_at` may be stored or derived, but the service should expose a normalized value.
  - [ ] Timer start/pause/finalize, checklist changes, task edits, status changes, linked notes, and file attachments may update/derive it later.
  - [ ] Do not make Workbench ranking depend on browser-local timestamps.

- [ ] Update task checklist payloads to expose progress.
  - [ ] Total checklist item count.
  - [ ] Completed checklist item count.
  - [ ] Next incomplete checklist item label where permitted.
  - [ ] Do not make checklist items full Workbench records.

- [ ] Add task service/API regression coverage.
  - [ ] `next_action`, `blocked_reason`, and `resume_note` survive create/update/read.
  - [ ] Blocked tasks can safely expose blocked reason.
  - [ ] Completed/archived tasks remain readable without becoming active resume candidates by default.
  - [ ] Private/inaccessible linked context is not leaked through task summary payloads.

### Task Metadata Update

- [ ] Inside the task details (Edit Task Modal), completed and archived tasks should display "Time to completion" which is calculated from created date/time and completed date/time
  - This number should be usable by reporting module for efficiency numbers

### Recurrence Update

- [ ] Add Weekdays and Weekends to Frequency options, below Daily
  - Weekdays means Monday, Tuesday, Wednesday, Thursday, Friday
  - Weekends means Saturday, Sunday
  - Daily means 7 days a week

### Task Checklists

Decision: Task checklists are lightweight completion aids inside a task. Full subtasks are separate task records and should be deferred until the Tasks module needs parent-child task planning, dependencies, or nested assignment workflows.

- [ ] Add lightweight checklist support to Tasks.
  - [ ] Checklist items belong to a single task.
  - [ ] Checklist items are not full subtasks.
  - [ ] Checklist items should support:
    - [ ] Checklist item ID
    - [ ] Workspace ID
    - [ ] Task ID
    - [ ] Label/title
    - [ ] Checked/completed state
    - [ ] Completed at
    - [ ] Completed by user ID
    - [ ] Sort order
    - [ ] Created at
    - [ ] Updated at
  - [ ] Allow permitted users to add, edit, reorder, check, uncheck, and delete checklist items.
  - [ ] Display checklist progress on the task detail view.
    - [ ] Example: `3 / 7 complete`
  - [ ] Optionally show checklist progress on task cards/list rows after the task UI is cleaned up.
  - [ ] Do not make checklist items separately taggable in the first pass.
  - [ ] Do not make checklist items separately assignable in the first pass.
  - [ ] Do not attach timers directly to checklist items in the first pass.
  - [ ] Do not treat checklist items as dependencies or project schedule records.

### Parent/Child Tasks

- [ ] Add parent/child task relationships
  - [ ] Prevent circular references
  - [ ] Parent tasks can be part of different projects, but, within Business workspaces, must be part of the same client
    - Should this be an adjustable setting within the workspace? Should you only be allowed to pull from the same project/client for parent tasks? I can see this being a useful setting, but I'm open to ideas.
  - [ ] Child tasks can be markable as "blocking"
    - If a child is marked as blocking, and incomplete, it sets the status of parent tasks to "blocked" until the child task is completed
      - Before moving parent tasks to In Progress, logic should check that no other blocking child tasks are incomplete

### Task UI

In Projects -> Tasks, the task list isn't optimized for efficient viewing.
- [ ] Create a three row listing for each task
  - [ ] Row one is the task name with tag chips below (Kept tight)
  - [ ] Row two is the rest of the meta data (Very Tight)
    - [ ] Truncate Scope/Assignees harder on mobile
  - [ ] Row three is the buttons, right aligned
    - The icon buttons are great, except for the "Follow Notifications" button, this should be a bell
  - [ ] No horizontal rules/borders for these 3 rows, to keep it as tight as possible

## Version 0.33.5.2 - Client/Projects Fixes, Listing/View Ownership and Availability Refinement

### Version 0.33.5.2.0 - Client/Projects Fixes

- Projects aren't inheriting client billing settings when created in Projects -> Project Settings -> Add Project

- Saving Client billing settings wipes out client tags
  - Specific path I took was:
    - Settings -> Workspace -> Clients -> Add Client button
      - Added the client and tags
    - Edited the client to turn off billing and turn on rounding
    - Saved client
    - Tags gone
    - Re-adding tags through Edit Client modal worked

### Version 0.33.5.2.1 - Canonical client and project list payloads

* [ ] Move client/project list shaping into the `client-projects` module so every UI surface, picker, embedded panel, and public API read uses the same permission-safe query contract instead of reimplementing sort/filter/tree logic in browser code.

  * [ ] Own canonical filtering, hierarchy shaping, display-label metadata, and sorting in the client/projects service layer.
  * [ ] Browser code may cache returned payloads for the current page/dialog, but should not own canonical client/project ordering rules.
  * [ ] Prefer enhancing the existing `/api/clients`, `/api/projects`, `/api/client-projects`, `/api/v1/clients`, and `/api/v1/projects` contracts instead of adding a separate “sorting” endpoint unless implementation strongly favors a dedicated options route.
  * [ ] Public API responses should reuse the same underlying query helpers but return a stable external contract with API-key scopes, pagination, and no browser-only fields.

* [ ] Add canonical client list behavior.

  * [ ] Default filter: `status=Active`.
  * [ ] Explicit filters: `status=Active|Inactive|All`.
  * [ ] Supported shapes:

    * [ ] `shape=flat&scope=top_level`: top-level clients only, alphabetical by display name.
    * [ ] `shape=tree`: top-level clients alphabetical, with child clients nested below each parent alphabetically.
    * [ ] `shape=flat&include_depth=true`: flattened tree order for selects/dropdowns, including `depth`, `parent_client_id`, and safe display-label metadata.
  * [ ] Preserve workspace and permission boundaries before sorting/shaping.
  * [ ] Include stable IDs, parent IDs, status, display name, depth/path metadata where useful, and optional tag metadata where the caller requests it.

* [ ] Add canonical project list behavior.

  * [ ] Default filters:

    * [ ] `status=Active`.
    * [ ] `client=All`.
  * [ ] Explicit filters:

    * [ ] `status=Active|Inactive|Completed|All`.
    * [ ] `client=All|<client_id>|workspace`.
  * [ ] Supported shapes:

    * [ ] `shape=flat`: alphabetical project list, optionally filtered by client/workspace scope.
    * [ ] `shape=tree`: parent projects alphabetical, with child projects nested below each parent alphabetically.
    * [ ] `shape=flat&include_depth=true`: flattened tree order for selects/dropdowns, including `depth`, `parent_project_id`, `client_id`, and safe display-label metadata.
  * [ ] Project queries must support workspace-level projects in personal/family workspaces and business workspaces where `client_id` is empty.
  * [ ] Preserve readable-project filtering before sorting/shaping.

* [ ] Add regression coverage.

  * [ ] Active defaults.
  * [ ] Inactive/all client filters.
  * [ ] Inactive/completed/all project filters.
  * [ ] Top-level-only client/project views.
  * [ ] Nested tree views.
  * [ ] Flattened picker labels and depth values.
  * [ ] Permission filtering before shaping.
  * [ ] Orphan/cycle-safe behavior.
  * [ ] Public API pagination.
  * [ ] Workspace-type differences between business, personal, and family workspaces.
  * [ ] Existing pages stop relying on page-local client/project sorting helpers once canonical payloads are available.

### Version 0.33.5.2.2 - Canonical Task Query and Work Item Summary Payloads

- [ ] Move task filtering/sorting used by Tasks, Dashboard, and Workbench into the Tasks service layer.
  - [ ] Supported filters:
    - [ ] Assigned to current user.
    - [ ] Due today.
    - [ ] Next due.
    - [ ] Due this week.
    - [ ] Overdue.
    - [ ] In progress.
    - [ ] Blocked.
    - [ ] Has running/paused timer.
    - [ ] Recently updated/worked.
    - [ ] Project.
    - [ ] Client for Business workspaces.
    - [ ] Tags / no tags where tag contract supports it.
  - [ ] Supported sorts:
    - [ ] Due date/time.
    - [ ] Priority.
    - [ ] Status.
    - [ ] Last worked.
    - [ ] Recently updated.
    - [ ] Project/client context.

- [ ] Add normalized task work item summary payload.
  - [ ] This should be usable by Tasks list, Dashboard summaries, Workbench, and future resume state.
  - [ ] Suggested fields:
    - [ ] `source_module_id`
    - [ ] `source_type`
    - [ ] `source_id`
    - [ ] `source_label`
    - [ ] `source_url`
    - [ ] `title`
    - [ ] `description_excerpt`
    - [ ] `client_id`
    - [ ] `client_name`
    - [ ] `project_id`
    - [ ] `project_name`
    - [ ] `status`
    - [ ] `priority`
    - [ ] `due_date`
    - [ ] `due_time`
    - [ ] `due_at`
    - [ ] `assignee_ids`
    - [ ] `assigned_to_current_user`
    - [ ] `next_action`
    - [ ] `blocked_reason`
    - [ ] `handoff_note`
    - [ ] `checklist_progress`
    - [ ] `timer_status`
    - [ ] `elapsed_seconds`
    - [ ] `last_worked_at`
    - [ ] `updated_at`

- [ ] Keep ranking deterministic.
  - [ ] Do not add AI ranking in this release.
  - [ ] Do not make browser-local sorting the source of truth for Workbench behavior.

### Version 0.33.5.2.3 - Task list filtering/sorting/options

Task list filtering/sorting/options. The tasks service already returns tasks plus options, but the browser still owns status/client/project/tag filtering and multi-mode sorting. That should become a canonical task query contract, especially before tasks become the center of Workbench/Dashboard views.

### Version 0.33.5.2.4 - Task/client/project picker options

tasksService.readOptions returns visible active clients/projects/users, but the client/project option ordering and indentation still happen in browser code. That should reuse the new client-projects canonical option payload.

### Version 0.33.5.2.5 - Notes linked-record panels and collection trees

This is already mostly headed the right direction: /api/notes/for-target and /api/notes/collections exist, and the roadmap already says the reusable notes panel should use /api/notes/for-target rather than duplicating lookup logic inside Tasks, Clients, Projects, or Tickets. Keep leaning into that.

### Version 0.33.5.2.6 - Files attachment lists/counts

Files attachment lists/counts. There are canonical attachment and count endpoints already, but as Files gets more UI surface area, attachment list sorting/filtering/pagination should stay service-owned instead of each detail page making its own “files attached to this thing” logic.

### Version 0.33.5.2.7 - Lists module index filters/sorts and item suggestions

The Lists roadmap already calls for API-supported filters/sorts and deterministic suggestion ranking. Keep those server/module-owned from day one; do not let the Lists browser UI become the canonical source for list ordering or suggestions.

### Version 0.33.5.2.8 - Tags filters and bulk tag assignment

Your 0.33.5.6 note already has the right instinct: “No Tags” and bulk tag assignment should be owned by Tags/framework hooks, not hard-coded per module. That is the same pattern.

### Version 0.33.5.2.9 - API Key cleanup

Verify public API key permissions exist for read/write of all framework and first-party modules. Currently the set is very limited.

- Audit the API keys available
  - It doesn't appear that I'm seeing the correct API Keys. I checked both Workspace and Super admin accounts. Here's what shows:
    - clients:read
    - projects:read
    - tasks:read
    - tasks:write
    - time_entries:read
    - time_entries:write
  - There's nothing for files, search, notes or anything else in there. And there's no write for clients or projects
  - Place updated ROADMAP to address missing API keys in 0.33.5.3.x

## Version 0.33.5.4 - Files and Time Tracking QoL Updates

### Files module

- There's no way to delete files?!
- Multiple file upload at once
- Drag and Drop file upload

- Need to have a way to limit file uploads, per workspace and per user
  - This would be quantity/size limits
  - This would be file types

### Time Entries

- Time entries aren't editable by Workspace admin
  - Tried to add tags as workspace admin to "81c61ec4-ebe4-45c2-a35d-b03e88b45bb9" and got a permissions error (couldn't read the whole thing, it was on the main window and the modal window blocked it)
  - Had to log in as Super Admin to add tags

- Are time entries from timers storing the actual start and end time with an unconnected duration, or are they adjusting start or end time based on total duration?
  - It should be the former. I want to see exactly when a timer was started and ended, as well as the total duration the timer was running during that period. Start and End time are informational, not anything to be calculated.

### Timer Resume Metadata

- [ ] Preserve exact timer start/end timestamps when finalizing active timers.
  - [ ] Start/end timestamps are informational facts.
  - [ ] Duration is stored separately and should not rewrite the start/end facts.

- [ ] Ensure active/paused timer payloads expose resume-safe source metadata.
  - [ ] Source module ID.
  - [ ] Source type.
  - [ ] Source record ID.
  - [ ] Source label.
  - [ ] Source URL.
  - [ ] Client/project context.
  - [ ] Timer status.
  - [ ] Last active start time.
  - [ ] Accumulated elapsed seconds.

- [ ] Emit or preserve safe timer lifecycle metadata for future resume state.
  - [ ] Timer started.
  - [ ] Timer paused.
  - [ ] Timer finalized.
  - [ ] Timer discarded.
  - [ ] Do not expose inaccessible source-record details.

## Version 0.33.5.6 - Search, Notification, and Tag QoL Updates

### Search Fixes/Tweaks

- Help is in the record types twice

### Notification Fixes/Tweaks

- Users who perform the action, don't need notifications of the action happening, e.g.
  - Creators of records don't need {{recordType}} created notifications
  - Modifiers of records don't need {{recordType}} updated notifications

- [ ] Record update notifications should include the changed context human-formatted from the event
  - [ ] Notifications should display a truncated example of the change for things like:
    - Description added
    - Task updated
    - etc.

- "Urgent" priority notifications should turn the bell icon red and, optionally, show an in-app alert modal
- "High" priority notifications should turn the bell icon red and not be grouped
- "Normal" priority should be grouped and increment the number on the bell icon
- "Low" priority should be grouped and NOT increase the number on the bell icon

- [ ] Use icons from notifications.html in the Notifications bell drop-down instead of full text buttons
  - [ ] Be sure to use hover-over titles on these icons

- [ ] Place "Read all" and "Dismiss all" text at bottom of notification bell drop-down
  - Font size should match "View all"

#### All notifications Page
- [ ] notifications.html: Notification Type chip should be aligned to right, left of "Dismissed"
- [ ] Read/Dismiss icon buttons do not have hover over titles (required for Accessibility and clarity)

- [ ] Disabled modules' preferences should be moved to the bottom of the preferences section automatically; not hard-coded by order
  - [ ] Listing of preferences should be a view provided by notification module

- [ ] Users should be able to adjust notification grouping (In notification Preferences in Settings -> User)
  - Workspace notifications cab be grouped by:
    - [ ] Client (Business Only)/Project (Default)
    - [ ] Notification type (Updated/Created/etc.)
    - [ ] Record Type

- [ ] Notification type chip is floating weird, it should be anchored just left of the Unread/Read/Dismissed chip

### Tags Fixes/Tweaks

- [ ] Anywhere there's a Tag filter, add a "No Tags" option to easily identify items that still need to be tagged
  - Should be directly below "All tags" option

- Tags should be bulk assignable/removable in the following contexts:
  - Projects -> Time Keeping -> Time Entries
    - This will require checkboxes in a tight leftmost column for this display to enable bulk editing
  - Projects -> Tasks
  - Eventually, Projects -> Notes
  - Bulk tag application should use the same/similar box to initial entry
    - This entire thing should be owned within tags and be hooked in via the framework, not hard coded anywhere

- [ ] Add tag chips between task title and task meta data on Workbench; keep it tight

### Resume-Safe Event Summary Cleanup

- [ ] Update event/notification summary helpers so user-facing changed context can be reused by activity feed and future resume state.
  - [ ] Summaries should be human-readable.
  - [ ] Summaries should be permission-safe.
  - [ ] Summaries should avoid raw audit JSON.
  - [ ] Summaries should include safe record labels, record type, module ID, action type, actor where allowed, and changed field labels where useful.

- [ ] Do not make notifications the source of truth for resume state.
  - [ ] Notifications are directed attention items.
  - [ ] Activity/resume summaries are recovery context.
  - [ ] Audit remains the admin/security truth.

## Version 0.33.5.8 - Notes Cleanup

### Notes Type Cleanup

- [ ] Reframe `note_type` as content kind, not linked-record context.
- [ ] Keep the database column name `note_type` for compatibility.
- [ ] Change the user-facing label to "Note Kind" or "Content Type".
- [ ] Keep initial content-kind values small:
  - `general`
  - `meeting`
  - `research`
  - `decision`
  - `procedure`
  - `reference`
  - `idea`
  - `log`
- [ ] Stop offering `client`, `project`, `task`, `ticket`, and `user` as new note type choices.
- [ ] Preserve legacy values in existing records and display them safely.
- [ ] There are some existing rows, but none use the deprecated type
- [ ] Use linked context and `note_links` for client/project/task/user/ticket association.
- [ ] Add regression coverage that `note_type` does not control permissions, visibility, Library bucket, collection membership, or KB publication.

### Notes Linked Record Usability

* [ ] Replace raw linked-context ID entry in Notes with a permission-safe record picker.

  * [ ] Users should be able to search/select supported link targets instead of pasting IDs.
  * [ ] Supported initial targets:

    * [ ] Workspace
    * [ ] Client
    * [ ] Project
    * [ ] Task
    * [ ] User
  * [ ] Ticket should remain reserved until the Tickets module exists.
  * [ ] Picker results must respect workspace, module state, target read permissions, and record visibility.
  * [ ] Picker results should show human labels, not only UUIDs.
  * [ ] Selecting a task should optionally infer project/client context where safe.
  * [ ] Linking a note to a task should suggest the Active Work Library bucket.
  * [ ] Linking a note to a client/project/user should suggest Ongoing Areas unless the user manually overrides the Library bucket.
  * [ ] Linking behavior must not grant note access or target-record access by itself.

* [ ] Add a reusable Notes linked-record panel/helper.

  * [ ] This should be owned by the Notes module and mounted by other modules where appropriate.
  * [ ] Inputs:

    * [ ] `targetType`
    * [ ] `targetId`
    * [ ] `clientId` optional
    * [ ] `projectId` optional
    * [ ] `readonly` optional
  * [ ] The helper should list notes linked by direct context columns and flexible `note_links` rows.
  * [ ] The helper should support:

    * [ ] View linked notes.
    * [ ] Create note for current record.
    * [ ] Link existing note.
    * [ ] Unlink note where permitted.
    * [ ] Show note visibility/security/status badges.
    * [ ] Hide private/secure/inaccessible notes without leaking counts or titles.
  * [ ] The helper should use `/api/notes/for-target` or a successor route rather than duplicating note lookup logic inside Tasks, Clients, Projects, or future Tickets.

### Task Notes Integration

* [ ] Add a Notes panel to the Task detail dialog.

  * [ ] Show notes linked to the current task.
  * [ ] Show a clear empty state: “No notes linked to this task.”
  * [ ] Allow permitted users to create a note from the task.
  * [ ] New task-created notes should:

    * [ ] Set `task_id`.
    * [ ] Set `project_id` and `client_id` from the task where available.
    * [ ] Default Library bucket to Active Work.
    * [ ] New task-created notes should:
      * [ ] Link to the task through `task_id` and/or `note_links`.
      * [ ] Set `project_id` and `client_id` from the task where available.
      * [ ] Default Library bucket to Active Work.
      * [ ] Default Note Kind / Content Type to `log` or `general`, not `task`.
      * [ ] Default visibility to `internal` unless the user chooses otherwise.
  * [ ] Allow permitted users to link an existing note to the task.
  * [ ] Allow permitted users to unlink a note from the task.
  * [ ] Do not show the panel for unsaved tasks except for a “Save the task before adding notes” state.

* [ ] Add linked-note indicators to task list rows/cards after the current task-list UI cleanup.

  * [ ] Show a compact note count where permitted.
  * [ ] Do not leak inaccessible note counts.
  * [ ] Clicking the count should open the task detail dialog and focus the Notes panel.

### Notes Display Improvements

* [ ] Replace raw linked context values in Note detail with human-readable links.

  * [ ] Client name instead of client ID.
  * [ ] Project name instead of project ID.
  * [ ] Task title instead of task ID.
  * [ ] User display name/email where allowed.
  * [ ] Fall back to safe ID display only when the target label cannot be read.

* [ ] Add linked-record navigation from Note detail.

  * [ ] Client/project/task/user links should open the appropriate record view where available.
  * [ ] Missing or inaccessible records should show a safe unavailable state.

### Notes Resume Context

- [ ] Notes should provide supporting context for resume state.
  - [ ] Active Work notes linked to tasks/projects/lists may appear as supporting context.
  - [ ] Recently edited Active Work notes may be eligible for "Pick up where I left off."
  - [ ] Normal notes should not become primary next-action candidates unless explicitly marked as Active Work or linked to active work.
  - [ ] Secure/private notes must not expose body previews, excerpts, or hidden counts in Workbench/resume contexts.
  - [ ] Linked-note panels should provide safe note count, title, status, visibility/security badges, and source URL where permitted.

### Regressions

* [ ] Notes target picker only returns records the user can read.
* [ ] Task-linked notes appear in the task Notes panel when linked through `task_id`.
* [ ] Task-linked notes appear in the task Notes panel when linked through `note_links`.
* [ ] Creating a note from a task sets task/project/client context safely.
* [ ] Private notes do not appear to unauthorized users in linked-note panels.
* [ ] Secure note bodies and previews do not appear in linked-note panels.
* [ ] Linked-note counts do not leak inaccessible notes.
* [ ] Archived notes are read-only from embedded panels.
* [ ] Disabled Notes module blocks new note/link writes but preserves historical reads where allowed.

## Version 0.33.5.9 - Work Resume State Foundation

Decision:
Work resume state is framework-owned recovery infrastructure. It records where a user left off across enabled modules without making Dashboard, Workbench, Tasks, Lists, Notes, Files, Time Tracking, or future Tickets own separate resume systems.

This release should add backend storage, service contracts, safe update hooks, and regressions only. The user-facing guided Workbench remains deferred to 0.33.7.

### Resume State Storage

- [ ] Add framework-owned `work_resume_state` storage.
- [ ] Each row represents one resumable record for one user in one workspace.
- [ ] Suggested fields:
  - [ ] `resume_state_id`
  - [ ] `workspace_id`
  - [ ] `user_id`
  - [ ] `module_id`
  - [ ] `record_type`
  - [ ] `record_id`
  - [ ] `client_id` optional
  - [ ] `project_id` optional
  - [ ] `source_url`
  - [ ] `title_snapshot`
  - [ ] `context_label_snapshot`
  - [ ] `last_action_type`
  - [ ] `last_action_label`
  - [ ] `last_worked_at`
  - [ ] `handoff_note`
  - [ ] `next_action`
  - [ ] `blocked_reason`
  - [ ] `status_snapshot`
  - [ ] `priority_snapshot`
  - [ ] `due_at_snapshot`
  - [ ] `resume_rank_hint`
  - [ ] `metadata_json`
  - [ ] `created_at`
  - [ ] `updated_at`
  - [ ] `dismissed_at` optional

### Resume State Service

- [ ] Add framework-owned resume state service.
- [ ] Add service methods:
  - [ ] `upsertResumeState(session, payload)`
  - [ ] `dismissResumeState(session, resumeStateId)`
  - [ ] `listResumeState(session, query)`
  - [ ] `removeResumeStateForRecord(workspaceId, moduleId, recordType, recordId)`
- [ ] Resume state writes must validate workspace/user ownership.
- [ ] Resume state reads must re-check record/module permissions where possible.
- [ ] Disabled modules should hide active resume candidates unless historical read access explicitly allows safe read-only context.
- [ ] Deleted records should not appear as active resume candidates.
- [ ] Archived/completed records should appear only in historical/recent contexts, not primary next-action contexts.

### Initial Resume State Producers

- [ ] Tasks should update resume state when:
  - [ ] Task is created or updated by the current user.
  - [ ] Task status changes.
  - [ ] Task timer starts, pauses, finalizes, or is discarded.
  - [ ] Task checklist changes.
  - [ ] Task `next_action`, `blocked_reason`, or `handoff_note` changes.

- [ ] Lists should update resume state when:
  - [ ] List is created or updated.
  - [ ] List item is checked/unchecked/completed/updated/reordered.
  - [ ] List is linked to or unlinked from a task/project/client/note.
  - [ ] List is completed/reopened/finalized/archived/restored/deleted.

- [ ] Notes should update resume state when:
  - [ ] Active Work note is created or edited.
  - [ ] Note is linked to a task/project/list/client.
  - [ ] Note is archived/restored/deleted.
  - [ ] Secure/private notes must not write body/excerpt content into resume state.

- [ ] Time Tracking should update resume state when:
  - [ ] Manual timer starts/pauses/finalizes/discards.
  - [ ] Sourced task timer starts/pauses/finalizes/discards.
  - [ ] Resume state should preserve source metadata without making Time Tracking own the source record.

### Resume State API

- [ ] Add protected browser API route for resume state reads.
  - [ ] Suggested route: `GET /api/work-resume`
  - [ ] Support filters:
    - [ ] `mode=recent`
    - [ ] `mode=left_off`
    - [ ] `mode=active`
    - [ ] `module_id`
    - [ ] `client_id`
    - [ ] `project_id`
    - [ ] `record_type`
  - [ ] Do not add public API routes in this release.

- [ ] Add protected browser API route to dismiss a resume candidate.
  - [ ] Suggested route: `POST /api/work-resume/:resumeStateId/dismiss`

### Regressions

- [ ] Resume state cannot cross workspace boundaries.
- [ ] Resume state cannot expose records the user can no longer read.
- [ ] Disabled modules hide active resume state safely.
- [ ] Deleted records are removed from active resume results.
- [ ] Completed/archived records are not ranked as primary active work.
- [ ] Private notes do not leak title/body/counts to unauthorized users.
- [ ] Secure notes never write decrypted body, excerpt, rendered HTML, or encryption metadata into resume state.
- [ ] List access does not grant linked task/note/project/client access through resume state.
- [ ] Task/list/note/timer updates produce deterministic resume state rows.
- [ ] Dismissed resume rows do not appear in default "left off" results.

## Version 0.33.5.10 - Help Center Re-work

- Need a way to edit and expand the help center records easily
  - Place a help directory wherever makes sense
    - Within the help directory, create directories for each first-party module
  - Take the .js that contains the help "files" and convert each help "file" to .md and place them in the appropriate spot within the help directory structure
  - In top level help/ add toc.md to build the Table of Contents on the left
    - Special processing for the toc.md:
      - The first line in the file will be the first help center page that opens (Either "Help Center or Getting Started")
      - All headings should be collapsible 
      - All headings represent a directory within the help/ structure
        - Headings should have a link behind them that allows you specify the directory name
      - Headings can be nested
      - Nested headings can also be collapsed

- Update Help Center framework module to dynamically load the toc.md and help files

### Potential Help Directory Structure

- Table of Contents (ToC) sections should be collapsible
  - Help Center
  - Getting Started
  - Framework (Collapsible)
    - Worspaces and Workspace Switching
    - Users, Roles and Permissions
    - Clients and Projects
    - Notifications
    - Search
    - Tags
    - Files
    - Settings and User Preferences
    - Modules and Optional Features
  - Time Tracking (Module, Collapsible)
    - Time Tracking Basics
    - Time Entries Editing
    - Manual Time Entries
  - Tasks (Module, Collapsible)
    - Tasks Basics
    - Task Recurrence
  - Notes (Module, Collapsible)
    - Using Notes
    - Notes Library
      - Active Work
      - Ongoing Area
      - Reference Library
      - Archive
    - Notes Collections
    - Markdown
    - Note Linking
    - Note Revisions
    - Secure Notes
    - Notes, Files, and Search

- Help Center (doc) should explain what framework, first-party, and third-party modules are
- Getting Started should explain the key concepts within LTF, how they're inter-linked, and what makes it all unique

## Version 0.33.6 - Reporting Module

- Create a reporting module

### Guidance for details in Reporting Module

- Reporting -> Time Reports
  - Hide Start Date and End Date until billing period is set to Custom
    - Alternately, update Start Date and End Date based on Billing Period Selection (currently always shows current billing period)

- For proper calculation in time/billable reports, each sub project must sum all time entries and apply rounding rules (if enabled)
  - Parent projects should then sum their direct time entries, round as appropriate, and add that to the sum of all sub project time entries
  - This will produce a sub-client total which can then be added to parent client totals in the same fashion

## Version 0.33.7 - Dashboard and Workbench Formalization as Project hub and work center

### Version 0.33.7.1 - Dashboard and Workbench Surface Contracts

- [ ] Define Dashboard as the workspace overview/orientation surface.
- [ ] Define Workbench as the active work/resumption/focus surface.
- [ ] Keep Dashboard and Workbench separate.
- [ ] Add framework-owned contribution contracts for:
  - [ ] Dashboard panels.
  - [ ] Workbench cards.
  - [ ] Focus modes.
  - [ ] Work item sources.
  - [ ] Next action candidates.
  - [ ] Resume state/context snippets.
- [ ] Remove remaining hardcoded Task/Time assumptions from Dashboard and Workbench where a module contribution can own the behavior.
- [ ] Preserve permission checks, module enabled/disabled checks, and workspace boundaries for every contribution.

### Version 0.33.7.2 - Workbench Focus Modes

- [ ] Add Workbench focus selector.
- [ ] Initial modes:
  - [ ] Pick up where I left off.
  - [ ] Today.
  - [ ] Next due.
  - [ ] This week.
  - [ ] Blocked.
  - [ ] In progress.
  - [ ] Project focus.
  - [ ] Client focus for Business workspaces.
- [ ] Each focus mode should resolve to a normalized focus context passed to module work item providers.
- [ ] Focus modes should be user-friendly labels over deterministic filters, not separate hardcoded pages.

### Version 0.33.7.3 - Next Action Candidates

- [ ] Add normalized next action candidate shape.
- [ ] Tasks should provide first next action candidates.
- [ ] Time Tracking should provide running/paused timer candidates.
- [ ] Lists should provide active/incomplete/needed-soon list candidates when Lists integrations are ready.
- [ ] Notes should provide resume/supporting-context candidates for Active Work notes when Notes integrations are ready.
- [ ] Future Tickets should provide waiting/urgent/assigned ticket candidates.
- [ ] Add deterministic ranking:
  - [ ] Running timers.
  - [ ] Paused timers.
  - [ ] Overdue assigned work.
  - [ ] Due today.
  - [ ] Blocked/stale work.
  - [ ] Recently touched work.
  - [ ] Due this week.
- [ ] Every candidate should provide a reason string, primary action, safe context label, and source URL.

### Version 0.33.7.4 - Resume State / Where I Left Off

- [ ] Add framework-owned resume state storage.
- [ ] Track per-user, per-workspace resumable records.
- [ ] Update resume state from timers, task edits, checklist changes, note edits, list item activity, file attachments, and future ticket updates.
- [ ] Workbench "Pick up where I left off" should use resume state first, then fall back to recent activity.
- [ ] Resume hints must be permission-safe and must not expose secure/private content.
- [ ] Add regressions for permission changes, disabled modules, deleted/archived records, and inaccessible linked context.

### Version 0.33.7.5 - Guided Workbench UI

- [ ] Add question-led Workbench entry:
  - [ ] "Pick up where I left off"
  - [ ] "Start with what’s due"
  - [ ] "Work this week"
  - [ ] "Review blocked work"
  - [ ] "Focus on a project"
  - [ ] "Capture something"
- [ ] Show one recommended next action before showing longer lists.
- [ ] Keep secondary lists available but visually subordinate.
- [ ] Avoid turning Workbench into another full module index.
- [ ] Add empty states that suggest a useful next step instead of dead ends.

## Version 0.34 - Knowledge Base Module

## Knowledge Base Direction Adjustment

Decision:
Knowledge Base is the reviewed, read-only knowledge layer generated from Notes first. Notes remain the working authoring records. Knowledge Base entries may still be written directly, but the default workflow is note-sourced: normal internal/workspace/client-visible notes become KB review candidates automatically, then reviewers approve and publish safe read-only KB snapshots.

### Add to 0.34.1 - Knowledge Base Module Contract, Publishing Model, and Notes Relationship

* [ ] Define Knowledge Base as the reviewed consumption layer for Notes-backed knowledge.

  * [ ] Notes are the working/source records.
  * [ ] KB articles are reviewed read-only article records or publication snapshots.
  * [ ] Normal note creation/update can automatically create or update a KB review candidate.
  * [ ] Automatic KB candidate creation does not mean automatic publishing.
  * [ ] Publishing remains explicit, permission-protected, audited, and snapshot-based.
  * [ ] KB may support directly authored articles, but direct authoring is secondary to note-sourced workflow.

* [ ] Add KB candidate/source behavior.

  * [ ] Add `source_mode` values:

    * [ ] `note_sourced`
    * [ ] `manual`
    * [ ] `imported`
  * [ ] Add `source_sync_state` or equivalent metadata:

    * [ ] `current`
    * [ ] `source_updated`
    * [ ] `manual_override`
    * [ ] `detached`
  * [ ] Add `source_note_id` convenience field only if it simplifies the common one-note article case; keep `kb_article_sources` as the canonical many-source table.
  * [ ] Add `source_note_revision_id` or use `kb_article_sources.source_revision_id` to preserve the note revision that seeded the reviewed article.
  * [ ] Add `last_source_synced_at`.
  * [ ] Add `last_reviewed_at`.
  * [ ] Add `review_due_at` optional for future maintenance workflows.

* [ ] Define automatic candidate rules.

  * [ ] Normal `internal` notes create internal KB candidates.
  * [ ] Normal `workspace` notes create workspace KB candidates.
  * [ ] Normal `client_visible` notes may create client-visible KB candidates only after client-visible KB permissions and file safety are enabled.
  * [ ] `private` notes do not create KB candidates by default.
  * [ ] `secure` notes must never create KB candidates.
  * [ ] Deleted notes should not create KB candidates.
  * [ ] Archived notes may remain as KB sources, but should not automatically update pending candidates unless explicitly configured.

* [ ] Define KB statuses for note-sourced workflow.

  * [ ] `draft`
  * [ ] `in_review`
  * [ ] `approved`
  * [ ] `published`
  * [ ] `rejected`
  * [ ] `archived`
  * [ ] `deleted`
  * [ ] Manually created articles start as `draft`.
  * [ ] Automatically note-sourced articles start as `in_review`.
  * [ ] Updating a source note marks the KB candidate/publication as `source_updated` or creates a new review revision, but does not silently mutate the published snapshot.
  * [ ] Rejected candidates remain linked to the source note for history unless deleted by a permitted user.

### Add to 0.34.2 - Knowledge Base Browser API, Editorial Workflow, and Internal UI MVP

* [ ] Add automatic note-to-KB candidate service methods.

  * [ ] Create or update candidate from note.
  * [ ] Queue note for KB review.
  * [ ] Read KB candidate by source note.
  * [ ] List KB candidates needing review.
  * [ ] Mark source update pending review.
  * [ ] Detach KB article from source note where permitted.
  * [ ] Reject KB candidate with reason.
  * [ ] Approve KB candidate.
  * [ ] Publish approved KB article snapshot.

* [ ] Add Notes lifecycle hook integration.

  * [ ] On normal note created, create KB candidate if workspace KB candidate policy allows it.
  * [ ] On normal note updated, mark linked KB candidate/publication as source-updated.
  * [ ] On note archived, preserve existing KB linkage but stop automatic updates unless configured.
  * [ ] On note deleted, hide or mark linked KB candidate as source unavailable.
  * [ ] Do not process secure notes.
  * [ ] Do not process private notes unless a future explicit rule allows it.

* [ ] Add KB review queue UI.

  * [ ] Show candidates grouped by source visibility:

    * [ ] Internal
    * [ ] Workspace
    * [ ] Client-visible when enabled
  * [ ] Show source note title, source collection path, source updated date, proposed article title, visibility, review status, and whether the source changed since last review.
  * [ ] Allow reviewers to approve, reject, edit article draft, publish, or detach.
  * [ ] Make it obvious when a published KB article is behind its source note.

### Add to 0.34.3 - Knowledge Base Search, Tags, Attachments, Static Pages, and Permission Boundaries

* [ ] Add KB article chrome/window-dressing generation.

  * [ ] Generate safe table of contents.
  * [ ] Generate “What links here.”
  * [ ] Generate related articles from article links, source notes, shared tags, shared collections, and wiki-style links.
  * [ ] Show source-note linkage only to users who can access the source note.
  * [ ] Show source update/review status only to internal users with review/history permission.
  * [ ] Hide internal source data from client-visible/public outputs.
  * [ ] Backlink lists must be permission-filtered and must not leak inaccessible article titles, note titles, files, or counts.

* [ ] Add KB link index support.

  * [ ] Track article-to-article links detected from Markdown/wiki-style links.
  * [ ] Track note-to-article references where useful.
  * [ ] Track source note-to-article relationships through `kb_article_sources`.
  * [ ] Rebuild link indexes when article Markdown, note wiki links, slugs, or source links change.
  * [ ] Broken links should be allowed but clearly labeled for reviewers.

### Add to 0.34.4 - Knowledge Base Settings, Documentation, and Closeout

* [ ] Add KB automation settings.

  * [ ] Configure note-to-KB candidate behavior:

    * [ ] Disabled
    * [ ] Manual only
    * [ ] Auto-create internal/workspace candidates
    * [ ] Auto-create client-visible candidates when supported
  * [ ] Configure default candidate status for note-sourced entries.
  * [ ] Configure whether review is always required before publishing.
  * [ ] Configure whether source note updates reopen review.
  * [ ] Configure whether archived notes can continue feeding KB candidates.
  * [ ] Settings must not bypass permissions, secure-note restrictions, private-note restrictions, file safety, or publication review.

## Version 0.35.0 - Support Tickets Framework Contract

* [ ] Add Support Tickets as a first-party workflow module.

  * [ ] Module ID should be `support-tickets`.
  * [ ] Tickets are workflow records, not framework/core records.
  * [ ] Tickets should use framework-owned services for users, workspaces, permissions, tags, search, notifications, audit logging, file attachments, events/hooks, API scopes, and module lifecycle.
  * [ ] Do not hard-code ticket behavior into framework-owned app shell, search, notification, file, or permission services.
  * [ ] Support Tickets should be disableable per workspace where appropriate.
  * [ ] Disabled ticket module should block new ticket writes while preserving historical reads if `historicalReadAccess` is enabled.

* [ ] Define ticket terminology by workspace type.

  * [ ] Business workspaces should display "Support Tickets" / "Tickets".
  * [ ] Personal and Family workspaces may display "Requests" where terminology is user-facing.
  * [ ] Terminology must be display-only.
  * [ ] Stored module IDs, route names, permission IDs, API scopes, audit record types, and database fields should remain stable.

* [ ] Define core ticket record model.

  * [ ] Add `tickets` table.
  * [ ] Suggested fields:

    * [ ] `ticket_id`
    * [ ] `workspace_id`
    * [ ] `ticket_number` or `display_key`
    * [ ] `client_id` optional
    * [ ] `project_id` optional
    * [ ] `requester_user_id` optional
    * [ ] `requester_name_snapshot`
    * [ ] `requester_email_snapshot`
    * [ ] `title`
    * [ ] `description`
    * [ ] `status`
    * [ ] `priority`
    * [ ] `category`
    * [ ] `source`
    * [ ] `visibility`
    * [ ] `assigned_user_id` optional
    * [ ] `created_by_user_id`
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `closed_at`
    * [ ] `archived_at`
    * [ ] `metadata_json`
  * [ ] Ticket records must always belong to one workspace.
  * [ ] Client/project links must belong to the same workspace as the ticket.
  * [ ] External/client-created tickets should snapshot requester name/email for historical context.

* [ ] Define ticket statuses.

  * [ ] Start with a small boring set:

    * [ ] `new`
    * [ ] `open`
    * [ ] `waiting_on_internal`
    * [ ] `waiting_on_client`
    * [ ] `resolved`
    * [ ] `closed`
    * [ ] `archived`
  * [ ] Keep status labels configurable/display-friendly later.
  * [ ] Do not make tags the source of truth for ticket status.

* [ ] Define ticket priorities.

  * [ ] Start with:

    * [ ] `low`
    * [ ] `normal`
    * [ ] `high`
    * [ ] `urgent`
  * [ ] Priority should be an explicit field.
  * [ ] Do not infer priority from tags.

* [ ] Define ticket sources.

  * [ ] Start with:

    * [ ] `internal`
    * [ ] `client_portal`
    * [ ] `public_api`
    * [ ] `import`
  * [ ] Reserve future source values:

    * [ ] `wordpress`
    * [ ] `shopify`
    * [ ] `email`
    * [ ] `webhook`
    * [ ] `automation`
  * [ ] Source should be metadata, not permission logic.

* [ ] Add ticket ledger foundation.

  * [ ] Add `ticket_entries` or `ticket_ledger_entries` table.
  * [ ] A ticket entry represents a visible ticket timeline item, not the security audit log.
  * [ ] Suggested fields:

    * [ ] `ticket_entry_id`
    * [ ] `workspace_id`
    * [ ] `ticket_id`
    * [ ] `entry_type`
    * [ ] `visibility`
    * [ ] `body`
    * [ ] `created_by_user_id`
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `deleted_at`
    * [ ] `metadata_json`
  * [ ] Entry visibility should be explicit:

    * [ ] `internal`
    * [ ] `client_visible`
  * [ ] Do not use the word `public` in code for client-visible ticket entries unless the entry is truly public internet visible.
  * [ ] Internal entries are visible only to internal users with appropriate ticket permissions.
  * [ ] Client-visible entries are visible to internal users and authorized client/external users who can access the ticket.
  * [ ] Ticket ledger entries should never replace audit logging.

* [ ] Define first ticket entry types.

  * [ ] `initial_request`
  * [ ] `client_reply`
  * [ ] `internal_note`
  * [ ] `status_change`
  * [ ] `assignment_change`
  * [ ] `priority_change`
  * [ ] `attachment_added`
  * [ ] `system_event`
  * [ ] Keep raw audit details out of normal ticket ledger display.

* [ ] Add ticket permissions.

  * [ ] `tickets.view`
  * [ ] `tickets.view_internal`
  * [ ] `tickets.create`
  * [ ] `tickets.create_for_client`
  * [ ] `tickets.reply_client_visible`
  * [ ] `tickets.add_internal_note`
  * [ ] `tickets.update`
  * [ ] `tickets.assign`
  * [ ] `tickets.close`
  * [ ] `tickets.archive`
  * [ ] `tickets.manage_settings`
  * [ ] `tickets.view_all`
  * [ ] Add client/external access checks separately from internal workspace role checks.
  * [ ] A client user should only see tickets explicitly associated with a client/project they can access.

* [ ] Add ticket resource definition.

  * [ ] Resource key: `tickets`.
  * [ ] Supported operations:

    * [ ] `read`
    * [ ] `create`
    * [ ] `update`
    * [ ] `archive`
    * [ ] `restore`
    * [ ] `assign`
    * [ ] `manage`

* [ ] Add ticket audit record types.

  * [ ] `ticket`
  * [ ] `ticket_entry`
  * [ ] Audit ticket creation, updates, assignment changes, status changes, priority changes, archive/restore, client-visible replies, internal notes, attachment links, and API-created tickets.
  * [ ] Audit records should remain admin/security records and should not be shown as the normal ticket timeline.

* [ ] Add ticket events.

  * [ ] `ticket.created`
  * [ ] `ticket.updated`
  * [ ] `ticket.assigned`
  * [ ] `ticket.status_changed`
  * [ ] `ticket.priority_changed`
  * [ ] `ticket.client_reply_added`
  * [ ] `ticket.internal_note_added`
  * [ ] `ticket.resolved`
  * [ ] `ticket.closed`
  * [ ] `ticket.archived`
  * [ ] `ticket.restored`
  * [ ] Event payloads should include workspace, actor, ticket ID, client/project IDs where applicable, safe previous/new values, source, and metadata.
  * [ ] Event payloads should leave room for future automations and integrations.

## Version 0.35.1 - Ticket Browser API and Services

* [ ] Add ticket service methods.

  * [ ] Create ticket.
  * [ ] Read one ticket.
  * [ ] List tickets.
  * [ ] Update ticket fields.
  * [ ] Assign ticket.
  * [ ] Change ticket status.
  * [ ] Change ticket priority.
  * [ ] Archive ticket.
  * [ ] Restore ticket where appropriate.
  * [ ] Add client-visible reply.
  * [ ] Add internal note.
  * [ ] List ticket ledger entries with permission-safe visibility filtering.

* [ ] Add browser API routes.

  * [ ] `GET /api/tickets`
  * [ ] `POST /api/tickets`
  * [ ] `GET /api/tickets/:ticketId`
  * [ ] `PUT /api/tickets/:ticketId`
  * [ ] `POST /api/tickets/:ticketId/assign`
  * [ ] `POST /api/tickets/:ticketId/status`
  * [ ] `POST /api/tickets/:ticketId/priority`
  * [ ] `POST /api/tickets/:ticketId/archive`
  * [ ] `POST /api/tickets/:ticketId/restore`
  * [ ] `GET /api/tickets/:ticketId/entries`
  * [ ] `POST /api/tickets/:ticketId/replies`
  * [ ] `POST /api/tickets/:ticketId/internal-notes`

* [ ] Enforce ticket API permissions.

  * [ ] Every route must validate active workspace.
  * [ ] Every ticket read must validate workspace membership or authorized client/external access.
  * [ ] Internal notes must never be returned to client/external users.
  * [ ] Client-visible replies must be visible only to users allowed to access that ticket.
  * [ ] Update/assign/status/priority actions must require explicit permissions.
  * [ ] Disabled ticket module must block writes.
  * [ ] Historical reads should follow module `historicalReadAccess`.

* [ ] Add ticket list filtering.

  * [ ] Status.
  * [ ] Priority.
  * [ ] Assignee.
  * [ ] Client.
  * [ ] Project.
  * [ ] Requester.
  * [ ] Source.
  * [ ] Updated date.
  * [ ] Created date.
  * [ ] Archived state.
  * [ ] Pagination.

* [ ] Add ticket number/display key generation.

  * [ ] Generate human-readable ticket keys per workspace.
  * [ ] Ensure keys do not collide inside a workspace.
  * [ ] Keep database IDs separate from user-facing ticket keys.

## Version 0.35.2 - Ticket UI MVP

* [ ] Add Tickets navigation and protected views.

  * [ ] Tickets list page.
  * [ ] Ticket detail page.
  * [ ] Create ticket dialog/page.
  * [ ] Edit ticket metadata controls.
  * [ ] Permission-aware buttons and empty states.
  * [ ] Disabled-module state.

* [ ] Add internal ticket creation workflow.

  * [ ] Internal users can create tickets.
  * [ ] Internal users can optionally assign a ticket to a client.
  * [ ] Internal users can optionally assign a ticket to a project.
  * [ ] Internal users can set title, description, priority, category, and assignee where permitted.
  * [ ] Ticket creation should create the first ledger entry.

* [ ] Add ticket detail workflow.

  * [ ] Show ticket title, status, priority, client, project, requester, assignee, created date, updated date, and source.
  * [ ] Show client-visible ledger entries.
  * [ ] Show internal ledger entries only to users with internal ticket access.
  * [ ] Visually distinguish internal notes from client-visible replies.
  * [ ] Allow permitted users to add internal notes.
  * [ ] Allow permitted users to add client-visible replies.
  * [ ] Allow permitted users to change status, priority, and assignment.
  * [ ] Preserve accessibility behavior for form controls, icon buttons, tabs/filters, and status messages.

* [ ] Add tickets list workflow.

  * [ ] Show ticket key, title, status, priority, client/project context, assignee, requester, source, and updated date.
  * [ ] Add basic filters.
  * [ ] Add pagination.
  * [ ] Add empty state.
  * [ ] Add archived filter or archived view.
  * [ ] Keep list UI simple; do not build a full helpdesk dashboard yet.

* [ ] Add client/external ticket visibility groundwork.

  * [ ] Add permission-safe service methods for client-visible ticket reads.
  * [ ] Add UI/API distinction between internal users and external/client users.
  * [ ] Client/external users should not see internal notes, internal-only status details, raw audit records, or private metadata.
  * [ ] Client-facing ticket pages can be minimal in 0.33.x but the permission model must be real.

## Version 0.35.3 - Ticket Integration Hooks

* [ ] Register tickets as searchable records.

  * [ ] Add `searchableTypes` manifest declaration for tickets.
  * [ ] Index ticket title, description, ticket key, client/project context, status, priority, requester snapshot, and safe ledger text.
  * [ ] Internal-only ledger text must only appear in search results for users allowed to see internal ticket content.
  * [ ] Client-visible search results must not expose internal notes.
  * [ ] Search indexing should use the framework search service and adapter, not ticket-specific search queries.

* [ ] Register tickets as taggable records.

  * [ ] Add `taggableTypes` declaration for tickets.
  * [ ] Allow permitted users to assign workspace tags to tickets.
  * [ ] Tags are classification metadata only.
  * [ ] Do not use tags for visibility, status, billing state, or access control.

* [ ] Register tickets as attachable records.

  * [ ] Use the framework file attachment contract.
  * [ ] Tickets should not implement separate file storage.
  * [ ] Attachments should inherit or explicitly declare ticket-entry visibility.
  * [ ] Client-visible attachments must require public/client-safe file handling.
  * [ ] Internal attachments must not be downloadable by client/external users.
  * [ ] Quarantined/pending files must not appear in normal ticket UI.

* [ ] Register ticket notification events.

  * [ ] Notify relevant users when a ticket is created.
  * [ ] Notify assignee when assigned.
  * [ ] Notify followers when status/priority/client-visible reply changes.
  * [ ] Notify internal users when a client-visible reply is added.
  * [ ] Do not notify client/external users about internal notes.
  * [ ] Add ticket follow/unfollow support through framework notification subscriptions.

* [ ] Register ticket Workbench contribution.

  * [ ] Tickets can appear as actionable Workbench items.
  * [ ] Workbench item payload should include ticket key, title, status, priority, client/project context, assignee, due/follow-up date later, source URL, and timer state if Time Tracking is enabled.
  * [ ] Workbench should remain framework-owned.

* [ ] Register ticket timer source.

  * [ ] If Time Tracking is enabled, internal users can start/resume/pause/finalize timers from tickets.
  * [ ] Ticket timers should use the shared Time Tracking active timer engine.
  * [ ] Finalized time entries should preserve ticket metadata.
  * [ ] Do not create a separate ticket timer engine.

* [ ] Add manual task creation hook.

  * [ ] If Tasks is enabled, permitted users can create a task from a ticket.
  * [ ] The created task should link back to the source ticket.
  * [ ] This should be manual in 0.33.x.
  * [ ] Automatic task creation rules should wait for the automation/rules framework in 0.4x.

## Version 0.35.4 - Client Ticket Portal MVP

* [ ] Add minimal client/external ticket creation surface.

  * [ ] Authorized client users can create tickets for their allowed client/project context.
  * [ ] Client users can provide title, description, category, and optional attachment only where file safety permits.
  * [ ] Created tickets should use source `client_portal`.
  * [ ] Created tickets should create a client-visible initial request entry.
  * [ ] Internal users should be notified when appropriate.

* [ ] Add minimal client/external ticket detail surface.

  * [ ] Client users can view tickets they are authorized to access.
  * [ ] Client users can see client-visible entries only.
  * [ ] Client users can add client-visible replies.
  * [ ] Client users can see safe status labels.
  * [ ] Client users cannot see internal notes, internal-only files, raw audit records, private metadata, internal assignment details unless explicitly allowed, or internal search results.

* [ ] Add client/external ticket list surface.

  * [ ] Show ticket key, title, safe status, created date, updated date, and project context where allowed.
  * [ ] Add basic status filtering.
  * [ ] Add pagination.
  * [ ] Keep this portal simple; do not build a full customer support portal yet.

* [ ] Add client ticket access regression tests.

  * [ ] Client users cannot access tickets from another workspace.
  * [ ] Client users cannot access tickets for another client/project.
  * [ ] Client users cannot see internal notes.
  * [ ] Client users cannot download internal-only attachments.
  * [ ] Client-visible replies are visible to the right client users and internal users.
  * [ ] Internal users with proper permission can see both internal and client-visible ledger entries.

## Version 0.35.5 - Ticket Public API Groundwork

* [ ] Add ticket API scopes.

  * [ ] `tickets:read`
  * [ ] `tickets:write`
  * [ ] `tickets:create`
  * [ ] `tickets:reply`
  * [ ] Consider separating `tickets:internal` from client-facing API scopes.
  * [ ] API scopes should be offered only when the Support Tickets module is enabled.

* [ ] Add first safe public API routes for future plugins.

  * [ ] `POST /api/v1/tickets`
  * [ ] `GET /api/v1/tickets/:ticketId` only if permission-safe.
  * [ ] `POST /api/v1/tickets/:ticketId/replies` only if permission-safe.
  * [ ] Keep public API minimal.
  * [ ] Require API keys and scopes.
  * [ ] Validate workspace, client/project context, module state, and allowed source.
  * [ ] Do not expose internal notes through public API.
  * [ ] Do not expose raw audit data through public API.

* [ ] Add source attribution for API-created tickets.

  * [ ] Store source application/plugin identifier where available.
  * [ ] Store safe request metadata.
  * [ ] Leave room for future webhook signatures, replay protection, and per-plugin rate limits.
  * [ ] Avoid building WordPress/Shopify plugins in 0.33.x.

* [ ] Add API regression tests.

  * [ ] Missing/invalid API key is rejected.
  * [ ] Missing scope is rejected.
  * [ ] Disabled ticket module blocks writes.
  * [ ] API-created ticket belongs to the correct workspace.
  * [ ] API-created ticket cannot spoof another workspace/client/project.
  * [ ] Public API cannot create internal notes unless explicitly using an internal/admin scope.
  * [ ] Public API cannot read internal ledger entries.

## Version 0.35.6 - Ticket Regression, Polish, and Closeout

* [ ] Add complete ticket regression coverage.

  * [ ] Tickets cannot cross workspace boundaries.
  * [ ] Client/project links cannot cross workspace boundaries.
  * [ ] Internal users only see tickets permitted by role/resource checks.
  * [ ] Client/external users only see authorized client-visible tickets.
  * [ ] Internal notes are hidden from client/external users.
  * [ ] Client-visible replies are visible to both authorized client users and appropriate internal users.
  * [ ] Ticket status, priority, assignment, archive, and restore actions enforce permissions.
  * [ ] Search does not expose internal ticket content to unauthorized users.
  * [ ] Tags can be assigned only by users with tag assignment permission and ticket access.
  * [ ] Attachments follow ticket and entry visibility.
  * [ ] Notifications do not expose private ticket details.
  * [ ] Disabled ticket module blocks new ticket writes and hides normal navigation.
  * [ ] Historical ticket reads work only when module policy allows them.
  * [ ] Ticket timers require Time Tracking to be enabled.
  * [ ] Create-task-from-ticket requires Tasks to be enabled.

* [ ] Add accessibility and UI regression coverage.

  * [ ] Ticket forms have labels, validation summaries, and keyboard-friendly controls.
  * [ ] Ticket ledger entries have readable structure and status labels.
  * [ ] Internal/client-visible labels are clear.
  * [ ] Icon buttons have accessible names.
  * [ ] Empty/error/loading states are clear.
  * [ ] Client portal views do not leak internal controls.

* [ ] Add documentation notes.

  * [ ] Document ticket visibility rules.
  * [ ] Document internal notes vs client-visible replies.
  * [ ] Document ticket permissions.
  * [ ] Document public API limitations.
  * [ ] Document future plugin and automation hooks.
  * [ ] Document that ticket ledger is not the same as audit log.

* [ ] Release bookkeeping.

  * [ ] Update `DECISIONS.md` or product notes with ticket visibility and ledger decisions.
  * [ ] Update `CHANGELOG.md`.
  * [ ] Bump `package.json` and `package-lock.json`.
  * [ ] Run `npm run check`.
  * [ ] Run `npm run test:permissions`.
  * [ ] Run ticket-specific regression scripts.

## Version 0.36.0 - Calendars and Calendar Views

- [ ] Calendars
  - [ ] Year view
  - [ ] Month view
  - [ ] Week view
  - [ ] Day view
  - [ ] Filters for client (business workspace only)/project

- [ ] Calendar Events
  - [ ] Allow addition of calendar events
  - [ ] Display iCal events from shared calendars

## Version 0.36.5 - Account Home / Cross-Workspace Attention View

Add a framework-owned Account Home view for users who belong to multiple workspaces.

This view must not weaken workspace isolation. It should aggregate only permission-safe summaries from workspaces the current user can access.

Account Home should not query module tables directly. It should use framework-owned summary services, notification records, announcement records, activity-feed records, and module-declared attention providers where available.

The first version should include:

- Workspace cards showing unread/attention counts.
- Active workspace announcements.
- Current-user notifications across accessible workspaces.
- Permission-safe attention items such as overdue tasks, assigned tickets, pending reviews, and stale timers where those modules are enabled.
- Links that switch/open the correct workspace before navigating to the target record.

Do not expose raw audit records, raw event payloads, private module records, or cross-workspace administrative data. Every item must be visible only if the user could read the source record inside that workspace.

## Version 0.37.0 - Expanded Reporting and Invoicing

- [ ] Expanded reporting
- [ ] Invoicing

## Version 0.38.0 - User Account Security Upgrades and Database/Settings File Backup/Restore

### Two Factor Authentication (TOTP) (2FA)

- [ ] Add optional 2FA for users. Can be turned on in the Settings -> User dialog
- [ ] Super admins should be able to turn on a setting that requires 2FA setup on next login for individual users
- [ ] Workspace admins can require users have 2FA to join workspace

### Version 0.38.1 - Passkeys

- [ ] Passkeys

### Version 0.38.2 - User Sessions

- [ ] Sessions should expire after 1 day
- [ ] Super Admins should have ability to log users out
- [ ] Workspace admins should have ability to log users out

## Version 0.38.3 - Login Security Monitoring and Risk Scoring

- [ ] Add `user_login_events` table:
  - [ ] `login_event_id`
  - [ ] `user_id`
  - [ ] `occurred_at`
  - [ ] `success`
  - [ ] `failure_reason`
  - [ ] `ip_address`
  - [ ] `ip_hash`
  - [ ] `user_agent`
  - [ ] `user_agent_hash`
  - [ ] `browser_family`
  - [ ] `os_family`
  - [ ] `device_type`
  - [ ] `country`
  - [ ] `region`
  - [ ] `risk_score`
  - [ ] `risk_reason`
  - [ ] `session_id_hash`
  - [ ] `metadata_json`
- [ ] Log authentication events:
  - [ ] Successful login.
  - [ ] Failed login.
  - [ ] Password reset requested.
  - [ ] Password reset completed.
  - [ ] 2FA challenge success/failure.
  - [ ] Passkey registration/removal.
  - [ ] New device/session.
  - [ ] Logout.
  - [ ] Admin-forced logout.
- [ ] Add login risk checks:
  - [ ] New device/browser.
  - [ ] New country or impossible travel.
  - [ ] IP reputation check if available.
  - [ ] Many failures for same account.
  - [ ] Many failures from same IP.
  - [ ] Successful login after many failures.
  - [ ] Login from TOR/VPN/proxy if detectable.
- [ ] Add risk-based responses:
  - [ ] Low risk: allow login and log event.
  - [ ] Medium risk: allow login and notify user.
  - [ ] High risk: require 2FA/passkey reauthentication if available.
  - [ ] Critical risk: temporarily block or require password reset/admin review.
- [ ] Add user-facing security tools:
  - [ ] Show recent login history in user settings.
  - [ ] Allow user to revoke sessions.
  - [ ] Email/in-app notification for new device login.
  - [ ] Email/in-app notification for suspicious login.
- [ ] Add admin security tools:
  - [ ] View recent failed login patterns.
  - [ ] Force logout user sessions.
  - [ ] Temporarily disable account.
  - [ ] Require password reset.
  - [ ] Require 2FA setup.
- [ ] Privacy rules:
  - [ ] Do not log passwords, tokens, reset tokens, or full session IDs.
  - [ ] Consider hashing or truncating IP addresses for long-term retention.
  - [ ] Define retention period for login events.
  - [ ] Restrict access to login security logs.

### Version 0.38.4

Super Admins should have a backup/restore function on the dashboard that dumps the current database into a clean file with an app meta data file that has app version stamped and datetime (UTC) of backup in it and zips it into a zip file along with any physical settings files on disk (this will be necessary after packaging for self-hosting and may not yet be necessary, but I want uniform functions for backup/restore that can be easily modified in the future)

- [ ] Create backup function to grab and zip:
  - [ ] Database dump/database file
  - [ ] App meta data file to include app version and datetime stamp of backup
  - [ ] Setup files (can be blank for now)
- [ ] Add backup to user interface for Super Admins in Settings menu
  - Label should be "App Backup"
  - Should only be visible if user is Super Admin (utilize session auth variables to keep from adding/hiding the option)
  - [ ] "Perform backup" button
    - this should then provide a link to the downloadable zip file
    - download should be a temporary file on the server in a "downloads" directory
    - backup should have checksum
    - backup shouldn't delete temporary file until checksum is confirmed
  - [ ] "Perform restore" button
    - this should only accept zip files
    - this should verify files, checksum, etc. before installing/overwriting current data

### Version 0.39.0 - Creator Studio / Content Studio Module

- [ ] Core records:
  - [ ] Content ideas.
  - [ ] Content drafts.
  - [ ] Campaigns/series.
  - [ ] Publishing channels.
  - [ ] Assets/media.
  - [ ] Content templates.
  - [ ] Repurposing tasks.
- [ ] Content idea fields:
  - [ ] Title.
  - [ ] Description/angle.
  - [ ] Workspace.
  - [ ] Client/project if applicable.
  - [ ] Channel(s).
  - [ ] Format: blog, short, long video, email, social post, product page, course material, etc.
  - [ ] Status: idea, planned, drafting, editing, scheduled, published, archived.
  - [ ] Priority.
  - [ ] Target publish date.
  - [ ] Assigned user.
  - [ ] Tags.
  - [ ] Related notes/tasks/assets.
- [ ] Editorial calendar:
  - [ ] Calendar view by publish date.
  - [ ] List view by status.
  - [ ] Kanban view by production stage.
  - [ ] Filter by brand/site/channel/project/tag.
- [ ] Publishing channels:
  - [ ] Website/blog.
  - [ ] YouTube.
  - [ ] Shorts/Reels/TikTok.
  - [ ] Newsletter.
  - [ ] Facebook/Instagram/X/LinkedIn/Mastodon.
  - [ ] Podcast if needed later.
- [ ] Asset library:
  - [ ] Attach images, video, audio, documents, thumbnails, captions, and scripts.
  - [ ] Track asset usage across content items.
  - [ ] Store alt text, captions, source/license notes, and credit requirements.
- [ ] Repurposing workflow:
  - [ ] One long-form item can spawn shorts, social posts, newsletter blurbs, blog excerpts, and follow-up tasks.
  - [ ] Track each derivative item separately but link it to the source content.
- [ ] Analytics groundwork:
  - [ ] Store published URL.
  - [ ] Store basic performance notes manually at first.
  - [ ] Later: integrate platform analytics where APIs allow.
- [ ] Permissions:
  - [ ] Creator Studio records are workspace-scoped.
  - [ ] Client/project-linked content respects existing permissions.
  - [ ] External clients may be allowed to review/comment only if explicitly enabled.

- [ ] Treat Creator Studio as an optional first-party module. 
  - [ ] The module should ship with Longtail Forge but be disabled by default for workspaces that do not need it. 
  - [ ] It should follow the same module manifest, permissions, navigation, search, tags, notification, file, task, notes, and calendar contracts as every other first-party module. 
  - [ ] Do not build it as a separate third-party plugin project yet. 
  - [ ] Use it as a real-world test case for whether Longtail Forge modules can compose shared framework services cleanly. 

- [ ] Reuse existing first-party modules where appropriate. 
  - [ ] Content ideas may start as Creator Studio records but should be linkable to notes and lists. 
  - [ ] Content drafts may hook into Notes when Notes exists. 
  - [ ] Campaigns/series should likely be Creator Studio-owned hierarchical records. 
  - [ ] Assets/media should use the framework file service. 
  - [ ] Repurposing work should be able to create/link Tasks. 
  - [ ] Publishing dates should hook into Calendar when Calendar exists. 
  - [ ] Tags and Search should apply to Creator Studio records. 
  - [ ] Notifications should support assignments, due dates, review requests, and scheduled publish reminders later. 

- [ ] Add Creator Studio workbench. 
  - [ ] Add a dedicated Creator Studio workbench page. 
  - [ ] Workbench should be accessible from a picker similar to workspace/module selection. 
  - [ ] It should support a focused content-production workflow without cluttering the basic workbench. 
  - [ ] It should optionally filter by client/project/brand/channel/campaign. 
  - [ ] It should be disabled cleanly when the Creator Studio module is disabled. 

- [ ] Define workbench areas as a framework concept. 
  - [ ] Basic workbench for general first-party modules such as timers, tasks, notes, and lists. 
  - [ ] Focused workbench for one client/project at a time. 
  - [ ] Creator Studio workbench for content planning, drafting, assets, campaigns, repurposing, and editorial calendar work. 
  - [ ] Future modules may declare their own workbench areas through the module manifest.

## Version 0.39.9 - User Documentation and 0.3x Stabilization Checkpoint 

- [ ] Create user-facing documentation for the completed 0.3x feature set. 
  - [ ] Getting started. 
  - [ ] Workspace types and workspace switching. 
  - [ ] Users, roles, and permissions. 
  - [ ] Clients and projects. 
  - [ ] Time tracking. 
  - [ ] Tasks. 
  - [ ] Notifications. 
  - [ ] Tags. 
  - [ ] Search. 
  - [ ] Files/attachments if completed in 0.32.x. 
  - [ ] Support tickets if completed in 0.33.x. 
  - [ ] Notes and knowledge base foundations if completed in 0.34.x. 
  - [ ] Calendar basics if completed in 0.35.x. 
  - [ ] Shopping/procurement lists if completed in 0.39.x. 
  - [ ] Creator/content studio if completed in 0.39.x. 
- [ ] Create admin-facing documentation for workspace/module setup. 
  - [ ] Module enable/disable behavior. 
  - [ ] Workspace-type label differences. 
  - [ ] Permission expectations. 
  - [ ] Safe file upload/download behavior. 
- [ ] Create developer-facing notes for first-party module contracts. 
  - [ ] Module manifest fields. 
  - [ ] Navigation registration. 
  - [ ] Permission declarations. 
  - [ ] Notification declarations. 
  - [ ] Taggable/searchable declarations. 
  - [ ] File attachable declarations. 
  - [ ] Workbench card/area declarations. 
- [ ] Update `docs/architecture.md` to reflect the completed 0.3x architecture. 
- [ ] Verify `ROADMAP.md`, `TODO.md`, `DECISIONS.md`, `CHANGELOG.md`, and package versions are consistent.

- [ ] Wipe existing DB migrations and create a new DB baseline

- [ ] Evaluate all existing regressions and see what can be eliminated/lightened

- [ ] Determine where efficiencies can be made in the code/Perform an efficiency refactor

- [ ] Evaluate whether TypeScript would be a useful addition for ensure module/framework contracts are adhered to

- [ ] Audit all Public API calls and make a list for review and modification. Sort by module.

- [ ] Audit all event hooks by module and make a list for review and modification.

## Version 0.40.0 - Project Tools expansion & Database extraction layer for use with SQLite or PostGRES

Now that we have the base layer of a complete project management tool, we can begin expanding actual project management with milestones, dependencies, status reporting, budgeting, estimation, views, templates, etc.

Allowing the app to run on SQLite OR PostGRES makes it more flexible for self-hosted installs; I want the database layer to be able to handle either one, based on the settings/.env file

Below is a rough road map for all of the 0.40 branch, this is not finalized yet

- [ ] Add topics to GitHub for discovery

### Project Tools expansion

- [ ] Project Milestones/Phases/Deliverables
  - Milestones belong to a workspace and optionally a client/project
  - Tasks, notes, tickets, time entries, and files may eventually link to a milestone
  - Milestones should have a title, description, status, due date, sort order, and optional completion/completed date
  - This should not block basic tasks, but the data model should leave room for it

- [ ] Task dependencies/blockers
  - Allow one task to depend on another task
  - Show blocked tasks clearly
  - Prevent circular dependencies
  - Allow blocked-by relationships across the same project, and maybe later across projects
  - More formal task workflow, such as `backlog`, `ready`, `in_progress`, `waiting`, `blocked`, `in_review`, `approved`, `complete`, `canceled`, and `archived`, often with rules about which statuses can move to which next statuses.

- [ ] Project Status/Health
  - Project status: active, paused, completed, archived
  - Project heatlh: on_track, at_risk, blocked, waiting_on_client
  - Dashboard should eventually surface project health

- [ ] Project budgeting/estimation/actuals
  - should be optional for personal/family projects
  - [ ] Add estimated hours to projects
  - [ ] Add optional budgeted hours/dollars to projects
  - [ ] Compare estimated vs actual tracked time
  - [ ] Show budget/burn progress on project pages and dashboard
  - [ ] Allow reporting by client, project, milestone, tag, and date range

- [ ] List/Kanban/Calendar views
  - [ ] Add list view for tasks
  - [ ] Add Kanban board view for tasks grouped by status
  - [ ] Add calendar view for tasks with due dates

- [ ] Project/task templates
  - should have hard-coded, initial examples that can be used as well as saved templates
  - [ ] Add task templates
  - [ ] Add project templates
  - [ ] Allow project templates to create default milestones, tasks, notes, and checklists
  - [ ] Allow workspace-level templates first
  - [ ] Later: allow client-specific templates

- [ ] Task checklists (tasks can have sub-item checklists)
  - Checklist items belong to a task
  - Items can be checked/unchecked and sorted
    - sort by: due date, importance, etc.
  - Checklist completion can optionally contribute to task progress

- [ ] Task/Project discussions
  - [ ] Add comments to tasks
  - [ ] Add comments to projects
  - [ ] Add internal comments to support tickets
  - [ ] Comments should respect permissions and visibility
  - [ ] Comments should appear in activity feeds where appropriate

- [ ] Files/attachments foundation
  - [ ] Add file attachment foundation for notes/tasks/support tickets/projects
  - [ ] Store file metadata in database
  - [ ] Decide local storage vs object storage later
  - [ ] Respect workspace/client/project permissions
  - [ ] Public-safe attachments required before public KB/client portal features

- [ ] Project Owner/Responsible-user fields
  - [ ] Workspace owner
  - [ ] Client/account owner
  - [ ] Project owner
  - [ ] Ticket owner
  - [ ] Task/ticket assignee remains separate from project ownership

- [ ] Saved views
  - people will want views like: "Tasks due this week," "Waiting on client," "Client open tickets," etc.
  - [ ] Allow users to save commenly used filters
  - [ ] Saved views may apply to tasks, time entries, tickets, notes, and dashboard sections
  - [ ] Views should be user-specific first
  - [ ] Workspace-share views can come later

- [ ] Client approvals/change requests
  - [ ] Add lightweight approval records
  - [ ] Add change request records
  - [ ] Link approvals/change requests to clients, projects, milestones, tasks, notes, or tickets
  - [ ] Track requested_by, approved_by, approved_at, status, and notes
  - [ ] Consider client-facing approvals only after permissions/client portal features exist

- [ ] Timeline/Gannt-style view

- [ ] Workload/capacity planning

- [ ] Portfolio-level reporting across clients/projects/workspaces

### Database Tools

- [ ] Configuration files for initial configuration
  - [ ] Merge all previous migrations to make unified initial SQL
- [ ] Migration tools to switch between database backends
- [ ] Export/Import database tools
  - [ ] Allow users to export their workspaces

### App Decisions

- [ ] Define archival period
- [ ] Define lifecycle of tasks, notes, tickets, etc.

## Version 0.45.0 - Phone/Tablet/TV app prep

- Prepare APIs for Phone/Tablet/TV apps

- Universal Longtail Forge app for iOS

- Universal Longtail Forge app for Android (Latest)

- Roku apps for coordinating teams/families
  - Displays Calendar/Task Lists/Current-Upcoming Day Events

## Version 0.50.0 - Production, Packaging, and Self-Hosting

- [ ] Move to a demo production environment
- [ ] Add PostgreSQL support
  - [ ] Add a database adapter layer so the app is not permanently tied to shelling out to the SQLite CLI
  - [ ] Keep SQLite support for local/self-hosted lightweight installs if practical
  - [ ] PostgreSQL should become the preferred production database
- [ ] Add file attachment abilities to notes/tasks/support tickets
- [ ] Docker Compose
- [ ] Setup wizard
- [ ] Admin docs
- [ ] Add production cookie flags
- [ ] Self-hosted release
- [ ] Expand project management tools

### Added during 0.30.6 Code Review

- Verify runtime data directory permissions for `data/`, `logs/`, and `archive/`.
- Ensure the SQLite database file is not web-served under any configuration.
- Add startup warnings when data/log directories are world-readable or world-writable on platforms where that can be checked reliably.
- Add backup/restore path validation that prevents writing outside approved runtime directories.
- Consider an install health-check endpoint or CLI command that reports filesystem lockdown status without exposing sensitive paths to normal users.

## Version 0.55.0

- [ ] Email delivery
- [ ] Invite links
- [ ] Single Sign-On (SSO)

## Version 0.60.0 - SaaS Wrapper

- [ ] SaaS wrapper
- [ ] Hosted PostgreSQL
- [ ] Tenant signup
- [ ] Billing
- [ ] Monitoring

## Version 0.70.0 - Integrations and Plugin Readiness

### Guidelines/Notes for Integrations

- [ ] Integration architecture
  - [ ] Integrations should authenticate through API keys, OAuth, or integration-specific credentials as appropriate
  - [ ] Integrations should respect workspace, client, project, and user permissions
  - [ ] Integration events should be audit logged where appropriate
  - [ ] Integration-created records should identify their source in metadata
  - [ ] Avoid integration-specific logic leaking into core services where a module or adapter would be cleaner

### Potential Integrations List

### Support tickets

- [ ] ZenDesk
- [ ] FreshDesk

### Calendars

- [ ] Google Calendar
- [ ] Outlook Calendar

### Task App Integrations

- [ ] Microsoft To Do
- [ ] Google Tasks


### File Sharing and Storage

Is it possible to get notifications from any of these sources?

- [ ] Microsoft OneDrive 
- [ ] Google Drive
- [ ] DropBox
- [ ] Microsoft SharePoint
  - File sharing
  - Knowledgebase pages
  - Input for tickets/notes/tasks/etc.

### Email integrations

Auto-routing communications/messaging

- [ ] Google Workspace email
- [ ] Outlook

### eCommerce Plugins

- [ ] Knowledge Base plugin
- [ ] Support ticket plugin
  - Would include notes plugin for Shopify Admin
- [ ] Automated task creation from:
  - Front-end support tickets
  - Order issues (fulfillment failure, etc.)

- [ ] WordPress/WooCommerce
- [ ] Shopify
- [ ] Magento
- [ ] BigCommerce

### Personal/Family Workspace Integrations

- [ ] Create grocery/shopping list items from Home Assistant (voice commands inputs)
- [ ] Update/create project tasks from Home Assistant (voice commands inputs)

- [ ] Home Assistant
- [ ] Apple Home
- [ ] Google Assistant (Google Home?)

### Analytics (Creator Studio)

- [ ] WordPress
- [ ] YouTube
- [ ] TikTok
- [ ] Twitch
- [ ] Facebook
- [ ] Instagram
- [ ] Threads
- [ ] X
- [ ] BlueSky
- [ ] Mastodon
- [ ] Buffer

### Publishing (Creator Studio)

The Creator studio tool can be much richer if it pushes content out to these platforms, or stores them there until ready for publishing.

- [ ] WordPress (Posts first, the Custom Post Types)
- [ ] Shopify (Blogs)
- [ ] Social Media
  - [ ] YouTube
  - [ ] TikTok
  - [ ] Twitch
  - [ ] Facebook
  - [ ] Instagram
  - [ ] Threads
  - [ ] X
  - [ ] BlueSky
  - [ ] Mastodon
  - [ ] Buffer

## Version 0.71.0

- [ ] Buy domain name
  - [ ] Launch website

- [ ] Launch Social Media
