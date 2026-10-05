import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The Overlay Host writer boundary, typed by `0.33.33.39.3`.
 *
 * `LongtailForge.overlayHost` is documented in `docs/module-development.md` and
 * `docs/ui-surface-contract.md` and has **no internal consumer**, which is exactly why it needed
 * executable coverage rather than source assertions: nothing else in the estate would notice if
 * its behaviour drifted.
 *
 * These tests evaluate the shipped file against a DOM double that provides precisely the
 * capabilities the writer uses - `classList`, `dataset`, `hidden`, `style`, `setAttribute`,
 * `contains`, `querySelectorAll`, `focus`, `getBoundingClientRect` - so the implementation runs
 * unmodified. The estate carries no jsdom, and this is the harness that reaches the real code.
 */

const source = readFileSync(new URL("../../public/js/shared/overlay-host.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

/** @typedef {{ bottom: number, height: number, left: number, top: number, width: number }} FakeRect */
/** @typedef {{ matches?: string, offsetParent?: unknown, rect?: FakeRect }} FakeElementOptions */
/** @typedef {{ activeElement: unknown, addEventListener: Function }} FakeDocument */

class FakeNode {}

class FakeElement extends FakeNode {
  /** @param {string} [tag] @param {FakeElementOptions} [options] */
  constructor(tag = "div", options = {}) {
    super();
    this.nodeType = 1;
    this.tag = tag;
    this.id = "";
    this.hidden = false;
    this.focusCount = 0;
    /** @type {FakeDocument | null} */
    this.ownerDocument = null;
    /** @type {FakeElement[]} */
    this.children = [];
    /** @type {Set<string>} */
    this.classes = new Set();
    /** @type {Record<string, string>} */
    this.dataset = {};
    /** @type {Record<string, string>} */
    this.attributes = {};
    /** @type {Record<string, string>} */
    this.properties = {};
    /** @type {unknown} */
    this.offsetParent = "offsetParent" in options ? options.offsetParent : new FakeNode();
    /** @type {FakeRect} */
    this.rect = options.rect || { bottom: 0, height: 0, left: 0, top: 0, width: 0 };
    this.matches = options.matches || "";
    const classes = this.classes;
    this.classList = {
      add: (/** @type {string} */ name) => classes.add(name),
      contains: (/** @type {string} */ name) => classes.has(name),
      remove: (/** @type {string} */ name) => classes.delete(name),
    };
    const properties = this.properties;
    this.style = {
      removeProperty: (/** @type {string} */ name) => { delete properties[name]; },
      setProperty: (/** @type {string} */ name, /** @type {string} */ value) => { properties[name] = value; },
    };
  }

  /** @param {string} name @param {string} value */
  setAttribute(name, value) { this.attributes[name] = value; }

  /** @param {unknown} node @returns {boolean} */
  contains(node) {
    if (node === null || node === undefined) return false;
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  /** @param {string} selector @returns {FakeElement[]} */
  querySelectorAll(selector) {
    /** @type {FakeElement[]} */
    const found = [];
    for (const child of this.children) {
      if (child.matches && selector.includes(child.matches)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }

  getBoundingClientRect() { return this.rect; }

  focus() {
    this.focusCount += 1;
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }
}

/** Build the fake window/document pair and evaluate the shipped writer against it. */
function loadOverlayHost({ matches = false } = {}) {
  /** @type {Array<{ type: string, handler: Function, options: Record<string, unknown> }>} */
  const documentListeners = [];
  /** @type {Array<{ type: string, handler: Function, options: Record<string, unknown> }>} */
  const windowListeners = [];
  const documentDouble = {
    /** @type {unknown} */
    activeElement: null,
    addEventListener: (/** @type {string} */ type, /** @type {Function} */ handler,
      /** @type {Record<string, unknown>} */ options = {}) => {
      const entry = { handler, options, type };
      documentListeners.push(entry);
      const signal = /** @type {AbortSignal | undefined} */ (options.signal);
      signal?.addEventListener("abort", () => {
        const at = documentListeners.indexOf(entry);
        if (at !== -1) documentListeners.splice(at, 1);
      });
    },
  };
  /** @type {string[]} */
  const mediaQueries = [];
  const windowDouble = {
    // Reached through `globalThis` because the unit-test lint environment declares no
    // browser globals; this is Node's own implementation, which the writer uses as-is.
    AbortController: globalThis.AbortController,
    LongtailForge: /** @type {Record<string, Record<string, Function>>} */ ({}),
    addEventListener: (/** @type {string} */ type, /** @type {Function} */ handler,
      /** @type {Record<string, unknown>} */ options = {}) => {
      const entry = { handler, options, type };
      windowListeners.push(entry);
      const signal = /** @type {AbortSignal | undefined} */ (options.signal);
      signal?.addEventListener("abort", () => {
        const at = windowListeners.indexOf(entry);
        if (at !== -1) windowListeners.splice(at, 1);
      });
    },
    matchMedia: (/** @type {string} */ query) => {
      mediaQueries.push(query);
      return { matches, query };
    },
  };
  // The file ends `}(window))`, so the real global must be shadowed by the parameter too.
  new Function("window", "document", "Node", "HTMLElement", source)(
    windowDouble, documentDouble, FakeNode, FakeElement);
  return {
    document: documentDouble,
    documentListeners,
    mediaQueries,
    overlayHost: /** @type {Record<string, Function>} */ (windowDouble.LongtailForge.overlayHost),
    window: windowDouble,
    windowListeners,
  };
}

/** A host with one panel-and-trigger pair, wired into the fake document. */
/**
 * @param {ReturnType<typeof loadOverlayHost>} harness
 * @param {{ focusables?: number, name?: string, title?: string }} [options]
 */
function overlayFixture(harness, { focusables = 1, name = "filters", title = "Filters" } = {}) {
  const host = new FakeElement("div", { rect: { bottom: 60, height: 600, left: 0, top: 0, width: 900 } });
  const panel = new FakeElement("div");
  const trigger = new FakeElement("button", { rect: { bottom: 40, height: 24, left: 120, top: 16, width: 96 } });
  for (let index = 0; index < focusables; index += 1) {
    const button = new FakeElement("button", { matches: "button:not([disabled])" });
    button.ownerDocument = harness.document;
    panel.children.push(button);
  }
  for (const element of [host, panel, trigger]) element.ownerDocument = harness.document;
  host.children.push(panel, trigger);
  return { host, name, panel, title, trigger };
}

/**
 * @param {ReturnType<typeof loadOverlayHost>} harness @param {string} type
 * @param {Record<string, unknown>} event
 */
const fire = (harness, type, event) => {
  for (const listener of [...harness.documentListeners]) {
    if (listener.type === type) listener.handler(event);
  }
};

describe("the published hook", () => {
  it("publishes exactly one method, on a plain mutable object", () => {
    const { overlayHost } = loadOverlayHost();
    assert.deepEqual(Object.keys(overlayHost), ["create"]);
    assert.equal(typeof overlayHost.create, "function");
    assert.equal(Object.isFrozen(overlayHost), false, "the hook has never been frozen and is not now");
  });

  it("refuses a missing or non-element host, as it always did", () => {
    const { overlayHost } = loadOverlayHost();
    for (const options of [undefined, {}, { host: null }, { host: { nodeType: 3 } }]) {
      assert.throws(() => overlayHost.create(options), /^Error: Overlay host requires a host element\.$/);
    }
  });

  it("marks the host once and answers a controller with three methods", () => {
    const harness = loadOverlayHost();
    const { host } = overlayFixture(harness);
    const controller = harness.overlayHost.create({ host });

    assert.deepEqual(Object.keys(controller).sort(), ["closeAll", "register", "toggle"]);
    assert.equal(host.classList.contains("surface-overlay-host"), true);
  });
});

describe("controller identity and shared per-host state", () => {
  it("answers a new controller each call, over the same registry", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const first = harness.overlayHost.create({ host: fixture.host });
    const second = harness.overlayHost.create({ host: fixture.host });

    assert.notEqual(first, second, "controller identity is not promised");
    first.register(fixture);
    second.toggle("filters");
    assert.equal(fixture.panel.hidden, false, "the second controller reaches the first's registration");
    first.toggle("filters");
    assert.equal(fixture.panel.hidden, true, "and either one closes it");
  });

  it("keeps different hosts independent", () => {
    const harness = loadOverlayHost();
    const left = overlayFixture(harness, { name: "left" });
    const right = overlayFixture(harness, { name: "right" });
    const leftController = harness.overlayHost.create({ host: left.host });
    const rightController = harness.overlayHost.create({ host: right.host });
    leftController.register(left);
    rightController.register(right);

    leftController.toggle("left");
    rightController.toggle("right");
    assert.equal(left.panel.hidden, false, "one host's overlay is not closed by another host's");
    assert.equal(right.panel.hidden, false);
  });
});

describe("registration", () => {
  it("returns the overlay record and prepares both elements", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const overlay = harness.overlayHost.create({ host: fixture.host }).register(fixture);

    assert.equal(overlay.host, fixture.host, "the record carries the identities it was given");
    assert.equal(overlay.panel, fixture.panel);
    assert.equal(overlay.trigger, fixture.trigger);
    assert.equal(overlay.name, "filters");
    assert.equal(overlay.title, "Filters");
    assert.equal(overlay.previousFocus, null);
    assert.equal(typeof overlay.close, "function");

    assert.equal(fixture.panel.hidden, true);
    assert.equal(fixture.panel.dataset.overlayPanel, "filters");
    assert.equal(fixture.panel.classList.contains("surface-overlay-panel"), true);
    assert.equal(fixture.panel.attributes.role, "dialog");
    assert.equal(fixture.panel.attributes["aria-modal"], "false");
    assert.equal(fixture.panel.attributes.tabindex, "-1");
    assert.equal(fixture.panel.attributes["aria-label"], "Filters");
    assert.equal(fixture.trigger.attributes["aria-haspopup"], "dialog");
    assert.equal(fixture.trigger.attributes["aria-expanded"], "false");
    assert.equal(fixture.trigger.attributes["aria-controls"], fixture.panel.id);
    assert.match(fixture.panel.id, /^overlay-panel-filters-\d+$/);
  });

  it("keeps an existing panel id rather than replacing it", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    fixture.panel.id = "already-here";
    harness.overlayHost.create({ host: fixture.host }).register(fixture);
    assert.equal(fixture.panel.id, "already-here");
    assert.equal(fixture.trigger.attributes["aria-controls"], "already-here");
  });

  it("coerces and trims the name and title, and omits an empty aria-label", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const overlay = harness.overlayHost.create({ host: fixture.host })
      .register({ ...fixture, name: 42, title: "  " });

    assert.equal(overlay.name, "42", "the existing String coercion is preserved");
    assert.equal(overlay.title, "");
    assert.equal("aria-label" in fixture.panel.attributes, false);
  });

  it("refuses a registration missing a name, panel or trigger", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const controller = harness.overlayHost.create({ host: fixture.host });
    for (const options of [undefined, {}, { ...fixture, name: "" }, { ...fixture, panel: null },
      { ...fixture, trigger: null }]) {
      assert.throws(() => controller.register(options),
        /^Error: Overlay registration requires a name, panel, and trigger\.$/);
    }
  });
});

