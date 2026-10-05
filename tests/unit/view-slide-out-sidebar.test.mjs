import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/view-renderer.js");

/**
 * The slide-out sidebar, which nothing executed before `0.33.33.39.11`.
 *
 * The published contract declares the controller and both of its option bags, and a source-text
 * check asserts the export exists - but no test had ever opened the drawer, pressed Escape in it,
 * or tabbed to its edge. Typing the seam changed four executable things, and each is asserted
 * here as behaviour rather than as spelling:
 *
 * - the four-element guard, which was a loop and is now four `if`s, throws the same message for
 *   the same missing control in the same order;
 * - the controller passes the four controls the guard proved, so every consumer sees the same
 *   nodes the caller supplied;
 * - `containSlideOutSidebarFocus` answers the same thing when there is no active element at all,
 *   which is the case the added truthiness guard covers; and
 * - `slideOutSidebarFocusTargets` filters exactly the three kinds of control it filtered before.
 *
 * The two layout renderers are not lifted: they build through the view primitives and reach four
 * other renderers, and their diagnostics were parameter annotations with no executable change.
 */

const LIFTED = [
  "setElementClass", "setElementHidden", "slideOutSidebarFocusTargets", "focusSlideOutSidebar",
  "containSlideOutSidebarFocus", "syncSlideOutSidebarState", "setSlideOutSidebarOpen",
  "wireSlideOutSidebar", "createSlideOutSidebarController",
];

const NAMES = ["backdrop", "closeButton", "drawer", "trigger"];

function sidebar() {
  const context = createFakeBrowserContext();
  const scope = vm.createContext({ global: context.window });
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), scope);
  return { api: vm.runInContext(`({ ${LIFTED.join(", ")} })`, scope), document: context.document };
}

/**
 * @param {import("../../scripts/test-support/fake-dom.mjs").FakeDocument} document
 * @param {{ focusables?: number }} [options]
 */
function controls(document, { focusables = 0 } = {}) {
  const elements = {
    backdrop: document.createElement("div"),
    closeButton: document.createElement("button"),
    drawer: document.createElement("aside"),
    trigger: document.createElement("button"),
  };
  for (let index = 0; index < focusables; index += 1) {
    const control = document.createElement("button");
    control.setAttribute("data-index", String(index));
    elements.drawer.appendChild(control);
  }
  return elements;
}

/** @param {Record<string, unknown>} elements @param {string} omitted */
const without = (elements, omitted) => Object.fromEntries(Object.entries(elements).filter(([name]) => name !== omitted));

/**
 * The controls a drawer offers, by the marker this file writes on each.
 *
 * `Array.from` rather than `map`, because the list is built inside the vm and a list built there
 * is never reference-equal to one written here.
 * @param {ArrayLike<unknown>} targets
 */
const markers = (targets) => Array.from(targets, (target) => (target && typeof target === "object" ? Reflect.get(target, "id") : target));

describe("The slide-out sidebar's element guard", () => {
  it("refuses each missing control by name", () => {
    const { api, document } = sidebar();
    for (const name of NAMES) {
      assert.throws(
        () => api.createSlideOutSidebarController(without(controls(document), name)),
        new RegExp(`require a ${name} element`),
        `missing: ${name}`,
      );
    }
  });

  it("checks them in a fixed order, so the first absent one is the one it names", () => {
    const { api, document } = sidebar();
    assert.throws(() => api.createSlideOutSidebarController({}), /require a backdrop element/);
    assert.throws(
      () => api.createSlideOutSidebarController(without(without(controls(document), "backdrop"), "drawer")),
      /require a backdrop element/,
      "backdrop is checked before drawer",
    );
    assert.throws(
      () => api.createSlideOutSidebarController(without(without(controls(document), "drawer"), "trigger")),
      /require a drawer element/,
      "and drawer before trigger",
    );
  });

  /**
   * **A finding, not a change.** The guard reads `addEventListener` for truthiness and always
   * has - the loop it replaced read the same member the same way. A control carrying the name
   * but not a function therefore passes the guard and fails at the wiring instead, with the
   * runtime's own message rather than this file's. Nothing here repairs that; it is recorded so
   * the unrolling is not read as having narrowed the check.
   */
  it("refuses a control carrying no listener at all, and passes one whose listener is not callable", () => {
    const { api, document } = sidebar();
    assert.throws(
      () => api.createSlideOutSidebarController({ ...controls(document), closeButton: {} }),
      /require a closeButton element/,
    );
    assert.throws(
      () => api.createSlideOutSidebarController({ ...controls(document), trigger: { addEventListener: "not callable" } }),
      /addEventListener is not a function/,
      "the guard tests presence, so this one fails later and elsewhere",
    );
  });

  it("is reached with no arguments at all, because both bags default", () => {
    const { api } = sidebar();
    assert.throws(() => api.createSlideOutSidebarController(), /require a backdrop element/);
  });
});

