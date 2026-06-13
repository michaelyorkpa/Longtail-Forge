import { randomUUID } from "node:crypto";
import { listsRepository } from "./lists.repo.js";
import {
  LIST_PERMISSIONS,
  canAccessList,
  canManageListItem,
  itemResource,
  listResource,
  sanitizeListLifecyclePayload,
} from "./access-policy.js";
import {
  LIST_ITEM_PURCHASE_STATUSES,
  LIST_ITEM_PURCHASE_STATUS_VALUES,
  LIST_MODULE_ID,
  LIST_STATUSES,
  LIST_STATUS_VALUES,
  LIST_TYPES,
  LIST_TYPE_VALUES,
  defaultListTypeForWorkspaceType,
  validateListContext,
  validateListItemContext,
} from "./storage-contract.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { assertModuleWriteEnabled } from "../../core/modules/module-access.js";
import { auditService } from "../../core/audit.js";
import { permissionsService } from "../../core/permissions.js";
import { AppError } from "../../core/errors.js";
import { settingsRepository } from "../../repositories/settings.repo.js";
import { projectsRepository } from "../client-projects/projects.repo.js";
import { clientsRepository } from "../client-projects/clients.repo.js";
import { tasksRepository } from "../tasks/tasks.repo.js";
import { notesRepository } from "../notes/notes.repo.js";
import { searchIndexSyncService } from "../../services/search-index-sync.service.js";
import { tagsService } from "../../services/tags.service.js";

const LIST_TYPE_SET = new Set(LIST_TYPE_VALUES);
const LIST_STATUS_SET = new Set(LIST_STATUS_VALUES);
const PURCHASE_STATUS_SET = new Set(LIST_ITEM_PURCHASE_STATUS_VALUES);

async function list(session, query = {}) {
  await assertListsReadable(session);
  const normalizedQuery = normalizeListQuery(query);
  const lists = await listsRepository.list(session.workspace_id, normalizedQuery.repositoryFilters);
  const readableLists = [];

  for (const listRecord of lists) {
    if (await canReadList(session, listRecord)) {
      readableLists.push(await shapeListForBrowser(session, listRecord));
    }
  }

  const taggedLists = await tagsService.decorateRecordsForTarget(
    session,
    "list",
    await tagsService.filterRecordsByTags(session, "list", readableLists, normalizedQuery.tagIds, { idField: "list_id" }),
    { idField: "list_id" },
  );
  const filteredLists = taggedLists.filter((listRecord) => listMatchesCanonicalQuery(listRecord, normalizedQuery, session));

  return {
    lists: sortCanonicalLists(filteredLists, normalizedQuery),
    query: normalizedQuery.response,
  };
}

async function read(listId, session, options = {}) {
  const listRecord = await readListOrThrow(session, listId, options);
  await assertCanAccessList(session, listRecord, "read");
  const items = options.includeItems === false
    ? []
    : await listsRepository.listItems(session.workspace_id, listRecord.list_id, {
        includeDeleted: options.includeDeletedItems === true,
      });

  return {
    list: await shapeListForBrowser(session, listRecord),
    items: items.map(shapeItemForBrowser),
    links: await readPermissionSafeLinks(session, listRecord),
  };
}

async function create(payload, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const normalized = await normalizeListPayload(payload, session, {
    list_id: payload?.list_id || payload?.id || randomUUID(),
    status: LIST_STATUSES.ACTIVE,
    is_reusable: false,
    created_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
  });

  await permissionsService.assertCan(session, LIST_PERMISSIONS.CREATE, {
    ...listResource(normalized),
    operation: "create",
  });

  if (normalized.status !== LIST_STATUSES.ACTIVE) {
    throw new AppError("New lists must start active in this release.", 400);
  }

  const listRecord = await listsRepository.create(session.workspace_id, normalized);
  await recordListAudit(session, "list_created", "create", null, listRecord);
  await emitListEvent("lists.list.created", session, null, listRecord);
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.created");

  return { list: await shapeListForBrowser(session, listRecord) };
}

async function update(listId, payload, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const previousList = await readListOrThrow(session, listId);
  await assertCanAccessList(session, previousList, "update");
  const normalized = await normalizeListPayload(payload, session, {
    ...previousList,
    updated_by_user_id: session.user_id,
  });
  if (normalized.status === LIST_STATUSES.FINALIZED && previousList.status !== LIST_STATUSES.FINALIZED) {
    throw new AppError("Finalize lists through the finalized-list workflow.", 400);
  }
  await assertCanAccessList(session, normalized, "update");

  const listRecord = await listsRepository.update(session.workspace_id, normalized);
  await recordListAudit(session, "list_updated", "update", previousList, listRecord);
  await emitListEvent("lists.list.updated", session, previousList, listRecord);
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.updated");

  return { list: await shapeListForBrowser(session, listRecord) };
}

async function complete(listId, session) {
  return transitionList(listId, session, {
    action: "list_completed",
    changeType: "update",
    eventName: "lists.list.completed",
    operation: "complete",
    patch: (previousList, now) => ({
      status: LIST_STATUSES.COMPLETED,
      completed_at: previousList.completed_at || now,
      archived_at: null,
      deleted_at: null,
    }),
  });
}

async function finalize(listId, session) {
  return transitionList(listId, session, {
    action: "list_finalized",
    changeType: "update",
    eventName: "lists.list.finalized",
    operation: "finalize",
    patch: (_previousList, now) => ({
      status: LIST_STATUSES.FINALIZED,
      completed_at: now,
      finalized_at: now,
      finalized_by_user_id: session.user_id,
      archived_at: null,
      deleted_at: null,
    }),
  });
}

async function reopen(listId, session) {
  return transitionList(listId, session, {
    action: "list_reopened",
    changeType: "update",
    eventName: "lists.list.reopened",
    operation: "complete",
    patch: () => ({
      status: LIST_STATUSES.ACTIVE,
      completed_at: null,
      finalized_at: null,
      finalized_by_user_id: null,
      archived_at: null,
      deleted_at: null,
    }),
  });
}

async function markReusable(listId, session) {
  return transitionList(listId, session, {
    action: "list_reusable_marked",
    changeType: "update",
    eventName: "lists.list.reusable_marked",
    operation: "manage_reusable",
    patch: () => ({
      is_reusable: true,
    }),
  });
}

async function unmarkReusable(listId, session) {
  return transitionList(listId, session, {
    action: "list_reusable_unmarked",
    changeType: "update",
    eventName: "lists.list.reusable_unmarked",
    operation: "manage_reusable",
    patch: () => ({
      is_reusable: false,
    }),
  });
}

async function duplicate(listId, payload = {}, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const sourceList = await readListOrThrow(session, listId);
  await assertCanAccessList(session, sourceList, "duplicate");

  const sourceItems = await listsRepository.listItems(session.workspace_id, sourceList.list_id);
  const title = normalizeOptionalText(payload.title || payload.copyTitle) || `Copy of ${sourceList.title}`;
  const duplicatedList = await normalizeListPayload({
    client_id: sourceList.client_id,
    description: sourceList.description,
    duplicated_from_list_id: sourceList.list_id,
    is_reusable: false,
    list_id: payload.list_id || payload.id || randomUUID(),
    list_type: sourceList.list_type,
    project_id: sourceList.project_id,
    source_list_id: sourceList.is_reusable ? sourceList.list_id : sourceList.source_list_id,
    title,
  }, session, {
    created_by_user_id: session.user_id,
    status: LIST_STATUSES.ACTIVE,
    updated_by_user_id: session.user_id,
  });

  const createdList = await listsRepository.create(session.workspace_id, {
    ...duplicatedList,
    completed_at: null,
    finalized_at: null,
    finalized_by_user_id: null,
    archived_at: null,
    deleted_at: null,
  });

  const copiedItems = [];
  for (const [index, item] of sourceItems.entries()) {
    copiedItems.push(await listsRepository.createItem(session.workspace_id, duplicateItemPayload(item, createdList, session, index)));
  }

  await recordListAudit(session, "list_duplicated", "create", sourceList, createdList, {
    duplicated_from_list_id: sourceList.list_id,
    source_list_id: createdList.source_list_id,
  });
  await emitListEvent("lists.list.duplicated", session, sourceList, createdList, {
    duplicated_from_list_id: sourceList.list_id,
    source_list_id: createdList.source_list_id,
  });
  await syncListSearchIndex(session.workspace_id, createdList.list_id, "list.duplicated");

  return {
    items: copiedItems.map(shapeItemForBrowser),
    list: await shapeListForBrowser(session, createdList),
  };
}