describe("open, toggle and close", () => {
  it("opens on toggle, focusing the first focusable and recording what had focus", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const before = new FakeElement("input");
    before.ownerDocument = harness.document;
    harness.document.activeElement = before;
    const controller = harness.overlayHost.create({ host: fixture.host });
    const overlay = controller.register(fixture);

    controller.toggle("filters");
    assert.equal(overlay.previousFocus, before, "the reference is captured before focus moves");
    assert.equal(fixture.panel.hidden, false);
    assert.equal(fixture.panel.dataset.overlayOpen, "true");
    assert.equal(fixture.trigger.attributes["aria-expanded"], "true");
    assert.equal(fixture.panel.children[0].focusCount, 1);
  });

  it("focuses the panel itself when it has no focusable content", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness, { focusables: 0 });
    const controller = harness.overlayHost.create({ host: fixture.host });
    controller.register(fixture);
    controller.toggle("filters");
    assert.equal(fixture.panel.focusCount, 1);
  });

  it("closes on a second toggle and returns focus", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const before = new FakeElement("input");
    before.ownerDocument = harness.document;
    harness.document.activeElement = before;
    const controller = harness.overlayHost.create({ host: fixture.host });
    controller.register(fixture);

    controller.toggle("filters");
    const focusBeforeClose = before.focusCount;
    controller.toggle("filters");
    assert.equal(fixture.panel.hidden, true);
    assert.equal(fixture.panel.dataset.overlayOpen, "false");
    assert.equal(fixture.trigger.attributes["aria-expanded"], "false");
    assert.equal(before.focusCount, focusBeforeClose + 1, "toggle-close returns focus");
  });

  it("does nothing for an unknown name", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const controller = harness.overlayHost.create({ host: fixture.host });
    controller.register(fixture);
    assert.doesNotThrow(() => controller.toggle("nope"));
    assert.equal(fixture.panel.hidden, true);
    assert.equal(harness.documentListeners.length, 0, "and installs no listeners");
  });

  it("closes the first overlay when a second opens on the same host", () => {
    const harness = loadOverlayHost();
    const host = new FakeElement("div", { rect: { bottom: 60, height: 600, left: 0, top: 0, width: 900 } });
    host.ownerDocument = harness.document;
    const first = overlayFixture(harness, { name: "one" });
    const second = overlayFixture(harness, { name: "two" });
    const controller = harness.overlayHost.create({ host });
    controller.register({ ...first, host });
    controller.register({ ...second, host });

    controller.toggle("one");
    controller.toggle("two");
    assert.equal(first.panel.hidden, true, "the first closed");
    assert.equal(second.panel.hidden, false, "the second is open");
    assert.equal(first.trigger.attributes["aria-expanded"], "false");
  });

  it("closeAll closes the active overlay without returning focus", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const before = new FakeElement("input");
    before.ownerDocument = harness.document;
    harness.document.activeElement = before;
    const controller = harness.overlayHost.create({ host: fixture.host });
    controller.register(fixture);

    controller.toggle("filters");
    const focusBeforeClose = before.focusCount;
    controller.closeAll();
    assert.equal(fixture.panel.hidden, true);
    assert.equal(before.focusCount, focusBeforeClose, "closeAll deliberately does not return focus");
    assert.doesNotThrow(() => controller.closeAll(), "and is a no-op when nothing is open");
  });

  it("the handle's own close returns focus", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const before = new FakeElement("input");
    before.ownerDocument = harness.document;
    harness.document.activeElement = before;
    const controller = harness.overlayHost.create({ host: fixture.host });
    const overlay = controller.register(fixture);

    controller.toggle("filters");
    const focusBeforeClose = before.focusCount;
    overlay.close();
    assert.equal(fixture.panel.hidden, true);
    assert.equal(before.focusCount, focusBeforeClose + 1);
  });

  it("does not return focus to something that cannot be focused", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const bare = new FakeNode();
    harness.document.activeElement = bare;
    const controller = harness.overlayHost.create({ host: fixture.host });
    const overlay = controller.register(fixture);

    controller.toggle("filters");
    assert.equal(overlay.previousFocus, bare);
    assert.doesNotThrow(() => overlay.close(), "an unfocusable previous target is skipped, not called");
  });
});

