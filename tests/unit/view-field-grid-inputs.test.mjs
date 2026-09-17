import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();
const builderSource = readText("public/js/shared/view-builder.js");
const modalStackSource = readText("public/js/shared/view-modal-stack.js");

/**
 * What the field grid accepts, and what its metadata is actually worth.
 *
 * `0.33.33.39.19` corrected `BrowserViewFieldGridOptions.fields` from `readonly unknown[]` to
 * `BrowserViewChildren`, because `createFieldGrid` reads `Array.isArray(fields) ? fields :
 * [fields]` - a single field has always been accepted and wrapped, and the array-only
 * declaration was narrower than the writer beneath it.
 *
 * The same checkpoint corrected the grid's **return** metadata. It promised
 * `fields: BrowserViewFieldElement[]` and `controls: BrowserViewFieldControl[]`, but it stores
 * whatever children it was handed and flattens whatever `viewParts.controls` it finds on them -
 * and its own linked-context picker hands it ordinary labels and a button. The cases below are
 * what the writer really establishes, which is less than the old declaration claimed for two
 * members and exactly as much for the third.
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

/** @param {Bag} node @returns {Bag} */
function parts(node) {
  const value = node.viewParts;
  assert.ok(isBag(value), "the grid should carry a viewParts record");
  return value;
}

/**
 * A metadata list, rebuilt in this realm.
 *
 * The grid builds its parts inside the vm, and a list built there is never reference-equal to
 * one written here - `Array.from` rebuilds the container while keeping every element by
 * identity, which is exactly what these cases assert about.
 * @param {unknown} value
 * @returns {unknown[]}
 */
function list(value) {
  assert.ok(Array.isArray(value), "the part should be a list");
  return Array.from(value);
}

/** @param {unknown} node @returns {Bag[]} */
function childrenOf(node) {
  assert.ok(isBag(node));
  const children = node.children;
  assert.ok(Array.isArray(children), "the element should carry a child list");
  return children;
}

describe("What the field grid accepts", () => {
  it("takes a single constructed field and wraps it, keeping its identity", () => {
    const factory = view();
    const field = factory.createField({ field: "title", label: "Title" });
    const grid = factory.createFieldGrid({ fields: field });
    assert.deepEqual(childrenOf(grid), [field], "the one field is the grid's only child");
    assert.deepEqual(list(parts(grid).fields), [field], "and the metadata wraps it by identity");
  });

  it("takes a list of fields in order, by identity", () => {
    const factory = view();
    const first = factory.createField({ field: "title", label: "Title" });
    const second = factory.createField({ field: "owner", label: "Owner" });
    const grid = factory.createFieldGrid({ fields: [first, second] });
    assert.deepEqual(childrenOf(grid), [first, second]);
    assert.deepEqual(list(parts(grid).fields), [first, second]);
  });

  /**
   * The case the old declaration denied. `createLinkedContextPicker` hands this grid ordinary
   * labels and a button, so a child with no field-builder metadata is a supported input, not an
   * abuse of one.
   */
  it("takes an ordinary child that carries no field metadata at all", () => {
    const factory = view();
    const plain = factory.createElement("label", { text: "Not a field" });
    const grid = factory.createFieldGrid({ fields: plain });
    assert.deepEqual(childrenOf(grid), [plain]);
    assert.deepEqual(list(parts(grid).fields), [plain], "stored as given");
    assert.deepEqual(list(parts(grid).controls), [], "and it contributes no controls");
  });

  it("falls back to children when it is given no fields", () => {
    const factory = view();
    const child = factory.createField({ field: "title", label: "Title" });
    const grid = factory.createFieldGrid({ children: child });
    assert.deepEqual(childrenOf(grid), [child]);
    assert.deepEqual(list(parts(grid).fields), [child]);
  });

  /** Precedence, unchanged: an explicit empty list is a decision, not an absence. */
  it("lets an explicit empty fields list win over supplied children", () => {
    const factory = view();
    const child = factory.createField({ field: "title", label: "Title" });
    const grid = factory.createFieldGrid({ fields: [], children: child });
    assert.deepEqual(childrenOf(grid), [], "the empty list wins");
    assert.deepEqual(list(parts(grid).fields), []);
  });

  it("answers an empty grid for no input at all", () => {
    const grid = view().createFieldGrid({});
    assert.deepEqual(childrenOf(grid), []);
    assert.deepEqual(list(parts(grid).fields), []);
    assert.deepEqual(list(parts(grid).controls), []);
  });
});

