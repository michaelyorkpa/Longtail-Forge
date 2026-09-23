import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/workbench.js");
const names = ["workbenchSourceField", "taskFocusChecklistRequiredField", "taskFocusChecklistResultFields", "taskFocusChecklistClosest", "workbenchCandidateField", "taskFocusFromCandidate", "refreshActiveTaskFocus", "consumeTaskFocusResumeNote", "refreshTaskFocusRelatedContext", "normalizeTaskFocusRelatedContext", "taskFocusRelatedContextState", "applyActiveTaskFocusTask", "preserveTaskFocusChecklistData", "syncTaskCandidateResumeNote", "candidateTaskId", "applyTaskFocusChecklistResult", "handleTaskFocusChecklistChange", "taskFocusTimerEligibility", "activeTaskFocusCandidate", "taskFocusTitle", "taskFocusContextLabel", "safeTaskFocusText", "safeCandidateText", "looksLikeRawId"];

function fixture() {
  /** @type {unknown[][]} */ const calls = [];
  const namespace = {};
  const scope = vm.createContext({ calls, namespace, WORKBENCH_VIEW_STATE_FOCUS_SELECTION: "focus-selection", DEFAULT_FOCUS_MODE_ID: "pick-up-where-left-off",
    requireNamespace: () => namespace,
    requireErrors: () => ({ caughtMessage: (/** @type {unknown} */ error, /** @type {string} */ fallback) => error instanceof Error ? error.message : fallback }),
    renderTaskFocusSurface: () => calls.push(["surface"]), renderWorkbenchInspector: () => calls.push(["inspector"]), renderWorkbenchViewState: () => calls.push(["view"]),
    renderTaskFocusInspector: () => calls.push(["related"]), renderWorkbench: () => calls.push(["workbench"]),
    setStatus: (/** @type {unknown} */ message, /** @type {unknown} */ options) => calls.push(["status", message, options]),
    moduleEnabled: () => true,
  });
  const start = source.indexOf("  let state = {");
  const end = source.indexOf("  let tickIntervalId", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end) + names.map(name => extractFunctionBlock(source, name)).join("\n"), scope);
  const state = vm.runInContext("state", scope);
  state.activeTaskFocus = scope.taskFocusFromCandidate({ title: "First", candidateId: "candidate", status: "open", priority: "high", due_at: 42 }, "one");
  return { scope, state, calls, namespace };
}

