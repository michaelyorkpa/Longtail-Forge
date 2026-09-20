import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

/** @param {unknown} value @param {string} key @returns {unknown} */
function field(value, key) {
  assert(value !== null && (typeof value === "object" || typeof value === "function"));
  return Reflect.get(value, key);
}
const source = createProjectTextReader().readText("public/js/tasks.js");
/** @param {Record<string, unknown>} [overrides] */
function fixture(overrides = {}) {
  /** @type {unknown[][]} */ const calls = [];
  const s = vm.createContext({
    state: { options: {}, tasks: [], taskTimers: [], tagOptions: [] },
    document: { activeElement: { active: true } }, window: { LongtailForge: {} },
    currentUserId: () => "user",
    requireTaskLifecycleLegality: () => ({ activeStatuses: () => ["open", "in_progress", "blocked"] }),
    refreshTaskAttachmentCounts() {}, refreshTaskNoteCounts() {},
    setStatus: (/** @type {unknown[]} */ ...args) => calls.push(["status", ...args]),
    upsertTask: (/** @type {unknown} */ task) => calls.push(["upsert", task]),
    reloadTaskList: async () => { calls.push(["reload"]); },
    renderTaskRecurrenceContinuity: (/** @type {unknown} */ value) => calls.push(["render", value]),
    trackTaskRecurrenceContinuity: (/** @type {unknown[]} */ ...args) => calls.push(["track", ...args]),
    setTimeout: (/** @type {Function} */ callback, /** @type {number} */ delay) => { calls.push(["schedule", delay]); s.pending = callback; },
    requireNamespace: () => ({ tasksDialog: { configure: (/** @type {unknown} */ options) => { s.config = options; } } }),
    requireTasksDialog: () => ({ openTaskEditor: (/** @type {unknown[]} */ ...args) => { calls.push(["open", ...args]); return s.result; } }),
    requireErrors: () => ({ caughtMessage: (/** @type {unknown} */ error) => { calls.push(["caught", error]); return "failed"; } }),
    formatToken: (/** @type {string} */ value) => value,
    ...overrides,
  });
  for (const name of ["taskActionField", "optionalTaskLifecycleId", "configureTaskDialog", "openTaskDialog", "openTaskDialogById", "openTaskDialogForWorkflow", "openTaskDialogForBlock", "postTaskAction", "updateTaskLifecycleStatus", "runTaskLifecycleAction", "runTaskWorkflowAction", "confirmTaskLifecycleAction", "taskLifecycleActionStripDescriptor"])
    vm.runInContext(extractFunctionBlock(source, name), s);
  return { s, calls };
}