describe("What the field grid's metadata is worth", () => {
  it("collects the controls a constructed field exposes, flattened in order", () => {
    const factory = view();
    const title = factory.createField({ field: "title", label: "Title" });
    const density = factory.createField({
      field: "density", label: "Density", type: "radio",
      options: [{ value: "a", label: "A" }, { value: "b", label: "B" }],
    });
    const grid = factory.createFieldGrid({ fields: [title, density] });
    const controls = list(parts(grid).controls);
    assert.equal(controls.length, 3, "one from the text field and two from the radio group");
    assert.equal(controls[0], list(parts(title).controls)[0], "by identity, not rebuilt");
    assert.equal(controls[1], list(parts(density).controls)[0]);
  });

  it("mixes a field and a plain child without inventing controls for the plain one", () => {
    const factory = view();
    const field = factory.createField({ field: "title", label: "Title" });
    const plain = factory.createElement("button", { text: "Use target" });
    const grid = factory.createFieldGrid({ fields: [field, plain] });
    assert.deepEqual(list(parts(grid).fields), [field, plain], "both are stored, in order");
    assert.equal(list(parts(grid).controls).length, 1, "only the field contributes a control");
  });

  /** The one guarantee the writer really establishes, so it keeps its precise type. */
  it("collects values from the grid's own bound controls", () => {
    const factory = view();
    // The bound value lives in the second bag; the descriptor's own spelling is `default`.
    const title = factory.createField({ field: "title", label: "Title" }, { value: "First" });
    const grid = factory.createFieldGrid({ fields: title });
    const collectValues = parts(grid).collectValues;
    assert.ok(isCallable(collectValues));
    const collected = Reflect.apply(collectValues, undefined, []);
    assert.ok(isBag(collected));
    assert.equal(collected.title, "First");
  });

  it("collects nothing from a grid of plain children", () => {
    const factory = view();
    const grid = factory.createFieldGrid({ fields: factory.createElement("label", { text: "Not a field" }) });
    const collectValues = parts(grid).collectValues;
    assert.ok(isCallable(collectValues));
    assert.deepEqual(Object.keys(/** @type {Bag} */ (Reflect.apply(collectValues, undefined, []))), []);
  });
});

describe("The field-grid contract, as the compiler sees it", () => {
  /**
   * A type-level probe. This file is checked by the same shrink-only ledger as production, so a
   * regression in either correction stops the checkpoint being recordable rather than merely
   * failing a case.
   */
  it("accepts a single child and a list, and answers metadata it can actually keep", () => {
    /** @type {import("../../src/types/browser-contracts.js").BrowserViewFieldGridOptions} */
    const single = { fields: "one child, not a list" };
    /** @type {import("../../src/types/browser-contracts.js").BrowserViewFieldGridOptions} */
    const many = { fields: ["a", "b"], children: "ignored", surface: false };
    assert.equal(many.surface, false);
    assert.equal(single.fields, "one child, not a list");

    /** @type {import("../../src/types/browser-contracts.js").BrowserViewFieldGridParts} */
    const gridParts = {
      collectValues: () => ({}),
      // Both lists must admit an entry that is not a bound control, because the grid flattens
      // whatever `viewParts.controls` it finds and stores whatever children it was handed. An
      // empty list would satisfy the old declaration too, so these carry a real entry.
      controls: ["not a bound control"],
      fields: ["a plain child"],
    };
    /** @type {Record<string, unknown>} */
    const collected = gridParts.collectValues();
    assert.deepEqual(collected, {}, "and collectValues keeps its precise return");
  });

  it("leaves the field's own parts precise, which the grid's are not", () => {
    /** @type {import("../../src/types/browser-contracts.js").BrowserViewFieldParts} */
    const fieldParts = {
      control: null,
      controls: [],
      label: globalThis.document ? globalThis.document.createElement("span") : /** @type {never} */ (undefined),
      message: globalThis.document ? globalThis.document.createElement("span") : /** @type {never} */ (undefined),
      setMessage: () => {},
    };
    /** @type {readonly import("../../src/types/browser-contracts.js").BrowserViewFieldControl[]} */
    const fieldControls = fieldParts.controls;
    assert.deepEqual(fieldControls, [], "a field still promises bound controls; only the grid stopped");
  });
});
