import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/task-dialog.js");
/** @param {Record<string, unknown>} [overrides] */
function fixture(overrides = {}) {
  const sandbox = vm.createContext({
    context: null, fields: {}, form: {}, dialog: { querySelectorAll: () => [] }, currentTask: null, currentTaskId: "", currentTaskEditorRequest: null,
    namespace: {}, fileAttachmentsController: null,
    requireTaskLifecycleLegality: () => ({ isTerminalStatus: (/** @type {unknown} */ status) => status === "complete" }),
    writeTaskMetadataRibbon() {}, workspaceProjectsLabel: () => "Workspace Projects",
    option: (/** @type {unknown} */ value, /** @type {unknown} */ label) => ({ value, label }),
    optionLabel: (/** @type {{name: string}} */ row) => row.name,
    displayUser: (/** @type {{name: string}} */ row) => row.name,
    replaceOptions: (/** @type {{options: unknown}} */ field, /** @type {unknown} */ options) => { field.options = options; },
    ...overrides,
  });
  for (const name of ["taskProjectionFields", "optionalTaskProjectionFields", "requireTaskControl", "callTaskContextCollection", "taskContextOptionItems", "defaultTaskOptions", "usesClientScope", "setStatus", "notifyTaskEditorSaved", "mountTaskFileAttachments", "parentTaskOptions", "findProjectOption", "applySelectedProjectTaskDefaults", "populateFormOptions", "populateProjectInput", "saveTaskForm"])
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return sandbox;
}
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));

