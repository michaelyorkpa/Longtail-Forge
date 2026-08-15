// @ts-check
import {
  CreateListCatalogItemSchema,
  UpdateListCatalogItemSchema,
  parseListsEdgePayload,
} from "./lists.contracts.js";
import {
  LIST_PERMISSIONS,
  listResource,
} from "./access-policy.js";
import {
  LIST_MODULE_ID,
  LIST_TYPE_VALUES,
  validateListContext,
} from "./storage-contract.js";
import { assertModuleWriteEnabled } from "../../core/modules/module-access.js";
import { AppError } from "../../core/errors.js";
import { permissionsService } from "../../core/permissions.js";
import { settingsRepository } from "../../repositories/settings.repo.js";

/** @typedef {import("../../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */
/** @typedef {import("../../types/lists-catalog-item-contracts.js").ListsCatalogAggregateDependencies} ListsCatalogAggregateDependencies */
/** @typedef {import("../../types/lists-catalog-item-contracts.js").ListsCatalogAggregateService} ListsCatalogAggregateService */
/** @typedef {import("../../types/lists-catalog-item-contracts.js").ListsCatalogItemRecord} ListsCatalogItemRecord */
/** @typedef {import("../../types/lists-catalog-item-contracts.js").ListsCatalogSuggestionQuery} ListsCatalogSuggestionQuery */

const LIST_TYPE_SET = new Set(LIST_TYPE_VALUES);

/**
 * Create the Lists-owned catalog-item aggregate. List access, audit, and event
 * owners remain explicit dependencies while catalog normalization, ranking,
 * snapshots, usage, and lifecycle stay behind this typed seam.
 *
 * @param {ListsCatalogAggregateDependencies} dependencies
 * @returns {ListsCatalogAggregateService}
 */
function createCatalogItemsService(dependencies) {
  /** @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
  async function createCatalogItem(rawPayload, session) {
    await assertModuleWriteEnabled(session, LIST_MODULE_ID);
    await dependencies.assertCanManageCatalog(session);
    const payload = parseListsEdgePayload(CreateListCatalogItemSchema, rawPayload);
    return createValidatedCatalogItem(payload, session);
  }

  /** @param {Record<string, unknown>} payload @param {WorkspaceRequestSession} session */
  async function createValidatedCatalogItem(payload, session) {
    const normalized = await normalizeCatalogPayload(dependencies, payload, session, {
      catalog_item_id: payload.catalog_item_id || payload.id,
      created_by_user_id: session.user_id,
      updated_by_user_id: session.user_id,
    });
    const catalogItem = asCatalogItemRecord(await dependencies.repository.createCatalogItem(session.workspace_id, normalized));
    await dependencies.recordCatalogAudit(session, "list_item_catalog_created", "create", null, catalogItem);
    await dependencies.emitCatalogEvent("lists.catalog_item.created", session, null, catalogItem);
    return { catalogItem: shapeCatalogItemForBrowser(catalogItem) };
  }

  /** @param {Record<string, unknown>} payload @param {WorkspaceRequestSession} session */
  async function createFromListItem(payload, session) {
    await dependencies.assertCanManageCatalog(session);
    const created = await createValidatedCatalogItem(payload, session);
    return created.catalogItem;
  }

  /** @param {unknown} catalogItemId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
  async function updateCatalogItem(catalogItemId, rawPayload, session) {
    await assertModuleWriteEnabled(session, LIST_MODULE_ID);
    await dependencies.assertCanManageCatalog(session);
    const previousItem = await readCatalogItemOrThrow(session, catalogItemId);
    const payload = parseListsEdgePayload(UpdateListCatalogItemSchema, rawPayload);
    const normalized = await normalizeCatalogPayload(dependencies, payload, session, {
      ...previousItem,
      updated_by_user_id: session.user_id,
    });
    const catalogItem = asCatalogItemRecord(await dependencies.repository.updateCatalogItem(session.workspace_id, normalized));
    await dependencies.recordCatalogAudit(session, "list_item_catalog_updated", "update", previousItem, catalogItem);
    await dependencies.emitCatalogEvent("lists.catalog_item.updated", session, previousItem, catalogItem);
    return { catalogItem: shapeCatalogItemForBrowser(catalogItem) };
  }

  /** @param {WorkspaceRequestSession} session @param {ListsCatalogSuggestionQuery} [query] */
  async function suggestItems(session, query = {}) {
    await dependencies.assertListsReadable(session);
    const requestedListId = query.listId || query.list_id;
    const listRecord = requestedListId
      ? asListRecord(await dependencies.readListOrThrow(session, requestedListId, { includeDeleted: true }))
      : null;

    if (listRecord) {
      await dependencies.assertCanAccessList(session, listRecord, "read");
    } else {
      await permissionsService.assertCan(session, LIST_PERMISSIONS.VIEW, listResource({ workspace_id: session.workspace_id }));
    }

    const suggestions = asCatalogItemRecords(await dependencies.repository.listCatalogSuggestions(session.workspace_id, {
      clientId: normalizeOptionalText(query.clientId || query.client_id || listRecord?.client_id),
      limit: normalizeSuggestionLimit(query.limit),
      listType: normalizeOptionalText(query.listType || query.list_type || listRecord?.list_type),
      projectId: normalizeOptionalText(query.projectId || query.project_id || listRecord?.project_id),
      query: normalizeCatalogName(query.q || query.query || ""),
    }));

    return { suggestions: suggestions.map(shapeCatalogItemForBrowser) };
  }

  /** @param {Record<string, unknown>} payload @param {WorkspaceRequestSession} session */
  async function readSnapshot(payload, session) {
    const catalogItemId = normalizeOptionalText(payload.catalog_item_id || payload.catalogItemId);
    return catalogItemId ? readCatalogItemOrThrow(session, catalogItemId) : null;
  }

  /** @param {string} catalogItemId @param {WorkspaceRequestSession} session */
  async function recordUsage(catalogItemId, session) {
    await dependencies.repository.incrementCatalogUsage(session.workspace_id, catalogItemId, session.user_id);
  }

  /** @param {WorkspaceRequestSession} session @param {unknown} catalogItemId */
  async function readCatalogItemOrThrow(session, catalogItemId) {
    const normalizedId = normalizeRequiredText(catalogItemId, "Catalog item ID");
    const rawCatalogItem = await dependencies.repository.readCatalogItemById(session.workspace_id, normalizedId);
    if (!rawCatalogItem) throw new AppError("Catalog item not found.", 404);
    const catalogItem = asCatalogItemRecord(rawCatalogItem);
    if (catalogItem.archived_at) throw new AppError("Catalog item not found.", 404);
    return catalogItem;
  }

  return Object.freeze({
    createCatalogItem,
    createFromListItem,
    readSnapshot,
    recordUsage,
    suggestItems,
    updateCatalogItem,
  });
}

