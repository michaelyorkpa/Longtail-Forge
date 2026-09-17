import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const reader = createProjectTextReader();
const source = reader.readText("public/js/task-dialog.js");
/** @param {Record<string, unknown>} [overrides] */
function fixture(overrides = {}) {
  /** @type {unknown[][]} */ const events = [];
  const f = vm.createContext({
    window: {}, fields: {}, context: {}, dialog: {}, observedReceiver: null, observedValue: null,
    requireApi: () => ({ postJson: async (/** @type {unknown[]} */ ...args) => { events.push(["post", ...args]); return {}; } }),
    requireModalDialogs: () => ({}), readTaskFormPayload: () => ({}),
    taskFormChangeState: () => ({ hasChanges: false }), canCompleteCurrentTask: () => true,
    setStatus: (/** @type {unknown[]} */ ...args) => events.push(["status", ...args]),
    requireErrors: () => ({ caughtMessage: (/** @type {unknown} */ error, /** @type {string} */ fallback) => { events.push(["error", error]); return fallback; } }),
    notifyTaskEditorSaved: async (/** @type {unknown} */ result) => { events.push(["notify", result]); },
    closeTaskModal: (/** @type {unknown} */ dialog, /** @type {unknown} */ reason) => events.push(["close", dialog, reason]),
    syncParentTaskRelationship: async () => {}, taskFormSnapshot: () => "snapshot",
    initialTaskFormSnapshot: null,
    ...overrides,
  });
  for (const name of ["rememberTaskInContext", "syncTaskStatusField", "updateBlockedReasonState", "writeTaskCompletionFields", "writeTaskMetadataRibbon", "writeRecurrenceContinuity", "writeTaskTimerFields", "updateCompleteTaskActionState", "updateBlockTaskActionState"])
    f[name] = (/** @type {unknown[]} */ ...args) => events.push([name, ...args]);
  for (const name of ["currentTask", "currentTaskId"]) {
    const declaration = source.match(new RegExp(`  let ${name} = [^;]+;`));
    assert.ok(declaration); vm.runInContext(declaration[0], f);
  }
  vm.runInContext(reader.readText("public/js/shared/task-records.js"), f);
  f.requireTaskRecords = () => f.window.LongtailForge.taskRecords;
  for (const name of ["taskProjectionFields", "optionalTaskProjectionFields", "writeTaskCompletionContinuity", "applyTaskCompletionResult", "taskCompletionHostDetail", "setTaskCompletionStatus", "recurrenceContinuityMessage", "saveAndCompleteTask", "saveTaskForm", "toggleTaskNotificationFollow", "openTaskInWorkbench"])
    vm.runInContext(extractFunctionBlock(source, name), f);
  const get = (/** @type {string} */ expression) => vm.runInContext(expression, f);
  const set = (/** @type {string} */ name, /** @type {unknown} */ value) => { f.input = value; vm.runInContext(`${name} = input`, f); };
  return { f, get, set, events };
}

