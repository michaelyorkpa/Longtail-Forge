import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader();
const source = read.readText("public/js/workbench.js");
const errors = read.readText("public/js/shared/error-contract.js");
function fixture() {
  /** @type {{message: string}[]} */ const children = [];
  const scope = vm.createContext({ taskFocusInspectorCollapsed: false,
    workbenchInspectorCountText: {},
    workbenchInspectorList: { replaceChildren() { children.length = 0; }, appendChild(/** @type {{message: string}} */ value) { children.push(value); } },
    syncTaskFocusInspectorCollapseState() {}, setWorkbenchInspectorCopy() {},
    emptyState: (/** @type {string} */ message) => ({ message }),
    createTaskFocusRelatedContextGroup: (/** @type {unknown} */ group) => group,
  });
  const state = vm.runInContext("({ activeTaskFocus: { taskId: 'first' } })", scope);
  scope.state = state;
  for (const name of ["asRecord", "caughtMessage"]) vm.runInContext(extractFunctionBlock(errors, name), scope);
  scope.requireErrors = () => ({ caughtMessage: scope.caughtMessage });
  for (const name of ["requireWorkbenchElement", "workbenchSourceField", "normalizeTaskFocusRelatedContext", "taskFocusRelatedContextState", "taskFocusRelatedContextGroups", "renderTaskFocusInspector", "refreshTaskFocusRelatedContext"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  return { scope, state, children };
}

for (const [label, response] of [["null response", null], ["null group", { groups: [null] }], ["undefined group", { groups: [undefined] }]]) {
  it(`renders a failed load for ${label} through the real refresh, error helper and Inspector`, async () => {
    const f = fixture();
    f.scope.requireApi = () => ({ getJson: async () => response });
    const operation = f.scope.refreshTaskFocusRelatedContext();
    assert.equal(f.state.activeTaskFocus.relatedContext.isLoading, true);
    assert.equal(f.children[0].message, "Loading related task context...");
    await operation;
    assert.equal(f.state.activeTaskFocus.relatedContext.isLoading, false);
    assert.equal(f.state.activeTaskFocus.relatedContext.error, "Related task context could not be loaded.");
    assert.equal(f.children[0].message, f.state.activeTaskFocus.relatedContext.error);
  });
}

for (const response of [undefined, {}, { groups: [] }, { groups: false }, { groups: [{ items: null }], meta: null, task: null }]) {
  it("renders legitimate absent/empty collections as empty success", async () => {
    const f = fixture();
    f.scope.requireApi = () => ({ getJson: async () => response });
    await f.scope.refreshTaskFocusRelatedContext();
    assert.equal(f.state.activeTaskFocus.relatedContext.error, "");
    assert.equal(f.state.activeTaskFocus.relatedContext.isLoading, false);
    assert.equal(f.children[0].message, "No related task context is available yet.");
  });
}

for (const fail of [false, true]) {
  it(`ignores a stale ${fail ? "error" : "success"} without overwriting or rendering the next focus`, async () => {
    const f = fixture();
    /** @type {(value: unknown) => void} */ let release = () => { throw new Error("request not started"); };
    f.scope.requireApi = () => ({ getJson: () => new Promise((resolve, reject) => { release = fail ? reject : resolve; }) });
    const operation = f.scope.refreshTaskFocusRelatedContext();
    const next = { taskId: "second", relatedContext: { groups: [], isLoading: false, error: "" } };
    f.state.activeTaskFocus = next;
    f.scope.renderTaskFocusInspector();
    const rendered = f.children[0];
    release(fail ? new Error("obsolete failure") : { groups: [{ items: [{ title: "obsolete" }] }] });
    await operation;
    assert.equal(f.state.activeTaskFocus, next);
    assert.equal(f.children[0], rendered);
  });
}

it("retains unrelated API/getter errors through the real caught-message and Inspector path", async () => {
  for (const response of [Promise.reject(new Error("API unavailable")), Promise.resolve({ get groups() { throw new Error("provider getter failed"); } })]) {
    const f = fixture();
    f.scope.requireApi = () => ({ getJson: () => response });
    await f.scope.refreshTaskFocusRelatedContext();
    assert.match(f.children[0].message, /^(API unavailable|provider getter failed)$/);
    assert.equal(f.state.activeTaskFocus.relatedContext.isLoading, false);
  }
});

it("preserves primitive groups, inherited collections and envelope getter order without extra validation", () => {
  const f = fixture();
  /** @type {string[]} */ const reads = [];
  const items = [{ title: "kept" }], meta = { selectedTaskId: "chosen" };
  const group = Object.create({ items });
  const envelope = {
    get groups() { reads.push("groups"); return ["abc", 7, false, group]; },
    get items() { reads.push("items"); return items; },
    get meta() { reads.push("meta"); return meta; },
    get task() { reads.push("task"); return false; },
  };
  const result = f.scope.normalizeTaskFocusRelatedContext(envelope);
  assert.deepEqual(reads, ["groups", "groups", "items", "items", "meta", "task", "meta"]);
  assert.equal(result.groups[0][0], "a");
  assert.equal(result.groups[3].items, items);
  assert.equal(result.items, items); assert.equal(result.meta, meta); assert.equal(result.task, null);
  assert.equal(result.taskId, "chosen");
});
