import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/modal.js");

/**
 * The confirm and alert dialogs, through the shipped module.
 *
 * `0.33.33.39.47` typed this file and closed the three `dom` diagnostics on `Element.focus`.
 * Two elements are focused here and they were never guarded alike: the trigger carried its own
 * capability check, and the dialog's own focus target did not. Nothing had executed this file -
 * both owners read it as source text - so these cases hold what the dialogs actually do.
 */

/** @typedef {Record<string, unknown>} Bag */

/**
 * One node of the fake document, carrying exactly what the dialog writer touches.
 *
 * @typedef {{
 *   tag: string,
 *   attrs: Record<string, string>,
 *   dataset: Record<string, string>,
 *   children: FakeElement[],
 *   listeners: Record<string, Function[]>,
 *   className: string,
 *   textContent: string,
 *   type: string,
 *   focusCount: number,
 *   removed: boolean,
 *   closedWith: string | null,
 *   modalOpened: boolean,
 *   focus?: () => void,
 *   remove: () => void,
 *   close: (value: string) => void,
 *   showModal?: () => void,
 *   setAttribute: (key: string, value: string) => void,
 *   append: (...nodes: FakeElement[]) => void,
 *   appendChild: (child: FakeElement) => FakeElement,
 *   addEventListener: (name: string, run: Function) => void,
 *   querySelector: (selector: string) => FakeElement | null,
 * }} FakeElement
 */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/**
 * @param {string} tag
 * @param {Partial<FakeElement>} [extra]
 * @returns {FakeElement}
 */