async function archive(listId, session) {
  return transitionList(listId, session, {
    action: "list_archived",
    changeType: "archive",
    eventName: "lists.list.archived",
    operation: "archive",
    patch: (_previousList, now) => ({
      status: LIST_STATUSES.ARCHIVED,
      archived_at: now,
      deleted_at: null,
    }),
  });
}

async function restore(listId, session) {
  return transitionList(listId, session, {
    action: "list_restored",
    changeType: "restore",
    eventName: "lists.list.restored",
    operation: "restore",
    options: { includeDeleted: true },
    patch: () => ({
      status: LIST_STATUSES.ACTIVE,
      archived_at: null,
      deleted_at: null,
    }),
  });
}

async function softDelete(listId, session) {
  return transitionList(listId, session, {
    action: "list_deleted",
    changeType: "delete",
    eventName: "lists.list.deleted",
    operation: "delete",
    options: { includeDeleted: true },
    patch: (_previousList, now) => ({
      status: LIST_STATUSES.DELETED,
      deleted_at: now,
    }),
  });
}

async function listLinks(listId, session) {
  const listRecord = await readListOrThrow(session, listId, { includeDeleted: true });
  await assertCanAccessList(session, listRecord, "read");

  return { links: await readPermissionSafeLinks(session, listRecord) };
}

async function createLink(listId, payload, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const listRecord = await readListOrThrow(session, listId);
  await assertCanAccessList(session, listRecord, "manage_links");
  const link = normalizeLinkPayload(payload, listRecord, session);
  const target = await readLinkedTargetSummary(session, link, { requireAccess: true });
  const createdLink = await listsRepository.createLink(session.workspace_id, link);
  await recordLinkAudit(session, "list_link_created", "create", null, createdLink, listRecord);
  await emitListEvent("lists.link.created", session, null, listRecord, {
    link: sanitizeLinkForAudit(createdLink),
  });
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.linked");

  return { link: shapeLinkForBrowser(createdLink, target) };
}

async function removeLink(listId, linkId, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const listRecord = await readListOrThrow(session, listId);
  await assertCanAccessList(session, listRecord, "manage_links");
  const previousLink = await listsRepository.readLinkById(session.workspace_id, listRecord.list_id, normalizeRequiredText(linkId, "List link ID"));

  if (!previousLink || previousLink.removed_at) {
    throw new AppError("List link not found.", 404);
  }

  await readLinkedTargetSummary(session, previousLink, { requireAccess: true });
  const link = await listsRepository.removeLink(session.workspace_id, listRecord.list_id, previousLink.list_link_id);
  await recordLinkAudit(session, "list_link_removed", "delete", previousLink, link, listRecord);
  await emitListEvent("lists.link.removed", session, listRecord, listRecord, {
    link: sanitizeLinkForAudit(link),
  });
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.unlinked");

  return { link: shapeLinkForBrowser(link, null) };
}

async function createCatalogItem(payload, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  await assertCanManageCatalog(session);
  const normalized = await normalizeCatalogPayload(payload, session, {
    catalog_item_id: payload?.catalog_item_id || payload?.id || randomUUID(),
    created_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
  });
  const catalogItem = await listsRepository.createCatalogItem(session.workspace_id, normalized);
  await recordCatalogAudit(session, "list_item_catalog_created", "create", null, catalogItem);
  await emitCatalogEvent("lists.catalog_item.created", session, null, catalogItem);

  return { catalogItem: shapeCatalogItemForBrowser(catalogItem) };
}

async function updateCatalogItem(catalogItemId, payload, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  await assertCanManageCatalog(session);
  const previousItem = await readCatalogItemOrThrow(session, catalogItemId);
  const normalized = await normalizeCatalogPayload(payload, session, {
    ...previousItem,
    updated_by_user_id: session.user_id,
  });
  const catalogItem = await listsRepository.updateCatalogItem(session.workspace_id, normalized);
  await recordCatalogAudit(session, "list_item_catalog_updated", "update", previousItem, catalogItem);
  await emitCatalogEvent("lists.catalog_item.updated", session, previousItem, catalogItem);

  return { catalogItem: shapeCatalogItemForBrowser(catalogItem) };
}

async function suggestItems(session, query = {}) {
  await assertListsReadable(session);
  const listRecord = query.listId || query.list_id
    ? await readListOrThrow(session, query.listId || query.list_id, { includeDeleted: true })
    : null;

  if (listRecord) {
    await assertCanAccessList(session, listRecord, "read");
  } else {
    await permissionsService.assertCan(session, LIST_PERMISSIONS.VIEW, listResource({ workspace_id: session.workspace_id }));
  }

  const suggestions = await listsRepository.listCatalogSuggestions(session.workspace_id, {
    clientId: normalizeOptionalText(query.clientId || query.client_id || listRecord?.client_id),
    limit: normalizeSuggestionLimit(query.limit),
    listType: normalizeOptionalText(query.listType || query.list_type || listRecord?.list_type),
    projectId: normalizeOptionalText(query.projectId || query.project_id || listRecord?.project_id),
    query: normalizeCatalogName(query.q || query.query || ""),
  });

  return { suggestions: suggestions.map(shapeCatalogItemForBrowser) };
}

async function createItem(listId, payload, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const listRecord = await readListOrThrow(session, listId);
  await assertCanManageItem(session, listRecord, null);
  const catalogItem = await resolveCatalogItemSnapshot(payload, session);
  const itemFallback = catalogItem ? catalogItemToItemFallback(catalogItem) : {};
  const item = normalizeItemPayload(payload, session, listRecord, {
    ...itemFallback,
    list_item_id: payload?.list_item_id || payload?.id || randomUUID(),
    purchase_status: LIST_ITEM_PURCHASE_STATUSES.NEEDED,
    quantity: itemFallback.quantity ?? 1,
    sort_order: await nextSortOrder(session.workspace_id, listRecord.list_id),
    assigned_user_id: payload?.assigned_user_id || payload?.assignedUserId || session.user_id,
    created_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
  });

  if (payload?.save_to_catalog === true || payload?.save_to_catalog === "true" || payload?.saveToCatalog === true || payload?.saveToCatalog === "true") {
    const createdCatalog = await createCatalogItem({
      ...item,
      client_id: listRecord.client_id || "",
      list_type: listRecord.list_type,
      project_id: listRecord.project_id || "",
    }, session);
    item.catalog_item_id = createdCatalog.catalogItem.catalog_item_id;
  }

  const storedItem = await listsRepository.createItem(session.workspace_id, item);
  if (storedItem.catalog_item_id) {
    await listsRepository.incrementCatalogUsage(session.workspace_id, storedItem.catalog_item_id, session.user_id);
  }
  await recordItemAudit(session, "list_item_created", "create", null, storedItem, listRecord);
  await emitItemEvent("lists.item.created", session, null, storedItem, listRecord);
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.item_created");

  return { item: shapeItemForBrowser(storedItem) };
}

