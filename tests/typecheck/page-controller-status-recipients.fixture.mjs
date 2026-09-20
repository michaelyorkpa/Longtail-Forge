// @ts-check

/**
 * The recipient and the message of `BrowserPageController.setStatus`, proved by the compiler.
 *
 * `0.33.33.39.35` corrected the declaration to the two things the writer actually needs - a node
 * whose `textContent` it sets and an element whose `dataset` it writes - and to the opaque
 * message it never converts. The positive cases keep every recipient the browser accepts, keep
 * the absent recipient, and keep a message of any type. The `@ts-expect-error` fails the build if
 * a bare `Element`, which carries no `dataset`, can again be handed over as a recipient.
 *
 * **The type does not promise the write succeeds.** A Symbol message still throws at the setter,
 * and a recipient that refuses the write still fails; both are runtime claims, proved by the
 * unit and browser suites rather than here.
 */

/** @typedef {import("../../src/types/browser-contracts.js").BrowserPageController} PageController */

/**
 * @param {PageController} controller
 * @param {HTMLElement} html
 * @param {SVGElement} svg
 * @param {MathMLElement} mathml
 */
export function everyRecipientTheBrowserAcceptsIsAccepted(controller, html, svg, mathml) {
  controller.setStatus(html, "Saved");
  controller.setStatus(svg, "Saved", { isError: false });
  controller.setStatus(mathml, "Saved", { isError: true });
  controller.setStatus(null, "Saved");
  controller.setStatus(undefined, "Saved");
}

/**
 * @param {PageController} controller
 * @param {HTMLElement} recipient
 * @param {unknown} opaque
 */
export function anyMessageIsAccepted(controller, recipient, opaque) {
  controller.setStatus(recipient, opaque);
  controller.setStatus(recipient, null);
  controller.setStatus(recipient, 42, { isError: true });
  controller.setStatus(recipient, { toString: () => "from an object" });
}

/**
 * The Tasks call: the page's own status slot, which may be absent, and a message the page never
 * converts. It needs no cast, and no conversion at the caller.
 * @param {PageController} controller
 * @param {HTMLElement | null} taskStatus
 * @param {unknown} message
 */
export function theTasksCallCompiles(controller, taskStatus, message) {
  controller.setStatus(taskStatus, message, { isError: true });
}

/**
 * @param {PageController} controller
 * @param {Element} element
 */
export function aBareElementIsRefused(controller, element) {
  // @ts-expect-error an Element carries no dataset, so it is not a status recipient
  controller.setStatus(element, "Saved");
}
