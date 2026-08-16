// @ts-check
import { createRecordId } from "../../core/identifiers.js";
import { db } from "../../core/database.js";

/** @typedef {import("../../types/lists-catalog-item-contracts.js").ListsCatalogItemRecord} ListsCatalogItemRecord */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsCatalogItemDatabaseRow} ListsCatalogItemDatabaseRow */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsCatalogSuggestionFilters} ListsCatalogSuggestionFilters */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsCatalogPersistenceInput} ListsCatalogPersistenceInput */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsDatabaseRow} ListsDatabaseRow */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsItemDatabaseRow} ListsItemDatabaseRow */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsJsonObject} ListsJsonObject */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsLinkDatabaseRow} ListsLinkDatabaseRow */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsLinkPersistenceInput} ListsLinkPersistenceInput */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsLinkRecord} ListsLinkRecord */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsQueryParams} ListsQueryParams */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsRecord} ListsRecord */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsPersistenceInput} ListsPersistenceInput */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsRepository} ListsRepository */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsRepositoryFilters} ListsRepositoryFilters */
/** @typedef {import("../../types/lists-item-contracts.js").ListsItemOrder} ListsItemOrder */
/** @typedef {import("../../types/lists-item-contracts.js").ListsItemRecord} ListsItemRecord */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsItemPersistenceInput} ListsItemPersistenceInput */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsItemUpdateInput} ListsItemUpdateInput */

const LIST_COLUMNS = [
  "list_id",
  "workspace_id",
  "client_id",
  "project_id",
  "title",
  "description",
  "list_type",
  "status",
  "is_reusable",
  "source_list_id",
  "duplicated_from_list_id",
  "created_by_user_id",
  "updated_by_user_id",
  "finalized_by_user_id",
  "created_at",
  "updated_at",
  "completed_at",
  "finalized_at",
  "archived_at",
  "deleted_at",
  "metadata_json",
];

const ITEM_COLUMNS = [
  "list_item_id",
  "workspace_id",
  "list_id",
  "catalog_item_id",
  "item_name",
  "quantity",
  "unit",
  "needed_by_date",
  "vendor_name",
  "url",
  "estimated_cost",
  "actual_cost",
  "purchase_status",
  "tracking_id",
  "notes",
  "assigned_user_id",
  "created_by_user_id",
  "updated_by_user_id",
  "checked_at",
  "checked_by_user_id",
  "completed_at",
  "completed_by_user_id",
  "sort_order",
  "created_at",
  "updated_at",
  "deleted_at",
  "metadata_json",
];

const CATALOG_COLUMNS = [
  "catalog_item_id",
  "workspace_id",
  "item_name",
  "normalized_name",
  "list_type",
  "client_id",
  "project_id",
  "quantity",
  "unit",
  "vendor_name",
  "url",
  "estimated_cost",
  "notes",
  "use_count",
  "last_used_at",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
  "archived_at",
  "metadata_json",
];

const LINK_COLUMNS = [
  "list_link_id",
  "workspace_id",
  "list_id",
  "module_id",
  "target_type",
  "target_id",
  "link_role",
  "created_by_user_id",
  "created_at",
  "removed_at",
  "metadata_json",
];

/** @param {string} workspaceId @param {ListsRepositoryFilters} [filters] @returns {Promise<ListsRecord[]>} */
async function list(workspaceId, filters = {}) {
  const clauses = ["workspace_id = :workspaceId"];
  /** @type {ListsQueryParams} */
  const params = {
    workspaceId: text(workspaceId),
  };

  if (!filters.includeDeleted) {
    clauses.push("status != 'deleted'");
  }

  for (const [filterKey, columnName] of Object.entries({
    status: "status",
    listType: "list_type",
    createdByUserId: "created_by_user_id",
  })) {
    if (filters[filterKey]) {
      clauses.push(`${columnName} = :${filterKey}`);
      params[filterKey] = text(filters[filterKey]);
    }
  }

  if (filters.isReusable !== undefined) {
    clauses.push("is_reusable = :isReusable");
    params.isReusable = db.dialect.boolean.bind(Boolean(filters.isReusable));
  }

  applyListProjectScopeFilter(clauses, filters, params);
  applyListClientScopeFilter(clauses, filters, params);

  const rows = /** @type {ListsDatabaseRow[]} */ (await db.query(`
SELECT ${LIST_COLUMNS.join(", ")}
FROM lists
WHERE ${clauses.join("\n  AND ")}
ORDER BY updated_at DESC, ${db.dialect.comparison.orderByNoCase("title", "ASC")};
`, params));

  return rows.map(listRowToAppValue);
}