async function updateItem(listId, itemId, payload, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const { listRecord, item } = await readItemWithListOrThrow(session, listId, itemId);
  await assertCanManageItem(session, listRecord, item);
  const catalogItem = await resolveCatalogItemSnapshot(payload, session);
  const itemFallback = catalogItem ? catalogItemToItemFallback(catalogItem) : {};
  const normalized = normalizeItemPayload(payload, session, listRecord, {
    ...itemFallback,
    ...item,
    catalog_item_id: itemFallback.catalog_item_id || item.catalog_item_id,
    updated_by_user_id: session.user_id,
  });

  const storedItem = await listsRepository.updateItem(session.workspace_id, normalized);
  if (catalogItem && storedItem.catalog_item_id) {
    await listsRepository.incrementCatalogUsage(session.workspace_id, storedItem.catalog_item_id, session.user_id);
  }
  await recordItemAudit(session, "list_item_updated", "update", item, storedItem, listRecord);
  await emitItemEvent("lists.item.updated", session, item, storedItem, listRecord);
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.item_updated");

  return { item: shapeItemForBrowser(storedItem) };
}

async function reorderItems(listId, payload, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const listRecord = await readListOrThrow(session, listId);
  await assertCanManageItem(session, listRecord, null);
  const itemOrders = normalizeItemOrders(payload?.items || payload?.itemOrders || payload?.item_orders || []);
  const items = await listsRepository.reorderItems(session.workspace_id, listRecord.list_id, itemOrders, session.user_id);
  await recordListAudit(session, "list_items_reordered", "update", listRecord, listRecord, {
    item_orders: itemOrders,
  });
  await emitListEvent("lists.item.updated", session, null, listRecord, {
    item_orders: itemOrders,
    reason: "reorder",
  });
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.items_reordered");

  return { items: items.map(shapeItemForBrowser) };
}

async function checkItem(listId, itemId, session) {
  return transitionItem(listId, itemId, session, {
    action: "list_item_checked",
    eventName: "lists.item.checked",
    patch: (_previousItem, now) => ({
      checked_at: now,
      checked_by_user_id: session.user_id,
    }),
  });
}

async function uncheckItem(listId, itemId, session) {
  return transitionItem(listId, itemId, session, {
    action: "list_item_unchecked",
    eventName: "lists.item.unchecked",
    patch: () => ({
      checked_at: null,
      checked_by_user_id: null,
    }),
  });
}

async function completeItem(listId, itemId, session) {
  return transitionItem(listId, itemId, session, {
    action: "list_item_completed",
    eventName: "lists.item.completed",
    patch: (_previousItem, now) => ({
      completed_at: now,
      completed_by_user_id: session.user_id,
    }),
  });
}

async function deleteItem(listId, itemId, session) {
  return transitionItem(listId, itemId, session, {
    action: "list_item_deleted",
    changeType: "delete",
    eventName: "lists.item.deleted",
    patch: (_previousItem, now) => ({
      deleted_at: now,
    }),
  });
}

async function transitionList(listId, session, transition) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const previousList = await readListOrThrow(session, listId, transition.options || {});
  await assertCanAccessList(session, previousList, transition.operation);
  if (transition.operation === "finalize" && previousList.status === LIST_STATUSES.FINALIZED) {
    throw new AppError("List is already finalized.", 400);
  }
  const now = new Date().toISOString();
  const listRecord = await listsRepository.update(session.workspace_id, {
    ...previousList,
    ...transition.patch(previousList, now),
    updated_by_user_id: session.user_id,
  });

  await recordListAudit(session, transition.action, transition.changeType, previousList, listRecord);
  await emitListEvent(transition.eventName, session, previousList, listRecord);
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, transition.eventName);
  return { list: await shapeListForBrowser(session, listRecord) };
}

async function transitionItem(listId, itemId, session, transition) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  const { listRecord, item } = await readItemWithListOrThrow(session, listId, itemId);
  await assertCanManageItem(session, listRecord, item);
  const now = new Date().toISOString();
  const updatedItem = await listsRepository.updateItem(session.workspace_id, {
    ...item,
    ...transition.patch(item, now),
    updated_by_user_id: session.user_id,
  });

  await recordItemAudit(session, transition.action, transition.changeType || "update", item, updatedItem, listRecord);
  await emitItemEvent(transition.eventName, session, item, updatedItem, listRecord);
  await syncListSearchIndex(session.workspace_id, listRecord.list_id, transition.eventName);
  return { item: shapeItemForBrowser(updatedItem) };
}

async function readListOrThrow(session, listId, options = {}) {
  await assertListsReadable(session);
  const normalizedId = normalizeRequiredText(listId, "List ID");
  const listRecord = await listsRepository.readById(session.workspace_id, normalizedId);

  if (!listRecord || (!options.includeDeleted && listRecord.status === LIST_STATUSES.DELETED)) {
    throw new AppError("List not found.", 404);
  }

  return listRecord;
}

async function readItemWithListOrThrow(session, listId, itemId) {
  const listRecord = await readListOrThrow(session, listId);
  const normalizedItemId = normalizeRequiredText(itemId, "List item ID");
  const item = await listsRepository.readItemById(session.workspace_id, listRecord.list_id, normalizedItemId);

  if (!item || item.deleted_at) {
    throw new AppError("List item not found.", 404);
  }

  return { item, listRecord };
}

async function assertListsReadable(session) {
  if (await modulesService.canReadModule(session?.workspace_id, LIST_MODULE_ID)) {
    return;
  }

  throw new AppError("This module is disabled for this workspace.", 403);
}

async function canReadList(session, listRecord) {
  if (await permissionsService.can(session, LIST_PERMISSIONS.VIEW_ALL, listResource(listRecord))) {
    return true;
  }

  return permissionsService.can(session, LIST_PERMISSIONS.VIEW, listResource(listRecord));
}

async function assertCanAccessList(session, listRecord, operation) {
  const moduleEnabled = await modulesService.canWriteModule(session.workspace_id, LIST_MODULE_ID);
  const permissions = await readRelevantPermissions(session, listRecord);
  const access = canAccessList({
    historicalReadAccess: true,
    list: listRecord,
    listsModuleEnabled: moduleEnabled,
    operation,
    permissions,
    session,
  });

  if (!access.allowed) {
    throw new AppError(access.reason === "missing_permission" ? "You do not have permission to perform that action." : `List access denied: ${access.reason}.`, access.reason === "missing_permission" ? 403 : 400);
  }

  const permission = operation === "read"
    ? LIST_PERMISSIONS.VIEW
    : {
        create: LIST_PERMISSIONS.CREATE,
        update: LIST_PERMISSIONS.UPDATE,
        complete: LIST_PERMISSIONS.COMPLETE,
        duplicate: LIST_PERMISSIONS.DUPLICATE,
        finalize: LIST_PERMISSIONS.FINALIZE,
        archive: LIST_PERMISSIONS.ARCHIVE,
        restore: LIST_PERMISSIONS.RESTORE,
        delete: LIST_PERMISSIONS.DELETE,
        manage_items: LIST_PERMISSIONS.MANAGE_ITEMS,
        manage_reusable: LIST_PERMISSIONS.MANAGE_REUSABLE,
      }[operation] || LIST_PERMISSIONS.VIEW;

  if (operation === "read" && await permissionsService.can(session, LIST_PERMISSIONS.VIEW_ALL, listResource(listRecord))) {
    return;
  }

  await permissionsService.assertCan(session, permission, {
    ...listResource(listRecord),
    operation,
  });
}

async function assertCanManageItem(session, listRecord, item) {
  const moduleEnabled = await modulesService.canWriteModule(session.workspace_id, LIST_MODULE_ID);
  const permissions = await readRelevantPermissions(session, listRecord);
  const access = canManageListItem({
    historicalReadAccess: true,
    item: item || {},
    list: listRecord,
    listsModuleEnabled: moduleEnabled,
    operation: "manage_items",
    permissions,
    session,
  });

  if (!access.allowed) {
    throw new AppError(`List item access denied: ${access.reason}.`, access.reason === "missing_permission" ? 403 : 400);
  }

  await permissionsService.assertCan(session, LIST_PERMISSIONS.MANAGE_ITEMS, itemResource(listRecord, item || {}));
}

async function assertCanManageCatalog(session) {
  await permissionsService.assertCan(session, LIST_PERMISSIONS.MANAGE_CATALOG, {
    operation: "manage_catalog",
    workspace_id: session.workspace_id,
  });
}

