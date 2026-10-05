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
 * The executable lines `0.33.33.39.28` changed while taking `view-renderer.js` to zero.
 *
 * Most of that checkpoint is annotation. These are the reads it rewrote, each held to what it
 * answered before: `clearHost` empties a host through its own `removeChild`, now read once per
 * child and applied to the host; a failure's `message` is read the way `error.message` read it;
 * the filter controls answer the values their plain property reads answered; and the two paths
 * that used to fail as a native `TypeError` - a host that cannot remove its children, a `multiple`
 * control with no selected options - still fail there as one.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

/** @param {{ load?: () => Promise<unknown[]> }} [options] */
function stack({ load = async () => [] } = {}) {
  const context = createFakeBrowserContext({
    longtailForge: {
      api: { getJson: async () => ({}), postJson: async () => ({}), patchJson: async () => ({}), putJson: async () => ({}), deleteJson: async () => ({}) },
      viewDataBinding: {
        loadBoundRecords: load,
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
  return { document: context.document, view };
}

/** @param {Bag} view @param {unknown} descriptor @param {unknown} host */
function renderSurface(view, descriptor, host) {
  assert.ok(isCallable(view.renderSurface));
  return Reflect.apply(view.renderSurface, view, [descriptor, host]);
}

/** @param {unknown} node @param {string} selector @returns {Bag[]} */
function queryAll(node, selector) {
  assert.ok(isBag(node) && isCallable(node.querySelectorAll));
  return /** @type {Bag[]} */ (Reflect.apply(node.querySelectorAll, node, [selector]));
}

/** @param {() => unknown} build */
function failure(build) {
  try {
    build();
  } catch (error) {
    assert.ok(isBag(error));
    return { name: String(error.name), message: String(error.message) };
  }
  return null;
}

describe("clearHost empties a host through the host's own removeChild", () => {
  it("removes every existing child of a real element before mounting the surface", () => {
    const { document, view } = stack();
    const host = document.createElement("main");
    host.appendChild(document.createElement("p"));
    host.appendChild(document.createElement("p"));
    const surface = renderSurface(view, { id: "cleared" }, host);
    assert.deepEqual(Array.from(host.childNodes), [surface]);
  });

  it("calls removeChild on the host itself, once per child, in order", () => {
    const { document, view } = stack();
    const first = document.createElement("p");
    const second = document.createElement("p");
    /** @type {unknown[]} */
    const children = [first, second];
    /** @type {unknown[]} */
    const calls = [];
    const host = {
      get firstChild() { return children[0] ?? null; },
      removeChild(/** @type {unknown} */ child) { calls.push([this, child]); children.shift(); return child; },
      appendChild(/** @type {unknown} */ child) { return child; },
    };
    renderSurface(view, { id: "stand-in" }, host);
    assert.deepEqual(calls, [[host, first], [host, second]]);
  });

  it("mounts into a host that has no children and no removeChild", () => {
    const { view } = stack();
    /** @type {unknown[]} */
    const appended = [];
    const surface = renderSurface(view, { id: "bare" }, { appendChild: (/** @type {unknown} */ child) => { appended.push(child); return child; } });
    assert.deepEqual(appended, [surface]);
  });

  it("still fails as a TypeError for a host that has children but cannot remove them", () => {
    const { document, view } = stack();
    const host = { firstChild: document.createElement("p"), appendChild: () => undefined };
    assert.deepEqual(failure(() => renderSurface(view, { id: "stuck" }, host)),
      { name: "TypeError", message: "A view host with children must be able to remove them." });
  });
});

describe("Only rendered nodes reach the body", () => {
  it("drops the layout pieces a descriptor omits instead of appending them", () => {
    // The default layout pushes the index panel and the table even when the descriptor has
    // neither, and each answers null. A real document throws on appendChild(null); the double
    // stores it, so this asserts the body directly.
    const { document, view } = stack();
    const surface = renderSurface(view, { id: "sparse", pageHeader: { title: "Sparse" } }, document.createElement("main"));
    const [body] = queryAll(surface, ".view-renderer-body");
    assert.ok(isBag(body));
    const children = Array.isArray(body.childNodes) ? Array.from(body.childNodes) : [];
    assert.equal(children.length, 1, "only the page header renders");
    assert.ok(children.every(isBag), "and nothing but nodes");
  });
});

describe("A recorded failure shows its own message, read as before", () => {
  it("shows an Error's message, a record's message, and the fallback for a message-less failure", async () => {
    for (const [thrown, expected] of /** @type {[unknown, string][]} */ ([
      [new Error("Upstream refused."), "Upstream refused."],
      [{ message: "Plain record." }, "Plain record."],
      ["just a string", "Records could not be loaded."],
      [{ message: "" }, "Records could not be loaded."],
    ])) {
      const { document, view } = stack({ load: async () => { throw thrown; } });
      const surface = renderSurface(view, { id: "failing", dataSource: { route: "/api/r", fieldBindings: { id: "id" } } }, document.createElement("main"));
      await settle();
      const texts = queryAll(surface, ".view-status-message").map((node) => node.textContent);
      assert.ok(texts.includes(expected), `expected "${expected}" among ${JSON.stringify(texts)}`);
    }
  });
});

describe("Filter controls answer what their plain reads answered", () => {
  /**
   * @param {Bag[]} filters
   * @param {(form: Bag) => void} arrange
   */
  async function filterValues(filters, arrange) {
    const { document, view } = stack();
    const surface = renderSurface(view, { id: "filters", layout: "stacked", filters, dataSource: { route: "/api/r", fieldBindings: { id: "id" } } }, document.createElement("main"));
    await settle();
    const [form] = queryAll(surface, "[data-view-filter-form]");
    assert.ok(form, "the stacked layout renders a filter form");
    arrange(form);
    assert.ok(isCallable(form.dispatchEvent));
    Reflect.apply(form.dispatchEvent, form, [{ type: "change" }]);
    assert.ok(isBag(surface));
    const state = surface.viewState;
    assert.ok(isBag(state) && isBag(state.filterValues));
    return state.filterValues;
  }

  it("reads a text control's value, a checkbox's checked state and a multiple select's selections", async () => {
    const values = await filterValues(
      [
        { field: "query", type: "text", label: "Query" },
        { field: "open", type: "checkbox", label: "Open" },
        { field: "tags", type: "multi-select", label: "Tags", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
      ],
      (form) => {
        const [query] = queryAll(form, "[data-view-input='query']");
        query.value = "alpha";
        const [open] = queryAll(form, "[data-view-input='open']");
        open.checked = true;
        const [tags] = queryAll(form, "[data-view-input='tags']");
        assert.ok(isBag(tags));
        const options = queryAll(tags, "option");
        options[1].selected = true;
      },
    );
    assert.equal(values.query, "alpha");
    assert.equal(values.open, true);
    assert.ok(Array.isArray(values.tags), "a multiple select answers a list");
    assert.deepEqual(Array.from(values.tags), ["b"]);
  });
});

describe("A multiple control with no selected options still fails as a TypeError", () => {
  it("throws where the spread of undefined threw, with a message", async () => {
    const { document, view } = stack();
    const surface = renderSurface(view, { id: "odd", layout: "stacked", filters: [{ field: "query", type: "text", label: "Query" }], dataSource: { route: "/api/r", fieldBindings: { id: "id" } } }, document.createElement("main"));
    await settle();
    const [form] = queryAll(surface, "[data-view-filter-form]");
    const [query] = queryAll(form, "[data-view-input='query']");
    // A real `<input multiple>` - an email or file field - has `multiple` and no `selectedOptions`.
    // The double gives every element a `selectedOptions` getter, so this one is given the real
    // input's shape by an own property that answers `undefined`.
    query.multiple = true;
    Object.defineProperty(query, "selectedOptions", { value: undefined });
    const dispatch = form.dispatchEvent;
    assert.ok(isCallable(dispatch));
    assert.deepEqual(failure(() => Reflect.apply(dispatch, form, [{ type: "change" }])),
      { name: "TypeError", message: "A multiple filter control must expose its selected options." });
  });
});