/** @param {string} workspaceId @param {string} listId @returns {Promise<ListsRecord | null>} */
async function readById(workspaceId, listId) {
  const row = /** @type {ListsDatabaseRow | null} */ (await db.get(`
SELECT ${LIST_COLUMNS.join(", ")}
FROM lists
WHERE workspace_id = :workspaceId
  AND list_id = :listId
LIMIT 1;
`, {
    listId: text(listId),
    workspaceId: text(workspaceId),
  }));

  return row ? listRowToAppValue(row) : null;
}

/** @param {string} workspaceId @param {string[]} [listIds] @returns {Promise<ListsRecord[]>} */
async function readByIds(workspaceId, listIds = []) {
  const ids = normalizeIdList(listIds);

  if (ids.length === 0) {
    return [];
  }

  const rows = /** @type {ListsDatabaseRow[]} */ (await db.query(`
SELECT ${LIST_COLUMNS.join(", ")}
FROM lists
WHERE workspace_id = :workspaceId
  AND list_id IN (:listIds)
ORDER BY updated_at DESC, ${db.dialect.comparison.orderByNoCase("title", "ASC")};
`, {
    listIds: ids,
    workspaceId: text(workspaceId),
  }));

  return rows.map(listRowToAppValue);
}

/** @param {string} workspaceId @param {ListsPersistenceInput} listPayload @returns {Promise<ListsRecord | null>} */
async function create(workspaceId, listPayload) {
  const listId = listPayload.list_id || createRecordId();
  const now = listPayload.created_at || new Date().toISOString();

  await db.run(`
INSERT INTO lists (
  list_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  list_type,
  status,
  is_reusable,
  source_list_id,
  duplicated_from_list_id,
  created_by_user_id,
  updated_by_user_id,
  finalized_by_user_id,
  created_at,
  updated_at,
  completed_at,
  finalized_at,
  archived_at,
  deleted_at,
  metadata_json
)
VALUES (
  :listId,
  :workspaceId,
  :clientId,
  :projectId,
  :title,
  :description,
  :listType,
  :status,
  :isReusable,
  :sourceListId,
  :duplicatedFromListId,
  :createdByUserId,
  :updatedByUserId,
  :finalizedByUserId,
  :createdAt,
  :updatedAt,
  :completedAt,
  :finalizedAt,
  :archivedAt,
  :deletedAt,
  :metadataJson
);
`, listInsertParams(workspaceId, listPayload, listId, now));

  return readById(workspaceId, listId);
}

/** @param {string} workspaceId @param {ListsPersistenceInput} listPayload @returns {Promise<ListsRecord | null>} */
async function update(workspaceId, listPayload) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE lists
SET
  client_id = :clientId,
  project_id = :projectId,
  title = :title,
  description = :description,
  list_type = :listType,
  status = :status,
  is_reusable = :isReusable,
  source_list_id = :sourceListId,
  duplicated_from_list_id = :duplicatedFromListId,
  updated_by_user_id = :updatedByUserId,
  finalized_by_user_id = :finalizedByUserId,
  updated_at = :updatedAt,
  completed_at = :completedAt,
  finalized_at = :finalizedAt,
  archived_at = :archivedAt,
  deleted_at = :deletedAt,
  metadata_json = :metadataJson
WHERE workspace_id = :workspaceId
  AND list_id = :listId;
`, listUpdateParams(workspaceId, listPayload, now));

  return listPayload.list_id ? readById(workspaceId, listPayload.list_id) : null;
}

/** @param {string} workspaceId @param {string} listId @param {{includeDeleted?: boolean, purchaseStatus?: string}} [filters] @returns {Promise<ListsItemRecord[]>} */
async function listItems(workspaceId, listId, filters = {}) {
  const clauses = [
    "workspace_id = :workspaceId",
    "list_id = :listId",
  ];
  /** @type {ListsQueryParams} */
  const params = {
    listId: text(listId),
    workspaceId: text(workspaceId),
  };

  if (!filters.includeDeleted) {
    clauses.push("deleted_at IS NULL");
  }

  if (filters.purchaseStatus) {
    clauses.push("purchase_status = :purchaseStatus");
    params.purchaseStatus = text(filters.purchaseStatus);
  }

  const rows = /** @type {ListsItemDatabaseRow[]} */ (await db.query(`
