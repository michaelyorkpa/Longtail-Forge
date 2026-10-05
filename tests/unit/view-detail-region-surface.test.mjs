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
 * The detail and region family of `view-renderer.js`, through the real stack.
 *
 * `0.33.33.39.26` typed ten renderers from the framework's own descriptor contracts and changed
 * one executable line: `renderFieldGridShell` now returns early on `!itemForm || !fields.length`
 * where it tested only the empty list. An absent form already produced an empty list, so the two
 * return in the same cases; these prove that, and that a whole detail still composes every part in
 * order, with regions placed where their descriptors say.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

const RECORD = { id: "r1", title: "First", status: "open", note: "Watch this", owner: "Ada", qty: 3 };

/** @param {Bag} descriptor */
function renderDetail(descriptor) {
  const context = createFakeBrowserContext({
    longtailForge: {
      api: { getJson: async () => ({}), postJson: async () => ({}), patchJson: async () => ({}), putJson: async () => ({}), deleteJson: async () => ({}) },
      viewDataBinding: {
        loadBoundRecords: async () => [RECORD],
        readPath: (/** @type {unknown} */ source, /** @type {unknown} */ path) => (isBag(source) ? source[String(path)] : undefined),
      },
      viewSearchOptions: { setFieldOptions: () => {}, setFieldOptionsError: () => {}, mountSearchOptions: () => {} },
    },
  });
  for (const { filename, text } of sources) {
    vm.runInNewContext(text, context, { filename });
  }
  const view = context.window.LongtailForge?.view;
  assert.ok(isBag(view) && isCallable(view.renderSurface), "the stack should publish renderSurface");
  const surface = Reflect.apply(view.renderSurface, view, [{ id: "detail", ...descriptor }, context.document.createElement("main")]);
  assert.ok(isBag(surface));
  assert.ok(isCallable(surface.querySelector));
  const body = Reflect.apply(surface.querySelector, surface, [".view-renderer-body"]);
  assert.ok(isBag(body));
  return { surface, body };
}

/** @param {unknown} node @param {string} selector @returns {Bag[]} */
function queryAll(node, selector) {
  assert.ok(isBag(node) && isCallable(node.querySelectorAll));
  return /** @type {Bag[]} */ (Reflect.apply(node.querySelectorAll, node, [selector]));
}

/** Every node under `node`, in document order. @param {unknown} node @returns {unknown[]} */
function inDocumentOrder(node) {
  const children = isBag(node) && Array.isArray(node.childNodes) ? node.childNodes : [];
  return children.flatMap((child) => [child, ...inDocumentOrder(child)]);
}

describe("renderFieldGridShell returns in exactly the cases it did", () => {
  it("renders no field grid for an absent item form", () => {
    const { body } = renderDetail({ detail: { header: { title: "Detail" } } });
    assert.equal(queryAll(body, ".view-field-grid").length, 0);
  });

  it("renders no field grid for an item form with no fields, or an empty list", () => {
    assert.equal(queryAll(renderDetail({ detail: { itemForm: { title: "Form" } } }).body, ".view-field-grid").length, 0);
    assert.equal(queryAll(renderDetail({ detail: { itemForm: { fields: [] } } }).body, ".view-field-grid").length, 0);
  });

  it("renders the grid for a form with fields, disabled unless the form is editable", () => {
    const fields = [{ field: "title", type: "text", label: "Title" }, { field: "owner", type: "text", label: "Owner" }];
    const locked = renderDetail({ detail: { itemForm: { fields } } }).body;
    assert.equal(queryAll(locked, ".view-field-grid").length, 1);
    const lockedControls = queryAll(locked, ".view-field-grid input");
    assert.equal(lockedControls.length, 2);
    assert.ok(lockedControls.every((control) => control.disabled === true), "a form not marked editable renders disabled controls");

    const editable = renderDetail({ detail: { itemForm: { fields, editable: true } } }).body;
    assert.ok(queryAll(editable, ".view-field-grid input").every((control) => control.disabled !== true), "an editable form does not");
  });
});

describe("A whole detail still composes every part, in order", () => {
  it("renders header, action strip, summary panel, field grid and region in that order", () => {
    const { body } = renderDetail({
      detail: {
        header: { title: "Detail", badges: [{ label: "Open" }] },
        actionStrip: { label: "Detail actions", actions: [{ id: "archive", label: "Archive", behavior: "noop" }] },
        summaryPanels: [{ title: "Summary", items: [{ label: "Owner", value: "Ada" }] }],
        itemForm: { fields: [{ field: "title", type: "text", label: "Title" }] },
        regions: [{ id: "notes", behavior: "noop", title: "Notes" }],
      },
    });
    const markers = [".view-detail-header", "[data-surface-action='noop']", ".view-info-panel", ".view-field-grid", "[data-view-region='notes']"];
    const all = inDocumentOrder(body);
    const positions = markers.map((selector) => {
      const [match] = queryAll(body, selector);
      assert.ok(match, `${selector} should render`);
      return all.indexOf(match);
    });
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, "each part renders after the one before it");
    assert.equal(queryAll(body, ".view-detail-header .surface-chip").length, 1, "the header badge still renders");
  });

  it("places a surface region by placement: default at the end, before-table ahead of the table", () => {
    const { body } = renderDetail({
      layout: "table-page",
      table: { columns: [{ field: "title", label: "Title" }] },
      regions: [
        { id: "after", behavior: "noop" },
        { id: "before", behavior: "noop", placement: "before-table" },
        { id: "elsewhere", behavior: "noop", placement: "sidebar" },
      ],
    });
    const all = inDocumentOrder(body);
    const [before] = queryAll(body, "[data-view-region='before']");
    const [after] = queryAll(body, "[data-view-region='after']");
    const [table] = queryAll(body, "table");
    assert.ok(before && after && table, "both placed regions and the table render");
    assert.ok(all.indexOf(before) < all.indexOf(table) && all.indexOf(table) < all.indexOf(after));
    assert.equal(queryAll(body, "[data-view-region='elsewhere']").length, 0, "an unmatched placement is not rendered here");
  });
});