describe("raw Task completion results", () => {
  it("keeps the sparse raw task rejected by the real detail reader, with opaque continuity identity", () => {
    const { f, get, set } = fixture(); set("currentTaskId", "previous");
    const task = { title: "caller seed" }; const continuity = { supplied: true };
    const result = { task, recurrenceContinuity: continuity };
    assert.equal(f.requireTaskRecords().readTaskDetail(result), null);
    f.applyTaskCompletionResult(result);
    assert.equal(get("currentTask"), task);
    assert.equal(get("currentTask.recurrenceContinuity"), continuity);
    assert.equal(get("currentTaskId"), "previous");
  });

  it("keeps absent/falsy task no-ops and refuses a null envelope at its original required access", () => {
    const { f, get, set, events } = fixture(); const task = {}; set("currentTask", task);
    for (const value of [undefined, {}, { task: null }, { task: false }, { task: 0 }, { task: "" }]) f.applyTaskCompletionResult(value);
    assert.equal(get("currentTask"), task); assert.equal(events.length, 0);
    assert.throws(() => f.applyTaskCompletionResult(null), { name: "TypeError", message: "Task detail projection is unavailable." });
  });

  it("retains repeated task reads, assignment identity, setter receiver, continuity precedence and order", () => {
    const { f, get } = fixture();
    /** @type {string[]} */ const log = [];
    const continuity = {}; const task = Object.create({ set recurrenceContinuity(/** @type {unknown} */ value) { assert.equal(this, task); assert.equal(value, continuity); log.push("set"); }, get recurrenceContinuity() { log.push("read-written"); return continuity; } });
    let reads = 0;
    const result = { get task() { log.push(`task${++reads}`); return reads === 3 ? { task_id: "third-id" } : task; }, get recurrenceContinuity() { log.push("continuity"); return continuity; } };
    f.applyTaskCompletionResult(result);
    assert.equal(get("currentTask"), task); assert.equal(get("currentTaskId"), "third-id");
    assert.deepEqual(log, ["task1", "task2", "continuity", "set", "task3", "read-written"]);
    const existing = {}; const other = { recurrenceContinuity: existing };
    f.applyTaskCompletionResult({ task: other, recurrenceContinuity: 0 });
    assert.equal(other.recurrenceContinuity, existing);
  });

  it("evaluates the continuity RHS before a changed-getter null assignment fails", () => {
    const { f, get, events } = fixture(); let reads = 0; let rhs = false;
    const result = { get task() { return ++reads === 1 ? {} : null; }, get recurrenceContinuity() { rhs = true; return {}; } };
    assert.throws(() => f.applyTaskCompletionResult(result), { name: "TypeError" });
    assert.equal(rhs, true); assert.equal(get("currentTask"), null); assert.equal(events.length, 0);
  });

  it("retains array/function identity and primitive setter receivers without coercing raw state", () => {
    const { f, get } = fixture();
    for (const task of [[], () => {}]) { f.applyTaskCompletionResult({ task }); assert.equal(get("currentTask"), task); }
    vm.runInContext('Object.defineProperty(Number.prototype, "recurrenceContinuity", { configurable: true, set(value) { "use strict"; observedReceiver = this; observedValue = value; } });', f);
    f.applyTaskCompletionResult({ task: 7, recurrenceContinuity: "opaque" });
    assert.equal(get("currentTask"), 7); assert.equal(f.observedReceiver, 7); assert.equal(f.observedValue, "opaque");
  });

  it("does not replace a rejected setter or proxy write with a new failure policy", () => {
    const { f, get } = fixture(); const task = Object.freeze({ title: "frozen" });
    f.applyTaskCompletionResult({ task, recurrenceContinuity: {} }); assert.equal(get("currentTask"), task);
    const error = new Error("setter failure");
    const throwing = Object.create({ set recurrenceContinuity(/** @type {unknown} */ _value) { throw error; } });
    assert.throws(() => f.applyTaskCompletionResult({ task: throwing }), (actual) => actual === error);
    assert.equal(get("currentTask"), throwing);
  });

  it("preserves host-detail inherited getters, repeated projections and opaque values", () => {
    const { f, set } = fixture(); const id = {}; const title = {}; const continuity = {}; let reads = 0;
    const created = Object.create({ task_id: id, title });
    const result = Object.create({ get createdTask() { reads++; return created; }, task: { task_id: id, title }, recurrenceJob: { queued: 1 }, recurrenceContinuity: continuity });
    const detail = f.taskCompletionHostDetail(result);
    assert.equal(reads, 3); assert.equal(detail.createdTask.task_id, id); assert.equal(detail.createdTask.title, title);
    assert.equal(detail.recordId, id); assert.equal(detail.title, title); assert.equal(detail.recurrenceQueued, false); assert.equal(detail.recurrenceContinuity, continuity);
    set("currentTaskId", "fallback"); set("currentTask", { title: "fallback title" });
    assert.equal(f.taskCompletionHostDetail().recordId, "fallback"); assert.equal(f.taskCompletionHostDetail().title, "fallback title");
    assert.throws(() => f.taskCompletionHostDetail(null), { name: "TypeError" });
  });

  it("completes one real call boundary, awaits notification, forwards host receiver and closes last", async () => {
    const result = { task: { title: "caller seed" }, recurrenceContinuity: { supplied: true } };
    const { f, set, events, get } = fixture({ requireApi: () => ({ postJson: async (/** @type {string} */ url) => { events.push(["post", url]); return result; } }) });
    set("currentTaskId", "old id"); const host = { complete(/** @type {unknown} */ detail) { assert.equal(this, host); events.push(["host", detail]); } }; f.context.hostContext = host;
    await f.saveAndCompleteTask({ preventDefault() { events.push(["prevent"]); } });
    assert.equal(get("currentTask"), result.task);
    assert.deepEqual(events.filter(([name]) => ["prevent", "post", "notify", "host", "close"].includes(String(name))).map(([name]) => name), ["prevent", "post", "notify", "host", "close"]);
    assert.equal(events.find(([name]) => name === "post")?.[1], "/api/tasks/old%20id/complete");
    assert.equal(events.find(([name]) => name === "notify")?.[1], result);
  });

  it("keeps a completed write and assigned task when a later callback fails, without replay or close", async () => {
    const result = { task: { task_id: "saved" } }; const error = new Error("refresh failed"); let writes = 0;
    const { f, get, set, events } = fixture({ requireApi: () => ({ postJson: async () => { writes++; return result; } }), notifyTaskEditorSaved: async () => { throw error; } });
    set("currentTaskId", "before"); await f.saveAndCompleteTask();
    assert.equal(writes, 1); assert.equal(get("currentTask"), result.task);
    assert.equal(events.some(([name]) => name === "close"), false);
    assert.equal(events.find(([name]) => name === "error")?.[1], error);
    assert.equal(JSON.stringify(events.filter(([name]) => name === "status").at(-1)), JSON.stringify(["status", "Task was not completed.", { isError: true }]));
  });

  it("keeps save-and-close completion ordering and its original raw response after detail acquisition", async () => {
    const saved = { task_id: "saved", status: "complete" }; const result = { task: saved };
    const { f, set, events } = fixture({ requireApi: () => ({ putJson: async () => { events.push(["put"]); return result; } }) });
    f.requireTaskRecords = () => ({ readTaskDetail: () => saved });
    set("currentTaskId", "saved"); set("currentTask", { status: "open" });
    assert.equal(await f.saveTaskForm(), result);
    assert.deepEqual(events.filter(([name]) => ["put", "notify", "close"].includes(String(name))).map(([name]) => name), ["put", "notify", "close"]);
  });

  it("forwards an opaque id through the real target builder without inventing a typed target", async () => {
    const { f, set } = fixture(); vm.runInContext(reader.readText("public/js/shared/notification-subscriptions.js"), f);
    const original = f.window.LongtailForge.notificationSubscriptions; const id = { toString() { throw new Error("unexpected coercion"); } };
    /** @type {unknown[]} */ const targets = [];
    f.namespace = { notificationSubscriptions: { taskTarget: original.taskTarget, follow: async (/** @type {{targetId: unknown}} */ target) => { targets.push(target); assert.equal(target.targetId, id); return { isFollowing: true }; } } };
    f.fields.notificationToggle = { dataset: {}, setAttribute() {} }; f.writeTaskControl = () => {}; f.writeNotificationFollowState = () => {};
    set("currentTaskId", id); await f.toggleTaskNotificationFollow(); assert.equal(targets.length, 1);
  });

  it("converts ids only at URL consumption with string-hint coercion and Symbol refusal", () => {
    const { f, set } = fixture();
    /** @type {string[]} */ const calls = [];
    f.global = { URL, location: { href: "https://example.test/tasks.html", assign: (/** @type {string} */ url) => calls.push(url) } };
    set("currentTaskId", { [Symbol.toPrimitive](/** @type {string} */ hint) { assert.equal(hint, "string"); return "one two"; } });
    f.openTaskInWorkbench(); assert.equal(calls[0], "https://example.test/workbench.html?taskId=one+two");
    set("currentTaskId", Symbol("id")); assert.throws(() => f.openTaskInWorkbench(), { name: "TypeError" }); assert.equal(calls.length, 1);
  });
});