/** @param {ListsCatalogAggregateDependencies} dependencies @param {Record<string, unknown>} payload @param {WorkspaceRequestSession} session @param {Record<string, unknown>} fallback */
async function normalizeCatalogPayload(dependencies, payload, session, fallback = {}) {
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  const workspaceType = settings.workspaceType || "business";
  const itemName = normalizeRequiredText(valueOrFallback(payload, "item_name", fallback.item_name) || payload.itemName || payload.name, "Catalog item name");
  const listType = normalizeOptionalText(valueOrFallback(payload, "list_type", fallback.list_type));
  const projectId = normalizeOptionalText(valueOrFallback(payload, "project_id", fallback.project_id));
  const explicitClientId = normalizeOptionalText(valueOrFallback(payload, "client_id", fallback.client_id));
  const project = projectId
    ? asContextRecord(await dependencies.readProjectById(session.workspace_id, projectId), "Project")
    : null;

  if (listType && !LIST_TYPE_SET.has(/** @type {(typeof LIST_TYPE_VALUES)[number]} */ (listType))) {
    throw new AppError(`List type '${listType}' is not supported.`, 400);
  }
  if (projectId && !project) throw new AppError("Project not found.", 404);

  const context = validateListContext(/** @type {Parameters<typeof validateListContext>[0]} */ (/** @type {unknown} */ ({
    clientId: explicitClientId,
    project: project ? { workspace_id: project.workspace_id, client_id: project.client_id || "" } : null,
    workspaceId: session.workspace_id,
    workspaceType,
  })));
  if (!context.ok) throw new AppError(context.message || "List context is invalid.", 400);

  if (explicitClientId && !project) {
    const client = await dependencies.readClientById(session.workspace_id, explicitClientId);
    if (!client) throw new AppError("Client not found.", 404);
  }

  const now = new Date().toISOString();
  return asCatalogItemRecord({
    archived_at: nullableText(valueOrFallback(payload, "archived_at", fallback.archived_at)),
    catalog_item_id: normalizeOptionalText(fallback.catalog_item_id || payload.catalog_item_id || payload.catalogItemId || payload.id),
    client_id: nullableText(context.clientId),
    created_at: normalizeOptionalText(fallback.created_at) || now,
    created_by_user_id: normalizeOptionalText(fallback.created_by_user_id) || session.user_id,
    estimated_cost: normalizeOptionalNonNegativeNumber(valueOrFallback(payload, "estimated_cost", fallback.estimated_cost), "Estimated cost"),
    item_name: itemName,
    last_used_at: nullableText(valueOrFallback(payload, "last_used_at", fallback.last_used_at)),
    list_type: nullableText(listType),
    metadata_json: normalizeMetadata(valueOrFallback(payload, "metadata_json", fallback.metadata_json)),
    normalized_name: normalizeCatalogName(itemName),
    notes: nullableText(valueOrFallback(payload, "notes", fallback.notes)),
    project_id: nullableText(projectId),
    quantity: normalizeNonNegativeNumber(valueOrFallback(payload, "quantity", fallback.quantity) ?? 1, "Quantity"),
    unit: nullableText(valueOrFallback(payload, "unit", fallback.unit)),
    updated_at: now,
    updated_by_user_id: session.user_id,
    url: nullableText(valueOrFallback(payload, "url", fallback.url)),
    use_count: normalizeInteger(valueOrFallback(payload, "use_count", fallback.use_count) || 0, "Use count"),
    vendor_name: nullableText(valueOrFallback(payload, "vendor_name", fallback.vendor_name)),
    workspace_id: session.workspace_id,
  });
}

