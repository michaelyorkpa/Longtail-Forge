// @ts-check

/**
 * The named members `sortByName` reads. Not `BrowserRecord`: constraining the generic to the
 * indexed record makes this implementation unassignable to the widened published signature,
 * and nothing here indexes an arbitrary key.
 * @typedef {import("../../../src/types/browser-contracts.js").BrowserRecordFields} PageBrowserRecord
 */
/** @typedef {import("../../../src/types/browser-contracts.js").PageControllerDefinition} PageControllerDefinition */
/** @typedef {import("../../../src/types/browser-contracts.js").PageControllerRegistry} PageControllerRegistry */
/** @typedef {import("../../../src/types/browser-contracts.js").PageSmokeResult} PageSmokeResult */
/** @typedef {import("../../../src/types/browser-contracts.js").RegisteredPageController} RegisteredPageController */

(function () {
  const namespace = window.LongtailForge || {};
  const controllers = /** @type {PageControllerRegistry} */ (namespace.controllers || {});

  /**
   * An `<option>`, created before either argument is converted.
   *
   * Both arguments go to the element's own setters unchanged, because those setters are the
   * conversion. `value` is a non-nullable DOMString: it takes ToString, so `null` writes `"null"`
   * and a Symbol throws. `textContent` is a nullable DOMString: `null` and `undefined` leave the
   * option with no text, and everything else takes ToString, so a Symbol throws there too.
   *
   * The published signature said `string` for both while eight page wrappers hand it whatever
   * their callers pass. `0.33.33.39.24` declared what the setters accept instead of making the
   * callers convert: converting first would either change the result - `String(null)` writes the
   * text `"null"` where the setter writes nothing - or stop a Symbol from failing, because
   * `String(symbol)` does not throw. `Reflect.set` is the assignment itself: the same inherited
   * setter, the same receiver, and the same thrown error, without claiming the value is already a
   * string. Neither property can refuse a write on a fresh element, so its boolean is not read.
   * @param {unknown} value
   * @param {unknown} text
   * @returns {HTMLOptionElement}
   */
  function createOption(value, text) {
    const option = document.createElement("option");
    Reflect.set(option, "value", value);
    Reflect.set(option, "textContent", text);
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
