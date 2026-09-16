import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();
const builderSource = readText("public/js/shared/view-builder.js");
const modalStackSource = readText("public/js/shared/view-modal-stack.js");

/**
 * The list and index surface, and the one declaration `0.33.33.39.14` had to correct.
 *
 * `createListShell` builds its status region only for `options.status !== false` and has always
 * attached `null` otherwise, while `BrowserViewListShellParts.status` was declared non-nullable.
 * **Unlike the modal footer, this absence is on a path the running application takes**: six
 * production call sites pass `status: false`. The cases below assert which outcome the writer
 * produces, and that those call sites still ask for it.
 *
 * The rest covers the reads the new parameter declarations describe - the toolbar's parts and
 * count, the index panel's open default and conditional footer, and the row builder's chip and
 * meta filtering, hierarchy metadata and selection wiring.
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

/** @param {Bag} node @returns {Bag} */
function parts(node) {
  const value = node.viewParts;
  assert.ok(isBag(value), "the element should carry a viewParts record");
  return value;
}

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

/** An element's attribute, read through its own accessor. @param {unknown} node @param {string} name */
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

/** Descendants carrying a class, however deep. @param {unknown} node @param {string} className */
function byClass(node, className) {
  /** @type {Bag[]} */
  const found = [];
  /** @param {unknown} current */
  const walk = (current) => {
    if (!isBag(current)) return;
    const classList = current.classList;
    if (isBag(classList)) {
      const contains = Reflect.get(classList, "contains");
      if (typeof contains === "function" && Reflect.apply(contains, classList, [className])) found.push(current);
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

describe("What createListShell attaches as its status part", () => {
  it("builds a status region by default, with its published defaults", () => {
    const shell = view().createListShell({});
    const status = parts(shell).status;
    assert.notEqual(status, null);
    assert.ok(isBag(status));
    assert.equal(attr(status, "role"), "status");
    assert.equal(attr(status, "aria-live"), "polite");
    assert.equal(byClass(shell, "view-list-shell-status").length, 1);
  });

  it("attaches null, and renders nothing, when the caller declines the status region", () => {
    const shell = view().createListShell({ status: false });
    assert.equal(parts(shell).status, null, "the part is null rather than absent or an empty element");
    assert.equal(byClass(shell, "view-list-shell-status").length, 0);
  });

  /** The test is `!== false`, so a merely falsy value is not a decline. */
  it("declines only for an explicit false, not for any other falsy value", () => {
    for (const status of [undefined, null, 0, "", Number.NaN]) {
      const shell = view().createListShell({ status });
      assert.notEqual(parts(shell).status, null, `status: ${String(status)}`);
    }
  });

  it("carries the caller's own status text, role and live setting when it builds one", () => {
    const shell = view().createListShell({
      statusMessage: "Two selected",
      statusRole: "alert",
      statusLive: "assertive",
      statusDataset: { listStatus: "" },
      statusHidden: true,
    });
    const status = parts(shell).status;
    assert.ok(isBag(status));
    assert.equal(status.textContent, "Two selected");
    assert.equal(attr(status, "role"), "alert");
    assert.equal(attr(status, "aria-live"), "assertive");
    assert.equal(status.hidden, true);
  });

  it("keeps ordering around the status: before, toolbar, status, children, after", () => {
    const factory = view();
    const before = factory.createElement("header", { text: "before" });
    const toolbar = factory.createElement("nav", { text: "toolbar" });
    const body = factory.createElement("ul", { text: "body" });
    const after = factory.createElement("footer", { text: "after" });
    const shell = factory.createListShell({ before, toolbar, children: body, after });
    const order = childrenOf(shell);
    assert.equal(order[0], before);
    assert.equal(order[1], toolbar);
    assert.equal(order[2], parts(shell).status);
    assert.equal(order[3], body);
    assert.equal(order[4], after);
  });

  /**
   * The declined region is not a hypothetical: these six call sites take it today, which is why
   * the declaration had to admit null rather than the writer being changed to always build one.
   */
  it("is still declined by the six production call sites that rely on it", () => {
    const expected = [
      ["public/js/clients-projects.js", 3],
      ["public/js/reporting.js", 1],
      ["public/js/shared/file-attachments.js", 2],
    ];
    let total = 0;
    for (const [path, count] of expected) {
      const declines = (readText(String(path)).match(/status: false/g) || []).length;
      assert.equal(declines, count, `${path} should still decline the status region ${count} time(s)`);
      total += declines;
    }
    assert.equal(total, 6);
  });

  it("has no production consumer reading the part, which is what makes the correction free", () => {
    for (const path of ["public/js/clients-projects.js", "public/js/reporting.js", "public/js/shared/file-attachments.js"]) {
      assert.doesNotMatch(readText(path), /viewParts\.status/, `${path} should not read a list shell's status part`);
    }
  });
});

describe("The bulk action toolbar's parts", () => {
  it("exposes its four parts and counts the selection", () => {
    const toolbar = view().createBulkActionToolbar({ selectedCount: 3 });
    const toolbarParts = parts(toolbar);
    assert.deepEqual(Object.keys(toolbarParts).sort(), ["body", "count", "label", "summary"]);
    assert.equal(Reflect.get(toolbarParts.count ?? {}, "textContent"), "3 selected");
    assert.equal(Reflect.get(toolbarParts.count ?? {}, "hidden"), false);
    assert.equal(Reflect.get(toolbarParts.label ?? {}, "textContent"), "Bulk Actions");
  });

  it("hides the count at zero, and floors a nonsensical one rather than showing it", () => {
    for (const [selectedCount, text] of [[0, "0 selected"], [-4, "0 selected"], ["nonsense", "0 selected"]]) {
      const toolbar = view().createBulkActionToolbar({ selectedCount });
      assert.equal(Reflect.get(parts(toolbar).count ?? {}, "textContent"), text, `selectedCount: ${String(selectedCount)}`);
    }
    assert.equal(Reflect.get(parts(view().createBulkActionToolbar({ selectedCount: 0 })).count ?? {}, "hidden"), true);
  });

  it("opens only for an explicit true", () => {
    assert.equal(view().createBulkActionToolbar({ open: true }).open, true);
    for (const open of [undefined, false, 1, "yes"]) {
      assert.equal(view().createBulkActionToolbar({ open }).open, false, `open: ${String(open)}`);
    }
  });
});

describe("The collapsible index panel", () => {
  it("opens by default and closes only for an explicit false", () => {
    assert.equal(view().createCollapsibleIndexPanel({ title: "Index" }).open, true);
    assert.equal(view().createCollapsibleIndexPanel({ title: "Index", open: false }).open, false);
    assert.equal(view().createCollapsibleIndexPanel({ title: "Index", open: 0 }).open, true, "a falsy value is not a close");
  });

  it("requires a title, by name", () => {
    assert.throws(() => view().createCollapsibleIndexPanel({}), /Collapsible index panels require a title/);
    assert.throws(() => view().createCollapsibleIndexPanel({ title: "   " }), /Collapsible index panels require a title/);
  });

  it("builds a footer only for children that exist, an empty list not counting", () => {
    const factory = view();
    assert.equal(byClass(factory.createCollapsibleIndexPanel({ title: "A" }), "view-collapsible-index-footer").length, 0);
    assert.equal(byClass(factory.createCollapsibleIndexPanel({ title: "B", footer: [] }), "view-collapsible-index-footer").length, 0);
    assert.equal(byClass(factory.createCollapsibleIndexPanel({ title: "C", footer: "Note" }), "view-collapsible-index-footer").length, 1);
  });
});

describe("The index list's rows", () => {
  it("builds one row per item and refuses a row with no label", () => {
    const list = view().createIndexList({ items: [{ label: "One" }, { label: "Two" }] });
    assert.equal(childrenOf(list).length, 2);
    assert.throws(() => view().createIndexList({ items: [{}] }), /Index list items require a label/);
  });

  it("answers an empty list for items that are not a list", () => {
    for (const items of [undefined, null, "one", 7, {}]) {
      assert.equal(childrenOf(view().createIndexList({ items })).length, 0, `items: ${String(items)}`);
    }
  });

  it("marks the selected row and carries the row id", () => {
    const list = view().createIndexList({ items: [{ id: 7, label: "Seven", selected: true }] });
    const button = childrenOf(childrenOf(list)[0])[0];
    assert.equal(attr(button, "aria-current"), "true");
    assert.equal(Reflect.get(Reflect.get(button, "dataset") ?? {}, "viewIndexId"), "7", "and a numeric id is read as text");
    const plain = view().createIndexList({ items: [{ label: "Plain" }] });
    const plainButton = childrenOf(childrenOf(plain)[0])[0];
    assert.equal(attr(plainButton, "aria-current"), null);
  });

  it("filters the four empty chip and meta values and keeps everything else", () => {
    const list = view().createIndexList({
      items: [{ label: "Row", chips: [null, "kept", undefined, false, "", "also"], meta: [null, "line", false, ""] }],
    });
    const button = childrenOf(childrenOf(list)[0])[0];
    const chipRow = byClass(button, "view-index-list-chips");
    assert.equal(chipRow.length, 1);
    assert.deepEqual(childrenOf(chipRow[0]).map((chip) => chip.textContent), ["kept", "also"]);
    assert.deepEqual(byClass(button, "view-index-list-meta").map((line) => line.textContent), ["line"]);
  });

  it("wraps a lone chip and drops the chip row when nothing survives", () => {
    const factory = view();
    const single = childrenOf(childrenOf(factory.createIndexList({ items: [{ label: "R", chips: "one" }] }))[0])[0];
    assert.deepEqual(childrenOf(byClass(single, "view-index-list-chips")[0]).map((chip) => chip.textContent), ["one"]);
    const none = childrenOf(childrenOf(factory.createIndexList({ items: [{ label: "R", chips: [null, ""] }] }))[0])[0];
    assert.equal(byClass(none, "view-index-list-chips").length, 0);
  });

  it("uses a caller's own node as the chip rather than its text", () => {
    const factory = view();
    const badge = factory.createElement("em", { text: "Live" });
    const row = childrenOf(childrenOf(factory.createIndexList({ items: [{ label: "R", chips: badge }] }))[0])[0];
    assert.equal(childrenOf(byClass(row, "view-index-list-chips")[0])[0], badge);
  });

  it("carries hierarchy depth into the dataset and the style, and floors it", () => {
    const factory = view();
    const row = childrenOf(factory.createIndexList({ items: [{ label: "Child", depth: 2 }] }))[0];
    assert.equal(Reflect.get(Reflect.get(row, "dataset") ?? {}, "viewHierarchyDepth"), "2");
    const button = childrenOf(row)[0];
    assert.equal(attr(button, "style"), "--view-hierarchy-depth: 2;");

    const flat = childrenOf(factory.createIndexList({ items: [{ label: "Flat", depth: 0 }] }))[0];
    assert.equal(Reflect.get(Reflect.get(flat, "dataset") ?? {}, "viewHierarchyDepth"), undefined);
    const capped = childrenOf(factory.createIndexList({ items: [{ label: "Deep", hierarchyDepth: 99 }] }))[0];
    assert.equal(Reflect.get(Reflect.get(capped, "dataset") ?? {}, "viewHierarchyDepth"), "12", "depth is capped at twelve");
  });

  it("reads the parent and path from either spelling, joining a path list", () => {
    const factory = view();
    const row = childrenOf(factory.createIndexList({ items: [{ label: "R", parentId: "p1", path: ["a", "b"] }] }))[0];
    const dataset = Reflect.get(row, "dataset") ?? {};
    assert.equal(Reflect.get(dataset, "viewHierarchyParent"), "p1");
    assert.equal(Reflect.get(dataset, "viewHierarchyPath"), "a/b");
    const alternate = childrenOf(factory.createIndexList({ items: [{ label: "R", hierarchyParent: "p2", hierarchyPath: "x" }] }))[0];
    const alternateDataset = Reflect.get(alternate, "dataset") ?? {};
    assert.equal(Reflect.get(alternateDataset, "viewHierarchyParent"), "p2");
    assert.equal(Reflect.get(alternateDataset, "viewHierarchyPath"), "x");
  });

  it("wires a row's select handler, and ignores one that is not callable", () => {
    const factory = view();
    /** @type {string[]} */
    const chosen = [];
    const list = factory.createIndexList({
      items: [{ id: "a", label: "A", onSelect: () => chosen.push("a") }, { id: "b", label: "B", onSelect: "not callable" }],
    });
    const first = childrenOf(childrenOf(list)[0])[0];
    const second = childrenOf(childrenOf(list)[1])[0];
    fire(first, { type: "click" });
    assert.deepEqual(chosen, ["a"]);
    assert.doesNotThrow(() => fire(second, { type: "click" }));
    assert.deepEqual(chosen, ["a"], "and the uncallable one was never wired");
  });
});
