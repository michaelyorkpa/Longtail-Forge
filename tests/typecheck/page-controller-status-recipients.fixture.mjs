// @ts-check

/**
 * The recipient and the message of `BrowserPageController.setStatus`, proved by the compiler.
 *
 * `0.33.33.39.35` corrected the declaration to the opaque message the writer never converts and
 * to a recipient capability; `0.33.33.39.37` reconciled that recipient with what the writer
 * actually does. It writes to any element: the message reaches the node's own `textContent`, and
 * the tone then reaches `dataset`, which an element of another namespace may not carry. Such a
 * recipient is not refused here - it takes the message and fails at the tone, as it always has -
 * so the declaration says `Element` and leaves that requirement where the writer imposes it.
 *
 * The `@ts-expect-error` cases keep the boundary that remains: a node that is not an element,
 * and an object that is not a node at all, are still not recipients.
 *
 * **The type does not promise the write succeeds.** A Symbol message still throws at the setter,
 * and a recipient with no dataset still fails at the tone; both are runtime claims, proved by
 * the unit and browser suites rather than here.
 */

/** @typedef {import("../../src/types/browser-contracts.js").BrowserPageController} PageController */

/**
 * @param {PageController} controller
 * @param {Element} element
 * @param {HTMLElement} html
 * @param {SVGElement} svg
 * @param {MathMLElement} mathml
 */
export function everyElementTheWriterAcceptsIsAccepted(controller, element, html, svg, mathml) {
  controller.setStatus(element, "Saved");
  controller.setStatus(html, "Saved", { isError: false });
  controller.setStatus(svg, "Saved", { isError: true });
  controller.setStatus(mathml, "Saved");
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
 * The Tasks call: the page's own status slot, queried and possibly absent, with a message the
 * page never converts. It needs no cast, no conversion and no narrowing at the caller.
 * @param {PageController} controller
 * @param {Element | null} taskStatus
 * @param {unknown} message
 */
export function theTasksCallCompiles(controller, taskStatus, message) {
  controller.setStatus(taskStatus, message, { isError: true });
}

/**
 * @param {PageController} controller
 * @param {Text} textNode
 * @param {{ textContent: string, dataset: Record<string, string> }} lookalike
 */
export function whatIsStillRefused(controller, textNode, lookalike) {
  // @ts-expect-error a text node is not an element, and the tone has nowhere to go
  controller.setStatus(textNode, "Saved");
  // @ts-expect-error an object carrying both members is still not an element
  controller.setStatus(lookalike, "Saved");
}