describe("Task context consumption preserves open host overrides", () => {
  it("keeps inherited and primitive option reads, falsy defaults, and strict false timer flags", () => {
    const f = fixture();
    for (const options of [null, false, 0, ""]) { f.context = { options }; assert.equal(f.usesClientScope(), true); }
    for (const options of ["business", 9, true]) { f.context = { options }; assert.equal(f.usesClientScope(), false); }
    f.context = { options: Object.create({ workspaceType: "business" }) };
    assert.equal(f.usesClientScope(), true);
    vm.runInContext(extractFunctionBlock(source, "readTaskTimerIneligibleReason"), f);
    for (const options of [{ taskTimersEnabled: false }, { timeTrackingEnabled: false }]) {
      f.context = { options }; assert.match(f.readTaskTimerIneligibleReason({}), /disabled/);
    }
    f.context = { options: { taskTimersEnabled: 0, timeTrackingEnabled: null } };
    assert.equal(f.readTaskTimerIneligibleReason({ project_id: "p", status: "open" }), "Task timer unavailable.");
  });
  it("keeps collection method receivers, result identity, inherited lookup, and failure timing", () => {
    const f = fixture(); const result = {}; const rows = Object.create({ find() { assert.equal(this, rows); return result; } });
    f.context = { options: { projects: rows } };
    assert.equal(f.findProjectOption("p"), result);
    for (const value of [null, undefined, 0, false, ""]) { rows.find = () => value; assert.equal(f.findProjectOption("p"), null); }
    let reads = 0;
    Object.defineProperty(rows, "find", { configurable: true, get() { reads++; return 7; } });
    assert.throws(() => f.findProjectOption("p"), { name: "TypeError" }); assert.equal(reads, 1);
    const sentinel = new Error("method getter");
    Object.defineProperty(rows, "find", { get() { throw sentinel; } });
    assert.throws(() => f.findProjectOption("p"), (error) => error === sentinel);
  });
  it("consumes custom iterable option results with native spread lookup and failure order", () => {
    const f = fixture();
    /** @type {string[]} */ const log = []; let index = 0;
    const iterator = { get next() { log.push("next getter"); return /** @this {unknown} */ function () {
      assert.equal(this, iterator); log.push("next"); const done = index++ > 0;
      return { get done() { log.push("done"); return done; }, get value() { log.push("value"); return "choice"; } };
    }; } };
    const iterable = { get [Symbol.iterator]() { log.push("iterator getter"); return /** @this {unknown} */ function () { assert.equal(this, iterable); return iterator; }; } };
    assert.deepEqual(plain(f.taskContextOptionItems(iterable)), ["choice"]);
    assert.deepEqual(log, ["iterator getter", "next getter", "next", "done", "value", "next", "done"]);
    assert.deepEqual(plain(f.taskContextOptionItems("ab")), ["a", "b"]);
    for (const invalid of [null, {}, { [Symbol.iterator]: 3 }, { [Symbol.iterator]: () => 3 }, { [Symbol.iterator]: () => ({ next: () => null }) }])
      assert.throws(() => f.taskContextOptionItems(invalid), { name: "TypeError" });
    const sentinel = new Error("iterator failure"); let closed = false;
    assert.throws(() => f.taskContextOptionItems({ [Symbol.iterator]: () => ({ next() { throw sentinel; }, return() { closed = true; } }) }), (error) => error === sentinel);
    assert.equal(closed, false);
  });
  it("renders custom catalog operations without rebuilding their inputs or accepting array-like non-iterables", () => {
    const f = fixture(); const client = { id: "c", name: "Client" }; const user = { user_id: "u", name: "User" };
    f.populateProjectInput = () => {};
    f.fields = { client: {}, assignees: {} };
    const clients = { map(/** @type {(row: unknown) => unknown} */ callback) { assert.equal(this, clients); return new Set([callback(client)]); } };
    const users = { map(/** @type {(row: unknown) => unknown} */ callback) { assert.equal(this, users); return [callback(user)]; } };
    f.context = { options: { workspaceType: "business", clients, users } };
    f.populateFormOptions();
    assert.deepEqual(plain(f.fields.client.options), [{ value: "", label: "Workspace Projects" }, { value: "c", label: "Client" }]);
    assert.deepEqual(plain(f.fields.assignees.options), [{ value: "u", label: "User" }]);
    clients.map = () => Object.assign(new Set(), { [Symbol.iterator]: undefined });
    assert.throws(() => f.populateFormOptions(), { name: "TypeError" });
  });
  it("retains parent hierarchy, filtering, opaque metadata, cycle protection, and source references", () => {
    const f = fixture(); const metadata = {};
    const root = { task_id: "r", title: "Root", status: "open", metadata };
    const child = { task_id: "c", title: "Child", parentTask: { task_id: "r" }, status: "open" };
    const tasks = [child, root, null, { task_id: "done", title: "Done", status: "complete" }, { task_id: "self", title: "Cycle", parent_task_id: "self" }];
    f.context = { tasks }; f.fields = {};
    const result = f.parentTaskOptions("");
    assert.deepEqual(plain(result.map((/** @type {{task_id: unknown}} */ row) => row.task_id)), ["r", "c", "self"]);
    assert.equal(result[1].optionLabel, "  - Child"); assert.equal(result[0].metadata, metadata);
    assert.equal(tasks[0], child); assert.equal(f.context.tasks, tasks);
    assert.ok(f.parentTaskOptions("r").some((/** @type {{task_id: unknown}} */ row) => row.task_id === "done"));
    assert.ok(!f.parentTaskOptions("r").some((/** @type {{task_id: unknown}} */ row) => row.task_id === "r"));
    f.context.tasks = [{ task_id: "a", title: "A", client_id: "c", project_id: "p" }, { task_id: "b", title: "B", client_id: "other" }];
    f.fields = { client: { value: "c" }, project: { value: "p" } };
    assert.deepEqual(plain(f.parentTaskOptions("").map((/** @type {{task_id: unknown}} */ row) => row.task_id)), ["a"]);
  });
  it("keeps status callback receiver, arguments, nullish fallback and non-callable host refusal", () => {
    const f = fixture(); const options = {};
    /** @type {unknown[]} */ const calls = [];
    const host = { setStatus(/** @type {unknown[]} */ ...args) { calls.push(this, ...args); } };
    const context = { hostContext: host, setStatus: 9 }; f.context = context;
    f.setStatus("message", options); assert.deepEqual(calls, [host, "message", options]);
    for (const value of [null, undefined]) { f.context = { hostContext: { setStatus: value } }; assert.doesNotThrow(() => f.setStatus("ignored")); }
    for (const value of [0, false, "", {}, 7]) { f.context = { hostContext: { setStatus: value } }; assert.throws(() => f.setStatus("not ignored"), { name: "TypeError" }); }
    const error = new Error("host callback"); f.context = { hostContext: { setStatus() { throw error; } } };
    assert.throws(() => f.setStatus("m"), (caught) => caught === error);
    let reads = 0; const configured = { get setStatus() { reads++; return /** @this {unknown} */ function () { assert.equal(this, configured); }; } }; f.context = configured;
    f.setStatus("m"); assert.equal(reads, 2);
  });
  it("awaits configured save callbacks without binding, deduplicates, and retains error propagation", async () => {
    const f = fixture();
    /** @type {string[]} */ const log = []; const result = {};
    const first = /** @this {unknown} @param {unknown} value */ async function (value) { assert.equal(this, undefined); assert.equal(value, result); log.push("start"); await Promise.resolve(); log.push("end"); };
    const refresh = /** @this {unknown} */ function () { assert.equal(this, undefined); log.push("refresh"); };
    f.context = { onSaved: first, hostContext: { refresh } };
    f.currentTaskEditorRequest = { onSaved: first, refresh, materializationRefreshPending: true };
    await f.notifyTaskEditorSaved(result); assert.deepEqual(log, ["start", "end", "refresh"]); assert.equal(f.currentTaskEditorRequest.materializationRefreshPending, false);
    f.context.onSaved = 1; await f.notifyTaskEditorSaved(result); // This consumer deliberately ignores non-functions.
    const error = new Error("save callback"); f.context.onSaved = async () => { throw error; };
    await assert.rejects(f.notifyTaskEditorSaved(result), (caught) => caught === error);
  });
  it("forwards attachment callback identity, receiver, return/rejection and late context lookup", async () => {
    const f = fixture(); let callbacks = vm.runInContext("({})", f); const detail = {}; const returned = Promise.resolve("done");
    f.namespace = { fileAttachments: { mount: (/** @type {unknown} */ _container, /** @type {unknown} */ options) => { callbacks = options; return {}; } } };
    f.fields = { fileContainer: {}, fileToggle: {} };
    f.mountTaskFileAttachments({ task_id: "t" });
    const owner = { onAttachmentsChanged(/** @type {unknown} */ value) { assert.equal(this, owner); assert.equal(value, detail); return returned; }, onAttachmentsRefreshed: null }; f.context = owner;
    assert.equal(callbacks.onAttachmentAdded(detail), returned); assert.equal(callbacks.onAttachmentRemoved(detail), returned); assert.equal(callbacks.onRefresh(detail), undefined);
    f.context = { onAttachmentsChanged: false }; assert.throws(() => callbacks.onAttachmentAdded(detail), { name: "TypeError" });
    const error = new Error("async attachment"); f.context = { onAttachmentsChanged: () => Promise.reject(error) };
    await assert.rejects(callbacks.onAttachmentRemoved(detail), (caught) => caught === error);
  });
  it("keeps the committed save, optional completion ordering, receiver and ignored return intact", async () => {
    /** @type {string[]} */ const order = [];
    let thenReads = 0;
    const task = { task_id: "t", status: "open", get title() { order.push("title"); return "Saved"; } };
    const result = { task };
    const f = fixture({
      currentTaskId: "t", currentTask: { task_id: "t", status: "open" },
      requireModalDialogs: () => ({}), requireApi: () => ({ putJson: async () => { order.push("write"); return result; } }),
      readTaskFormPayload: () => ({}), taskFormChangeState: () => ({}),
      requireTaskRecords: () => ({ readTaskDetail: () => task }), syncParentTaskRelationship: async () => {},
      rememberTaskInContext() {}, updateCompleteTaskActionState() {}, updateBlockTaskActionState() {},
      taskFormSnapshot: () => ({}), requireErrors: () => ({ caughtMessage: () => "caught" }),
      closeTaskModal: () => { order.push("close"); },
    });
    f.setStatus = (/** @type {string} */ value) => order.push(value);
    f.notifyTaskEditorSaved = async () => { order.push("saved callback"); };
    const host = { get complete() { order.push("complete getter"); return /** @this {unknown} @param {unknown} detail */ function (detail) {
      assert.equal(this, host); assert.deepEqual(plain(detail), { actionId: "tasks.edit", recordId: "t", title: "Saved" }); order.push("complete call");
      return { get then() { thenReads++; throw new Error("must not await completion"); } };
    }; } };
    f.context = { hostContext: host };
    assert.equal(await f.saveTaskForm(), result);
    assert.deepEqual(order, ["Saving task...", "write", "saved callback", "complete getter", "title", "complete call", "close", ""]);
    assert.equal(thenReads, 0); assert.equal(f.currentTask, task);
    order.length = 0;
    f.context = { hostContext: { get complete() { order.push("complete getter"); return false; } } };
    await assert.rejects(f.saveTaskForm(), { name: "TypeError" });
    assert.deepEqual(order, ["Saving task...", "write", "saved callback", "complete getter", "title", "caught"]);
    assert.equal(f.currentTask, task);
    order.length = 0; f.context = { hostContext: { complete: null } };
    await f.saveTaskForm(); assert.ok(!order.includes("title")); assert.ok(order.includes("close"));
  });
  it("executes actual bound cancel and Notes listeners with live owner identity and synchronous refusal", () => {
    const f = fixture();
    const controls = new Map(); const listeners = new Map();
    /** @param {string} selector */
    const control = (selector) => {
      if (!controls.has(selector)) controls.set(selector, { dataset: {}, querySelector: control, addEventListener: (/** @type {string} */ event, /** @type {unknown} */ callback) => listeners.set(`${selector}:${event}`, callback) });
      return controls.get(selector);
    };
    // Stub unrelated dialog actions; the registration and callbacks under test are the real body.
    for (const match of source.matchAll(/^  (?:async )?function (\w+)\(/gm)) if (!(match[1] in f)) f[match[1]] = () => {};
    f.document = { querySelector: control }; f.dialog = null; f.recurrenceDialog = null; f.tagsDialog = null; f.filesDialog = null;
    for (const name of ["requireTaskControlDataset", "ensureDialog"]) vm.runInContext(extractFunctionBlock(source, name), f);
    let closes = 0; f.closeTaskModal = () => { closes++; };
    f.ensureDialog();
    const cancel = listeners.get("[data-cancel-task]:click");
    const linked = listeners.get("[data-task-notes]:notes-linked-panel:link");
    const unlinked = listeners.get("[data-task-notes]:notes-linked-panel:unlink");
    let calls = 0; const answer = {};
    const owner = { onNotesChanged() { assert.equal(this, owner); calls++; return answer; } }; f.context = owner;
    assert.equal(linked(), answer); assert.equal(unlinked(), answer); assert.equal(calls, 2);
    f.context = { onNotesChanged: 0 }; assert.throws(() => linked(), { name: "TypeError" });
    f.context = null; assert.equal(unlinked(), undefined);
    const host = { cancel(/** @type {unknown} */ detail) { assert.equal(this, host); assert.deepEqual(plain(detail), { actionId: "tasks.add" }); } };
    f.context = { hostContext: host }; cancel(); assert.equal(closes, 1);
    f.context = { hostContext: { cancel: false } }; assert.throws(() => cancel(), { name: "TypeError" }); assert.equal(closes, 1);
  });

  it("proves the shared picker selects a loaded catalog for truthy non-array overrides", async () => {
    const tagsSource = createProjectTextReader().readText("public/js/shared/tags.js");
    /** @type {unknown[]} */ const catalog = []; let loads = 0;
    /** @type {{value: unknown}} */ const stop = { value: undefined };
    const f = vm.createContext({ loadTags: async () => { loads++; return catalog; }, normalizeTagList: (/** @type {unknown} */ value) => { stop.value = value; throw stop; } });
    vm.runInContext(extractFunctionBlock(tagsSource, "mountPicker"), f);
    for (const tags of [{}, "catalog", 7, true]) {
      await assert.rejects(f.mountPicker({}, { tags }), (error) => error === stop);
      assert.equal(stop.value, catalog);
    }
    assert.equal(loads, 4);
    const supplied = [{}]; await assert.rejects(f.mountPicker({}, { tags: supplied }), (error) => error === stop);
    assert.equal(stop.value, supplied); assert.equal(loads, 4);
    // Stop after the actual shared input decision; this does not simulate the rest of its UI.
  });

});