SELECT ${ITEM_COLUMNS.join(", ")}
FROM list_items
WHERE ${clauses.join("\n  AND ")}
ORDER BY sort_order ASC, created_at ASC;
`, params));

  return rows.map(itemRowToAppValue);
}

/** @param {string} workspaceId @param {string[]} [listIds] @param {{includeDeleted?: boolean, purchaseStatus?: string}} [filters] @returns {Promise<ListsItemRecord[]>} */
async function listItemsForLists(workspaceId, listIds = [], filters = {}) {
  const ids = normalizeIdList(listIds);

  if (ids.length === 0) {
    return [];
  }

  const clauses = [
    "workspace_id = :workspaceId",
    "list_id IN (:listIds)",
  ];
  /** @type {ListsQueryParams} */
  const params = {
    listIds: ids,
    workspaceId: text(workspaceId),
  };

  if (!filters.includeDeleted) {
    clauses.push("deleted_at IS NULL");
  }

  if (filters.purchaseStatus) {
    clauses.push("purchase_status = :purchaseStatus");
    params.purchaseStatus = text(filters.purchaseStatus);
  }

  const rows = /** @type {ListsItemDatabaseRow[]} */ (await db.query(`
SELECT ${ITEM_COLUMNS.join(", ")}
FROM list_items
WHERE ${clauses.join("\n  AND ")}
ORDER BY list_id ASC, sort_order ASC, created_at ASC;
`, params));

  return rows.map(itemRowToAppValue);
}

/** @param {string} workspaceId @param {string} listId @param {string} itemId @returns {Promise<ListsItemRecord | null>} */
async function readItemById(workspaceId, listId, itemId) {
  const row = /** @type {ListsItemDatabaseRow | null} */ (await db.get(`
SELECT ${ITEM_COLUMNS.join(", ")}
FROM list_items
WHERE workspace_id = :workspaceId
  AND list_id = :listId
  AND list_item_id = :itemId
LIMIT 1;
`, {
    itemId: text(itemId),
    listId: text(listId),
    workspaceId: text(workspaceId),
  }));

  return row ? itemRowToAppValue(row) : null;
}

/** @param {string} workspaceId @param {ListsItemPersistenceInput} item @returns {Promise<ListsItemRecord | null>} */
async function createItem(workspaceId, item) {
  const itemId = item.list_item_id || createRecordId();
  const now = item.created_at || new Date().toISOString();

  await db.run(`
INSERT INTO list_items (
  list_item_id,
  workspace_id,
  list_id,
  catalog_item_id,
  item_name,
  quantity,
  unit,
  needed_by_date,
  vendor_name,
  url,
  estimated_cost,
  actual_cost,
  purchase_status,
  tracking_id,
  notes,
  assigned_user_id,
  created_by_user_id,
  updated_by_user_id,
  checked_at,
  checked_by_user_id,
  completed_at,
  completed_by_user_id,
  sort_order,
  created_at,
  updated_at,
  deleted_at,
  metadata_json
)
VALUES (
  :itemId,
  :workspaceId,
  :listId,
  :catalogItemId,
  :itemName,
  :quantity,
  :unit,
  :neededByDate,
  :vendorName,
  :url,
  :estimatedCost,
  :actualCost,
  :purchaseStatus,
  :trackingId,
  :notes,
  :assignedUserId,
  :createdByUserId,
  :updatedByUserId,
  :checkedAt,
  :checkedByUserId,
  :completedAt,
  :completedByUserId,
  :sortOrder,
  :createdAt,
  :updatedAt,
  :deletedAt,
  :metadataJson
);
`, itemInsertParams(workspaceId, item, itemId, now));

  return readItemById(workspaceId, item.list_id, itemId);
}

/** @param {string} workspaceId @param {ListsItemUpdateInput} item @returns {Promise<ListsItemRecord | null>} */
async function updateItem(workspaceId, item) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE list_items
SET
  catalog_item_id = :catalogItemId,
  item_name = :itemName,
  quantity = :quantity,
  unit = :unit,
  needed_by_date = :neededByDate,
  vendor_name = :vendorName,
  url = :url,
  estimated_cost = :estimatedCost,
  actual_cost = :actualCost,
  purchase_status = :purchaseStatus,
  tracking_id = :trackingId,
  notes = :notes,
  assigned_user_id = :assignedUserId,
  updated_by_user_id = :updatedByUserId,
  checked_at = :checkedAt,
  checked_by_user_id = :checkedByUserId,
  completed_at = :completedAt,
  completed_by_user_id = :completedByUserId,
  sort_order = :sortOrder,
  updated_at = :updatedAt,
  deleted_at = :deletedAt,
  metadata_json = :metadataJson
WHERE workspace_id = :workspaceId
  AND list_id = :listId
  AND list_item_id = :itemId;
`, itemUpdateParams(workspaceId, item, now));

  return item.list_id && item.list_item_id ? readItemById(workspaceId, item.list_id, item.list_item_id) : null;
}

