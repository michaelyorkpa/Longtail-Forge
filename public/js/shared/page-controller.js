// @ts-check

/**
 * The named members `sortByName` reads. Not `BrowserRecord`: constraining the generic to the
 * indexed record makes this implementation unassignable to the widened published signature,
 * and nothing here indexes an arbitrary key.
 * @typedef {import("../../../src/types/browser-contracts.js").BrowserRecordFields} PageBrowserRecord
 */
/** @typedef {import("../../../src/types/browser-contracts.js").BrowserStatusRecipient} BrowserStatusRecipient */
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
   * The status line on a recipient, or nothing without one.
   *
   * The recipient is whatever element a page or a module host holds. The message goes to
   * the node's own `textContent`; the tone then goes to `dataset`, which an element of another
   * namespace may not carry - and such a recipient fails at that write, after the message was
   * written, which is what the two assignments did. `message` stays unconverted here, because
   * the setter is the conversion - `String(message)` would stop a Symbol failing, and converting
   * a falsy message would write a word where the `|| ""` fallback clears the line.
   *
   * `Reflect.set` is that assignment: the same inherited setter, the same receiver, and the same
   * thrown error, so a Symbol still fails here. Unlike `createOption`'s fresh `<option>`, this
   * recipient belongs to the caller and could refuse the write - and its boolean is still not
   * read, because **this file is a classic script in sloppy mode**, where the assignment it
   * replaces was silent in exactly those cases. Reading it would add a failure that never
   * existed; the tone is written after either outcome, as it was.
   * @param {BrowserStatusRecipient | null | undefined} element
   * @param {unknown} message
   * @param {{ isError?: boolean }} [options]
   */
  function setStatus(element, message, options = {}) {
    if (!element) {
      return;
    }

    Reflect.set(element, "textContent", message || "");
    writeStatusTone(element, options.isError ? "error" : "");
  }

  /**
   * `element.dataset.statusTone = tone`, as that assignment read and wrote it.
   *
   * The dataset is read off the element first, and a recipient that has none fails here as the
   * `TypeError` the assignment threw - after the message was written, which is the behaviour a
   * namespaced element has today. A dataset that is not an object takes the discarded write
   * sloppy mode gave it, through its own receiver.
   * @param {BrowserStatusRecipient} element
   * @param {string} tone
   * @returns {void}
   */
  function writeStatusTone(element, tone) {
    const dataset = Reflect.get(element, "dataset");

    if (dataset === null || dataset === undefined) {
      throw new TypeError("The status recipient carries no dataset to write its tone to.");
    }

    Reflect.set(Object(dataset), "statusTone", tone, dataset);
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
