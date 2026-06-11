import {
  LIST_MODULE_ID,
  LIST_STATUSES,
} from "./storage-contract.js";

const LIST_PERMISSIONS = Object.freeze({
  VIEW: "lists.view",
  VIEW_ALL: "lists.view_all",
  CREATE: "lists.create",
  UPDATE: "lists.update",
  COMPLETE: "lists.complete",
  FINALIZE: "lists.finalize",
  ARCHIVE: "lists.archive",
  RESTORE: "lists.restore",
  DELETE: "lists.delete",
  DUPLICATE: "lists.duplicate",
  MANAGE_ITEMS: "lists.manage_items",
  MANAGE_REUSABLE: "lists.manage_reusable",
  MANAGE_CATALOG: "lists.manage_catalog",
  MANAGE_LINKS: "lists.manage_links",
  MANAGE_SETTINGS: "lists.manage_settings",
});

const LIST_RESOURCE_DEFINITION = Object.freeze({
  key: "lists",
  moduleId: LIST_MODULE_ID,
  label: "Lists",
  operations: [
    "read",
    "create",
    "update",
    "complete",
    "finalize",
    "archive",
    "restore",
    "delete",
    "duplicate",
    "manage_items",
    "manage_reusable",
    "manage_catalog",
    "manage_links",
    "manage",
  ],
});

const LIST_AUDIT_RECORD_TYPES = Object.freeze([
  {
    recordType: "list",
    moduleId: LIST_MODULE_ID,
    label: "List",
    description: "List records and list lifecycle audit history.",
  },
  {
    recordType: "list_item",
    moduleId: LIST_MODULE_ID,
    label: "List Item",
    description: "List item lifecycle and status audit history.",
  },
  {
    recordType: "list_link",
    moduleId: LIST_MODULE_ID,
    label: "List Link",
    description: "List linked-record lifecycle audit history.",
  },
]);

const LIST_EVENT_TYPES = Object.freeze([
  eventType("lists.list.created", "List Created", "Emitted after a list is created.", "list"),
  eventType("lists.list.updated", "List Updated", "Emitted after a list is updated.", "list"),
  eventType("lists.list.completed", "List Completed", "Emitted after a list is completed.", "list"),
  eventType("lists.list.finalized", "List Finalized", "Emitted after a list is finalized.", "list"),
  eventType("lists.list.reopened", "List Reopened", "Emitted after a completed list is reopened.", "list"),
  eventType("lists.list.archived", "List Archived", "Emitted after a list is archived.", "list"),
  eventType("lists.list.restored", "List Restored", "Emitted after a list is restored.", "list"),
  eventType("lists.list.deleted", "List Deleted", "Emitted after a list is soft-deleted.", "list"),
  eventType("lists.list.duplicated", "List Duplicated", "Emitted after a list is duplicated.", "list"),
  eventType("lists.list.reusable_marked", "Reusable List Marked", "Emitted after a list is marked reusable.", "list"),
  eventType("lists.list.reusable_unmarked", "Reusable List Unmarked", "Emitted after a list is unmarked reusable.", "list"),
  eventType("lists.item.created", "List Item Created", "Emitted after a list item is created.", "list_item"),
  eventType("lists.item.updated", "List Item Updated", "Emitted after a list item is updated.", "list_item"),
  eventType("lists.item.checked", "List Item Checked", "Emitted after a list item is checked.", "list_item"),
  eventType("lists.item.unchecked", "List Item Unchecked", "Emitted after a list item is unchecked.", "list_item"),
  eventType("lists.item.completed", "List Item Completed", "Emitted after a list item is completed.", "list_item"),
  eventType("lists.item.deleted", "List Item Deleted", "Emitted after a list item is soft-deleted.", "list_item"),
  eventType("lists.link.created", "List Link Created", "Emitted after a list is linked to another record.", "list_link"),
  eventType("lists.link.removed", "List Link Removed", "Emitted after a list link is removed.", "list_link"),
]);

const LIST_WRITE_OPERATIONS = new Set([
  "create",
  "update",
  "complete",
  "finalize",
  "archive",
  "restore",
  "delete",
  "duplicate",
  "manage_items",
  "manage_reusable",
  "manage_links",
]);

const LIST_OPERATION_PERMISSIONS = Object.freeze({
  read: LIST_PERMISSIONS.VIEW,
  create: LIST_PERMISSIONS.CREATE,
  update: LIST_PERMISSIONS.UPDATE,
  complete: LIST_PERMISSIONS.COMPLETE,
  finalize: LIST_PERMISSIONS.FINALIZE,
  archive: LIST_PERMISSIONS.ARCHIVE,
  restore: LIST_PERMISSIONS.RESTORE,
  delete: LIST_PERMISSIONS.DELETE,
  duplicate: LIST_PERMISSIONS.DUPLICATE,
  manage_items: LIST_PERMISSIONS.MANAGE_ITEMS,
  manage_reusable: LIST_PERMISSIONS.MANAGE_REUSABLE,
  manage_links: LIST_PERMISSIONS.MANAGE_LINKS,
});

function eventType(event, label, description, recordType) {
  return {
    event,
    moduleId: LIST_MODULE_ID,
    label,
    description,
    recordType,
  };
}

function createPermissionSet(permissions = []) {
  if (permissions instanceof Set) {
    return permissions;
  }

  return new Set((Array.isArray(permissions) ? permissions : [permissions]).filter(Boolean));
}

