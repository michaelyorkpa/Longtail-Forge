// @ts-check
// Request-scoped memoization for repeated context reads (workspace settings,
// permission assignments, module context) within one request. The cache lives
// on the session object materialized for a single request, so entries never
// outlive the request or leak across users. Pass the session only from read
// paths: entries are not invalidated by writes inside the same request.

function readRequestScopedCache(session, namespace) {
  if (!session.__requestCache) {
    Object.defineProperty(session, "__requestCache", {
      configurable: true,
      enumerable: false,
      value: new Map(),
    });
  }

  if (!session.__requestCache.has(namespace)) {
    session.__requestCache.set(namespace, new Map());
  }

  return session.__requestCache.get(namespace);
}

export { readRequestScopedCache };