describe("keyboard, pointer and listener lifecycle", () => {
  it("installs its listeners on open and removes them on close", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const controller = harness.overlayHost.create({ host: fixture.host });
    const overlay = controller.register(fixture);

    assert.equal(harness.documentListeners.length, 0);
    controller.toggle("filters");
    assert.deepEqual(harness.documentListeners.map((entry) => entry.type).sort(), ["keydown", "pointerdown"]);
    assert.equal(harness.windowListeners.filter((entry) => entry.type === "resize").length, 1);
    const pointerListener = harness.documentListeners.find((entry) => entry.type === "pointerdown");
    assert.ok(pointerListener, "the outside-click listener is installed");
    assert.equal(pointerListener.options.capture, true, "the outside-click listener still captures");
    assert.ok(overlay.abortController instanceof globalThis.AbortController);

    controller.toggle("filters");
    assert.equal(harness.documentListeners.length, 0, "the abort signal removed them");
    assert.equal(harness.windowListeners.filter((entry) => entry.type === "resize").length, 0);
    assert.equal(overlay.abortController, null, "and the slot is cleared");
  });

  it("closes on Escape and returns focus", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const before = new FakeElement("input");
    before.ownerDocument = harness.document;
    harness.document.activeElement = before;
    const controller = harness.overlayHost.create({ host: fixture.host });
    controller.register(fixture);
    controller.toggle("filters");

    const focusBeforeClose = before.focusCount;
    let prevented = 0;
    fire(harness, "keydown", { key: "Escape", preventDefault: () => { prevented += 1; } });
    assert.equal(fixture.panel.hidden, true);
    assert.equal(prevented, 1);
    assert.equal(before.focusCount, focusBeforeClose + 1, "Escape returns focus");
  });

  it("wraps focus at both ends on Tab", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness, { focusables: 2 });
    const controller = harness.overlayHost.create({ host: fixture.host });
    controller.register(fixture);
    controller.toggle("filters");
    const [first, last] = fixture.panel.children;

    harness.document.activeElement = last;
    fire(harness, "keydown", { key: "Tab", preventDefault: () => {}, shiftKey: false });
    assert.equal(first.focusCount >= 1, true, "forward from the last wraps to the first");

    harness.document.activeElement = first;
    const lastFocus = last.focusCount;
    fire(harness, "keydown", { key: "Tab", preventDefault: () => {}, shiftKey: true });
    assert.equal(last.focusCount, lastFocus + 1, "backward from the first wraps to the last");
  });

  it("holds focus on the panel when there is nothing focusable to trap", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness, { focusables: 0 });
    const controller = harness.overlayHost.create({ host: fixture.host });
    controller.register(fixture);
    controller.toggle("filters");

    const panelFocus = fixture.panel.focusCount;
    let prevented = 0;
    fire(harness, "keydown", { key: "Tab", preventDefault: () => { prevented += 1; }, shiftKey: false });
    assert.equal(prevented, 1);
    assert.equal(fixture.panel.focusCount, panelFocus + 1);
  });

  it("ignores a pointer inside the panel or the trigger, and closes on one outside", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const before = new FakeElement("input");
    before.ownerDocument = harness.document;
    harness.document.activeElement = before;
    const controller = harness.overlayHost.create({ host: fixture.host });
    controller.register(fixture);
    controller.toggle("filters");

    fire(harness, "pointerdown", { target: fixture.panel.children[0] });
    assert.equal(fixture.panel.hidden, false, "a pointer inside the panel keeps it open");
    fire(harness, "pointerdown", { target: fixture.trigger });
    assert.equal(fixture.panel.hidden, false, "and so does one on the trigger");

    const focusBeforeClose = before.focusCount;
    fire(harness, "pointerdown", { target: new FakeElement("div") });
    assert.equal(fixture.panel.hidden, true, "a pointer outside closes it");
    assert.equal(before.focusCount, focusBeforeClose, "click-away deliberately does not return focus");
  });

  it("closes for a pointer target that is not a node at all", () => {
    const harness = loadOverlayHost();
    const fixture = overlayFixture(harness);
    const controller = harness.overlayHost.create({ host: fixture.host });
    controller.register(fixture);
    controller.toggle("filters");

    fire(harness, "pointerdown", { target: null });
    assert.equal(fixture.panel.hidden, true, "a non-node target was outside before and still is");
  });
});

