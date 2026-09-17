import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();
const builderSource = readText("public/js/shared/view-builder.js");
const modalStackSource = readText("public/js/shared/view-modal-stack.js");

/**
 * The data-table surface: the table, its rows, its secondary rows and the five small readers
 * that decide what each cell holds.
 *
 * `BrowserViewDataTableOptions` takes its columns, rows and secondary rows as `readonly
 * unknown[]`, so every read in this surface is off a value a page controller assembled. The
 * checkpoint routes those reads through proofs that answer what the member access answered -
 * `undefined` for a non-record - and **keep the `TypeError` a nullish column already raised**.
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

/** @param {unknown} node @param {string} name */
function attr(node, name) {
  assert.ok(isBag(node));
  const getAttribute = node.getAttribute;
  assert.ok(isCallable(getAttribute));
  return Reflect.apply(getAttribute, node, [name]);
}

/** @param {unknown} node @returns {Bag} */
function datasetOf(node) {
  assert.ok(isBag(node));
  const dataset = node.dataset;
  assert.ok(isBag(dataset));
  return dataset;
}

/** @param {Bag} table @returns {unknown[]} */
const headerTexts = (table) => byTag(table, "th").map((cell) => cell.textContent);

describe("The data table's header", () => {
  it("labels a column from a plain string, and from three object spellings in order", () => {
    const factory = view();
    assert.deepEqual(headerTexts(factory.createDataTable({ columns: ["Plain"] })), ["Plain"]);
    assert.deepEqual(headerTexts(factory.createDataTable({
      columns: [{ label: "L", header: "H", key: "k" }, { header: "H", key: "k" }, { key: "k" }, {}],
    })), ["L", "H", "k", ""]);
  });

  /** `Object.hasOwn`, not truthiness: a column that declares an empty label means it. */
  it("honours a declared label even when it is empty, rather than falling through", () => {
    const table = view().createDataTable({ columns: [{ label: "", header: "Header" }] });
    assert.deepEqual(headerTexts(table), [""], "the declared label wins over the header");
  });

  it("marks a column's alignment on the header and on every cell, as text", () => {
    const table = view().createDataTable({
      columns: [{ key: "a", align: "end" }, { key: "b" }],
      rows: [{ a: 1, b: 2 }],
    });
    const header = byTag(table, "th")[0];
    assert.equal(datasetOf(header).align, "end");
    assert.equal(datasetOf(byTag(table, "th")[1] ?? {}).align, undefined);
    const cells = byTag(table, "td");
    assert.equal(datasetOf(cells[0]).align, "end");
    const numericAlign = view().createDataTable({ columns: [{ key: "a", align: 7 }], rows: [{ a: 1 }] });
    assert.equal(datasetOf(byTag(numericAlign, "th")[0]).align, "7", "and a broader value is written as text");
  });

  it("renders a caption only when it is given one", () => {
    const factory = view();
    assert.equal(byTag(factory.createDataTable({ columns: ["A"] }), "caption").length, 0);
    assert.equal(byTag(factory.createDataTable({ columns: ["A"], caption: "Totals" }), "caption")[0].textContent, "Totals");
  });
});

describe("The data table's rows", () => {
  it("reads a cell by key, then by field, and answers empty for neither", () => {
    const table = view().createDataTable({
      columns: [{ key: "title" }, { field: "owner" }, {}],
      rows: [{ title: "First", owner: "Ada" }],
    });
    assert.deepEqual(byTag(table, "td").map((cell) => cell.textContent), ["First", "Ada", ""]);
  });

  it("prefers a column's own renderer and hands it the row and its index", () => {
    /** @type {unknown[]} */
    const seen = [];
    const table = view().createDataTable({
      columns: [{ key: "title", render: (/** @type {unknown} */ row, /** @type {unknown} */ index) => {
        seen.push([row, index]);
        return "rendered";
      } }],
      rows: [{ title: "ignored" }],
    });
    assert.equal(byTag(table, "td")[0].textContent, "rendered");
    assert.equal(seen.length, 1);
    const [row, index] = /** @type {unknown[]} */ (seen[0]);
    assert.ok(isBag(row));
    assert.equal(row.title, "ignored");
    assert.equal(index, 0);
  });

  it("answers empty for a missing value and for a row that is not a record", () => {
    const factory = view();
    const missing = factory.createDataTable({ columns: [{ key: "title" }], rows: [{ other: 1 }] });
    assert.equal(byTag(missing, "td")[0].textContent, "");
    const primitive = factory.createDataTable({ columns: [{ key: "title" }], rows: ["plain"] });
    assert.equal(byTag(primitive, "td")[0].textContent, "", "a string row carries no column value");
  });

  it("builds a header cell for a column that says so, and scopes it to the row", () => {
    const table = view().createDataTable({
      columns: [{ key: "title", header: true }, { key: "owner" }],
      rows: [{ title: "First", owner: "Ada" }],
    });
    const rowHeaders = byTag(table, "th").filter((cell) => attr(cell, "scope") === "row");
    assert.equal(rowHeaders.length, 1);
    assert.equal(rowHeaders[0].textContent, "First");
  });

  it("renders one empty row spanning every column when there are none", () => {
    const table = view().createDataTable({ columns: ["A", "B", "C"], emptyMessage: "Nothing yet." });
    const cells = byTag(table, "td");
    assert.equal(cells.length, 1);
    assert.equal(cells[0].textContent, "Nothing yet.");
    assert.equal(cells[0].colSpan, 3);
    const noColumns = view().createDataTable({ rows: [] });
    assert.equal(byTag(noColumns, "td")[0].colSpan, 1, "and at least one column's worth");
  });

  it("carries hierarchy depth, parent and a dotted path onto the row", () => {
    const table = view().createDataTable({
      columns: [{ key: "title" }],
      rows: [{ title: "Child", meta: { depth: 2, parent: "p1" }, trail: ["a", "b"] }],
      hierarchy: { depthField: "meta.depth", parentField: "meta.parent", pathField: "trail" },
    });
    const row = byTag(table, "tr").find((node) => byTag(node, "td").length > 0);
    assert.ok(row);
    const dataset = datasetOf(row);
    assert.equal(dataset.viewHierarchyDepth, "2");
    assert.equal(dataset.viewHierarchyParent, "p1");
    assert.equal(dataset.viewHierarchyPath, "a/b");
  });

  it("carries no hierarchy dataset when the table declares none", () => {
    const table = view().createDataTable({ columns: [{ key: "title" }], rows: [{ title: "Flat" }] });
    const row = byTag(table, "tr").find((node) => byTag(node, "td").length > 0);
    assert.ok(row);
    assert.deepEqual(Object.keys(datasetOf(row)), []);
  });
});

