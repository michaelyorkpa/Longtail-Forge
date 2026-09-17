import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();
const builderSource = readText("public/js/shared/view-builder.js");
const modalStackSource = readText("public/js/shared/view-modal-stack.js");

/**
 * The detail and action surface: the action button every other builder reaches for its controls,
 * the action strip and menu, the badges, the detail header and the info panel.
 *
 * The cases below cover the reads the new declarations describe and the executable lines the
 * checkpoint changed - five element writes now coerced the way their native setters do, and two
 * opaque list entries now read through a proof that **keeps the throw** a nullish entry got.
 */

/** @typedef {Record<string, unknown>} Bag */

function view() {
  const context = createFakeBrowserContext();
  vm.runInNewContext(modalStackSource, context, { filename: "view-modal-stack.js" });
  vm.runInNewContext(builderSource, context, { filename: "view-builder.js" });
  const factory = context.window.LongtailForge.view;
  assert.ok(factory, "the builder should publish LongtailForge.view");
  return /** @type {Record<string, (...args: unknown[]) => Bag>} */ (factory);
}

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

/** @param {unknown} node @param {string} name */
function attr(node, name) {
  assert.ok(isBag(node), "an element should be a record");
  const getAttribute = node.getAttribute;
  assert.ok(isCallable(getAttribute), "an element should expose getAttribute");
  return Reflect.apply(getAttribute, node, [name]);
}

/** @param {unknown} node @param {Record<string, unknown>} event */
function fire(node, event) {
  assert.ok(isBag(node), "an element should be a record");
  const dispatchEvent = node.dispatchEvent;
  assert.ok(isCallable(dispatchEvent), "an element should expose dispatchEvent");
  return Reflect.apply(dispatchEvent, node, [event]);
}

/** @param {unknown} node @param {string} className @returns {Bag[]} */
function byClass(node, className) {
  /** @type {Bag[]} */
  const found = [];
  /** @param {unknown} current */
  const walk = (current) => {
    if (!isBag(current)) return;
    const classList = current.classList;
    if (isBag(classList)) {
      const contains = Reflect.get(classList, "contains");
      if (isCallable(contains) && Reflect.apply(contains, classList, [className])) found.push(current);
    }
    const children = current.children;
    if (Array.isArray(children)) children.forEach(walk);
  };
  walk(node);
  return found;
}

/** @param {unknown} node @returns {Bag[]} */
function childrenOf(node) {
  assert.ok(isBag(node));
  const children = node.children;
  assert.ok(Array.isArray(children), "the element should carry a child list");
  return children;
}

/** @param {unknown} node @returns {Record<string, unknown>} */
function datasetOf(node) {
  assert.ok(isBag(node));
  const dataset = node.dataset;
  assert.ok(isBag(dataset), "the element should carry a dataset");
  return dataset;
}

