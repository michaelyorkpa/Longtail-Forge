// Shared public API response helpers.
//
// `0.33.33.45.1` gave these one home. The envelopes and the pager were byte-identical in all five
// public API route and service files, and `withWorkspaceFallback` was identical in three of them.
// Each helper keeps that exact behaviour, and each is generic over what it carries, so every
// caller's own data, item and record types pass through unchanged.
//
// What stays with each owner: authorization, Notes' exposure policy, every module's response
// shaping, and two workspace aliases that are not this one - Tasks reads `workspace_id` through
// `Reflect.get` before spreading, and the framework Clients/Projects alias reads before spreading
// and recurses into `projects`. A record whose `workspace_id` is a getter can answer differently
// under those orders, so they are deliberately not merged here.

/** @typedef {{ workspace_id: string }} PublicApiWorkspaceContext */

/**
 * The single-record envelope.
 * @template Data
 * @param {Data} data
 * @param {PublicApiWorkspaceContext} context
 */
function publicApiData(data, context) {
  return {
    apiVersion: "v1",
    workspace_id: context.workspace_id,
    data,
  };
}

/**
 * The collection envelope. It reads `data` before `pagination`, as every copy did.
 * @template Data, Pagination
 * @param {{ data: Data, pagination: Pagination }} result
 * @param {PublicApiWorkspaceContext} context
 */
function publicApiList(result, context) {
  return {
    apiVersion: "v1",
    workspace_id: context.workspace_id,
    data: result.data,
    pagination: result.pagination,
  };
}

/**
 * One page of an already ordered collection: `limit` 1-100, default 50, and `offset` from 0,
 * default 0, each parsed as a base-10 integer and clamped.
 * @template Item
 * @param {Item[]} items
 * @param {{ limit?: unknown, offset?: unknown }} query
 */
function pagePublicApiItems(items, query) {
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

/**
 * The record's own `workspace_id` when it is truthy, otherwise the caller's workspace. A value
 * that is not an object passes through untouched. The record is spread first and its
 * `workspace_id` read afterwards - the order Lists, Notes and Time Tracking each used. Each of them
 * admitted only a record, and so does this; the non-object guard is their runtime behaviour, kept.
 * @template {{ workspace_id?: unknown }} RecordValue
 * @param {RecordValue} record
 * @param {PublicApiWorkspaceContext} context
 */
function withWorkspaceFallback(record, context) {
  if (!record || typeof record !== "object") {
    return record;
  }

  return {
    ...record,
    workspace_id: record.workspace_id || context.workspace_id,
  };
}

/**
 * Lists and Notes spelled this `String(value)`; the others `String(value ?? "")`. The two differ
 * only for `null` and `undefined`, where both parse to `NaN` and answer the fallback.
 * @param {unknown} value @param {number} min @param {number} max @param {number} fallback
 */
function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export { pagePublicApiItems, publicApiData, publicApiList, withWorkspaceFallback };
