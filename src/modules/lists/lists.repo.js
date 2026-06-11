import { randomUUID } from "node:crypto";
import {
  querySql,
  runSql,
  sqlInteger,
  sqlNullableText,
  sqlText,
} from "../../core/database.js";

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

async function list(workspaceId, filters = {}) {
  const clauses = [`workspace_id = ${sqlText(workspaceId)}`];

  if (!filters.includeDeleted) {
    clauses.push("status != 'deleted'");
  }

  for (const [filterKey, columnName] of Object.entries({
    status: "status",
    listType: "list_type",
    clientId: "client_id",
    projectId: "project_id",
    createdByUserId: "created_by_user_id",
  })) {
    if (filters[filterKey]) {
      clauses.push(`${columnName} = ${sqlText(filters[filterKey])}`);
    }
  }

  if (filters.isReusable !== undefined) {
    clauses.push(`is_reusable = ${sqlInteger(filters.isReusable ? 1 : 0)}`);
  }

  const rows = await querySql(`
SELECT ${LIST_COLUMNS.join(", ")}
FROM lists
WHERE ${clauses.join("\n  AND ")}
ORDER BY updated_at DESC, title COLLATE NOCASE ASC;
`);

  return rows.map(listRowToAppValue);
}

async function readById(workspaceId, listId) {
  const rows = await querySql(`
SELECT ${LIST_COLUMNS.join(", ")}
FROM lists
WHERE workspace_id = ${sqlText(workspaceId)}
  AND list_id = ${sqlText(listId)}
LIMIT 1;
`);

  return rows[0] ? listRowToAppValue(rows[0]) : null;
}

async function create(workspaceId, listPayload) {
  const listId = listPayload.list_id || randomUUID();
  const now = listPayload.created_at || new Date().toISOString();

  await runSql(`
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
  ${sqlText(listId)},
  ${sqlText(workspaceId)},
  ${sqlNullableText(listPayload.client_id)},
  ${sqlNullableText(listPayload.project_id)},
  ${sqlText(listPayload.title)},
  ${sqlNullableText(listPayload.description)},
  ${sqlText(listPayload.list_type)},
  ${sqlText(listPayload.status)},
  ${sqlInteger(listPayload.is_reusable ? 1 : 0)},
  ${sqlNullableText(listPayload.source_list_id)},
  ${sqlNullableText(listPayload.duplicated_from_list_id)},
  ${sqlNullableText(listPayload.created_by_user_id)},
  ${sqlNullableText(listPayload.updated_by_user_id)},
  ${sqlNullableText(listPayload.finalized_by_user_id)},
  ${sqlText(now)},
  ${sqlText(now)},
  ${sqlNullableText(listPayload.completed_at)},
  ${sqlNullableText(listPayload.finalized_at)},
  ${sqlNullableText(listPayload.archived_at)},
  ${sqlNullableText(listPayload.deleted_at)},
  ${sqlNullableText(serializeMetadata(listPayload.metadata_json))}
);
`);

  return readById(workspaceId, listId);
}

async function update(workspaceId, listPayload) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE lists
SET
  client_id = ${sqlNullableText(listPayload.client_id)},
  project_id = ${sqlNullableText(listPayload.project_id)},
  title = ${sqlText(listPayload.title)},
  description = ${sqlNullableText(listPayload.description)},
  list_type = ${sqlText(listPayload.list_type)},
  status = ${sqlText(listPayload.status)},
  is_reusable = ${sqlInteger(listPayload.is_reusable ? 1 : 0)},
  source_list_id = ${sqlNullableText(listPayload.source_list_id)},
  duplicated_from_list_id = ${sqlNullableText(listPayload.duplicated_from_list_id)},
  updated_by_user_id = ${sqlNullableText(listPayload.updated_by_user_id)},
  finalized_by_user_id = ${sqlNullableText(listPayload.finalized_by_user_id)},
  updated_at = ${sqlText(now)},
  completed_at = ${sqlNullableText(listPayload.completed_at)},
  finalized_at = ${sqlNullableText(listPayload.finalized_at)},
  archived_at = ${sqlNullableText(listPayload.archived_at)},
  deleted_at = ${sqlNullableText(listPayload.deleted_at)},
  metadata_json = ${sqlNullableText(serializeMetadata(listPayload.metadata_json))}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND list_id = ${sqlText(listPayload.list_id)};
