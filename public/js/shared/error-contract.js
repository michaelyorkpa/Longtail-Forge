// @ts-check

/** @typedef {import("../../../src/types/browser-contracts.js").BrowserApiError} ContractBrowserApiError */
/** @typedef {import("../../../src/types/browser-contracts.js").BrowserApiErrorDetails} BrowserApiErrorDetails */
/** @typedef {import("../../../src/types/browser-contracts.js").BrowserErrorEnvelope} BrowserErrorEnvelope */

/** @param {Window} global */
(function initializeErrorContract(global) {
  const namespace = global.LongtailForge || {};

  /**
   * @param {unknown} body
   * @param {string} [fallback]
   * @returns {BrowserApiErrorDetails}
   */
  function read(body, fallback = "Request failed.") {
    const payload = /** @type {BrowserErrorEnvelope | null} */ (asRecord(body));
    const errorValue = payload?.error;
    const envelope = asRecord(errorValue);
    const message = String(
      envelope?.message
      || (typeof errorValue === "string" ? errorValue : "")
      || payload?.message
      || fallback,
    ).trim() || fallback;

    return {
      code: String(envelope?.code || "").trim(),
      message,
      requestId: String(envelope?.requestId || "").trim(),
    };
  }

  /**
   * @param {unknown} body
   * @param {string} fallback
   * @param {number} [status]
   * @returns {ContractBrowserApiError}
   */
  function createError(body, fallback, status = 0) {
    const details = read(body, fallback);
    const error = /** @type {ContractBrowserApiError} */ (new Error(details.message));
    error.body = body;
    error.code = details.code;
    error.requestId = details.requestId;
    error.status = Number.parseInt(String(status), 10) || 0;
    return error;
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

  namespace.errors = Object.freeze({
    createError,
    read,
  });
  global.LongtailForge = namespace;
}(window));