describe("The slide-out sidebar controller's opening state", () => {
  it("starts closed, and answers a frozen controller of five members", () => {
    const { api, document } = sidebar();
    const controller = api.createSlideOutSidebarController(controls(document));
    assert.equal(controller.isOpen, false);
    assert.equal(Object.isFrozen(controller), true);
    assert.deepEqual(Object.keys(controller).sort(), ["close", "isOpen", "open", "sync", "toggle"]);
  });

  it("starts open when the option says so, coercing whatever it was given", () => {
    const { api, document } = sidebar();
    assert.equal(api.createSlideOutSidebarController(controls(document), { open: true }).isOpen, true);
    assert.equal(api.createSlideOutSidebarController(controls(document), { open: "yes" }).isOpen, true);
    assert.equal(api.createSlideOutSidebarController(controls(document), { open: 0 }).isOpen, false);
  });

  it("prefers a supplied state over the option, and keeps writing to that same object", () => {
    const { api, document } = sidebar();
    const state = { slideOutSidebarOpen: "open already", other: "untouched" };
    const controller = api.createSlideOutSidebarController(controls(document), { open: false, state });
    assert.equal(controller.isOpen, true, "the supplied flag wins over the option");
    assert.equal(state.slideOutSidebarOpen, true, "and is coerced in place on entry");
    controller.close();
    assert.equal(state.slideOutSidebarOpen, false, "the host's own object is the one that moves");
    assert.equal(state.other, "untouched");
  });

  it("does not move focus while it is being built", () => {
    const { api, document } = sidebar();
    api.createSlideOutSidebarController(controls(document, { focusables: 1 }), { open: true });
    assert.equal(document.activeElement, null);
  });
});

describe("The slide-out sidebar's wiring", () => {
  it("marks the trigger and the close button for the stylesheet", () => {
    const { api, document } = sidebar();
    const elements = controls(document);
    api.createSlideOutSidebarController(elements);
    assert.equal(elements.trigger.getAttribute("data-view-slideout-sidebar-trigger"), "");
    assert.equal(elements.closeButton.getAttribute("data-view-slideout-sidebar-close"), "");
  });

  it("toggles from the trigger and closes from the close button and the backdrop", () => {
    const { api, document } = sidebar();
    const elements = controls(document);
    const controller = api.createSlideOutSidebarController(elements);
    elements.trigger.dispatchEvent({ type: "click" });
    assert.equal(controller.isOpen, true);
    elements.closeButton.dispatchEvent({ type: "click" });
    assert.equal(controller.isOpen, false);
    elements.trigger.dispatchEvent({ type: "click" });
    elements.backdrop.dispatchEvent({ type: "click" });
    assert.equal(controller.isOpen, false, "and the backdrop closes it too");
  });

  it("closes on Escape from the drawer, the trigger and the backdrop, but only while it is open", () => {
    const { api, document } = sidebar();
    for (const name of ["drawer", "trigger", "backdrop"]) {
      const elements = controls(document);
      const controller = api.createSlideOutSidebarController(elements, { open: true });
      const source_ = Reflect.get(elements, name);
      assert.equal(source_.dispatchEvent({ type: "keydown", key: "Escape" }), false, `${name}: the key is consumed`);
      assert.equal(controller.isOpen, false, `${name}: and it closes`);
      assert.equal(source_.dispatchEvent({ type: "keydown", key: "Escape" }), true, `${name}: a second press is not consumed`);
    }
  });

  it("ignores any other key, and ignores Escape on the close button, which was never wired for it", () => {
    const { api, document } = sidebar();
    const elements = controls(document);
    const controller = api.createSlideOutSidebarController(elements, { open: true });
    elements.drawer.dispatchEvent({ type: "keydown", key: "Enter" });
    elements.closeButton.dispatchEvent({ type: "keydown", key: "Escape" });
    assert.equal(controller.isOpen, true);
  });

  it("focuses into the drawer when its transition ends, and only while it is open", () => {
    const { api, document } = sidebar();
    const elements = controls(document, { focusables: 2 });
    const controller = api.createSlideOutSidebarController(elements);
    elements.drawer.dispatchEvent({ type: "transitionend" });
    assert.equal(document.activeElement, null, "a closed drawer does not take focus");
    controller.open({ focus: false });
    elements.drawer.dispatchEvent({ type: "transitionend" });
    assert.equal(document.activeElement, elements.drawer.children[0]);
  });
});