async function readRelevantPermissions(session, listRecord) {
  const checks = await Promise.all(Object.values(LIST_PERMISSIONS).map(async (permission) => [
    permission,
    await permissionsService.can(session, permission, listResource(listRecord)),
  ]));

  return checks.filter(([, allowed]) => allowed).map(([permission]) => permission);
}

async function readCatalogItemOrThrow(session, catalogItemId) {
  const normalizedId = normalizeRequiredText(catalogItemId, "Catalog item ID");
  const catalogItem = await listsRepository.readCatalogItemById(session.workspace_id, normalizedId);

  if (!catalogItem || catalogItem.archived_at) {
    throw new AppError("Catalog item not found.", 404);
  }

  return catalogItem;
}

async function readPermissionSafeLinks(session, listRecord) {
  const links = await listsRepository.listLinks(session.workspace_id, listRecord.list_id);
  const visible = [];

  for (const link of links) {
    const target = await readLinkedTargetSummary(session, link, { requireAccess: false });
    visible.push(shapeLinkForBrowser(link, target));
  }

  return visible;
}

async function readLinkedTargetSummary(session, link, options = {}) {
  const target = normalizeTarget(link);
  const summary = await readLinkedTargetRecord(session, target);

  if (!summary && options.requireAccess) {
    throw new AppError("You do not have access to the linked list target.", 403);
  }

  return summary;
}

async function readLinkedTargetRecord(session, target) {
  if (target.target_type === "client") {
    const client = await clientsRepository.readById(session.workspace_id, target.target_id);
    if (!client || !(await permissionsService.can(session, "clients.manage", {
      client_id: client.id,
      operation: "read",
      workspace_id: session.workspace_id,
    }))) {
      return null;
    }

    return {
      label: client.name,
      module_id: "client-projects",
      target_id: client.id,
      target_type: "client",
      url: `clients-projects.html?client=${encodeURIComponent(client.id)}`,
    };
  }

  if (target.target_type === "project") {
    const project = await projectsRepository.readById(session.workspace_id, target.target_id);
    if (!project || !(await permissionsService.can(session, "projects.manage", {
      client_id: project.client_id,
      operation: "read",
      project_id: project.id,
      workspace_id: session.workspace_id,
    }))) {
      return null;
    }

    return {
      label: project.name,
      module_id: "client-projects",
      target_id: project.id,
      target_type: "project",
      url: `clients-projects.html?project=${encodeURIComponent(project.id)}`,
    };
  }

  if (target.target_type === "task") {
    const task = await tasksRepository.readById(session.workspace_id, target.target_id);
    if (!task || !(await permissionsService.can(session, "tasks.view", {
      client_id: task.client_id,
      operation: "read",
      project_id: task.project_id,
      task_id: task.task_id,
      workspace_id: session.workspace_id,
    }))) {
      return null;
    }

    return {
      label: task.title,
      module_id: "tasks",
      target_id: task.task_id,
      target_type: "task",
      url: `tasks.html?task=${encodeURIComponent(task.task_id)}`,
    };
  }

  if (target.target_type === "note") {
    const note = await notesRepository.readById(session.workspace_id, target.target_id);
    if (!note || note.status === "deleted" || note.deleted_at) {
      return null;
    }
    if (note.visibility === "private" && note.owner_user_id !== session.user_id) {
      return null;
    }
    if (note.security_mode === "secure" && note.owner_user_id !== session.user_id && !(await permissionsService.can(session, "notes.secure.view_all", {
      note_id: note.note_id,
      operation: "read",
      workspace_id: session.workspace_id,
    }))) {
      return null;
    }
    if (!(await permissionsService.can(session, "notes.view", {
      client_id: note.client_id,
      note_id: note.note_id,
      operation: "read",
      project_id: note.project_id,
      workspace_id: session.workspace_id,
    }))) {
      return null;
    }

    return {
      label: note.title,
      module_id: "notes",
      target_id: note.note_id,
      target_type: "note",
      url: `notes.html?note=${encodeURIComponent(note.note_id)}`,
    };
  }

  return null;
}

async function normalizeListPayload(payload = {}, session, fallback = {}) {
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  const workspaceType = settings.workspaceType || "business";
  const title = normalizeRequiredText(valueOrFallback(payload, "title", fallback.title), "List title");
  const listType = normalizeEnum(valueOrFallback(payload, "list_type", fallback.list_type) || defaultListTypeForWorkspaceType(workspaceType), LIST_TYPE_SET, "List type");
  const status = normalizeEnum(valueOrFallback(payload, "status", fallback.status) || LIST_STATUSES.ACTIVE, LIST_STATUS_SET, "List status");
  const projectId = normalizeOptionalText(valueOrFallback(payload, "project_id", fallback.project_id));
  const explicitClientId = normalizeOptionalText(valueOrFallback(payload, "client_id", fallback.client_id));
  const project = projectId ? await projectsRepository.readById(session.workspace_id, projectId) : null;

  if (projectId && !project) {
    throw new AppError("Project not found.", 404);
  }

  const context = validateListContext({
    clientId: explicitClientId,
    project: project ? { workspace_id: project.workspace_id, client_id: project.client_id || "" } : null,
    workspaceId: session.workspace_id,
    workspaceType,
  });

  if (!context.ok) {
    throw new AppError(context.message, 400);
  }

  if (explicitClientId && !project) {
    const client = await clientsRepository.readById(session.workspace_id, explicitClientId);

    if (!client) {
      throw new AppError("Client not found.", 404);
    }
  }

  const now = new Date().toISOString();

  return {
    list_id: normalizeOptionalText(fallback.list_id || payload.list_id || payload.id),
    workspace_id: session.workspace_id,
    client_id: context.clientId,
    project_id: projectId || "",
    title,
    description: normalizeOptionalText(valueOrFallback(payload, "description", fallback.description)),
    list_type: listType,
    status,
    is_reusable: Boolean(valueOrFallback(payload, "is_reusable", fallback.is_reusable)),
    source_list_id: normalizeOptionalText(valueOrFallback(payload, "source_list_id", fallback.source_list_id)),
    duplicated_from_list_id: normalizeOptionalText(valueOrFallback(payload, "duplicated_from_list_id", fallback.duplicated_from_list_id)),
    created_by_user_id: fallback.created_by_user_id || session.user_id,
    updated_by_user_id: session.user_id,
    finalized_by_user_id: normalizeOptionalText(valueOrFallback(payload, "finalized_by_user_id", fallback.finalized_by_user_id)),
    created_at: fallback.created_at || now,
    updated_at: now,
    completed_at: normalizeOptionalText(valueOrFallback(payload, "completed_at", fallback.completed_at)),
    finalized_at: normalizeOptionalText(valueOrFallback(payload, "finalized_at", fallback.finalized_at)),
    archived_at: normalizeOptionalText(valueOrFallback(payload, "archived_at", fallback.archived_at)),
    deleted_at: normalizeOptionalText(valueOrFallback(payload, "deleted_at", fallback.deleted_at)),
    metadata_json: normalizeMetadata(valueOrFallback(payload, "metadata_json", fallback.metadata_json)),
  };
}

