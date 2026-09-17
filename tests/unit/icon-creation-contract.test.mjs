import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();
const iconsSource = readText("public/js/shared/icons.js");
const builderSource = readText("public/js/shared/view-builder.js");
const modalStackSource = readText("public/js/shared/view-modal-stack.js");

/**
 * The creation contract `0.33.33.39.17` widened, exercised through the **real** icon module.
 *
 * `BrowserIconCreateButtonOptions` used to declare `icon`, `title`, `type` and `variant` as
 * strings and `iconOnly` as a boolean, while `BrowserViewActionButtonOptions` declared all five
 * as `unknown` and `createActionButton` forwarded them raw. The creation bag now describes what
 * its writer actually does with each. **`decorateButton` keeps the narrow parent bag**, which the
 * compiler probe at the bottom of this file is what holds in place.
 *
 * These cases run the published `icons.js` rather than the harness stub, because the whole point
 * of the reconciliation is what the real writer does with a value it was handed.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

/** @param {{ withIcons?: boolean }} [options] */
function surface({ withIcons = true } = {}) {
  // `iconButton: false` keeps the harness from installing its permissive stub, so the real module
  // is the only `createIconButton` in the context.
  const context = createFakeBrowserContext({ iconButton: false });
  if (withIcons) vm.runInNewContext(iconsSource, context, { filename: "icons.js" });
  vm.runInNewContext(modalStackSource, context, { filename: "view-modal-stack.js" });
  vm.runInNewContext(builderSource, context, { filename: "view-builder.js" });
  const root = context.window.LongtailForge;
  assert.ok(isBag(root), "the modules should publish their namespace");
  return root;
}

/** @param {Bag} root @returns {Record<string, (...args: unknown[]) => Bag>} */
function viewFactory(root) {
  const view = root.view;
  assert.ok(isBag(view), "the builder should publish LongtailForge.view");
  return /** @type {Record<string, (...args: unknown[]) => Bag>} */ (view);
}

/** @param {Bag} root @returns {Record<string, (...args: unknown[]) => Bag>} */
function iconFactory(root) {
  const icons = root.icons;
  assert.ok(isBag(icons), "the icon module should publish LongtailForge.icons");
  return /** @type {Record<string, (...args: unknown[]) => Bag>} */ (icons);
}

/** @param {unknown} node @param {string} tagName @returns {Bag[]} */
function byTag(node, tagName) {
  /** @type {Bag[]} */
  const found = [];
  /** @param {unknown} current */
  const walk = (current) => {
    if (!isBag(current)) return;
    if (String(current.tagName || "").toUpperCase() === tagName.toUpperCase()) found.push(current);
    const children = current.children;
    if (Array.isArray(children)) children.forEach(walk);
  };
  walk(node);
  return found;
}

/** @param {unknown} node @param {string} className */
function hasClass(node, className) {
  assert.ok(isBag(node));
  const classList = node.classList;
  assert.ok(isBag(classList));
  const contains = Reflect.get(classList, "contains");
  assert.ok(isCallable(contains));
  return Reflect.apply(contains, classList, [className]) === true;
}

/** @param {unknown} node @param {string} name */
function attr(node, name) {
  assert.ok(isBag(node));
  const getAttribute = node.getAttribute;
  assert.ok(isCallable(getAttribute));
  return Reflect.apply(getAttribute, node, [name]);
}

