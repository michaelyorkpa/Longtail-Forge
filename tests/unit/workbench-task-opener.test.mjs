import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/workbench.js");

function fixture() {
  /** @type {unknown[][]} */ const calls = [];
  const activeElement = {}, result = { completed: false, detail: undefined };
  const registry = { open: async function (/** @type {unknown} */ id, /** @type {unknown} */ params, /** @type {unknown} */ host) { calls.push(["open", this, id, params, host]); return result; } };
  const errorsScope = vm.createContext({ window: {} });
  vm.runInContext(createProjectTextReader().readText("public/js/shared/error-contract.js"), errorsScope);
  const scope = vm.createContext({ calls, result, document: { activeElement },
    moduleEnabled: () => true,
    ensureWorkbenchModuleAction: async (/** @type {unknown} */ id) => { calls.push(["ensure", id]); return registry; },
    setStatus: (/** @type {unknown} */ text, /** @type {unknown} */ options) => calls.push(["status", text, options]),
    loadWorkbench: () => {},
    resetTaskFocusState: () => calls.push(["reset"]),
    refreshFocusCandidates: async () => calls.push(["refresh"]),
    renderWorkbench: () => calls.push(["render"]),
    setTaskCompletionStatus: (/** @type {unknown} */ detail) => calls.push(["completion", detail]),
    focusActiveFocusQuestion: () => calls.push(["focus"]),
    requireErrors: () => ({ caughtMessage: (/** @type {unknown} */ error, /** @type {unknown} */ fallback) => { calls.push(["error", error]); return errorsScope.window.LongtailForge.errors.caughtMessage(error, fallback); } }),
  });
  vm.runInContext(extractFunctionBlock(source, "openTaskCandidate"), scope);
  return { scope, calls, registry, activeElement, result };
}

it("forwards candidate identity, local block defaults, focus and host callbacks exactly once", async () => {
  const f = fixture(), trigger = {}, defaults = { status: "blocked" };
  await f.scope.openTaskCandidate({ candidateId: "candidate" }, "task", trigger, { defaults, focusTarget: "blocked_reason", promptBlockedReason: true });
  const opens = f.calls.filter(call => call[0] === "open");
  assert.equal(opens.length, 1);
  const [, receiver, id, params, host] = opens[0];
  assert.equal(receiver, f.registry); assert.equal(id, "tasks.edit");
  assert.equal(Reflect.get(Object(params), "defaults"), defaults);
  assert.equal(Reflect.get(Object(params), "returnFocusTo"), trigger);
  assert.deepEqual(JSON.parse(JSON.stringify(params)), { context: { source: "workbench", sourceType: "work-candidate" }, candidateId: "candidate", defaults, focusTarget: "blocked_reason", promptBlockedReason: true, recordId: "task", returnFocusTo: {}, taskId: "task" });
  assert.equal(Reflect.get(Object(host), "refresh"), f.scope.loadWorkbench);
  assert.equal(Reflect.get(Object(host), "setStatus"), f.scope.setStatus);
  assert.deepEqual(f.calls.map(call => call[0]), ["status", "ensure", "open", "status"]);
  assert.equal(f.calls.at(-1)?.[1], "");
});

function relatedFixture() {
  const f = fixture();
  f.scope.relatedContextSourceLabel = () => "Note";
  f.scope.state = { activeTaskFocus: { taskId: "task" } };
  f.scope.navigateFromWorkbench = (/** @type {unknown} */ url, /** @type {unknown} */ kind) => f.calls.push(["navigate", url, kind]);
  vm.runInContext(extractFunctionBlock(source, "openRelatedContextModuleAction"), f.scope);
  return f;
}

it("handles unusable related IDs before dependencies or dispatch using the real error helper", async () => {
  for (const moduleActionId of [undefined, null, "", 0, false, 7, {}, new String("notes.view")]) {
    const f = relatedFixture();
    await f.scope.openRelatedContextModuleAction({}, { moduleActionId });
    assert.deepEqual(f.calls.map(call => call[0]), ["status", "error", "status"]);
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1))), ["status", "Note could not be opened.", { isError: true }]);
  }
});

it("navigates the existing fallback for an absent ID without loading or dispatching", async () => {
  const f = relatedFixture();
  await f.scope.openRelatedContextModuleAction({}, { fallbackUrl: "/notes.html?noteId=note" });
  assert.deepEqual(f.calls, [
    ["status", "Opening note...", undefined],
    ["status", "Opening note in its module page.", undefined],
    ["navigate", "/notes.html?noteId=note", "related-context-error-fallback"],
  ]);
});

it("preserves accepted IDs, parameter identities, receiver, host callbacks and success/cancel status order", async () => {
  for (const completed of [false, true]) {
    const f = relatedFixture(), recordId = {}, trigger = {}, nested = {}, symbol = Symbol("extra");
    f.result.completed = completed;
    let reads = 0;
    await f.scope.openRelatedContextModuleAction({ recordId }, {
      get moduleActionId() { reads += 1; return " notes.view "; },
      params: { nested, [symbol]: nested, context: "overridden", recordId: "overridden", returnFocusTo: "overridden" },
    }, trigger);
    assert.equal(reads, 1);
    assert.deepEqual(f.calls.map(call => call[0]), ["status", "ensure", "open", "status"]);
    assert.equal(f.calls[1][1], " notes.view ");
    const [, receiver, id, params, host] = f.calls[2];
    assert.equal(receiver, f.registry); assert.equal(id, " notes.view ");
    assert.equal(Reflect.get(Object(params), "recordId"), recordId);
    assert.equal(Reflect.get(Object(params), "returnFocusTo"), trigger);
    assert.equal(Reflect.get(Object(params), "nested"), nested);
    assert.equal(Reflect.get(Object(params), symbol), nested);
    assert.deepEqual(JSON.parse(JSON.stringify(Reflect.get(Object(params), "context"))), { source: "workbench", sourceTaskId: "task", sourceType: "task-focus-related-context" });
    assert.equal(Reflect.get(Object(host), "refresh"), f.scope.loadWorkbench);
    assert.equal(Reflect.get(Object(host), "setStatus"), f.scope.setStatus);
    assert.equal(f.calls.at(-1)?.[1], completed ? "Note opened." : "");
  }
});

