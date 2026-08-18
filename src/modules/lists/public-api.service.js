import { listsService } from "./lists.service.js";

/** @param {ApiSession} context @param {ListsServiceQuery} [query] @returns {Promise<ListsPublicApiListResult>} */
async function listLists(context, query = {}) {
  const result = await listsService.list(context, query);
  return paged(result.lists.map((list) => withWorkspaceAlias(list, context)), query);
}

/** @param {ApiSession} context @param {string} listId @param {ListsServiceQuery} [query] @returns {Promise<ListsPublicApiReadResult>} */
async function readList(context, listId, query = {}) {
  const result = await listsService.read(listId, context, {
    includeDeleted: queryFlag(query.includeDeleted || query.include_deleted),
    includeDeletedItems: false,
  });

  return {
    list: withWorkspaceAlias(result.list, context),
    items: result.items,
    links: result.links,
  };
}

/** @param {ListsBrowserRecord} record @param {ApiSession} context @returns {ListsBrowserRecord} */
function withWorkspaceAlias(record, context) {
  if (!record || typeof record !== "object") {
    return record;
  }

  return {
    ...record,
    workspace_id: record.workspace_id || context.workspace_id,
  };
}

/** @param {ListsBrowserRecord[]} items @param {ListsServiceQuery} query @returns {ListsPublicApiListResult} */
function paged(items, query) {
  const limit = clampInteger(query.limit, 1, 100, 50);
  const offset = clampInteger(query.offset, 0, Number.MAX_SAFE_INTEGER, 0);

  return {
    data: items.slice(offset, offset + limit),
    pagination: {
      limit,
      offset,
      total: items.length,
      has_more: offset + limit < items.length,
    },
  };
}

/** @param {unknown} value */
function queryFlag(value) {
  return value === true || value === "true";
}

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export const listsPublicApiService = {
  listLists,
  readList,
};

/** @typedef {import("../../types/http-contracts.js").ApiSession} ApiSession */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsPublicApiListResult} ListsPublicApiListResult */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsPublicApiReadResult} ListsPublicApiReadResult */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsRecord} ListsRecord */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsBrowserRecord} ListsBrowserRecord */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsServiceQuery} ListsServiceQuery */
