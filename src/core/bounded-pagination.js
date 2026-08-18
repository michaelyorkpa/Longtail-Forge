const DEFAULT_MAX_OFFSET = Number.MAX_SAFE_INTEGER;

/** @typedef {{ limit?: unknown, pageSize?: unknown, page_size?: unknown, cursor?: unknown, nextCursor?: unknown, next_cursor?: unknown, offset?: unknown }} BoundedPaginationSource */
/** @typedef {{ defaultLimit?: unknown, maxLimit?: unknown, maxOffset?: unknown }} BoundedPaginationOptions */
/** @typedef {{ limit?: unknown, maxPageSize?: unknown, offset?: unknown, returned?: unknown, hasMore?: boolean, total?: unknown }} BoundedPaginationEnvelopeInput */

/** @param {BoundedPaginationSource} [source] @param {BoundedPaginationOptions} [options] */
function normalizeBoundedPagination(source = {}, options = {}) {
  const defaultLimit = positiveInteger(options.defaultLimit, 25);
  const maxLimit = positiveInteger(options.maxLimit, Math.max(defaultLimit, 100));
  const maxOffset = positiveInteger(options.maxOffset, DEFAULT_MAX_OFFSET);
  const requestedLimit = firstValue(source.limit, source.pageSize, source.page_size);
  const cursorOffset = decodeOffsetCursor(firstValue(source.cursor, source.nextCursor, source.next_cursor));
  const requestedOffset = cursorOffset ?? nonNegativeInteger(firstValue(source.offset), 0);
  const limit = clampInteger(requestedLimit, defaultLimit, 1, maxLimit);
  const offset = Math.min(requestedOffset, maxOffset);

  return {
    limit,
    maxPageSize: maxLimit,
    offset,
  };
}

/** @param {BoundedPaginationEnvelopeInput} [pagination] @param {BoundedPaginationOptions} [options] */
function boundedPaginationEnvelope(pagination = {}, options = {}) {
  const limit = positiveInteger(pagination.limit, positiveInteger(options.defaultLimit, 25));
  const maxPageSize = positiveInteger(pagination.maxPageSize, positiveInteger(options.maxLimit, limit));
  const offset = nonNegativeInteger(pagination.offset, 0);
  const returned = nonNegativeInteger(pagination.returned, 0);
  const hasMore = pagination.hasMore === true;
  const nextOffset = offset + returned;
  const total = pagination.total === null || pagination.total === undefined
    ? null
    : Number.isFinite(Number(pagination.total)) ? Number(pagination.total) : null;

  return {
    hasMore,
    limit,
    maxPageSize,
    nextCursor: hasMore ? encodeOffsetCursor(nextOffset) : "",
    offset,
    returned,
    total,
  };
}

/**
 * @param {number} offset
 */
function encodeOffsetCursor(offset) {
  const normalizedOffset = nonNegativeInteger(offset, 0);

  if (normalizedOffset <= 0) {
    return "";
  }

  return Buffer.from(JSON.stringify({
    offset: normalizedOffset,
    v: 1,
  })).toString("base64url");
}

/**
 * @param {unknown} cursor
 */
function decodeOffsetCursor(cursor) {
  const text = typeof cursor === "string" ? cursor.trim() : "";

  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
    const offset = Number.parseInt(parsed?.offset, 10);

    return Number.isInteger(offset) && offset >= 0 ? offset : null;
  } catch {
    return null;
  }
}

/** @param {...unknown} values */
function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return undefined;
}

/** @param {unknown} value @param {number} fallback @param {number} minimum @param {number} maximum */
function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export {
  boundedPaginationEnvelope,
  decodeOffsetCursor,
  encodeOffsetCursor,
  normalizeBoundedPagination,
};
