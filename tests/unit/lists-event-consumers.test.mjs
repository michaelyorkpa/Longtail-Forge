import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, it } from "vitest";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = readFileSync("public/js/lists.js", "utf8");
const baseline = JSON.parse(readFileSync("tests/fixtures/lists-event-consumers/baseline.json", "utf8"));

describe("Lists event consumer boundary", () => {
  it("pins browser fixtures to the full-history baseline", () => {
    assert.equal(baseline.base, "9426f0414a1ce16b3ee45d02792288bfc00ae1a0");
    const original = execFileSync("git", ["show", `${baseline.base}:public/js/lists.js`], { encoding: "utf8" });
    for (const [name, body] of Object.entries(baseline.functions)) {
      assert.equal(body, extractFunctionBlock(original, name), name);
    }
    for (const name of ["saveList", "moveItem", "refreshLists"]) {
      assert.equal(extractFunctionBlock(source, name), baseline.functions[name], `${name} body unchanged`);
    }
  });

  it("preserves checked-read receivers, method identity and hook exceptions", () => {
    const sandbox = vm.createContext({});
    for (const name of ["listEventField", "callListEventMember"]) vm.runInContext(extractFunctionBlock(source, name), sandbox);
    vm.runInContext(`
      const calls = [], sentinel = {};
      const method = function (arg) { calls.push(this === target, arg); return sentinel; };
      Object.defineProperty(method, "apply", { get() { throw new Error("must not read apply"); } });
      Object.defineProperty(method, "call", { get() { throw new Error("must not read call"); } });
      const target = { get closest() { calls.push("closest"); return method; } };
      const returned = callListEventMember(target, "closest", ["selector"]);
    `, sandbox);
    assert.equal(vm.runInContext("returned === sentinel", sandbox), true);
    assert.deepEqual(Array.from(vm.runInContext("calls", sandbox)), ["closest", true, "selector"]);
    for (const key of ["closest", "matches", "reset"]) {
      assert.throws(() => vm.runInContext(`callListEventMember({}, "${key}", [])`, sandbox), {
        name: "TypeError", message: `The list event target has no callable ${key}.`,
      });
    }
    assert.throws(() => vm.runInContext('listEventField(null, "dataset")', sandbox), {
      name: "TypeError", message: "The list event target cannot be read.",
    });
    assert.equal(vm.runInContext(`(() => { try { listEventField({ get dataset() { throw sentinel; } }, "dataset"); } catch(e) { return e === sentinel; } })()`, sandbox), true);
  });

  it("preserves opaque action identifiers at URI sinks and selection identity", async () => {
    for (const kind of ["number", "object", "symbol", "throwing", "undefined"]) {
      const results = [];
      for (const before of [true, false]) {
        const sandbox = vm.createContext({ URLSearchParams });
        vm.runInContext(`
          const log = [], sentinel = {};
          const id = ${kind === "number" ? "7" : kind === "symbol" ? 'Symbol("id")' : kind === "undefined" ? "undefined" : `{ toString() { log.push("convert"); ${kind === "throwing" ? "throw sentinel;" : 'return "item/value";'} } }`};
          const state = { selectedListId: "previous" };
          const window = { location: { search: "", pathname: "/lists.html" }, history: { replaceState(a,b,url) { log.push(url); } } };
          function requireApi() { log.push("api"); return { postJson: async (...args) => log.push(args), deleteJson: async (...args) => log.push(args) }; }
          function selectedList() { return null; }
          function renderDetail() {} function collapseIndexAfterSelection() {} function updateListSelectionState() {}
          function setStatus() {} async function loadLists() {} function renderLists() {}
        `, sandbox);
        for (const name of ["runAction", "refreshLists", "selectList"]) vm.runInContext(before ? baseline.functions[name] : extractFunctionBlock(source, name), sandbox);
        results.push(await vm.runInContext(`(async () => {
          const errors = [];
          for (const action of ["delete-item", "remove-link"]) {
            try { await runAction(action, { list_id: "list" }, id, id); }
            catch(e) { errors.push([e.name, e === sentinel]); }
          }
          await refreshLists(id);
          const preserved = state.selectedListId === (id || "previous");
          try { selectList(id); } catch(e) { errors.push([e.name, e === sentinel]); }
          return { log, errors, preserved };
        })()`, sandbox));
      }
      assert.deepEqual(JSON.parse(JSON.stringify(results[1])), JSON.parse(JSON.stringify(results[0])), kind);
      assert.equal(results[1].preserved, true);
    }
  });
});
