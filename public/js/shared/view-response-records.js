// @ts-check

/** @typedef {import("../../../src/types/browser-contracts.js").BrowserViewResponseRecords} BrowserViewResponseRecords */

const COMPATIBILITY_RECORD_KEYS = Object.freeze([
  "records",
  "items",
  "data",
  "results",
  "rows",
  "tags",
  "lists",
  "tasks",
]);

/** @param {Window} global */
(function attachViewResponseRecords(global) {
  const namespace = global.LongtailForge || {};

  /**
   * Read list records from an unknown response envelope.
   *
   * Bundled descriptors declare recordsKey. The compatibility branches retain
   * the earlier behavior for older descriptors and extension surfaces.
   *
   * @param {unknown} body
   * @param {unknown} recordsKey
   * @returns {unknown[]}
   */
  function read(body, recordsKey) {
    if (Array.isArray(body)) {
      return body;
    }

    const envelope = asRecord(body);
    if (!envelope) {
      return [];
    }

    const declaredKey = stringValue(recordsKey);
    if (declaredKey && Array.isArray(envelope[declaredKey])) {
      return envelope[declaredKey];
    }

    for (const key of COMPATIBILITY_RECORD_KEYS) {
      if (Array.isArray(envelope[key])) {
        return envelope[key];
      }
    }

    const firstArray = Object.values(envelope).find((value) => Array.isArray(value));
    return Array.isArray(firstArray) ? firstArray : [envelope];
  }

  /** @param {unknown} value */
  function stringValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  /**
   * @param {unknown} value
   * @returns {Record<string, unknown> | null}
   */
  function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)
      : null;
  }

  namespace.viewResponseRecords = /** @type {BrowserViewResponseRecords} */ (Object.freeze({ read }));
  global.LongtailForge = namespace;
})(window);