describe("The slide-out sidebar's synchronised state", () => {
  it("writes the open state onto all four controls and the body", () => {
    const { api, document } = sidebar();
    const elements = controls(document);
    const controller = api.createSlideOutSidebarController(elements);
    controller.open({ focus: false });
    assert.equal(elements.trigger.getAttribute("aria-expanded"), "true");
    assert.equal(elements.trigger.getAttribute("aria-pressed"), "true");
    assert.equal(elements.closeButton.getAttribute("aria-expanded"), "true");
    assert.equal(elements.drawer.getAttribute("aria-hidden"), "false");
    assert.equal(elements.backdrop.hidden, false);
    assert.equal(elements.drawer.classList.contains("is-open"), true);
    assert.equal(elements.backdrop.classList.contains("is-open"), true);
    assert.equal(document.body.classList.contains("view-slideout-sidebar-lock"), true);
  });

  it("reverses every one of them on close", () => {
    const { api, document } = sidebar();
    const elements = controls(document);
    const controller = api.createSlideOutSidebarController(elements, { open: true });
    controller.close({ focus: false });
    assert.equal(elements.trigger.getAttribute("aria-expanded"), "false");
    assert.equal(elements.trigger.getAttribute("aria-pressed"), "false");
    assert.equal(elements.closeButton.getAttribute("aria-expanded"), "false");
    assert.equal(elements.drawer.getAttribute("aria-hidden"), "true");
    assert.equal(elements.backdrop.hidden, true);
    assert.equal(elements.backdrop.getAttribute("hidden"), "");
    assert.equal(elements.drawer.classList.contains("is-open"), false);
    assert.equal(document.body.classList.contains("view-slideout-sidebar-lock"), false);
  });

  it("moves focus in on open and back to the trigger on close, unless focus is declined", () => {
    const { api, document } = sidebar();
    const elements = controls(document, { focusables: 1 });
    const controller = api.createSlideOutSidebarController(elements);
    controller.open();
    assert.equal(document.activeElement, elements.drawer.children[0]);
    controller.close();
    assert.equal(document.activeElement, elements.trigger);
    controller.open({ focus: false });
    assert.equal(document.activeElement, elements.trigger, "a declined sync leaves focus where it was");
  });

  it("declines focus only for an explicit false, not for an absent option", () => {
    const { api, document } = sidebar();
    const elements = controls(document, { focusables: 1 });
    const controller = api.createSlideOutSidebarController(elements);
    controller.sync({});
    assert.equal(document.activeElement, elements.trigger, "an absent flag still syncs focus");
    controller.toggle();
    assert.equal(controller.isOpen, true);
    assert.equal(document.activeElement, elements.drawer.children[0], "and toggle carries the same default");
  });

  it("falls back to the drawer itself when it holds nothing focusable", () => {
    const { api, document } = sidebar();
    const elements = controls(document);
    api.createSlideOutSidebarController(elements, { open: true }).open();
    assert.equal(document.activeElement, elements.drawer);
  });
});