describe("The action button every builder reaches for", () => {
  it("refuses a button with neither visible text nor an accessible label", () => {
    const factory = view();
    assert.throws(() => factory.createActionButton({}), /require visible text or an accessible label/);
    assert.throws(() => factory.createActionButton({ label: "   " }), /require visible text or an accessible label/);
  });

  it("takes its label from three spellings and shows it as text when there is none", () => {
    const factory = view();
    assert.equal(factory.createActionButton({ label: "Save" }).textContent, "Save");
    assert.equal(factory.createActionButton({ ariaLabel: "Close" }).textContent, "Close");
    assert.equal(factory.createActionButton({ text: "Apply" }).textContent, "Apply");
  });

  /**
   * The plain path shows `text || label`, so a button asking for no text still renders its label
   * and *also* gets the accessible name and title. Only the icon path, which delegates to
   * `icons.createIconButton`, produces a genuinely text-free control.
   */
  it("names and titles a button that asked for no text, and still shows its label", () => {
    const button = view().createActionButton({ label: "Remove", text: "" });
    assert.equal(button.textContent, "Remove");
    assert.equal(attr(button, "aria-label"), "Remove");
    assert.equal(button.title, "Remove", "and titles it from the same label");
  });

  it("prefers an explicit title over the label", () => {
    const button = view().createActionButton({ label: "Remove", text: "", title: "Remove this row" });
    assert.equal(button.title, "Remove this row");
  });

  it("defaults its type, disables on request, and carries its classes", () => {
    const factory = view();
    assert.equal(factory.createActionButton({ label: "Save" }).type, "button");
    assert.equal(factory.createActionButton({ label: "Save", type: "submit" }).type, "submit");
    assert.equal(factory.createActionButton({ label: "Save", disabled: true }).disabled, true);
    assert.equal(factory.createActionButton({ label: "Save", disabled: false }).disabled, false);
    const classed = factory.createActionButton({ label: "Save", className: "extra" });
    assert.equal(byClass(classed, "view-action-button").length, 1);
    assert.equal(byClass(classed, "extra").length, 1);
  });

  /**
   * The published options take these as `unknown`, so a caller may identify an action or title
   * numerically. The native `dataset` and `title` setters coerce; the checkpoint spells that out,
   * and these are the cases that distinguish the two.
   */
  it("writes a numeric title as text, the way the native setter would", () => {
    const button = view().createActionButton({ label: "Save", title: 7 });
    assert.equal(button.title, "7");
    assert.equal(typeof button.title, "string", "text, not the number it arrived as");
  });

  it("writes its action and role as text, including a numeric action", () => {
    const factory = view();
    assert.equal(datasetOf(factory.createActionButton({ label: "Save", action: "save-task" })).surfaceAction, "save-task");
    const numeric = factory.createActionButton({ label: "Save", action: 7 });
    assert.equal(datasetOf(numeric).surfaceAction, "7");
    assert.equal(typeof datasetOf(numeric).surfaceAction, "string", "text, not the number it arrived as");
    assert.equal(datasetOf(factory.createActionButton({ label: "S", action: "a", role: "primary" })).surfaceActionRole, "primary");
    assert.equal(datasetOf(factory.createActionButton({ label: "S", action: "a", actionRole: "danger" })).surfaceActionRole, "danger");
    assert.equal(datasetOf(factory.createActionButton({ label: "S" })).surfaceAction, undefined, "and writes nothing without an action");
  });

  it("wires a click handler, and ignores one that is not callable", () => {
    const factory = view();
    /** @type {number[]} */
    const clicks = [];
    const wired = factory.createActionButton({ label: "Save", onClick: () => clicks.push(1) });
    fire(wired, { type: "click" });
    assert.deepEqual(clicks, [1]);
    const unwired = factory.createActionButton({ label: "Save", onClick: "not callable" });
    assert.doesNotThrow(() => fire(unwired, { type: "click" }));
  });
});

describe("How a list of actions is normalized", () => {
  it("passes an existing node through and builds anything else", () => {
    const factory = view();
    const own = factory.createElement("a", { text: "Link" });
    const strip = factory.createDetailActionStrip({ actions: [own, { label: "Save" }] });
    const items = childrenOf(strip);
    assert.equal(items[0], own, "the caller's node by identity");
    assert.equal(items[1].tagName, "BUTTON");
  });

  it("wraps a lone action and answers nothing for an absent list", () => {
    const factory = view();
    assert.equal(childrenOf(factory.createDetailActionStrip({ actions: { label: "Save" } })).length, 1);
    for (const actions of [undefined, null, false, 0, ""]) {
      assert.equal(childrenOf(factory.createDetailActionStrip({ actions })).length, 0, `actions: ${String(actions)}`);
    }
  });
});

