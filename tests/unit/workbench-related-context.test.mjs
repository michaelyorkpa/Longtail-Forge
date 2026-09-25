import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/workbench.js");
function fixture() {
  const scope = vm.createContext({});
  for (const name of ["workbenchSourceField", "workbenchDetailField", "normalizeTaskFocusRelatedContext", "candidateModuleAction", "formatToken", "createTaskFocusRelatedContextGroup", "createTaskFocusRelatedContextItem", "relatedContextTitle", "relatedContextSourceLabel", "relatedContextContextLabel", "relatedContextBadges", "relatedContextCanOpen", "relatedContextActionLabel", "safeRelatedContextText", "looksLikeRawId"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  return scope;
}

it("normalizes group containers without replacing item, metadata or task identities", () => {
  const f = fixture(), item = { title: "Related" }, items = [item], meta = { selectedTaskId: "chosen" }, task = {};
  const extra = Symbol("extra"), group = { id: "linked", items, [extra]: task };
  const result = f.normalizeTaskFocusRelatedContext({ groups: [group], items, meta, task }, "fallback");
  assert.notEqual(result.groups[0], group);
  assert.equal(result.groups[0].items, items);
  assert.equal(result.groups[0][extra], task);
  assert.equal(result.items, items); assert.equal(result.meta, meta); assert.equal(result.task, task);
  assert.equal(result.taskId, "chosen"); assert.equal(result.isLoading, false); assert.equal(result.error, "");
});

it("retains array fallback, group order, sparse entries and existing null failures", () => {
  const f = fixture(), first = {}, second = {};
  const result = f.normalizeTaskFocusRelatedContext({ groups: [{ items: [first] }, { items: false }, { items: [second] }], items: 3, meta: null }, "fallback");
  assert.deepEqual(Array.from(result.items), [first, second]);
  assert.equal(result.groups[1].items.length, 0); assert.equal(result.taskId, "fallback");
  assert.equal(f.normalizeTaskFocusRelatedContext({ groups: false }).groups.length, 0);
  assert.equal(f.normalizeTaskFocusRelatedContext().items.length, 0);
  const sparse = new Array(2); sparse[1] = { items: [] };
  assert.equal(0 in f.normalizeTaskFocusRelatedContext({ groups: sparse }).groups, false);
  assert.throws(() => f.normalizeTaskFocusRelatedContext(null), { name: "TypeError" });
  assert.throws(() => f.normalizeTaskFocusRelatedContext({ groups: [null] }), { name: "TypeError" });
});

it("retains normalizer getter order and copy-before-items override", () => {
  const f = fixture();
  /** @type {string[]} */ const reads = [];
  const items = [{}];
  const group = { get id() { reads.push("copy id"); return "group"; }, get items() { reads.push("items"); return items; } };
  const result = f.normalizeTaskFocusRelatedContext({ groups: [group] });
  assert.deepEqual(reads, ["copy id", "items", "items", "items"]);
  assert.equal(result.groups[0].items, items);
});

it("keeps explicit candidate action precedence, identity and Notes/Lists fallback descriptors", () => {
  const f = fixture(), params = {};
  const action = f.candidateModuleAction({ moduleId: "notes", recordType: "note", recordId: "record", primaryAction: { type: "module-action", id: "custom.open", params } });
  assert.equal(action.actionId, "custom.open"); assert.equal(action.params, params); assert.equal(action.recordParam, "recordId");
  assert.equal(f.candidateModuleAction({ moduleId: "notes", recordType: "note", recordId: "n" }).actionId, "notes.view");
  assert.equal(f.candidateModuleAction({ moduleId: "lists", recordType: "list", recordId: "l" }).recordParam, "listId");
  for (const candidate of [{}, { moduleId: "notes", recordType: "note" }, { moduleId: "time-tracking", recordType: "active_work_timer", recordId: "timer" }])
    assert.equal(f.candidateModuleAction(candidate), null);
  assert.throws(() => f.candidateModuleAction(null), { name: "TypeError" });
});

it("preserves group count native conversion and item construction order", () => {
  const f = fixture();
  /** @type {unknown[]} */ const calls = [];
  f.requireView = () => ({ createElement: (/** @type {string} */ tag, /** @type {unknown} */ options) => ({ tag, options }) });
  f.createTaskFocusRelatedContextItem = (/** @type {unknown} */ item) => { calls.push(item); return item; };
  const items = [{ title: "first" }, { title: "second" }];
  for (const [count, expected] of [[3.9, "3"], ["12 rows", "12"], [0, "2"], [undefined, "2"]]) {
    const group = f.createTaskFocusRelatedContextGroup({ count, items });
    assert.equal(group.options.children[0].options.children[1].options.text, expected);
  }
  assert.deepEqual(calls.slice(0, 2), items);
  const count = { [Symbol.toPrimitive](/** @type {string} */ hint) { assert.equal(hint, "string"); return "7"; } };
  assert.equal(f.createTaskFocusRelatedContextGroup({ count }).options.children[0].options.children[1].options.text, "7");
  assert.throws(() => f.createTaskFocusRelatedContextGroup({ count: Symbol("count") }), { name: "TypeError" });
});
