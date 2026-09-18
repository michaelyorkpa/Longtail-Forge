import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();
const builderSource = readText("public/js/shared/view-builder.js");
const modalStackSource = readText("public/js/shared/view-modal-stack.js");

/**
 * What a floating action menu does with a pointer target, now that the target is narrowed.
 *
 * `0.33.33.39.23` took `view-builder.js` to zero by typing `handlePointerDown`'s event. The one
 * thing it reads, `event.target`, is an `EventTarget`, and `menu.contains` takes `Node | null`, so
 * the handler now establishes that before the call: a node of any kind passes through, `null` and
 * `undefined` still reach `contains` and still read as outside, and anything that was never a node
 * fails locally rather than being taken for an inside or outside click.
 *
 * The DOM double gives a document no listeners and an element no `Node.contains`, so this harness
 * supplies both: the document records what the menu installs, and the menu gets a `contains`
 * written to the specification - `null` answers false, a non-node throws, and a node answers by
 * walking its parents. Cross-realm nodes are proved in a real browser, where realms exist.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

/** @param {unknown} value */
function thrown(value) {
  assert.ok(isBag(value), "a failure should be an object");
  return { name: String(value.name), message: String(value.message) };
}

/**
 * An open floating menu with an inside child, plus the listener it installed on its document.
 */
function openMenu() {
  const context = createFakeBrowserContext();
  /** @type {{ type: string, listener: (event: Bag) => unknown }[]} */
  const documentListeners = [];
  const document = context.document;
  Reflect.set(document, "addEventListener", (/** @type {string} */ type, /** @type {(event: Bag) => unknown} */ listener) => {
    documentListeners.push({ type, listener });
  });
  Reflect.set(document, "removeEventListener", (/** @type {string} */ type, /** @type {unknown} */ listener) => {
    const index = documentListeners.findIndex((entry) => entry.type === type && entry.listener === listener);
    if (index >= 0) documentListeners.splice(index, 1);
  });
  // Opening a floating menu first closes any other open one through a compound selector the
  // double cannot parse. This is the single-menu case, so that one query answers "none open";
  // every other query goes to the double unchanged.
  const querySelectorAll = document.querySelectorAll;
  Reflect.set(document, "querySelectorAll", (/** @type {string} */ selector) => (
    selector === ".view-detail-action-menu[data-view-floating-menu][open]"
      ? []
      : Reflect.apply(querySelectorAll, document, [selector])
  ));
  vm.runInNewContext(modalStackSource, context, { filename: "view-modal-stack.js" });
  vm.runInNewContext(builderSource, context, { filename: "view-builder.js" });
  const view = /** @type {Bag} */ (context.window.LongtailForge?.view);
  const create = view.createDetailActionMenu;
  assert.ok(isCallable(create));

  const inside = document.createElement("button");
  const menu = Reflect.apply(create, view, [{ actions: [inside], ariaLabel: "Row actions" }]);
  assert.ok(isBag(menu), "createDetailActionMenu should return an element");

  // Node.contains, per the specification: `null` is false, a non-node is a TypeError, a node
  // answers whether this menu is it or one of its ancestors.
  Reflect.set(menu, "contains", (/** @type {unknown} */ other) => {
    if (other === null || other === undefined) return false;
    if (!isBag(other) || typeof other.nodeType !== "number") {
      throw new TypeError("Failed to execute 'contains' on 'Node': parameter 1 is not of type 'Node'.");
    }
    /** @type {unknown} */
    let node = other;
    while (isBag(node)) {
      if (node === menu) return true;
      node = node.parentNode;
    }
    return false;
  });

  Reflect.set(menu, "open", true);
  const dispatch = menu.dispatchEvent;
  assert.ok(isCallable(dispatch));
  Reflect.apply(dispatch, menu, [{ type: "toggle" }]);

  const pointer = documentListeners.find((entry) => entry.type === "pointerdown");
  assert.ok(pointer, "an open floating menu listens for pointerdown on its document");
  return { context, document, inside, menu, pointerdown: (/** @type {unknown} */ target) => pointer.listener({ type: "pointerdown", target }) };
}

describe("A floating action menu reads its pointer target as a Node", () => {
  it("stays open for a pointer that lands inside it", () => {
    const f = openMenu();
    f.pointerdown(f.inside);
    assert.equal(f.menu.open, true);
  });

  it("stays open for a text node and an SVG node inside it", () => {
    const f = openMenu();
    const text = f.document.createTextNode("Label");
    f.inside.appendChild(text);
    const icon = f.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    f.inside.appendChild(icon);

    f.pointerdown(text);
    f.pointerdown(icon);
    assert.equal(f.menu.open, true, "every node kind passes through to contains");
  });

  it("closes for a pointer that lands outside it", () => {
    const f = openMenu();
    const outside = f.document.createElement("div");
    f.document.body.appendChild(outside);
    f.pointerdown(outside);
    assert.equal(f.menu.open, false);
  });

  it("closes for a null target, exactly as contains(null) always answered", () => {
    const f = openMenu();
    f.pointerdown(null);
    assert.equal(f.menu.open, false);
  });

  it("closes for an undefined target too, which contains reads as null", () => {
    const f = openMenu();
    f.pointerdown(undefined);
    assert.equal(f.menu.open, false);
  });

  it("refuses a target that was never a node, locally, without closing", () => {
    for (const malformed of [{}, { nodeType: "1" }, "button", 7]) {
      const f = openMenu();
      let failure;
      try {
        f.pointerdown(malformed);
      } catch (error) {
        failure = thrown(error);
      }
      assert.deepEqual(
        failure,
        { name: "TypeError", message: "A floating action menu can only test a Node pointer target." },
        "a malformed target is a failure, not an inside or outside click",
      );
      assert.equal(f.menu.open, true, "and the menu is left as it was");
    }
  });
});
