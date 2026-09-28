import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, it } from "vitest";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = readFileSync("public/js/lists.js", "utf8");
const baseline = JSON.parse(readFileSync("tests/fixtures/lists-link-picker/baseline.json", "utf8"));
const names = ["listLinkProviderOptions", "queueListEditorLinkTargetSearch", "moduleIdForListLinkTarget", "formatToken"];

/** @param {boolean} before @param {boolean} business */
function fixture(before, business) {
  const sandbox = vm.createContext({ business });
  const constants = before ? baseline.constants : ["LIST_LINK_TARGET_ORDER", "LIST_LINK_TYPE_LABELS"].map((name) => {
    const match = source.match(new RegExp(`  const ${name} = [\\s\\S]*?;`));
    assert.ok(match);
    return match[0];
  });
  vm.runInContext(constants.join("\n"), sandbox);
  vm.runInContext(`
    const state = { linkTargetSearchTimer: null };
    const scheduled = new Map();
    const trace = [];
    let next = 1;
    let loads = 0;
    function usesBusinessScope() { return business; }
    function loadListEditorLinkTargets() { loads++; }
    const window = {
      clearTimeout(id) { trace.push(["clear", Number(id) || 0]); scheduled.delete(Number(id) || 0); },
      setTimeout(callback, delay) { trace.push(["set", delay]); const id = next++; scheduled.set(id, callback); return id; },
    };
  `, sandbox);
  for (const name of names) vm.runInContext(before ? baseline.functions[name] : extractFunctionBlock(source, name), sandbox);
  return sandbox;
}

/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

describe("Lists picker matches its integrated baseline", () => {
  for (const business of [false, true]) {
    it(`keeps fallback and every provider subset in canonical order (business=${business})`, () => {
      const before = fixture(true, business);
      const after = fixture(false, business);
      for (let mask = 0; mask < 16; mask++) {
        const providers = ["client", "project", "note", "task"].filter((_, index) => mask & (1 << index))
          .map((targetType) => ({ targetType, id: `id-${targetType}`, providerId: `provider-${targetType}`, label: targetType, moduleId: targetType }));
        before.providers = providers;
        after.providers = providers;
        const expected = plain(vm.runInContext("listLinkProviderOptions(providers)", before));
        const actual = plain(vm.runInContext("listLinkProviderOptions(providers)", after));
        assert.deepEqual(actual, expected);
        if (mask === 0) {
          assert.deepEqual(actual.map(/** @param {{ targetType: unknown }} entry */ (entry) => entry.targetType), business ? ["task", "note", "project", "client"] : ["task", "note", "project"]);
          assert.ok(actual.every(/** @param {{ providerId: unknown }} entry */ (entry) => entry.providerId === ""));
        }
      }
    });
  }

  it("keeps last-provider selection, inherited fallbacks, getter order and receiver", () => {
    const observed = [true, false].map((before) => {
      const sandbox = fixture(before, true);
      return plain(vm.runInContext(`
        const reads = [];
        const parent = { get provider() { reads.push(["provider", this === provider]); return "legacy"; } };
        const provider = Object.create(parent);
        for (const [key, value] of Object.entries({ targetType: "task", label: "", moduleId: "", providerId: "", id: "id" })) {
          Object.defineProperty(provider, key, { get() { reads.push([key, this === provider]); return value; } });
        }
        const output = listLinkProviderOptions([{ targetType: "task", label: "discarded" }, provider]);
        ({ output, reads });
      `, sandbox));
    });
    assert.deepEqual(observed[1], observed[0]);
    assert.equal(observed[1].output[0].providerId, "legacy");
    assert.ok(observed[1].reads.every(/** @param {unknown[]} entry */ (entry) => entry[1]));
  });

  it("keeps required provider reads throwing, without introducing validation", () => {
    for (const before of [true, false]) {
      const sandbox = fixture(before, true);
      assert.throws(() => vm.runInContext("listLinkProviderOptions([null])", sandbox), { name: "TypeError" });
      assert.throws(() => vm.runInContext("listLinkProviderOptions(null)", sandbox), { name: "TypeError" });
    }
  });

  it("cancels before scheduling, keeps 180ms, saves the handle and runs only the latest search", () => {
    const observed = [true, false].map((before) => plain(vm.runInContext(`
      queueListEditorLinkTargetSearch();
      queueListEditorLinkTargetSearch();
      for (const callback of scheduled.values()) callback();
      ({ trace, handle: state.linkTargetSearchTimer, scheduled: [...scheduled.keys()], loads });
    `, fixture(before, true))));
    assert.deepEqual(observed[1], observed[0]);
    assert.deepEqual(observed[1], { trace: [["clear", 0], ["set", 180], ["clear", 1], ["set", 180]], handle: 2, scheduled: [2], loads: 1 });
  });

});
