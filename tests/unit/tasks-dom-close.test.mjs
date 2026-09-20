import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/tasks.js");
/** @param {Record<string, unknown>} [extra] */
function fixture(extra = {}) {
  const scope = vm.createContext({
    URLSearchParams, TASK_VIEW_VALUES: new Set(["all", "my", "complete", "archived"]),
    TASK_FILTER_STORAGE_KEY: "filters", DEFAULT_TASK_VIEW: "my", TASK_LIST_PAGE_SIZE: 100,
    state: { tasks: [], quickFilter: "all", pagination: {} }, window: { LongtailForge: {} },
    statusFilter: null, assigneeFilter: null, clientFilter: null, projectFilter: null,
    sortInput: null, taskViewSelector: null, tagFilter: null, tagFilterController: null,
    taskList: null, taskStatus: null, taskPagination: null, taskPageSummary: null, loadMoreTasksButton: null,
    usesClientScope: () => true, ...extra,
  });
  for (const name of ["requireTaskElement", "taskControlValue", "taskOptionalControlField", "taskWorkspaceSelectionText", "taskRowKey", "canonicalStatusValue", "canonicalTaskViewValue", "canonicalSortValue", "selectedTaskView", "normalizeTagFilterValue", "noTagsFilterValue", "selectedTaskTagFilterValue", "buildTaskQuery", "handleTaskViewChange", "updateTaskViewSelectorState", "saveFilterState", "restoreFilterState", "renderTasks", "renderTaskPagination", "renderBulkRecurrenceContinuity", "setClientScopeControlsVisible", "getWorkspaceScopeLabel"])
    vm.runInContext(extractFunctionBlock(source, name), scope);
  return scope;
}

it("reads only the requested inherited value once and keeps absence and getter failures", () => {
  const f = fixture(), raw = {};
  let reads = 0;
  const control = Object.create({ get value() { reads++; assert.equal(this, control); return raw; } });
  assert.equal(f.taskControlValue(control), raw); assert.equal(reads, 1);
  for (const absent of [null, undefined, {}]) assert.equal(f.taskControlValue(absent), undefined);
  const error = new Error("value getter");
  assert.throws(() => f.taskControlValue({ get value() { throw error; } }), value => value === error);
});

it("keeps query defaults, conversion ordering, client short-circuit and symbol refusal", () => {
  const f = fixture();
  assert.equal(f.buildTaskQuery(), "task_view=all&status=active&sort=due_at&limit=100");
  /** @type {string[]} */ const calls = [];
  const token = (/** @type {string} */ label) => ({ toString() { calls.push(label); return label; } });
  f.statusFilter = { value: token("status") }; f.assigneeFilter = { value: token("assignee") };
  f.projectFilter = { value: token("project") }; f.tagFilter = { dataset: { tagFilterValue: token("tag") } };
  f.clientFilter = { get value() { return assert.fail("Personal must not read client"); } };
  f.usesClientScope = () => false;
  const query = new URLSearchParams(f.buildTaskQuery());
  assert.deepEqual([...calls], ["status", "assignee", "project", "tag"]);
  assert.equal(query.get("tags"), "tag"); assert.equal(query.has("client_id"), false);
  f.assigneeFilter = { value: Symbol("id") };
  assert.throws(() => f.buildTaskQuery(), { name: "TypeError" });
});

it("retains both view getter reads, opaque second answers and dispatch order", () => {
  const f = fixture(), second = {};
  /** @type {unknown[]} */ const calls = [];
  let reads = 0;
  f.taskViewSelector = { get value() { calls.push("value"); return ++reads === 1 ? "complete" : second; } };
  f.preserveCompatibleAdvancedFiltersForTaskView = (/** @type {unknown} */ value) => calls.push(value);
  f.saveFilterState = () => calls.push("save"); f.reloadTaskList = () => calls.push("reload");
  f.handleTaskViewChange();
  assert.equal(f.state.quickFilter, second);
  assert.deepEqual([...calls], ["value", "value", second, "save", "reload"]);
  f.taskViewSelector = { get value() { reads++; return "not-a-view"; } }; reads = 0;
  f.handleTaskViewChange(); assert.equal(reads, 1); assert.equal(f.state.quickFilter, "my");
  f.taskViewSelector = null; calls.length = 0; f.handleTaskViewChange(); assert.deepEqual([...calls], []);
});

it("persists opaque sort values and keeps restoration failure after the setter", () => {
  const f = fixture();
  /** @type {unknown[]} */ const calls = [];
  f.window.localStorage = { setItem: (/** @type {unknown[]} */ ...args) => calls.push(args), getItem: () => '{"sort":42,"quickFilter":"complete"}' };
  f.sortInput = { value: 42 }; f.saveFilterState();
  assert.deepEqual([...calls], [["filters", '{"sort":42,"quickFilter":"all"}']]);
  f.sortInput = { set value(/** @type {unknown} */ value) { calls.push(value); throw new Error("setter"); } };
  f.applyQuickFilterDefaults = () => calls.push(f.state.quickFilter);
  f.updateTaskViewSelectorState = () => calls.push("view");
  calls.length = 0; f.restoreFilterState();
  assert.deepEqual([...calls], [42, "my", "view"]);
  assert.equal(f.state.quickFilter, "my");
});

