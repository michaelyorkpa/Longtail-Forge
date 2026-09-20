import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/tasks.js");
/** @param {string} name */
function mapSource(name) {
  const start = source.indexOf(`  const ${name} = `);
  const end = source.indexOf("  });", start);
  assert(start >= 0 && end > start);
  return source.slice(start, end + 5);
}
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));
/** @param {Record<string, unknown>} [overrides] */
function fixture(overrides = {}) {
  /** @type {unknown[][]} */ const calls = [];
  const s = vm.createContext({
    state: { options: {}, taskTimers: [] },
    setStatus: (/** @type {unknown[]} */ ...args) => calls.push(["status", ...args]),
    taskTimerForTask: (/** @type {unknown} */ task) => { calls.push(["timer", task]); return null; },
    readTaskTimerElapsedSeconds: () => 12,
    requireApi: () => ({ putJson: async (/** @type {unknown[]} */ ...args) => { calls.push(["put", ...args]); return {}; } }),
    requireTaskRecords: () => ({ readTask: () => null, readTaskTimer: () => null }),
    requireErrors: () => ({ caughtMessage: (/** @type {unknown} */ error) => { calls.push(["caught", error]); return "failed"; } }),
    requireNamespace: () => ({ taskResumeNoteCapture: { offer: (/** @type {unknown} */ options) => { s.capture = options; calls.push(["offer"]); } } }),
    upsertTask: (/** @type {unknown} */ task) => calls.push(["upsert", task]),
    upsertTaskTimerState: (/** @type {unknown} */ timer) => calls.push(["upsertTimer", timer]),
    reloadTaskList: async () => calls.push(["reload"]),
    ...overrides,
  });
  for (const name of ["taskActionField", "optionalTaskActionId", "saveTaskTimerAction", "taskWorkflowActionVisible", "taskWorkflowDisabledReason", "taskTimerDisabledReason", "taskTimerSurfaceAvailable"])
    vm.runInContext(extractFunctionBlock(source, name), s);
  return { s, calls };
}