/** @param {string} workspaceId @param {string} listId @param {ListsItemOrder[]} [itemOrders] @param {string} [updatedByUserId] @returns {Promise<ListsItemRecord[]>} */
async function reorderItems(workspaceId, listId, itemOrders = [], updatedByUserId = "") {
  const now = new Date().toISOString();

  if (itemOrders.length === 0) {
    return listItems(workspaceId, listId);
  }

  await db.transaction(async (transaction) => {
    for (const entry of itemOrders) {
      await transaction.run(`
UPDATE list_items
SET sort_order = :sortOrder,
    updated_by_user_id = :updatedByUserId,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND list_id = :listId
  AND list_item_id = :itemId
  AND deleted_at IS NULL;
`, {
        itemId: text(entry.list_item_id),
        listId: text(listId),
        sortOrder: integer(entry.sort_order),
        updatedAt: text(now),
        updatedByUserId: nullableText(updatedByUserId),
        workspaceId: text(workspaceId),
      });
    }
  }
  );

  return listItems(workspaceId, listId);
}

/** @param {string} workspaceId @param {ListsCatalogPersistenceInput} item @returns {Promise<ListsCatalogItemRecord | null>} */
async function createCatalogItem(workspaceId, item) {
  const catalogItemId = item.catalog_item_id || createRecordId();
  const now = item.created_at || new Date().toISOString();

  await db.run(`
INSERT INTO list_item_catalog (
  catalog_item_id,
  workspace_id,
  item_name,
  normalized_name,
  list_type,
  client_id,
  project_id,
  quantity,
  unit,
  vendor_name,
  url,
  estimated_cost,
  notes,
  use_count,
  last_used_at,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at,
  archived_at,
  metadata_json
)
VALUES (
  :catalogItemId,
  :workspaceId,
  :itemName,
  :normalizedName,
  :listType,
  :clientId,
  :projectId,
  :quantity,
  :unit,
  :vendorName,
  :url,
  :estimatedCost,
  :notes,
  :useCount,
  :lastUsedAt,
  :createdByUserId,
  :updatedByUserId,
  :createdAt,
  :updatedAt,
  :archivedAt,
  :metadataJson
);
`, catalogInsertParams(workspaceId, item, catalogItemId, now));

  return readCatalogItemById(workspaceId, catalogItemId);
}

/** @param {string} workspaceId @param {ListsCatalogPersistenceInput} item @returns {Promise<ListsCatalogItemRecord | null>} */
async function updateCatalogItem(workspaceId, item) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE list_item_catalog
SET
  item_name = :itemName,
  normalized_name = :normalizedName,
  list_type = :listType,
  client_id = :clientId,
  project_id = :projectId,
  quantity = :quantity,
  unit = :unit,
  vendor_name = :vendorName,
  url = :url,
  estimated_cost = :estimatedCost,
  notes = :notes,
  use_count = :useCount,
  last_used_at = :lastUsedAt,
  updated_by_user_id = :updatedByUserId,
  updated_at = :updatedAt,
  archived_at = :archivedAt,
  metadata_json = :metadataJson
WHERE workspace_id = :workspaceId
  AND catalog_item_id = :catalogItemId;
`, catalogUpdateParams(workspaceId, item, now));

  return item.catalog_item_id ? readCatalogItemById(workspaceId, item.catalog_item_id) : null;
}

/** @param {string} workspaceId @param {string} catalogItemId @returns {Promise<ListsCatalogItemRecord | null>} */
async function readCatalogItemById(workspaceId, catalogItemId) {
  const row = /** @type {ListsCatalogItemDatabaseRow | null} */ (await db.get(`
SELECT ${CATALOG_COLUMNS.join(", ")}
FROM list_item_catalog
WHERE workspace_id = :workspaceId
  AND catalog_item_id = :catalogItemId
LIMIT 1;
`, {
    catalogItemId: text(catalogItemId),
    workspaceId: text(workspaceId),
  }));

  return row ? catalogRowToAppValue(row) : null;
}

/** @param {string} workspaceId @param {ListsCatalogSuggestionFilters} [filters] @returns {Promise<ListsCatalogItemRecord[]>} */
async function listCatalogSuggestions(workspaceId, filters = {}) {
  const clauses = [
    "workspace_id = :workspaceId",
    "archived_at IS NULL",
  ];
  /** @type {ListsQueryParams} */
  const params = {
    clientIdMatch: nullableText(filters.clientId),
    limit: integer(Math.max(1, Math.min(Number(filters.limit) || 8, 20))),
    listTypeMatch: nullableText(filters.listType),
    projectIdMatch: nullableText(filters.projectId),
    workspaceId: text(workspaceId),
  };

  if (filters.query) {
    clauses.push(db.dialect.comparison.likeNoCase("normalized_name", ":queryPattern"));
    params.queryPattern = `%${filters.query}%`;
  }

  if (filters.listType) {
    clauses.push("(list_type IS NULL OR list_type = '' OR list_type = :listType)");
    params.listType = text(filters.listType);
  }

  if (filters.clientId) {
    clauses.push("(client_id IS NULL OR client_id = '' OR client_id = :clientId)");
    params.clientId = text(filters.clientId);
  } else {
    clauses.push("(client_id IS NULL OR client_id = '')");
  }

  if (filters.projectId) {
    clauses.push("(project_id IS NULL OR project_id = '' OR project_id = :projectId)");
    params.projectId = text(filters.projectId);
  } else {
    clauses.push("(project_id IS NULL OR project_id = '')");
  }

  const rows = /** @type {ListsCatalogItemDatabaseRow[]} */ (await db.query(`
