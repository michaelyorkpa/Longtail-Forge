import { listsService } from "./lists.service.js";

async function listLists(context, query = {}) {
  const result = await listsService.list(context, query);
  return paged(result.lists.map((list) => withWorkspaceAlias(list, context)), query);
}

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

function withWorkspaceAlias(record, context) {
  if (!record || typeof record !== "object") {
    return record;
  }

  return {
    ...record,
    workspace_id: record.workspace_id || context.workspace_id,
  };
}

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

function queryFlag(value) {
  return value === true || value === "true";
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export const listsPublicApiService = {
  listLists,
  readList,
};
