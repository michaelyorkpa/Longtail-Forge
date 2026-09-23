import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Lists write path takes, and what it deliberately still does not.
 *
 * `0.33.33.43.23` typed the dialog open/close and save surface. The diff changed no executable
 * line - its one edited line differs only by an inserted comment - so these cases fix the
 * behaviour the annotations describe, and pin the four deferrals this checkpoint recorded.
 *
 * Each deferral names a discharge condition rather than a shrug. A case fails when that reason
 * stops being true, which is the failure `0.33.33.43.8`'s deferral lacked for six checkpoints.
 */

const source = createProjectTextReader().readText("public/js/lists.js");
const contracts = createProjectTextReader().readText("src/types/browser-contracts.d.ts");

/**
 * One catalog suggestion as these cases supply it: every member optional, because the fill's
 * whole job is deciding what to write when one is missing.
 * @typedef {{
 *   catalog_item_id?: unknown, estimated_cost?: unknown, item_name?: string, notes?: unknown,
 *   quantity?: unknown, unit?: unknown, url?: unknown, vendor_name?: unknown
 * }} ListItemSuggestionRow
 */

/**
 * The suggestion fill, lifted with the two helpers it reaches for.
 * @param {ListItemSuggestionRow[]} [suggestions]
 */
function suggestionFill(suggestions = []) {
  const state = { itemSuggestions: new Map([["list-1", suggestions]]) };
  const sandbox = vm.createContext({ state });
  for (const name of ["itemSuggestionsForList", "setFormValue", "applySuggestionSelection"]) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }
  return vm.runInContext("applySuggestionSelection", sandbox);
}

/**
 * A form carrying only the controls this reader writes to.
 * @returns {{ elements: Record<string, { type: string, value: unknown, checked?: boolean }> }}
 */
function form() {
  /** @type {Record<string, { type: string, value: unknown, checked?: boolean }>} */
  const elements = {};
  for (const name of ["catalog_item_id", "quantity", "unit", "vendor_name", "url", "estimated_cost", "notes"]) {
    elements[name] = { type: "text", value: "untouched" };
  }
  return { elements };
}

describe("Filling the item form from a catalog suggestion", () => {
  it("matches on the item name, ignoring case and surrounding space", () => {
    const apply = suggestionFill([{ item_name: "Brass Widget", catalog_item_id: "c-1" }]);
    const target = form();

    apply(target, { list_id: "list-1" }, "  brass WIDGET  ");
    assert.equal(target.elements.catalog_item_id.value, "c-1");
  });

  it("clears the catalog id and writes nothing else when nothing matches", () => {
    const apply = suggestionFill([{ item_name: "Brass Widget", catalog_item_id: "c-1", unit: "each" }]);
    const target = form();

    apply(target, { list_id: "list-1" }, "Something else");
    assert.equal(target.elements.catalog_item_id.value, "", "the stale catalog id is cleared");
    assert.equal(target.elements.unit.value, "untouched", "and the rest of the form is left alone");
  });

  it("clears the catalog id for a list that has no suggestions at all", () => {
    const apply = suggestionFill([]);
    const target = form();

    apply(target, { list_id: "unknown-list" }, "anything");
    assert.equal(target.elements.catalog_item_id.value, "");
  });

  it("fills every field the suggestion carries", () => {
    const apply = suggestionFill([{
      item_name: "Brass Widget", catalog_item_id: "c-1", quantity: 4, unit: "each",
      vendor_name: "Acme", url: "https://example.test/widget", estimated_cost: "12.50", notes: "blue",
    }]);
    const target = form();

    apply(target, { list_id: "list-1" }, "Brass Widget");
    assert.equal(target.elements.quantity.value, 4);
    assert.equal(target.elements.unit.value, "each");
    assert.equal(target.elements.vendor_name.value, "Acme");
    assert.equal(target.elements.url.value, "https://example.test/widget");
    assert.equal(target.elements.estimated_cost.value, "12.50");
    assert.equal(target.elements.notes.value, "blue");
  });

  /**
   * Quantity and cost use `??` while the four text members use `||`, and the two differ on the
   * values a catalog row can really hold: a zero quantity and a zero cost are real.
   */
  it("keeps a zero quantity and a zero cost, but treats empty text as absent", () => {
    const apply = suggestionFill([{ item_name: "Free Sample", quantity: 0, estimated_cost: 0, unit: "" }]);
    const target = form();

    apply(target, { list_id: "list-1" }, "Free Sample");
    assert.equal(target.elements.quantity.value, 0, "`??` keeps a real zero rather than defaulting to 1");
    assert.equal(target.elements.estimated_cost.value, 0);
    assert.equal(target.elements.unit.value, "", "`||` writes the empty string it fell through to");
  });

  it("defaults a missing quantity to one and leaves missing text empty", () => {
    const apply = suggestionFill([{ item_name: "Sparse" }]);
    const target = form();

    apply(target, { list_id: "list-1" }, "Sparse");
    assert.equal(target.elements.quantity.value, 1);
    assert.equal(target.elements.unit.value, "");
    assert.equal(target.elements.notes.value, "");
  });

  it("survives a list that is absent rather than refusing to fill", () => {
    const apply = suggestionFill([]);
    const target = form();

    apply(target, null, "anything");
    assert.equal(target.elements.catalog_item_id.value, "");
  });
});

