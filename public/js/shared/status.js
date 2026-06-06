(function attachStatusHelpers(global) {
  const root = global.LongtailForge || {};
  const timers = new WeakMap();

  function setStatus(element, message = "", options = {}) {
    if (!element) {
      return;
    }

    clearStatusTimer(element);
    element.textContent = message;
    element.classList.toggle("is-error", options.type === "error" || options.isError === true);
    element.classList.toggle("is-success", options.type === "success");

    if (options.clearAfter && message) {
      timers.set(element, global.setTimeout(() => clearStatus(element), options.clearAfter));
    }
  }

  function clearStatus(element) {
    if (!element) {
      return;
    }

    clearStatusTimer(element);
    element.textContent = "";
    element.classList.remove("is-error", "is-success");
  }

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