describe("The data table's secondary rows", () => {
  /** @param {Record<string, unknown>} secondaryRow */
  const withSecondary = (secondaryRow) => view().createDataTable({
    columns: [{ key: "a" }, { key: "b" }, { key: "c" }],
    rows: [{ a: 1, b: 2, c: 3 }],
    secondaryRows: [secondaryRow],
  });

  it("renders its content, and prefers its own renderer", () => {
    assert.equal(byTag(withSecondary({ id: "notes", content: "Some notes" }), "td").filter(
      (cell) => cell.textContent === "Some notes").length, 1);
    const rendered = withSecondary({ id: "notes", content: "ignored", render: () => "from the renderer" });
    assert.equal(byTag(rendered, "td").filter((cell) => cell.textContent === "from the renderer").length, 1);
  });

  it("hides itself when empty, unless it says otherwise", () => {
    for (const content of [null, undefined, false, ""]) {
      const table = withSecondary({ id: "notes", content });
      assert.equal(byTag(table, "tr").length, 2, `content: ${String(content)} renders no secondary row`);
    }
    const kept = withSecondary({ id: "notes", content: "", hideWhenEmpty: false });
    assert.equal(byTag(kept, "tr").length, 3, "and an explicit false keeps it");
  });

  it("spans from one named column to before another, with spacers either side", () => {
    const table = withSecondary({ id: "notes", content: "Span", startColumn: "b", endBeforeColumn: "c" });
    const secondary = byTag(table, "tr").at(-1);
    assert.ok(secondary);
    const cells = byTag(secondary, "td");
    assert.equal(cells.length, 3, "one leading spacer, the content, one trailing spacer");
    assert.equal(attr(cells[0], "aria-hidden"), "true");
    assert.equal(cells[1].textContent, "Span");
    assert.equal(cells[1].colSpan, 1);
    assert.equal(attr(cells[2], "aria-hidden"), "true");
  });

  it("spans every column when it names none, and falls back for a name it cannot find", () => {
    const all = withSecondary({ id: "notes", content: "Span" });
    const allCells = byTag(byTag(all, "tr").at(-1), "td");
    assert.equal(allCells.length, 1);
    assert.equal(allCells[0].colSpan, 3);
    const unknownColumn = withSecondary({ id: "notes", content: "Span", startColumn: "missing" });
    assert.equal(byTag(byTag(unknownColumn, "tr").at(-1), "td")[0].colSpan, 3, "an unknown start falls back to the first");
  });

  it("matches a column by key or by id, and carries its own hook and class", () => {
    const byId = view().createDataTable({
      columns: [{ id: "one" }, { id: "two" }],
      rows: [{}],
      secondaryRows: [{ id: "notes", content: "Span", startColumn: "two", className: "extra" }],
    });
    const secondary = byTag(byId, "tr").at(-1);
    assert.ok(secondary);
    assert.equal(attr(secondary, "data-view-table-secondary-row"), "notes");
    assert.equal(byTag(secondary, "td").length, 2, "one spacer then the content");
  });
});

describe("What the table refuses to read", () => {
  /**
   * `column.align` and `Object.hasOwn(column, "label")` both raised a `TypeError` for a hole in
   * the column list, and the proofs the checkpoint reads through keep that rather than rendering
   * a silently empty header.
   */
  it("still refuses a hole in the column list", () => {
    for (const columns of [[null], ["A", undefined]]) {
      assert.throws(() => view().createDataTable({ columns }), (error) => {
        assert.ok(isBag(error));
        assert.equal(error.name, "TypeError");
        assert.match(String(error.message), /data table columns must be readable/);
        return true;
      }, `columns: ${JSON.stringify(columns)}`);
    }
  });

  it("still refuses a hole in the secondary-row list", () => {
    assert.throws(() => view().createDataTable({ columns: ["A"], rows: [{}], secondaryRows: [null] }), (error) => {
      assert.ok(isBag(error));
      assert.equal(error.name, "TypeError");
      assert.match(String(error.message), /secondary rows must be readable/);
      return true;
    });
  });

  it("reads a column that is neither a record nor a string as carrying no members", () => {
    const table = view().createDataTable({ columns: [7], rows: [{}] });
    assert.deepEqual(headerTexts(table), [""], "a numeric column has no label");
  });
});
