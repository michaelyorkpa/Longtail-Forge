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

const LIST_TYPE_SET = new Set(LIST_TYPE_VALUES);
const LIST_STATUS_SET = new Set(LIST_STATUS_VALUES);
const PURCHASE_STATUS_SET = new Set(LIST_ITEM_PURCHASE_STATUS_VALUES);

async function list(session, query = {}) {
  await assertListsReadable(session);
  const lists = await listsRepository.list(session.workspace_id, normalizeListFilters(query));
  const readableLists = [];

  for (const listRecord of lists) {
    if (await canReadList(session, listRecord)) {
      readableLists.push(await shapeListForBrowser(session, listRecord));
    }
  }

  return { lists: readableLists };
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

async function createCatalogItem(payload, session) {
  await assertModuleWriteEnabled(session, LIST_MODULE_ID);
  await assertCanManageCatalog(session);
  const normalized = await normalizeCatalogPayload(payload, session, {
    catalog_item_id: payload?.catalog_item_id || payload?.id || randomUUID(),
    created_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
  });
  const catalogItem = await listsRepository.createCatalogItem(session.workspace_id, normalized);

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

function normalizeListFilters(query = {}) {
  return {
    clientId: normalizeOptionalText(query.clientId || query.client_id),
    createdByUserId: normalizeOptionalText(query.createdByUserId || query.created_by_user_id),
    includeDeleted: query.includeDeleted === true || query.include_deleted === "true",
    isReusable: query.isReusable === undefined && query.is_reusable === undefined
      ? undefined
      : query.isReusable === true || query.is_reusable === true || query.isReusable === "true" || query.is_reusable === "true",
    listType: normalizeOptionalText(query.listType || query.list_type),
    projectId: normalizeOptionalText(query.projectId || query.project_id),
    status: normalizeOptionalText(query.status),
  };
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
  return {
    ...listRecord,
    id: listRecord.list_id,
    isBillOfMaterials: listRecord.list_type === LIST_TYPES.BILL_OF_MATERIALS,
    isReusable: Boolean(listRecord.is_reusable),
    sourceContext: await readSourceContext(session, listRecord),
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

async function emitListEvent(eventName, session, previousValue, newValue, metadata = {}) {
  await modulesService.emitInternalEvent(eventName, {
    actorUserId: session.user_id,
    metadata: sanitizeListLifecyclePayload({
      metadata,
      newValue,
      previousValue,
    }),
    moduleId: LIST_MODULE_ID,
    newValue: sanitizeListLifecyclePayload({ newValue }),
    previousValue: previousValue ? sanitizeListLifecyclePayload({ newValue: previousValue }) : null,
    recordId: newValue?.list_id || previousValue?.list_id || "",
    recordType: "list",
    workspaceId: session.workspace_id,
  });
}

async function emitItemEvent(eventName, session, previousValue, newValue, listRecord) {
  await modulesService.emitInternalEvent(eventName, {
    actorUserId: session.user_id,
    metadata: sanitizeListLifecyclePayload({
      metadata: {
        list_id: listRecord?.list_id,
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
    workspaceId: session.workspace_id,
  });
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
  list,
  markReusable,
  read,
  reopen,
  reorderItems,
  restore,
  softDelete,
  suggestItems,
  uncheckItem,
  unmarkReusable,
  update,
  updateCatalogItem,
  updateItem,
};

export { listsService };
