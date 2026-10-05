(function initializeQuickActionRefresh(global) {
  const namespace = global.LongtailForge = global.LongtailForge || {};
  const EVENT_NAME = "longtailforge:quick-action-refresh";

  /**
   * The filter set a subscription was given, as trimmed non-empty strings.
   * @param {unknown} value one value or a list of them
   * @returns {Set<string>}
   */
  function normalizeValues(value) {
    return new Set((Array.isArray(value) ? value : [value])
      .map((entry) => String(entry || "").trim())
      .filter(Boolean));
  }

  /**
   * @param {import("../../../src/types/browser-contracts.js").BrowserQuickActionRefreshSubscription} [options]
   * @returns {() => void} the unsubscribe function; this throws rather than answering nothing
   */
  function subscribe(options = {}) {
    const recordTypes = normalizeValues(options.recordTypes);
    const actionIds = normalizeValues(options.actionIds);
    const onRefresh = options.onRefresh || options.refresh;

    if (typeof onRefresh !== "function" || (recordTypes.size === 0 && actionIds.size === 0)) {
      throw new TypeError("Quick-action refresh subscriptions require a record type or action id and a callback.");
    }

    // `quiet-tail-surface-contracts` lifts this function on its own, so nothing here may
    // become a free variable: the detail is read inline through the event's own receiver,
    // which is the optional access it replaces.
    /** @param {Event} event */
    const listener = (event) => {
      const detail = Reflect.get(Object(event), "detail", event) || {};
      const recordType = String(detail.recordType || "").trim();
      const actionId = String(detail.actionId || "").trim();

      if ((recordTypes.size > 0 && !recordTypes.has(recordType)) ||
        (actionIds.size > 0 && !actionIds.has(actionId))) {
        return;
      }

      onRefresh(detail, event);
    };

    global.addEventListener(EVENT_NAME, listener);
    return () => global.removeEventListener(EVENT_NAME, listener);
  }

  namespace.quickActionRefresh = Object.freeze({
    eventName: EVENT_NAME,
    subscribe,
  });
  global.LongtailForge = namespace;
}(window));
