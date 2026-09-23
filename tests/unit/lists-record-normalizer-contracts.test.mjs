import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Lists record normalisers accept, and what they guarantee.
 *
 * `0.33.33.43.19` typed the pair `0.33.33.43.2` deferred, naming its cost as "twenty `unknown`
 * reads and two snake_case aliases the shaper does not emit". Both halves of that were still true:
 * ten camelCase/snake_case pairs on the progress bag, and `resume_context`/`source_context`, which
 * appear on no List contract.
 *
 * The normalisers changed no executable line, so these cases fix what they already did - precedence
 * between the two spellings, the fallbacks, the deleted-item filter, the counts, and the ordering -
 * and pin the two conditions that would discharge this checkpoint's deferrals.
 */

const source = createProjectTextReader().readText("public/js/lists.js");
const contracts = createProjectTextReader().readText("src/types/browser-contracts.d.ts");

/** @param {unknown} value */
function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** The two normalisers, lifted with the one helper they reach for. */
function normalisers() {
  const sandbox = vm.createContext({});
  vm.runInContext("globalThis.nextNeededDateFromItems = () => '';", sandbox);
  for (const name of ["normalizeListProgress", "normalizeListRecord"]) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }

  return vm.runInContext("({ normalizeListProgress, normalizeListRecord })", sandbox);
}

/** One item carrying only what these readers touch. */
function item(overrides = {}) {
  return {
    list_item_id: "i1", item_name: "Widget", sort_order: 1,
    checked_at: null, completed_at: null, deleted_at: null, assigned_user_id: null,
    ...overrides,
  };
}

describe("The progress bag is read in both spellings, camelCase first", () => {
  it("prefers the camelCase member when both are present", () => {
    const { normalizeListProgress } = normalisers();
    const out = normalizeListProgress({
      checkedItemCount: 7, checked_item_count: 99,
      lastActivityAt: "camel", last_activity_at: "snake",
      neededByDates: ["camel"], needed_by_dates: ["snake"],
    }, []);

    assert.equal(out.checkedItemCount, 7);
    assert.equal(out.lastActivityAt, "camel");
    assert.deepEqual(plain(out.neededByDates), ["camel"]);
  });

  it("falls through to the snake_case member when the camelCase one is absent", () => {
    const { normalizeListProgress } = normalisers();
    const out = normalizeListProgress({
      checked_item_count: 4, completed_item_count: 3, incomplete_item_count: 2,
      total_item_count: 9, unassigned_item_count: 1,
      assigned_user_ids: ["u1"], earliest_needed_by_date: "2026-01-01",
      last_activity_at: "then", needed_by_dates: ["2026-01-01"],
      next_unchecked_item_label: "Next one",
    }, []);

    assert.equal(out.checkedItemCount, 4);
    assert.equal(out.completedItemCount, 3);
    assert.equal(out.incompleteItemCount, 2);
    assert.equal(out.totalItemCount, 9);
    assert.equal(out.unassignedItemCount, 1);
    assert.deepEqual(plain(out.assignedUserIds), ["u1"]);
    assert.equal(out.earliestNeededByDate, "2026-01-01");
    assert.equal(out.lastActivityAt, "then");
    assert.equal(out.nextUncheckedItemLabel, "Next one");
  });

  /**
   * The five counts use `??` and the five opaque members use `||`, which differ on zero and empty
   * string. A count of zero must survive; an empty label must not.
   */
  it("keeps a zero count but lets an empty label fall through", () => {
    const { normalizeListProgress } = normalisers();
    const items = [item(), item({ list_item_id: "i2" })];
    const out = normalizeListProgress({ checkedItemCount: 0, nextUncheckedItemLabel: "" }, items);

    assert.equal(out.checkedItemCount, 0, "`??` keeps a real zero rather than recomputing");
    assert.equal(out.nextUncheckedItemLabel, "Widget", "`||` treats an empty label as absent");
  });

  it("converts the counts it is given, because the return promises numbers", () => {
    const { normalizeListProgress } = normalisers();
    const out = normalizeListProgress({ checkedItemCount: "5", totalItemCount: "  8  " }, []);

    assert.equal(out.checkedItemCount, 5);
    assert.equal(out.totalItemCount, 8);
  });
});

