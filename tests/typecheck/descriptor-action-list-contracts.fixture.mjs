// @ts-check

/**
 * The action-list input of the three published descriptor renderers, proved by the compiler.
 *
 * `0.33.33.39.25` narrowed `renderDescriptorActionMenu`, `renderDescriptorActionStrip` and
 * `renderDescriptorInlineActions` from `readonly unknown[]` to `readonly BrowserViewAction[]` -
 * a node, or an action-button option bag. The positive cases keep both forms accepted, mixed or
 * not, and keep the list optional. Each `@ts-expect-error` fails the build if an unestablished
 * `unknown[]` can once again be forwarded as an action list.
 *
 * **The type does not prove an option bag will render.** Every member of the option bag is
 * optional, so `{}` is an action here and still throws at runtime in `createActionButton`, which
 * requires a label or text. That rule stays a runtime responsibility and is proved by the runtime
 * suite, not by this fixture.
 */

/** @typedef {import("../../src/types/browser-contracts.js").BrowserViewDescriptorRenderers} Renderers */

/**
 * @param {Renderers} renderers
 * @param {HTMLButtonElement} button
 * @param {HTMLElement} menu
 * @param {SVGElement} icon
 */
export function nodeListsAreAccepted(renderers, button, menu, icon) {
  return [
    renderers.renderDescriptorActionMenu([button, menu]),
    renderers.renderDescriptorActionStrip([button, icon]),
    renderers.renderDescriptorInlineActions([button, button, menu], { className: "row" }),
  ];
}

/** @param {Renderers} renderers */
export function descriptionListsAreAccepted(renderers) {
  const edit = { label: "Edit", action: "edit", onClick: () => undefined };
  return [
    renderers.renderDescriptorActionMenu([edit], { summaryLabel: "...", ariaLabel: "Row actions" }),
    renderers.renderDescriptorActionStrip([edit, { label: "Archive", icon: "archive", iconOnly: true, disabled: true }]),
    renderers.renderDescriptorInlineActions([{ ariaLabel: "Move up", text: "" }]),
  ];
}

/**
 * @param {Renderers} renderers
 * @param {HTMLButtonElement} button
 * @param {readonly HTMLButtonElement[]} readonlyButtons
 */
export function mixedAndOmittedListsAreAccepted(renderers, button, readonlyButtons) {
  return [
    renderers.renderDescriptorActionMenu([button, { label: "Edit" }]),
    renderers.renderDescriptorActionStrip(),
    renderers.renderDescriptorInlineActions([], { ariaLabel: "Row actions" }),
    renderers.renderDescriptorActionStrip(readonlyButtons),
    // Accepted by the type and refused at runtime: the label rule is not a type-level promise.
    renderers.renderDescriptorActionMenu([{}]),
  ];
}

/**
 * @param {Renderers} renderers
 * @param {readonly unknown[]} entries
 */
export function anUnestablishedListIsRejected(renderers, entries) {
  return [
    // @ts-expect-error An unknown[] is not an action list until its entries are established.
    renderers.renderDescriptorActionMenu(entries),
    // @ts-expect-error The strip takes the same action list.
    renderers.renderDescriptorActionStrip(entries),
    // @ts-expect-error So does the inline row.
    renderers.renderDescriptorInlineActions(entries),
  ];
}

/**
 * @param {Renderers} renderers
 * @param {unknown} entry
 */
export function anEstablishedEntryIsAccepted(renderers, entry) {
  // The honest route from unknown: establish the entry, then forward it.
  if (entry instanceof globalThis.Node) {
    return renderers.renderDescriptorInlineActions([entry]);
  }
  return renderers.renderDescriptorInlineActions([]);
}
