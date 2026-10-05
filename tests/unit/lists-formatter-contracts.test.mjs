import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Lists formatters convert, and what they answer for what they cannot.
 *
 * `0.33.33.43.28` typed the presentation helpers - everything that turns a record member into
 * display text. The diff changes no executable line, so these cases fix the conversions the
 * annotations describe: which spelling wins, what an absent value becomes, and where a value
 * passes through unconverted.
 */

const source = createProjectTextReader().readText("public/js/lists.js");

/**
 * One formatter, lifted with whatever it reaches for.
 * @param {string} name @param {Record<string, unknown>} [extra]
 */
function lift(name, extra = {}) {
  const sandbox = vm.createContext({ ...extra });
  vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return vm.runInContext(name, sandbox);
}

describe("Shortening an item name", () => {
  it("leaves a name at or under the limit exactly as it was", () => {
    const truncate = lift("truncateItemName");

    assert.equal(truncate("Widget", 20), "Widget");
    assert.equal(truncate("12345", 5), "12345", "the limit itself is not past it");
  });

  it("shortens a longer name and marks it", () => {
    const truncate = lift("truncateItemName");
    const shortened = truncate("123456", 5);

    assert.equal(shortened, "12345…");
    assert.equal(shortened.length, 6, "the mark is one character, not three");
  });

  it("converts whatever it is given, and answers empty for nothing", () => {
    const truncate = lift("truncateItemName");

    assert.equal(truncate(undefined, 5), "");
    assert.equal(truncate(null, 5), "");
    assert.equal(truncate(0, 5), "", "`||` treats zero as absent, which is the existing behaviour");
    assert.equal(truncate(12345678, 5), "12345…");
  });
});

describe("Title-casing a token", () => {
  it("turns separators into spaces and capitalises each word", () => {
    const formatToken = lift("formatToken");

    assert.equal(formatToken("bill_of_materials"), "Bill Of Materials");
    assert.equal(formatToken("not-needed"), "Not Needed");
    assert.equal(formatToken("shopping"), "Shopping");
  });

  it("collapses a run of separators rather than making empty words", () => {
    const formatToken = lift("formatToken");

    assert.equal(formatToken("a__b--c"), "A B C");
  });

  it("answers empty for anything falsy", () => {
    const formatToken = lift("formatToken");

    for (const value of [undefined, null, "", 0, false]) {
      assert.equal(formatToken(value), "", `${JSON.stringify(value)} formats to empty`);
    }
  });
});

describe("Formatting an amount", () => {
  it("answers empty for anything that is not a finite number", () => {
    const formatCurrency = lift("formatCurrency", { Intl });

    for (const value of [undefined, "abc", {}, Number.NaN, Infinity, -Infinity]) {
      assert.equal(formatCurrency(value), "", `${JSON.stringify(String(value))} has no amount`);
    }
  });

  it("renders the values Number treats as zero as an amount, not as a blank", () => {
    const formatCurrency = lift("formatCurrency", { Intl });

    // `Number(null)`, `Number("")` and `Number([])` are all 0, which is finite. A null cost
    // therefore shows as a zero amount rather than an empty cell - existing behaviour, pinned
    // here because it reads as a surprise and a future guard would change it silently.
    for (const value of [null, "", []]) {
      assert.match(formatCurrency(value), /0\.00/, `${JSON.stringify(value)} is a zero amount`);
    }
  });

  it("formats a number, and a numeric string, as currency", () => {
    const formatCurrency = lift("formatCurrency", { Intl });

    assert.match(formatCurrency(12.5), /12\.50/);
    assert.match(formatCurrency("12.5"), /12\.50/, "a numeric string converts, because Number does");
    assert.match(formatCurrency(0), /0\.00/, "and zero is an amount, not an absence");
  });
});

describe("Naming a user", () => {
  it("takes the first spelling present, in the page's order", () => {
    const displayUser = lift("displayUser");
    const all = { display_name: "snake", displayName: "camel", username: "user", user_id: "id" };

    assert.equal(displayUser(all), "snake");
    assert.equal(displayUser({ displayName: "camel", username: "user" }), "camel");
    assert.equal(displayUser({ username: "user", user_id: "id" }), "user");
    assert.equal(displayUser({ user_id: "id" }), "id");
  });

  it("falls past an empty spelling to the next one", () => {
    const displayUser = lift("displayUser");

    assert.equal(displayUser({ display_name: "", displayName: "camel" }), "camel");
  });

  it("answers empty for no user at all, rather than throwing", () => {
    const displayUser = lift("displayUser");

    assert.equal(displayUser(null), "");
    assert.equal(displayUser(undefined), "");
    assert.equal(displayUser({}), "");
  });
});

