// @ts-check

/** @typedef {import("../../../src/types/browser-contracts.js").BrowserCheckedDom} BrowserCheckedDom */

/**
 * The shared checked-DOM contract (`0.33.33.38.3.9`).
 *
 * `querySelector` answers `Element | null` for any selector that is not a bare tag name, and its
 * tag-name overloads answer a subtype the platform never checked. Pages narrowed those answers
 * with near-identical file-local helpers, repeated in more than twenty files by the time this was
 * decided, so the check itself moves here and the decision about each control stays with its page.
 *
 * **Two steps, because they happen at different times.** `find` runs where a page captures a
 * control and answers the subtype or `null`. `require` runs where the page first depends on that
 * control and refuses a `null` with an error naming it. A page that captures early and uses late
 * - a lazily loaded dialog, a control only one path needs - keeps both its capture lifetime and
 * its failure timing by calling each at its own moment, rather than being made to fail at capture.
 *
 * **Absent and the wrong subtype are one answer.** A node present under the selector but of a
 * different subtype is not the control the markup contract promised, so an optional control
 * treats it as absent and a required one reports it by name. Neither step casts, repairs, or
 * re-queries.
 */
/** @param {Window} global */
(function attachCheckedDom(global) {
  const namespace = global.LongtailForge || {};

  /**
   * The first element under `root` that matches `selector`, when it is a `constructor`; otherwise
   * `null`, whether nothing matched or something of another subtype did.
   * @template {Element} T
   * @param {ParentNode} root
   * @param {string} selector
   * @param {{ new (): T }} constructor
   * @returns {T | null}
   */
  function find(root, selector, constructor) {
    const element = root.querySelector(selector);
    return element instanceof constructor ? element : null;
  }

  /**
   * `value`, which the caller's markup contract requires, or a named markup-contract error.
   *
   * Only `null` is refused, because that is exactly what `find` answers for a control that is
   * missing or of the wrong subtype.
   * @template T
   * @param {T | null} value
   * @param {string} owner the page or surface that depends on the control
   * @param {string} name the control, as the error should name it
   * @returns {T}
   */
  function require(value, owner, name) {
    if (value === null) {
      throw new TypeError(`${owner} requires its ${name}.`);
    }

    return value;
  }

  /** @type {BrowserCheckedDom} */
  const checkedDomApi = Object.freeze({ find, require });

  namespace.checkedDom = checkedDomApi;
  global.LongtailForge = namespace;
})(window);
