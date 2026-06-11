const LIST_MODULE_ID = "lists";

const LIST_TYPES = Object.freeze({
  SHOPPING: "shopping",
  PROCUREMENT: "procurement",
  PACKING: "packing",
  SUPPLIES: "supplies",
  PARTS: "parts",
  CHECKLIST: "checklist",
  BILL_OF_MATERIALS: "bill_of_materials",
});

const LIST_STATUSES = Object.freeze({
  ACTIVE: "active",
  COMPLETED: "completed",
  FINALIZED: "finalized",
  ARCHIVED: "archived",
  DELETED: "deleted",
});

const LIST_ITEM_PURCHASE_STATUSES = Object.freeze({
  NEEDED: "needed",
  PLANNED: "planned",
  ORDERED: "ordered",
  RECEIVED: "received",
  CANCELLED: "cancelled",
  NOT_NEEDED: "not_needed",
});

const LIST_TYPE_VALUES = Object.freeze(Object.values(LIST_TYPES));
const LIST_STATUS_VALUES = Object.freeze(Object.values(LIST_STATUSES));
const LIST_ITEM_PURCHASE_STATUS_VALUES = Object.freeze(Object.values(LIST_ITEM_PURCHASE_STATUSES));

const DEFAULT_LIST_TYPE_BY_WORKSPACE_TYPE = Object.freeze({
  business: LIST_TYPES.PROCUREMENT,
  family: LIST_TYPES.SHOPPING,
  personal: LIST_TYPES.SHOPPING,
});

function isValidListType(value) {
  return LIST_TYPE_VALUES.includes(value);
}

function isValidListStatus(value) {
  return LIST_STATUS_VALUES.includes(value);
}

function isValidListItemPurchaseStatus(value) {
  return LIST_ITEM_PURCHASE_STATUS_VALUES.includes(value);
}

function defaultListTypeForWorkspaceType(workspaceType = "business") {
  return DEFAULT_LIST_TYPE_BY_WORKSPACE_TYPE[workspaceType] || LIST_TYPES.PROCUREMENT;
}

function isClientLinkingAllowedForWorkspaceType(workspaceType = "business") {
  return workspaceType === "business";
}

function validateListContext({ workspaceId, workspaceType = "business", clientId = null, project = null } = {}) {
  if (!workspaceId) {
    return {
      ok: false,
      reason: "workspace_required",
      message: "Lists must belong to one workspace.",
    };
  }

  if (clientId && !isClientLinkingAllowedForWorkspaceType(workspaceType)) {
    return {
      ok: false,
      reason: "client_hidden_for_workspace_type",
      message: "Client-linked lists are only available in business workspaces.",
    };
  }

  if (project) {
    if (project.workspace_id !== workspaceId) {
      return {
        ok: false,
        reason: "project_workspace_mismatch",
        message: "Project-linked lists cannot cross workspace boundaries.",
      };
    }

    if (clientId && project.client_id && project.client_id !== clientId) {
      return {
        ok: false,
        reason: "project_client_mismatch",
        message: "Project-linked lists must use the selected project's client.",
      };
    }
  }

  return {
    ok: true,
    clientId: project?.client_id || clientId || null,
    workspaceId,
  };
}

function validateListItemContext({ list = null, itemWorkspaceId = null } = {}) {
  if (!list?.workspace_id) {
    return {
      ok: false,
      reason: "parent_list_required",
      message: "List items must belong to a parent list.",
    };
  }

  if (itemWorkspaceId && itemWorkspaceId !== list.workspace_id) {
    return {
      ok: false,
      reason: "item_workspace_mismatch",
      message: "List items inherit workspace context from their parent list.",
    };
  }

  return {
    ok: true,
    workspaceId: list.workspace_id,
  };
}

export {
  DEFAULT_LIST_TYPE_BY_WORKSPACE_TYPE,
  LIST_ITEM_PURCHASE_STATUSES,
  LIST_ITEM_PURCHASE_STATUS_VALUES,
  LIST_MODULE_ID,
  LIST_STATUSES,
  LIST_STATUS_VALUES,
  LIST_TYPES,
  LIST_TYPE_VALUES,
  defaultListTypeForWorkspaceType,
  isClientLinkingAllowedForWorkspaceType,
  isValidListItemPurchaseStatus,
  isValidListStatus,
  isValidListType,
  validateListContext,
  validateListItemContext,
};
