// @ts-check

/**
 * The closed namespace root, proved by the compiler rather than by inspection.
 *
 * `0.33.33.38.2.5` removed `[key: string]: unknown` from `LongtailForgeBrowserNamespace`. Each
 * `@ts-expect-error` below fails the build if the rejection it claims stops happening - so if a
 * permissive signature were ever reintroduced, this fixture is what would notice.
 */

/** @typedef {import("../../src/types/browser-contracts.js").LongtailForgeBrowserNamespace} LongtailForgeBrowserNamespace */
/** @typedef {import("../../src/types/browser-contracts.js").BrowserOverlayHost} BrowserOverlayHost */

/** @param {LongtailForgeBrowserNamespace} namespace */
export function declaredMembersRemainUsable(namespace) {
  // A declared member is reachable by its own name, and keeps its own type.
  /** @type {BrowserOverlayHost | undefined} */
  const overlayHost = namespace.overlayHost;
  /** @type {boolean | undefined} */
  const helpPageReady = namespace.helpPageReady;
  /** @type {Readonly<Record<string, unknown>> | null | undefined} */
  const supportView = namespace.supportView;
  return { helpPageReady, overlayHost, supportView };
}

/** @param {LongtailForgeBrowserNamespace} namespace */
export function theRootKeepsItsOptionalLifecycle(namespace) {
  // Every member is optional: the namespace fills in across the page lifecycle, and reading one
  // before its writer has run is still `undefined` rather than a type error.
  const before = namespace.overlayHost;
  return before === undefined;
}

/** @param {LongtailForgeBrowserNamespace} namespace */
export function anUnknownTopLevelMemberIsRejected(namespace) {
  // @ts-expect-error The root is closed: an undeclared member is a compile error, not `unknown`.
  return namespace.somethingNobodyDeclared;
}

/** @param {LongtailForgeBrowserNamespace} namespace */
export function aMisspelledMemberIsRejected(namespace) {
  // @ts-expect-error `supportView` is declared; `suportView` is not, and no catch-all absorbs it.
  return namespace.suportView;
}

/** @param {LongtailForgeBrowserNamespace} namespace @param {string} key */
export function anArbitraryStringKeyIsRejected(namespace, key) {
  // @ts-expect-error A computed key can no longer index the root: it is not a string map.
  return namespace[key];
}

/** @param {LongtailForgeBrowserNamespace} namespace */
export function writingAnUndeclaredMemberIsRejected(namespace) {
  // @ts-expect-error Publishing an undeclared surface is a compile error, which is the whole point.
  namespace.aBrandNewSurface = { create: () => null };
}

/**
 * Nested extensibility is untouched: `supportView` carries values nothing has validated, and they
 * stay `unknown` rather than acquiring trusted types because the root was closed.
 * @param {Readonly<Record<string, unknown>>} supportView
 */
export function nestedValuesStayUnknown(supportView) {
  /** @type {unknown} */
  const actor = supportView.actor;
  // @ts-expect-error An unvalidated nested value is `unknown`, so it cannot be used as a string.
  return { actor, label: readsAString(supportView.effectiveUserLabel) };
}

/** @param {string} value @returns {string} */
function readsAString(value) {
  return value;
}