describe("Tasks lifecycle and local dialog boundary", () => {
  it("keeps raw editor values, option identity, focus fallback and duplicate short circuit", () => {
    const { s, calls } = fixture();
    const task = { task_id: { opaque: true } }, defaults = { status: "blocked" }, host = {}, focus = {};
    s.result = Promise.resolve("opened");
    assert.equal(s.openTaskDialog(task, { defaults, hostContext: host, returnFocusTo: focus, focusTarget: "due_date", focusNotes: true }), s.result);
    const request = calls[0][1];
    assert.equal(field(request, "task"), task);
    assert.equal(field(request, "defaults"), defaults);
    assert.equal(field(request, "returnFocusTo"), focus);
    assert.equal(field(request, "focusTarget"), "due_date");
    assert.equal(field(request, "focusNotes"), true);
    assert.equal(field(request, "mode"), "edit");
    assert.equal(calls[0][2], host);
    assert.equal(s.state.editingTaskId, task.task_id);
    s.openTaskDialog({ get task_id() { throw new Error("must not read duplicate id"); } }, { duplicate: true });
    assert.equal(s.state.editingTaskId, "");
    assert.equal(field(calls[1][1], "mode"), "add");
    assert.equal(field(calls[1][1], "returnFocusTo"), s.document.activeElement);
    s.openTaskDialog();
    assert.equal(field(calls[2][1], "task"), null);
    assert.equal(field(calls[2][1], "mode"), "add");
    assert.equal(calls[2][2], null);
  });

  it("preserves primitive inherited getters and caller receiver without validating the record", () => {
    const { s, calls } = fixture();
    vm.runInContext(`Object.defineProperty(Number.prototype, "task_id", { get() { "use strict"; globalThis.receiver = this; return "primitive"; } });`, s);
    s.openTaskDialog(7);
    assert.equal(s.receiver, 7);
    assert.equal(field(calls[0][1], "task"), 7);
    s.openTaskDialogById({ opaque: true });
    assert.equal(field(calls[1][1], "taskId"), s.state.editingTaskId);
    assert.equal(s.openTaskDialogById(0), null);
    assert.equal(calls.length, 2);
  });

  it("keeps block overrides, raw task identity and focus return; absent ids refuse before opening", () => {
    const { s, calls } = fixture();
    const task = { task_id: "t" }, trigger = {};
    s.openTaskDialogForBlock(task, { focusTarget: "due_date", extra: "retained" }, trigger);
    const request = calls[0][1];
    assert.equal(field(request, "task"), task);
    assert.equal(field(request, "returnFocusTo"), trigger);
    assert.equal(field(request, "focusTarget"), "blocked_reason");
    assert.equal(field(request, "promptBlockedReason"), true);
    assert.equal(field(field(request, "defaults"), "status"), "blocked");
    assert.equal(s.openTaskDialogForWorkflow(null, {}), null);
    assert.equal(calls.at(-1)?.[1], "Task action is unavailable.");
  });

  it("keeps save callback read counts, changing getters, references and deferred continuity order", async () => {
    const { s, calls } = fixture();
    s.configureTaskDialog();
    assert.equal(s.config.tasks, s.state.tasks);
    assert.equal(s.config.taskTimers, s.state.taskTimers);
    assert.equal(s.config.tagOptions, s.state.tagOptions);
    assert.equal(s.config.setStatus, s.setStatus);
    let taskReads = 0, continuityReads = 0;
    const rawTask = { task_id: "later" }, continuity = { opaque: true };
    const result = {
      get task() { calls.push(["task", ++taskReads]); assert.equal(this, result); return taskReads === 1 ? true : taskReads === 2 ? 7 : rawTask; },
      get recurrenceContinuity() { calls.push(["continuity", ++continuityReads]); assert.equal(this, result); return continuity; },
    };
    await s.config.onSaved(result);
    assert.deepEqual(calls, [["task", 1], ["task", 2], ["upsert", 7], ["reload"], ["continuity", 1], ["schedule", 0]]);
    s.pending();
    assert.deepEqual(calls.slice(6), [["continuity", 2], ["render", continuity], ["task", 3], ["continuity", 3], ["track", "later", continuity]]);
  });

  it("retains callback rejection timing and optional configure absence", async () => {
    const { s, calls } = fixture();
    s.configureTaskDialog();
    await assert.rejects(s.config.onSaved(null), /Task action fields are unavailable/);
    assert.equal(calls.length, 0);
    const failure = new Error("read failed");
    await assert.rejects(s.config.onSaved({ get task() { throw failure; } }), (error) => error === failure);
    await s.config.onSaved(7);
    assert.deepEqual(calls, [["reload"]]);
    s.requireNamespace = () => ({});
    assert.doesNotThrow(() => s.configureTaskDialog());
  });

  it("keeps descriptor order, exact archive confirmation, cancellation before dispatch and awaiting failures", async () => {
    const { s, calls } = fixture();
    const actions = s.taskLifecycleActionStripDescriptor().actions;
    assert.deepEqual(Array.from(actions, (action) => action.id), ["complete-task", "reopen-task", "block-task", "resume-task", "archive-task", "restore-task"]);
    const action = actions.find((/** @type {{id:string}} */ item) => item.id === "archive-task"), task = { title: "Kept title", task_id: "t" };
    s.requireApi = () => { calls.push(["api"]); return {}; };
    s.taskLifecycleBehaviorHandler = () => { calls.push(["lookup"]); return async (/** @type {unknown} */ context) => { calls.push(["dispatch", context]); }; };
    s.requireModalDialogs = () => ({ confirm: (/** @type {unknown} */ options) => { calls.push(["confirm", options]); return false; } });
    await s.runTaskLifecycleAction(action, task);
    assert.deepEqual(calls.map((call) => call[0]), ["api", "lookup", "confirm"]);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[2][1])), { title: "Archive task", message: 'Archive "Kept title"?', confirmLabel: "Archive", danger: true });
    s.requireModalDialogs = () => ({ confirm: () => true });
    const trigger = {};
    await s.runTaskLifecycleAction(action, task, trigger);
    const context = calls.at(-1)?.[1];
    assert.equal(field(context, "action"), action); assert.equal(field(context, "record"), task); assert.equal(field(context, "trigger"), trigger); assert.equal(field(context, "refresh"), s.reloadTaskList);
    const failure = new Error("handler failed");
    s.taskWorkflowBehaviorHandler = () => async () => { throw failure; };
    await assert.rejects(s.runTaskWorkflowAction({ behavior: "test" }, task), (error) => error === failure);
  });

  it("preserves real request coercion, receiver, read order and opaque continuity fallback", async () => {
    const { s, calls } = fixture();
    let reads = 0;
    const task = { get task_id() { assert.equal(this, task); calls.push(["id", ++reads]); return reads === 1 ? { toString() { calls.push(["string"]); return "a/b"; } } : 17; } };
    const response = {}, continuity = {};
    const api = { async postJson(/** @type {unknown[]} */ ...args) { assert.equal(this, api); calls.push(["post", ...args]); return response; } };
    s.requireApi = () => api;
    s.requireTaskRecords = () => ({ readTaskDetail(/** @type {unknown} */ value) { assert.equal(value, response); return null; }, readRecurrenceContinuity: () => continuity });
    await s.postTaskAction(task, "complete");
    assert.deepEqual(calls.map((call) => call[0]), ["status", "id", "string", "post", "upsert", "reload", "render", "id", "track"]);
    assert.equal(calls[3][1], "/api/tasks/a%2Fb/complete");
    assert.deepEqual(Object.keys(Object(calls[3][2])), []);
    assert.deepEqual(calls.at(-1), ["track", 17, continuity]);
  });

  it("preserves payload identity, failures inside the action catch, and no writes on failed coercion", async () => {
    const { s, calls } = fixture();
    const payload = { status: "in_progress", blocked_reason: "" }, result = { task_id: "t" };
    s.requireApi = () => ({ putJson: async (/** @type {string} */ path, /** @type {unknown} */ value) => { assert.equal(value, payload); calls.push(["put", path]); return {}; }, postJson: () => assert.fail("no write") });
    s.requireTaskRecords = () => ({ readTaskDetail: () => result, readRecurrenceContinuity: () => null });
    await s.updateTaskLifecycleStatus({ task_id: 42 }, payload);
    assert.deepEqual(calls.map((call) => call[0]), ["status", "put", "upsert", "reload", "status"]);
    assert.equal(calls[1][1], "/api/tasks/42");
    assert.equal(calls[2][1], result);
    calls.length = 0;
    await s.postTaskAction({ task_id: Symbol("invalid id") }, "complete");
    assert.deepEqual(calls.map((call) => call[0]), ["status", "caught", "status"]);
    assert.equal(field(calls[1][1], "name"), "TypeError");
    calls.length = 0;
    await s.postTaskAction(null, "archive");
    assert.equal(field(calls[1][1], "message"), "Task action fields are unavailable.");
  });
});
