import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();
const builderSource = readText("public/js/shared/view-builder.js");
const modalStackSource = readText("public/js/shared/view-modal-stack.js");

/**
 * The linked-context surface: the picker, the list, the row builder and the two normalizers
 * that give both their shape.
 *
 * **Unlike the last two children, no declaration needed correcting here.** Every part these two
 * factories attach is built unconditionally by a local `createElement` or `createActionButton`,
 * so `BrowserViewLinkedContextPickerParts` naming `HTMLSelectElement`, `HTMLInputElement` and
 * `HTMLButtonElement` is proved by construction rather than claimed. The cases below cover the
 * reads the new declarations describe, and the three executable lines the checkpoint changed:
 * the remove handler bound once, and the option value coerced the way the native setter does.
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

describe("The linked-context picker's parts", () => {
  it("attaches every declared part, each one built rather than found", () => {
    const picker = view().createLinkedContextPicker({});
    const pickerParts = parts(picker);
    for (const name of ["rows", "empty", "controls", "clientContextSelect", "targetSelect", "searchInput", "recordSelect", "useTargetButton"]) {
      assert.ok(isBag(pickerParts[name]), `${name} should be an element`);
    }
    for (const name of ["setLinkedItems", "setClientContexts", "setRecords", "setTargets", "setReadonly"]) {
      assert.ok(isCallable(pickerParts[name]), `${name} should be callable`);
    }
    assert.equal(Reflect.get(pickerParts.targetSelect ?? {}, "tagName"), "SELECT");
    assert.equal(Reflect.get(pickerParts.searchInput ?? {}, "tagName"), "INPUT");
    assert.equal(Reflect.get(pickerParts.useTargetButton ?? {}, "tagName"), "BUTTON");
  });

  it("marks itself read-only and disables every control when asked", () => {
    for (const key of ["readonly", "disabled", "permissionDisabled"]) {
      const picker = view().createLinkedContextPicker({ [key]: true });
      assert.equal(attr(picker, "data-view-readonly"), "true", `via ${key}`);
      const pickerParts = parts(picker);
      for (const name of ["clientContextSelect", "targetSelect", "searchInput", "recordSelect"]) {
        assert.equal(Reflect.get(pickerParts[name] ?? {}, "disabled"), true, `${key}: ${name}`);
      }
      assert.equal(byClass(picker, "view-linked-context-picker-state").length, 1, `${key}: the read-only note is rendered`);
    }
  });

  it("toggles read-only after the fact, through the part it publishes", () => {
    const picker = view().createLinkedContextPicker({});
    const pickerParts = parts(picker);
    const setReadonly = pickerParts.setReadonly;
    assert.ok(isCallable(setReadonly));
    Reflect.apply(setReadonly, undefined, [true]);
    assert.equal(attr(picker, "data-view-readonly"), "true");
    assert.equal(Reflect.get(pickerParts.recordSelect ?? {}, "disabled"), true);
    Reflect.apply(setReadonly, undefined, [false]);
    assert.equal(attr(picker, "data-view-readonly"), "false");
    assert.equal(Reflect.get(pickerParts.useTargetButton ?? {}, "disabled"), false, "and the button comes back too");
  });

  /**
   * **A published part that is not always in the tree.** The select is constructed on every
   * path - which is what makes `clientContextSelect: HTMLSelectElement` honest - but it is only
   * mounted, inside its labelled field, when the picker has client contexts or is told to show
   * one. A consumer reading the part therefore always gets an element, and sometimes an
   * unmounted one. Recorded rather than changed: it is the behaviour the factory has always had.
   */
  it("publishes the client-context select always, and mounts it only when asked", () => {
    const factory = view();
    const bare = factory.createLinkedContextPicker({});
    assert.ok(isBag(parts(bare).clientContextSelect), "the select is a part on every path");
    assert.equal(byClass(bare, "view-linked-context-picker-client").length, 0, "but it is not in the tree");
    const bareLabels = byClass(bare, "view-linked-context-picker-field-label").map((node) => node.textContent);
    assert.ok(!bareLabels.includes("Client"));

    const withContexts = factory.createLinkedContextPicker({ clientContexts: [{ id: "c1", name: "One" }] });
    assert.equal(byClass(withContexts, "view-linked-context-picker-client").length, 1);
    const labels = byClass(withContexts, "view-linked-context-picker-field-label").map((node) => node.textContent);
    assert.ok(labels.includes("Client"), "the labelled field appears when contexts exist");

    const shown = factory.createLinkedContextPicker({ showClientContext: true });
    assert.equal(byClass(shown, "view-linked-context-picker-client").length, 1, "or when the caller asks outright");
  });

  it("shows its empty placeholder until it is given rows", () => {
    const factory = view();
    const picker = factory.createLinkedContextPicker({ emptyMessage: "Nothing linked." });
    assert.equal(byClass(picker, "view-linked-context-picker-empty").length, 1);
    assert.equal(byClass(picker, "view-linked-context-picker-empty")[0].textContent, "Nothing linked.");
    const setLinkedItems = parts(picker).setLinkedItems;
    assert.ok(isCallable(setLinkedItems));
    Reflect.apply(setLinkedItems, undefined, [[{ targetId: "t1", label: "First" }]]);
    assert.equal(byClass(picker, "view-linked-context-picker-empty").length, 0, "the placeholder goes when a row arrives");
    assert.equal(byClass(picker, "view-linked-context-picker-row").length, 1);
    Reflect.apply(setLinkedItems, undefined, [[]]);
    assert.equal(byClass(picker, "view-linked-context-picker-empty").length, 1, "and comes back when the last one leaves");
  });
});

