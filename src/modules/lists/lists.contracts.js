// @ts-check
// Lists edge-payload contracts.
//
// Lists accepts deliberately liberal scalar workflow inputs because browser
// forms and retained callers use snake_case/camelCase fields and rely on the
// service's text/number/boolean normalization. Zod owns only the untrusted
// shape boundary; required values, enums, context, permissions, and lifecycle
// error copy stay in the Lists service.
//
// Unknown/audit fields are stripped. Fields already recognized by the Lists
// normalizers remain present even when they are server-managed so the service
// keeps ownership of its established lifecycle rejection/preservation rules.

import { z } from "zod";
import { AppError } from "../../utils/app-error.js";

/** @param {string} label */
const optionalWorkflowScalar = (label) => z.union([
  z.string().trim(),
  z.number(),
  z.boolean(),
], { error: `${label} must be text or a scalar value.` }).nullable().optional();

// Metadata historically accepts objects/JSON text and reduces other shapes
// to an empty object. Preserve that calibration at this edge.
const optionalMetadata = z.unknown().optional();

const listWriteFields = {
  archivedAt: optionalWorkflowScalar("Archived time"),
  archived_at: optionalWorkflowScalar("Archived time"),
  clientId: optionalWorkflowScalar("Client ID"),
  client_id: optionalWorkflowScalar("Client ID"),
  description: optionalWorkflowScalar("List description"),
  completedAt: optionalWorkflowScalar("Completed time"),
  completed_at: optionalWorkflowScalar("Completed time"),
  deletedAt: optionalWorkflowScalar("Deleted time"),
  deleted_at: optionalWorkflowScalar("Deleted time"),
  duplicatedFromListId: optionalWorkflowScalar("Duplicated-from list ID"),
  duplicated_from_list_id: optionalWorkflowScalar("Duplicated-from list ID"),
  finalizedAt: optionalWorkflowScalar("Finalized time"),
  finalizedByUserId: optionalWorkflowScalar("Finalized user ID"),
  finalized_at: optionalWorkflowScalar("Finalized time"),
  finalized_by_user_id: optionalWorkflowScalar("Finalized user ID"),
  id: optionalWorkflowScalar("List ID"),
  listType: optionalWorkflowScalar("List type"),
  list_id: optionalWorkflowScalar("List ID"),
  list_type: optionalWorkflowScalar("List type"),
  isReusable: optionalWorkflowScalar("Reusable state"),
  is_reusable: optionalWorkflowScalar("Reusable state"),
  metadataJson: optionalMetadata,
  metadata_json: optionalMetadata,
  projectId: optionalWorkflowScalar("Project ID"),
  project_id: optionalWorkflowScalar("Project ID"),
  sourceListId: optionalWorkflowScalar("Source list ID"),
  source_list_id: optionalWorkflowScalar("Source list ID"),
  status: optionalWorkflowScalar("List status"),
  title: optionalWorkflowScalar("List title"),
};

const CreateListSchema = z.object(listWriteFields);
const UpdateListSchema = z.object(listWriteFields);

const DuplicateListSchema = z.object({
  copyTitle: optionalWorkflowScalar("Copy title"),
  id: optionalWorkflowScalar("List ID"),
  list_id: optionalWorkflowScalar("List ID"),
  title: optionalWorkflowScalar("Copy title"),
});

const itemWriteFields = {
  actualCost: optionalWorkflowScalar("Actual cost"),
  actual_cost: optionalWorkflowScalar("Actual cost"),
  assignedUserId: optionalWorkflowScalar("Assigned user ID"),
  assigned_user_id: optionalWorkflowScalar("Assigned user ID"),
  checkedAt: optionalWorkflowScalar("Checked time"),
  checkedByUserId: optionalWorkflowScalar("Checked user ID"),
  checked_at: optionalWorkflowScalar("Checked time"),
  checked_by_user_id: optionalWorkflowScalar("Checked user ID"),
  catalogItemId: optionalWorkflowScalar("Catalog item ID"),
  catalog_item_id: optionalWorkflowScalar("Catalog item ID"),
  completedAt: optionalWorkflowScalar("Completed time"),
  completedByUserId: optionalWorkflowScalar("Completed user ID"),
  completed_at: optionalWorkflowScalar("Completed time"),
  completed_by_user_id: optionalWorkflowScalar("Completed user ID"),
  deletedAt: optionalWorkflowScalar("Deleted time"),
  deleted_at: optionalWorkflowScalar("Deleted time"),
  estimatedCost: optionalWorkflowScalar("Estimated cost"),
  estimated_cost: optionalWorkflowScalar("Estimated cost"),
  id: optionalWorkflowScalar("List item ID"),
  itemName: optionalWorkflowScalar("Item name"),
  item_name: optionalWorkflowScalar("Item name"),
  list_item_id: optionalWorkflowScalar("List item ID"),
  metadataJson: optionalMetadata,
  metadata_json: optionalMetadata,
  name: optionalWorkflowScalar("Item name"),
  neededByDate: optionalWorkflowScalar("Needed by date"),
  needed_by_date: optionalWorkflowScalar("Needed by date"),
  notes: optionalWorkflowScalar("Item notes"),
  purchaseStatus: optionalWorkflowScalar("Purchase status"),
  purchase_status: optionalWorkflowScalar("Purchase status"),
  quantity: optionalWorkflowScalar("Quantity"),
  saveToCatalog: optionalWorkflowScalar("Save to catalog"),
  save_to_catalog: optionalWorkflowScalar("Save to catalog"),
  sortOrder: optionalWorkflowScalar("Sort order"),
  sort_order: optionalWorkflowScalar("Sort order"),
  trackingId: optionalWorkflowScalar("Tracking ID"),
  tracking_id: optionalWorkflowScalar("Tracking ID"),
  unit: optionalWorkflowScalar("Unit"),
  url: optionalWorkflowScalar("URL"),
  vendorName: optionalWorkflowScalar("Vendor name"),
  vendor_name: optionalWorkflowScalar("Vendor name"),
};