describe("Tasks workflow dispatch boundary", () => {
  it("dispatches all thirteen frozen entries once, preserving arguments, receivers and return identity", () => {
    const { s } = fixture();
    const result = Promise.resolve("identity");
    /** @type {{name:string,args:unknown[],receiver:unknown}[]} */ const calls = [];
    for (const name of ["postTaskAction", "openTaskDialogForBlock", "updateTaskLifecycleStatus", "openTaskDialogForWorkflow", "saveTaskTimerAction"])
      s[name] = function (/** @type {unknown[]} */ ...args) { calls.push({ name, args, receiver: this }); return result; };
    vm.runInContext(mapSource("TASK_LIFECYCLE_BEHAVIOR_HANDLERS") + mapSource("TASK_WORKFLOW_BEHAVIOR_HANDLERS") + "globalThis.maps = [TASK_LIFECYCLE_BEHAVIOR_HANDLERS, TASK_WORKFLOW_BEHAVIOR_HANDLERS];", s);
    const record = { task_id: "task" }, trigger = { marker: "trigger" };
    const action = { statusPayload: { status: "custom" }, timerStatus: "custom" };
    const expected = [
      ["postTaskAction", [record, "complete"]], ["postTaskAction", [record, "reopen"]],
      ["openTaskDialogForBlock", [record, action, trigger]], ["updateTaskLifecycleStatus", [record, action.statusPayload]],
      ["postTaskAction", [record, "archive"]], ["postTaskAction", [record, "restore"]],
      ...Array.from({ length: 4 }, () => ["openTaskDialogForWorkflow", [record, action, trigger]]),
      ...Array.from({ length: 3 }, () => ["saveTaskTimerAction", [record, "custom"]]),
    ];
    for (const map of s.maps) {
      assert(Object.isFrozen(map));
      for (const handler of Object.values(map)) {
        if (typeof handler !== "function") throw new Error("handler missing");
        assert.equal(handler.call({ unrelated: true }, { action, record, trigger }), result);
      }
    }
    assert.equal(calls.length, 13);
    calls.forEach((call, index) => { assert.equal(call.name, expected[index][0]); assert.deepEqual(call.args, expected[index][1]); assert.equal(call.receiver, undefined); });
    s.maps[0]["tasks.lifecycle.resume"]({ action: { statusPayload: null }, record });
    assert.deepEqual(plain(calls.at(-1)?.args[1]), { status: "in_progress", blocked_reason: "" });
    for (const [key, status] of [["start", "running"], ["pause", "paused"], ["resume", "running"]]) {
      s.maps[1][`tasks.workflow.timer.${key}`]({ action: { timerStatus: "" }, record });
      assert.deepEqual(calls.at(-1)?.args, [record, status]);
    }
  });

  it("registers create, lifecycle, workflow and the three real container mounts in order", () => {
    const { s } = fixture();
    /** @type {string[]} */ const order = [];
    /** @type {Map<string, Function>} */ const handlers = new Map();
    const view = { registerBehavior: (/** @type {string} */ name, /** @type {Function} */ handler) => { order.push(name); handlers.set(name, handler); } };
    s.requireView = s.requireDescriptorRenderers = () => view;
    s.registerTaskLifecycleBehaviors = () => order.push("lifecycle");
    s.registerTaskWorkflowBehaviors = () => order.push("workflow");
    s.openTaskDialog = () => "opened";
    s.createTaskViewSelectorChrome = () => "selector";
    s.createTaskFilterChrome = () => "filters";
    s.createTaskMainListChrome = () => "list";
    vm.runInContext(extractFunctionBlock(source, "registerTasksViewBehaviors"), s);
    s.registerTasksViewBehaviors();
    assert.deepEqual(order, ["tasks.create", "lifecycle", "workflow", "tasks.sidebar.view-selector", "tasks.sidebar.filters", "tasks.main.list"]);
    assert.equal(handlers.get("tasks.create")?.(), "opened");
    /** @type {unknown[]} */ const replacements = [];
    const container = { replaceChildren(/** @type {unknown} */ node) { assert.equal(this, container); replacements.push(node); } };
    for (const name of order.slice(3)) assert.equal(handlers.get(name)?.({ container }), undefined);
    assert.deepEqual(replacements, ["selector", "filters", "list"]);
  });

  it("preserves timer visibility and disabled-reason precedence including unknown statuses", () => {
    const { s } = fixture();
    s.requireTaskLifecycleLegality = () => ({ timerMatchesVisibility: () => true });
    const task = { task_id: "t", project_id: "p", status: "custom" };
    assert.equal(s.taskWorkflowActionVisible({ visibleStatuses: ["open"] }, task), false);
    assert.equal(s.taskWorkflowActionVisible({}, task), true);
    s.state.options.taskTimersEnabled = false;
    assert.equal(s.taskWorkflowActionVisible({ timerVisibility: "none" }, task), false);
    assert.equal(s.taskTimerDisabledReason({}, task), "Task timers are disabled.");
    s.state.options = { timeTrackingEnabled: false };
    assert.equal(s.taskTimerDisabledReason({}, task), "Time Tracking is disabled.");
    s.state.options = {};
    assert.equal(s.taskTimerDisabledReason({}, { ...task, project_id: "" }), "Task timers require a project-linked task.");
    assert.equal(s.taskTimerDisabledReason({}, { ...task, status: "complete" }), "Completed and archived tasks cannot use task timers.");
    assert.equal(s.taskTimerDisabledReason({ timerVisibility: "running" }, task), "No running task timer.");
    assert.equal(s.taskTimerDisabledReason({ timerVisibility: "paused" }, task), "No paused task timer.");
    assert.equal(s.taskWorkflowDisabledReason({}, null), "Task action is unavailable.");
  });

  it("retains raw task identity, getter counts, conversion order and paused callback channels", async () => {
    const { s, calls } = fixture();
    /** @type {string[]} */ const order = [];
    const id = { [Symbol.toPrimitive](/** @type {string} */ hint) { order.push(hint); return "task / id"; } };
    const task = Object.create({ get task_id() { order.push("id"); return id; } });
    await s.saveTaskTimerAction(task, "paused");
    assert.deepEqual(order, ["id", "id", "string"]);
    assert.equal(calls[0][1], task);
    const put = calls.find((call) => call[0] === "put");
    assert.equal(put?.[1], "/api/tasks/task%20%2F%20id/timer");
    assert.equal(s.capture.task, task);
    assert.deepEqual(plain(put?.[2]), { active_task_timer_id: "", timer_status: "paused", accumulated_elapsed_seconds: 12, last_active_start_time: plain(put?.[2]).last_active_start_time });
    const raw = { title: "sparse callback" };
    s.capture.onSaved(raw);
    assert.equal(calls.at(-1)?.[1], raw);
    s.capture.onSaved(7);
    assert.deepEqual(calls.at(-1), ["upsert", 7]);
    let reads = 0;
    const error = Object.create({ get message() { reads += 1; return raw; } });
    s.capture.onError(error);
    assert.equal(reads, 1);
    assert.equal(calls.at(-1)?.[1], raw);
    vm.runInContext(`Object.defineProperty(Number.prototype, "message", { configurable: true, get() { "use strict"; globalThis.errorReceiver = this; return ""; } });`, s);
    s.capture.onError(7);
    assert.equal(s.errorReceiver, 7);
    assert.equal(calls.at(-1)?.[1], "Resume note could not be saved.");
    assert.throws(() => s.capture.onError(null), /Task action fields are unavailable/);
    const thrown = new Error("getter");
    assert.throws(() => s.capture.onError({ get message() { throw thrown; } }), (error) => error === thrown);
  });

  it("preserves missing-task refusal and conversion failures through the existing catch", async () => {
    for (const task of [null, undefined, 7, "text", {}, { task_id: "" }]) {
      const { s, calls } = fixture();
      await s.saveTaskTimerAction(task, "running");
      assert.deepEqual(plain(calls), [["status", "Task timer action is unavailable.", { isError: true }]]);
    }
    const failure = new Error("conversion");
    for (const id of [Symbol("id"), { [Symbol.toPrimitive]() { throw failure; } }]) {
      const { s, calls } = fixture();
      await s.saveTaskTimerAction({ task_id: id }, "running");
      assert.equal(calls.some((call) => call[0] === "put"), false);
      const error = calls.find((call) => call[0] === "caught")?.[1];
      if (typeof id !== "symbol") assert.equal(error, failure);
      else assert.equal(plain({ name: error && typeof error === "object" && "name" in error ? error.name : "" }).name, "TypeError");
      assert.deepEqual(plain(calls.at(-1)), ["status", "failed", { isError: true }]);
    }
  });
});
