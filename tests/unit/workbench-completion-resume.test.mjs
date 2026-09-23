import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
/** @param {Record<string, unknown>} globals @param {string[]} names */
function fixture(globals, names) {
  const scope = vm.createContext(globals);
  for (const name of ["workbenchSourceField", ...names]) vm.runInContext(extractFunctionBlock(source, name), scope);
  return scope;
}
it("updates matching candidates without changing unmatched identity, order or opaque task access", () => {
  const first = { moduleId: "tasks", recordType: "task", recordId: "one", extra: {} }, other = { moduleId: "tasks", recordType: "task", recordId: "two" };
  const state = { focusCandidates: [first, other], workCandidates: [other, first] };
  const s = fixture({ state }, ["workbenchCandidateField", "candidateTaskId", "syncTaskCandidateResumeNote"]);
  /** @type {string[]} */ const reads = [];
  const task = Object.create({ get task_id() { assert.equal(this, task); reads.push("id"); return " one "; }, get resume_note() { assert.equal(this, task); reads.push("note"); return " Resume here "; } });
  s.syncTaskCandidateResumeNote(task);
  assert.deepEqual(reads, ["id", "note"]);
  assert.equal(Reflect.get(state.focusCandidates[0], "extra"), first.extra);
  assert.notEqual(state.focusCandidates[0], first); assert.equal(state.focusCandidates[1], other);
  assert.equal(Reflect.get(state.focusCandidates[0], "handoffNote"), "Resume here");
  assert.equal(state.workCandidates[0], other); assert.equal(Reflect.get(state.workCandidates[1], "handoffNote"), "Resume here");
  s.syncTaskCandidateResumeNote(null); s.syncTaskCandidateResumeNote(7);
  assert.equal(state.focusCandidates[1], other);
  const failure = new Error("resume getter");
  assert.throws(() => s.syncTaskCandidateResumeNote({ task_id: "one", get resume_note() { throw failure; } }), e => e === failure);
});
it("retains raw offer and callback task identity and the existing callback ordering", () => {
  /** @type {unknown[][]} */ const calls = [];
  const state = { activeTaskFocus: { taskId: "one" } };
  const namespace = { taskResumeNoteCapture: { offer(/** @type {unknown} */ options) { assert.equal(this, namespace.taskResumeNoteCapture); calls.push(["offer", options]); } } };
  const s = fixture({ state, requireNamespace: () => namespace, resolvedWorkbenchViewState: () => "selection", WORKBENCH_VIEW_STATE_FOCUS_SELECTION: "selection",
    syncTaskCandidateResumeNote: (/** @type {unknown} */ task) => calls.push(["sync", task]), renderRecommendedAction: () => calls.push(["recommended"]), renderWorkbenchInspector: () => calls.push(["inspector"]),
    applyActiveTaskFocusTask: (/** @type {unknown} */ task) => calls.push(["apply", task]), renderTaskFocusSurface: () => calls.push(["surface"]), setStatus: /** @param {...unknown} args */ (...args) => calls.push(["status", ...args]),
  }, ["offerTaskResumeNote"]);
  const task = { title: "raw seed" }, trigger = {};
  s.offerTaskResumeNote(task, trigger);
  s.options = calls[0][1]; assert.equal(s.options.task, task); assert.equal(s.options.trigger, trigger);
  const updated = Object.create({ task_id: "one" });
  s.options.onSaved(updated);
  assert.deepEqual(calls.slice(1), [["sync", updated], ["recommended"], ["inspector"], ["apply", updated], ["surface"]]);
  const message = { opaque: true }, error = Object.create({ get message() { assert.equal(this, error); return message; } });
  s.options.onError(error); assert.equal(calls.at(-1)?.[1], message);
  s.options.onError(7); assert.equal(calls.at(-1)?.[1], "Resume note could not be saved.");
  assert.throws(() => s.options.onError(null), { name: "TypeError", message: "The Workbench source data cannot be read." });
  const failure = new Error("error getter");
  assert.throws(() => s.options.onError({ get message() { throw failure; } }), e => e === failure);
});
it("keeps recurrence identity, receiver, supersession, refresh ordering and rejection cleanup", async () => {
  /** @type {Array<(value: unknown) => Promise<void>>} */ const updates = [];
  /** @type {unknown[][]} */ const calls = [];
  /** @type {Array<{resolve: (value: unknown) => void, reject: (error: unknown) => void}>} */ const resolvers = [];
  const tasksDialog = { pollRecurrenceContinuity(/** @type {unknown} */ id, /** @type {{initialContinuity: unknown, onUpdate: (value: unknown) => Promise<void>}} */ options) {
    assert.equal(this, tasksDialog); calls.push(["poll", id, options.initialContinuity]); updates.push(options.onUpdate);
    return new Promise((resolve, reject) => resolvers.push({ resolve, reject }));
  } };
  const trackers = new Map();
  const s = fixture({ recurrenceContinuityTrackers: trackers, requireNamespace: () => ({ tasksDialog }), refreshFocusCandidates: async () => { calls.push(["refresh"]); }, renderTaskRecurrenceContinuity: (/** @type {unknown} */ value) => calls.push(["render", value]) }, ["trackTaskRecurrenceContinuity"]);
  /** @type {string[]} */ const hints = [];
  const id = { [Symbol.toPrimitive](/** @type {string} */ hint) { hints.push(hint); return "opaque-id"; } }, initial = Object.create({ status: "pending" });
  s.trackTaskRecurrenceContinuity(id, initial); const first = trackers.get(id);
  s.trackTaskRecurrenceContinuity(id, initial); assert.notEqual(trackers.get(id), first);
  assert.deepEqual(hints, ["string", "string"]); assert.equal(calls[0][1], id); assert.equal(calls[0][2], initial);
  const available = Object.create({ status: "available" });
  await updates[0](available); assert.equal(calls.length, 2);
  await updates[1](available); assert.deepEqual(calls.slice(2), [["refresh"], ["render", available]]);
  resolvers[0].resolve(undefined); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); assert.equal(trackers.size, 1);
  resolvers[1].reject(new Error("poll failed")); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); assert.equal(trackers.size, 0);
  assert.throws(() => s.trackTaskRecurrenceContinuity(Symbol("id"), initial), { name: "TypeError" });
  assert.doesNotThrow(() => s.trackTaskRecurrenceContinuity(null, { get status() { return assert.fail("id guard first"); } }));
  s.trackTaskRecurrenceContinuity("id", null);
});
it("retains the continuity renderer receiver and opaque arguments", () => {
  /** @type {unknown[][]} */ const calls = []; const container = {}, token = {};
  const tasksDialog = { recurrenceContinuityMessage(/** @type {unknown} */ value) { assert.equal(this, tasksDialog); calls.push(["message", value]); return "Scheduled"; }, renderRecurrenceContinuity(/** @type {unknown} */ target, /** @type {unknown} */ value) { assert.equal(this, tasksDialog); calls.push(["render", target, value]); } };
  const s = fixture({ statusText: container, requireNamespace: () => ({ tasksDialog }), setStatus: (/** @type {unknown} */ message) => calls.push(["status", message]) }, ["renderTaskRecurrenceContinuity"]);
  s.renderTaskRecurrenceContinuity(token); assert.deepEqual(calls, [["message", token], ["status", "Scheduled"], ["render", container, token]]);
});
it("keeps completion envelope own spread and raw member identity", async () => {
  for (const result of [null, undefined, 7, "raw", { task: { title: "seed" }, recurrenceContinuity: {} }]) {
    /** @type {unknown[][]} */ const calls = []; const state = { activeTaskFocus: { taskId: "one" } };
    const s = fixture({ state, requireApi: () => ({ postJson: async () => result }), requireTaskRecords: () => ({ readTaskDetail: (/** @type {unknown} */ value) => { assert.equal(value, result); calls.push(["read"]); return null; } }),
      setStatus: (/** @type {unknown} */ value) => calls.push(["status", value]), resetTaskFocusState: () => calls.push(["reset"]), refreshFocusCandidates: async () => { calls.push(["refresh"]); }, renderWorkbench: () => calls.push(["render"]),
      setTaskCompletionStatus: (/** @type {unknown} */ value) => calls.push(["completion", value]), renderTaskRecurrenceContinuity: (/** @type {unknown} */ value) => calls.push(["continuity", value]), focusActiveFocusQuestion: () => calls.push(["focus"]),
      requireErrors: () => ({ caughtMessage: () => assert.fail("unexpected error") }),
    }, ["completeFocusedTask"]);
    await s.completeFocusedTask();
    const detail = calls.find(row => row[0] === "completion")?.[1];
    s.detail = detail; assert.equal(s.detail.recordId, "one");
    assert.deepEqual(Object.keys(s.detail), [...Object.keys(Object(result)).filter(k => k !== "recordId"), "recordId"]);
    if (result && typeof result === "object") { assert.equal(s.detail.task, result.task); assert.equal(s.detail.recurrenceContinuity, result.recurrenceContinuity); }
    assert.deepEqual(calls.slice(0, 5).map(row => row[0]), ["status", "reset", "refresh", "render", "read"]);
    assert.equal(calls.at(-1)?.[0], "focus");
  }
});
it("spreads completion getters and symbols before reading the task, preserving thrown getters", async () => {
  /** @type {string[]} */ const order = [];
  const symbol = Symbol("metadata"), token = {}, failure = new Error("spread failure");
  const result = Object.create({ inherited: true });
  Object.defineProperty(result, "task", { enumerable: true, get() { order.push("task"); return token; } });
  Object.defineProperty(result, symbol, { enumerable: true, get() { order.push("symbol"); return token; } });
  const s = fixture({ state: { activeTaskFocus: { taskId: "one" } }, requireApi: () => ({ postJson: async () => result }),
    requireTaskRecords: () => ({ readTaskDetail: () => { order.push("read"); return null; } }),
    setStatus: () => {}, resetTaskFocusState: () => {}, refreshFocusCandidates: async () => {}, renderWorkbench: () => {},
    setTaskCompletionStatus: (/** @type {object} */ detail) => { assert.equal(Reflect.get(detail, symbol), token); assert.equal(Reflect.get(detail, "task"), token); assert.equal(Object.hasOwn(detail, "inherited"), false); },
    focusActiveFocusQuestion: () => { order.push("focus"); }, requireErrors: () => ({ caughtMessage: (/** @type {unknown} */ error) => { assert.equal(error, failure); order.push("caught"); return "failed"; } }),
  }, ["completeFocusedTask"]);
  await s.completeFocusedTask(); assert.deepEqual(order, ["task", "symbol", "read", "focus"]);
  Object.defineProperty(result, "broken", { enumerable: true, get() { throw failure; } });
  order.length = 0; await s.completeFocusedTask(); assert.deepEqual(order, ["task", "symbol", "caught"]);
});
