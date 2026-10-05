import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
function fixture() {
  /** @type {unknown[][]} */ const calls = [];
  const scope = vm.createContext({
    setStatus: (/** @type {unknown} */ message) => calls.push(["status", message]),
    renderTaskRecurrenceContinuity: (/** @type {unknown} */ value) => calls.push(["render", value]),
    trackTaskRecurrenceContinuity: (/** @type {unknown} */ id, /** @type {unknown} */ value) => calls.push(["track", id, value]),
    candidateTaskId: () => "", candidateModuleAction: () => null,
    openNonTaskFocusFallback: (/** @type {unknown} */ candidate) => calls.push(["fallback", candidate]),
  });
  vm.runInContext(["taskCompletionField", "setTaskCompletionStatus", "openCandidate"].map(name => extractFunctionBlock(source, name)).join("\n"), scope);
  return { scope, calls };
}
it("completion keeps opaque continuity, inherited accessors, receiver and read/render order", () => {
  const { scope: s, calls } = fixture(); const continuity = { status: "pending" }, id = {};
  const task = Object.create({ get task_id() { assert.equal(this, task); calls.push(["task_id"]); return id; } });
  const detail = Object.create({
    get recurrenceContinuity() { assert.equal(this, detail); calls.push(["continuity"]); return continuity; },
    get recordId() { calls.push(["recordId"]); return ""; },
    get task() { calls.push(["task"]); return task; },
  });
  s.setTaskCompletionStatus(detail);
  assert.deepEqual(calls, [["continuity"], ["render", continuity], ["recordId"], ["task"], ["task_id"], ["track", id, continuity]]);
});
it("completion preserves lazy reads, nullish task fallback, boxing and failures", () => {
  const { scope: s, calls } = fixture();
  for (const value of [undefined, 0, false, "", Symbol("detail")]) s.setTaskCompletionStatus(value);
  assert.equal(calls.length, 5); assert.ok(calls.every(call => call[1] === "Task completed."));
  assert.throws(() => s.setTaskCompletionStatus(null), /completion detail cannot be read/);
  const failure = new Error("getter failed");
  s.setTaskCompletionStatus({ recurrenceContinuity: false, get recordId() { throw failure; } });
  s.setTaskCompletionStatus({ recurrenceContinuity: true, recordId: "id", get task() { throw failure; } });
  for (const task of [null, undefined, 0, "", false]) {
    s.setTaskCompletionStatus({ recurrenceContinuity: true, task });
    assert.deepEqual(calls.at(-1), ["track", "", true]);
  }
  calls.length = 0;
  assert.throws(() => s.setTaskCompletionStatus({ recurrenceContinuity: true, get recordId() { throw failure; } }), e => e === failure);
  assert.deepEqual(calls, [["render", true]]);
});
it("fallback focuses an inherited callable exactly once after navigation with its original receiver", async () => {
  const { scope: s, calls } = fixture(); const candidate = {};
  const target = Object.create({ get focus() { assert.equal(this, target); calls.push(["read-focus"]); return /** @this {unknown} */ function () { calls.push(["focus", this]); }; } });
  await s.openCandidate(candidate, target);
  assert.deepEqual(calls, [["fallback", candidate], ["read-focus"], ["focus", target]]);
});
it("focus preserves optional absence, non-callable failure and accessor failure after fallback", async () => {
  const { scope: s, calls } = fixture();
  for (const target of [null, {}, { focus: null }, { focus: undefined }]) await s.openCandidate({}, target);
  assert.equal(calls.length, 4);
  await assert.rejects(s.openCandidate({}, { focus: 7 }), /callable focus member/);
  assert.equal(calls.length, 5);
  const failure = new Error("focus getter failed");
  await assert.rejects(s.openCandidate({}, { get focus() { throw failure; } }), e => e === failure);
  assert.equal(calls.length, 6);
});
it("retains the pre-existing opaque focus-ID identity through the real candidate reader and constructor", () => {
  const scope = vm.createContext({});
  vm.runInContext(["workbenchCandidateField", "candidateTaskId", "looksLikeRawId", "safeCandidateText", "taskFocusFromCandidate"].map(name => extractFunctionBlock(source, name)).join("\n"), scope);
  for (const recordId of [7, { toString() { return "opaque-id"; } }]) {
    const candidate = { moduleId: "tasks", recordType: "task", recordId, title: "Task" };
    const id = scope.candidateTaskId(candidate);
    const focus = scope.taskFocusFromCandidate(candidate, id);
    assert.equal(id, recordId);
    assert.equal(focus.taskId, recordId);
    assert.equal(focus.relatedContext.taskId, recordId);
  }
});