describe("positioning", () => {
  it("anchors to the trigger on a desktop viewport", () => {
    const harness = loadOverlayHost({ matches: false });
    const fixture = overlayFixture(harness);
    const controller = harness.overlayHost.create({ host: fixture.host });
    controller.register(fixture);
    controller.toggle("filters");

    assert.equal(fixture.panel.classList.contains("surface-overlay-panel--bottom-sheet"), false);
    assert.equal(fixture.panel.properties["--overlay-anchor-left"], "120px");
    assert.equal(fixture.panel.properties["--overlay-anchor-top"], "48px");
    assert.equal(fixture.panel.properties["--overlay-anchor-width"], "280px",
      "the 280px minimum still applies to a narrow trigger");
  });

  it("becomes a bottom sheet below the existing 700px breakpoint", () => {
    const harness = loadOverlayHost({ matches: true });
    const fixture = overlayFixture(harness);
    const controller = harness.overlayHost.create({ host: fixture.host });
    controller.register(fixture);
    controller.toggle("filters");

    assert.equal(fixture.panel.classList.contains("surface-overlay-panel--bottom-sheet"), true);
    assert.deepEqual(fixture.panel.properties, {}, "and drops the anchor variables");
    assert.deepEqual([...new Set(harness.mediaQueries)], ["(max-width: 700px)"],
      "the existing 700px breakpoint is the one that was asked about");
  });

  it("repositions on resize and clears everything on close", () => {
    const harness = loadOverlayHost({ matches: false });
    const fixture = overlayFixture(harness);
    const controller = harness.overlayHost.create({ host: fixture.host });
    controller.register(fixture);
    controller.toggle("filters");

    fixture.trigger.rect = { bottom: 90, height: 24, left: 400, top: 66, width: 500 };
    for (const listener of harness.windowListeners) {
      if (listener.type === "resize") listener.handler();
    }
    assert.equal(fixture.panel.properties["--overlay-anchor-left"], "400px");
    assert.equal(fixture.panel.properties["--overlay-anchor-width"], "500px");

    controller.toggle("filters");
    assert.deepEqual(fixture.panel.properties, {}, "close removes the anchor variables");
    assert.equal(fixture.panel.classList.contains("surface-overlay-panel--bottom-sheet"), false);
  });

  it("keeps the panel inside the host when the trigger sits at the right edge", () => {
    const harness = loadOverlayHost({ matches: false });
    const fixture = overlayFixture(harness);
    fixture.trigger.rect = { bottom: 40, height: 24, left: 880, top: 16, width: 96 };
    const controller = harness.overlayHost.create({ host: fixture.host });
    controller.register(fixture);
    controller.toggle("filters");

    assert.equal(fixture.panel.properties["--overlay-anchor-left"], "468px",
      "clamped to the host width less the panel width");
  });
});
