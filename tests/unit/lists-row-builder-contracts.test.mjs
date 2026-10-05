import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Lists row and detail builders take, and where those types come from.
 *
 * `0.33.33.43.22` typed the twelve builders that render the list detail. The diff changed no
 * executable line, so what these cases fix is twofold: the behaviour of the two readers the
 * builders derive their types from, and the derivations themselves.
 *
 * The derivation pins matter because a restated type is the failure mode here. `item` is
 * `ReturnType<typeof visibleItems>[number]` rather than the published item contract spelled again,
 * and the action button's view members come from the factory descriptor it forwards them to. Each
 * pin fails if a later edit replaces a derivation with a copy, which is when the two can drift.
 */

const source = createProjectTextReader().readText("public/js/lists.js");
const contracts = createProjectTextReader().readText("src/types/browser-contracts.d.ts");

/** The one projection every row builder derives its element type from. */
function readers() {
  const sandbox = vm.createContext({});
  vm.runInContext(extractFunctionBlock(source, "visibleItems"), sandbox);
  return vm.runInContext("({ visibleItems })", sandbox);
}

/** One item carrying only what the projection touches. */
function item(overrides = {}) {
  return { list_item_id: "i1", item_name: "Widget", deleted_at: null, ...overrides };
}

describe("The visible-item projection", () => {
  it("keeps every item a list holds that is not deleted", () => {
    const { visibleItems } = readers();
    const kept = visibleItems({ items: [item(), item({ list_item_id: "i2" })] });

    assert.equal(kept.length, 2);
    assert.deepEqual(kept.map((/** @type {{ list_item_id: string }} */ entry) => entry.list_item_id), ["i1", "i2"]);
  });

  it("drops the deleted ones, whatever the deletion timestamp says", () => {
    const { visibleItems } = readers();
    const kept = visibleItems({ items: [
      item({ list_item_id: "live" }),
      item({ list_item_id: "gone", deleted_at: "2026-01-01T00:00:00.000Z" }),
      item({ list_item_id: "also-gone", deleted_at: "anything truthy" }),
    ] });

    assert.deepEqual(kept.map((/** @type {{ list_item_id: string }} */ entry) => entry.list_item_id), ["live"]);
  });

  it("treats an absent or empty deletion marker as live", () => {
    const { visibleItems } = readers();
    const kept = visibleItems({ items: [
      item({ list_item_id: "null-marker", deleted_at: null }),
      item({ list_item_id: "undefined-marker", deleted_at: undefined }),
      item({ list_item_id: "empty-marker", deleted_at: "" }),
    ] });

    assert.equal(kept.length, 3, "only a truthy marker deletes an item");
  });

  it("answers an empty list for a record carrying no items", () => {
    const { visibleItems } = readers();

    // Length rather than deepEqual: the projection is lifted into its own realm, so the array it
    // answers is not an instance of this realm's Array.
    assert.equal(visibleItems({}).length, 0);
    assert.equal(visibleItems({ items: [] }).length, 0);
  });

  it("preserves the order it was given, because the row index depends on it", () => {
    const { visibleItems } = readers();
    const kept = visibleItems({ items: [
      item({ list_item_id: "c" }),
      item({ list_item_id: "a" }),
      item({ list_item_id: "b" }),
    ] });

    // `createItemRow` is handed `index` and `items.length` from this projection, so a reordering
    // here would silently renumber every row and mis-disable the reorder controls at the ends.
    assert.deepEqual(kept.map((/** @type {{ list_item_id: string }} */ entry) => entry.list_item_id), ["c", "a", "b"]);
  });
});

describe("What the row builders derive rather than restate", () => {
  it("takes the row item from the projection, not from the published item contract", () => {
    // The whole point of the derivation: the row renders what `visibleItems` produced, so it
    // cannot drift from it. A restated `BrowserListItem` here would compile and still be wrong the
    // day the projection narrows.
    const row = source.slice(source.lastIndexOf("/**", source.indexOf("function createItemRow(")), source.indexOf("function createItemRow("));
    assert.match(row, /@param \{ReturnType<typeof visibleItems>\[number\]\} item/,
      "createItemRow derives its item type from the projection");

    const actions = source.slice(source.lastIndexOf("/**", source.indexOf("function createItemRowActions(")), source.indexOf("function createItemRowActions("));
    assert.match(actions, /@param \{ReturnType<typeof visibleItems>\[number\]\} item/,
      "and so does the row's action strip");
  });

  it("takes the field descriptor from the reader that supplies it", () => {
    const block = source.slice(source.lastIndexOf("/**", source.indexOf("function createItemFieldFromDescriptor(")), source.indexOf("function createItemFieldFromDescriptor("));
    assert.match(block, /@param \{ReturnType<typeof itemFormField> & \{ width\?: string \}\} field/,
      "derived from the reader, intersected with the optional width the fallback shapes omit");
  });

  it("takes the action button's view members from the factory descriptor it forwards them to", () => {
    const block = source.slice(source.lastIndexOf("/**", source.indexOf("function actionButton(")), source.indexOf("function actionButton("));
    assert.match(block, /disabled\?: BrowserViewActionButtonOptions\["disabled"\]/);
    assert.match(block, /icon\?: BrowserViewActionButtonOptions\["icon"\]/);
    assert.match(block, /@param \{BrowserViewActionButtonOptions\["label"\]\} label/);

    // The derivation is only worth anything while the descriptor still declares them.
    assert.match(contracts, /export interface BrowserViewActionButtonOptions \{[\s\S]*?\n {2}disabled\?: BrowserViewFlag;[\s\S]*?\n {2}icon\?: unknown;[\s\S]*?\n {2}label\?: BrowserViewTextValue;/,
      "the factory descriptor still names the three members these derive from");
  });

  it("declares the action id as text-or-absent, because a contributed descriptor's id is", () => {
    const block = source.slice(source.lastIndexOf("/**", source.indexOf("function actionButton(")), source.indexOf("function actionButton("));
    assert.match(block, /@param \{string \| undefined\} action/,
      "one caller forwards a descriptor id straight through, and that id may be absent");
  });
});

describe("Two label maps are read by wire values, not by their own keys", () => {
  it("declares the purchase-status labels open to any status", () => {
    const at = source.indexOf("const PURCHASE_STATUS_LABELS");
    const declaration = source.slice(source.lastIndexOf("/**", at), at);
    assert.match(declaration, /@type \{Record<string, string>\}/,
      "an item's purchase_status is a column value, so an unlisted one must fall through");
  });

  it("declares the row-action icons open to any contributed action id", () => {
    const at = source.indexOf("const ITEM_ROW_ACTION_ICONS");
    const declaration = source.slice(source.lastIndexOf("/**", at), at);
    assert.match(declaration, /@type \{Record<string, string>\}/,
      "a contributed action id is plain text, so an unknown one must fall through to no icon");
  });

  it("keeps both maps reachable by a value this page does not know", () => {
    // Neither map is exhaustive over what can arrive: `purchase_status` is a column and an action
    // id is contributed. Both reads fall through, which is what the open declaration describes.
    assert.match(source, /PURCHASE_STATUS_LABELS\[item\.purchase_status\] \|\| item\.purchase_status \|\| "-"/);
    assert.match(source, /ITEM_ROW_ACTION_ICONS\[action\.id\]/);
  });
});