describe("Counts are derived from the items when the bag says nothing", () => {
  it("ignores deleted items in every count", () => {
    const { normalizeListProgress } = normalisers();
    const items = [
      item({ list_item_id: "a" }),
      item({ list_item_id: "b", deleted_at: "2026-01-01" }),
      item({ list_item_id: "c", checked_at: "2026-01-02" }),
    ];
    const out = normalizeListProgress({}, items);

    assert.equal(out.totalItemCount, 2, "the deleted one is not visible");
    assert.equal(out.checkedItemCount, 1);
    assert.equal(out.incompleteItemCount, 1);
  });

  it("counts checked and completed separately", () => {
    const { normalizeListProgress } = normalisers();
    const items = [
      item({ list_item_id: "a", checked_at: "x" }),
      item({ list_item_id: "b", completed_at: "y" }),
      item({ list_item_id: "c" }),
    ];
    const out = normalizeListProgress({}, items);

    assert.equal(out.checkedItemCount, 1);
    assert.equal(out.completedItemCount, 1);
    assert.equal(out.incompleteItemCount, 1, "neither checked nor completed");
  });

  it("names the next unchecked item in sort order", () => {
    const { normalizeListProgress } = normalisers();
    const items = [
      item({ list_item_id: "late", item_name: "Later", sort_order: 9 }),
      item({ list_item_id: "early", item_name: "Earlier", sort_order: 2 }),
      item({ list_item_id: "done", item_name: "Done", sort_order: 1, checked_at: "x" }),
    ];

    assert.equal(normalizeListProgress({}, items).nextUncheckedItemLabel, "Earlier");
  });

  it("treats an absent sort order as zero without disturbing the rest", () => {
    const { normalizeListProgress } = normalisers();
    const items = [
      item({ list_item_id: "ordered", item_name: "Ordered", sort_order: 5 }),
      item({ list_item_id: "unordered", item_name: "Unordered", sort_order: undefined }),
    ];

    assert.equal(normalizeListProgress({}, items).nextUncheckedItemLabel, "Unordered", "?? 0 sorts it first");
  });

  it("counts unassigned items among the visible ones", () => {
    const { normalizeListProgress } = normalisers();
    const items = [
      item({ list_item_id: "a", assigned_user_id: "u1" }),
      item({ list_item_id: "b" }),
      item({ list_item_id: "c", deleted_at: "gone" }),
    ];

    assert.equal(normalizeListProgress({}, items).unassignedItemCount, 1);
  });

  it("answers a whole summary for nothing at all", () => {
    const { normalizeListProgress } = normalisers();

    assert.deepEqual(plain(normalizeListProgress()), {
      assignedUserIds: [], checkedItemCount: 0, completedItemCount: 0,
      earliestNeededByDate: null, incompleteItemCount: 0, lastActivityAt: "",
      neededByDates: [], nextUncheckedItemLabel: "", totalItemCount: 0, unassignedItemCount: 0,
    });
  });
});

describe("The record normaliser rebuilds nine members and passes the rest through", () => {
  it("adds an id to each item and link without dropping what they carried", () => {
    const { normalizeListRecord } = normalisers();
    const out = normalizeListRecord(
      { list_id: "l1" },
      [item({ list_item_id: "i9", notes: "kept" })],
      [{ list_link_id: "k1", label: "kept too" }],
    );

    assert.equal(out.items[0].id, "i9");
    assert.equal(out.items[0].notes, "kept", "the spread keeps every other member");
    assert.equal(out.links[0].id, "k1");
    assert.equal(out.links[0].label, "kept too");
  });

  it("coerces is_reusable from either spelling, because the wire sends a number", () => {
    const { normalizeListRecord } = normalisers();

    assert.equal(normalizeListRecord({ is_reusable: 1 }).is_reusable, true);
    assert.equal(normalizeListRecord({ is_reusable: 0 }).is_reusable, false);
    assert.equal(normalizeListRecord({ isReusable: true }).is_reusable, true);
    assert.equal(normalizeListRecord({ is_reusable: 0, isReusable: true }).is_reusable, false,
      "?? keeps a real 0 rather than falling through to the camelCase flag");
  });

  it("derives the bill-of-materials flag from either the flag or the list type", () => {
    const { normalizeListRecord } = normalisers();

    assert.equal(normalizeListRecord({ isBillOfMaterials: true }).isBillOfMaterials, true);
    assert.equal(normalizeListRecord({ list_type: "bill_of_materials" }).isBillOfMaterials, true);
    assert.equal(normalizeListRecord({ list_type: "shopping" }).isBillOfMaterials, false);
  });

  it("carries one identifier vocabulary, and leaves a draft undefined", () => {
    const { normalizeListRecord } = normalisers();

    assert.equal(normalizeListRecord({ list_id: "l1" }).id, "l1");
    assert.equal(normalizeListRecord({ id: "l2" }).list_id, "l2");
    assert.equal(normalizeListRecord({}).id, undefined, "a draft the editor has not created yet");
    assert.equal(normalizeListRecord({}).list_id, undefined);
  });

  /** The two aliases the shaper does not emit, which is why this boundary was deferred. */
  it("accepts either spelling of the resume and source context", () => {
    const { normalizeListRecord } = normalisers();
    const fromSnake = normalizeListRecord({ list_id: "l1", resume_context: { sourceUrl: "/snake" } });
    const fromCamel = normalizeListRecord({ list_id: "l1", resumeContext: { sourceUrl: "/camel" } });

    assert.equal(fromSnake.resumeContext.sourceUrl, "/snake");
    assert.equal(fromCamel.resumeContext.sourceUrl, "/camel");
    assert.equal(normalizeListRecord({ source_context: { duplicatedFrom: "x" } }).sourceContext.duplicatedFrom, "x");
  });

  it("guarantees a resume context with its own progress and a source url", () => {
    const { normalizeListRecord } = normalisers();
    const out = normalizeListRecord({ list_id: "l 1" }, [item()]);

    assert.equal(out.resumeContext.sourceUrl, "lists.html?list=l%201", "the id is encoded");
    assert.equal(out.resumeContext.progress, out.progress, "the same summary, by reference");
  });

  it("keeps a producer's own resume url and progress rather than replacing them", () => {
    const { normalizeListRecord } = normalisers();
    const carried = { totalItemCount: 42 };
    const out = normalizeListRecord({ list_id: "l1", resumeContext: { progress: carried, source_url: "/kept" } });

    assert.equal(out.resumeContext.sourceUrl, "/kept", "source_url is accepted as a fallback");
    assert.equal(out.resumeContext.progress, carried, "a carried progress is not overwritten");
  });

  it("supplies a source context when the producer sent none", () => {
    const { normalizeListRecord } = normalisers();

    assert.deepEqual(plain(normalizeListRecord({}).sourceContext), { duplicatedFrom: null, sourceList: null });
  });
});

