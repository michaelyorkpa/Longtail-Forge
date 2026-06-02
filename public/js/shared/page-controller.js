(function () {
  const namespace = window.LongtailForge || {};
  const controllers = namespace.controllers || {};

  function createOption(value, text) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    return option;
  }

  function setStatus(element, message, options = {}) {
    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.dataset.statusTone = options.isError ? "error" : "";
  }

  function sortByName(items) {
    if (namespace.records?.sortByName) {
      return namespace.records.sortByName(items);
    }

    return [...items].sort((firstItem, secondItem) =>
      String(firstItem.name || firstItem.username || "").localeCompare(
        String(secondItem.name || secondItem.username || ""),
        undefined,
        { sensitivity: "base" },
      ),
    );
  }

  function register(pageId, controller) {
    controllers[pageId] = {
      ...controller,
      runSmoke: controller.runSmoke || (() => ({
        ok: true,
        pageId,
        checks: [],
      })),
    };

    return controllers[pageId];
  }

  function runSmoke(pageId) {
    const controller = controllers[pageId];

    if (!controller) {
      return {
        ok: false,
        pageId,
        error: "Controller is not registered.",
      };
    }

    return controller.runSmoke();
  }

  namespace.pageController = {
    createOption,
    register,
    runSmoke,
    setStatus,
    sortByName,
  };
  namespace.controllers = controllers;
  window.LongtailForge = namespace;
}());