const CreateListItemSchema = z.object(itemWriteFields);
const UpdateListItemSchema = z.object(itemWriteFields);

const itemOrderFields = {
  id: optionalWorkflowScalar("List item ID"),
  itemId: optionalWorkflowScalar("List item ID"),
  item_id: optionalWorkflowScalar("List item ID"),
  list_item_id: optionalWorkflowScalar("List item ID"),
  sortOrder: optionalWorkflowScalar("Sort order"),
  sort_order: optionalWorkflowScalar("Sort order"),
};

const ListItemOrderSchema = z.object(itemOrderFields);
const optionalItemOrders = z.array(ListItemOrderSchema, {
  error: "Item order payload must be an array.",
}).optional();

const ReorderListItemsSchema = z.object({
  itemOrders: optionalItemOrders,
  item_orders: optionalItemOrders,
  items: optionalItemOrders,
});

const catalogWriteFields = {
  archivedAt: optionalWorkflowScalar("Catalog archived time"),
  archived_at: optionalWorkflowScalar("Catalog archived time"),
  catalogItemId: optionalWorkflowScalar("Catalog item ID"),
  catalog_item_id: optionalWorkflowScalar("Catalog item ID"),
  clientId: optionalWorkflowScalar("Client ID"),
  client_id: optionalWorkflowScalar("Client ID"),
  estimatedCost: optionalWorkflowScalar("Estimated cost"),
  estimated_cost: optionalWorkflowScalar("Estimated cost"),
  id: optionalWorkflowScalar("Catalog item ID"),
  itemName: optionalWorkflowScalar("Catalog item name"),
  item_name: optionalWorkflowScalar("Catalog item name"),
  listType: optionalWorkflowScalar("List type"),
  list_type: optionalWorkflowScalar("List type"),
  lastUsedAt: optionalWorkflowScalar("Last-used time"),
  last_used_at: optionalWorkflowScalar("Last-used time"),
  metadataJson: optionalMetadata,
  metadata_json: optionalMetadata,
  name: optionalWorkflowScalar("Catalog item name"),
  notes: optionalWorkflowScalar("Catalog item notes"),
  projectId: optionalWorkflowScalar("Project ID"),
  project_id: optionalWorkflowScalar("Project ID"),
  quantity: optionalWorkflowScalar("Quantity"),
  unit: optionalWorkflowScalar("Unit"),
  useCount: optionalWorkflowScalar("Use count"),
  use_count: optionalWorkflowScalar("Use count"),
  url: optionalWorkflowScalar("URL"),
  vendorName: optionalWorkflowScalar("Vendor name"),
  vendor_name: optionalWorkflowScalar("Vendor name"),
};

const CreateListCatalogItemSchema = z.object(catalogWriteFields);
const UpdateListCatalogItemSchema = z.object(catalogWriteFields);

const CreateListLinkSchema = z.object({
  id: optionalWorkflowScalar("List link ID"),
  linkRole: optionalWorkflowScalar("Link role"),
  link_role: optionalWorkflowScalar("Link role"),
  listLinkId: optionalWorkflowScalar("List link ID"),
  list_link_id: optionalWorkflowScalar("List link ID"),
  metadata: optionalMetadata,
  metadata_json: optionalMetadata,
  moduleId: optionalWorkflowScalar("Module ID"),
  module_id: optionalWorkflowScalar("Module ID"),
  targetId: optionalWorkflowScalar("Target ID"),
  targetType: optionalWorkflowScalar("Target type"),
  target_id: optionalWorkflowScalar("Target ID"),
  target_type: optionalWorkflowScalar("Target type"),
});

/**
 * Parse one untrusted Lists edge payload.
 *
 * @template {import("zod").ZodType} Schema
 * @param {Schema} schema
 * @param {unknown} payload
 * @returns {import("zod").output<Schema>}
 */
function parseListsEdgePayload(schema, payload) {
  const result = schema.safeParse(payload ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(issue?.message || "Lists payload is invalid.", 400);
  }

  return result.data;
}

export {
  CreateListCatalogItemSchema,
  CreateListItemSchema,
  CreateListLinkSchema,
  CreateListSchema,
  DuplicateListSchema,
  ListItemOrderSchema,
  ReorderListItemsSchema,
  UpdateListCatalogItemSchema,
  UpdateListItemSchema,
  UpdateListSchema,
  parseListsEdgePayload,
};
