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
   * The message a caught value carries, or `fallback` when it carries none.
   *
   * **A caught value is genuinely unknown and no declaration can change that**: `catch` binds
   * whatever was thrown, which here is a `BrowserApiError` from the API client, a native `Error`
   * from a page's own guard, or a `DOMException` from the platform. The 131 call sites this
   * replaces all wrote `error.message || "..."`, which reads a property off a value nothing has
   * checked. This performs the same read behind the check the sites were assuming.
   *
   * **The one behavioural difference is deliberate and narrow.** `error.message || fallback`
   * forwards a truthy non-string `message` unchanged; this returns `fallback` for it instead.
   * Every consumer assigns the result to `textContent` or passes it to a status renderer that
   * takes a string, so returning a string is the contract they already depended on. No producer
   * in this estate throws a value with a non-string `message`.
   * @param {unknown} value
   * @param {string} fallback
   * @returns {string}
   */
  function caughtMessage(value, fallback) {
    const message = asRecord(value)?.message;
    return typeof message === "string" && message ? message : fallback;
  }

  /**
   * The HTTP status a caught value carries, or `null` when it carries none.
   *
   * **`null` rather than `0` because absence and zero are different facts.** `createError`
   * stores `0` when the producer supplied no status, so a caught `BrowserApiError` can legitimately
   * report `0`; a `TypeError` reports nothing at all. Every one of the sixteen call sites compares
   * against a numeric literal with `===` or `!==`, so `null` and the `undefined` those sites read
   * before are indistinguishable to them.
   * @param {unknown} value
   * @returns {number | null}
   */
  function caughtStatus(value) {
    const status = asRecord(value)?.status;
    return typeof status === "number" ? status : null;
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
    caughtMessage,
    caughtStatus,
    createError,
    read,
  });
  global.LongtailForge = namespace;
}(window));
