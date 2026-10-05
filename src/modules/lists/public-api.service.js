import { listsService } from "./lists.service.js";
import { pagePublicApiItems, withWorkspaceFallback } from "../../core/public-api-responses.js";

/** @param {ApiSession} context @param {ListsServiceQuery} [query] @returns {Promise<ListsPublicApiListResult>} */
async function listLists(context, query = {}) {
  const result = await listsService.list(context, query);
  return pagePublicApiItems(result.lists.map((list) => withWorkspaceFallback(list, context)), query);
}

/** @param {ApiSession} context @param {string} listId @param {ListsServiceQuery} [query] @returns {Promise<ListsPublicApiReadResult>} */
async function readList(context, listId, query = {}) {
  const result = await listsService.read(listId, context, {
    includeDeleted: queryFlag(query.includeDeleted || query.include_deleted),
    includeDeletedItems: false,
  });

  return {
    list: withWorkspaceFallback(result.list, context),
    items: result.items,
    links: result.links,
  };
}

/** @param {unknown} value */
function queryFlag(value) {
  return value === true || value === "true";
}

export const listsPublicApiService = {
  listLists,
  readList,
};

/** @typedef {import("../../types/http-contracts.js").ApiSession} ApiSession */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsPublicApiListResult} ListsPublicApiListResult */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsPublicApiReadResult} ListsPublicApiReadResult */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsRecord} ListsRecord */
/** @typedef {import("../../types/lists-domain-contracts.js").ListsServiceQuery} ListsServiceQuery */