describe("The real icon writer, through the view factory", () => {
  it("builds an icon button when it is given an icon, and reaches the real registry", () => {
    const view = viewFactory(surface());
    const button = view.createActionButton({ icon: "save", label: "Save" });
    assert.equal(button.tagName, "BUTTON");
    assert.equal(byTag(button, "svg").length, 1, "the real writer builds a registry icon");
    assert.ok(hasClass(button, "action-button"));
    assert.ok(hasClass(button, "view-action-button"));
  });

  it("refuses an icon the registry does not hold, which is the real writer's own failure", () => {
    const view = viewFactory(surface());
    assert.throws(() => view.createActionButton({ icon: "not-a-real-icon", label: "Save" }), /Unknown icon/);
  });

  /**
   * The member the whole reconciliation turns on. `createIconButton` tests `iconOnly !== false`,
   * so a **literal `false`** is the only value that turns the icon-only treatment off; every
   * other falsy value leaves it on. Coercing the flag on the way through - which the old
   * contract would have required - would have collapsed these three cases into one.
   */
  it("tells a literal false apart from a falsy non-false flag, where the flag is read", () => {
    const icons = iconFactory(surface());
    const absent = icons.createIconButton({ icon: "save", label: "Save" });
    assert.ok(hasClass(absent, "icon-button"), "an absent flag leaves the icon-only treatment on");
    assert.equal(attr(absent, "aria-label"), "Save");

    for (const iconOnly of [0, "", Number.NaN, null, undefined]) {
      const falsy = icons.createIconButton({ icon: "save", label: "Save", iconOnly });
      assert.ok(hasClass(falsy, "icon-button"), `iconOnly: ${String(iconOnly)} is not false`);
    }

    const off = icons.createIconButton({ icon: "save", label: "Save", iconOnly: false });
    assert.ok(!hasClass(off, "icon-button"), "only a literal false turns it off");
    assert.equal(attr(off, "aria-label"), null, "and then no accessible name is forced");
  });

  it("carries that distinction through the view factory's forwarding, unchanged", () => {
    const view = viewFactory(surface());
    for (const iconOnly of [undefined, 0, ""]) {
      const on = view.createActionButton({ icon: "save", label: "Save", text: "", iconOnly });
      assert.ok(hasClass(on, "icon-button"), `iconOnly: ${String(iconOnly)} survives forwarding as not-false`);
    }
    const off = view.createActionButton({ icon: "save", label: "Save", text: "", iconOnly: false });
    assert.ok(!hasClass(off, "icon-button"), "and a literal false survives as false");
  });

  /**
   * Worth pinning because it is what makes the case above need an explicit empty text: the view
   * factory defaults `text` to the label when the caller supplies none, so a labelled button
   * reaches the icon writer with visible text and is never treated as icon-only.
   */
  it("defaults visible text to the label, so a labelled button is not icon-only", () => {
    const view = viewFactory(surface());
    const labelled = view.createActionButton({ icon: "save", label: "Save" });
    assert.equal(labelled.textContent, "Save");
    assert.ok(!hasClass(labelled, "icon-button"));
  });

  it("keeps the icon-only treatment off whenever the button has visible text", () => {
    const view = viewFactory(surface());
    const labelled = view.createActionButton({ icon: "save", label: "Save task", text: "Save" });
    assert.ok(!hasClass(labelled, "icon-button"));
    assert.equal(byTag(labelled, "svg").length, 1, "the icon is still built");
  });

  it("refuses a button with neither an accessible label nor visible text, at both layers", () => {
    const root = surface();
    assert.throws(() => viewFactory(root).createActionButton({ icon: "save" }),
      /require visible text or an accessible label/);
    assert.throws(() => iconFactory(root).createIconButton({ icon: "save" }),
      /require an accessible label or visible text/);
  });

  it("selects a variant by name and adds nothing for anything else", () => {
    const view = viewFactory(surface());
    assert.ok(hasClass(view.createActionButton({ icon: "save", label: "S", variant: "danger" }), "danger-button"));
    assert.ok(hasClass(view.createActionButton({ icon: "save", label: "S", variant: "secondary" }), "secondary-button"));
    assert.ok(hasClass(view.createActionButton({ icon: "save", label: "S", variant: "link" }), "link-button"));
    const unknownVariant = view.createActionButton({ icon: "save", label: "S", variant: 9 });
    for (const name of ["danger-button", "secondary-button", "link-button"]) {
      assert.ok(!hasClass(unknownVariant, name), `a broader variant adds no ${name}`);
    }
  });

  it("carries a broader title and type through the writer rather than refusing them", () => {
    const view = viewFactory(surface());
    const button = view.createActionButton({ icon: "save", label: "Save", title: 7 });
    assert.equal(button.title, "7", "the title is written as text");
    assert.doesNotThrow(() => view.createActionButton({ icon: "save", label: "Save", type: 42 }),
      "and an unfamiliar type is assigned rather than validated");
  });

  it("still falls back to a plain button when the icons surface is absent", () => {
    const view = viewFactory(surface({ withIcons: false }));
    const button = view.createActionButton({ icon: "save", label: "Save" });
    assert.equal(button.tagName, "BUTTON");
    assert.equal(byTag(button, "svg").length, 0, "no icon module, no icon");
    assert.equal(button.textContent, "Save");
    assert.ok(hasClass(button, "action-button"));
    assert.equal(button.type, "button", "and the default type is still applied");
  });

  it("keeps disabled state, action metadata and handler registration", () => {
    const view = viewFactory(surface());
    /** @type {number[]} */
    const clicks = [];
    const button = view.createActionButton({
      icon: "save", label: "Save", disabled: true, action: "save-task", role: "primary",
      onClick: () => clicks.push(1),
    });
    assert.equal(button.disabled, true);
    const dataset = button.dataset;
    assert.ok(isBag(dataset));
    assert.equal(dataset.surfaceAction, "save-task");
    assert.equal(dataset.surfaceActionRole, "primary");
    const dispatchEvent = button.dispatchEvent;
    assert.ok(isCallable(dispatchEvent));
    Reflect.apply(dispatchEvent, button, [{ type: "click" }]);
    assert.deepEqual(clicks, [1], "and the handler is the one that was registered");
  });
});