describe("The detail badges", () => {
  /** @param {unknown} badges */
  const badgeRow = (badges) => view().createDetailBadgeRow({ badges });

  it("joins a label and a value, and shows either one alone", () => {
    assert.equal(childrenOf(badgeRow([{ label: "Status", value: "Open" }]))[0].textContent, "Status: Open");
    assert.equal(childrenOf(badgeRow([{ label: "Overdue" }]))[0].textContent, "Overdue");
    assert.equal(childrenOf(badgeRow([{ value: "Open" }]))[0].textContent, "Open");
    assert.equal(childrenOf(badgeRow([{ label: "Status", value: "Open", text: "Custom" }]))[0].textContent, "Custom",
      "an explicit text wins over both");
  });

  it("titles a badge from its text unless it is given one", () => {
    assert.equal(attr(childrenOf(badgeRow([{ label: "Open" }]))[0], "title"), "Open");
    assert.equal(attr(childrenOf(badgeRow([{ label: "Open", title: "Still open" }]))[0], "title"), "Still open");
    assert.equal(attr(childrenOf(badgeRow([{ text: "" }]))[0], "title"), null, "and titles nothing when there is no text");
  });

  it("makes a badge focusable only when asked, and carries its own attributes", () => {
    assert.equal(attr(childrenOf(badgeRow([{ label: "A" }]))[0], "tabindex"), null);
    assert.equal(attr(childrenOf(badgeRow([{ label: "A", focusable: true }]))[0], "tabindex"), "0");
    const custom = childrenOf(badgeRow([{ label: "A", attrs: { "data-kind": "risk" }, dataset: { badgeId: "b1" } }]))[0];
    assert.equal(attr(custom, "data-kind"), "risk");
    assert.equal(datasetOf(custom).badgeId, "b1");
  });

  it("passes a node through, renders a primitive as a chip, and drops the four empty values", () => {
    const factory = view();
    const own = factory.createElement("span", { text: "Mine" });
    const row = factory.createDetailBadgeRow({ badges: [own, "Plain", null, undefined, false, ""] });
    const items = childrenOf(row);
    assert.equal(items.length, 2);
    assert.equal(items[0], own);
    assert.equal(items[1].textContent, "Plain");
  });

  it("accepts its badges under either spelling", () => {
    assert.equal(childrenOf(view().createDetailBadgeRow({ items: [{ label: "A" }] })).length, 1);
  });
});

describe("The detail header", () => {
  it("requires a title, by name", () => {
    assert.throws(() => view().createDetailHeader({}), /Detail headers require a title/);
    assert.throws(() => view().createDetailHeader({ title: "  " }), /Detail headers require a title/);
  });

  it("renders its meta line and badge row only when it has them", () => {
    const factory = view();
    const bare = factory.createDetailHeader({ title: "Task" });
    assert.equal(byClass(bare, "view-detail-meta").length, 0);
    assert.equal(byClass(bare, "view-detail-badges").length, 0);
    const full = factory.createDetailHeader({ title: "Task", meta: "Updated today", badges: [{ label: "Open" }] });
    assert.equal(byClass(full, "view-detail-meta")[0].textContent, "Updated today");
    assert.equal(childrenOf(byClass(full, "view-detail-badges")[0]).length, 1);
  });
});

describe("The detail action menu", () => {
  it("floats by default and marks itself for the stylesheet", () => {
    const factory = view();
    assert.equal(attr(factory.createDetailActionMenu({}), "data-view-floating-menu"), "");
    assert.equal(attr(factory.createDetailActionMenu({ floating: false }), "data-view-floating-menu"), null);
    assert.equal(attr(factory.createDetailActionMenu({ floating: 0 }), "data-view-floating-menu"), "",
      "only an explicit false turns it off");
  });

  it("summarizes with an ellipsis until it is given a label, and titles from three spellings", () => {
    const factory = view();
    assert.equal(byClass(factory.createDetailActionMenu({}), "view-detail-action-menu-summary")[0].textContent, "...");
    const named = factory.createDetailActionMenu({ summaryLabel: "More" });
    assert.equal(byClass(named, "view-detail-action-menu-summary")[0].textContent, "More");
    assert.equal(attr(byClass(factory.createDetailActionMenu({ title: "T" }), "view-detail-action-menu-summary")[0], "title"), "T");
    assert.equal(attr(byClass(factory.createDetailActionMenu({ ariaLabel: "A" }), "view-detail-action-menu-summary")[0], "title"), "A");
    assert.equal(attr(byClass(factory.createDetailActionMenu({}), "view-detail-action-menu-summary")[0], "title"), "Actions");
  });

  it("puts its actions in the list rather than the summary", () => {
    const menu = view().createDetailActionMenu({ actions: [{ label: "Delete" }] });
    assert.equal(childrenOf(byClass(menu, "view-detail-action-menu-list")[0]).length, 1);
  });
});

