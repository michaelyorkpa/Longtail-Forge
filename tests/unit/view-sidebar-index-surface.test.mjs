import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const { readText } = createProjectTextReader();
const sources = [
  "public/js/shared/view-surface-descriptor.js",
  "public/js/shared/view-modal-stack.js",
  "public/js/shared/view-builder.js",
  "public/js/shared/view-action-security.js",
  "public/js/shared/view-renderer.js",
].map((path) => ({ filename: String(path.split("/").pop()), text: readText(path) }));

/**
 * The sidebar and index family of `view-renderer.js`, through the real stack.
 *
 * `0.33.33.39.27` typed seven renderers from the framework's sidebar and index contracts and
 * changed one executable line: `initialSelectedRecord` reads `descriptor.indexPanel?.
 * initialSelection` where it read `(indexPanel || {}).initialSelection`. Both answer the same
 * value for any panel, present or not. Nothing named these seven in a unit test, so these cases
 * run the behaviour they carry: initial and retained selection, selecting from the index, and
 * each sidebar panel kind with its footer.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

const RECORDS = [{ id: "a", title: "Alpha" }, { id: "b", title: "Beta" }];

const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

/** @param {Bag} descriptor */
async function render(descriptor) {
  /** @type {unknown[]} */
  const mounted = [];
  const context = createFakeBrowserContext({
    longtailForge: {
      api: { getJson: async () => ({}), postJson: async () => ({}), patchJson: async () => ({}), putJson: async () => ({}), deleteJson: async () => ({}) },
      viewDataBinding: {
        loadBoundRecords: async () => RECORDS.map((record) => ({ ...record })),
        readPath: (/** @type {unknown} */ source, /** @type {unknown} */ path) => (isBag(source) ? source[String(path)] : undefined),
      },
      viewSearchOptions: { setFieldOptions: () => {}, setFieldOptionsError: () => {}, mountSearchOptions: () => {} },
    },
  });
  for (const { filename, text } of sources) {
    vm.runInNewContext(text, context, { filename });
  }
  const view = context.window.LongtailForge?.view;
  assert.ok(isBag(view) && isCallable(view.renderSurface) && isCallable(view.registerBehavior));
  Reflect.apply(view.registerBehavior, view, ["panel.mount", (/** @type {Bag} */ ctx) => { mounted.push(isBag(ctx.region) ? ctx.region.id : null); }]);
  const surface = Reflect.apply(view.renderSurface, view, [{
    id: "sidebar",
    layout: "sidebar-detail",
    dataSource: { route: "/api/records", fieldBindings: { title: "title" } },
    ...descriptor,
  }, context.document.createElement("main")]);
  assert.ok(isBag(surface) && isBag(surface.viewState));
  await settle();
  return { mounted, state: surface.viewState, surface };
}

/** @param {unknown} node @param {string} selector @returns {Bag[]} */
function queryAll(node, selector) {
  assert.ok(isBag(node) && isCallable(node.querySelectorAll));
  return /** @type {Bag[]} */ (Reflect.apply(node.querySelectorAll, node, [selector]));
}

/** @param {unknown} node */
async function click(node) {
  assert.ok(isBag(node) && isCallable(node.click));
  await Reflect.apply(node.click, node, []);
}

const INDEX = { title: "Records", itemTitleField: "title" };

describe("Initial selection", () => {
  it("selects the first record by default", async () => {
    const { state } = await render({ indexPanel: INDEX });
    assert.ok(isBag(state.selectedRecord));
    assert.equal(state.selectedRecord.id, "a");
    assert.equal(state.selectedRecordId, "a");
  });

  it("selects nothing when the index panel asks for none", async () => {
    const { state } = await render({ indexPanel: { ...INDEX, initialSelection: "none" } });
    assert.equal(state.selectedRecord, null);
  });

  it("selects the first record when there is no index panel at all", async () => {
    const { state } = await render({});
    assert.ok(isBag(state.selectedRecord));
    assert.equal(state.selectedRecord.id, "a");
  });

  it("keeps a retained selection across a reload, and falls back to the first when it is gone", async () => {
    const { state, surface } = await render({ indexPanel: INDEX });
    assert.ok(isCallable(surface.refresh));
    state.selectedRecordId = "b";
    await Reflect.apply(surface.refresh, surface, []);
    assert.ok(isBag(state.selectedRecord));
    assert.equal(state.selectedRecord.id, "b");

    state.selectedRecordId = "gone";
    await Reflect.apply(surface.refresh, surface, []);
    assert.ok(isBag(state.selectedRecord));
    assert.equal(state.selectedRecord.id, "a");
  });
});

describe("Selecting from the index", () => {
  it("selects the clicked record, marks it current, and collapses when the panel asks", async () => {
    const { state, surface } = await render({ indexPanel: { ...INDEX, collapseOnSelect: true } });
    const [beta] = queryAll(surface, "[data-view-index-id='b']");
    assert.ok(beta, "the index lists each record");
    await click(beta);
    assert.ok(isBag(state.selectedRecord));
    assert.equal(state.selectedRecord.id, "b");
    assert.equal(state.selectedRecordId, "b");
    assert.equal(state.indexCollapsed, true);
    const [current] = queryAll(surface, "[data-view-index-id='b']");
    assert.ok(isCallable(current.getAttribute));
    assert.equal(Reflect.apply(current.getAttribute, current, ["aria-current"]), "true");
  });
});

describe("Sidebar panels", () => {
  it("renders each panel kind, with its footer, and mounts every declared region", async () => {
    const { mounted, surface } = await render({
      filters: [{ field: "status", type: "text", label: "Status" }],
      indexPanel: INDEX,
      sidebarPanels: [
        { id: "filters", type: "filters", title: "Filter" },
        { id: "index", type: "index", title: "Index", footer: { label: "Footer note", behavior: "panel.mount" } },
        { id: "nav", type: "navigation", behavior: "panel.mount", title: "Navigation" },
        { id: "empty-nav", type: "navigation", title: "Empty" },
      ],
    });
    const types = queryAll(surface, "[data-view-sidebar-panel]").map((node) => isBag(node.dataset) ? node.dataset.viewSidebarPanelType : undefined);
    assert.deepEqual(types, ["filters", "index", "navigation", "navigation"]);
    assert.equal(queryAll(surface, "[data-view-filter-form]").length, 1, "the filters panel renders the filter form");
    assert.equal(queryAll(surface, "[data-view-index-id]").length, 2, "the index panel renders the records");
    assert.equal(queryAll(surface, ".view-sidebar-panel-footer-text").length, 1, "the footer's label renders");
    // Which regions mount, not how often: a data-bound refresh renders twice and flushes both
    // renders' queued mounts together, so each region mounts more than once. That predates this
    // checkpoint and is recorded in its archive entry rather than pinned here.
    assert.deepEqual([...new Set(mounted)].sort(), ["index-footer", "nav"], "the navigation region and the footer region both mount");
  });

  it("falls back to filters and the index when no sidebar panels are declared", async () => {
    const { surface } = await render({ filters: [{ field: "status", type: "text", label: "Status" }], indexPanel: INDEX });
    assert.equal(queryAll(surface, "[data-view-sidebar-panel]").length, 0);
    assert.equal(queryAll(surface, "[data-view-filter-form]").length, 1);
    assert.equal(queryAll(surface, "[data-view-index-id]").length, 2);
  });
});
