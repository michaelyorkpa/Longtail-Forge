// @ts-check
import {
  CreateListItemSchema,
  ReorderListItemsSchema,
  UpdateListItemSchema,
  parseListsEdgePayload,
} from "./lists.contracts.js";
import {
  LIST_ITEM_PURCHASE_STATUSES,
  LIST_MODULE_ID,
} from "./storage-contract.js";
import { assertModuleWriteEnabled } from "../../core/modules/module-access.js";
import { AppError } from "../../core/errors.js";

/** @typedef {import("../../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */
/** @typedef {import("../../types/lists-item-contracts.js").ListsCatalogItemRecord} ListsCatalogItemRecord */
/** @typedef {import("../../types/lists-item-contracts.js").ListsItemAggregateDependencies} ListsItemAggregateDependencies */
/** @typedef {import("../../types/lists-item-contracts.js").ListsItemAggregateService} ListsItemAggregateService */
/** @typedef {import("../../types/lists-item-contracts.js").ListsItemListRecord} ListsItemListRecord */
/** @typedef {import("../../types/lists-item-contracts.js").ListsItemProgressBatch} ListsItemProgressBatch */
/** @typedef {import("../../types/lists-item-contracts.js").ListsItemProgressSummary} ListsItemProgressSummary */
/** @typedef {import("../../types/lists-item-contracts.js").ListsItemRecord} ListsItemRecord */

/**
 * Create the Lists-owned list-item aggregate while retaining list access,
 * catalog, audit, event, and search owners as explicit dependencies.
 *
 * @param {ListsItemAggregateDependencies} dependencies
 * @returns {ListsItemAggregateService}
 */
