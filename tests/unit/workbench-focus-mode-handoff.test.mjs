import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/workbench.js");
function fixture() {
  /** @type {unknown[]} */ const calls = [];
  const scope = vm.createContext({ DEFAULT_FOCUS_MODE_ID: "default", selectFocusMode: (/** @type {unknown} */ value) => { calls.push(value); } });
  for (const name of ["workbenchSourceField", "handleFocusModeClick", "resolveFocusModeSelection"]) {
    vm.runInContext(extractFunctionBlock(source, name), scope);
  }
  return { scope, calls };
}

// .42.41 discharges the handoff: opaque needles reach selection unchanged;
// selection resolves against the page's published string mode vocabulary.
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
    await assert.rejects(f.scope.handleFocusModeClick({ target }), {
      name: "TypeError",
      message: target && "closest" in target && target.closest === 7
        ? "The Workbench focus target requires a callable closest method."
        : "The Workbench source data cannot be read.",
    });
    assert.deepEqual(f.calls, []);
  }
  const failure = new Error("closest getter");
  await assert.rejects(f.scope.handleFocusModeClick({ target: { get closest() { throw failure; } } }), error => error === failure);
});

it("resolves opaque mode needles through the real selection consumer without coercion", async () => {
  const f = fixture();
  const state = { focusModeId: "", focusModes: [{ id: "default" }, { id: "project" }], selectedProjectId: "ready" };
  /** @type {unknown[]} */ const effects = [];
  Object.assign(f.scope, {
    state, PROJECT_FOCUS_MODE_ID: "project", WORKBENCH_FOCUS_MODE_KEY: "mode",
    resetTaskFocusState() { effects.push("reset"); },
    window: { localStorage: { setItem(/** @type {unknown} */ key, /** @type {unknown} */ value) { effects.push([key, value]); } } },
    async refreshFocusCandidates() { effects.push("refresh"); },
  });
  vm.runInContext(extractFunctionBlock(source, "selectFocusMode"), f.scope);
  const opaque = { toString() { throw new Error("must not coerce"); } };
  for (const [mode, expected] of [[opaque, "default"], [7, "default"], [Symbol("mode"), "default"], ["project", "project"], ["unknown", "default"]]) {
    effects.length = 0;
    await f.scope.handleFocusModeClick({ target: { closest: () => ({ dataset: { workbenchFocusMode: mode } }) } });
    assert.equal(state.focusModeId, expected);
    assert.deepEqual(effects, ["reset", ["mode", expected], "refresh"]);
  }
});
