import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Lists option surface builds, and what it is still gated on.
 *
 * `0.33.33.43.24` typed the suggestion cache and the users slot. It closed seven of the seventeen
 * the boundary named, and the reason the rest stayed is the finding: **the select-filling
 * primitives are gated on the `dom` family.** `option`, `replaceOptions`, `populateProjectOptions`
 * and `decorateFilterControl` all reach a module handle declared by `document.querySelector`, which
 * answers `Element` - a type carrying no `value`, no `options` and no `dataset`.
 *
 * These cases fix the behaviour that does not depend on that gate, and pin the two deferrals.
 */

const source = createProjectTextReader().readText("public/js/lists.js");

/**
 * A select that records what it was given, standing in for the real control.
 * @param {string} [value] @param {string[]} [optionValues]
 */
function select(value = "", optionValues = []) {
  return {
    value,
    options: optionValues.map((entry) => ({ value: entry })),
    children: /** @type {unknown[]} */ ([]),
    /** @param {...unknown} nodes */
    replaceChildren(...nodes) {
      this.children = nodes;
      this.options = nodes.map((node) => /** @type {{ value: string }} */ (node));
    },
  };
}

/** `replaceOptions`, lifted on its own: it reaches for nothing else. */
function optionReplacer() {
  const sandbox = vm.createContext({});
  vm.runInContext(extractFunctionBlock(source, "replaceOptions"), sandbox);
  return vm.runInContext("replaceOptions", sandbox);
}

/** The suggestion cache reader, with a state carrying one list's rows. */
function suggestionReader(entries = new Map()) {
  const sandbox = vm.createContext({ state: { itemSuggestions: entries } });
  vm.runInContext(extractFunctionBlock(source, "itemSuggestionsForList"), sandbox);
  return vm.runInContext("itemSuggestionsForList", sandbox);
}

describe("Refilling a select preserves what was chosen", () => {
  it("keeps the previous value when the new options still offer it", () => {
    const replaceOptions = optionReplacer();
    const target = select("keep-me");

    replaceOptions(target, [{ value: "other" }, { value: "keep-me" }]);
    assert.equal(target.value, "keep-me", "a refill must not silently drop the current choice");
  });

  it("does not reassign the value when the new options no longer offer it", () => {
    const replaceOptions = optionReplacer();
    const target = select("gone");
    let writes = 0;
    Object.defineProperty(target, "value", {
      get: () => "gone",
      set: () => { writes += 1; },
    });

    replaceOptions(target, [{ value: "a" }, { value: "b" }]);
    // The restore is conditional, and this is the branch that does not run. A real `<select>`
    // resets itself to the first option when the chosen one is removed; that is the DOM's
    // behaviour, not this function's, and the caller's own default is what decides afterwards.
    assert.equal(writes, 0, "no value is written back when the previous choice is gone");
  });

  it("replaces the children with exactly the options it was given, in order", () => {
    const replaceOptions = optionReplacer();
    const target = select("");
    const options = [{ value: "first" }, { value: "second" }, { value: "third" }];

    replaceOptions(target, options);
    assert.deepEqual(target.children.map((node) => /** @type {{ value: string }} */ (node).value),
      ["first", "second", "third"]);
  });

  it("does nothing at all when there is no select, rather than throwing", () => {
    const replaceOptions = optionReplacer();

    // The module handles are `Element | null`, so an absent control is a real case on every
    // caller's path, not a defensive flourish.
    assert.doesNotThrow(() => replaceOptions(null, [{ value: "a" }]));
    assert.doesNotThrow(() => replaceOptions(undefined, []));
  });

  it("refills an empty select without restoring an empty previous value", () => {
    const replaceOptions = optionReplacer();
    const target = select("");

    replaceOptions(target, [{ value: "" }, { value: "a" }]);
    assert.equal(target.value, "", "the empty option is a real choice and is still offered");
  });
});

describe("Reading one list's cached suggestions", () => {
  it("answers the rows cached for that list", () => {
    const rows = [{ item_name: "Widget" }];
    const read = suggestionReader(new Map([["list-1", rows]]));

    assert.equal(read({ list_id: "list-1" }).length, 1);
    assert.equal(read({ list_id: "list-1" })[0].item_name, "Widget");
  });

  it("answers an empty list for a list with nothing cached", () => {
    const read = suggestionReader(new Map([["list-1", [{ item_name: "Widget" }]]]));

    assert.equal(read({ list_id: "other" }).length, 0);
  });

  it("answers an empty list for no list at all, rather than throwing", () => {
    const read = suggestionReader(new Map());

    assert.equal(read(null).length, 0);
    assert.equal(read(undefined).length, 0);
    assert.equal(read({}).length, 0);
  });
});

describe("What the option surface declares, and what gates the rest", () => {
  it("declares the users slot as rows whose one read member is unproved", () => {
    assert.match(source, /@type \{\{ user_id\?: unknown \}\[\]\}\r?\n\s+\*\/\r?\n\s+users: \[\],/,
      "an empty initialiser would infer never[], which refuses both the assignment and every read");
    assert.match(source, /@type \{\{ users\?: \{ user_id\?: unknown \}\[\] \}\} \*\/ \(users\)/,
      "and the reader's own cast says the same, rather than claiming more than it checked");
  });

  it("had its dom gate discharged by 0.33.33.43.25, leaving two primitives on other reasons", () => {
    // This case originally pinned four primitives as gated on the `dom` family. `0.33.33.43.25`
    // narrowed the module handles, which is exactly what that deferral named as its discharge, so
    // the gate is gone and the pin now records what actually remains.
    assert.match(source, /clientFilter = findListsSelect\(/,
      "the handles are narrowed at their declaration, so the dom gate is discharged");

    const refillAt = source.indexOf("function replaceOptions(");
    assert.match(source.slice(source.lastIndexOf("/**", refillAt), refillAt), /@param \{HTMLSelectElement \| null\} \[select\]/,
      "and the refill is typed, because it reads `.options`");

    // Two remain, each on a reason that is no longer about element subtypes. `0.33.33.43.26`
    // closed `decorateFilterControl` with the same narrowing, so it is no longer among them.
    for (const name of ["option", "populateProjectOptions"]) {
      const at = source.indexOf(`function ${name}(`);
      assert.notEqual(at, -1, `${name} still exists`);
      const block = source.slice(source.lastIndexOf("/**", at), at);
      assert.doesNotMatch(block, /@param \{[^}]*\} (select|value|surface)/,
        `${name} is annotated; that deferral is discharged and this pin should go with it`);
    }
    assert.match(source, /element\.value = value;/,
      "the option builder still writes a member that requires text, and its caller's rows are unproved");
  });

  it("leaves the provider options untyped, because the two branches genuinely disagree", () => {
    // Discharged by the fallback building the same shape the contract declares, which is a change
    // to what this page offers rather than a typing decision.
    const at = source.indexOf("function listLinkProviderOptions(");
    const block = source.slice(source.lastIndexOf("/**", at), at);
    assert.doesNotMatch(block, /@param \{[^}]*\} \[?providers\]?/,
      "the providers parameter is annotated; re-decide this deferral");
    assert.match(source, /label: LIST_LINK_TYPE_LABELS\[targetType\],\r?\n\s+moduleId: moduleIdForListLinkTarget\(targetType\),\r?\n\s+targetType,/,
      "the fallback branch still builds a literal carrying none of id, provider or providerId");
  });
});
