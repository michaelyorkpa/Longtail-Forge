import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/services/tags.service.js");
const routes = read("src/routes/tags.routes.js");
const consumer = read("public/js/time-entries.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** The one literal bulkAssign resolves to, sliced from the service rather than from a table here. */
function browserReturnLiteral() {
  const start = service.indexOf("async function bulkAssign");
  assert.notEqual(start, -1, "bulkAssign must exist in tags.service.js");
  const body = service.slice(start, service.indexOf("\n}\n", start));
  const at = body.lastIndexOf("return {");
  assert.notEqual(at, -1, "bulkAssign must end in an object literal");
  return body.slice(at, body.indexOf("\n  };", at));
}

describe("bulk tag assignment producer", () => {
  it("resolves to exactly one browser-visible literal", () => {
    const members = [...browserReturnLiteral().matchAll(/^    (\w+)[:,]/gm)].map((m) => m[1]).sort();
    assert.deepEqual(
      members,
      ["action", "changed", "changed_count", "errors", "skipped_count", "target_type"],
      "the response literal must carry exactly the six declared members",
    );
  });

  it("answers both counts as the lengths of the arrays it also returns", () => {
    const returns = browserReturnLiteral();
    assert.match(returns, /changed_count: results\.length/, "changed_count must be the changed array's length");
    assert.match(returns, /skipped_count: errors\.length/, "skipped_count must be the errors array's length");
    assert.match(returns, /changed: results/, "changed must be the same array changed_count counts");
    assert.match(returns, /\n    errors,/, "errors must be the same array skipped_count counts");
  });

  it("closes the action vocabulary in the normaliser that throws otherwise", () => {
    const start = service.indexOf("function normalizeBulkTagAction");
    const normaliser = service.slice(start, service.indexOf("\n}\n", start));
    // Read from the normaliser's own list rather than searching for the three words this test
    // expects, so a fourth word added to that list is visible instead of quietly ignored.
    const accepted = normaliser.match(/\[([^\]]*)\]\.includes\(/);
    assert.ok(accepted, "the normaliser must test membership against a literal list");
    const listed = [...accepted[1].matchAll(/"(\w+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(listed, ["add", "remove", "replace"], "the normaliser must accept exactly three words");
    assert.match(normaliser, /throw new AppError/, "anything else must throw rather than pass through");

    const union = contracts.match(/export type BrowserTagBulkAction = ([^;]+);/);
    assert.ok(union, "BrowserTagBulkAction must be declared");
    assert.deepEqual(
      [...union[1].matchAll(/"(\w+)"/g)].map((m) => m[1]).sort(),
      listed,
      "the declared union must close over exactly the normaliser's vocabulary and nothing more",
    );
  });

  it("requires a non-empty target type before it can answer", () => {
    const start = service.indexOf("async function bulkAssign");
    const body = service.slice(start, service.indexOf("\n}\n", start));
    assert.match(body, /if \(!targetType\) \{/, "an empty target type must be refused");
    assert.match(
      body.slice(body.indexOf("if (!targetType) {")),
      /throw new AppError\("Bulk tag target type is required\./,
      "the refusal must be a thrown error, not a default",
    );
  });

  it("hands the service result to the browser unchanged", () => {
    const at = routes.indexOf("tagsRoutes.post(\"/tags/bulk-assignments\"");
    assert.notEqual(at, -1, "the bulk assignment route must exist");
    const route = routes.slice(at, routes.indexOf("}));", at));
    assert.match(route, /const result = await tagsService\.bulkAssign\(/, "the route must call the traced producer");
    assert.match(route, /response\.status\(200\)\.json\(result\)/, "the route must answer the service result itself");
  });
});

describe("bulk tag assignment declaration", () => {
  const at = contracts.indexOf("export interface BrowserTagBulkAssignmentResult {");
  const declared = contracts.slice(at, contracts.indexOf("\n}", at));

  it("reuses the published failure record rather than redeclaring one", () => {
    assert.match(declared, /errors: BrowserBulkActionFailure\[\];/, "failures must reuse the published surface");
    assert.match(declared, /action: BrowserTagBulkAction;/, "the action must carry the closed vocabulary");
    assert.match(declared, /changed: unknown\[\];/, "changed elements belong to the tag-assignment producer");
    assert.ok(
      contracts.indexOf("export interface BrowserBulkActionFailure {") < at,
      "the reused failure record must already be published above this contract",
    );
  });

  it("declares every member the producer answers, and no others", () => {
    const members = [...declared.matchAll(/^  (\w+)(\??):/gm)].map((m) => m[1]).sort();
    const produced = [...browserReturnLiteral().matchAll(/^    (\w+)[:,]/gm)].map((m) => m[1]).sort();
    assert.deepEqual(members, produced, "declared membership must equal the producer's own literal");
    assert.ok(
      !/^  \w+\?:/m.test(declared),
      "no member is optional, because the producer names all six every time",
    );
  });
});

describe("the time entries consumer", () => {
  const reader = consumer.slice(
    consumer.indexOf("function readTagBulkAssignment"),
    consumer.indexOf("async function loadTimeEntryData"),
  );

  it("no longer coerces the counts out of an unread body", () => {
    assert.ok(
      !consumer.includes("Number(result.changed_count)"),
      "the raw coerced read of the changed count must be gone",
    );
    assert.ok(
      !consumer.includes("Number(result.skipped_count)"),
      "the raw coerced read of the skipped count must be gone",
    );
  });

  it("refuses an unreadable body instead of reporting zero changes", () => {
    assert.match(
      consumer,
      /throw new Error\("The bulk tag response could not be read\./,
      "an unreadable bulk response must take the mutation's error path",
    );
    assert.match(reader, /return null;/, "the reader must be able to answer null");
  });

  it("checks each member the contract claims", () => {
    assert.match(reader, /typeof actionWord !== "string"/, "the action must be checked as text");
    assert.match(reader, /Array\.isArray\(changed\)/, "changed must be checked as an array");
    assert.match(reader, /Array\.isArray\(errors\)/, "errors must be checked as an array");
    assert.match(reader, /typeof targetType !== "string" \|\| targetType === ""/, "the target type must be non-empty");
    assert.match(reader, /Number\.isFinite\(count\)/, "both counts must be checked as finite numbers");
  });

  it("searches the vocabulary rather than testing membership, so the word narrows", () => {
    assert.match(reader, /TAG_BULK_ACTIONS\.find\(/, "the action must be recovered by search");
    assert.ok(
      !reader.includes("TAG_BULK_ACTIONS.includes("),
      "a membership test answers a boolean and would leave the action as bare text",
    );
    assert.match(
      consumer,
      /@type \{readonly BrowserTagBulkAction\[\]\}/,
      "the frozen table must carry the closed vocabulary for the search to narrow through",
    );
  });

  it("requires each count to agree with the array it counts", () => {
    assert.match(reader, /changedCount !== changed\.length/, "the changed count must agree with the changed array");
    assert.match(reader, /skippedCount !== errors\.length/, "the skipped count must agree with the errors array");
  });

  it("refuses a body whose failures it could not fully read", () => {
    assert.match(
      reader,
      /failures\.length !== skippedCount/,
      "a dropped failure means the count describes failures the browser cannot see",
    );
    assert.match(reader, /readBulkFailures\(body\)/, "failures must come from the published reader");
  });

  it("does not read into the changed elements it declares as unknown", () => {
    assert.ok(
      !/assignment\.changed[[.]/.test(consumer),
      "no consumer may index or dot into the changed elements this contract leaves unknown",
    );
  });
});