describe("The linked-context list", () => {
  it("renders its rows and republishes them through its own part", () => {
    const list = view().createLinkedContextList({ items: [{ targetId: "a", label: "A" }] });
    assert.equal(byClass(list, "view-linked-context-picker-row").length, 1);
    const setLinkedItems = parts(list).setLinkedItems;
    assert.ok(isCallable(setLinkedItems));
    Reflect.apply(setLinkedItems, undefined, [[{ targetId: "b", label: "B" }, { targetId: "c", label: "C" }]]);
    assert.equal(byClass(list, "view-linked-context-picker-row").length, 2);
  });

  it("accepts its rows under any of the four spellings it takes", () => {
    for (const key of ["items", "records", "linkedItems", "rows"]) {
      const list = view().createLinkedContextList({ [key]: [{ targetId: "a", label: "A" }] });
      assert.equal(byClass(list, "view-linked-context-picker-row").length, 1, `via ${key}`);
    }
  });
});

describe("A linked-context row", () => {
  /** @param {Record<string, unknown>} item @param {Record<string, unknown>} [options] */
  const row = (item, options = {}) => byClass(view().createLinkedContextList({ items: [item], ...options }), "view-linked-context-picker-row")[0];

  it("links when the record carries a source and stays plain text when it does not", () => {
    const linked = row({ targetId: "a", label: "A", sourceUrl: "/tasks/1" });
    const label = byClass(linked, "view-linked-context-picker-row-label")[0];
    assert.equal(Reflect.get(label, "tagName"), "A");
    assert.equal(attr(label, "href"), "/tasks/1");
    const plain = byClass(row({ targetId: "b", label: "B" }), "view-linked-context-picker-row-label")[0];
    assert.equal(Reflect.get(plain, "tagName"), "SPAN");
    assert.equal(attr(plain, "href"), null);
  });

  it("marks an unavailable record and titles a row from the first label it has", () => {
    const unavailable = row({ targetId: "a", label: "A", isAvailable: false });
    assert.equal(byClass(unavailable, "is-unavailable").length, 1);
    const titled = byClass(row({ targetId: "b", label: "Short", fullLabel: "The long one" }), "view-linked-context-picker-row-label")[0];
    assert.equal(attr(titled, "title"), "The long one");
    assert.equal(attr(titled, "aria-label"), "The long one");
  });

  it("renders the secondary and hint lines only when they carry text", () => {
    const full = row({ targetId: "a", label: "A", secondaryLabel: "Second", hintLabel: "Hint" });
    assert.equal(byClass(full, "view-linked-context-picker-row-secondary")[0].textContent, "Second");
    assert.equal(byClass(full, "view-linked-context-picker-row-hint")[0].textContent, "Hint");
    const bare = row({ targetId: "b", label: "B", secondaryLabel: "   " });
    assert.equal(byClass(bare, "view-linked-context-picker-row-secondary").length, 0, "whitespace is trimmed away to nothing");
    assert.equal(byClass(bare, "view-linked-context-picker-row-hint").length, 0);
  });

  it("offers a remove control unless the record refuses one", () => {
    assert.equal(byClass(row({ targetId: "a", label: "A" }), "view-linked-context-picker-row-actions").length, 1);
    assert.equal(byClass(row({ targetId: "b", label: "B", removable: false }), "view-linked-context-picker-row-actions").length, 0);
  });

  /** The checkpoint reads the handler once instead of twice; it must still receive the record. */
  it("hands the removed record and the event to the caller's handler", () => {
    /** @type {unknown[]} */
    const removed = [];
    const list = view().createLinkedContextList({
      items: [{ targetId: "a", label: "A" }],
      onRemove: (/** @type {unknown} */ item, /** @type {unknown} */ event) => removed.push([item, event]),
    });
    const actions = byClass(list, "view-linked-context-picker-row-actions")[0];
    fire(childrenOf(actions)[0], { type: "click" });
    assert.equal(removed.length, 1);
    const [item, event] = /** @type {unknown[]} */ (removed[0]);
    assert.ok(isBag(item));
    assert.equal(item.targetId, "a", "the normalized record, not the raw one");
    assert.equal(item.displayLabel, "A");
    assert.ok(isBag(event));
  });

  it("does not wire a handler that is not callable", () => {
    const list = view().createLinkedContextList({ items: [{ targetId: "a", label: "A" }], onRemove: "not callable" });
    const actions = byClass(list, "view-linked-context-picker-row-actions")[0];
    assert.doesNotThrow(() => fire(childrenOf(actions)[0], { type: "click" }));
  });
});