function listResource(list = {}) {
  return {
    workspace_id: list.workspace_id,
    client_id: list.client_id || "",
    project_id: list.project_id || "",
    list_id: list.list_id || "",
    operation: "read",
  };
}

function itemResource(list = {}, item = {}) {
  return {
    ...listResource(list),
    list_item_id: item.list_item_id || "",
    operation: "manage_items",
  };
}

function canAccessList({
  list = {},
  operation = "read",
  session = {},
  permissions = [],
  listsModuleEnabled = true,
  historicalReadAccess = true,
} = {}) {
  const normalizedOperation = String(operation || "read").trim();
  const permissionSet = createPermissionSet(permissions);

  if (!listsModuleEnabled && LIST_WRITE_OPERATIONS.has(normalizedOperation)) {
    return deny("module_disabled");
  }

  if (!listsModuleEnabled && !historicalReadAccess) {
    return deny("module_disabled");
  }

  if (!list.workspace_id || !session.workspace_id || list.workspace_id !== session.workspace_id) {
    return deny("workspace_mismatch");
  }

  const requiredPermission = LIST_OPERATION_PERMISSIONS[normalizedOperation] || LIST_PERMISSIONS.VIEW;
  if (!permissionSet.has(requiredPermission) && !permissionSet.has(LIST_PERMISSIONS.VIEW_ALL)) {
    return deny("missing_permission");
  }

  if (list.status === LIST_STATUSES.DELETED && normalizedOperation !== "restore" && normalizedOperation !== "delete") {
    return deny("deleted_list");
  }

  if (list.status === LIST_STATUSES.FINALIZED && LIST_WRITE_OPERATIONS.has(normalizedOperation) && normalizedOperation !== "archive" && normalizedOperation !== "restore" && normalizedOperation !== "duplicate") {
    return deny("finalized_read_only");
  }

  if (list.status === LIST_STATUSES.ARCHIVED && LIST_WRITE_OPERATIONS.has(normalizedOperation) && normalizedOperation !== "restore" && normalizedOperation !== "delete" && normalizedOperation !== "duplicate") {
    return deny("archived_read_only");
  }

  return allow();
}

function canManageListItem({
  list = {},
  item = {},
  operation = "manage_items",
  session = {},
  permissions = [],
  listsModuleEnabled = true,
  historicalReadAccess = true,
} = {}) {
  const listAccess = canAccessList({
    list,
    operation,
    session,
    permissions,
    listsModuleEnabled,
    historicalReadAccess,
  });

  if (!listAccess.allowed) {
    return listAccess;
  }

  if (item.workspace_id && item.workspace_id !== list.workspace_id) {
    return deny("item_workspace_mismatch");
  }

  if (item.list_id && item.list_id !== list.list_id) {
    return deny("item_parent_mismatch");
  }

  if (item.deleted_at && operation !== "delete") {
    return deny("deleted_item");
  }

  return allow();
}

function sanitizeListLifecyclePayload(payload = {}) {
  const source = payload.newValue || payload.previousValue || payload.list || payload.item || payload;
  const metadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};

  return {
    workspace_id: source.workspace_id || metadata.workspace_id || "",
    list_id: source.list_id || metadata.list_id || "",
    list_link_id: source.list_link_id || metadata.list_link_id || "",
    list_item_id: source.list_item_id || metadata.list_item_id || "",
    actor_user_id: payload.actorUserId || payload.actor_user_id || metadata.actor_user_id || "",
    title: source.title || metadata.title || "",
    item_name: source.item_name || metadata.item_name || "",
    status: source.status || metadata.status || "",
    list_type: source.list_type || metadata.list_type || "",
    purchase_status: source.purchase_status || metadata.purchase_status || "",
    link_role: source.link_role || metadata.link_role || "",
    module_id: source.module_id || metadata.module_id || "",
    target_type: source.target_type || metadata.target_type || "",
    target_id: source.target_id || metadata.target_id || "",
    client_id: source.client_id || metadata.client_id || "",
    project_id: source.project_id || metadata.project_id || "",
    source_url: source.source_url || metadata.source_url || "",
    total_item_count: source.total_item_count ?? metadata.total_item_count ?? 0,
    checked_item_count: source.checked_item_count ?? metadata.checked_item_count ?? 0,
    completed_item_count: source.completed_item_count ?? metadata.completed_item_count ?? 0,
    next_unchecked_item_label: source.next_unchecked_item_label || metadata.next_unchecked_item_label || "",
    earliest_needed_by_date: source.earliest_needed_by_date || metadata.earliest_needed_by_date || "",
    last_activity_at: source.last_activity_at || metadata.last_activity_at || "",
    timestamp: payload.timestamp || metadata.timestamp || new Date().toISOString(),
    reason: payload.reason || metadata.reason || "",
  };
}

function allow() {
  return { allowed: true, reason: "" };
}

function deny(reason) {
  return { allowed: false, reason };
}

export {
  LIST_AUDIT_RECORD_TYPES,
  LIST_EVENT_TYPES,
  LIST_OPERATION_PERMISSIONS,
  LIST_PERMISSIONS,
  LIST_RESOURCE_DEFINITION,
  canAccessList,
  canManageListItem,
  itemResource,
  listResource,
  sanitizeListLifecyclePayload,
};
