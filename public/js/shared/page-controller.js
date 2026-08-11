// @ts-check

/** @typedef {import("../../../src/types/browser-contracts.js").BrowserRecord} PageBrowserRecord */
/** @typedef {import("../../../src/types/browser-contracts.js").PageControllerDefinition} PageControllerDefinition */
/** @typedef {import("../../../src/types/browser-contracts.js").PageControllerRegistry} PageControllerRegistry */
/** @typedef {import("../../../src/types/browser-contracts.js").PageSmokeResult} PageSmokeResult */
/** @typedef {import("../../../src/types/browser-contracts.js").RegisteredPageController} RegisteredPageController */

(function () {
  const namespace = window.LongtailForge || {};
  const controllers = /** @type {PageControllerRegistry} */ (namespace.controllers || {});

  /**
   * @param {string} value
   * @param {string} text
   */
  function createOption(value, text) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    return option;
  }

  /**
   * @param {HTMLElement | null | undefined} element
   * @param {string} message
   * @param {{ isError?: boolean }} [options]
   */
  function setStatus(element, message, options = {}) {
    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.dataset.statusTone = options.isError ? "error" : "";
  }

  /**
   * @template {PageBrowserRecord} Item
   * @param {Item[]} items
   * @returns {Item[]}
   */
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

  /**
   * @param {string} pageId
   * @param {PageControllerDefinition} controller
   * @returns {RegisteredPageController}
   */
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

  /**
   * @param {string} pageId
   * @returns {PageSmokeResult}
   */
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