/** @param {Record<string, unknown>} object @param {string} snakeKey @param {unknown} fallbackValue */
function valueOrFallback(object, snakeKey, fallbackValue) {
  const camelKey = snakeKey.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
  return object[snakeKey] ?? object[camelKey] ?? fallbackValue;
}

/** @param {unknown} value @param {string} label */
function normalizeRequiredText(value, label) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) throw new AppError(`${label} is required.`, 400);
  return normalized;
}

/** @param {unknown} value */
function normalizeOptionalText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

/** @param {unknown} value */
function nullableText(value) {
  const normalized = normalizeOptionalText(value);
  return normalized || null;
}

/** @param {unknown} value @param {string} label */
function normalizeNonNegativeNumber(value, label) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) throw new AppError(`${label} must be zero or greater.`, 400);
  return normalized;
}

/** @param {unknown} value @param {string} label */
function normalizeOptionalNonNegativeNumber(value, label) {
  if (value === null || value === undefined || value === "") return null;
  return normalizeNonNegativeNumber(value, label);
}

/** @param {unknown} value @param {string} label */
function normalizeInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized)) throw new AppError(`${label} must be a whole number.`, 400);
  return normalized;
}

/** @param {unknown} value */
function normalizeSuggestionLimit(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 8;
  return Math.max(1, Math.min(Math.trunc(normalized), 20));
}

/** @param {unknown} value */
function normalizeCatalogName(value) {
  return normalizeOptionalText(value).toLowerCase().replace(/\s+/g, " ");
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function normalizeMetadata(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      throw new AppError("Metadata must be valid JSON.", 400);
    }
  }
  if (!isRecord(value)) throw new AppError("Metadata must be an object.", 400);
  return { ...value };
}

/** @param {ListsCatalogItemRecord} item */
function shapeCatalogItemForBrowser(item) {
  return { ...item, id: item.catalog_item_id };
}

/** @param {unknown} value @returns {ListsCatalogItemRecord} */
function asCatalogItemRecord(value) {
  if (!isRecord(value)
    || typeof value.catalog_item_id !== "string"
    || typeof value.workspace_id !== "string"
    || typeof value.item_name !== "string") {
    throw new AppError("List catalog persistence result is invalid.", 500);
  }
  return /** @type {ListsCatalogItemRecord} */ (value);
}

/** @param {unknown[]} values @returns {ListsCatalogItemRecord[]} */
function asCatalogItemRecords(values) {
  return values.map(asCatalogItemRecord);
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function asListRecord(value) {
  if (!isRecord(value) || typeof value.list_id !== "string" || typeof value.workspace_id !== "string") {
    throw new AppError("List persistence result is invalid.", 500);
  }
  return value;
}

/** @param {unknown} value @param {string} label @returns {{workspace_id: string, client_id?: string | null}} */
function asContextRecord(value, label) {
  if (!isRecord(value) || typeof value.workspace_id !== "string") {
    throw new AppError(`${label} persistence result is invalid.`, 500);
  }
  if (value.client_id !== null && value.client_id !== undefined && typeof value.client_id !== "string") {
    throw new AppError(`${label} persistence result is invalid.`, 500);
  }
  return /** @type {{workspace_id: string, client_id?: string | null}} */ (value);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export { createCatalogItemsService };