describe("The two element helpers the sidebar syncs through", () => {
  it("hides and shows through both the property and the attribute", () => {
    const { api, document } = sidebar();
    const node = document.createElement("div");
    api.setElementHidden(node, "truthy");
    assert.equal(node.hidden, true);
    assert.equal(node.getAttribute("hidden"), "");
    api.setElementHidden(node, 0);
    assert.equal(node.hidden, false);
    assert.equal(node.getAttribute("hidden"), null);
  });

  it("does nothing for an absent element rather than throwing", () => {
    const { api } = sidebar();
    for (const value of [null, undefined, false, 0, ""]) {
      assert.doesNotThrow(() => api.setElementHidden(value, true), `value: ${JSON.stringify(value)}`);
      assert.doesNotThrow(() => api.setElementClass(value, "is-open", true), `value: ${JSON.stringify(value)}`);
    }
  });

  it("prefers the class list's own toggle, and falls back to add and remove when there is none", () => {
    const { api, document } = sidebar();
    const node = document.createElement("div");
    api.setElementClass(node, "is-open", true);
    assert.equal(node.classList.contains("is-open"), true);
    api.setElementClass(node, "is-open", false);
    assert.equal(node.classList.contains("is-open"), false);

    /** @type {string[]} */
    const added = [];
    /** @type {string[]} */
    const removed = [];
    const legacy = { classList: { add: (/** @type {string} */ name) => added.push(name), remove: (/** @type {string} */ name) => removed.push(name) } };
    api.setElementClass(legacy, "is-open", true);
    api.setElementClass(legacy, "is-open", false);
    assert.deepEqual(added, ["is-open"]);
    assert.deepEqual(removed, ["is-open"]);
  });

  it("ignores an element carrying no class list, and a class list that can only add", () => {
    const { api } = sidebar();
    assert.doesNotThrow(() => api.setElementClass({ tagName: "DIV" }, "is-open", true));
    /** @type {string[]} */
    const added = [];
    const addOnly = { classList: { add: (/** @type {string} */ name) => added.push(name) } };
    api.setElementClass(addOnly, "is-open", true);
    assert.doesNotThrow(() => api.setElementClass(addOnly, "is-open", false));
    assert.deepEqual(added, ["is-open"], "and removal is skipped rather than attempted");
  });
});

describe("The drawer's focusable controls", () => {
  /**
   * @param {import("../../scripts/test-support/fake-dom.mjs").FakeDocument} document
   * @param {string} id
   * @param {string} tag
   */
  function control(document, id, tag) {
    const node = document.createElement(tag);
    node.setAttribute("id", id);
    Reflect.set(node, "id", id);
    return node;
  }

  it("answers every control the selector names, in document order", () => {
    const { api, document } = sidebar();
    const drawer = document.createElement("aside");
    for (const [id, tag] of [["b", "button"], ["i", "input"], ["s", "select"], ["t", "textarea"]]) {
      drawer.appendChild(control(document, id, tag));
    }
    const link = control(document, "a", "a");
    link.setAttribute("href", "/x");
    drawer.appendChild(link);
    assert.deepEqual(markers(api.slideOutSidebarFocusTargets(drawer)), ["b", "i", "s", "t", "a"]);
  });

  it("takes a positive tabindex and refuses a programmatic one", () => {
    const { api, document } = sidebar();
    const drawer = document.createElement("aside");
    const reachable = control(document, "reachable", "div");
    reachable.setAttribute("tabindex", "0");
    const programmatic = control(document, "programmatic", "div");
    programmatic.setAttribute("tabindex", "-1");
    drawer.append(reachable, programmatic);
    assert.deepEqual(markers(api.slideOutSidebarFocusTargets(drawer)), ["reachable"]);
  });

  it("filters the disabled, the hidden and the aria-hidden", () => {
    const { api, document } = sidebar();
    const drawer = document.createElement("aside");
    const kept = control(document, "kept", "button");
    const disabled = control(document, "disabled", "button");
    disabled.disabled = true;
    const hidden = control(document, "hidden", "button");
    hidden.hidden = true;
    const ariaHidden = control(document, "aria", "button");
    ariaHidden.setAttribute("aria-hidden", "true");
    const ariaShown = control(document, "aria-false", "button");
    ariaShown.setAttribute("aria-hidden", "false");
    drawer.append(kept, disabled, hidden, ariaHidden, ariaShown);
    assert.deepEqual(markers(api.slideOutSidebarFocusTargets(drawer)), ["kept", "aria-false"]);
  });

  it("answers an empty list for anything that cannot be queried", () => {
    const { api } = sidebar();
    for (const value of [null, undefined, {}, "drawer", 7]) {
      assert.deepEqual(markers(api.slideOutSidebarFocusTargets(value)), [], `value: ${JSON.stringify(value)}`);
    }
  });
});