function createListItemsService(dependencies) {
  /** @param {string} listId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
  async function createItem(listId, rawPayload, session) {
    await assertModuleWriteEnabled(session, LIST_MODULE_ID);
    const listRecord = asListRecord(await dependencies.readListOrThrow(session, listId));
    await dependencies.assertCanManageItem(session, listRecord, null);
    const payload = parseListsEdgePayload(CreateListItemSchema, rawPayload);
    const catalogItem = await resolveCatalogItemSnapshot(payload, session);
    /** @type {Record<string, unknown>} */
    const itemFallback = catalogItem ? catalogItemToItemFallback(catalogItem) : {};
    const item = asItemRecord(dependencies.normalizeItemPayload(payload, session, listRecord, {
      ...itemFallback,
      list_item_id: payload.list_item_id || payload.id,
      purchase_status: LIST_ITEM_PURCHASE_STATUSES.NEEDED,
      quantity: itemFallback.quantity ?? 1,
      sort_order: await dependencies.nextSortOrder(session.workspace_id, listRecord.list_id),
      assigned_user_id: payload.assigned_user_id || payload.assignedUserId || session.user_id,
      created_by_user_id: session.user_id,
      updated_by_user_id: session.user_id,
    }));

    if (isTrue(payload.save_to_catalog) || isTrue(payload.saveToCatalog)) {
      await dependencies.assertCanManageCatalog(session);
      const createdCatalog = await dependencies.createValidatedCatalogItem({
        ...item,
        client_id: listRecord.client_id || "",
        list_type: listRecord.list_type,
        project_id: listRecord.project_id || "",
      }, session);
      item.catalog_item_id = asCatalogItemRecord(createdCatalog.catalogItem).catalog_item_id;
    }

    const storedItem = asItemRecord(await dependencies.repository.createItem(session.workspace_id, item));
    if (storedItem.catalog_item_id) {
      await dependencies.repository.incrementCatalogUsage(session.workspace_id, storedItem.catalog_item_id, session.user_id);
    }
    await dependencies.recordItemAudit(session, "list_item_created", "create", null, storedItem, listRecord);
    await dependencies.emitItemEvent("lists.item.created", session, null, storedItem, listRecord);
    await dependencies.syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.item_created");

    return { item: shapeItemForBrowser(storedItem) };
  }

  /** @param {string} listId @param {string} itemId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
  async function updateItem(listId, itemId, rawPayload, session) {
    await assertModuleWriteEnabled(session, LIST_MODULE_ID);
    const { listRecord, item } = await readItemWithListOrThrow(session, listId, itemId);
    await dependencies.assertCanManageItem(session, listRecord, item);
    const payload = parseListsEdgePayload(UpdateListItemSchema, rawPayload);
    const catalogItem = await resolveCatalogItemSnapshot(payload, session);
    /** @type {Record<string, unknown>} */
    const itemFallback = catalogItem ? catalogItemToItemFallback(catalogItem) : {};
    const normalized = asItemRecord(dependencies.normalizeItemPayload(payload, session, listRecord, {
      ...itemFallback,
      ...item,
      catalog_item_id: itemFallback.catalog_item_id || item.catalog_item_id,
      updated_by_user_id: session.user_id,
    }));

    const storedItem = asItemRecord(await dependencies.repository.updateItem(session.workspace_id, normalized));
    if (catalogItem && storedItem.catalog_item_id) {
      await dependencies.repository.incrementCatalogUsage(session.workspace_id, storedItem.catalog_item_id, session.user_id);
    }
    await dependencies.recordItemAudit(session, "list_item_updated", "update", item, storedItem, listRecord);
    await dependencies.emitItemEvent("lists.item.updated", session, item, storedItem, listRecord);
    await dependencies.syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.item_updated");

    return { item: shapeItemForBrowser(storedItem) };
  }

  /** @param {string} listId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
  async function reorderItems(listId, rawPayload, session) {
    await assertModuleWriteEnabled(session, LIST_MODULE_ID);
    const listRecord = asListRecord(await dependencies.readListOrThrow(session, listId));
    await dependencies.assertCanManageItem(session, listRecord, null);
    const payload = parseListsEdgePayload(ReorderListItemsSchema, rawPayload);
    const itemOrders = dependencies.normalizeItemOrders(payload.items || payload.itemOrders || payload.item_orders || []);
    const items = asItemRecords(await dependencies.repository.reorderItems(session.workspace_id, listRecord.list_id, itemOrders, session.user_id));
    await dependencies.recordListAudit(session, "list_items_reordered", "update", listRecord, listRecord, {
      item_orders: itemOrders,
    });
    await dependencies.emitListEvent("lists.item.updated", session, null, listRecord, {
      item_orders: itemOrders,
      reason: "reorder",
    });
    await dependencies.syncListSearchIndex(session.workspace_id, listRecord.list_id, "list.items_reordered");

    return { items: items.map(shapeItemForBrowser) };
  }

  /** @param {string} listId @param {string} itemId @param {WorkspaceRequestSession} session */
  function checkItem(listId, itemId, session) {
    return transitionItem(listId, itemId, session, {
      action: "list_item_checked",
      eventName: "lists.item.checked",
      patch: (_previousItem, now) => ({
        checked_at: now,
        checked_by_user_id: session.user_id,
      }),
    });
  }

  /** @param {string} listId @param {string} itemId @param {WorkspaceRequestSession} session */
  function uncheckItem(listId, itemId, session) {
    return transitionItem(listId, itemId, session, {
      action: "list_item_unchecked",
      eventName: "lists.item.unchecked",
      patch: () => ({
        checked_at: null,
        checked_by_user_id: null,
      }),
    });
  }

  /** @param {string} listId @param {string} itemId @param {WorkspaceRequestSession} session */
  function completeItem(listId, itemId, session) {
    return transitionItem(listId, itemId, session, {
      action: "list_item_completed",
      eventName: "lists.item.completed",
      patch: (_previousItem, now) => ({
        completed_at: now,
        completed_by_user_id: session.user_id,
      }),
    });
  }

  /** @param {string} listId @param {string} itemId @param {WorkspaceRequestSession} session */
  function deleteItem(listId, itemId, session) {
    return transitionItem(listId, itemId, session, {
      action: "list_item_deleted",
      changeType: "delete",
      eventName: "lists.item.deleted",
      patch: (_previousItem, now) => ({ deleted_at: now }),
    });
  }

  /**
   * @param {string} listId
   * @param {string} itemId
   * @param {WorkspaceRequestSession} session
   * @param {{
   *   action: string,
   *   changeType?: string,
   *   eventName: string,
   *   patch: (previousItem: ListsItemRecord, now: string) => Partial<ListsItemRecord>,
   * }} transition
   */
  async function transitionItem(listId, itemId, session, transition) {
    await assertModuleWriteEnabled(session, LIST_MODULE_ID);
    const { listRecord, item } = await readItemWithListOrThrow(session, listId, itemId);
    await dependencies.assertCanManageItem(session, listRecord, item);
    const now = new Date().toISOString();
    const updatedItem = asItemRecord(await dependencies.repository.updateItem(session.workspace_id, {
      ...item,
      ...transition.patch(item, now),
      updated_by_user_id: session.user_id,
    }));

    await dependencies.recordItemAudit(session, transition.action, transition.changeType || "update", item, updatedItem, listRecord);
    await dependencies.emitItemEvent(transition.eventName, session, item, updatedItem, listRecord);
    await dependencies.syncListSearchIndex(session.workspace_id, listRecord.list_id, transition.eventName);
    return { item: shapeItemForBrowser(updatedItem) };
  }

  /** @param {WorkspaceRequestSession} session @param {string} listId @param {string} itemId */
  async function readItemWithListOrThrow(session, listId, itemId) {
    const listRecord = asListRecord(await dependencies.readListOrThrow(session, listId));
    const normalizedItemId = normalizeRequiredText(itemId, "List item ID");
    const rawItem = await dependencies.repository.readItemById(session.workspace_id, listRecord.list_id, normalizedItemId);

    if (!rawItem) {
      throw new AppError("List item not found.", 404);
    }
    const item = asItemRecord(rawItem);
    if (item.deleted_at) throw new AppError("List item not found.", 404);

    return { item, listRecord };
  }

  /** @param {WorkspaceRequestSession} session @param {ListsItemListRecord} listRecord */
  async function readProgressSummary(session, listRecord) {
    const items = listRecord.list_id
      ? asItemRecords(await dependencies.repository.listItems(session.workspace_id, listRecord.list_id, { includeDeleted: false }))
      : [];
    return progressSummaryFromItems(listRecord, items);
  }

  /** @param {WorkspaceRequestSession} session @param {ListsItemProgressBatch} batch */
  async function readProgressSummaries(session, batch) {
    /** @type {Map<string, ListsItemProgressSummary>} */
    const progressByListId = new Map(batch.records.map((listRecord) => [
      listRecord.list_id,
      progressSummaryFromItems(listRecord, []),
    ]));
    if (batch.isEmpty) return progressByListId;

    const items = asItemRecords(await dependencies.repository.listItemsForLists(session.workspace_id, batch.ids, { includeDeleted: false }));
    /** @type {Map<string, ListsItemRecord[]>} */
    const itemsByListId = new Map();
    for (const item of items) {
      const grouped = itemsByListId.get(item.list_id) || [];
      grouped.push(item);
      itemsByListId.set(item.list_id, grouped);
    }

    for (const listRecord of batch.records) {
      progressByListId.set(listRecord.list_id, progressSummaryFromItems(listRecord, itemsByListId.get(listRecord.list_id) || []));
    }
    return progressByListId;
  }

  /** @param {ListsItemListRecord} listRecord @param {ListsItemRecord[]} items @returns {ListsItemProgressSummary} */
  function progressSummaryFromItems(listRecord, items) {
    const nextUncheckedItem = items
      .slice()
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
      .find((item) => !item.checked_at && !item.completed_at);
    const neededDates = items
      .map((item) => item.needed_by_date)
      .filter(isNonEmptyString)
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
    ].filter(isNonEmptyString).sort();

    return {
      assignedUserIds: [...new Set(items.map((item) => item.assigned_user_id).filter(isNonEmptyString))].sort(),
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

  /** @param {Record<string, unknown>} payload @param {WorkspaceRequestSession} session @returns {Promise<ListsCatalogItemRecord | null>} */
  async function resolveCatalogItemSnapshot(payload, session) {
    const catalogItemId = normalizeOptionalText(payload.catalog_item_id || payload.catalogItemId);
    return catalogItemId ? asCatalogItemRecord(await dependencies.readCatalogItemOrThrow(session, catalogItemId)) : null;
  }

  return Object.freeze({
    checkItem,
    completeItem,
    createItem,
    deleteItem,
    progressSummaryFromItems,
    readProgressSummaries,
    readProgressSummary,
    reorderItems,
    uncheckItem,
    updateItem,
  });
}

