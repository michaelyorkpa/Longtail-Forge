import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

/**
 * `LongtailForge.view.partsOf`, the framework's checked reader for element parts (`0.33.33.38.3.11`).
 *
 * A page that finds a framework element by searching gets back an `Element`, which says nothing
 * about `viewParts`. The reader answers from the framework's own record of what it built, so what
 * these cases pin is what that record may and may not vouch for:
 *
 * 1. **The very parts, not a copy.** It answers the frozen object `viewParts` already holds.
 * 2. **Only what the framework built, as that kind.** Another kind, another builder's element, a
 *    hand-made `viewParts` property and non-objects all answer `null`.
 * 3. **It survives the renderer.** The renderer republishes the factory by spreading it.
 *
 * The real builder runs in a fake browser context, with the modal stack it delegates to.
 */

const reader = createProjectTextReader();
const builderSource = reader.readText("public/js/shared/view-builder.js");
const modalStackSource = reader.readText("public/js/shared/view-modal-stack.js");
const rendererSource = reader.readText("public/js/shared/view-renderer.js");
const declarationSource = reader.readText("src/types/browser-contracts.d.ts");

function bootView() {
  const context = createFakeBrowserContext();
  vm.runInNewContext(modalStackSource, context, { filename: "view-modal-stack.js" });
  vm.runInNewContext(builderSource, context, { filename: "view-builder.js" });
  return { context, view: vm.runInContext("window.LongtailForge.view", context) };
}

describe("What partsOf answers", () => {
  it("answers the very parts a framework bulk toolbar carries", () => {
    const { view } = bootView();
    const toolbar = view.createBulkActionToolbar({ label: "Selected" });

    assert.equal(view.partsOf(toolbar, "bulkActionToolbar"), toolbar.viewParts, "the same object, not a copy");
    assert.ok(Object.isFrozen(view.partsOf(toolbar, "bulkActionToolbar")));
    assert.equal(view.partsOf(toolbar, "bulkActionToolbar").count, toolbar.viewParts.count);
  });

  it("answers the very parts a framework linked-context picker carries", () => {
    const { view } = bootView();
    const picker = view.createLinkedContextPicker({});

    assert.equal(view.partsOf(picker, "linkedContextPicker"), picker.viewParts);
    assert.equal(typeof view.partsOf(picker, "linkedContextPicker").setRecords, "function");
  });
});

describe("What partsOf refuses", () => {
  it("refuses an element the framework built as another kind", () => {
    const { view } = bootView();
    const toolbar = view.createBulkActionToolbar({});
    const picker = view.createLinkedContextPicker({});

    assert.equal(view.partsOf(toolbar, "linkedContextPicker"), null);
    assert.equal(view.partsOf(picker, "bulkActionToolbar"), null);
  });

  it("refuses an element another builder made, although it carries viewParts", () => {
    const { view } = bootView();
    const modal = view.createModal({ title: "Modal" });

    assert.ok(modal.viewParts, "the modal does carry parts");
    assert.equal(view.partsOf(modal, "bulkActionToolbar"), null);
    assert.equal(view.partsOf(modal, "linkedContextPicker"), null);
  });

  it("refuses an element that merely carries a viewParts property of its own", () => {
    const { context, view } = bootView();
    const imitation = context.document.createElement("details");
    Object.defineProperty(imitation, "viewParts", { value: Object.freeze({ count: context.document.createElement("span") }) });

    assert.equal(view.partsOf(imitation, "bulkActionToolbar"), null,
      "a property anyone can set is not the framework's record");
  });

  it("answers null for anything that is not an object", () => {
    const { view } = bootView();

    for (const value of [null, undefined, "details", 7, true]) {
      assert.equal(view.partsOf(value, "bulkActionToolbar"), null);
    }
  });
});

describe("Where it is published", () => {
  it("is a builder member, and the renderer's republication keeps it", () => {
    const { view } = bootView();
    assert.equal(typeof view.partsOf, "function");
    assert.match(builderSource, /root\.view = Object\.freeze\(\{[\s\S]*\n {4}partsOf,\n[\s\S]*\}\);/);
    assert.match(rendererSource, /root\.view = Object\.freeze\(\{\s*\n\s*\.\.\.root\.view,/,
      "the renderer spreads the builder's factory, so the member survives it");
  });

  it("records exactly the kinds the contract declares, each where its builder assigns its parts", () => {
    const declared = declarationSource.match(/export interface BrowserViewPartsByKind \{([\s\S]*?)\n\}/);
    assert.ok(declared, "the kind map is declared");
    assert.deepEqual([...declared[1].matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]), ["bulkActionToolbar", "linkedContextPicker"]);
    assert.match(builderSource, /assignViewParts\(toolbar, \{ body, count, label, summary \}\);\n\s+partsByKind\.bulkActionToolbar\.set\(toolbar, toolbar\.viewParts\);/);
    assert.match(builderSource, /\}\);\n\s+partsByKind\.linkedContextPicker\.set\(picker, picker\.viewParts\);\n\s+return picker;/);
  });
});
