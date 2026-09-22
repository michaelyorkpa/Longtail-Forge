import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
const nativeCall = "encodeURIComponent(`${taskId}`)";
const urlConsumers = ["refreshActiveTaskFocus", "refreshTaskFocusRelatedContext", "completeFocusedTask", "resumeFocusedTask", "handleTaskFocusChecklistChange", "saveFocusedTaskTimer", "finalizeFocusedTaskTimer", "resetFocusedTaskTimer"];
/** @param {unknown} id @param {string} name @param {boolean} original */
function fixture(id, name, original) {
  /** @type {unknown[][]} */ const calls = [];
  const api = Object.fromEntries(["getJson", "postJson", "putJson", "deleteJson"].map(method => [method, async (/** @type {unknown} */ path) => { calls.push([method, path]); return { task: {} }; }]));
  const scope = vm.createContext({
    state: { activeTaskFocus: { taskId: id, task: {} } },
    requireApi: () => api,
    requireTaskRecords: () => ({ readTaskDetail: () => ({}), readTask: () => ({}) }),
    requireErrors: () => ({ caughtMessage: (/** @type {Error} */ e) => { calls.push(["caught", e.name]); return e.name; } }),
    setStatus: (/** @type {unknown} */ message) => calls.push(["status", message]),
    requireModalDialogs: () => ({ confirm: async () => { calls.push(["confirm"]); return true; } }),
    currentTaskFocusTimer: () => ({}), taskFocusTitle: () => "Task", readElapsedSeconds: () => 3,
    consumeTaskFocusResumeNote: async (/** @type {unknown} */ task, /** @type {unknown} */ taskId) => { assert.equal(taskId, id); return task; },
    refreshWorkbenchAfterTaskFocusTimerMutation: async (/** @type {unknown} */ result, /** @type {unknown} */ taskId) => { assert.equal(taskId, id); calls.push(["refresh"]); },
    refreshTaskFocusRelatedContext: async (/** @type {unknown} */ taskId) => { assert.equal(taskId, id); calls.push(["related"]); },
    taskFocusRelatedContextState: () => ({}), normalizeTaskFocusRelatedContext: () => ({}),
    taskFocusChecklistClosest: () => ({}), taskFocusChecklistRequiredField: (/** @type {unknown} */ value, /** @type {string} */ key) => key === "checked" ? true : key === "dataset" ? {} : "item",
    applyTaskFocusChecklistResult: () => {}, applyActiveTaskFocusTask: () => {},
    resetTaskFocusState: () => calls.push(["reset"]), refreshFocusCandidates: async () => {},
    renderWorkbench: () => {}, renderTaskFocusSurface: () => {}, renderWorkbenchInspector: () => {}, renderWorkbenchViewState: () => {}, renderTaskFocusInspector: () => {},
    offerTaskResumeNote: () => {}, focusActiveFocusQuestion: () => {}, setTaskCompletionStatus: () => {}, renderTaskRecurrenceContinuity: () => {},
  });
  const block = extractFunctionBlock(source, name);
  assert.ok(block.includes(nativeCall), `${name} must exercise its native encoding boundary`);
  vm.runInContext(original ? block.replaceAll(nativeCall, "encodeURIComponent(taskId)") : block, scope);
  return { scope, calls };
}
it("all eight URL consumers preserve native conversion, failure path and raw forwarding", async () => {
  for (const name of urlConsumers) {
    for (const kind of ["number", "bigint", "object", "symbol", "throws", "surrogate", "null", "zero", "nan", "empty"]) {
      /** @type {unknown[][]} */ const observed = [];
      for (const original of [true, false]) {
        /** @type {unknown[]} */ const conversions = [];
        const id = kind === "null" ? null : kind === "zero" ? 0 : kind === "nan" ? NaN : kind === "empty" ? "" : kind === "bigint" ? 7n : kind === "number" ? 7 : kind === "symbol" ? Symbol("id") : kind === "surrogate" ? "\ud800" : {
          [Symbol.toPrimitive](/** @type {string} */ hint) { conversions.push(hint); if (kind === "throws") throw new RangeError("conversion"); return "a/b"; },
        };
        const f = fixture(id, name, original);
        await f.scope[name](name === "handleTaskFocusChecklistChange" ? { target: {} } : name === "saveFocusedTaskTimer" ? "paused" : undefined);
        observed.push([f.calls, conversions]);
        assert.equal(f.scope.state.activeTaskFocus.taskId, id);
        if (["null", "zero", "nan", "empty"].includes(kind)) assert.ok(!f.calls.some(call => String(call[0]).endsWith("Json")), `${name} keeps its existing absent-ID path`);
        else if (kind === "number" || kind === "bigint" || kind === "object") assert.ok(f.calls.some(call => String(call[0]).endsWith("Json")), `${name} must issue its real boundary call`);
        else assert.ok(f.calls.some(call => call[0] === "caught" && ["TypeError", "RangeError", "URIError"].includes(String(call[1]))), `${name} must retain the handled conversion failure`);
      }
      assert.deepEqual(observed[1], observed[0], `${name}: ${kind}`);
    }
  }
});
it("resume capture and timer refresh forward identity and distinguish equal-looking objects", async () => {
  /** @type {unknown[]} */ const seen = [];
  const id = {}, task = {}, state = { activeTaskFocus: { taskId: id } };
  const scope = vm.createContext({ state, requireNamespace: () => ({ taskResumeNoteCapture: { consume: async (/** @type {{taskId:unknown}} */ options) => { seen.push(options.taskId); return { task }; } } }),
    applyActiveTaskFocusTask: (/** @type {unknown} */ value) => seen.push(value),
    loadWorkbench: async () => { state.activeTaskFocus = { taskId: {} }; },
    renderTaskFocusSurface: () => {}, renderWorkbenchInspector: () => {}, renderWorkbenchViewState: () => {},
  });
  vm.runInContext(["consumeTaskFocusResumeNote", "taskFocusTimerResultTask", "refreshWorkbenchAfterTaskFocusTimerMutation"].map(name => extractFunctionBlock(source, name)).join("\n"), scope);
  assert.equal(await scope.consumeTaskFocusResumeNote(task, id), task);
  await scope.refreshWorkbenchAfterTaskFocusTimerMutation({ task }, id);
  assert.deepEqual(seen, [id, task]);
});
// Native dataset conversion and ordering are covered with real browser buttons in workbench-detail-context.spec.mjs.
it("the requested boxed focus lookup accepts inherited primitive focus and keeps its receiver", async () => {
  const scope = vm.createContext({ candidateTaskId: () => "", candidateModuleAction: () => null, openNonTaskFocusFallback: () => {} });
  vm.runInContext(extractFunctionBlock(source, "openCandidate"), scope);
  vm.runInContext('Number.prototype.focus = function () { "use strict"; globalThis.focusReceiver = this; };', scope);
  vm.runInContext("Number.prototype.focus.call = 7; Number.prototype.focus.apply = 7;", scope);
  await scope.openCandidate({}, 7);
  assert.equal(scope.focusReceiver, 7);
});