`);

  return readById(workspaceId, listPayload.list_id);
}

async function listItems(workspaceId, listId, filters = {}) {
  const clauses = [
    `workspace_id = ${sqlText(workspaceId)}`,
    `list_id = ${sqlText(listId)}`,
  ];

  if (!filters.includeDeleted) {
    clauses.push("deleted_at IS NULL");
  }

  if (filters.purchaseStatus) {
    clauses.push(`purchase_status = ${sqlText(filters.purchaseStatus)}`);
  }

  const rows = await querySql(`
SELECT ${ITEM_COLUMNS.join(", ")}
FROM list_items
WHERE ${clauses.join("\n  AND ")}
ORDER BY sort_order ASC, created_at ASC;
`);

  return rows.map(itemRowToAppValue);
}

async function readItemById(workspaceId, listId, itemId) {
  const rows = await querySql(`
SELECT ${ITEM_COLUMNS.join(", ")}
FROM list_items
WHERE workspace_id = ${sqlText(workspaceId)}
  AND list_id = ${sqlText(listId)}
  AND list_item_id = ${sqlText(itemId)}
LIMIT 1;
`);

  return rows[0] ? itemRowToAppValue(rows[0]) : null;
}

async function createItem(workspaceId, item) {
  const itemId = item.list_item_id || randomUUID();
  const now = item.created_at || new Date().toISOString();

  await runSql(`
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
  ${sqlText(itemId)},
  ${sqlText(workspaceId)},
  ${sqlText(item.list_id)},
  ${sqlNullableText(item.catalog_item_id)},
  ${sqlText(item.item_name)},
  ${numberOrNullSql(item.quantity ?? 1)},
  ${sqlNullableText(item.unit)},
  ${sqlNullableText(item.needed_by_date)},
  ${sqlNullableText(item.vendor_name)},
  ${sqlNullableText(item.url)},
  ${numberOrNullSql(item.estimated_cost)},
  ${numberOrNullSql(item.actual_cost)},
  ${sqlText(item.purchase_status)},
  ${sqlNullableText(item.tracking_id)},
  ${sqlNullableText(item.notes)},
  ${sqlNullableText(item.assigned_user_id)},
  ${sqlNullableText(item.created_by_user_id)},
  ${sqlNullableText(item.updated_by_user_id)},
  ${sqlNullableText(item.checked_at)},
  ${sqlNullableText(item.checked_by_user_id)},
  ${sqlNullableText(item.completed_at)},
  ${sqlNullableText(item.completed_by_user_id)},
  ${sqlInteger(item.sort_order || 0)},
  ${sqlText(now)},
  ${sqlText(now)},
  ${sqlNullableText(item.deleted_at)},
  ${sqlNullableText(serializeMetadata(item.metadata_json))}
);
`);

  return readItemById(workspaceId, item.list_id, itemId);
}

async function updateItem(workspaceId, item) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE list_items
SET
  catalog_item_id = ${sqlNullableText(item.catalog_item_id)},
  item_name = ${sqlText(item.item_name)},
  quantity = ${numberOrNullSql(item.quantity ?? 1)},
  unit = ${sqlNullableText(item.unit)},
  needed_by_date = ${sqlNullableText(item.needed_by_date)},
  vendor_name = ${sqlNullableText(item.vendor_name)},
  url = ${sqlNullableText(item.url)},
  estimated_cost = ${numberOrNullSql(item.estimated_cost)},
  actual_cost = ${numberOrNullSql(item.actual_cost)},
  purchase_status = ${sqlText(item.purchase_status)},
  tracking_id = ${sqlNullableText(item.tracking_id)},
  notes = ${sqlNullableText(item.notes)},
  assigned_user_id = ${sqlNullableText(item.assigned_user_id)},
  updated_by_user_id = ${sqlNullableText(item.updated_by_user_id)},
  checked_at = ${sqlNullableText(item.checked_at)},
  checked_by_user_id = ${sqlNullableText(item.checked_by_user_id)},
  completed_at = ${sqlNullableText(item.completed_at)},
  completed_by_user_id = ${sqlNullableText(item.completed_by_user_id)},
  sort_order = ${sqlInteger(item.sort_order || 0)},
  updated_at = ${sqlText(now)},
  deleted_at = ${sqlNullableText(item.deleted_at)},
  metadata_json = ${sqlNullableText(serializeMetadata(item.metadata_json))}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND list_id = ${sqlText(item.list_id)}
  AND list_item_id = ${sqlText(item.list_item_id)};
`);

  return readItemById(workspaceId, item.list_id, item.list_item_id);
}