/** @param {unknown} value */
function isTrue(value) {
  return value === true || value === "true";
}

/** @param {unknown} value @returns {value is string} */
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

/** @param {unknown} value @param {string} label */
function normalizeRequiredText(value, label) {
  const text = normalizeOptionalText(value);
  if (!text) throw new AppError(`${label} is required.`, 400);
  return text;
}

/** @param {unknown} value */
function normalizeOptionalText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

/** @param {ListsCatalogItemRecord} catalogItem */
function catalogItemToItemFallback(catalogItem) {
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

/** @param {ListsItemRecord} item */
function shapeItemForBrowser(item) {
  return { ...item, id: item.list_item_id };
}

/** @param {unknown} value @returns {ListsItemListRecord} */
function asListRecord(value) {
  if (!isRecord(value) || typeof value.list_id !== "string" || typeof value.workspace_id !== "string") {
    throw new AppError("List persistence result is invalid.", 500);
  }
  return /** @type {ListsItemListRecord} */ (value);
}

/** @param {unknown} value @returns {ListsCatalogItemRecord} */
function asCatalogItemRecord(value) {
  if (!isRecord(value) || typeof value.catalog_item_id !== "string") {
    throw new AppError("List catalog persistence result is invalid.", 500);
  }
  return /** @type {ListsCatalogItemRecord} */ (value);
}

/** @param {unknown} value @returns {ListsItemRecord} */
function asItemRecord(value) {
  if (!isRecord(value)
    || typeof value.list_item_id !== "string"
    || typeof value.workspace_id !== "string"
    || typeof value.list_id !== "string"
    || typeof value.item_name !== "string") {
    throw new AppError("List item persistence result is invalid.", 500);
  }
  return /** @type {ListsItemRecord} */ (value);
}

/** @param {unknown[]} values @returns {ListsItemRecord[]} */
function asItemRecords(values) {
  return values.map(asItemRecord);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export { createListItemsService };
