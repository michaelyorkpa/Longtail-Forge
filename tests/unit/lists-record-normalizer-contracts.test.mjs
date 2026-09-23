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
  // `0.33.33.43.21` gave the record normaliser a checked progress bag, so the checker and the
  // record test it rests on are lifted too rather than stubbed: the point of these cases is what
  // the real reader does with a malformed bag.
  for (const name of [
    "isResponseRecord",
    "readListProgressBag",
    "normalizeListProgress",
    "normalizeListRecord",
  ]) {
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  }

  return vm.runInContext("({ normalizeListProgress, normalizeListRecord, readListProgressBag })", sandbox);
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

describe("The progress-bag checker 0.33.33.43.19 asked for", () => {
  it("hands a plain record straight through", () => {
    const { readListProgressBag } = normalisers();
    const bag = { checkedItemCount: 3 };

    assert.equal(readListProgressBag(bag), bag);
    assert.deepEqual(plain(readListProgressBag({})), {});
  });

  it("answers undefined for everything that is not one", () => {
    const { readListProgressBag } = normalisers();

    for (const value of [null, undefined, "x", 42, true, [], [1, 2]]) {
      assert.equal(readListProgressBag(value), undefined, `${JSON.stringify(value)} is not a bag`);
    }
  });

  it("changes the summary for exactly one input, and null is it", () => {
    const { normalizeListProgress, readListProgressBag } = normalisers();

    // Every non-record already produced the computed default, because reading a member off a
    // primitive or an array answers `undefined` and each fallback then fired. `null` alone threw.
    for (const value of [undefined, "x", 42, true, [], [1, 2], {}, { checkedItemCount: 3 }]) {
      assert.deepEqual(
        plain(normalizeListProgress(readListProgressBag(value), [])),
        plain(normalizeListProgress(value, [])),
        `${JSON.stringify(value)} reads the same through the checker as it did without it`,
      );
    }

    // Matched by its text rather than by constructor: the reader is lifted into its own realm, so
    // the error it throws is not an instance of this realm's `TypeError`. Reading `.name` off the
    // caught value would be a member read on `unknown`, which the test program does not carry.
    assert.throws(() => normalizeListProgress(null, []), (error) => String(error).startsWith("TypeError"),
      "without the checker a null bag threw, which is the defect this closes");
    assert.equal(normalizeListProgress(readListProgressBag(null), []).totalItemCount, 0);
  });

  it("keeps the list when its progress bag is unusable", () => {
    const { normalizeListRecord } = normalisers();
    const items = [item({ list_item_id: "i-1" }), item({ list_item_id: "i-2", checked_at: "2026-01-01" })];
    const record = normalizeListRecord({ list_id: "l-1", progress: null }, items, []);

    // Rejecting the summary would drop a real list over one member. The counts come from the
    // items instead, which is what an absent bag already did.
    assert.equal(record.list_id, "l-1");
    assert.equal(record.items.length, 2);
    assert.equal(record.progress.totalItemCount, 2);
    assert.equal(record.progress.checkedItemCount, 1);
  });

  it("still prefers what a usable bag carried over the counts derived from items", () => {
    const { normalizeListRecord } = normalisers();
    const items = [item({ list_item_id: "i-1" })];
    const record = normalizeListRecord({ list_id: "l-1", progress: { totalItemCount: 99 } }, items, []);

    assert.equal(record.progress.totalItemCount, 99);
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
  it("discharged the first deferral by checking the bag, not by narrowing the contract", () => {
    // `0.33.33.43.21` wrote the checker this deferral named. The half that must NOT have changed
    // is the published member: narrowing it was tried in `0.33.33.43.19` and made
    // `BrowserListSummary` unassignable at both callers.
    assert.match(contracts, /export interface BrowserListSummary extends BrowserListColumns \{[\s\S]*?\n {2}progress: unknown;/,
      "the published member stayed unknown; if it did not, the validated handoff is what to re-check");
    assert.match(source, /function readListProgressBag\(value\) \{\n\s+return isResponseRecord\(value\) \? value : undefined;/,
      "the checker vouches for a plain record and for nothing else");
    assert.match(source, /normalizeListProgress\(readListProgressBag\(list\.progress\), normalizedItems\)/,
      "and the record normaliser consumes it rather than reading the bag directly");
  });

  it("holds the second deferral's condition: sort_order is unknown by contract", () => {
    assert.match(contracts, /export interface BrowserListItem \{[\s\S]*?\n {2}sort_order: unknown;/);
    assert.match(contracts, /\*\*`quantity`, `estimated_cost`, `actual_cost` and `sort_order` stay\s*\n \* `unknown`\*\*/);
    assert.ok(source.includes("**Discharged by** the producer coercing"));
  });

  it("types the record reader's list without claiming what the wire did not send", () => {
    // Tied to this declaration rather than the bare spelling: other readers in this file take a
    // `list` parameter of their own, and a pin that matches any of them guards none of them.
    const block = source.slice(source.lastIndexOf("/**", source.indexOf("function normalizeListRecord")), source.indexOf("function normalizeListRecord"));
    assert.match(block, /@param \{ListRecordInput\} \[list\]/,
      "the record reader's own list parameter is declared");
    assert.match(source, /\}\} ListRecordInput/, "and the shape it is declared against is named here");

    // `Partial`, because `readListDetail` answers `list: undefined` for a body it cannot read and
    // the `{}` default then applies - so no member of the summary is guaranteed to have arrived.
    assert.match(source, /@typedef \{Partial<BrowserListSummary> & \{/,
      "every summary member stays optional; a required one would claim what the draft case disproves");
    // The two aliases appear on no List contract, so they stay `unknown` rather than borrowing a
    // shape from the members the normaliser happens to build out of them.
    assert.match(source, /resume_context\?: unknown, source_context\?: unknown/,
      "the two undeclared aliases are described as tolerated, not as published");
  });
});
