import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/workbench.js");
function fixture() {
  const scope = vm.createContext({});
  for (const name of ["workbenchFocusEnvelope", "workbenchCandidateField", "candidateTaskId", "inspectorCandidateKey", "refreshFocusCandidates", "loadWorkbench"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  const errors = vm.createContext({ window: {} });
  vm.runInContext(createProjectTextReader().readText("public/js/shared/error-contract.js"), errors);
  scope.requireErrors = () => errors.window.LongtailForge.errors;
  scope.state = { focusCandidates: [], focusContext: null, recommendedCandidateIndex: 3 };
  scope.calls = [];
  /** @param {...unknown} args */
  scope.setStatus = (...args) => scope.calls.push(["status", ...args]);
  for (const name of ["renderFocusModes", "renderRecommendedAction", "renderWorkbenchInspector"])
    scope[name] = () => scope.calls.push([name]);
  return scope;
}

it("reads focus envelopes lazily with original primitive and object getter receivers", () => {
  /** @type {string[]} */ const calls = [];
  /** @type {unknown[]} */ const items = [];
  const s = fixture(), context = {};
  const body = Object.create({
    get items() { assert.equal(this, body); calls.push("items"); return items; },
    get focusContext() { assert.equal(this, body); calls.push("context"); return context; },
  });
  const view = s.workbenchFocusEnvelope(body);
  assert.equal(calls.length, 0);
  assert.equal(view.items, items); assert.equal(view.items, items);
  assert.equal(view.focusContext, context);
  assert.deepEqual(calls, ["items", "items", "context"]);
  vm.runInContext('Object.defineProperty(Number.prototype, "modes", { get() { "use strict"; return this; } });', s);
  assert.equal(s.workbenchFocusEnvelope(7).modes, 7);
  for (const value of [null, undefined]) {
    assert.equal(s.workbenchFocusEnvelope(value).items, undefined);
    assert.equal(s.workbenchFocusEnvelope(value).modes, undefined);
    assert.equal(s.workbenchFocusEnvelope(value).focusContext, undefined);
  }
});

it("refreshes with two item reads and preserves sparse entries, context identity and render order", async () => {
  /** @type {unknown[]} */ const first = [];
  const s = fixture(), second = [null, 7, {}], context = {};
  let reads = 0;
  s.loadFocusCandidatesForState = async () => ({ get items() { return ++reads === 1 ? first : second; }, focusContext: context });
  await s.refreshFocusCandidates();
  assert.equal(reads, 2); assert.equal(s.state.focusCandidates, second); assert.equal(s.state.focusContext, context);
  assert.equal(s.state.recommendedCandidateIndex, 0);
  assert.deepEqual(s.calls.map((/** @type {unknown[]} */ row) => row[0]), ["status", "renderFocusModes", "renderRecommendedAction", "renderWorkbenchInspector", "status"]);
});

it("retains refresh defaults and partial assignment before a context getter failure", async () => {
  const s = fixture();
  s.loadFocusCandidatesForState = async () => null;
  await s.refreshFocusCandidates();
  assert.equal(s.state.focusCandidates.length, 0); assert.equal(s.state.focusContext, null);
  const items = [{}], previous = {}, failure = new Error("context getter");
  s.state.focusContext = previous; s.calls.length = 0;
  s.loadFocusCandidatesForState = async () => ({ items, get focusContext() { throw failure; } });
  await s.refreshFocusCandidates();
  assert.equal(s.state.focusCandidates, items); assert.equal(s.state.focusContext, previous);
  assert.deepEqual(JSON.parse(JSON.stringify(s.calls)), [["status", "Loading focus..."], ["status", "context getter", { isError: true }]]);
});

it("preserves candidate key conversions, inherited reads, short circuiting and opaque ID identity", () => {
  /** @type {string[]} */ const calls = [];
  const s = fixture(), id = {};
  const candidate = Object.create({
    get moduleId() { assert.equal(this, candidate); calls.push("module"); return "tasks"; },
    get recordType() { calls.push("type"); return "task"; },
    get recordId() { calls.push("id"); return id; },
  });
  assert.equal(s.candidateTaskId(candidate), id);
  assert.deepEqual(calls, ["module", "type", "id", "id"]);
  assert.equal(s.candidateTaskId(), ""); assert.equal(s.inspectorCandidateKey(), ":::");
  assert.equal(s.candidateTaskId({ moduleId: "notes", get recordType() { throw new Error("unreachable"); } }), "");
  assert.equal(s.inspectorCandidateKey({ moduleId: 7, recordType: false, recordId: { toString: () => "record" }, candidateId: 4 }), "7::record:4");
  assert.throws(() => s.inspectorCandidateKey({ recordId: Symbol("id") }), { name: "TypeError" });
  assert.throws(() => s.candidateTaskId(null), { name: "TypeError", message: "The Workbench candidate cannot be read." });
});

it("keeps primitive candidate accessor receivers and forwards raw IDs through the task opener", async () => {
  const s = fixture();
  vm.runInContext('Object.defineProperty(Number.prototype, "moduleId", { get() { "use strict"; globalThis.receiver = this; return "tasks"; } }); Number.prototype.recordType = "task"; Number.prototype.recordId = 42;', s);
  assert.equal(s.candidateTaskId(7), 42); assert.equal(s.receiver, 7);
  vm.runInContext(extractFunctionBlock(source, "openTaskCandidate"), s);
  const id = {};
  s.moduleEnabled = () => true; s.document = { activeElement: null };
  s.ensureWorkbenchModuleAction = async () => ({ open: async (/** @type {unknown} */ action, /** @type {{taskId: unknown, recordId: unknown}} */ params) => {
    assert.equal(action, "tasks.edit"); assert.equal(params.taskId, id); assert.equal(params.recordId, id); return { completed: false };
  } });
  s.loadWorkbench = () => {};
  await s.openTaskCandidate({}, id);
  assert.equal(s.calls.at(-1)[1], "");
});

it("loads focus modes and candidates without replacing records or refreshing an unchanged selection", async () => {
  /** @type {unknown[]} */ const timers = [];
  const s = fixture(), modes = [{}], items = [{}], context = {}, taskOptions = {};
  s.state = { focusModeId: "mode", selectedClientId: "client", selectedProjectId: "project", registry: {}, modules: {} };
  const body = { registry: {}, currentUserId: "user", workCandidates: [] };
  s.requireApi = () => ({ getJson: async () => body });
  for (const name of ["restoreFocusState", "renderWarmWorkbench", "writeCachedWorkbenchRegistry", "restoreCardState", "renderWorkbench", "startTicking"])
    s[name] = () => s.calls.push([name]);
  s.readCachedWorkbenchRegistry = () => null; s.readWorkbenchBootstrap = (/** @type {unknown} */ value) => value;
  let candidateLoads = 0;
  s.loadFocusCandidatesForState = async () => { candidateLoads += 1; return { items, focusContext: context }; };
  s.loadWorkbenchSourceData = async () => ({ timers, taskOptions });
  s.loadClientProjectData = async () => []; s.normalizeClientProjectOptions = (/** @type {unknown} */ value) => value;
  s.currentWorkspaceType = () => "business"; s.loadFocusModes = async () => ({ modes });
  s.curateFocusModes = (/** @type {unknown} */ value) => { assert.equal(value, modes); return value; };
  for (const name of ["resolveFocusModeSelection", "resolveClientSelection", "resolveProjectSelection", "normalizeModuleStateMap"])
    s[name] = (/** @type {unknown} */ value) => value;
  s.applyTaskFocusDeepLink = async () => false; s.recoverPendingTaskFocusDrift = async () => false;
  await s.loadWorkbench();
  assert.equal(candidateLoads, 1); assert.equal(s.state.focusCandidates, items); assert.equal(s.state.focusContext, context);
  assert.equal(s.state.focusModes, modes); assert.equal(s.state.timers, timers); assert.equal(s.state.taskOptions, taskOptions);
  assert.equal(s.calls.at(-1)[1], "");
});