SELECT ${CATALOG_COLUMNS.join(", ")},
  CASE WHEN list_type = :listTypeMatch THEN 1 ELSE 0 END AS list_type_match,
  CASE WHEN client_id = :clientIdMatch THEN 1 ELSE 0 END AS client_match,
  CASE WHEN project_id = :projectIdMatch THEN 1 ELSE 0 END AS project_match
FROM list_item_catalog
WHERE ${clauses.join("\n  AND ")}
ORDER BY
  project_match DESC,
  client_match DESC,
  list_type_match DESC,
  use_count DESC,
  last_used_at DESC,
  ${db.dialect.comparison.orderByNoCase("item_name", "ASC")},
  catalog_item_id ASC
LIMIT :limit;
`, params));

  return rows.map(catalogRowToAppValue);
}

/** @param {string} workspaceId @param {string} catalogItemId @param {string} [updatedByUserId] @returns {Promise<ListsCatalogItemRecord | null>} */
async function incrementCatalogUsage(workspaceId, catalogItemId, updatedByUserId = "") {
  const now = new Date().toISOString();

  await db.run(`
UPDATE list_item_catalog
SET use_count = use_count + 1,
    last_used_at = :lastUsedAt,
    updated_by_user_id = :updatedByUserId,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND catalog_item_id = :catalogItemId
  AND archived_at IS NULL;
`, {
    catalogItemId: text(catalogItemId),
    lastUsedAt: text(now),
    updatedAt: text(now),
    updatedByUserId: nullableText(updatedByUserId),
    workspaceId: text(workspaceId),
  });

  return readCatalogItemById(workspaceId, catalogItemId);
}

/** @param {string} workspaceId @param {ListsLinkPersistenceInput} link @returns {Promise<ListsLinkRecord | null>} */
async function createLink(workspaceId, link) {
  const linkId = link.list_link_id || createRecordId();
  const now = link.created_at || new Date().toISOString();

  await db.run(`
INSERT INTO list_links (
  list_link_id,
  workspace_id,
  list_id,
  module_id,
  target_type,
  target_id,
  link_role,
  created_by_user_id,
  created_at,
  removed_at,
  metadata_json
)
VALUES (
  :linkId,
  :workspaceId,
  :listId,
  :moduleId,
  :targetType,
  :targetId,
  :linkRole,
  :createdByUserId,
  :createdAt,
  NULL,
  :metadataJson
);
`, linkInsertParams(workspaceId, link, linkId, now));

  return readLinkById(workspaceId, link.list_id, linkId);
}

/** @param {string} workspaceId @param {string} listId @returns {Promise<ListsLinkRecord[]>} */
async function listLinks(workspaceId, listId) {
  const rows = /** @type {ListsLinkDatabaseRow[]} */ (await db.query(`
SELECT ${LINK_COLUMNS.join(", ")}
FROM list_links
WHERE workspace_id = :workspaceId
  AND list_id = :listId
  AND removed_at IS NULL
ORDER BY created_at ASC;
`, {
    listId: text(listId),
    workspaceId: text(workspaceId),
  }));

  return rows.map(linkRowToAppValue);
}

/** @param {string} workspaceId @param {string[]} [listIds] @returns {Promise<ListsLinkRecord[]>} */
async function listLinksForLists(workspaceId, listIds = []) {
  const ids = normalizeIdList(listIds);

  if (ids.length === 0) {
    return [];
  }

  const rows = /** @type {ListsLinkDatabaseRow[]} */ (await db.query(`
SELECT ${LINK_COLUMNS.join(", ")}
FROM list_links
WHERE workspace_id = :workspaceId
  AND list_id IN (:listIds)
  AND removed_at IS NULL
ORDER BY list_id ASC, created_at ASC;
`, {
    listIds: ids,
    workspaceId: text(workspaceId),
  }));

  return rows.map(linkRowToAppValue);
}

/** @param {string} workspaceId @param {string} listId @param {string} linkId @returns {Promise<ListsLinkRecord | null>} */
async function readLinkById(workspaceId, listId, linkId) {
  const row = /** @type {ListsLinkDatabaseRow | null} */ (await db.get(`
SELECT ${LINK_COLUMNS.join(", ")}
FROM list_links
WHERE workspace_id = :workspaceId
  AND list_id = :listId
  AND list_link_id = :linkId