function pending() {
  /** @type {(value: unknown) => void} */ let resolve = () => {};
  /** @type {(reason: unknown) => void} */ let reject = () => {};
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it("derives the real seed and keeps opaque mutation members, checklist references and candidate synchronization", () => {
  const f = fixture();
  assert.equal(f.state.activeTaskFocus.dueAt, 42); assert.equal(f.state.activeTaskFocus.task, null);
  const items = [{ label: "First" }], progress = { total_count: 1 };
  f.scope.applyActiveTaskFocusTask({ task_id: "one", title: "Saved", checklistItems: items, checklistProgress: progress });
  const matched = { moduleId: "tasks", recordType: "task", recordId: "one", handoffNote: "old" };
  const other = { moduleId: "tasks", recordType: "task", recordId: "other" };
  f.state.focusCandidates = [matched, other]; f.state.workCandidates = [other, matched];
  const status = { toString: () => "open" }, payload = { task_id: "one", title: "Updated", resume_note: " carry ", status };
  f.scope.applyActiveTaskFocusTask(payload);
  const task = f.state.activeTaskFocus.task;
  assert.notEqual(task, payload); assert.equal(task.status, status); assert.equal(f.state.activeTaskFocus.status, status);
  assert.equal(task.checklistItems, items); assert.equal(task.checklistProgress, progress);
  assert.equal(f.state.focusCandidates[0].handoffNote, "carry"); assert.equal(f.state.focusCandidates[1], other);
  assert.equal(f.state.workCandidates[0], other); assert.equal(f.state.workCandidates[1].handoffNote, "carry");
  assert.equal(matched.handoffNote, "old");
  f.scope.applyActiveTaskFocusTask(null); assert.equal(f.state.activeTaskFocus.task, null);
  assert.equal(f.state.activeTaskFocus.title, "Updated"); assert.equal(f.state.activeTaskFocus.isLoading, false);
});

it("retains native spread for primitive, symbol-keyed, inherited and throwing inputs", () => {
  const f = fixture(), symbol = Symbol("metadata");
  for (const input of [null, undefined, false, 12, 42n, Symbol("value"), "abc"]) {
    assert.deepEqual(Object.entries(f.scope.preserveTaskFocusChecklistData(input)), typeof input === "string" ? [["0", "a"], ["1", "b"], ["2", "c"]] : []);
  }
  const metadata = {}, prototype = { inherited: "not copied" }, input = Object.create(prototype);
  /** @type {string[]} */ const order = [];
  Object.defineProperties(input, { title: { enumerable: true, get() { order.push("title"); return "Read once"; } }, ["__proto__"]: { enumerable: true, value: metadata } });
  input[symbol] = metadata;
  const merged = f.scope.preserveTaskFocusChecklistData(input);
  assert.deepEqual(order, ["title"]); assert.equal(merged[symbol], metadata);
  assert.equal(Object.hasOwn(merged, "inherited"), false); assert.equal(Object.hasOwn(merged, "__proto__"), true);
  assert.equal(merged.__proto__, metadata); assert.notEqual(Object.getPrototypeOf(merged), metadata);
  const failure = new Error("getter failed");
  assert.throws(() => f.scope.preserveTaskFocusChecklistData({ get title() { throw failure; } }), error => error === failure);
  /** @type {string[]} */ const checks = [];
  const old = { get checklistItems() { checks.push("items"); return []; }, get checklistProgress() { checks.push("progress"); return {}; } };
  f.scope.preserveTaskFocusChecklistData({}, old);
  assert.deepEqual(checks, ["items", "items", "progress", "progress"]);
});

it("keeps consume callback identity/fallbacks and propagates its error without validating its task", async () => {
  const f = fixture(), original = { title: "caller" }, replacement = { title: "opaque", status: 7 };
  assert.equal(await f.scope.consumeTaskFocusResumeNote(original, "one"), original);
  /** @type {unknown} */ let receiver = "unread";
  const namespace = { taskResumeNoteCapture: { consume: function (/** @type {{task:unknown,taskId:string}} */ request) { receiver = this; assert.equal(request.task, original); assert.equal(request.taskId, "one"); return { task: replacement }; } } };
  f.scope.requireNamespace = () => namespace;
  assert.equal(await f.scope.consumeTaskFocusResumeNote(original, "one"), replacement); assert.equal(receiver, undefined);
  f.scope.requireNamespace = () => ({ taskResumeNoteCapture: { consume: () => ({ task: null }) } });
  assert.equal(await f.scope.consumeTaskFocusResumeNote(original, "one"), original);
  const failure = new Error("consume failed");
  f.scope.requireNamespace = () => ({ taskResumeNoteCapture: { consume: () => ({ reason: "error", error: failure }) } });
  await assert.rejects(f.scope.consumeTaskFocusResumeNote(original, "one"), error => error === failure);
});

it("discards stale detail responses before consumption and stale consumed tasks before applying", async () => {
  const f = fixture(), detail = pending();
  f.scope.requireApi = () => ({ getJson: () => detail.promise });
  f.scope.requireTaskRecords = () => ({ readTaskDetail: () => { throw new Error("stale detail must not be read"); } });
  const operation = f.scope.refreshActiveTaskFocus();
  const next = f.scope.taskFocusFromCandidate({ title: "Second" }, "two"); f.state.activeTaskFocus = next;
  detail.resolve({ task: {} }); await operation; assert.equal(f.state.activeTaskFocus, next);
  const consumed = pending(), entered = pending();
  f.scope.requireApi = () => ({ getJson: async () => ({ task: { title: "Detail" } }) });
  f.scope.requireTaskRecords = () => ({ readTaskDetail: (/** @type {{task:unknown}} */ result) => result.task });
  f.scope.requireNamespace = () => ({ taskResumeNoteCapture: { consume: () => { entered.resolve(null); return consumed.promise; } } });
  const second = f.scope.refreshActiveTaskFocus(); await entered.promise;
  f.state.activeTaskFocus = null; consumed.resolve({ task: { title: "Too late" } }); await second;
  assert.equal(f.state.activeTaskFocus, null);
});

it("keeps current detail failure state and render/status order after a successful loading patch", async () => {
  const f = fixture(), failure = new Error("unavailable");
  f.scope.requireApi = () => ({ getJson: async () => { throw failure; } });
  await f.scope.refreshActiveTaskFocus();
  assert.equal(f.state.activeTaskFocus.isLoading, false); assert.equal(f.state.activeTaskFocus.error, "unavailable");
  assert.deepEqual(f.calls.map(call => call[0]), ["surface", "inspector", "surface", "inspector", "status"]);
  assert.equal(f.calls.at(-1)?.[1], "unavailable");
});

it("keeps related-context loading, failure, empty success and stale completion distinct", async () => {
  const f = fixture(), response = pending();
  f.scope.requireApi = () => ({ getJson: () => response.promise });
  const operation = f.scope.refreshTaskFocusRelatedContext();
  assert.equal(f.state.activeTaskFocus.relatedContext.isLoading, true);
  response.reject(new Error("related unavailable")); await operation;
  assert.equal(f.state.activeTaskFocus.relatedContext.error, "related unavailable");
  f.scope.requireApi = () => ({ getJson: async () => ({ groups: [], items: [], meta: { selectedTaskId: "one" } }) });
  await f.scope.refreshTaskFocusRelatedContext();
  assert.equal(f.state.activeTaskFocus.relatedContext.isLoading, false); assert.equal(f.state.activeTaskFocus.relatedContext.error, "");
  const late = pending(); f.scope.requireApi = () => ({ getJson: () => late.promise });
  const stale = f.scope.refreshTaskFocusRelatedContext();
  const next = f.scope.taskFocusFromCandidate({}, "two"); f.state.activeTaskFocus = next;
  late.resolve({ groups: [{ label: "stale" }] }); await stale; assert.equal(f.state.activeTaskFocus, next);
});

it("retains checklist write identity, success/error state and stale-write handling", async () => {
  const f = fixture(), items = [{ task_checklist_item_id: "item", is_checked: true }], progress = { completed_count: 1 };
  f.scope.applyActiveTaskFocusTask({ task_id: "one", title: "Saved" });
  const checkbox = { checked: true, closest: () => ({ dataset: { taskChecklistItem: "item" } }) };
  const event = { target: { closest: () => checkbox } };
  f.scope.requireApi = () => ({ postJson: async (/** @type {string} */ path) => { assert.equal(path, "/api/tasks/one/checklist/item/check"); return { items, checklistProgress: progress }; } });
  await f.scope.handleTaskFocusChecklistChange(event);
  assert.equal(f.state.activeTaskFocus.task.checklistItems, items); assert.equal(f.state.activeTaskFocus.task.checklistProgress, progress);
  assert.equal(f.state.activeTaskFocus.checklistMutationItemId, "");
  f.scope.requireApi = () => ({ postJson: async () => { throw new Error("write failed"); } });
  await f.scope.handleTaskFocusChecklistChange(event);
  assert.equal(f.state.activeTaskFocus.checklistError, "write failed"); assert.equal(f.state.activeTaskFocus.checklistMutationItemId, "");
  const late = pending(); f.scope.requireApi = () => ({ postJson: () => late.promise });
  const operation = f.scope.handleTaskFocusChecklistChange(event); f.state.activeTaskFocus = null;
  late.reject(new Error("obsolete")); await operation; assert.equal(f.state.activeTaskFocus, null);
});

it("retains timer eligibility precedence and opaque flag values without mutating options", () => {
  const f = fixture();
  assert.equal(f.scope.taskFocusTimerEligibility().reason, "Task details are loading.");
  f.scope.applyActiveTaskFocusTask({ task_id: "one", status: "open", project_id: "project" });
  const options = Object.create({ timeTrackingEnabled: false }); f.state.taskOptions = options;
  assert.equal(f.scope.taskFocusTimerEligibility().reason, "Time Tracking is disabled.");
  options.timeTrackingEnabled = 0; options.taskTimersEnabled = "false";
  assert.equal(f.scope.taskFocusTimerEligibility().eligible, true);
  options.taskTimersEnabled = false;
  assert.equal(f.scope.taskFocusTimerEligibility().reason, "Task timers are disabled.");
  f.state.activeTaskFocus = null;
  assert.equal(f.scope.taskFocusTimerEligibility().reason, "Choose a task before using a task timer.");
  assert.equal(f.scope.activeTaskFocusCandidate().recordId, "");
});