describe("The creation contract, as the compiler sees it", () => {
  /**
   * A type-level probe rather than a behavioural one. This file is checked by the same
   * shrink-only ledger as production, so if the creation bag stops accepting what the view bag
   * forwards - or if the narrow parent is widened along with it - these declarations stop
   * compiling and the checkpoint cannot be recorded.
   */
  it("composes with the view's action-button options while the parent stays narrow", () => {
    /** @type {import("../../src/types/browser-contracts.js").BrowserViewActionButtonOptions} */
    const viewOptions = { icon: "save", label: "Save", title: 7, type: 42, variant: 9, iconOnly: 0 };

    // Every member the view factory forwards raw is accepted by the creation bag.
    /** @type {import("../../src/types/browser-contracts.js").BrowserIconCreateButtonOptions} */
    const forwarded = {
      icon: viewOptions.icon,
      iconOnly: viewOptions.iconOnly,
      title: viewOptions.title,
      type: viewOptions.type,
      variant: viewOptions.variant,
      label: "Save",
      text: "",
    };
    assert.equal(forwarded.label, "Save");

    // The parent bag `decorateButton` takes was not widened with it: these stay narrow, and each
    // assignment fails to compile if that ever changes.
    /** @type {import("../../src/types/browser-contracts.js").BrowserIconButtonOptions} */
    const parentOptions = { icon: "save", iconOnly: true, label: "Save", title: "Save", variant: "danger" };
    /** @type {boolean | undefined} */
    const parentFlag = parentOptions.iconOnly;
    /** @type {string | undefined} */
    const parentIcon = parentOptions.icon;
    /** @type {string | undefined} */
    const parentTitle = parentOptions.title;
    assert.equal(parentFlag, true);
    assert.equal(parentIcon, "save");
    assert.equal(parentTitle, "Save");
  });

  it("keeps the precise return types on both writers", () => {
    const root = surface();
    /** @type {import("../../src/types/browser-contracts.js").BrowserIcons} */
    const icons = /** @type {never} */ (iconFactory(root));
    /** @type {HTMLButtonElement} */
    const created = icons.createIconButton({ icon: "save", label: "Save" });
    /** @type {HTMLButtonElement} */
    const decorated = icons.decorateButton(created, { icon: "save", label: "Save" });
    // Reading a button-only member is what proves the type survived the widening.
    /** @type {boolean} */
    const disabled = decorated.disabled;
    assert.equal(disabled, false);
    assert.equal(decorated, created, "and decoration answers the same element");
  });
});
