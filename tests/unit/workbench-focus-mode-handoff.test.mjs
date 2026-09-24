import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/workbench.js");
function fixture() {
  /** @type {unknown[]} */ const calls = [];
  const scope = vm.createContext({ DEFAULT_FOCUS_MODE_ID: "default", selectFocusMode: (/** @type {unknown} */ value) => { calls.push(value); } });
  vm.runInContext(extractFunctionBlock(source, "handleFocusModeClick"), scope);
  return { scope, calls };
}

// .42.37 deferral: a checked closest result is opaque, not a proved DOM dataset.
// Discharge by reconciling this handoff with selection's consumers, without
// rejecting/coercing the value or widening the page's closed mode vocabulary.
// These executed cases force reassessment if that tolerance changes.
it("forwards an opaque mode value by identity with the original getter order and closest receiver", async () => {
  const f = fixture(), mode = { opaque: true };
  /** @type {string[]} */ const reads = [];
  const dataset = { get workbenchFocusMode() { assert.equal(this, dataset); reads.push("mode"); return mode; } };
  const button = { get dataset() { assert.equal(this, button); reads.push("dataset"); return dataset; } };
  const target = { get closest() {
    assert.equal(this, target); reads.push("closest");
    /** @this {unknown} @param {string} selector */
    function closest(selector) {
      assert.equal(this, target); assert.equal(selector, "[data-workbench-focus-mode]"); reads.push("call"); return button;
    }
    return closest;
  } };
  const event = { get target() { reads.push("target"); return target; } };
  await f.scope.handleFocusModeClick(event);
  assert.equal(f.calls[0], mode);
  assert.deepEqual(reads, ["target", "closest", "call", "dataset", "mode"]);
  await f.scope.handleFocusModeClick({ target: { closest: () => ({ dataset: { workbenchFocusMode: 7 } }) } });
  assert.equal(f.calls[1], 7);
});

it("keeps no-match absence, falsy-mode fallback and asynchronous selection failure", async () => {
  const f = fixture();
  await f.scope.handleFocusModeClick({ target: { closest: () => null } });
  assert.deepEqual(f.calls, []);
  for (const value of [undefined, null, false, 0, ""]) {
    await f.scope.handleFocusModeClick({ target: { closest: () => ({ dataset: { workbenchFocusMode: value } }) } });
  }
  assert.deepEqual(f.calls, Array(5).fill("default"));
  const failure = new Error("selection");
  f.scope.selectFocusMode = async () => { throw failure; };
  await assert.rejects(f.scope.handleFocusModeClick({ target: { closest: () => ({ dataset: { workbenchFocusMode: "project" } }) } }), error => error === failure);
});

it("retains nullish and non-callable failures rather than returning as if no button matched", async () => {
  const f = fixture();
  for (const target of [null, undefined, { closest: 7 }, { closest: () => ({ dataset: null }) }]) {
    await assert.rejects(f.scope.handleFocusModeClick({ target }), { name: "TypeError" });
    assert.deepEqual(f.calls, []);
  }
  const failure = new Error("closest getter");
  await assert.rejects(f.scope.handleFocusModeClick({ target: { get closest() { throw failure; } } }), error => error === failure);
});