describe("The info panel", () => {
  it("is a section unless it is collapsible, and opens only when both are asked for", () => {
    const factory = view();
    assert.equal(factory.createInfoPanel({}).tagName, "SECTION");
    assert.equal(factory.createInfoPanel({ collapsible: true }).tagName, "DETAILS");
    assert.equal(factory.createInfoPanel({ collapsible: true, open: true }).open, true);
    assert.equal(factory.createInfoPanel({ collapsible: true }).open, false);
  });

  it("titles a collapsible panel with a summary and a plain one with a heading", () => {
    const factory = view();
    const collapsible = factory.createInfoPanel({ collapsible: true, title: "Details" });
    assert.equal(childrenOf(collapsible)[0].tagName, "SUMMARY");
    const plain = factory.createInfoPanel({ title: "Details" });
    assert.equal(childrenOf(plain)[0].tagName, "H3");
  });

  it("renders its message, its list and its actions only when it has them", () => {
    const factory = view();
    const bare = factory.createInfoPanel({});
    assert.equal(byClass(bare, "view-info-panel-message").length, 0);
    assert.equal(byClass(bare, "view-info-list").length, 0);
    assert.equal(byClass(bare, "view-info-panel-actions").length, 0);
    const full = factory.createInfoPanel({
      message: "Nothing to do",
      items: [{ label: "Owner", value: "Ada" }],
      actions: [{ label: "Refresh" }],
    });
    assert.equal(byClass(full, "view-info-panel-message")[0].textContent, "Nothing to do");
    const list = byClass(full, "view-info-list")[0];
    assert.equal(childrenOf(list)[0].textContent, "Owner");
    assert.equal(byClass(full, "view-info-panel-actions").length, 1);
    assert.equal(byClass(factory.createInfoPanel({ items: [] }), "view-info-list").length, 0, "an empty list renders nothing");
  });

  /**
   * The proof the checkpoint reads entries through keeps the throw the member access gave. A
   * caller with a hole in its list still gets a `TypeError` rather than a quietly empty row.
   */
  it("still refuses a hole in its item list rather than rendering an empty row", () => {
    // The error is constructed inside the vm, so neither its prototype nor the vm's `Error` is
    // this realm's - the name and the message are what carry across.
    for (const items of [[null], [{ label: "Owner" }, undefined]]) {
      assert.throws(() => view().createInfoPanel({ items }), (error) => {
        assert.ok(isBag(error), "a thrown error should be an object");
        assert.equal(error.name, "TypeError");
        assert.match(String(error.message), /info panel items must be readable/);
        return true;
      }, `items: ${JSON.stringify(items)}`);
    }
  });

  it("reads a primitive entry as a record with no members, which is what it always did", () => {
    const list = byClass(view().createInfoPanel({ items: ["plain"] }), "view-info-list")[0];
    assert.equal(childrenOf(list)[0].textContent, "", "no label");
  });
});

describe("The inline action row", () => {
  it("puts the caller's children before the actions it builds", () => {
    const factory = view();
    const own = factory.createElement("span", { text: "Label" });
    const row = factory.createInlineActionRow({ children: [own], actions: [{ label: "Go" }] });
    const items = childrenOf(row);
    assert.equal(items[0], own);
    assert.equal(items[1].tagName, "BUTTON");
  });
});
