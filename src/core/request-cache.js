// @ts-check
// Request-scoped memoization for repeated context reads (workspace settings,
// permission assignments, module context) within one request. The cache lives
// on the session object materialized for a single request, so entries never
// outlive the request or leak across users. Pass the session only from read
// paths: entries are not invalidated by writes inside the same request.

/** @typedef {import("../types/http-contracts.js").RequestSession & { __requestCache?: Map<string, Map<unknown, unknown>> }} RequestCacheSession */

/**
 * @template K, V
 * @param {RequestCacheSession} session
 * @param {string} namespace
 * @returns {Map<K, V>}
 */
function readRequestScopedCache(session, namespace) {
  /** @type {Map<string, Map<unknown, unknown>>} */
  const requestCache = session.__requestCache || new Map();
  if (!session.__requestCache) {
    Object.defineProperty(session, "__requestCache", {
      configurable: true,
      enumerable: false,
      value: requestCache,
    });
  }

  const namespaceCache = requestCache.get(namespace) || new Map();
  if (!requestCache.has(namespace)) {
    requestCache.set(namespace, namespaceCache);
  }

  return /** @type {Map<K, V>} */ (namespaceCache);
}

export { readRequestScopedCache };
