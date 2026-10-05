import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
const body = extractFunctionBlock(source, "clampRecommendedCandidateIndex");
const current = vm.runInNewContext(`(${body})`);
const old = vm.runInNewContext(`(${body.replace('Number.parseInt(`${index}`, 10)', 'Number.parseInt(index, 10)')})`);

it("matches native parseInt coercion across numeric and opaque index values", () => {
  for (const value of [undefined, null, false, true, "", " 2tail", "0x10", -1, -0, 2.9, 1e21, 1e-7, Infinity, NaN, 9n]) {
    for (const count of [0, 1, 3, 10]) assert.equal(current(value, count), old(value, count));
  }
  assert.equal(current(" 2tail", 5), 2);
  assert.equal(current(99, 5), 4);
  assert.equal(current(-1, 5), 0);
  assert.equal(current(NaN, 5), 0);
  for (const read of [old, current]) assert.throws(() => read(Symbol("index"), 3), { name: "TypeError" });
});

it("preserves conversion hint, count, failure identity and the empty-list short circuit", () => {
  for (const read of [old, current]) {
    /** @type {string[]} */ const calls = [];
    const value = { [Symbol.toPrimitive](/** @type {string} */ hint) { calls.push(hint); return "2.9"; } };
    assert.equal(read(value, 4), 2); assert.deepEqual(calls, ["string"]);
    const failure = new Error("conversion");
    const bad = { [Symbol.toPrimitive]() { throw failure; } };
    assert.doesNotThrow(() => read(bad, 0)); assert.doesNotThrow(() => read(bad, -1));
    assert.equal(read(bad, 0), 0); assert.equal(read(bad, -1), 0);
    assert.throws(() => read(bad, 4), error => error === failure);
  }
});

it("wraps the ranked window and preserves recommendation-before-inspector rendering", () => {
  const state = { recommendedCandidateIndex: 0 };
  /** @type {string[]} */ const calls = [];
  let count = 3;
  const run = vm.runInNewContext(`(${extractFunctionBlock(source, "cycleRecommendedCandidate")})`, {
    state, recommendedCandidateWindow: () => Array.from({ length: count }),
    renderRecommendedAction: () => calls.push(`recommended:${state.recommendedCandidateIndex}`),
    renderWorkbenchInspector: () => calls.push(`inspector:${state.recommendedCandidateIndex}`),
  });
  run(-1); assert.equal(state.recommendedCandidateIndex, 2);
  run(1); assert.equal(state.recommendedCandidateIndex, 0);
  assert.deepEqual(calls, ["recommended:2", "inspector:2", "recommended:0", "inspector:0"]);
  calls.length = 0; count = 1; run(1); count = 0; run(-1);
  assert.equal(state.recommendedCandidateIndex, 0); assert.deepEqual(calls, []);
});
