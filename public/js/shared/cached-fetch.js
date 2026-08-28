// @ts-check

/** @typedef {import("../../../src/types/browser-contracts.js").BrowserApi} BrowserApi */
/** @typedef {import("../../../src/types/browser-contracts.js").CachedFetchOptions} CachedFetchOptions */
/** @typedef {import("../../../src/types/browser-contracts.js").CachedFetchResult} CachedFetchResult */

/** @param {Window} global */
(function attachCachedFetch(global) {
  const namespace = global.LongtailForge || {};
  const STORAGE_PREFIX = "lf_cached_fetch:";

  // Stale-while-revalidate for near-static reads (card registry, focus modes,
  // client/project options): the sessionStorage copy renders immediately and
  // every call still revalidates against the server with `cache: "no-cache"`
  // so ETag revalidation works. Live data (timers, candidates, notifications)
  // must not use this helper. Cache keys must include the workspace id so a
  // workspace switch never serves another workspace's payload.

  /**
   * The API client this file cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing client still fails at
   * exactly the moment it failed before `0.33.33.38.1` declared the namespace it lives on.
   * The five methods keep returning `Promise<unknown>`: a fetch body is an untrusted wire
   * value, and narrowing one is `0.33.33.38.4`'s work rather than this file's.
   * @returns {BrowserApi}
   */
  function requireApi() {
    const client = namespace?.api;
    if (!client) {
      throw new Error("Cached fetch requires LongtailForge.api.");
    }
    return client;
  }
  /** @param {string} cacheKey */
  function readCached(cacheKey) {
    try {
      const entry = JSON.parse(global.sessionStorage.getItem(STORAGE_PREFIX + cacheKey) || "null");
      return entry && typeof entry === "object" && "data" in entry ? entry.data : null;
    } catch {
      return null;
    }
  }

  /**
   * @param {string} cacheKey
   * @param {unknown} data
   */
  function writeCached(cacheKey, data) {
    try {
      global.sessionStorage.setItem(STORAGE_PREFIX + cacheKey, JSON.stringify({ data }));
    } catch {
      // Quota or privacy-mode failures fall back to uncached loads.
    }
  }

  /** @param {string} cacheKey */
  function clearCached(cacheKey) {
    try {
      global.sessionStorage.removeItem(STORAGE_PREFIX + cacheKey);
    } catch {
      // Ignore storage failures; the next load simply refetches.
    }
  }

  // Returns { data, fromCache, revalidated }. `data` resolves as fast as
  // possible (cached copy when present, otherwise the network response) and
  // `revalidated` always resolves with the fresh server payload; `onUpdate`
  // fires only when a cached copy was served and the fresh payload differs.
  /**
   * @param {string} url
   * @param {CachedFetchOptions} [options]
   * @returns {Promise<CachedFetchResult>}
   */
  async function getJson(url, { cacheKey, onUpdate } = {}) {
    const api = requireApi();
    const key = String(cacheKey || url);
    const cached = readCached(key);
    const revalidated = (async () => {
      const fresh = await api.getJson(url, { cache: "no-cache" });
      const serialized = JSON.stringify({ data: fresh });

      if (serialized !== global.sessionStorage.getItem(STORAGE_PREFIX + key)) {
        writeCached(key, fresh);

        if (cached !== null && typeof onUpdate === "function") {
          onUpdate(fresh);
        }
      }

      return fresh;
    })();

    if (cached !== null) {
      revalidated.catch(() => {});
      return { data: cached, fromCache: true, revalidated };
    }

    const fresh = await revalidated;
    return { data: fresh, fromCache: false, revalidated };
  }

  namespace.cachedFetch = {
    clearCached,
    getJson,
    readCached,
    writeCached,
  };
  global.LongtailForge = namespace;
}(window));