LIMIT 1;
`, {
    linkId: text(linkId),
    listId: text(listId),
    workspaceId: text(workspaceId),
  }));

  return row ? linkRowToAppValue(row) : null;
}

/** @param {string} workspaceId @param {string} listId @param {string} linkId @returns {Promise<ListsLinkRecord | null>} */
async function removeLink(workspaceId, listId, linkId) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE list_links
SET removed_at = :removedAt
WHERE workspace_id = :workspaceId
  AND list_id = :listId
  AND list_link_id = :linkId
  AND removed_at IS NULL;
`, {
    linkId: text(linkId),
    listId: text(listId),
    removedAt: text(now),
    workspaceId: text(workspaceId),
  });

  return readLinkById(workspaceId, listId, linkId);
}

/** @param {string} workspaceId @param {ListsPersistenceInput} listPayload @param {string} listId @param {string} now @returns {ListsQueryParams} */
function listInsertParams(workspaceId, listPayload, listId, now) {
  return {
    archivedAt: nullableText(listPayload.archived_at),
    clientId: nullableText(listPayload.client_id),
    completedAt: nullableText(listPayload.completed_at),
    createdAt: text(now),
    createdByUserId: nullableText(listPayload.created_by_user_id),
    deletedAt: nullableText(listPayload.deleted_at),
    description: nullableText(listPayload.description),
    duplicatedFromListId: nullableText(listPayload.duplicated_from_list_id),
    finalizedAt: nullableText(listPayload.finalized_at),
    finalizedByUserId: nullableText(listPayload.finalized_by_user_id),
    isReusable: db.dialect.boolean.bind(Boolean(listPayload.is_reusable)),
    listId: text(listId),
    listType: text(listPayload.list_type),
    metadataJson: nullableText(serializeMetadata(listPayload.metadata_json)),
    projectId: nullableText(listPayload.project_id),
    sourceListId: nullableText(listPayload.source_list_id),
    status: text(listPayload.status),
    title: text(listPayload.title),
    updatedAt: text(now),
    updatedByUserId: nullableText(listPayload.updated_by_user_id),
    workspaceId: text(workspaceId),
  };
}

/** @param {string} workspaceId @param {ListsPersistenceInput} listPayload @param {string} now @returns {ListsQueryParams} */
function listUpdateParams(workspaceId, listPayload, now) {
  return {
    archivedAt: nullableText(listPayload.archived_at),
    clientId: nullableText(listPayload.client_id),
    completedAt: nullableText(listPayload.completed_at),
    deletedAt: nullableText(listPayload.deleted_at),
    description: nullableText(listPayload.description),
    duplicatedFromListId: nullableText(listPayload.duplicated_from_list_id),
    finalizedAt: nullableText(listPayload.finalized_at),
    finalizedByUserId: nullableText(listPayload.finalized_by_user_id),
    isReusable: db.dialect.boolean.bind(Boolean(listPayload.is_reusable)),
    listId: text(listPayload.list_id),
    listType: text(listPayload.list_type),
    metadataJson: nullableText(serializeMetadata(listPayload.metadata_json)),
    projectId: nullableText(listPayload.project_id),
    sourceListId: nullableText(listPayload.source_list_id),
    status: text(listPayload.status),
    title: text(listPayload.title),
    updatedAt: text(now),
    updatedByUserId: nullableText(listPayload.updated_by_user_id),
    workspaceId: text(workspaceId),
  };
}

/** @param {string} workspaceId @param {ListsItemPersistenceInput} item @param {string} itemId @param {string} now @returns {ListsQueryParams} */
function itemInsertParams(workspaceId, item, itemId, now) {
  return {
    actualCost: numberOrNull(item.actual_cost),
    assignedUserId: nullableText(item.assigned_user_id),
    catalogItemId: nullableText(item.catalog_item_id),
    checkedAt: nullableText(item.checked_at),
    checkedByUserId: nullableText(item.checked_by_user_id),
    completedAt: nullableText(item.completed_at),
    completedByUserId: nullableText(item.completed_by_user_id),
    createdAt: text(now),
    createdByUserId: nullableText(item.created_by_user_id),
    deletedAt: nullableText(item.deleted_at),
    estimatedCost: numberOrNull(item.estimated_cost),
    itemId: text(itemId),
    itemName: text(item.item_name),
    listId: text(item.list_id),
    metadataJson: nullableText(serializeMetadata(item.metadata_json)),
    neededByDate: nullableText(item.needed_by_date),
    notes: nullableText(item.notes),
    purchaseStatus: text(item.purchase_status),
    quantity: numberOrNull(item.quantity ?? 1),
    sortOrder: integer(item.sort_order || 0),
    trackingId: nullableText(item.tracking_id),
    unit: nullableText(item.unit),
    updatedAt: text(now),
    updatedByUserId: nullableText(item.updated_by_user_id),
    url: nullableText(item.url),
    vendorName: nullableText(item.vendor_name),
    workspaceId: text(workspaceId),
  };
}

