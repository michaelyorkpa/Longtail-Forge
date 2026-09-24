import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the last of the Lists helpers take, and the two that could not be typed.
 *
 * `0.33.33.43.29` swept the long tail - the record readers and the small builders that were left
 * after the named clusters. Its diff changes no executable line, so these cases fix the behaviour
 * the annotations describe and pin what stayed open.
 *
 * Two readers joined the shared root here, taking it from five to seven. That note and its pin in
 * `lists-action-dispatch-contracts` moved in the same change, which is the only way a pin against
 * fragmentation is worth having.
 */

const source = createProjectTextReader().readText("public/js/lists.js");

/**
 * One helper, lifted with whatever it reaches for.
 * @param {string} name @param {Record<string, unknown>} [extra]
 */
function lift(name, extra = {}) {
  const sandbox = vm.createContext({ ...extra });
  vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return vm.runInContext(name, sandbox);
}

describe("Resolving which list a surface's record refers to", () => {
  /** @param {unknown[]} lists @param {unknown} fallback */
  function resolver(lists, fallback = null) {
    const sandbox = vm.createContext({ state: { lists, selectedListId: "selected" }, selectedList: () => fallback });
    vm.runInContext(extractFunctionBlock(source, "resolveListRecord"), sandbox);
    return vm.runInContext("resolveListRecord", sandbox);
  }

  it("takes the four identifier spellings in their declared order", () => {
    const lists = [{ list_id: "a" }, { list_id: "b" }, { list_id: "c" }, { list_id: "d" }];
    const resolve = resolver(lists);

    assert.equal(resolve({ list_id: "a", id: "b", _source: { list_id: "c", id: "d" } }).list_id, "a");
    assert.equal(resolve({ id: "b", _source: { list_id: "c", id: "d" } }).list_id, "b");
    assert.equal(resolve({ _source: { list_id: "c", id: "d" } }).list_id, "c");
    assert.equal(resolve({ _source: { id: "d" } }).list_id, "d");
  });

  it("falls back to the current selection when the record names nothing", () => {
    const resolve = resolver([{ list_id: "selected" }]);

    assert.equal(resolve({}).list_id, "selected");
    assert.equal(resolve(null).list_id, "selected");
    assert.equal(resolve(undefined).list_id, "selected");
  });

  it("answers the page's own selected list when the identifier matches nothing held", () => {
    const fallback = { list_id: "from-selection" };
    const resolve = resolver([{ list_id: "held" }], fallback);

    assert.equal(resolve({ list_id: "not-held" }), fallback);
  });

  it("reads a search result's nested source, which no List contract names", () => {
    const resolve = resolver([{ list_id: "found" }]);

    assert.equal(resolve({ _source: { list_id: "found" } }).list_id, "found");
    assert.doesNotThrow(() => resolve({ _source: null }), "and tolerates one carrying none");
  });
});

describe("The earliest needed-by date across items", () => {
  it("answers the earliest date any item carries", () => {
    const nextNeededDateFromItems = lift("nextNeededDateFromItems");
    const items = [
      { needed_by_date: "2026-03-01" },
      { needed_by_date: "2026-01-15" },
      { needed_by_date: "2026-02-01" },
    ];

    assert.equal(nextNeededDateFromItems(items), "2026-01-15");
  });

  it("ignores items carrying no date rather than sorting them first", () => {
    const nextNeededDateFromItems = lift("nextNeededDateFromItems");
    const items = [{ needed_by_date: null }, { needed_by_date: "" }, {}, { needed_by_date: "2026-05-05" }];

    assert.equal(nextNeededDateFromItems(items), "2026-05-05");
  });

  it("answers an empty string when no item carries one, and for no items at all", () => {
    const nextNeededDateFromItems = lift("nextNeededDateFromItems");

    assert.equal(nextNeededDateFromItems([{ needed_by_date: null }]), "");
    assert.equal(nextNeededDateFromItems([]), "");
    assert.equal(nextNeededDateFromItems(), "");
  });
});