describe("Labelling a catalog suggestion", () => {
  it("answers the name alone when the suggestion carries nothing else", () => {
    const suggestionLabel = lift("suggestionLabel");

    assert.equal(suggestionLabel({ item_name: "Widget" }), "Widget");
  });

  it("appends the pieces it has, separated in order", () => {
    const suggestionLabel = lift("suggestionLabel");
    const label = suggestionLabel({ item_name: "Widget", quantity: 4, unit: "each", vendor_name: "Acme", use_count: 3 });

    assert.equal(label, "Widget - 4 each / Acme / used 3");
  });

  it("drops a zero quantity from the label, because the filter sees the number", () => {
    const suggestionLabel = lift("suggestionLabel");

    // `?? ""` keeps the zero, but the inner `filter(Boolean)` runs on `[0, ""]` - the number, not
    // the string - so both are dropped, the joined piece is empty, and the outer filter removes it.
    assert.equal(suggestionLabel({ item_name: "Free", quantity: 0 }), "Free");
    assert.equal(suggestionLabel({ item_name: "Free", quantity: 2 }), "Free - 2", "a real quantity survives");
  });

  it("omits a zero use count, which is the falsy branch", () => {
    const suggestionLabel = lift("suggestionLabel");

    assert.equal(suggestionLabel({ item_name: "Widget", use_count: 0 }), "Widget");
  });
});

describe("Labelling the duplicate action", () => {
  it("offers a working copy for a reusable list", () => {
    const duplicateActionLabel = lift("duplicateActionLabel");

    assert.equal(duplicateActionLabel({ is_reusable: true }), "Create Working Copy");
  });

  it("offers duplication into active work for a finalized list or a bill of materials", () => {
    const duplicateActionLabel = lift("duplicateActionLabel");

    assert.equal(duplicateActionLabel({ status: "finalized" }), "Duplicate into Active Work");
    assert.equal(duplicateActionLabel({ isBillOfMaterials: true }), "Duplicate into Active Work");
    assert.equal(duplicateActionLabel({ list_type: "bill_of_materials" }), "Duplicate into Active Work");
  });

  it("offers plain duplication otherwise, including for a record carrying nothing", () => {
    const duplicateActionLabel = lift("duplicateActionLabel");

    assert.equal(duplicateActionLabel({}), "Duplicate");
    assert.equal(duplicateActionLabel({ status: "active" }), "Duplicate");
  });

  it("prefers the reusable answer over the finalized one", () => {
    const duplicateActionLabel = lift("duplicateActionLabel");

    assert.equal(duplicateActionLabel({ is_reusable: true, status: "finalized" }), "Create Working Copy");
  });
});

describe("Summarising linked records", () => {
  it("counts only the links whose target carries a label as available", () => {
    const linkedRecordSummary = lift("linkedRecordSummary");
    const list = { links: [
      { target: { label: "A" } },
      { target: { label: "B" } },
      { target: null },
      {},
    ] };

    assert.equal(linkedRecordSummary(list), "2 linked records, 2 unavailable");
  });

  it("uses the singular for exactly one, and omits the unavailable clause when there is none", () => {
    const linkedRecordSummary = lift("linkedRecordSummary");

    assert.equal(linkedRecordSummary({ links: [{ target: { label: "A" } }] }), "1 linked record");
  });

  it("answers empty for a list with no links at all", () => {
    const linkedRecordSummary = lift("linkedRecordSummary");

    assert.equal(linkedRecordSummary({ links: [] }), "");
    assert.equal(linkedRecordSummary({}), "");
  });

  it("counts a link whose target has an empty label as unavailable", () => {
    const linkedRecordSummary = lift("linkedRecordSummary");

    assert.equal(linkedRecordSummary({ links: [{ target: { label: "" } }] }), "0 linked records, 1 unavailable");
  });
});

describe("Describing where a list came from", () => {
  it("names both when a working copy and its template differ", () => {
    const sourceContextLabel = lift("sourceContextLabel");
    const label = sourceContextLabel({ sourceContext: {
      duplicatedFrom: { list_id: "a", title: "Copy source" },
      sourceList: { list_id: "b", title: "Template" },
    } });

    assert.equal(label, "Independent working copy from Copy source; original template Template.");
  });

  it("names one when both point at the same list", () => {
    const sourceContextLabel = lift("sourceContextLabel");
    const label = sourceContextLabel({ sourceContext: {
      duplicatedFrom: { list_id: "same", title: "Origin" },
      sourceList: { list_id: "same", title: "Origin" },
    } });

    assert.equal(label, "Independent working copy from Origin.");
  });

  it("accepts the snake_case spellings, which appear on no List contract", () => {
    const sourceContextLabel = lift("sourceContextLabel");
    const label = sourceContextLabel({ sourceContext: {
      duplicated_from: { list_id: "a", title: "Snake source" },
    } });

    assert.equal(label, "Independent working copy from Snake source.");
  });

  it("survives a context that is absent, empty, or carries no titles", () => {
    const sourceContextLabel = lift("sourceContextLabel");

    for (const sourceContext of [undefined, null, {}, { duplicatedFrom: { list_id: "a" } }]) {
      assert.doesNotThrow(() => sourceContextLabel({ sourceContext }));
    }
  });
});