describe("What the write path declares", () => {
  it("widens the item payload to what it actually holds when it is sent", () => {
    const block = source.slice(source.indexOf("async function saveItem("), source.indexOf("payload.save_to_catalog"));
    assert.match(block, /@type \{Record<string, FormDataEntryValue \| boolean \| number>\}/,
      "FormData answers only strings and files; the next two lines write a number and a boolean");
    assert.match(block, /payload\.quantity = payload\.quantity \|\| 1;/,
      "a missing quantity becomes the number 1");
  });

  it("declares the dialog host context optional in both members, because it is called through ?.", () => {
    assert.match(source, /@typedef \{\{\r?\n\s+\*\s+cancel\?: \(detail\?: unknown\) => unknown,/,
      "a host may supply any of these, or none");
    assert.match(source, /@type \{ListDialogHostContext \| null\}\r?\n\s+\*\/\r?\n\s+listDialogHostContext: null,/,
      "the state slot carries it, because an unannotated null infers never and refuses every read");
    assert.match(source, /state\.listDialogHostContext\?\.refresh/,
      "and every read of it goes through optional access");
  });
});

describe("Deferrals this checkpoint recorded", () => {
  it("leaves the submit handlers' event untyped while the registration requires the event type", () => {
    // Discharged by a checked form accessor at the handler's head, or by the shared view layer
    // handing submit handlers a form. Narrowing the parameter is refused at the registration.
    assert.match(source, /addEventListener\("submit", saveList\)/);
    assert.match(source, /addEventListener\("submit", saveItem\)/);
    const block = source.slice(source.lastIndexOf("/**", source.indexOf("async function saveItem(")), source.indexOf("async function saveItem("));
    assert.doesNotMatch(block, /@param \{[^}]*\} event/,
      "the submit event is annotated; this deferral is discharged and the pin should go with it");
  });

  it("leaves the reorder's list untyped while it builds a route from an optional identifier", () => {
    // Discharged by taking the identifier from `state.editingListId`, which is text, or by a
    // caller that vouches for the record as saved.
    const block = source.slice(source.lastIndexOf("/**", source.indexOf("async function moveItem(")), source.indexOf("async function moveItem("));
    assert.doesNotMatch(block, /@param \{[^}]*\} list/, "the reorder's list is annotated; re-decide this deferral");
    assert.match(source, /encodeURIComponent\(list\.list_id\)\}\/items\/reorder/,
      "the route is still built from the record's own identifier");
    assert.match(contracts, /export interface BrowserNormalizedListRecord[\s\S]*?\n {2}list_id: string \| undefined;/,
      "and that identifier is still optional on the published record");
  });

  it("leaves the list dialog's option bag untyped, for the root 0.33.33.43.20 recorded", () => {
    // Discharged by the same condition as `readListEditorId`: a reader that vouches for the
    // module-action params bag, or the published `params` type naming it.
    const block = source.slice(source.lastIndexOf("/**", source.indexOf("function openListDialog(")), source.indexOf("function openListDialog("));
    assert.doesNotMatch(block, /@param \{[^}]*\} \[?options\]?/, "the dialog's option bag is annotated; re-decide this deferral");
    assert.match(source, /openListEditor/, "the module-action opener that seeds those defaults still exists");
    assert.match(source, /client_id: params\.client_id \|\| params\.clientId \|\| context\.clientId \|\| "",/,
      "and the defaults are still built out of members nothing has proved to be text");
  });
});