/** @param {string} workspaceId @param {ListsItemUpdateInput} item @param {string} now @returns {ListsQueryParams} */
function itemUpdateParams(workspaceId, item, now) {
  return {
    actualCost: numberOrNull(item.actual_cost),
    assignedUserId: nullableText(item.assigned_user_id),
    catalogItemId: nullableText(item.catalog_item_id),
    checkedAt: nullableText(item.checked_at),
    checkedByUserId: nullableText(item.checked_by_user_id),
    completedAt: nullableText(item.completed_at),
    completedByUserId: nullableText(item.completed_by_user_id),
    deletedAt: nullableText(item.deleted_at),
    estimatedCost: numberOrNull(item.estimated_cost),
    itemId: text(item.list_item_id),
    itemName: text(item.item_name),
    listId: text(item.list_id),
    metadataJson: nullableText(serializeMetadata(item.metadata_json)),
    neededByDate: nullableText(item.needed_by_date),
    notes: nullableText(item.notes),
    purchaseStatus: text(item.purchase_status),
    quantity: numberOrNull(item.quantity ?? 1),
    sortOrder: integer(item.sort_order || 0),
    trackingId: nullableText(item.tracking_id),
    unit: nullableText(item.unit),
    updatedAt: text(now),
    updatedByUserId: nullableText(item.updated_by_user_id),
    url: nullableText(item.url),
    vendorName: nullableText(item.vendor_name),
    workspaceId: text(workspaceId),
  };
}

/** @param {string} workspaceId @param {ListsCatalogPersistenceInput} item @param {string} catalogItemId @param {string} now @returns {ListsQueryParams} */
function catalogInsertParams(workspaceId, item, catalogItemId, now) {
  return {
    archivedAt: nullableText(item.archived_at),
    catalogItemId: text(catalogItemId),
    clientId: nullableText(item.client_id),
    createdAt: text(now),
    createdByUserId: nullableText(item.created_by_user_id),
    estimatedCost: numberOrNull(item.estimated_cost),
    itemName: text(item.item_name),
    lastUsedAt: nullableText(item.last_used_at),
    listType: nullableText(item.list_type),
    metadataJson: nullableText(serializeMetadata(item.metadata_json)),
    normalizedName: text(item.normalized_name),
    notes: nullableText(item.notes),
    projectId: nullableText(item.project_id),
    quantity: numberOrNull(item.quantity ?? 1),
    unit: nullableText(item.unit),
    updatedAt: text(now),
    updatedByUserId: nullableText(item.updated_by_user_id),
    url: nullableText(item.url),
    useCount: integer(item.use_count || 0),
    vendorName: nullableText(item.vendor_name),
    workspaceId: text(workspaceId),
  };
}

/** @param {string} workspaceId @param {ListsCatalogPersistenceInput} item @param {string} now @returns {ListsQueryParams} */
function catalogUpdateParams(workspaceId, item, now) {
  return {
    archivedAt: nullableText(item.archived_at),
    catalogItemId: text(item.catalog_item_id),
    clientId: nullableText(item.client_id),
    estimatedCost: numberOrNull(item.estimated_cost),
    itemName: text(item.item_name),
    lastUsedAt: nullableText(item.last_used_at),
    listType: nullableText(item.list_type),
    metadataJson: nullableText(serializeMetadata(item.metadata_json)),
    normalizedName: text(item.normalized_name),
    notes: nullableText(item.notes),
    projectId: nullableText(item.project_id),
    quantity: numberOrNull(item.quantity ?? 1),
    unit: nullableText(item.unit),
    updatedAt: text(now),
    updatedByUserId: nullableText(item.updated_by_user_id),
    url: nullableText(item.url),
    useCount: integer(item.use_count || 0),
    vendorName: nullableText(item.vendor_name),
    workspaceId: text(workspaceId),
  };
}

/** @param {string} workspaceId @param {ListsLinkPersistenceInput} link @param {string} linkId @param {string} now @returns {ListsQueryParams} */
function linkInsertParams(workspaceId, link, linkId, now) {
  return {
    createdAt: text(now),
    createdByUserId: nullableText(link.created_by_user_id),
    linkId: text(linkId),
    linkRole: text(link.link_role || "related"),
    listId: text(link.list_id),
    metadataJson: nullableText(serializeMetadata(link.metadata_json)),
    moduleId: text(link.module_id),
    targetId: text(link.target_id),
    targetType: text(link.target_type),
    workspaceId: text(workspaceId),
  };
}