async function reorderItems(workspaceId, listId, itemOrders = [], updatedByUserId = "") {
  const now = new Date().toISOString();
  const updates = itemOrders.map((entry) => `
UPDATE list_items
SET sort_order = ${sqlInteger(entry.sort_order)},
    updated_by_user_id = ${sqlNullableText(updatedByUserId)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND list_id = ${sqlText(listId)}
  AND list_item_id = ${sqlText(entry.list_item_id)}
  AND deleted_at IS NULL;
`).join("\n");

  if (!updates) {
    return listItems(workspaceId, listId);
  }

  await runSql(updates);
  return listItems(workspaceId, listId);
}

async function createCatalogItem(workspaceId, item) {
  const catalogItemId = item.catalog_item_id || randomUUID();
  const now = item.created_at || new Date().toISOString();

  await runSql(`
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
  ${sqlText(catalogItemId)},
  ${sqlText(workspaceId)},
  ${sqlText(item.item_name)},
  ${sqlText(item.normalized_name)},
  ${sqlNullableText(item.list_type)},
  ${sqlNullableText(item.client_id)},
  ${sqlNullableText(item.project_id)},
  ${numberOrNullSql(item.quantity ?? 1)},
  ${sqlNullableText(item.unit)},
  ${sqlNullableText(item.vendor_name)},
  ${sqlNullableText(item.url)},
  ${numberOrNullSql(item.estimated_cost)},
  ${sqlNullableText(item.notes)},
  ${sqlInteger(item.use_count || 0)},
  ${sqlNullableText(item.last_used_at)},
  ${sqlNullableText(item.created_by_user_id)},
  ${sqlNullableText(item.updated_by_user_id)},
  ${sqlText(now)},
  ${sqlText(now)},
  ${sqlNullableText(item.archived_at)},
  ${sqlNullableText(serializeMetadata(item.metadata_json))}
);
`);

  return readCatalogItemById(workspaceId, catalogItemId);
}

async function updateCatalogItem(workspaceId, item) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE list_item_catalog
SET
  item_name = ${sqlText(item.item_name)},
  normalized_name = ${sqlText(item.normalized_name)},
  list_type = ${sqlNullableText(item.list_type)},
  client_id = ${sqlNullableText(item.client_id)},
  project_id = ${sqlNullableText(item.project_id)},
  quantity = ${numberOrNullSql(item.quantity ?? 1)},
  unit = ${sqlNullableText(item.unit)},
  vendor_name = ${sqlNullableText(item.vendor_name)},
  url = ${sqlNullableText(item.url)},
  estimated_cost = ${numberOrNullSql(item.estimated_cost)},
  notes = ${sqlNullableText(item.notes)},
  use_count = ${sqlInteger(item.use_count || 0)},
  last_used_at = ${sqlNullableText(item.last_used_at)},
  updated_by_user_id = ${sqlNullableText(item.updated_by_user_id)},
  updated_at = ${sqlText(now)},
  archived_at = ${sqlNullableText(item.archived_at)},
  metadata_json = ${sqlNullableText(serializeMetadata(item.metadata_json))}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND catalog_item_id = ${sqlText(item.catalog_item_id)};
`);

  return readCatalogItemById(workspaceId, item.catalog_item_id);
}

async function readCatalogItemById(workspaceId, catalogItemId) {
  const rows = await querySql(`
SELECT ${CATALOG_COLUMNS.join(", ")}
FROM list_item_catalog
WHERE workspace_id = ${sqlText(workspaceId)}
  AND catalog_item_id = ${sqlText(catalogItemId)}
LIMIT 1;
`);

  return rows[0] ? catalogRowToAppValue(rows[0]) : null;
}

async function listCatalogSuggestions(workspaceId, filters = {}) {
  const clauses = [
    `workspace_id = ${sqlText(workspaceId)}`,
    "archived_at IS NULL",
  ];

  if (filters.query) {
    clauses.push(`normalized_name LIKE ${sqlText(`%${filters.query}%`)}`);
  }

  if (filters.listType) {
    clauses.push(`(list_type IS NULL OR list_type = '' OR list_type = ${sqlText(filters.listType)})`);
  }

  if (filters.clientId) {
    clauses.push(`(client_id IS NULL OR client_id = '' OR client_id = ${sqlText(filters.clientId)})`);
  } else {
    clauses.push("(client_id IS NULL OR client_id = '')");
  }

  if (filters.projectId) {
    clauses.push(`(project_id IS NULL OR project_id = '' OR project_id = ${sqlText(filters.projectId)})`);
  } else {
    clauses.push("(project_id IS NULL OR project_id = '')");
  }

  const limit = Math.max(1, Math.min(Number(filters.limit) || 8, 20));
  const rows = await querySql(`
