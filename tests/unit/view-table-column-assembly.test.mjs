import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/view-renderer.js");

/**
 * The table columns the layout renderer assembles, which nothing executed.
 *
 * `0.33.33.39.9` typed the layout seam and declared the shape these columns are handed to
 * `createDataTable` in - a shape with an optional `header`, because the selection and row-action
 * columns this function prepends and appends carry none. The checkpoint changed two executable
 * lines, both coercions the runtime already performed; these cases cover the assembly the
 * declaration describes, which had no executable coverage at all.
 */

const LIFTED = ["tableSelection", "tableColumnRenderer", "tableColumns"];

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

function columns() {
  /** @type {unknown[][]} */
  const rendered = [];
  const context = vm.createContext({
    renderHierarchyLabel: (/** @type {unknown[]} */ ...args) => { rendered.push(["hierarchy", ...args]); return "hierarchy"; },
    renderChipList: (/** @type {unknown[]} */ ...args) => { rendered.push(["chips", ...args]); return "chips"; },
    renderRowSelection: (/** @type {unknown[]} */ ...args) => { rendered.push(["selection", ...args]); return "selection"; },
    renderActions: (/** @type {unknown[]} */ ...args) => { rendered.push(["actions", ...args]); return "actions"; },
  });
  for (const name of LIFTED) vm.runInContext(extractFunctionBlock(source, name), context);
  return { api: vm.runInContext(`({ ${LIFTED.join(", ")} })`, context), rendered };
}

const VIEW = { marker: "view" };
const STATE = { records: [] };

describe("The columns a table descriptor is turned into", () => {
  it("keys each column on its field, then its id, and labels it from either", () => {
    const { api } = columns();
    const built = api.tableColumns({
      columns: [{ field: "name", label: "Name" }, { field: "size" }, { id: "owner" }],
    }, VIEW, STATE);
    assert.deepEqual(built.map((/** @type {{ key: unknown }} */ column) => column.key), ["name", "size", "owner"]);
    assert.deepEqual(built.map((/** @type {{ label: unknown }} */ column) => column.label), ["Name", "size", "owner"]);
  });

  it("carries alignment and a header through untouched, and leaves both absent otherwise", () => {
    const { api } = columns();
    const [aligned, plainColumn] = api.tableColumns({
      columns: [{ align: "right", field: "size", header: "Size" }, { field: "name" }],
    }, VIEW, STATE);
    assert.equal(aligned.align, "right");
    assert.equal(aligned.header, "Size");
    assert.equal(plainColumn.align, undefined);
    assert.equal(plainColumn.header, undefined);
  });

  it("gives a column a renderer only for the two formatters that have one", () => {
    const { api } = columns();
    const built = api.tableColumns({
      columns: [{ field: "a", formatter: "hierarchy-label" }, { field: "b", formatter: "chip-list" },
        { field: "c", formatter: "text" }, { field: "d" }],
    }, VIEW, STATE);
    assert.equal(typeof built[0].render, "function");
    assert.equal(typeof built[1].render, "function");
    assert.equal(built[2].render, undefined, "a text formatter renders through the table itself");
    assert.equal(built[3].render, undefined);
  });

  it("hands each renderer its own column, the table and the view", () => {
    const { api, rendered } = columns();
    const table = { columns: [{ field: "a", formatter: "hierarchy-label" }] };
    const built = api.tableColumns(table, VIEW, STATE);
    built[0].render({ id: "r1" });
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0][0], "hierarchy");
    assert.deepEqual(plain(rendered[0][1]), { field: "a", formatter: "hierarchy-label" });
    assert.equal(rendered[0][3], VIEW, "the view by identity");
    assert.deepEqual(plain(rendered[0][4]), { id: "r1" });
  });
});

