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
 * The three published action-list renderers, after their input was narrowed.
 *
 * `0.33.33.39.25` changed the published parameter of `renderDescriptorActionMenu`,
 * `renderDescriptorActionStrip` and `renderDescriptorInlineActions` from `readonly unknown[]` to
 * `readonly BrowserViewAction[]`. That is a compile-time narrowing with **no intended runtime
 * change**, and these cases hold the runtime to it through the real renderer and builder: nodes
 * arrive as the same nodes with their listeners, option bags still reach `createActionButton`
 * and their callbacks still fire, an omitted or empty list still renders nothing, the caller's
 * array is never written, and a bag the builder cannot render still fails there - it is not
 * filtered out, and no whole-list check runs ahead of the builder.
 */

const RENDERERS = ["renderDescriptorActionMenu", "renderDescriptorActionStrip", "renderDescriptorInlineActions"];

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

function stack() {
  const context = createFakeBrowserContext({
    longtailForge: {
      api: { getJson: async () => ({}), postJson: async () => ({}), patchJson: async () => ({}), putJson: async () => ({}), deleteJson: async () => ({}) },
      viewDataBinding: { loadBoundRecords: async () => [], readPath: () => undefined },
      viewSearchOptions: { setFieldOptions: () => {}, setFieldOptionsError: () => {}, mountSearchOptions: () => {} },
    },
  });
  for (const { filename, text } of sources) {
    vm.runInNewContext(text, context, { filename });
  }
  const view = context.window.LongtailForge?.view;
  assert.ok(isBag(view), "the stack should publish LongtailForge.view");
  return { document: context.document, view };
}

/** @param {Bag} view @param {string} member @param {unknown[]} args */
function render(view, member, args) {
  const fn = view[member];
  assert.ok(isCallable(fn), `the factory should publish ${member}`);
  return Reflect.apply(fn, view, args);
}

/** @param {unknown} node @param {string} selector @returns {Bag[]} */
function queryAll(node, selector) {
  assert.ok(isBag(node) && isCallable(node.querySelectorAll), "a rendered node should support querySelectorAll");
  return /** @type {Bag[]} */ (Reflect.apply(node.querySelectorAll, node, [selector]));
}

/** @param {unknown} node */
async function click(node) {
  assert.ok(isBag(node) && isCallable(node.click), "a control should be clickable");
  await Reflect.apply(node.click, node, []);
}

/** @param {() => unknown} build */
function failure(build) {
  try {
    build();
  } catch (error) {
    assert.ok(isBag(error), "a failure should be an object");
    return { name: String(error.name), message: String(error.message) };
  }
  return null;
}

describe("Nodes pass through as the same nodes", () => {
  for (const member of RENDERERS) {
    it(`${member} keeps each node's identity, order and listeners`, async () => {
      const { document, view } = stack();
      const first = document.createElement("button");
      first.setAttribute("data-owned", "first");
      const second = document.createElement("button");
      second.setAttribute("data-owned", "second");
      /** @type {string[]} */
      const heard = [];
      first.addEventListener("click", () => { heard.push("first"); });

      const rendered = render(view, member, [[first, second], { ariaLabel: "Row actions" }]);

      assert.deepEqual(queryAll(rendered, "[data-owned]"), [first, second]);
      await click(first);
      assert.deepEqual(heard, ["first"], "the listener attached before rendering still fires");
    });
  }
});

describe("Option bags still reach the action-button builder", () => {
  for (const member of RENDERERS) {
    it(`${member} renders a described action and calls its callback`, async () => {
      const { view } = stack();
      let clicks = 0;
      const rendered = render(view, member, [[{ label: "Edit", action: "edit", onClick: () => { clicks += 1; } }], {}]);

      const buttons = queryAll(rendered, "[data-surface-action='edit']");
      assert.equal(buttons.length, 1);
      assert.equal(buttons[0].textContent, "Edit");
      await click(buttons[0]);
      assert.equal(clicks, 1);
    });
  }

  it("keeps a disabled description disabled, and its callback unreached", async () => {
    const { view } = stack();
    let clicks = 0;
    const rendered = render(view, "renderDescriptorActionStrip", [[{ label: "Archive", action: "archive", disabled: true, onClick: () => { clicks += 1; } }]]);
    const [button] = queryAll(rendered, "[data-surface-action='archive']");
    assert.equal(button.disabled, true);
    await click(button);
    assert.equal(clicks, 0);
  });
});

describe("Omitted and empty lists, and the caller's array", () => {
  for (const member of RENDERERS) {
    it(`${member} renders no action for an omitted or empty list, and never writes the caller's array`, () => {
      const { document, view } = stack();
      assert.equal(queryAll(render(view, member, []), "button").length, 0, "no arguments at all");
      assert.equal(queryAll(render(view, member, [undefined, { ariaLabel: "Row actions" }]), "button").length, 0, "an omitted list");
      assert.equal(queryAll(render(view, member, [[], {}]), "button").length, 0, "an empty list");

      const node = document.createElement("button");
      const callerList = Object.freeze([node, { label: "Edit", action: "edit" }]);
      const rendered = render(view, member, [callerList, {}]);
      assert.equal(queryAll(rendered, "button").length, 2, "a frozen caller array renders, so nothing wrote to it");
    });
  }
});

describe("A description the builder cannot render still fails in the builder", () => {
  for (const member of RENDERERS) {
    it(`${member} throws the builder's own error rather than dropping the entry`, () => {
      const { document, view } = stack();
      const expected = { name: "Error", message: "View action buttons require visible text or an accessible label." };
      assert.deepEqual(failure(() => render(view, member, [[{}], {}])), expected, "an unlabelled bag is refused");
      assert.deepEqual(
        failure(() => render(view, member, [[document.createElement("button"), { action: "orphan" }], {}])),
        expected,
        "a valid node beside it does not make the list render without it",
      );
    });
  }

  it("builds each entry in order, so an earlier valid bag is built before a later one fails", () => {
    const { view } = stack();
    /** @type {string[]} */
    const reads = [];
    // `createActionButton` reads a bag's label and then its text before moving on. A check that
    // read every label up front would reach the second label before the first text.
    const labelled = {
      get label() { reads.push("first:label"); return "Edit"; },
      get text() { reads.push("first:text"); return undefined; },
    };
    const unlabelled = {
      get label() { reads.push("second:label"); return ""; },
      get text() { reads.push("second:text"); return undefined; },
    };
    const result = failure(() => render(view, "renderDescriptorInlineActions", [[labelled, unlabelled], {}]));
    assert.equal(result?.message, "View action buttons require visible text or an accessible label.");
    assert.deepEqual(reads.slice(0, 3), ["first:label", "first:text", "second:label"],
      "the first bag is built before the second is examined; no whole-list check runs ahead of the builder");
  });
});
