import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/**
 * What `normalizeTimeEntries` actually builds, exercised rather than described.
 *
 * **`0.33.33.44.3` declared `NormalizedTimeEntry` over a boundary it never checked.** Eight
 * members were declared `string` and copied straight off the wire, so the model was a claim the
 * function did not establish: a numeric `client_id` arrived as a numeric `clientId`, an object
 * `description` as an object, and an empty row answered `undefined` for `entryId`. That is a
 * type guarantee asserted over an unchecked boundary - not a claim about what the server emits.
 *
 * The producer was traced before the fix. `normalizeTimeEntry` in `src/utils/normalizers.js`
 * runs `String(value || "").trim()` over seven of those columns, resolves `invoice_status`
 * through `isTimeEntryInvoiceStatus`, and answers `normalizeUtcIso` for both timestamps - so
 * every row it builds already carries ten strings. `0.33.33.44.6` checks that at the boundary
 * instead of asserting it, which is why no coercion was added and no valid row is dropped.
 *
 * These cases run the shipped function. A source-text match would not have caught the defect and
 * cannot prove the repair.
 */

const page = readFileSync(new URL("../../public/js/time-entry-dialog.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const serverNormalizers = readFileSync(new URL("../../src/utils/normalizers.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

/** @param {string} opener */
function slice(opener) {
  const start = page.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in the page source");
  return page.slice(start, page.indexOf("\n  }\n", start) + 4);
}

/**
 * The declaration block for a `const`, up to its closing `]);`.
 * @param {string} opener
 */
function constant(opener) {
  const start = page.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist in the page source");
  return page.slice(start, page.indexOf("]);", start) + 3);
}

/**
 * The normaliser as the page ships it, instantiated from that page's own source.
 *
 * Declared at the shape this harness needs. `new Function` answers `any`, and naming the return
 * once here is what keeps every case below free of an `any` annotation of its own.
 * @type {(body: unknown) => Record<string, unknown>[]}
 */
const normalizeTimeEntries = new Function([
  constant("  const TIME_ENTRY_TEXT_COLUMNS = Object.freeze(["),
  slice("  function isTimeEntryRecord(value) {"),
  slice("  function isTimeEntryRow(value) {"),
  slice("  function normalizeBillable(value) {"),
  slice("  function normalizeTimeEntries(data) {"),
  "return normalizeTimeEntries;",
].join("\n"))();

/**
 * One row shaped exactly as `normalizeTimeEntry` builds it: every named column a trimmed string,
 * the durations decimal strings, the timestamps ISO text.
 */
const producerRow = (overrides = {}) => ({
  entry_id: "entry-1",
  workspace_id: "workspace-1",
  user_id: "user-1",
  client_id: "client-1",
  client_name: "Acme",
  project_id: "project-1",
  project_name: "Rollout",
  task_id: "",
  description: "Wrote the thing",
  start_time: "2026-09-09T09:00:00.000Z",
  end_time: "2026-09-09T10:30:00.000Z",
  duration_seconds: "5400",
  duration_hours: "1.5000",
  billable: "yes",
  invoice_status: "unbilled",
  created_at: "2026-09-09T09:00:00.000Z",
  updated_at: "2026-09-09T10:30:00.000Z",
  ...overrides,
});

describe("a valid producer body survives intact", () => {
  it("keeps every row the server shaper builds", () => {
    const rows = normalizeTimeEntries({ entries: [producerRow(), producerRow({ entry_id: "entry-2" })] });
    assert.equal(rows.length, 2, "no valid row is dropped");
    assert.deepEqual(rows.map((row) => row.entryId), ["entry-1", "entry-2"]);
  });

  it("answers every declared member at its declared type", () => {
    const [row] = normalizeTimeEntries({ entries: [producerRow()] });
    for (const member of ["billable", "clientId", "clientName", "description", "entryId",
      "invoiceStatus", "projectId", "projectName", "userId"]) {
      assert.equal(typeof row[member], "string", `${member} is a string`);
    }
    assert.equal(typeof row.durationSeconds, "number");
    assert.ok(row.startTime instanceof Date && Number.isFinite(row.startTime.getTime()));
    assert.ok(row.endTime instanceof Date && Number.isFinite(row.endTime.getTime()));
    assert.ok(Array.isArray(row.tags));
  });

  it("converts exactly what it always converted, and nothing more", () => {
    const [row] = normalizeTimeEntries({ entries: [producerRow({ duration_seconds: "5400", tags: "nope" })] });
    assert.equal(row.durationSeconds, 5400, "the decimal string becomes a number");
    assert.deepEqual(row.tags, [], "a non-array tag member still answers an empty list");
    assert.equal(row.description, "Wrote the thing", "text is passed through, never re-coerced");
    const [blank] = normalizeTimeEntries({ entries: [producerRow({ invoice_status: "" })] });
    assert.equal(blank.invoiceStatus, "unbilled", "the empty-status fallback is unchanged");
  });

  it("still answers an empty list for a body it cannot read", () => {
    for (const body of [null, undefined, 42, "text", [], {}, { entries: null }, { entries: "no" }]) {
      assert.deepEqual(normalizeTimeEntries(body), [], `${JSON.stringify(body) ?? "undefined"} answers []`);
    }
  });
});

describe("a row that cannot satisfy the model is refused, not rebuilt", () => {
  it("drops a row for each column the producer guarantees", () => {
    /** @type {[string, unknown][]} */
    const badColumns = [
      ["client_id", 42],
      ["client_name", null],
      ["description", { nested: true }],
      ["entry_id", undefined],
      ["invoice_status", { still: "truthy" }],
      ["project_id", []],
      ["project_name", 7],
      ["user_id", false],
      ["start_time", 1757404800000],
      ["end_time", new Date()],
    ];

    for (const [column, bad] of badColumns) {
      const rows = normalizeTimeEntries({ entries: [producerRow({ [column]: bad })] });
      assert.deepEqual(rows, [], `a non-string ${column} is refused`);
    }
  });

  it("drops an empty row rather than answering undefined identities", () => {
    // This is the reproduction that motivated the fix: `{}` used to yield `entryId: undefined`
    // from a function whose model declares `entryId: string`.
    assert.deepEqual(normalizeTimeEntries({ entries: [{}] }), []);
  });

  it("requires a plain record, not merely something with the right properties", () => {
    // `typeof value === "object"` is what makes the column reads typeable, and it is not
    // redundant at runtime either: a callable carrying all ten columns is truthy and would pass
    // a bare truthiness check. Only a record is a row.
    const callable = Object.assign(() => {}, producerRow());
    assert.deepEqual(normalizeTimeEntries({ entries: [callable] }), [], "a callable is not a row");
    assert.deepEqual(normalizeTimeEntries({ entries: [Object.assign([], producerRow())] }), [],
      "and neither is an array carrying them");
  });

  it("keeps the good rows of a mixed body", () => {
    const rows = normalizeTimeEntries({
      entries: [producerRow({ entry_id: "keep-1" }), { broken: true }, producerRow({ entry_id: "keep-2" })],
    });
    assert.deepEqual(rows.map((row) => row.entryId), ["keep-1", "keep-2"],
      "one unusable row does not discard the rest");
  });

  it("never returns a member whose type contradicts the model", () => {
    // The property this fix buys, stated as one claim over a hostile body.
    const hostile = normalizeTimeEntries({
      entries: [producerRow(), { client_id: 1 }, producerRow({ description: {} }), {}, producerRow({ entry_id: "ok" })],
    });
    for (const row of hostile) {
      for (const member of ["clientId", "clientName", "description", "entryId",
        "invoiceStatus", "projectId", "projectName", "userId"]) {
        assert.equal(typeof row[member], "string", `${member} is a string on every returned row`);
      }
    }
    // Two of the five can satisfy the model: the bare `producerRow()` and the `entry_id: "ok"`
    // one. The object `description` fails for the same reason the numeric `client_id` does.
    assert.deepEqual(hostile.map((row) => row.entryId), ["entry-1", "ok"],
      "and only the rows that could satisfy it were returned");
  });
});

describe("the checked columns are the producer's, not this page's invention", () => {
  it("checks exactly the members the model declares as text", () => {
    // Sliced backwards from the name: this file declares several `@typedef {{` blocks and the
    // first one is `NormalizedTimeEntry`.
    const at = page.indexOf("}} TimeEntryTextColumns");
    assert.notEqual(at, -1, "TimeEntryTextColumns must be declared");
    const declared = [...page.slice(page.lastIndexOf("@typedef {{", at), at)
      .matchAll(/^\s+\*\s+(\w+): string,/gm)].map((entry) => entry[1]).sort();
    const checked = [...constant("  const TIME_ENTRY_TEXT_COLUMNS = Object.freeze([")
      .matchAll(/"(\w+)"/g)].map((entry) => entry[1]).sort();
    assert.deepEqual(checked, declared,
      "the runtime check and the type it narrows to must name the same columns");
    assert.equal(checked.length, 10);
  });

  it("names only columns the server shaper guarantees are strings", () => {
    const shaper = serverNormalizers.slice(serverNormalizers.indexOf("function normalizeTimeEntry(entry) {"));
    const body = shaper.slice(0, shaper.indexOf("\n}\n"));
    const checked = [...constant("  const TIME_ENTRY_TEXT_COLUMNS = Object.freeze([")
      .matchAll(/"(\w+)"/g)].map((entry) => entry[1]);
    for (const column of checked) {
      const guaranteed = new RegExp(`${column}: (?:String\\(|normalizeUtcIso\\(|isTimeEntryInvoiceStatus\\()`);
      assert.match(body, guaranteed,
        `${column} must be a column the producer already answers as text`);
    }
  });

  it("adds no coercion of its own", () => {
    const body = slice("  function normalizeTimeEntries(data) {");
    assert.ok(!/String\(/.test(body), "no String() coercion was introduced");
    assert.match(body, /entries\.filter\(isTimeEntryRow\)\.map\(/, "rows are checked, then rebuilt");
    // The three conversions that were always here are the three that remain.
    assert.match(body, /normalizeBillable\(entry\.billable\)/);
    assert.match(body, /Number\(entry\.duration_seconds\) \|\| 0/);
    assert.match(body, /Array\.isArray\(entry\.tags\) \? entry\.tags : \[\]/);
  });
});