function normalizeItemPayload(payload = {}, session, listRecord, fallback = {}) {
  const context = validateListItemContext({
    itemWorkspaceId: session.workspace_id,
    list: listRecord,
  });

  if (!context.ok) {
    throw new AppError(context.message, 400);
  }

  const itemName = normalizeRequiredText(valueOrFallback(payload, "item_name", fallback.item_name) || payload.itemName || payload.name, "Item name");
  const purchaseStatus = normalizeEnum(valueOrFallback(payload, "purchase_status", fallback.purchase_status) || LIST_ITEM_PURCHASE_STATUSES.NEEDED, PURCHASE_STATUS_SET, "Purchase status");

  return {
    list_item_id: normalizeOptionalText(fallback.list_item_id || payload.list_item_id || payload.id),
    workspace_id: listRecord.workspace_id,
    list_id: listRecord.list_id,
    catalog_item_id: normalizeOptionalText(valueOrFallback(payload, "catalog_item_id", fallback.catalog_item_id)),
    item_name: itemName,
    quantity: normalizeNonNegativeNumber(valueOrFallback(payload, "quantity", fallback.quantity) ?? 1, "Quantity"),
    unit: normalizeOptionalText(valueOrFallback(payload, "unit", fallback.unit)),
    needed_by_date: normalizeOptionalDate(valueOrFallback(payload, "needed_by_date", fallback.needed_by_date), "Needed by date"),
    vendor_name: normalizeOptionalText(valueOrFallback(payload, "vendor_name", fallback.vendor_name)),
    url: normalizeOptionalText(valueOrFallback(payload, "url", fallback.url)),
    estimated_cost: normalizeOptionalNonNegativeNumber(valueOrFallback(payload, "estimated_cost", fallback.estimated_cost), "Estimated cost"),
    actual_cost: normalizeOptionalNonNegativeNumber(valueOrFallback(payload, "actual_cost", fallback.actual_cost), "Actual cost"),
    purchase_status: purchaseStatus,
    tracking_id: normalizeOptionalText(valueOrFallback(payload, "tracking_id", fallback.tracking_id)),
    notes: normalizeOptionalText(valueOrFallback(payload, "notes", fallback.notes)),
    assigned_user_id: normalizeOptionalText(valueOrFallback(payload, "assigned_user_id", fallback.assigned_user_id)),
    created_by_user_id: fallback.created_by_user_id || session.user_id,
    updated_by_user_id: session.user_id,
    checked_at: normalizeOptionalText(valueOrFallback(payload, "checked_at", fallback.checked_at)),
    checked_by_user_id: normalizeOptionalText(valueOrFallback(payload, "checked_by_user_id", fallback.checked_by_user_id)),
    completed_at: normalizeOptionalText(valueOrFallback(payload, "completed_at", fallback.completed_at)),
    completed_by_user_id: normalizeOptionalText(valueOrFallback(payload, "completed_by_user_id", fallback.completed_by_user_id)),
    sort_order: normalizeInteger(valueOrFallback(payload, "sort_order", fallback.sort_order) || 0, "Sort order"),
    deleted_at: normalizeOptionalText(valueOrFallback(payload, "deleted_at", fallback.deleted_at)),
    metadata_json: normalizeMetadata(valueOrFallback(payload, "metadata_json", fallback.metadata_json)),
  };
}

async function normalizeCatalogPayload(payload = {}, session, fallback = {}) {
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  const workspaceType = settings.workspaceType || "business";
  const itemName = normalizeRequiredText(valueOrFallback(payload, "item_name", fallback.item_name) || payload.itemName || payload.name, "Catalog item name");
  const listType = normalizeOptionalText(valueOrFallback(payload, "list_type", fallback.list_type));
  const projectId = normalizeOptionalText(valueOrFallback(payload, "project_id", fallback.project_id));
  const explicitClientId = normalizeOptionalText(valueOrFallback(payload, "client_id", fallback.client_id));
  const project = projectId ? await projectsRepository.readById(session.workspace_id, projectId) : null;

  if (listType && !LIST_TYPE_SET.has(listType)) {
    throw new AppError(`List type '${listType}' is not supported.`, 400);
  }

  if (projectId && !project) {
    throw new AppError("Project not found.", 404);
  }

  const context = validateListContext({
    clientId: explicitClientId,
    project: project ? { workspace_id: project.workspace_id, client_id: project.client_id || "" } : null,
    workspaceId: session.workspace_id,
    workspaceType,
  });

  if (!context.ok) {
    throw new AppError(context.message, 400);
  }

  if (explicitClientId && !project) {
    const client = await clientsRepository.readById(session.workspace_id, explicitClientId);

    if (!client) {
      throw new AppError("Client not found.", 404);
    }
  }

  const now = new Date().toISOString();

  return {
    archived_at: normalizeOptionalText(valueOrFallback(payload, "archived_at", fallback.archived_at)),
    catalog_item_id: normalizeOptionalText(fallback.catalog_item_id || payload.catalog_item_id || payload.catalogItemId || payload.id),
    client_id: context.clientId,
    created_at: fallback.created_at || now,
    created_by_user_id: fallback.created_by_user_id || session.user_id,
    estimated_cost: normalizeOptionalNonNegativeNumber(valueOrFallback(payload, "estimated_cost", fallback.estimated_cost), "Estimated cost"),
    item_name: itemName,
    last_used_at: normalizeOptionalText(valueOrFallback(payload, "last_used_at", fallback.last_used_at)),
    list_type: listType,
    metadata_json: normalizeMetadata(valueOrFallback(payload, "metadata_json", fallback.metadata_json)),
    normalized_name: normalizeCatalogName(itemName),
    notes: normalizeOptionalText(valueOrFallback(payload, "notes", fallback.notes)),
    project_id: projectId || "",
    quantity: normalizeNonNegativeNumber(valueOrFallback(payload, "quantity", fallback.quantity) ?? 1, "Quantity"),
    unit: normalizeOptionalText(valueOrFallback(payload, "unit", fallback.unit)),
    updated_at: now,
    updated_by_user_id: session.user_id,
    url: normalizeOptionalText(valueOrFallback(payload, "url", fallback.url)),
    use_count: normalizeInteger(valueOrFallback(payload, "use_count", fallback.use_count) || 0, "Use count"),
    vendor_name: normalizeOptionalText(valueOrFallback(payload, "vendor_name", fallback.vendor_name)),
    workspace_id: session.workspace_id,
  };
}

async function resolveCatalogItemSnapshot(payload = {}, session) {
  const catalogItemId = normalizeOptionalText(payload.catalog_item_id || payload.catalogItemId);

  if (!catalogItemId) {
    return null;
  }

  return readCatalogItemOrThrow(session, catalogItemId);
}

function catalogItemToItemFallback(catalogItem = {}) {
  return {
    catalog_item_id: catalogItem.catalog_item_id,
    estimated_cost: catalogItem.estimated_cost,
    item_name: catalogItem.item_name,
    notes: catalogItem.notes,
    quantity: catalogItem.quantity ?? 1,
    unit: catalogItem.unit,
    url: catalogItem.url,
    vendor_name: catalogItem.vendor_name,
  };
}

function duplicateItemPayload(item, listRecord, session, index) {
  return {
    assigned_user_id: item.assigned_user_id || "",
    actual_cost: null,
    catalog_item_id: item.catalog_item_id || "",
    checked_at: null,
    checked_by_user_id: null,
    completed_at: null,
    completed_by_user_id: null,
    created_by_user_id: session.user_id,
    deleted_at: null,
    estimated_cost: item.estimated_cost,
    item_name: item.item_name,
    list_id: listRecord.list_id,
    list_item_id: randomUUID(),
    metadata_json: {
      ...(item.metadata_json || {}),
      duplicated_from_list_item_id: item.list_item_id,
      source_list_id: listRecord.source_list_id || listRecord.duplicated_from_list_id || "",
    },
    needed_by_date: item.needed_by_date || "",
    notes: item.notes || "",
    purchase_status: LIST_ITEM_PURCHASE_STATUSES.NEEDED,
    quantity: item.quantity ?? 1,
    sort_order: index * 10,
    tracking_id: "",
    unit: item.unit || "",
    updated_by_user_id: session.user_id,
    url: item.url || "",
    vendor_name: item.vendor_name || "",
    workspace_id: listRecord.workspace_id,
  };
}

async function nextSortOrder(workspaceId, listId) {
  const items = await listsRepository.listItems(workspaceId, listId);
  return items.length === 0 ? 0 : Math.max(...items.map((item) => Number(item.sort_order) || 0)) + 10;
}