/** @param {unknown} value */
function text(value) {
  return String(value ?? "");
}

/** @param {unknown} value */
function nullableText(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? null
    : String(value);
}

/** @param {unknown} value */
function integer(value) {
  const numberValue = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

/** @param {unknown} value */
function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** @param {unknown} value */
function serializeMetadata(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

/** @param {unknown[]} [ids] @returns {string[]} */
function normalizeIdList(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];
}

/** @param {string[]} conditions @param {ListsRepositoryFilters} filters @param {ListsQueryParams} params */
function applyListProjectScopeFilter(conditions, filters, params) {
  if (!filters.hasProjectFilter) {
    return;
  }

  if (filters.projectFilterMode === "blank") {
    conditions.push("(project_id IS NULL OR project_id = '')");
    return;
  }

  if (filters.projectFilterMode !== "ids") {
    return;
  }

  const projectIds = normalizeIdList(filters.projectIds);

  if (projectIds.length === 0) {
    conditions.push("1 = 0");
    return;
  }

  conditions.push("project_id IN (:projectIds)");
  params.projectIds = projectIds;
}

/** @param {string[]} conditions @param {ListsRepositoryFilters} filters @param {ListsQueryParams} params */
function applyListClientScopeFilter(conditions, filters, params) {
  if (!filters.hasClientFilter || filters.omitClientFilterBecauseProjectSelected) {
    return;
  }

  if (filters.clientFilterMode === "blank") {
    conditions.push("(client_id IS NULL OR client_id = '')");
    return;
  }

  if (filters.clientFilterMode !== "ids") {
    return;
  }

  const clientIds = normalizeIdList(filters.clientIds);
  const clientProjectIds = normalizeIdList(filters.clientProjectIds);

  if (clientIds.length === 0 && clientProjectIds.length === 0) {
    conditions.push("1 = 0");
    return;
  }

  if (clientIds.length > 0 && clientProjectIds.length > 0) {
    conditions.push("(client_id IN (:clientIds) OR project_id IN (:clientProjectIds))");
    params.clientIds = clientIds;
    params.clientProjectIds = clientProjectIds;
    return;
  }

  if (clientIds.length > 0) {
    conditions.push("client_id IN (:clientIds)");
    params.clientIds = clientIds;
  } else if (clientProjectIds.length > 0) {
    conditions.push("project_id IN (:clientProjectIds)");
    params.clientProjectIds = clientProjectIds;
  }
}

/** @param {ListsDatabaseRow} row @returns {ListsRecord} */
function listRowToAppValue(row) {
  return /** @type {ListsRecord} */ ({
    ...row,
    is_reusable: Boolean(row.is_reusable),
    metadata_json: parseMetadata(row.metadata_json),
  });
}

/** @param {ListsItemDatabaseRow} row @returns {ListsItemRecord} */
function itemRowToAppValue(row) {
  return /** @type {ListsItemRecord} */ ({
    ...row,
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    estimated_cost: row.estimated_cost === null || row.estimated_cost === undefined ? null : Number(row.estimated_cost),
    actual_cost: row.actual_cost === null || row.actual_cost === undefined ? null : Number(row.actual_cost),
    metadata_json: parseMetadata(row.metadata_json),
  });
}

/** @param {ListsCatalogItemDatabaseRow} row @returns {ListsCatalogItemRecord} */
function catalogRowToAppValue(row) {
  return /** @type {ListsCatalogItemRecord} */ ({
    ...row,
    estimated_cost: row.estimated_cost === null || row.estimated_cost === undefined ? null : Number(row.estimated_cost),
    metadata_json: parseMetadata(row.metadata_json),
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    use_count: Number(row.use_count) || 0,
  });
}

/** @param {ListsLinkDatabaseRow} row @returns {ListsLinkRecord} */
function linkRowToAppValue(row) {
  return /** @type {ListsLinkRecord} */ ({
    ...row,
    metadata_json: parseMetadata(row.metadata_json),
  });
}

/** @param {unknown} value @returns {ListsJsonObject} */
function parseMetadata(value) {
  if (!value) {
    return {};
  }

  try {
    return /** @type {ListsJsonObject} */ (JSON.parse(String(value)));
  } catch {
    return {};
  }
}

/** @type {ListsRepository} */
const listsRepository = {
  createCatalogItem,
  create,
  createItem,
  createLink,
  incrementCatalogUsage,
  list,
  listCatalogSuggestions,
  listItems,
  listItemsForLists,
  listLinks,
  listLinksForLists,
  readCatalogItemById,
  readById,
  readByIds,
  readItemById,
  readLinkById,
  removeLink,
  reorderItems,
  update,
  updateCatalogItem,
  updateItem,
};

export { listsRepository };