describe("What this boundary declares, and the two conditions that would discharge its deferrals", () => {
  it("reuses the published item, summary and normalized-record contracts", () => {
    assert.ok(source.includes("* @param {ListProgressInput} [progress]"));
    assert.ok(source.includes("* @param {ListItemInput[]} [items] @param {(BrowserListLink & { id?: unknown })[]} [links]"));
    assert.match(source, /@returns \{BrowserListProgressSummary\}/);
    assert.match(source, /@returns \{BrowserNormalizedListRecord\}/);
    assert.match(source, /@typedef \{BrowserListItem & \{ id\?: unknown \}\} ListItemInput/);
  });

  it("names the two aliases the List contracts never declare, and leaves nothing dead behind", () => {
    assert.ok(source.includes("aliases are `resume_context` and `source_context`, which appear on no List contract."));
    assert.doesNotMatch(
      source,
      /@typedef \{[^}]*\} ListRecordInput/,
      "a typedef this checkpoint stopped using must not be left standing",
    );
    assert.doesNotMatch(contracts, /^\s*resume_context: .*BrowserList/m);
    for (const published of ["list_id: string;", "list_type: string;", "is_reusable: number;"]) {
      assert.ok(contracts.includes(published), `${published} is published, so the local shape must not restate it`);
    }
  });

  /** Pinned so the reason fails a case when it stops being true, rather than rotting in place. */
  it("holds the first deferral's condition: nothing validates the progress bag", () => {
    assert.match(contracts, /export interface BrowserListSummary extends BrowserListColumns \{[\s\S]*?\n {2}progress: unknown;/);
    assert.ok(source.includes("**Discharged by** a checker for the progress bag at the response reader's"));
  });

  it("holds the second deferral's condition: sort_order is unknown by contract", () => {
    assert.match(contracts, /export interface BrowserListItem \{[\s\S]*?\n {2}sort_order: unknown;/);
    assert.match(contracts, /\*\*`quantity`, `estimated_cost`, `actual_cost` and `sort_order` stay\s*\n \* `unknown`\*\*/);
    assert.ok(source.includes("**Discharged by** the producer coercing"));
  });

  it("does not type the record reader's list against the progress shape", () => {
    assert.ok(
      source.includes("**`normalizeListRecord`'s `list` is deliberately not typed against this.**"),
      "the reason that narrowing was reverted must stay where the next reader meets it",
    );
    // Tied to this declaration rather than the bare spelling: other readers in this file take a
    // `list` parameter of their own, and a pin that matches any of them guards none of them.
    const block = source.slice(source.lastIndexOf("/**", source.indexOf("function normalizeListRecord")), source.indexOf("function normalizeListRecord"));
    assert.doesNotMatch(block, /@param \{[^}]*\} \[?list\]?/, "this reader's own list parameter stays undeclared");
  });
});