describe("The picker's normalizers, as the surface reads them", () => {
  /** @param {unknown[]} targets */
  const targetOptions = (targets) => {
    const picker = view().createLinkedContextPicker({ targets });
    return childrenOf(parts(picker).targetSelect);
  };

  it("takes a plain string as both the value and the label", () => {
    const options = targetOptions(["task"]);
    assert.equal(options.length, 1);
    assert.equal(options[0].value, "task");
    assert.equal(options[0].textContent, "task");
  });

  it("reads a target's value from the first of three spellings", () => {
    assert.equal(targetOptions([{ value: "v", targetType: "t", id: "i" }])[0].value, "v");
    assert.equal(targetOptions([{ targetType: "t", id: "i" }])[0].value, "t");
    assert.equal(targetOptions([{ id: "i" }])[0].value, "i");
    assert.equal(targetOptions([{ label: "only a label" }])[0].value, "", "and answers empty when it has none");
  });

  it("labels a target from three spellings, then falls back rather than showing nothing", () => {
    assert.equal(targetOptions([{ value: "v", displayLabel: "D", label: "L", name: "N" }])[0].textContent, "D");
    assert.equal(targetOptions([{ value: "v", label: "L", name: "N" }])[0].textContent, "L");
    assert.equal(targetOptions([{ value: "v", name: "N" }])[0].textContent, "N");
    assert.equal(targetOptions([{ value: "v" }])[0].textContent, "v", "the value stands in for a missing label");
    assert.equal(targetOptions([{ label: "   " }])[0].textContent, "Target", "and the fallback stands in for whitespace");
  });

  it("drops every falsy entry and wraps a lone one", () => {
    assert.equal(targetOptions([null, "a", undefined, "", false, "b"]).length, 2);
    assert.equal(targetOptions(/** @type {never} */ ("solo")).length, 1, "a single value is wrapped rather than iterated");
  });

  it("disables a target that says so or that is unavailable", () => {
    assert.equal(targetOptions([{ value: "a", disabled: true }])[0].disabled, true);
    assert.equal(targetOptions([{ value: "b", isAvailable: false }])[0].disabled, true);
    assert.equal(targetOptions([{ value: "c" }])[0].disabled, false);
  });

  it("answers a placeholder option when a record list is empty", () => {
    const picker = view().createLinkedContextPicker({ records: [], noRecordsLabel: "Nothing here" });
    const options = childrenOf(parts(picker).recordSelect);
    assert.equal(options.length, 1);
    assert.equal(options[0].textContent, "Nothing here");
    assert.equal(options[0].disabled, true);
    assert.equal(options[0].value, "", "and its value is text, as the native setter would have made it");
  });

  /**
   * `normalizePickerRecords` reads a record's id through `targetId || value || id`, so a caller
   * that identifies its records numerically reaches the option builder with a number. The native
   * `value` setter would coerce it; the checkpoint spells that coercion out, and this is the case
   * that distinguishes the two.
   */
  it("turns a numeric record id into text, as the native setter would have", () => {
    const picker = view().createLinkedContextPicker({ records: [{ id: 7, label: "Seven" }] });
    const option = childrenOf(parts(picker).recordSelect)[0];
    assert.equal(option.value, "7");
    assert.equal(typeof option.value, "string", "text, not the number it arrived as");
  });

  it("builds a record option from the normalized record, carrying its dataset", () => {
    const picker = view().createLinkedContextPicker({
      records: [{ targetId: "t1", label: "First", moduleId: "tasks", targetType: "task", sourceUrl: "/t/1" }],
    });
    const option = childrenOf(parts(picker).recordSelect)[0];
    assert.equal(option.value, "t1");
    assert.equal(option.textContent, "First");
    const dataset = Reflect.get(option, "dataset") ?? {};
    assert.equal(Reflect.get(dataset, "moduleId"), "tasks");
    assert.equal(Reflect.get(dataset, "targetType"), "task");
    assert.equal(Reflect.get(dataset, "sourceUrl"), "/t/1");
  });
});
