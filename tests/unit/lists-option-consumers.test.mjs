import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, it } from "vitest";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = readFileSync("public/js/lists.js", "utf8");
const baseline = JSON.parse(readFileSync("tests/fixtures/lists-option-consumers/baseline.json", "utf8"));
/** @param {boolean} before @param {Record<string, unknown>} globals */
function fixture(before, globals) {
  const sandbox = vm.createContext({ URLSearchParams, ...globals });
  vm.runInContext(baseline.constant, sandbox);
  for (const name of Object.keys(baseline.functions)) {
    vm.runInContext(before ? baseline.functions[name] : extractFunctionBlock(source, name), sandbox);
  }
  return vm.runInContext("({ option, loadItemSuggestions, itemSuggestionsForList, updateSuggestionDatalist, applySuggestionSelection })", sandbox);
}

describe("Lists catalog and option consumers", () => {
  it("pins committed browser baseline bodies to the full-history baseline", () => {
    assert.equal(baseline.base, "07c3d32e92ff967301d9e1caead2768f390e288b");
    const original = execFileSync("git", ["show", `${baseline.base}:public/js/lists.js`], { encoding: "utf8" });
    for (const [name, body] of Object.entries(baseline.functions)) {
      assert.equal(body, extractFunctionBlock(original, name), name);
      if (name !== "option") assert.equal(extractFunctionBlock(source, name), body, `${name} executable body unchanged`);
    }
    assert.ok(original.includes(baseline.constant));
  });

  it("preserves value-before-label conversion and partial progress on a thrown hook", () => {
    for (const before of [true, false]) {
      /** @type {string[]} */
      const calls = [];
      const sentinel = {};
      let storedValue = "initial";
      let storedText = "initial";
      const element = {
        /** @param {unknown} value */
        set value(value) { storedValue = `${value}`; },
        /** @param {unknown} value */
        set textContent(value) { storedText = value === null || value === undefined ? "" : `${value}`; },
      };
      const api = fixture(before, { document: { createElement: () => element } });
      assert.throws(() => api.option(
        { toString() { calls.push("value"); return "kept"; } },
        { toString() { calls.push("label"); throw sentinel; } },
      ), error => error === sentinel);
      assert.deepEqual(calls, ["value", "label"]);
      assert.equal(storedValue, "kept");
      assert.equal(storedText, "initial");
    }
  });

  it("uses strict nullish text conversion rather than truthiness or legacy equality", () => {
    const body = extractFunctionBlock(source, "option");
    assert.match(body, /label === null \|\| label === undefined \? null : `\$\{label\}`/);
    for (const label of [null, undefined, false, 0, "", " "]) {
      let text = "initial";
      const api = fixture(false, { document: { createElement: () => ({
        value: "",
        /** @param {unknown} value */
        set textContent(value) { text = value === null || value === undefined ? "" : `${value}`; },
      }) } });
      api.option("v", label);
      assert.equal(text, label === null || label === undefined ? "" : `${label}`);
    }
  });

  it("retains validated row identity, cache misses, request and selection behavior", async () => {
    for (const before of [true, false]) {
      const row = { catalog_item_id: "c1", item_name: "Widget", quantity: 0, use_count: 2,
        estimated_cost: null, notes: null, unit: "", url: null, vendor_name: "Vendor", metadata: {} };
      const state = { itemSuggestions: new Map() };
      /** @type {unknown[]} */
      const requests = [];
      /** @type {unknown[][]} */
      const writes = [];
      const api = fixture(before, {
        state,
        requireApi: () => ({ getJson: (/** @type {unknown[]} */ ...args) => { requests.push(args); return { suggestions: [row, null] }; } }),
        setFormValue: (/** @type {unknown[]} */ ...args) => writes.push(args),
        document: { createElement: () => ({ value: "", textContent: "", dataset: {} }) },
      });
      const rows = await api.loadItemSuggestions({ list_id: "l1" });
      assert.equal(rows[0], row);
      assert.equal(rows.length, 1);
      assert.equal(state.itemSuggestions.get("l1"), rows);
      assert.equal(api.itemSuggestionsForList({ list_id: "l1" }), rows);
      assert.deepEqual(JSON.parse(JSON.stringify(requests)), [["/api/lists/item-suggestions?limit=12&listId=l1", { cache: "no-store" }]]);
      /** @type {unknown[]} */
      const rendered = [];
      const container = { querySelector: () => ({ replaceChildren: (/** @type {unknown[]} */ ...values) => rendered.push(...values) }) };
      api.updateSuggestionDatalist(container, { list_id: "l1" });
      assert.deepEqual(JSON.parse(JSON.stringify(rendered)), [{ value: "Widget", textContent: "Widget - Vendor / used 2", dataset: { catalogItemId: "c1" } }]);
      const form = {};
      api.applySuggestionSelection(form, { list_id: "l1" }, " WIDGET ");
      assert.equal(writes[0][0], form);
      assert.deepEqual(writes[0].slice(1), ["catalog_item_id", "c1"]);
      assert.deepEqual(writes[1].slice(1), ["quantity", 0]);
      assert.equal(api.itemSuggestionsForList(null).length, 0);
      assert.equal(api.itemSuggestionsForList({ list_id: "missing" }).length, 0);
    }
  });

  it("keeps failed loads cached as empty without fetching for an absent ID", async () => {
    for (const before of [true, false]) {
      const state = { itemSuggestions: new Map() };
      let requests = 0;
      const api = fixture(before, { state, requireApi: () => ({ getJson() { requests++; throw new Error("network"); } }) });
      assert.equal((await api.loadItemSuggestions(null)).length, 0);
      assert.equal(requests, 0);
      const rows = await api.loadItemSuggestions({ list_id: "l1" });
      assert.equal(rows.length, 0);
      assert.equal(state.itemSuggestions.get("l1").length, 0);
      assert.notEqual(state.itemSuggestions.get("l1"), rows, "the original catch constructs two separate empty arrays");
      assert.equal(requests, 1);
    }
  });
});