SELECT ${CATALOG_COLUMNS.join(", ")},
  CASE WHEN list_type = ${sqlNullableText(filters.listType)} THEN 1 ELSE 0 END AS list_type_match,
  CASE WHEN client_id = ${sqlNullableText(filters.clientId)} THEN 1 ELSE 0 END AS client_match,
  CASE WHEN project_id = ${sqlNullableText(filters.projectId)} THEN 1 ELSE 0 END AS project_match
FROM list_item_catalog
WHERE ${clauses.join("\n  AND ")}
ORDER BY
  project_match DESC,
  client_match DESC,
  list_type_match DESC,
  use_count DESC,
  last_used_at DESC,
  item_name COLLATE NOCASE ASC
LIMIT ${sqlInteger(limit)};
`);

  return rows.map(catalogRowToAppValue);
}

async function incrementCatalogUsage(workspaceId, catalogItemId, updatedByUserId = "") {
  const now = new Date().toISOString();

  await runSql(`
UPDATE list_item_catalog
SET use_count = use_count + 1,
    last_used_at = ${sqlText(now)},
    updated_by_user_id = ${sqlNullableText(updatedByUserId)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND catalog_item_id = ${sqlText(catalogItemId)}
  AND archived_at IS NULL;
`);

  return readCatalogItemById(workspaceId, catalogItemId);
}

async function createLink(workspaceId, link) {
  const linkId = link.list_link_id || randomUUID();
  const now = link.created_at || new Date().toISOString();

  await runSql(`
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
  ${sqlText(linkId)},
  ${sqlText(workspaceId)},
  ${sqlText(link.list_id)},
  ${sqlText(link.module_id)},
  ${sqlText(link.target_type)},
  ${sqlText(link.target_id)},
  ${sqlText(link.link_role || "related")},
  ${sqlNullableText(link.created_by_user_id)},
  ${sqlText(now)},
  NULL,
  ${sqlNullableText(serializeMetadata(link.metadata_json))}
);
`);

  return readLinkById(workspaceId, link.list_id, linkId);
}

async function listLinks(workspaceId, listId) {
  const rows = await querySql(`
SELECT ${LINK_COLUMNS.join(", ")}
FROM list_links
WHERE workspace_id = ${sqlText(workspaceId)}
  AND list_id = ${sqlText(listId)}
  AND removed_at IS NULL
ORDER BY created_at ASC;
`);

  return rows.map(linkRowToAppValue);
}

async function readLinkById(workspaceId, listId, linkId) {
  const rows = await querySql(`
SELECT ${LINK_COLUMNS.join(", ")}
FROM list_links
WHERE workspace_id = ${sqlText(workspaceId)}
  AND list_id = ${sqlText(listId)}
  AND list_link_id = ${sqlText(linkId)}
LIMIT 1;
`);

  return rows[0] ? linkRowToAppValue(rows[0]) : null;
}

async function removeLink(workspaceId, listId, linkId) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE list_links
SET removed_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND list_id = ${sqlText(listId)}
  AND list_link_id = ${sqlText(linkId)}
  AND removed_at IS NULL;
`);

  return readLinkById(workspaceId, listId, linkId);
}

function serializeMetadata(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function numberOrNullSql(value) {
  if (value === null || value === undefined || value === "") {
    return "NULL";
  }

  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "NULL";
}

function listRowToAppValue(row = {}) {
  return {
    ...row,
    is_reusable: Boolean(row.is_reusable),
    metadata_json: parseMetadata(row.metadata_json),
  };
}

function itemRowToAppValue(row = {}) {
  return {
    ...row,
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    estimated_cost: row.estimated_cost === null || row.estimated_cost === undefined ? null : Number(row.estimated_cost),
    actual_cost: row.actual_cost === null || row.actual_cost === undefined ? null : Number(row.actual_cost),
    metadata_json: parseMetadata(row.metadata_json),
  };
}

function catalogRowToAppValue(row = {}) {
  return {
    ...row,
    estimated_cost: row.estimated_cost === null || row.estimated_cost === undefined ? null : Number(row.estimated_cost),
    metadata_json: parseMetadata(row.metadata_json),
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    use_count: Number(row.use_count) || 0,
  };
}

function linkRowToAppValue(row = {}) {
  return {
    ...row,
    metadata_json: parseMetadata(row.metadata_json),
  };
}

function parseMetadata(value) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

const listsRepository = {
  createCatalogItem,
  create,
  createItem,
  createLink,
  incrementCatalogUsage,
  list,
  listCatalogSuggestions,
  listItems,
  listLinks,
  readCatalogItemById,
  readById,
  readItemById,
  readLinkById,
  removeLink,
  reorderItems,
  update,
  updateCatalogItem,
  updateItem,
};

export { listsRepository };
