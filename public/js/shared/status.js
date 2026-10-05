(function attachStatusHelpers(global) {
  const root = global.LongtailForge || {};
  /** Pending self-clear timers, keyed by the element they will clear. */
  /** @type {WeakMap<HTMLElement, number>} */
  const timers = new WeakMap();

  /**
   * @param {HTMLElement | null | undefined} element an absent one is a no-op
   * @param {string} [message] an empty message hides the element
   * @param {import("../../../src/types/browser-contracts.js").BrowserStatusMessageOptions} [options]
   */
  function setStatus(element, message = "", options = {}) {
    if (!element) {
      return;
    }

    clearStatusTimer(element);
    element.textContent = message;
    element.hidden = !message;
    element.classList.toggle("is-error", options.type === "error" || options.isError === true);
    element.classList.toggle("is-success", options.type === "success");

    if (options.clearAfter && message) {
      timers.set(element, global.setTimeout(() => clearStatus(element), options.clearAfter));
    }
  }

  /** @param {HTMLElement | null | undefined} element */
  function clearStatus(element) {
    if (!element) {
      return;
    }

    clearStatusTimer(element);
    element.textContent = "";
    element.hidden = true;
    element.classList.remove("is-error", "is-success");
  }

  /** @param {HTMLElement} element */
  function clearStatusTimer(element) {
    const timer = timers.get(element);

    if (timer) {
      global.clearTimeout(timer);
      timers.delete(element);
    }
  }

  root.status = {
    clear: clearStatus,
    set: setStatus,
  };
  global.LongtailForge = root;
})(window);