describe("The drawer's focus containment", () => {
  /**
   * @param {import("../../scripts/test-support/fake-dom.mjs").FakeDocument} document
   * @param {number} count
   */
  function drawerWith(document, count) {
    const drawer = document.createElement("aside");
    for (let index = 0; index < count; index += 1) {
      const node = document.createElement("button");
      Reflect.set(node, "id", `c${index}`);
      drawer.appendChild(node);
    }
    return drawer;
  }

  /** @param {boolean} [shiftKey] */
  function tabEvent(shiftKey = false) {
    let prevented = false;
    return { key: "Tab", shiftKey, preventDefault: () => { prevented = true; }, wasPrevented: () => prevented };
  }

  it("holds focus on an empty drawer rather than letting the tab leave it", () => {
    const { api, document } = sidebar();
    const drawer = drawerWith(document, 0);
    const event = tabEvent();
    api.containSlideOutSidebarFocus(event, drawer);
    assert.equal(event.wasPrevented(), true);
    assert.equal(document.activeElement, drawer);
  });

  it("wraps backwards from the first control, and from the drawer itself, to the last", () => {
    const { api, document } = sidebar();
    const drawer = drawerWith(document, 3);
    drawer.children[0].focus();
    api.containSlideOutSidebarFocus(tabEvent(true), drawer);
    assert.equal(document.activeElement, drawer.children[2]);
    drawer.focus();
    api.containSlideOutSidebarFocus(tabEvent(true), drawer);
    assert.equal(document.activeElement, drawer.children[2], "the drawer counts as being at the start");
  });

  it("wraps forwards from the last control to the first", () => {
    const { api, document } = sidebar();
    const drawer = drawerWith(document, 3);
    drawer.children[2].focus();
    const event = tabEvent();
    api.containSlideOutSidebarFocus(event, drawer);
    assert.equal(event.wasPrevented(), true);
    assert.equal(document.activeElement, drawer.children[0]);
  });

  /**
   * The line the typing changed. The membership test answered `false` for an absent active
   * element and the negation therefore answered `true`; the added truthiness guard answers `true`
   * for the same case without asking the list about it.
   */
  it("pulls focus to the first control when nothing in the page holds it", () => {
    const { api, document } = sidebar();
    const drawer = drawerWith(document, 3);
    assert.equal(document.activeElement, null, "nothing is focused");
    const event = tabEvent();
    api.containSlideOutSidebarFocus(event, drawer);
    assert.equal(event.wasPrevented(), true);
    assert.equal(document.activeElement, drawer.children[0]);
  });

  it("pulls focus in from a control outside the drawer", () => {
    const { api, document } = sidebar();
    const drawer = drawerWith(document, 3);
    const outside = document.createElement("button");
    outside.focus();
    api.containSlideOutSidebarFocus(tabEvent(), drawer);
    assert.equal(document.activeElement, drawer.children[0]);
  });

  it("leaves a tab in the middle of the drawer alone", () => {
    const { api, document } = sidebar();
    const drawer = drawerWith(document, 3);
    drawer.children[1].focus();
    for (const shiftKey of [false, true]) {
      const event = tabEvent(shiftKey);
      api.containSlideOutSidebarFocus(event, drawer);
      assert.equal(event.wasPrevented(), false, `shiftKey: ${shiftKey}`);
      assert.equal(document.activeElement, drawer.children[1], `shiftKey: ${shiftKey}`);
    }
  });

  it("is reached from a real Tab press on the drawer, and only while it is open", () => {
    const { api, document } = sidebar();
    const elements = controls(document, { focusables: 2 });
    const controller = api.createSlideOutSidebarController(elements);
    assert.equal(elements.drawer.dispatchEvent({ type: "keydown", key: "Tab" }), true, "a closed drawer does not contain");
    assert.equal(document.activeElement, null);
    controller.open({ focus: false });
    assert.equal(elements.drawer.dispatchEvent({ type: "keydown", key: "Tab" }), false);
    assert.equal(document.activeElement, elements.drawer.children[0]);
  });
});

describe("The drawer's entry focus", () => {
  it("takes the first focusable control", () => {
    const { api, document } = sidebar();
    const drawer = document.createElement("aside");
    const first = document.createElement("button");
    drawer.append(first, document.createElement("button"));
    api.focusSlideOutSidebar(drawer);
    assert.equal(document.activeElement, first);
  });

  it("falls back to a matching control the filter rejected, and then to the drawer", () => {
    const { api, document } = sidebar();
    const drawer = document.createElement("aside");
    const disabled = document.createElement("button");
    disabled.disabled = true;
    drawer.appendChild(disabled);
    api.focusSlideOutSidebar(drawer);
    assert.equal(document.activeElement, disabled, "the query answers what the filter had removed");

    const empty = document.createElement("aside");
    api.focusSlideOutSidebar(empty);
    assert.equal(document.activeElement, empty);
  });

  it("does nothing for an absent drawer rather than throwing", () => {
    const { api } = sidebar();
    for (const value of [null, undefined, {}]) {
      assert.doesNotThrow(() => api.focusSlideOutSidebar(value), `value: ${JSON.stringify(value)}`);
    }
  });
});
