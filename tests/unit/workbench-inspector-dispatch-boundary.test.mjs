import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText;
const source = read("public/js/workbench.js");
const before = read("tests/unit/fixtures/workbench-inspector-before-42-45.txt");
const inspectorNames = ["workbenchInspectorCandidates", "createWorkbenchInspectorItem", "candidateBadges", "candidateActionLabel", "candidateCanOpen", "candidateModuleAction", "isManualTimerCandidate", "inspectorCandidateTitle", "inspectorCandidateContext"];

/** @param {string} implementation */
function inspectorFixture(implementation) {
  const scope = vm.createContext({ ...createFakeBrowserContext(), WORKBENCH_INSPECTOR_LIMIT: 6, WORKBENCH_VIEW_STATE_FOCUS_SELECTION: "selection" });
  vm.runInContext(read("public/js/shared/view-builder.js"), scope);
  scope.requireView = () => scope.window.LongtailForge.view;
  scope.resolvedWorkbenchViewState = () => "selection";
  for (const name of ["workbenchCandidateField", "workbenchSourceField", "candidateTaskId", "inspectorCandidateKey", "formatToken", "formatCandidateDate", "badge", "looksLikeRawId"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  for (const name of inspectorNames) vm.runInContext(extractFunctionBlock(implementation, name), scope);
  return scope;
}

it("matches baseline Inspector getter order, receivers, labels and exact handler identity", () => {
  const snapshots = [];
  for (const implementation of [before, source]) {
    const scope = inspectorFixture(implementation);
    /** @type {string[]} */ const reads = [];
    const action = { type: "module-action", id: 7, label: "Open note" };
    const candidate = new Proxy({ moduleId: "notes", recordType: "note", recordId: "record", title: "A note", contextLabel: "Context", status: "open", primaryAction: action }, {
      get(target, key, receiver) { assert.equal(receiver, candidate); reads.push(String(key)); return Reflect.get(target, key, receiver); },
    });
    const row = scope.createWorkbenchInspectorItem(candidate);
    const button = row.children[0];
    scope.openCandidate = (/** @type {unknown} */ received, /** @type {unknown} */ trigger, /** @type {{mode:string}} */ options) => {
      assert.equal(received, candidate); assert.equal(trigger, button); assert.equal(options.mode, "candidate-primary");
      reads.push("opened");
    };
    button.dispatchEvent({ type: "click" });
    snapshots.push({ reads, title: button.textContent, context: row.children[1].textContent, disabled: button.disabled });
  }
  assert.deepEqual(snapshots[1], snapshots[0]);
});

it("matches baseline deduplication, six-item limit, order and collection identities", () => {
  const records = Array.from({ length: 9 }, (_, index) => ({ moduleId: "notes", recordType: "note", recordId: String(index), candidateId: String(index) }));
  const input = [records[0], records[0], { ...records[0] }, ...records.slice(1)];
  for (const implementation of [before, source]) {
    const scope = inspectorFixture(implementation);
    scope.recommendedOverflowCandidates = () => input;
    const result = scope.workbenchInspectorCandidates();
    assert.equal(result.length, 6);
    for (let index = 0; index < 6; index += 1) assert.equal(result[index], records[index]);
  }
});

it("preserves numeric action identity through dependency loading and the real registry", async () => {
  /** @type {unknown[][]} */ const calls = [];
  const scope = vm.createContext({ window: { LongtailForge: { workspaceContext: { enabledModules: ["notes"] } } }, document: { activeElement: null } });
  vm.runInContext(read("public/js/shared/error-contract.js"), scope);
  vm.runInContext(read("public/js/shared/module-actions.js"), scope);
  for (const name of ["workbenchCandidateField", "candidateTaskId", "candidateModuleAction", "formatToken", "ensureWorkbenchModuleAction", "openModuleActionCandidate", "openCandidate"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  scope.moduleEnabled = () => true;
  scope.requireErrors = () => scope.window.LongtailForge.errors;
  scope.setStatus = (/** @type {unknown} */ message) => calls.push(["status", message]);
  scope.loadWorkbench = () => {};
  const registry = scope.window.LongtailForge.moduleActions;
  /** @type {unknown[][]} */ const dispatch = [];
  scope.window.LongtailForge.moduleActions = {
    ...registry,
    ensureDependencies(/** @type {unknown} */ id) {
      dispatch.push(["dependencies", id]);
      return registry.ensureDependencies(id);
    },
    open(/** @type {unknown} */ id, /** @type {unknown} */ params, /** @type {unknown} */ host) {
      dispatch.push(["open", id]);
      return registry.open(id, params, host);
    },
  };
  const recordId = { opaque: "record" }, candidateId = { opaque: "candidate" };
  scope.window.LongtailForge.moduleActions.register({ id: 7, moduleId: "notes",
    open: (/** @type {{recordId: unknown, candidateId: unknown}} */ params, /** @type {{complete(detail: unknown): void}} */ host) => {
      assert.equal(params.recordId, recordId);
      assert.equal(params.candidateId, candidateId);
      calls.push(["opened"]);
      host.complete({ saved: true });
    },
  });
  registry.register({ id: "7", moduleId: "notes", open: () => { assert.fail("string registration must not open"); } });
  const candidate = { moduleId: "notes", recordType: "note", recordId, candidateId, primaryAction: { type: "module-action", id: 7 } };
  assert.equal(scope.candidateModuleAction(candidate).actionId, 7);
  await scope.openCandidate(candidate, null);
  assert.deepEqual(calls, [["status", "Opening notes..."], ["opened"], ["status", "Notes updated."]]);
  assert.deepEqual(dispatch, [["dependencies", 7], ["open", 7]]);
});

it("records opaque fallback hrefs accepted by the real navigation controller without caller conversion", async () => {
  /** @type {unknown[]} */ const assigned = [];
  /** @type {unknown[]} */ const forwarded = [];
  /** @type {string[]} */ const conversions = [];
  const scope = vm.createContext({
    window: { URL, location: { assign: (/** @type {unknown} */ href) => assigned.push(href) }, LongtailForge: {} },
    document: { baseURI: "https://example.test/workbench", addEventListener() {} },
    SESSION_LOGIN_PATH: "/login",
    setStatus() {},
  });
  vm.runInContext(extractFunctionBlock(read("public/js/navigation.js"), "createNavigationIntentController"), scope);
  const controller = scope.createNavigationIntentController();
  scope.requireNamespace = () => ({ navigationIntent: {
    navigate(/** @type {unknown} */ href, /** @type {unknown} */ options) {
      forwarded.push(href);
      return controller.navigate(href, options);
    },
  } });
  for (const name of ["workbenchCandidateField", "workbenchSourceField", "isManualTimerCandidate", "candidatePageFallback", "openCandidateNavigationFallback", "navigateFromWorkbench"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  const href = { [Symbol.toPrimitive](/** @type {string} */ hint) { conversions.push(hint); return "notes.html"; } };
  for (const value of [7, href]) scope.openCandidateNavigationFallback({ primaryAction: { href: value } });
  assert.equal(forwarded[0], 7);
  assert.equal(forwarded[1], href);
  assert.deepEqual(conversions, ["string"]);
  assert.deepEqual(assigned, ["https://example.test/7", "https://example.test/notes.html"]);
});