function normalizeListQuery(query = {}) {
  const status = normalizeListStatusFilter(query.status || query.status_filter);
  const archiveState = normalizeToken(query.archiveState || query.archive_state || query.archive || query.archivedState || query.archived_state);
  const effectiveStatus = archiveState === "archived" || archiveState === "deleted"
    ? archiveState
    : status;
  const reusable = normalizeReusableFilter(query.reusable || query.reusableFilter || query.reusable_filter || query.isReusable || query.is_reusable);
  const listType = normalizeListTypeFilter(query.listType || query.list_type || query.type);
  const clientId = hasQueryField(query, ["clientId", "client_id", "client"])
    ? normalizeOptionalText(query.clientId ?? query.client_id ?? query.client)
    : "all";
  const projectId = hasQueryField(query, ["projectId", "project_id", "project"])
    ? normalizeOptionalText(query.projectId ?? query.project_id ?? query.project)
    : "all";
  const assigneeId = hasQueryField(query, ["assigneeId", "assignee_id", "assignee"])
    ? normalizeOptionalText(query.assigneeId ?? query.assignee_id ?? query.assignee)
    : "all";
  const neededByDate = normalizeOptionalDate(query.neededByDate || query.needed_by_date || query.needed || "", "Needed by date");
  const sort = normalizeListSort(query.sort || query.sortBy || query.sort_by);
  const targetType = normalizeOptionalText(query.targetType || query.target_type || query.linkedTargetType || query.linked_target_type);
  const targetId = normalizeOptionalText(query.targetId || query.target_id || query.linkedTargetId || query.linked_target_id);
  const moduleId = normalizeOptionalText(query.moduleId || query.module_id || query.linkedModuleId || query.linked_module_id);
  const tagIds = query.tagIds || query.tag_ids || query.tags || query.tag || query.tag_id || [];
  const includeDeleted = effectiveStatus === "deleted" || effectiveStatus === "all" ||
    archiveState === "all" ||
    query.includeDeleted === true ||
    query.include_deleted === "true";

  return {
    archiveState,
    assigneeId,
    clientId,
    listType,
    neededByDate,
    projectId,
    repositoryFilters: {
      clientId: clientId === "all" ? "" : clientId,
      createdByUserId: normalizeOptionalText(query.createdByUserId || query.created_by_user_id),
      includeDeleted,
      isReusable: reusable === "all" ? undefined : reusable === "yes",
      listType: listType === "all" ? "" : listType,
      projectId: projectId === "all" ? "" : projectId,
      status: effectiveStatus === "all" ? "" : effectiveStatus,
    },
    response: {
      archiveState: archiveState || "current",
      assigneeId,
      clientId,
      listType,
      neededByDate,
      reusable,
      sort,
      status: effectiveStatus,
      targetId,
      targetType,
    },
    reusable,
    sort,
    status: effectiveStatus,
    tagIds,
    targetId,
    targetType,
    moduleId,
  };
}

function normalizeListStatusFilter(value) {
  const status = normalizeToken(value || LIST_STATUSES.ACTIVE);
  if (!status || status === "current") {
    return LIST_STATUSES.ACTIVE;
  }
  if (status === "all") {
    return "all";
  }
  if (!LIST_STATUS_SET.has(status)) {
    throw new AppError(`List status '${status}' is not supported.`, 400);
  }
  return status;
}

function normalizeListTypeFilter(value) {
  const listType = normalizeToken(value || "all");
  if (!listType || listType === "all") {
    return "all";
  }
  if (!LIST_TYPE_SET.has(listType)) {
    throw new AppError(`List type '${listType}' is not supported.`, 400);
  }
  return listType;
}

function normalizeReusableFilter(value) {
  if (value === true || value === "true" || value === "yes" || value === "reusable") {
    return "yes";
  }
  if (value === false || value === "false" || value === "no" || value === undefined || value === null || value === "") {
    return "no";
  }
  if (value === "all") {
    return "all";
  }
  throw new AppError(`Reusable filter '${value}' is not supported.`, 400);
}

function normalizeListSort(value) {
  const sort = normalizeToken(value || "updated_desc");
  const supportedSorts = new Set([
    "finalized_desc",
    "incomplete_desc",
    "needed_asc",
    "progress_desc",
    "source_asc",
    "status_asc",
    "title_asc",
    "type_asc",
    "updated_desc",
  ]);
  if (!supportedSorts.has(sort)) {
    throw new AppError(`List sort '${sort}' is not supported.`, 400);
  }
  return sort;
}

function normalizeToken(value) {
  return normalizeOptionalText(value).toLowerCase();
}

function hasQueryField(query = {}, keys = []) {
  return keys.some((key) => Object.hasOwn(query, key));
}

function listMatchesCanonicalQuery(listRecord = {}, query = {}, session = {}) {
  if (query.archiveState === "current" && ["archived", "deleted"].includes(listRecord.status)) {
    return false;
  }
  if (query.status !== "all" && listRecord.status !== query.status) {
    return false;
  }
  if (query.reusable !== "all" && Boolean(listRecord.is_reusable) !== (query.reusable === "yes")) {
    return false;
  }
  if (query.listType !== "all" && listRecord.list_type !== query.listType) {
    return false;
  }
  if (query.clientId !== "all" && (listRecord.client_id || "") !== query.clientId) {
    return false;
  }
  if (query.projectId !== "all" && (listRecord.project_id || "") !== query.projectId) {
    return false;
  }
  if (query.assigneeId !== "all" && !matchesAssigneeFilter(listRecord, query.assigneeId, session.user_id)) {
    return false;
  }
  if (query.neededByDate && !(listRecord.progress?.neededByDates || []).includes(query.neededByDate)) {
    return false;
  }
  if ((query.targetType || query.targetId || query.moduleId) && !matchesLinkedRecordFilter(listRecord, query)) {
    return false;
  }
  return true;
}

function matchesAssigneeFilter(listRecord = {}, assigneeId = "all", currentUserId = "") {
  if (assigneeId === "all") {
    return true;
  }
  const assignedUserIds = new Set(listRecord.progress?.assignedUserIds || []);
  if (assigneeId === "me") {
    return currentUserId ? assignedUserIds.has(currentUserId) : false;
  }
  if (assigneeId === "") {
    return (listRecord.progress?.unassignedItemCount || 0) > 0;
  }
  return assignedUserIds.has(assigneeId);
}

function matchesLinkedRecordFilter(listRecord = {}, query = {}) {
  return (listRecord.links || []).some((link) => {
    const target = link.target;
    if (!target) {
      return false;
    }
    if (query.targetType && target.target_type !== query.targetType) {
      return false;
    }
    if (query.targetId && target.target_id !== query.targetId) {
      return false;
    }
    if (query.moduleId && target.module_id !== query.moduleId) {
      return false;
    }
    return true;
  });
}

function sortCanonicalLists(lists = [], query = {}) {
  return [...lists].sort((left, right) => {
    const fallback = compareText(left.title, right.title) ||
      compareText(left.list_type, right.list_type) ||
      compareText(left.status, right.status) ||
      compareText(left.list_id, right.list_id);

    if (query.sort === "title_asc") {
      return fallback;
    }
    if (query.sort === "type_asc") {
      return compareText(left.list_type, right.list_type) || fallback;
    }
    if (query.sort === "status_asc") {
      return compareText(left.status, right.status) || fallback;
    }
    if (query.sort === "needed_asc") {
      return compareDateAsc(left.progress?.earliestNeededByDate, right.progress?.earliestNeededByDate) || fallback;
    }
    if (query.sort === "finalized_desc") {
      return compareDateDesc(left.finalized_at, right.finalized_at) || fallback;
    }
    if (query.sort === "progress_desc" || query.sort === "incomplete_desc") {
      return Number(right.progress?.incompleteItemCount || 0) - Number(left.progress?.incompleteItemCount || 0) || fallback;
    }
    if (query.sort === "source_asc") {
      return compareText(sourceSortLabel(left), sourceSortLabel(right)) || fallback;
    }
    return compareDateDesc(left.progress?.lastActivityAt || left.updated_at, right.progress?.lastActivityAt || right.updated_at) || fallback;
  });
}

function sourceSortLabel(listRecord = {}) {
  return [
    listRecord.is_reusable ? "0-reusable" : "1-working",
    listRecord.sourceContext?.sourceList?.title || listRecord.sourceContext?.duplicatedFrom?.title || "",
    listRecord.title || "",
  ].join(" ");
}