describe("The list description excerpt", () => {
  it("collapses whitespace and trims", () => {
    const excerpt = lift("listDescriptionExcerpt");

    assert.equal(excerpt({ description: "  two   words \n here  " }), "two words here");
  });

  it("leaves a description at the limit whole, and shortens a longer one", () => {
    const excerpt = lift("listDescriptionExcerpt");
    const atLimit = "x".repeat(96);
    const past = "y".repeat(97);

    assert.equal(excerpt({ description: atLimit }), atLimit, "96 characters is not past the limit");
    assert.equal(excerpt({ description: past }), `${"y".repeat(93)}...`);
    assert.equal(excerpt({ description: past }).length, 96, "the shortened form is itself 96");
  });

  it("answers empty for a description that is absent or only whitespace", () => {
    const excerpt = lift("listDescriptionExcerpt");

    assert.equal(excerpt({}), "");
    assert.equal(excerpt({ description: null }), "");
    assert.equal(excerpt({ description: "   \n  " }), "");
  });
});

describe("The read-only message for a locked list", () => {
  it("names the reason for each of the three locked states", () => {
    const readOnlyStateMessage = lift("readOnlyStateMessage", { STATUS_LABELS: {} });

    assert.match(readOnlyStateMessage({ status: "finalized" }), /^Finalized lists are read-only\./);
    assert.match(readOnlyStateMessage({ status: "archived" }), /^Archived lists are read-only\./);
    assert.match(readOnlyStateMessage({ status: "deleted" }), /^Deleted lists are read-only\./);
  });

  it("falls back to the status label for any other locked state", () => {
    const readOnlyStateMessage = lift("readOnlyStateMessage", { STATUS_LABELS: { completed: "Completed" } });

    assert.equal(readOnlyStateMessage({ status: "completed" }), "Completed lists are read-only.");
  });

  it("says Locked for a status it has no label for, including none at all", () => {
    const readOnlyStateMessage = lift("readOnlyStateMessage", { STATUS_LABELS: {} });

    assert.equal(readOnlyStateMessage({ status: "unheard-of" }), "Locked lists are read-only.");
    assert.equal(readOnlyStateMessage({}), "Locked lists are read-only.");
  });
});

describe("What stayed open, and why", () => {
  it("leaves the descriptor field reader untyped, because its consumer appends the label", () => {
    // Discharged by the descriptor contract naming `label`, or by a reader that vouches for it.
    // Declaring the parameter resolves the return to the published union, whose `label` is
    // `unknown` through its index signature.
    const at = source.indexOf("function itemFormField(");
    const block = source.slice(source.lastIndexOf("/**", at), at);

    assert.doesNotMatch(block, /@param \{[^}]*\} fieldName/,
      "the field reader is annotated; this deferral is discharged and the pin should go with it");
    assert.match(source, /label\.append\(field\.label \|\| "Item", input, dataList\);/,
      "and the name field still appends that value directly");
  });

  it("gave the record reference a name rather than two inline shapes", () => {
    assert.match(source, /\}\s*\| null\} ListRecordReference/,
      "the tolerated reference is declared once");
    assert.match(source, /@param \{ListRecordReference\} \[record\]/, "and the resolver takes it");
    assert.match(source, /@param \{string\} action @param \{ListRecordReference\} record/,
      "as does the behaviour that forwards it unread");
  });

  it("records the two readers that joined the shared root here", () => {
    const at = source.indexOf("async function runAction(");
    const block = source.slice(source.lastIndexOf("/**", at), at);

    assert.match(block, /seven readers now share this one root/);
    assert.match(block, /`listState` and `readOnlyStateMessage` index the status label map/);
    assert.equal(block.match(/discharged by/gi)?.length, 1,
      "still one condition, however many readers share it");
  });
});