it("leaves nonempty unregistered IDs to the real registry and exposes its real message", async () => {
  for (const moduleActionId of ["missing.action", " "]) {
    const f = relatedFixture();
    const registryScope = vm.createContext({ registeredActions: new Map() });
    vm.runInContext(extractFunctionBlock(createProjectTextReader().readText("public/js/shared/module-actions.js"), "open"), registryScope);
    f.registry.open = async function (id, params, host) {
      f.calls.push(["open", this, id, params, host]);
      return registryScope.open(id, params, host);
    };
    await f.scope.openRelatedContextModuleAction({}, { moduleActionId });
    assert.deepEqual(f.calls.map(call => call[0]), ["status", "ensure", "open", "error", "status"]);
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1))), ["status", `Module action '${moduleActionId}' is not registered.`, { isError: true }]);
  }
});

it("retains primitive parameter spread and getter failure ordering", async () => {
  const f = relatedFixture();
  await f.scope.openRelatedContextModuleAction({}, { moduleActionId: "notes.view", params: "ab" });
  const params = f.calls.find(call => call[0] === "open")?.[3];
  assert.equal(Reflect.get(Object(params), "0"), "a");
  assert.equal(Reflect.get(Object(params), "1"), "b");
  assert.equal(Reflect.get(Object(params), "returnFocusTo"), f.activeElement);
  f.calls.length = 0;
  const failure = new Error("parameter getter");
  await assert.rejects(f.scope.openRelatedContextModuleAction({}, { params: { get value() { throw failure; } } }), error => error === failure);
  assert.deepEqual(f.calls, []);
});

it("retains default options, active focus and the disabled-module early exit", async () => {
  const f = fixture();
  await f.scope.openTaskCandidate({}, "task");
  const params = f.calls.find(call => call[0] === "open")?.[3];
  assert.equal(Reflect.get(Object(params), "returnFocusTo"), f.activeElement);
  assert.equal(Reflect.get(Object(params), "candidateId"), "");
  assert.equal(Reflect.get(Object(params), "focusTarget"), "");
  assert.equal(Reflect.get(Object(params), "promptBlockedReason"), false);
  f.calls.length = 0; f.scope.moduleEnabled = () => false;
  await f.scope.openTaskCandidate(null, "task");
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)), [["status", "Tasks are not available in this workspace.", { isError: true }]]);
});

it("reads inherited completion with its original receiver and preserves completion ordering and detail identity", async () => {
  const f = fixture();
  const detail = Object.create({ get taskLifecycleAction() { assert.equal(this, detail); f.calls.push(["detail read"]); return "complete"; } });
  f.scope.result.completed = true; f.scope.result.detail = detail;
  await f.scope.openTaskCandidate({}, "task");
  assert.deepEqual(f.calls.map(call => call[0]), ["status", "ensure", "open", "detail read", "reset", "refresh", "render", "completion", "focus"]);
  assert.equal(f.calls.find(call => call[0] === "completion")?.[1], detail);
});

it("keeps opaque primitive detail and primitive accessor receivers without replacing the forwarded value", async () => {
  const f = fixture();
  vm.runInContext('Object.defineProperty(Number.prototype, "taskLifecycleAction", { configurable: true, get() { "use strict"; calls.push(["primitive receiver", this]); return "complete"; } });', f.scope);
  f.scope.result.completed = true; f.scope.result.detail = 7;
  await f.scope.openTaskCandidate({}, "task");
  assert.equal(f.calls.find(call => call[0] === "primitive receiver")?.[1], 7);
  assert.equal(f.calls.find(call => call[0] === "completion")?.[1], 7);
  for (const detail of [null, undefined, false, 0, "saved", Symbol("saved")]) {
    f.calls.length = 0; f.scope.result.detail = detail;
    await f.scope.openTaskCandidate({}, "task");
    assert.equal(f.calls.at(-1)?.[1], "Task updated.");
    assert.equal(f.calls.some(call => call[0] === "completion"), false);
  }
});

it("preserves getter, dispatch and refresh failures in the existing catch path", async () => {
  for (const stage of ["getter", "dispatch", "refresh"]) {
    const f = fixture(), failure = new Error(stage);
    f.scope.result.completed = true;
    f.scope.result.detail = { get taskLifecycleAction() { if (stage === "getter") throw failure; return "complete"; } };
    if (stage === "dispatch") f.registry.open = async () => { throw failure; };
    if (stage === "refresh") f.scope.refreshFocusCandidates = async () => { f.calls.push(["refresh"]); throw failure; };
    await f.scope.openTaskCandidate({}, "task");
    assert.equal(f.calls.find(call => call[0] === "error")?.[1], failure);
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1))), ["status", stage, { isError: true }]);
    assert.equal(f.calls.some(call => call[0] === "focus"), false);
    assert.equal(f.calls.some(call => call[0] === "reset"), stage === "refresh");
  }
});