it("keeps tag controller precedence and both optional dataset reads", () => {
  const f = fixture(); let reads = 0;
  f.tagFilter = { get dataset() { reads++; return { tagFilterValue: "__no_effective_tags__" }; } };
  f.tagFilterController = { readValue() { assert.equal(this, f.tagFilterController); return "chosen"; } };
  assert.equal(f.selectedTaskTagFilterValue(), "chosen"); assert.equal(reads, 0);
  f.tagFilterController = null;
  assert.equal(f.selectedTaskTagFilterValue(), "__no_tags__"); assert.equal(reads, 1);
  for (const target of [null, {}, { dataset: null }, { dataset: {} }]) {
    f.tagFilter = target; assert.equal(f.selectedTaskTagFilterValue(), "all");
  }
});

it("keeps workspace selected-text optional paths, trim receiver and fallback precedence", () => {
  const f = fixture(); const answer = {}, text = { trim() { assert.equal(this, text); return answer; } };
  assert.equal(f.taskWorkspaceSelectionText({ selectedOptions: [{ textContent: text }] }), answer);
  for (const target of [null, {}, { selectedOptions: null }, { selectedOptions: [] }, { selectedOptions: [{}] }])
    assert.equal(f.taskWorkspaceSelectionText(target), undefined);
  assert.throws(() => f.taskWorkspaceSelectionText({ selectedOptions: [{ textContent: { trim: 7 } }] }), { name: "TypeError" });
  const error = new Error("selected options");
  assert.throws(() => f.taskWorkspaceSelectionText({ get selectedOptions() { throw error; } }), value => value === error);
  /** @type {string[]} */ const queries = [];
  f.document = { querySelector: (/** @type {string} */ selector) => { queries.push(selector); return selector === "[data-workspace-selector]" ? { selectedOptions: [{ textContent: "  Current  " }] } : { textContent: "fallback" }; } };
  assert.equal(f.getWorkspaceScopeLabel(), "Current Projects"); assert.deepEqual(queries, ["[data-workspace-selector]"]);
  f.window.LongtailForge.workspaceContext = { workspaceName: " Context " }; queries.length = 0;
  assert.equal(f.getWorkspaceScopeLabel(), "Context Projects"); assert.deepEqual(queries, []);
});

it("checks required list presence after existing work and before constructing append arguments", () => {
  const f = fixture();
  /** @type {string[]} */ const calls = [];
  f.requireView = () => ({ createElement() { calls.push("create"); return {}; } });
  f.syncSelectionToTasks = () => calls.push("selection"); f.updateTaskViewSelectorState = () => calls.push("view");
  f.updateBulkControls = () => calls.push("bulk");
  assert.throws(() => f.renderTasks(), { name: "TypeError" });
  assert.deepEqual([...calls], ["selection", "view", "bulk"]);
  f.taskList = { replaceChildren() { calls.push("replace"); f.taskList = null; } }; calls.length = 0;
  assert.throws(() => f.renderTasks(), { name: "TypeError" });
  assert.deepEqual([...calls], ["selection", "view", "bulk", "replace"]);
});

it("keeps pagination setter order, optional nodes and silent refused writes", () => {
  const f = fixture();
  /** @type {unknown[]} */ const writes = [];
  f.state.tasks = [{}, {}]; f.state.pagination = { hasMore: true, nextCursor: "cursor" };
  f.taskPagination = { set hidden(/** @type {unknown} */ value) { writes.push(["panel", this === f.taskPagination, value]); } };
  f.taskPageSummary = { set textContent(/** @type {unknown} */ value) { writes.push(["summary", value]); } };
  f.loadMoreTasksButton = { set hidden(/** @type {unknown} */ value) { writes.push(["button", value]); }, set disabled(/** @type {unknown} */ value) { writes.push(["disabled", value]); } };
  f.renderTaskPagination();
  assert.deepEqual([...writes], [["panel", true, false], ["summary", "2 shown"], ["button", false], ["disabled", false]]);
  writes.length = 0; f.state.pagination.nextCursor = ""; f.renderTaskPagination();
  assert.deepEqual([...writes], [["panel", true, true], ["summary", ""], ["button", true], ["disabled", true]]);
  f.taskPagination = Object.freeze({ hidden: false }); f.renderTaskPagination(); assert.equal(f.taskPagination.hidden, false);
  f.taskPagination = null; f.taskPageSummary = null; f.loadMoreTasksButton = null; assert.doesNotThrow(() => f.renderTaskPagination());
});

it("preserves missing bulk status failure after message and link creation, before text-node creation", () => {
  const f = fixture();
  /** @type {string[]} */ const calls = [];
  f.requireNamespace = () => ({ tasksDialog: { recurrenceContinuityMessage: () => "Next." } });
  f.setStatus = (/** @type {string} */ message) => calls.push(message);
  f.document = { createElement() { calls.push("link"); return {}; }, createTextNode() { calls.push("text node"); return {}; } };
  assert.throws(() => f.renderBulkRecurrenceContinuity([{ status: "available", nextTask: { url: "/tasks", title: "Next" } }]), { name: "TypeError" });
  assert.deepEqual([...calls], ["Updated recurring tasks. Next.", "link"]);
  calls.length = 0; f.renderBulkRecurrenceContinuity([{ status: "pending" }]); assert.deepEqual([...calls], ["Updated recurring tasks. Next."]);
});
