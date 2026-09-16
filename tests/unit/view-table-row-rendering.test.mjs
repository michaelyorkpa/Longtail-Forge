import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/view-renderer.js");

/**
 * The table rendering path below the columns, which nothing executed.
 *
 * `0.33.33.39.9` typed `tableColumns` and had to **stub** `renderRowSelection`,
 * `renderHierarchyLabel` and `renderActions` to do it. `0.33.33.39.10` typed the rest of that
 * path, so those three are lifted for real here alongside the secondary rows, the chip list and
 * the small readers they share.
 *
 * Two executable lines changed in that checkpoint, both reading a record through a proof instead
 * of optional chaining: `recordId` and `chipDisplayLabel`. Both answer what the chaining
 * answered - `undefined` for every member of a non-record - and both are asserted below.
 */

const LIFTED = [
  "isDescriptorRecord", "recordId", "normalizedHierarchyDepth", "descriptorHasValue",
  "chipDisplayLabel", "tableSelection", "readDescriptorValue", "renderChipList",
  "renderHierarchyLabel", "renderRowSelection", "renderTableSecondaryRow", "tableSecondaryRows",
];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * @typedef {object} BuiltNode
 * @property {string} tag
 * @property {Record<string, unknown>} options
 */

/**
 * A recording stand-in for the primitives. These renderers are being checked on what they hand
 * the factory, not on what the factory builds; the real one is `shared/view-builder.js`.
 */
function recordingView() {
  /** @type {BuiltNode[]} */
  const built = [];
  const view = {
    /** @param {string} tag @param {Record<string, unknown>} [options] */
    createElement(tag, options = {}) {
      const node = { tag, options, children: options.children };
      built.push({ tag, options });
      return node;
    },
  };
  return { built, view };
}

/** The node built last, proved present rather than assumed. @param {BuiltNode[]} built */
function lastNode(built) {
  const node = built.at(-1);
  assert.ok(node, "a node must have been built");
  return node;
}

/** @param {BuiltNode[]} built @returns {Record<string, unknown>} */
const lastOptions = (built) => lastNode(built).options;