function element(tag, extra = {}) {
  /** @type {Record<string, Function[]>} */
  const listeners = {};
  /** @type {FakeElement[]} */
  const children = [];
  /** @type {Record<string, string>} */
  const attrs = {};
  /** @type {Record<string, string>} */
  const dataset = {};
  /** @type {FakeElement} */
  const node = {
    tag,
    attrs,
    dataset,
    children,
    listeners,
    className: "",
    textContent: "",
    type: "",
    focusCount: 0,
    removed: false,
    closedWith: null,
    modalOpened: false,
    focus: () => { node.focusCount += 1; },
    remove: () => { node.removed = true; },
    /** @param {string} value */
    close: (value) => {
      node.closedWith = value;
      (listeners.close || []).forEach((run) => run({}));
    },
    showModal: () => { node.modalOpened = true; },
    /** @param {string} key @param {string} value */
    setAttribute: (key, value) => { attrs[key] = value; },
    /** @param {FakeElement[]} nodes */
    append: (...nodes) => { children.push(...nodes); },
    /** @param {FakeElement} child */
    appendChild: (child) => { children.push(child); return child; },
    /** @param {string} name @param {Function} run */
    addEventListener: (name, run) => {
      listeners[name] = listeners[name] || [];
      listeners[name].push(run);
    },
    /** @param {string} selector */
    querySelector: (selector) => {
      /** @param {FakeElement} node2 @returns {FakeElement | null} */
      const walk = (node2) => {
        for (const child of node2.children) {
          const matches = selector === "[data-autofocus]"
            ? Object.hasOwn(child.dataset, "autofocus")
            : child.tag === selector;
          if (matches) return child;
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk(node);
    },
    ...extra,
  };
  return node;
}

/** @param {{ trigger?: FakeElement | null }} [context] */
function modal(context = {}) {
  /** @type {FakeElement[]} */
  const created = [];
  const body = element("body");
  const document = {
    body,
    activeElement: context.trigger === undefined ? element("button") : context.trigger,
    /** @param {string} tag */
    createElement: (tag) => {
      const node = element(tag);
      created.push(node);
      return node;
    },
  };
  /** @type {Bag} */
  const window = { LongtailForge: {} };
  vm.runInNewContext(source, { window, document }, { filename: "modal.js" });
  const namespace = window.LongtailForge;
  assert.ok(isBag(namespace));
  const api = namespace.modal;
  assert.ok(isBag(api));
  /** @param {string} name */
  const member = (name) => {
    const fn = api[name];
    assert.equal(typeof fn, "function", `${name} is published`);
    /** @param {unknown[]} args */
    return (...args) => Reflect.apply(/** @type {Function} */ (fn), api, args);
  };
  const dialog = () => {
    const found = created.find((node) => node.tag === "dialog");
    assert.ok(found, "a dialog was created");
    return found;
  };
  const buttons = () => created.filter((node) => node.tag === "button");
  return { api, member, dialog, buttons, body, document, activeElement: document.activeElement };
}

/** @param {FakeElement} dialog @param {string} name @param {unknown} event */
function fire(dialog, name, event) {
  (dialog.listeners[name] || []).forEach((run) => run(event));
}

describe("the confirm dialog", () => {
  it("offers cancel then confirm, and resolves true through confirm", async () => {
    const context = modal();
    const pending = context.member("confirm")({});
    const buttons = context.buttons();
    assert.deepEqual(buttons.map((button) => button.textContent), ["Cancel", "Continue"],
      "cancel is offered first, and both carry their default labels");

    fire(buttons[1], "click", {});
    assert.equal(await pending, true);
  });

  it("resolves false through cancel, and through Escape", async () => {
    const cancelled = modal();
    const byButton = cancelled.member("confirm")({});
    fire(cancelled.buttons()[0], "click", {});
    assert.equal(await byButton, false);

    const escaped = modal();
    const byKey = escaped.member("confirm")({});
    /** @type {unknown[]} */
    const prevented = [];
    fire(escaped.dialog(), "keydown", { key: "Escape", preventDefault: () => prevented.push(1) });
    assert.equal(await byKey, false);
    assert.equal(prevented.length, 1, "Escape is taken rather than left to the platform");
  });

  it("ignores a key that is not Escape", async () => {
    const context = modal();
    const pending = context.member("confirm")({});
    fire(context.dialog(), "keydown", { key: "Enter", preventDefault: () => {} });
    assert.equal(context.dialog().closedWith, null, "the dialog is still open");
    fire(context.buttons()[1], "click", {});
    assert.equal(await pending, true);
  });

  it("resolves false when the dialog is cancelled by the platform", async () => {
    const context = modal();
    const pending = context.member("confirm")({});
    /** @type {unknown[]} */
    const prevented = [];
    fire(context.dialog(), "cancel", { preventDefault: () => prevented.push(1) });
    assert.equal(await pending, false);
    assert.equal(prevented.length, 1);
  });

  it("takes the labels and the danger styling it was given", async () => {
    const context = modal();
    const pending = context.member("confirm")({
      title: "Delete list", message: "This cannot be undone.",
      confirmLabel: "Delete", cancelLabel: "Keep", danger: true,
    });
    const buttons = context.buttons();
    assert.deepEqual(buttons.map((button) => button.textContent), ["Keep", "Delete"]);
    assert.equal(buttons[1].className, "danger-action", "only the confirm action is destructive");
    assert.equal(buttons[0].className, "");
    fire(buttons[0], "click", {});
    await pending;
  });

  it("autofocuses cancel, which is the safe choice for a confirmation", async () => {
    const context = modal();
    const pending = context.member("confirm")({});
    const buttons = context.buttons();
    assert.ok(Object.hasOwn(buttons[0].dataset, "autofocus"), "cancel is the marked button");
    assert.equal(buttons[0].focusCount, 1, "and it is the one focused");
    assert.equal(buttons[1].focusCount, 0);
    fire(buttons[0], "click", {});
    await pending;
  });
});

describe("the alert dialog", () => {
  it("offers one button and resolves true through it", async () => {
    const context = modal();
    const pending = context.member("alert")({});
    const buttons = context.buttons();
    assert.deepEqual(buttons.map((button) => button.textContent), ["OK"]);
    fire(buttons[0], "click", {});
    assert.equal(await pending, true);
  });

  it("takes the confirm label it was given", async () => {
    const context = modal();
    const pending = context.member("alert")({ confirmLabel: "Got it" });
    assert.equal(context.buttons()[0].textContent, "Got it");
    fire(context.buttons()[0], "click", {});
    await pending;
  });
});

describe("the dialog's own lifecycle", () => {
  it("opens modally, and removes itself when it closes", async () => {
    const context = modal();
    const pending = context.member("confirm")({});
    const dialog = context.dialog();
    assert.equal(dialog.modalOpened, true);
    assert.equal(dialog.removed, false);

    fire(context.buttons()[1], "click", {});
    await pending;
    assert.equal(dialog.removed, true, "the dialog does not outlive its answer");
    assert.equal(dialog.closedWith, "true", "the resolved value reaches close as its own text");
  });

  it("falls back to the open attribute where showModal is unavailable", async () => {
    const context = modal();
    /** @type {FakeElement[]} */
    const built = [];
    const originalCreate = context.document.createElement;
    context.document.createElement = (/** @type {string} */ tag) => {
      const node = originalCreate(tag);
      if (tag === "dialog") {
        Reflect.deleteProperty(node, "showModal");
        built.push(node);
      }
      return node;
    };
    const pending = context.member("confirm")({});
    assert.equal(built[0].attrs.open, "", "the dialog is opened by attribute instead");
    fire(context.buttons()[0], "click", {});
    await pending;
  });

  it("returns focus to whatever held it, and does not require that it can take it back", async () => {
    const trigger = element("button");
    const focused = modal({ trigger });
    const pending = focused.member("confirm")({});
    fire(focused.buttons()[1], "click", {});
    await pending;
    assert.equal(trigger.focusCount, 1, "the trigger took focus back");

    // `document.activeElement` answers an `Element`, and focusing is not every element's. A
    // trigger that cannot take it has always been skipped rather than failing.
    const bare = element("svg");
    Reflect.deleteProperty(bare, "focus");
    const unfocusable = modal({ trigger: bare });
    const second = unfocusable.member("confirm")({});
    fire(unfocusable.buttons()[1], "click", {});
    assert.equal(await second, true, "closing still resolves");
    assert.equal(bare.focusCount, 0);

    // A member that is present but not callable is refused for the same reason: what the
    // check asks is whether it can be called, not whether it is there.
    const notCallable = element("svg");
    Reflect.set(notCallable, "focus", "not a function");
    const refused = modal({ trigger: notCallable });
    const third = refused.member("confirm")({});
    fire(refused.buttons()[1], "click", {});
    assert.equal(await third, true, "an uncallable focus member is skipped, not called");
  });

  it("fails where a focus target that cannot take focus always failed", async () => {
    // The trigger is guarded; the dialog's own focus target never was. It was focused outright,
    // so an element that could not take focus rejected the dialog's promise there - and still
    // does, named rather than anonymous. No dialog this module builds can reach it, because the
    // only things it queries for are the buttons it just created.
    const context = modal();
    const originalCreate = context.document.createElement;
    context.document.createElement = (/** @type {string} */ tag) => {
      const node = originalCreate(tag);
      if (tag === "dialog") {
        const stranded = element("svg");
        Reflect.deleteProperty(stranded, "focus");
        node.querySelector = () => stranded;
      }
      return node;
    };
    await assert.rejects(context.member("confirm")({}), { name: "TypeError" });
  });

  it("resolves even when nothing held focus", async () => {
    const context = modal({ trigger: null });
    const pending = context.member("confirm")({});
    fire(context.buttons()[1], "click", {});
    assert.equal(await pending, true);
  });
});
