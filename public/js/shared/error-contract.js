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

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserBulkActionFailure} BrowserBulkActionFailure */

  /**
   * The identity and context keys a bulk-action failure may carry, by producer.
   *
   * Each producer sets exactly one identity key; `target_type` accompanies `target_id`. They are
   * copied only when they are strings, so a producer that starts sending something else stops
   * being described rather than being described wrongly.
   *
   * Typed as its own literal keys rather than `string[]` so the copy below is a checked write to a
   * named member instead of an index into the contract.
   * @type {readonly ("catalogId" | "note_id" | "target_id" | "target_type" | "task_id")[]}
   */
  const BULK_FAILURE_TEXT_KEYS = Object.freeze([
    "catalogId",
    "note_id",
    "target_id",
    "target_type",
    "task_id",
  ]);

  /**
   * The failures a successful bulk-action body reports.
   *
   * **Total, because every call site it replaces was total.** All five wrote
   * `result.errors || []`, so a body without the member already meant "nothing failed" and nothing
   * threw. The one behaviour this adds is that an entry without a string `message` is dropped
   * instead of counted - which is the only honest answer once elements are checked at all, and the
   * same choice `0.33.33.38.4.2` made for the note list.
   *
   * **Reconstructed rather than passed through**, so what the caller receives is built from checked
   * values. `status` is copied only when it is a number, and each identity key only when it is a
   * string; nothing else on the wire entry survives.
   * @param {unknown} body
   * @returns {BrowserBulkActionFailure[]}
   */
  function readBulkFailures(body) {
    const envelope = asRecord(body);
    const entries = envelope && Array.isArray(envelope.errors) ? envelope.errors : [];
    /** @type {BrowserBulkActionFailure[]} */
    const failures = [];

    for (const entry of entries) {
      const failure = asRecord(entry);
      if (!failure || typeof failure.message !== "string" || !failure.message) {
        continue;
      }

      /** @type {BrowserBulkActionFailure} */
      const narrowed = { message: failure.message };
      if (typeof failure.status === "number") {
        narrowed.status = failure.status;
      }
      for (const key of BULK_FAILURE_TEXT_KEYS) {
        const value = failure[key];
        if (typeof value === "string") {
          narrowed[key] = value;
        }
      }
      failures.push(narrowed);
    }

    return failures;
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
    readBulkFailures,
  });
  global.LongtailForge = namespace;
}(window));
