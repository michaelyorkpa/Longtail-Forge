/**
 * Descriptor data binding for declarative view surfaces.
 *
 * Extracted from `public/js/shared/view-renderer.js` by `0.33.33.35.2`. This module turns a
 * descriptor's `dataSource` into records: it builds the filtered route, reads the response
 * envelope through the published `viewResponseRecords` adapter, and maps each row onto the
 * descriptor's declared field bindings.
 *
 * It renders nothing and it knows nothing about what a descriptor *ought* to contain. The
 * structural types below describe only the parts it is handed; there are no defaults, no
 * fallback shapes, and no product labels here. `0.33.33.35.1.2` made the server-delivered
 * descriptor the single source of truth and this module must not become a second one.
 *
 * It is also not a bootstrap participant: it never loads or awaits workspace context, and it
 * takes its API client from the caller rather than resolving one.
 *
 * @param {Window} global
 */
(function attachViewDataBinding(global) {
  // Scoped inside the IIFE deliberately: a top-level JSDoc typedef in a classic script leaks
  // into the shared type environment the way a top-level `const` leaks into the shared lexical
  // one, which is the thing `0.33.33.33` removed from this estate. Recorded at `0.33.33.34`.

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserApi} BrowserApi */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewResponseRecords} BrowserViewResponseRecords */

  /**
   * The parts of a descriptor filter this module reads to build a query string.
   * @typedef {{ field?: string, id?: string, queryKey?: string }} BoundFilter
   */

  /**
   * The parts of a descriptor this module reads. Everything is optional because the module
   * reads what it is given rather than asserting what a descriptor should carry.
   * @typedef {{
   *   dataSource?: { fieldBindings?: Record<string, string>, recordsKey?: unknown, route?: string },
   *   filters?: BoundFilter[],
   * }} BoundDescriptor
   */

  const namespace = global.LongtailForge || {};

  /**
   * Load and bind the records a descriptor's `dataSource` declares.
   *
   * The API client is supplied by the caller: resolving one is the renderer's concern, and
   * this module stays out of collaborator acquisition.
   *
   * @param {BoundDescriptor} descriptor
   * @param {Record<string, unknown> | null | undefined} filterValues
   * @param {BrowserApi} api
   * @returns {Promise<Record<string, unknown>[]>}
   */
  async function loadBoundRecords(descriptor, filterValues, api) {
    const responseRecords = requireViewResponseRecords();
    const dataSource = descriptor.dataSource || {};
    const route = appendFilterQuery(dataSource.route || "", descriptor.filters, filterValues);
    const body = await api.getJson(route, { cache: "no-store" });
    return responseRecords.read(body, dataSource.recordsKey)
      .map((record) => bindRecord(record, dataSource.fieldBindings || {}));
  }

  /**
   * Append the active filter values to a route as query parameters.
   *
   * A filter contributes only when it declares a key and carries a meaningful value; empty
   * string, `false`, `null`, and `undefined` are all treated as unset, which is what keeps a
   * cleared control out of the request rather than sending it as a blank filter.
   *
   * @param {string} route
   * @param {BoundFilter[] | undefined} filters
   * @param {Record<string, unknown> | null | undefined} filterValues
   * @returns {string}
   */
  function appendFilterQuery(route, filters, filterValues) {
    if (!Array.isArray(filters) || filters.length === 0 || !filterValues) {
      return route;
    }

    /** @type {string[]} */
    const params = [];
    for (const filter of filters) {
      const key = filter.queryKey || filter.field || filter.id;
      const valueKey = filter.field || filter.id;
      if (!key || !valueKey) {
        continue;
      }
      const value = filterValues[valueKey];
      if (value === undefined || value === null || value === "" || value === false) {
        continue;
      }
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }

    if (params.length === 0) {
      return route;
    }
    return `${route}${route.includes("?") ? "&" : "?"}${params.join("&")}`;
  }

  /**
   * Map one response row onto the descriptor's declared field bindings.
   *
   * Bound fields win, unmapped source fields are carried through, and the original row stays
   * reachable as `_source` so a renderer can still reach data the descriptor did not name.
   *
   * @param {unknown} record
   * @param {Record<string, string>} fieldBindings
   * @returns {Record<string, unknown>}
   */
  function bindRecord(record, fieldBindings) {
    /** @type {Record<string, unknown>} */
    const bound = { _source: record };

    for (const [fieldName, sourcePath] of Object.entries(fieldBindings)) {
      bound[fieldName] = readPath(record, sourcePath);
    }

    for (const [fieldName, value] of Object.entries(asRecord(record) || {})) {
      if (bound[fieldName] === undefined) {
        bound[fieldName] = value;
      }
    }

    return bound;
  }

  /**
   * Read a dotted path out of a source object, or `undefined` at the first missing step.
   *
   * @param {unknown} source
   * @param {unknown} path
   * @returns {unknown}
   */
  function readPath(source, path) {
    if (!path || !source || typeof source !== "object") {
      return undefined;
    }

    return String(path).split(".").reduce((/** @type {unknown} */ value, key) => {
      const step = asRecord(value);
      return step ? step[key] : undefined;
    }, source);
  }

  /** @returns {BrowserViewResponseRecords} */
  function requireViewResponseRecords() {
    const responseRecords = /** @type {BrowserViewResponseRecords | undefined} */ (namespace.viewResponseRecords);
    if (typeof responseRecords?.read !== "function") {
      throw new Error("View surface data binding requires LongtailForge.viewResponseRecords.read.");
    }
    return responseRecords;
  }

  /**
   * @param {unknown} value
   * @returns {Record<string, unknown> | null}
   */
  function asRecord(value) {
    return value && typeof value === "object"
      ? /** @type {Record<string, unknown>} */ (value)
      : null;
  }

  namespace.viewDataBinding = Object.freeze({
    appendFilterQuery,
    bindRecord,
    loadBoundRecords,
    readPath,
  });
  global.LongtailForge = namespace;
})(window);