function compareDateAsc(left, right) {
  return String(left || "9999-12-31T23:59:59.999Z").localeCompare(String(right || "9999-12-31T23:59:59.999Z"));
}

function compareDateDesc(left, right) {
  return String(right || "").localeCompare(String(left || ""));
}

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
}

function normalizeItemOrders(value) {
  if (!Array.isArray(value)) {
    throw new AppError("Item order payload must be an array.", 400);
  }

  return value.map((entry) => ({
    list_item_id: normalizeRequiredText(entry.list_item_id || entry.itemId || entry.item_id || entry.id, "List item ID"),
    sort_order: normalizeInteger(entry.sort_order ?? entry.sortOrder, "Sort order"),
  }));
}

function valueOrFallback(object = {}, snakeKey, fallbackValue) {
  const camelKey = snakeKey.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());

  if (Object.hasOwn(object, snakeKey)) {
    return object[snakeKey];
  }

  if (Object.hasOwn(object, camelKey)) {
    return object[camelKey];
  }

  return fallbackValue;
}

function normalizeRequiredText(value, label) {
  const text = normalizeOptionalText(value);

  if (!text) {
    throw new AppError(`${label} is required.`, 400);
  }

  return text;
}

function normalizeOptionalText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeEnum(value, allowedValues, label) {
  const text = normalizeRequiredText(value, label);

  if (!allowedValues.has(text)) {
    throw new AppError(`${label} '${text}' is not supported.`, 400);
  }

  return text;
}

function normalizeOptionalDate(value, label) {
  const text = normalizeOptionalText(value);

  if (!text) {
    return "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new AppError(`${label} must use YYYY-MM-DD format.`, 400);
  }

  return text;
}

function normalizeNonNegativeNumber(value, label) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new AppError(`${label} must be a non-negative number.`, 400);
  }

  return number;
}

function normalizeOptionalNonNegativeNumber(value, label) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return normalizeNonNegativeNumber(value, label);
}

function normalizeInteger(value, label) {
  const number = Number(value);

  if (!Number.isInteger(number)) {
    throw new AppError(`${label} must be an integer.`, 400);
  }

  return number;
}

function normalizeSuggestionLimit(value) {
  const number = Number(value || 8);

  if (!Number.isFinite(number)) {
    return 8;
  }

  return Math.max(1, Math.min(Math.trunc(number), 20));
}