/** @param {unknown} children @returns {BuiltNode[]} */
function childNodes(children) {
  assert.ok(Array.isArray(children), "children must be a list");
  return children;
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {Record<string, unknown>} */
function bag(value) {
  assert.ok(isBag(value), "an option bag must be an object");
  return value;
}

/** @param {BuiltNode[]} built @returns {unknown[]} */
const childTexts = (built) => plain(childNodes(lastOptions(built).children).map((child) => child.options.text));

function table() {
  const context = vm.createContext({
    // The real path reader lives in `shared/view-data-binding.js` and is covered there. Every
    // field name below is flat, so a direct member read is faithful for these cases.
    requireDataBinding: () => ({
      readPath: (/** @type {unknown} */ record, /** @type {unknown} */ path) =>
        (record && typeof record === "object" ? Reflect.get(record, String(path)) : undefined),
    }),
  });
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  return vm.runInContext(`({ ${LIFTED.join(", ")} })`, context);
}

describe("The record proof the table path reads through", () => {
  it("answers an object and an array as records, and nothing else", () => {
    const api = table();
    assert.equal(api.isDescriptorRecord({ id: "r1" }), true);
    assert.equal(api.isDescriptorRecord([1]), true, "an array is an object");
    for (const value of [null, undefined, "r1", 7, true]) {
      assert.equal(api.isDescriptorRecord(value), false, `value: ${JSON.stringify(value)}`);
    }
  });

  /** The proof answers what `record?.id` answered: nothing, for every member of a non-record. */
  it("reads a record id from the four spellings, in order", () => {
    const api = table();
    assert.equal(api.recordId({ id: "a", record_id: "b" }), "a");
    assert.equal(api.recordId({ record_id: "b", list_id: "c" }), "b");
    assert.equal(api.recordId({ list_id: "c", note_id: "d" }), "c");
    assert.equal(api.recordId({ note_id: "d" }), "d");
    assert.equal(api.recordId({ other: "x" }), "");
  });

  it("answers an empty id for anything that is not a record, without throwing", () => {
    const api = table();
    for (const value of [null, undefined, "r1", 7, true, []]) {
      assert.doesNotThrow(() => api.recordId(value), `value: ${JSON.stringify(value)}`);
      assert.equal(api.recordId(value), "", `value: ${JSON.stringify(value)}`);
    }
    assert.equal(api.recordId({ id: 42 }), "42", "and a non-text id is still read as text");
  });

  it("labels a chip from its own field, then four fallbacks, then itself", () => {
    const api = table();
    assert.equal(api.chipDisplayLabel({ label: "Urgent", name: "n" }), "Urgent");
    assert.equal(api.chipDisplayLabel({ name: "n", title: "t" }), "n");
    assert.equal(api.chipDisplayLabel({ title: "t", value: "v" }), "t");
    assert.equal(api.chipDisplayLabel({ value: "v", id: "i" }), "v");
    assert.equal(api.chipDisplayLabel({ id: "i" }), "i");
    assert.equal(api.chipDisplayLabel({ tone: "x" }), "");
    assert.equal(api.chipDisplayLabel({ tone: "x", label: "L" }, "tone"), "x", "a named field wins");
    assert.equal(api.chipDisplayLabel("Urgent"), "Urgent", "a plain chip is its own label");
    assert.equal(api.chipDisplayLabel(null), "", "and an absent one is empty rather than null");
  });
});

describe("The small table readers", () => {
  it("floors a hierarchy depth, refuses a non-positive one and caps it", () => {
    const api = table();
    assert.equal(api.normalizedHierarchyDepth(3), 3);
    assert.equal(api.normalizedHierarchyDepth("2.9"), 2, "floored, not rounded");
    assert.equal(api.normalizedHierarchyDepth(99), 12, "and capped at the stylesheet's depth");
    for (const value of [0, -1, null, undefined, "deep", Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(api.normalizedHierarchyDepth(value), 0, `value: ${JSON.stringify(value)}`);
    }
  });

  it("treats only four values as no value at all", () => {
    const api = table();
    for (const value of [null, undefined, false, ""]) {
      assert.equal(api.descriptorHasValue(value), false, `value: ${JSON.stringify(value)}`);
      assert.equal(api.descriptorHasValue([value, value]), false);
    }
    for (const value of [0, "0", [], { a: 1 }]) {
      assert.equal(api.descriptorHasValue(value), Array.isArray(value) ? false : true, `value: ${JSON.stringify(value)}`);
    }
    assert.equal(api.descriptorHasValue(["", "x"]), true, "one value in a list is a value");
  });

  it("answers a selection descriptor only when the table enables one", () => {
    const api = table();
    const selection = { enabled: true, label: "Pick" };
    assert.equal(api.tableSelection({ selection }), selection, "by identity");
    assert.equal(api.tableSelection({ selection: { enabled: false } }), null);
    assert.equal(api.tableSelection({}), null);
    assert.equal(api.tableSelection(), null);
    assert.deepEqual(plain(api.tableSelection({ selection: { label: "Pick" } })), { label: "Pick" },
      "an absent enabled flag is not a disabled one");
  });
});

describe("One chip list", () => {
  it("reads the chips from the chips field, then the field, then the id", () => {
    const api = table();
    const { view, built } = recordingView();
    api.renderChipList({ chipsField: "tags", field: "name", id: "x" }, view, { tags: ["a"], name: ["b"] });
    assert.deepEqual(childTexts(built), ["a"]);
    built.length = 0;
    api.renderChipList({ field: "name" }, view, { name: ["b"] });
    assert.deepEqual(childTexts(built), ["b"]);
  });

  it("wraps a single chip, drops the empty ones, and labels each through the chip reader", () => {
    const api = table();
    const { view, built } = recordingView();
    api.renderChipList({ field: "tags" }, view, { tags: "solo" });
    assert.equal(childNodes(lastOptions(built).children).length, 1);
    built.length = 0;
    api.renderChipList({ field: "tags" }, view, { tags: ["a", null, "", false, undefined, { label: "L" }] });
    const chips = childNodes(lastOptions(built).children);
    assert.deepEqual(plain(chips.map((child) => child.options.text)), ["a", "L"]);
    assert.deepEqual(plain(chips.map((child) => child.options.className)), ["surface-chip", "surface-chip"]);
  });

  it("takes each chip's label from the field the descriptor names", () => {
    const api = table();
    const { view, built } = recordingView();
    api.renderChipList({ chipLabelField: "tone", field: "tags" }, view, { tags: [{ label: "L", tone: "T" }] });
    assert.equal(childNodes(lastOptions(built).children)[0].options.text, "T");
  });
});

describe("One hierarchy label", () => {
  it("reads its value from the column and its depth from the column's own field", () => {
    const api = table();
    const { view, built } = recordingView();
    api.renderHierarchyLabel({ depthField: "level", field: "name" }, {}, view, { level: 2, name: "Child" });
    assert.equal(lastOptions(built).text, "Child");
    assert.deepEqual(plain(lastOptions(built).attrs), { style: "--view-hierarchy-depth: 2;" });
    assert.deepEqual(plain(lastOptions(built).dataset), { viewHierarchyDepth: 2 });
  });

  it("falls back to the table's own hierarchy depth field", () => {
    const api = table();
    const { view, built } = recordingView();
    api.renderHierarchyLabel({ field: "name" }, { hierarchy: { depthField: "depth" } }, view, { depth: 1, name: "Child" });
    assert.deepEqual(plain(lastOptions(built).attrs), { style: "--view-hierarchy-depth: 1;" });
  });

  it("carries no depth attribute at the root, and tolerates a table with no hierarchy", () => {
    const api = table();
    const { view, built } = recordingView();
    api.renderHierarchyLabel({ depthField: "level", field: "name" }, {}, view, { level: 0, name: "Root" });
    assert.deepEqual(plain(lastOptions(built).attrs), {});
    assert.deepEqual(plain(lastOptions(built).dataset), {});
    assert.doesNotThrow(() => api.renderHierarchyLabel({ field: "name" }, null, view, { name: "Root" }));
  });
});

describe("One row-selection control", () => {
  it("names the record it selects, from the descriptor's own label field", () => {
    const api = table();
    const { view, built } = recordingView();
    api.renderRowSelection({ label: "Select", labelField: "title", recordType: "note" }, view, { id: "r1", title: "First" });
    const attrs = bag(lastOptions(built).attrs);
    const dataset = bag(lastOptions(built).dataset);
    assert.equal(attrs.type, "checkbox");
    assert.equal(attrs.value, "r1");
    assert.equal(attrs["aria-label"], "Select First");
    assert.equal(dataset.viewRowSelectId, "r1");
    assert.equal(dataset.viewRowSelectType, "note");
  });

  it("falls back to the name field, the display label and the id, and to Select", () => {
    const api = table();
    const { view, built } = recordingView();
    api.renderRowSelection({}, view, { id: "r1", name: "Named" });
    assert.equal(bag(lastOptions(built).attrs)["aria-label"], "Select Named");
    api.renderRowSelection({}, view, { displayLabel: "Shown", id: "r1" });
    assert.equal(bag(lastOptions(built).attrs)["aria-label"], "Select Shown");
    api.renderRowSelection({}, view, { id: "r1" });
    assert.equal(bag(lastOptions(built).attrs)["aria-label"], "Select r1");
    assert.equal(bag(lastOptions(built).dataset).viewRowSelectType, "", "and an unnamed record type is empty");
  });
});

describe("The secondary rows under a table row", () => {
  it("maps each declared row, defaulting its hide-when-empty rule to on", () => {
    const api = table();
    const { view } = recordingView();
    const rows = api.tableSecondaryRows({
      secondaryRows: [{ id: "a" }, { hideWhenEmpty: false, id: "b" }, { hideWhenEmpty: true, id: "c" }],
    }, view);
    assert.deepEqual(plain(rows).map((/** @type {{ id: unknown }} */ row) => row.id), ["a", "b", "c"]);
    assert.deepEqual(plain(rows).map((/** @type {{ hideWhenEmpty: unknown }} */ row) => row.hideWhenEmpty), [true, false, true]);
    assert.deepEqual(plain(api.tableSecondaryRows({}, view)), []);
    assert.deepEqual(plain(api.tableSecondaryRows({ secondaryRows: "a" }, view)), [],
      "a secondary-rows value that is not a list declares none");
  });

  it("hides an empty row unless the descriptor says to keep it", () => {
    const api = table();
    const { view } = recordingView();
    assert.equal(api.renderTableSecondaryRow({ field: "notes", id: "a" }, view, {}), null);
    assert.notEqual(api.renderTableSecondaryRow({ field: "notes", hideWhenEmpty: false, id: "a" }, view, {}), null);
    assert.notEqual(api.renderTableSecondaryRow({ field: "notes", id: "a" }, view, { notes: "text" }), null);
  });

  it("renders a chip list for a chip-list row and text for any other, each under its label", () => {
    const api = table();
    const { view, built } = recordingView();
    api.renderTableSecondaryRow({ field: "notes", id: "a", label: "Notes" }, view, { notes: "text" });
    const textRow = lastOptions(built);
    assert.equal(textRow.className, "view-table-secondary-row-content");
    assert.deepEqual(plain(childNodes(textRow.children).map((child) => child.options.text)), ["Notes", "text"]);

    built.length = 0;
    api.renderTableSecondaryRow({ chipsField: "tags", formatter: "chip-list", id: "b", title: "Tags" }, view, { tags: ["x"] });
    const chipRow = childNodes(lastOptions(built).children);
    assert.equal(chipRow[0].options.text, "Tags", "and a title stands in for an absent label");
    assert.deepEqual(plain(chipRow[1].options.className)[0], "view-table-chip-list");
  });

  it("omits the label element when the row names none", () => {
    const api = table();
    const { view, built } = recordingView();
    api.renderTableSecondaryRow({ field: "notes", id: "a" }, view, { notes: "text" });
    assert.equal(childNodes(lastOptions(built).children).length, 1);
  });
});
