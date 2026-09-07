import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * The normalized Lists record handoff, typed by `0.33.33.43.2`.
 *
 * **The page record and the wire record are not the same model, and one member proves it.**
 * `is_reusable` is an `INTEGER` column the shaper passes through untouched, so
 * `BrowserListSummary` types it `number`; `normalizeListRecord` coerces it to a boolean. A record
 * that extended the wire contract would be an impossible type, which is why this one omits every
 * member it rebuilds and carries the rest as an optional partial.
 *
 * The draft case is real: `readListDetail` answers `list: undefined` for a body it cannot read,
 * and the normaliser's own `{}` default then produces a record with no identity at all. That is
 * why `id` and `list_id` are `string | undefined` rather than `string`.
 */

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const listsSource = read("public/js/lists.js");
const contractsSource = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener */
function slice(source, opener) {
  const start = source.indexOf("  " + opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf("\n  }\n", start);
  assert.notEqual(end, -1, opener + " must terminate");
  return source.slice(start, end + 4);
}

/** Lift the shipped normaliser with the helpers it calls. */
function liftNormalizer() {
  const built = new Function("encodeURIComponent", [
    slice(listsSource, "function normalizeListRecord(list = {}, items = [], links = []) {"),
    slice(listsSource, "function normalizeListProgress(progress = {}, items = []) {"),
    slice(listsSource, "function nextNeededDateFromItems(items = []) {"),
    "  return normalizeListRecord;",
  ].join("\n"));
  return built(globalThis.encodeURIComponent);
}

/** One list exactly as `shapeListsForBrowser` emits it, `is_reusable` numeric. */
function wireSummary(overrides = {}) {
  return {
    client_id: null,
    description: "",
    id: "list-1",
    isBillOfMaterials: false,
    isReusable: true,
    is_reusable: 1,
    links: [],
    list_id: "list-1",
    list_type: "checklist",
    // `shapeListsForBrowser` always builds these three - `progress` from
    // `listProgressSummaryFromItems`, `resumeContext` from `buildListResumeContext`, and
    // `sourceContext` as a two-member record. A `null` here would not be a producer value.
    progress: { totalItemCount: 3 },
    project_id: null,
    resumeContext: { sourceUrl: "" },
    sourceContext: { duplicatedFrom: null, sourceList: null },
    status: "active",
    title: "Kitchen restock",
    ...overrides,
  };
}

describe("the page record is not the wire record", () => {
  it("coerces the numeric wire column into the boolean the page uses", () => {
    const normalize = liftNormalizer();
    assert.equal(normalize(wireSummary({ is_reusable: 1 })).is_reusable, true);
    assert.equal(normalize(wireSummary({ is_reusable: 0 })).is_reusable, false);
    assert.equal(typeof normalize(wireSummary()).is_reusable, "boolean",
      "the wire sends a number here and the page holds a boolean");
  });

  it("declares that conflict rather than smuggling it through an extends clause", () => {
    const at = contractsSource.indexOf("export interface BrowserNormalizedListRecord extends Partial<Omit<BrowserListSummary,");
    assert.notEqual(at, -1, "the record omits from the wire contract rather than extending it whole");
    const clause = contractsSource.slice(at, contractsSource.indexOf(">> {", at));
    for (const member of ["is_reusable", "id", "list_id", "items", "links", "progress",
      "resumeContext", "sourceContext", "isBillOfMaterials"]) {
      assert.ok(clause.includes(`"${member}"`), `${member} is rebuilt, so it must be omitted from the base`);
    }
  });

  it("rebuilds the nine members the normaliser overwrites", () => {
    const normalize = liftNormalizer();
    const record = normalize(wireSummary(), [{ list_item_id: "item-1" }], [{ list_link_id: "link-1" }]);
    assert.equal(record.id, "list-1");
    assert.equal(record.list_id, "list-1");
    assert.equal(record.isBillOfMaterials, false);
    assert.deepEqual(record.items, [{ id: "item-1", list_item_id: "item-1" }]);
    assert.deepEqual(record.links, [{ id: "link-1", list_link_id: "link-1" }]);
    assert.equal(typeof record.progress.totalItemCount, "number");
    assert.equal(typeof record.resumeContext.sourceUrl, "string");
    assert.deepEqual(record.sourceContext, { duplicatedFrom: null, sourceList: null });
  });

  it("carries the wire members it merely spreads", () => {
    const normalize = liftNormalizer();
    const record = normalize(wireSummary({ description: "Weekly", extraProducerField: 7 }));
    assert.equal(record.title, "Kitchen restock");
    assert.equal(record.status, "active");
    assert.equal(record.description, "Weekly");
    assert.equal(record.extraProducerField, 7, "a richer producer field is not stripped");
  });

  it("derives isBillOfMaterials from either the flag or the list type", () => {
    const normalize = liftNormalizer();
    assert.equal(normalize(wireSummary({ list_type: "bill_of_materials" })).isBillOfMaterials, true);
    assert.equal(normalize(wireSummary({ isBillOfMaterials: true })).isBillOfMaterials, true);
    assert.equal(normalize(wireSummary()).isBillOfMaterials, false);
  });
});

describe("the draft case is real, which is why the identity is optional", () => {
  it("produces a record with no identity for an unsaved list", () => {
    const normalize = liftNormalizer();
    const draft = normalize();
    assert.equal(draft.id, undefined, "a draft has no saved identity");
    assert.equal(draft.list_id, undefined);
    assert.equal(draft.is_reusable, false);
    assert.deepEqual(draft.items, []);
    assert.deepEqual(draft.links, []);
    assert.equal(typeof draft.progress.totalItemCount, "number");
  });

  it("declares that identity as possibly absent rather than promising the saved case", () => {
    const at = contractsSource.indexOf("export interface BrowserNormalizedListRecord");
    const body = contractsSource.slice(at, contractsSource.indexOf("\n}\n", at));
    assert.match(body, /id: string \| undefined;/);
    assert.match(body, /list_id: string \| undefined;/);
  });

  it("still builds a resume context for a draft, with the producer's members preserved", () => {
    const normalize = liftNormalizer();
    const carried = normalize(wireSummary({ resumeContext: { note: "kept", progress: null } }));
    assert.equal(carried.resumeContext.note, "kept", "producer members survive the rebuild");
    assert.ok(carried.resumeContext.progress, "and progress is guaranteed");
    assert.match(String(carried.resumeContext.sourceUrl), /^lists\.html\?list=list-1$/);
  });
});

describe("the collection assembly", () => {
  it("keeps an explicit predicate rather than filter(Boolean)", () => {
    // `filter(Boolean)` answered the same rows and told the compiler nothing, so the nullable
    // element type reached `state.lists`.
    const body = slice(listsSource, "async function loadLists() {");
    assert.match(body, /details\.filter\(isLoadedListRecord\)/);
    assert.ok(!/filter\(Boolean\)/.test(body), "the untyped filter is gone from this path");
    const predicate = slice(listsSource, "function isLoadedListRecord(record) {");
    assert.match(predicate, /return Boolean\(record\);/, "and answers exactly what Boolean answered");
    // The JSDoc sits above the opener the slice starts at, so this claim is made against the
    // whole source rather than the sliced body.
    const at = listsSource.indexOf("function isLoadedListRecord(record) {");
    assert.notEqual(at, -1, "the predicate must exist");
    assert.match(listsSource.slice(at - 400, at), /@returns \{record is BrowserNormalizedListRecord\}/,
      "the predicate narrows rather than merely filtering");
  });

  it("keeps the summary fallback on a rejected detail request", () => {
    const body = slice(listsSource, "async function loadListDetail(listId, fallback = null) {");
    assert.match(body, /return fallback \? normalizeListRecord\(fallback, \[\]\) : null;/,
      "a failed detail still contributes its summary rather than dropping the list");
    assert.match(listsSource, /@param \{string\} listId @param \{BrowserListSummary \| null\} \[fallback\]/,
      "and the fallback is the wire summary, not the page record");
  });

  it("annotates the page slot as normalized records, not wire summaries", () => {
    assert.match(listsSource, /@type \{BrowserNormalizedListRecord\[\]\}\s*\n\s*\*\/\s*\n\s*lists: \[\],/,
      "state.lists holds what the normaliser produced");
    assert.match(listsSource, /@type \{BrowserNormalizedListRecord \| null\}\s*\n\s*\*\/\s*\n\s*editorList: null,/);
    assert.match(listsSource, /@type \{BrowserNormalizedListRecord \| null\}\s*\n\s*\*\/\s*\n\s*itemDialogList: null,/);
  });

  it("hands its model to the response child rather than doing that child's work", () => {
    // This prerequisite landed with the raw read intact; `0.33.33.38.4.7.2.2` then replaced it.
    // What this assertion defends is the handoff: the collection is read into the wire summary
    // type, and only the normaliser turns those into the page record.
    const body = slice(listsSource, "async function loadLists() {");
    assert.match(body, /const summaries = readListSummaries\(result\);/);
    assert.match(listsSource, /@returns \{BrowserListSummary\[\]\}/,
      "the reader answers wire summaries");
    assert.match(listsSource, /@returns \{Promise<BrowserNormalizedListRecord \| null>\}/,
      "and the detail loader answers page records");
  });

  it("leaves the normaliser's inputs unannotated, because they are a separate boundary", () => {
    // Annotating them reaches into `normalizeListProgress`'s unknown reads and two snake_case
    // aliases the shaper does not emit. This child owns the record produced, not the one consumed.
    assert.match(listsSource, /function normalizeListRecord\(list = \{\}, items = \[\], links = \[\]\) \{/);
    assert.ok(!/@param \{BrowserListSummary \| Record<string, never>\} \[list\]/.test(listsSource));
  });
});

describe("behaviour the annotations must not have moved", () => {
  it("keeps the link-management rule for every status it rejected before", () => {
    const built = new Function("state", [
      slice(listsSource, "function canManageListLinks(list = state.editorList) {"),
      "  return canManageListLinks;",
    ].join("\n"))({ editorList: null });

    for (const status of ["archived", "deleted", "finalized"]) {
      assert.equal(built({ status }), false, `${status} still refuses link management`);
    }
    assert.equal(built({ status: "active" }), true);
    assert.equal(built(null), true, "a draft still manages links");
    assert.equal(built({}), true, "and so does a record whose status is absent");
    assert.equal(built({ status: 7 }), true,
      "a non-text status never matched one of the three and still does not");
  });
});