function normalizeCatalogName(value) {
  return normalizeOptionalText(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeLinkPayload(payload = {}, listRecord, session) {
  const target = normalizeTarget(payload);

  return {
    created_by_user_id: session.user_id,
    link_role: normalizeOptionalText(payload.linkRole || payload.link_role) || "related",
    list_id: listRecord.list_id,
    list_link_id: normalizeOptionalText(payload.listLinkId || payload.list_link_id || payload.id) || randomUUID(),
    metadata_json: normalizeMetadata(payload.metadata_json || payload.metadata),
    module_id: target.module_id,
    target_id: target.target_id,
    target_type: target.target_type,
    workspace_id: session.workspace_id,
  };
}

function normalizeTarget(payload = {}) {
  const targetType = normalizeRequiredText(payload.targetType || payload.target_type, "Target type");
  const targetId = normalizeRequiredText(payload.targetId || payload.target_id, "Target ID");
  const moduleId = normalizeOptionalText(payload.moduleId || payload.module_id) || moduleIdForTargetType(targetType);

  if (!["client", "project", "task", "note"].includes(targetType)) {
    throw new AppError(`Linked target type '${targetType}' is not supported for Lists.`, 400);
  }

  if (!moduleId) {
    throw new AppError(`Linked target type '${targetType}' is not supported for Lists.`, 400);
  }

  return {
    module_id: moduleId,
    target_id: targetId,
    target_type: targetType,
  };
}

function moduleIdForTargetType(targetType) {
  return {
    client: "client-projects",
    note: "notes",
    project: "client-projects",
    task: "tasks",
  }[targetType] || "";
}

function normalizeMetadata(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function shapeListForBrowser(session, listRecord = {}) {
  const [progress, linkedRecords, sourceContext] = await Promise.all([
    readListProgressSummary(session, listRecord),
    readPermissionSafeLinks(session, listRecord),
    readSourceContext(session, listRecord),
  ]);

  return {
    ...listRecord,
    id: listRecord.list_id,
    isBillOfMaterials: listRecord.list_type === LIST_TYPES.BILL_OF_MATERIALS,
    isReusable: Boolean(listRecord.is_reusable),
    links: linkedRecords,
    progress,
    resumeContext: buildListResumeContext(listRecord, progress, linkedRecords),
    sourceContext,
  };
}

async function readListProgressSummary(session, listRecord = {}) {
  const items = listRecord.list_id
    ? await listsRepository.listItems(session.workspace_id, listRecord.list_id, { includeDeleted: false })
    : [];
  const nextUncheckedItem = items
    .slice()
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
    .find((item) => !item.checked_at && !item.completed_at);
  const neededDates = items
    .map((item) => item.needed_by_date)
    .filter(Boolean)
    .sort();
  const activityCandidates = [
    listRecord.updated_at,
    listRecord.created_at,
    ...items.flatMap((item) => [
      item.updated_at,
      item.checked_at,
      item.completed_at,
      item.deleted_at,
      item.created_at,
    ]),
  ].filter(Boolean).sort();

  return {
    assignedUserIds: [...new Set(items.map((item) => item.assigned_user_id).filter(Boolean))].sort(),
    checkedItemCount: items.filter((item) => Boolean(item.checked_at)).length,
    completedItemCount: items.filter((item) => Boolean(item.completed_at)).length,
    earliestNeededByDate: neededDates[0] || null,
    incompleteItemCount: items.filter((item) => !item.checked_at && !item.completed_at).length,
    lastActivityAt: activityCandidates.at(-1) || null,
    neededByDates: [...new Set(neededDates)],
    nextUncheckedItemLabel: nextUncheckedItem?.item_name || "",
    totalItemCount: items.length,
    unassignedItemCount: items.filter((item) => !item.assigned_user_id).length,
  };
}

function buildListResumeContext(listRecord = {}, progress = {}, links = []) {
  const sourceUrl = listRecord.list_id ? `lists.html?list=${encodeURIComponent(listRecord.list_id)}` : "lists.html";

  return {
    client_id: listRecord.client_id || "",
    linkedRecords: links.map((link) => ({
      id: link.list_link_id || link.id || "",
      isAvailable: Boolean(link.target),
      label: link.target?.label || "",
      linkRole: link.link_role || "",
      moduleId: link.module_id || link.target?.module_id || "",
      sourceUrl: link.target?.url || "",
      targetId: link.target_id || link.target?.target_id || "",
      targetType: link.target_type || link.target?.target_type || "",
    })),
    project_id: listRecord.project_id || "",
    progress: { ...progress },
    sourceUrl,
    status: listRecord.status || "",
    title: listRecord.title || "",
  };
}

async function readSourceContext(session, listRecord = {}) {
  const [duplicatedFrom, sourceList] = await Promise.all([
    readSourceSummary(session, listRecord.duplicated_from_list_id),
    readSourceSummary(session, listRecord.source_list_id),
  ]);

  return {
    duplicatedFrom,
    sourceList,
  };
}

async function readSourceSummary(session, listId) {
  const normalizedId = normalizeOptionalText(listId);

  if (!normalizedId) {
    return null;
  }

  const sourceList = await listsRepository.readById(session.workspace_id, normalizedId);
  if (!sourceList || !(await canReadList(session, sourceList))) {
    return null;
  }

  return {
    finalized_at: sourceList.finalized_at || null,
    is_reusable: Boolean(sourceList.is_reusable),
    list_id: sourceList.list_id,
    list_type: sourceList.list_type,
    status: sourceList.status,
    title: sourceList.title,
  };
}

function shapeItemForBrowser(item = {}) {
  return {
    ...item,
    id: item.list_item_id,
  };
}

function shapeCatalogItemForBrowser(item = {}) {
  return {
    ...item,
    id: item.catalog_item_id,
  };
}

function shapeLinkForBrowser(link = {}, target = null) {
  return {
    ...link,
    id: link.list_link_id,
    target: target ? { ...target } : null,
    targetAccess: target ? "available" : "unavailable",
  };
}

function sanitizeLinkForAudit(link = {}) {
  return {
    link_role: link.link_role || "",
    list_link_id: link.list_link_id || "",
    module_id: link.module_id || "",
    target_id: link.target_id || "",
    target_type: link.target_type || "",
  };
}

async function syncListSearchIndex(workspaceId, listId, reason) {
  await searchIndexSyncService.reindexRecord({
    moduleId: LIST_MODULE_ID,
    reason,
    recordId: listId,
    recordType: "list",
    workspaceId,
  }, { swallowErrors: true });
}

async function recordListAudit(session, action, changeType, previousValue, newValue, metadata = {}) {
  await auditService.record({
    session,
    action,
    allowUnknownRecordType: true,
    changeType,
    recordType: "list",
    recordId: newValue?.list_id || previousValue?.list_id,
    recordLabel: newValue?.title || previousValue?.title || "List",
    recordUrl: "",
    previousValue,
    newValue,
    metadata: sanitizeListLifecyclePayload({
      metadata,
      newValue,
      previousValue,
    }),
  });
}

async function recordItemAudit(session, action, changeType, previousValue, newValue, listRecord) {
  await auditService.record({
    session,
    action,
    allowUnknownRecordType: true,
    changeType,
    recordType: "list_item",
    recordId: newValue?.list_item_id || previousValue?.list_item_id,
    recordLabel: newValue?.item_name || previousValue?.item_name || "List Item",
    recordUrl: "",
    previousValue,
    newValue,
    metadata: sanitizeListLifecyclePayload({
      metadata: {
        list_id: listRecord?.list_id,
        title: listRecord?.title,
      },
      newValue,
      previousValue,
    }),
  });
}

async function recordLinkAudit(session, action, changeType, previousValue, newValue, listRecord) {
  await auditService.record({
    session,
    action,
    allowUnknownRecordType: true,
    changeType,
    recordType: "list_link",
    recordId: newValue?.list_link_id || previousValue?.list_link_id,
    recordLabel: `${newValue?.target_type || previousValue?.target_type || "Link"}:${newValue?.target_id || previousValue?.target_id || ""}`,
    recordUrl: "",
    previousValue,
    newValue,
    metadata: sanitizeListLifecyclePayload({
      metadata: {
        list_id: listRecord?.list_id,
        title: listRecord?.title,
        ...sanitizeLinkForAudit(newValue || previousValue),
      },
      newValue,
      previousValue,
    }),
  });
}

async function recordCatalogAudit(session, action, changeType, previousValue, newValue) {
  await auditService.record({
    session,
    action,
    allowUnknownRecordType: true,
    changeType,
    recordType: "list_item_catalog",
    recordId: newValue?.catalog_item_id || previousValue?.catalog_item_id,
    recordLabel: newValue?.item_name || previousValue?.item_name || "Catalog Item",
    recordUrl: "",
    previousValue: previousValue ? sanitizeCatalogForAudit(previousValue) : null,
    newValue: newValue ? sanitizeCatalogForAudit(newValue) : null,
    metadata: sanitizeListLifecyclePayload({
      metadata: sanitizeCatalogForAudit(newValue || previousValue || {}),
      newValue: {
        ...(newValue || previousValue || {}),
        list_id: "",
        list_item_id: "",
        status: "",
      },
    }),
  });
}

async function emitListEvent(eventName, session, previousValue, newValue, metadata = {}) {
  const progress = newValue?.list_id
    ? await readListProgressSummary(session, newValue)
    : {};

  await modulesService.emitInternalEvent(eventName, {
    actorUserId: session.user_id,
    metadata: sanitizeListLifecyclePayload({
      metadata: {
        ...metadata,
        ...safeResumeMetadataForList(newValue || previousValue || {}, progress),
      },
      newValue,
      previousValue,
    }),
    moduleId: LIST_MODULE_ID,
    newValue: sanitizeListLifecyclePayload({ newValue }),
    previousValue: previousValue ? sanitizeListLifecyclePayload({ newValue: previousValue }) : null,
    recordId: newValue?.list_id || previousValue?.list_id || "",
    recordType: "list",
    session,
    workspaceId: session.workspace_id,
  });
}

async function emitCatalogEvent(eventName, session, previousValue, newValue) {
  await modulesService.emitInternalEvent(eventName, {
    actorUserId: session.user_id,
    metadata: sanitizeListLifecyclePayload({
      metadata: sanitizeCatalogForAudit(newValue || previousValue || {}),
      newValue: {
        ...(newValue || previousValue || {}),
        list_id: "",
        list_item_id: "",
        status: "",
      },
    }),
    moduleId: LIST_MODULE_ID,
    newValue: newValue ? sanitizeCatalogForAudit(newValue) : null,
    previousValue: previousValue ? sanitizeCatalogForAudit(previousValue) : null,
    recordId: newValue?.catalog_item_id || previousValue?.catalog_item_id || "",
    recordType: "list_item_catalog",
    session,
    workspaceId: session.workspace_id,
  });
}

async function emitItemEvent(eventName, session, previousValue, newValue, listRecord) {
  const progress = listRecord?.list_id
    ? await readListProgressSummary(session, listRecord)
    : {};

  await modulesService.emitInternalEvent(eventName, {
    actorUserId: session.user_id,
    metadata: sanitizeListLifecyclePayload({
      metadata: {
        list_id: listRecord?.list_id,
        ...safeResumeMetadataForList(listRecord || {}, progress),
        title: listRecord?.title,
      },
      newValue,
      previousValue,
    }),
    moduleId: LIST_MODULE_ID,
    newValue: sanitizeListLifecyclePayload({ newValue }),
    previousValue: previousValue ? sanitizeListLifecyclePayload({ newValue: previousValue }) : null,
    recordId: newValue?.list_item_id || previousValue?.list_item_id || "",
    recordType: "list_item",
    session,
    workspaceId: session.workspace_id,
  });
}

function sanitizeCatalogForAudit(item = {}) {
  return {
    archived_at: item.archived_at || "",
    catalog_item_id: item.catalog_item_id || "",
    client_id: item.client_id || "",
    created_at: item.created_at || "",
    item_name: item.item_name || "",
    list_type: item.list_type || "",
    normalized_name: item.normalized_name || "",
    project_id: item.project_id || "",
    quantity: item.quantity ?? null,
    unit: item.unit || "",
    updated_at: item.updated_at || "",
    use_count: item.use_count ?? 0,
    vendor_name: item.vendor_name || "",
    workspace_id: item.workspace_id || "",
  };
}

function safeResumeMetadataForList(listRecord = {}, progress = {}) {
  return {
    checked_item_count: progress.checkedItemCount ?? 0,
    client_id: listRecord.client_id || "",
    completed_item_count: progress.completedItemCount ?? 0,
    earliest_needed_by_date: progress.earliestNeededByDate || "",
    last_activity_at: progress.lastActivityAt || listRecord.updated_at || listRecord.created_at || "",
    next_unchecked_item_label: progress.nextUncheckedItemLabel || "",
    project_id: listRecord.project_id || "",
    source_url: listRecord.list_id ? `lists.html?list=${encodeURIComponent(listRecord.list_id)}` : "lists.html",
    total_item_count: progress.totalItemCount ?? 0,
  };
}

const listsService = {
  archive,
  checkItem,
  complete,
  completeItem,
  createCatalogItem,
  create,
  createItem,
  deleteItem,
  duplicate,
  finalize,
  createLink,
  list,
  listLinks,
  markReusable,
  read,
  reopen,
  reorderItems,
  restore,
  removeLink,
  softDelete,
  suggestItems,
  uncheckItem,
  unmarkReusable,
  update,
  updateCatalogItem,
  updateItem,
};

export { listsService };