describe("The selection column a table asks for", () => {
  it("prepends one when selection is present, and none when it is disabled or absent", () => {
    const { api } = columns();
    const withSelection = api.tableColumns({ columns: [{ field: "name" }], selection: { enabled: true } }, VIEW, STATE);
    assert.equal(withSelection[0].key, "__view_row_selection");
    assert.equal(withSelection.length, 2);
    assert.equal(api.tableColumns({ columns: [{ field: "name" }], selection: { enabled: false } }, VIEW, STATE).length, 1);
    assert.equal(api.tableColumns({ columns: [{ field: "name" }] }, VIEW, STATE).length, 1);
  });

  /** An explicitly empty header label is honoured, which is why the read is an own-key test. */
  it("labels it from its own header label, even when that label is empty", () => {
    const { api } = columns();
    const named = api.tableColumns({ columns: [], selection: { enabled: true, headerLabel: "Pick" } }, VIEW, STATE);
    assert.equal(named[0].label, "Pick");
    const emptied = api.tableColumns({ columns: [], selection: { enabled: true, headerLabel: "" } }, VIEW, STATE);
    assert.equal(emptied[0].label, "", "an own empty header label is kept, not replaced");
    const labelled = api.tableColumns({ columns: [], selection: { enabled: true, label: "Choose" } }, VIEW, STATE);
    assert.equal(labelled[0].label, "Choose");
    assert.equal(api.tableColumns({ columns: [], selection: { enabled: true } }, VIEW, STATE)[0].label, "Select");
  });

  it("centres it and renders it through the row-selection helper", () => {
    const { api, rendered } = columns();
    const built = api.tableColumns({ columns: [], selection: { enabled: true } }, VIEW, STATE);
    assert.equal(built[0].align, "center");
    built[0].render({ id: "r1" });
    assert.equal(rendered[0][0], "selection");
    assert.equal(rendered[0][2], VIEW);
  });
});

describe("The row-actions column", () => {
  it("appends one only when the table declares row actions", () => {
    const { api } = columns();
    const withActions = api.tableColumns({ columns: [{ field: "name" }], rowActions: [{ id: "edit" }] }, VIEW, STATE);
    assert.equal(withActions.at(-1).key, "__view_row_actions");
    assert.equal(withActions.length, 2);
    assert.equal(api.tableColumns({ columns: [{ field: "name" }], rowActions: [] }, VIEW, STATE).length, 1);
    assert.equal(api.tableColumns({ columns: [{ field: "name" }], rowActions: "edit" }, VIEW, STATE).length, 1,
      "a row-actions value that is not a list declares none");
  });

  /** The same own-key rule: a table may deliberately label the column with nothing. */
  it("labels it Actions unless the table names its own, empty included", () => {
    const { api } = columns();
    const rowActions = [{ id: "edit" }];
    assert.equal(api.tableColumns({ columns: [], rowActions }, VIEW, STATE).at(-1).label, "Actions");
    assert.equal(api.tableColumns({ columns: [], rowActions, rowActionsHeaderLabel: "" }, VIEW, STATE).at(-1).label, "");
    assert.equal(api.tableColumns({ columns: [], rowActions, rowActionsHeaderLabel: "Do" }, VIEW, STATE).at(-1).label, "Do");
  });

  it("right-aligns it and dispatches through the action strip with the row's own record", () => {
    const { api, rendered } = columns();
    const built = api.tableColumns({ columns: [], rowActions: [{ id: "edit" }] }, VIEW, STATE);
    assert.equal(built.at(-1).align, "right");
    built.at(-1).render({ id: "r1" });
    assert.equal(rendered[0][0], "actions");
    assert.deepEqual(plain(rendered[0][1]), [{ id: "edit" }]);
    assert.equal(rendered[0][3], "Row actions");
    assert.equal(rendered[0][4], STATE, "the state by identity");
    assert.deepEqual(plain(rendered[0][5]), { id: "r1" });
  });

  it("answers an empty list of columns for a table that declares none", () => {
    const { api } = columns();
    assert.deepEqual(plain(api.tableColumns({}, VIEW, STATE)), []);
  });
});

describe("view-renderer.js names the layout state it reads", () => {
  it("names the state members without redeclaring the slot renderSurface builds", () => {
    assert.match(source, /@typedef \{object\} RendererState/);
    assert.match(source, /This does not redeclare the state slot/);
    assert.match(source, /@type \{RenderedTableColumn\[\]\}/);
  });

  /** Two findings this child recorded rather than repaired. */
  it("records the uninitialised state member and the surface seam it left open", () => {
    assert.match(source, /`indexCollapsed` is written by `selectIndexRecord` and initialised nowhere/);
    assert.match(source, /correcting\n\s+\* that slot is the seam recorded below as its own child/);
    assert.match(source, /state\.indexCollapsed = true;/, "and the write it names is still there");
  });

  it("coerces the two reads the runtime already coerced, and asserts nothing", () => {
    assert.match(source, /button\.classList\.add\(String\(options\.className\)\);/);
    assert.match(source, /state\.filterValues\?\.\[String\(filter\.field \|\| filter\.id\)\]/);
    assert.doesNotMatch(source, /@ts-(expect-error|ignore|nocheck)/);
    assert.equal((source.match(/\/\*\* @type \{[^}]*\} \*\/ \(/g) || []).length, 0);
  });
});
