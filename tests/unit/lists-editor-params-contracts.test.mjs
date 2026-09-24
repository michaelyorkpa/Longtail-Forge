import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * The module-action parameter bag, and why only half of it could be discharged.
 *
 * `0.33.33.43.20` deferred this root and `0.33.33.43.23` measured its cost. `0.33.33.43.30`
 * discharged the defaults half and proved the identifier half cannot be discharged the same way.
 *
 * **The difference is one thing, and these cases are it.** Both readers end in a `||` chain over
 * members the published action declares `unknown`. Templating that chain is the conversion that
 * already happened one step later - so for the defaults, which land in `control.value = x || ""`,
 * it is behaviour-preserving. For the identifier it is not, because `openListEditor` **tests the
 * result for truthiness before anything converts it**, and three value kinds are truthy yet
 * stringify to empty.
 */

const source = createProjectTextReader().readText("public/js/lists.js");

/** @param {string} name */
function lift(name) {
  const sandbox = vm.createContext({});
  vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return vm.runInContext(name, sandbox);
}

/** The three kinds that are truthy yet stringify to empty - the whole of the difference. */
const TRUTHY_BUT_EMPTY = [[], new String(""), { toString: () => "" }];

describe("The editor defaults now answer text", () => {
  it("answers all five members as strings, and empty for a bag carrying none", () => {
    const defaults = lift("normalizeListEditorDefaults")();

    assert.deepEqual({ ...defaults }, {
      client_id: "", description: "", list_type: "", project_id: "", title: "",
    });
    for (const value of Object.values(defaults)) {
      assert.equal(typeof value, "string");
    }
  });

  it("keeps the spelling precedence it had, snake_case first, then the context", () => {
    const normalize = lift("normalizeListEditorDefaults");
    const both = normalize({
      clientId: "camel", client_id: "snake",
      listType: "camel-type", list_type: "snake-type",
      projectId: "camel-project", project_id: "snake-project",
    });

    assert.equal(both.client_id, "snake");
    assert.equal(both.list_type, "snake-type");
    assert.equal(both.project_id, "snake-project");
    assert.equal(normalize({ context: { clientId: "ctx" } }).client_id, "ctx", "the context is reached last");
    assert.equal(normalize({ clientId: "own", context: { clientId: "ctx" } }).client_id, "own");
  });

  /**
   * The equivalence this checkpoint rests on. Each default lands in `control.value = x || ""`,
   * whose IDL `DOMString` conversion is `ToString` - so templating the chain writes the same text.
   */
  it("writes the same text the control would have written, for every kind of value", () => {
    const normalize = lift("normalizeListEditorDefaults");

    for (const value of [0, 42, -1.5, "x", "", null, undefined, false, true, Number.NaN, ["a"], { toString: () => "T" }, ...TRUTHY_BUT_EMPTY]) {
      // What the control stores today: the chain's result, converted on assignment.
      const asControlStored = String((value || "") || "");
      assert.equal(normalize({ client_id: value }).client_id, asControlStored,
        `${JSON.stringify(String(value))} writes the same text`);
    }
  });

  it("writes empty for the three kinds that are truthy yet stringify to empty", () => {
    const normalize = lift("normalizeListEditorDefaults");

    // This is the case that would have mattered, and it does not: a falsy result and an empty
    // result are the same `""` once the value reaches a control.
    for (const value of TRUTHY_BUT_EMPTY) {
      assert.equal(normalize({ client_id: value }).client_id, "");
    }
  });
});

describe("The editor identifier cannot be discharged the same way", () => {
  it("still forwards whatever arrived, unconverted", () => {
    const readListEditorId = lift("readListEditorId");
    const array = ["a"];

    assert.equal(readListEditorId({ listId: 42 }), 42, "a number is not turned into text");
    assert.equal(readListEditorId({ listId: array }), array, "and an array is forwarded as itself");
  });

  it("keeps the four spellings in order and answers empty for none", () => {
    const readListEditorId = lift("readListEditorId");

    assert.equal(readListEditorId({ id: "d", listId: "a", list_id: "b", recordId: "c" }), "a");
    assert.equal(readListEditorId({ id: "d", list_id: "b", recordId: "c" }), "b");
    assert.equal(readListEditorId({ id: "d", recordId: "c" }), "c");
    assert.equal(readListEditorId({ id: "d" }), "d");
    assert.equal(readListEditorId({}), "");
  });

  /**
   * The measurement that split this checkpoint. The identifier's result gates a fetch on its
   * truthiness, so converting it would change whether that fetch happens.
   */
  it("answers a truthy value that templating would make falsy, which is why it stays", () => {
    const readListEditorId = lift("readListEditorId");

    for (const value of TRUTHY_BUT_EMPTY) {
      const answered = readListEditorId({ listId: value });
      assert.ok(answered, `${Object.prototype.toString.call(value)} is truthy today`);
      assert.equal(`${answered}`, "", "and templating it would be falsy, skipping the fetch");
    }
  });

  it("still gates the fetch on that truthiness, which is what makes the difference real", () => {
    // If this stops being how the identifier is used, the deferral needs re-deciding rather than
    // re-pinning: the whole reason it stands is that a conversion here changes control flow.
    assert.match(source, /if \(!list && listId\) \{\r?\n\s+list = await loadListDetail\(listId\);/,
      "the identifier's truthiness still decides whether the detail is fetched");

    const at = source.indexOf("function readListEditorId(");
    const block = source.slice(source.lastIndexOf("/**", at), at);
    assert.doesNotMatch(block, /@param \{[^}]*\} \[?params\]?/,
      "the identifier reader is annotated; this deferral is discharged and the pin should go with it");
  });
});

describe("What the discharge unblocked, and what it did not", () => {
  it("declared the dialog's option bag, which 0.33.33.43.23 could not", () => {
    const at = source.indexOf("function openListDialog(");
    const block = source.slice(source.lastIndexOf("/**", at), at);

    assert.match(block, /defaults\?: ReturnType<typeof normalizeListEditorDefaults>/,
      "the bag takes the shape the defaults reader now produces");
    assert.match(source, /@type \{Partial<ReturnType<typeof normalizeListEditorDefaults>>\}/,
      "and the local carries the Partial the `|| {}` draft case earns");
  });

  it("declared the dialog-data promise its slot always held", () => {
    assert.match(source, /@type \{Promise<void> \| null\}\r?\n\s+\*\/\r?\n\s+dialogDataReady: null,/);
    assert.match(source, /state\.dialogDataReady = null;/, "and the failure path still clears it for a retry");
  });

  it("leaves the declarative-surface decorator untyped, on an arithmetic rather than a doubt", () => {
    // Discharged by narrowing this function's query results together, as one deliberate step.
    const at = source.indexOf("function decorateListsDeclarativeSurface(");
    const block = source.slice(source.lastIndexOf("/**", at), at);

    assert.doesNotMatch(block, /@param \{[^}]*\} surface/,
      "the decorator is annotated; that deferral is discharged and this pin should go with it");
    assert.match(block, /opens \*\*five\*\* `dataset` reads/,
      "and the note still records the count that made it the wrong trade");
  });
});
