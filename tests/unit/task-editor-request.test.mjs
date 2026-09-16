import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/task-dialog.js");
/** @param {Record<string, unknown>} [extra] */
function fixture(extra = {}) {
  const sandbox = vm.createContext({
    context: {}, document: { activeElement: null }, namespace: {},
    fields: { title: {}, copyLink: {}, workbenchOpen: {} },
    ...extra,
  });
  const declaration = source.match(/  let currentTaskEditorRequest = [^;]+;/);
  assert.ok(declaration);
  vm.runInContext(declaration[0], sandbox);
  for (const name of ["taskProjectionFields", "optionalTaskProjectionFields", "normalizeTaskEditorMode", "normalizeTaskEditorDefaults", "normalizeTaskEditorFocusTarget", "normalizeTaskEditorRequest", "openTaskEditor", "prepareStandaloneContext", "transitionCreatedTaskToEdit", "notifyTaskEditorSaved", "refreshMaterializedTaskRequest"])
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  const read = () => vm.runInContext("currentTaskEditorRequest", sandbox);
  return { sandbox, read };
}

describe("Task editor request writer and mutable slot", () => {
  it("preserves seed identity, identifier precedence, opaque defaults, flags and inherited focus", () => {
    const { sandbox: f } = fixture();
    const task = { task_id: "seed", extension: Symbol("metadata") };
    const trigger = {}; const context = {}; const onSaved = () => {};
    const request = f.normalizeTaskEditorRequest({ mode: "copy", task, taskId: "ignored", context, onSaved, refresh: 7, focusNotes: 1, promptBlockedReason: true, defaults: { extension: task }, template_id: " t ", instance_date: " d " }, Object.create({ trigger }));
    assert.equal(request.task, task); assert.equal(request.taskId, "seed");
    assert.equal(request.context, context); assert.equal(request.defaults.extension, task);
    assert.equal(request.onSaved, onSaved); assert.equal(request.refresh, null);
    assert.equal(request.mode, "add"); assert.equal(request.duplicate, true);
    assert.equal(request.focusNotes, false); assert.equal(request.promptBlockedReason, true);
    assert.equal(request.returnFocusTo, trigger); assert.equal(request.needsStandaloneContext, true);
    assert.equal(request.templateId, "t"); assert.equal(request.instanceDate, "d");
    assert.equal(Object.hasOwn(request, "materializationRefreshPending"), false);
    for (const [input, expected] of [[{ taskId: "a", task_id: "b" }, "a"], [{ taskId: 0, task_id: "b", recordId: "c" }, "b"], [{ recordId: "c", id: "d" }, "c"], [{ id: 42 }, 42]])
      assert.equal(f.normalizeTaskEditorRequest(input).taskId, expected);
    assert.throws(() => f.normalizeTaskEditorRequest(null), { name: "TypeError" });
    assert.throws(() => f.normalizeTaskEditorRequest({ mode: "edit" }), /Task ID is required/);
  });

  it("retains short-circuit getter order and accepts boxed host/seed values without eager validation", () => {
    const { sandbox: f } = fixture();
    let reads = 0; const trigger = {};
    const host = Object.create({ get trigger() { reads++; return trigger; } });
    assert.equal(f.normalizeTaskEditorRequest({ mode: "add", returnFocusTo: trigger }, host).returnFocusTo, trigger);
    assert.equal(reads, 0);
    assert.equal(f.normalizeTaskEditorRequest({ mode: "add" }, host).returnFocusTo, trigger);
    assert.equal(reads, 1);
    vm.runInContext('Number.prototype.trigger = "number trigger"; Number.prototype.task_id = "number task";', f);
    assert.equal(f.normalizeTaskEditorRequest({ mode: "add", task: 7 }, 3).taskId, "number task");
    assert.equal(f.normalizeTaskEditorRequest({ mode: "add" }, 3).returnFocusTo, "number trigger");
    const failure = new Error("focus getter");
    assert.throws(() => f.normalizeTaskEditorRequest({ mode: "add" }, { get trigger() { throw failure; } }), (error) => error === failure);
    let callbacks = 0;
    const request = f.normalizeTaskEditorRequest({ get onSaved() { callbacks++; return callbacks === 1 ? () => {} : 7; } });
    assert.equal(request.onSaved, 7); assert.equal(callbacks, 2);
  });

  it("materializes once, preserves raw task writers, then refreshes with request receivers after close", async () => {
    /** @type {string[]} */ const calls = [];
    const materialized = { task: { task_id: "made", metadata: {} } };
    const detail = { task_id: "made", title: "fresh detail" };
    const { sandbox: f, read } = fixture({ requireApi: () => ({ postJson: async (/** @type {string} */ url, /** @type {unknown} */ body) => {
      calls.push("POST"); assert.equal(url, "/api/tasks/recurrence-instances/materialize");
      assert.equal(JSON.stringify(body), '{"instanceDate":"date","templateId":"template"}'); return materialized;
    } }) });
    f.prepareStandaloneContext = async (/** @type {{taskId: unknown}} */ input) => { calls.push("prepare"); assert.equal(input.taskId, "made"); assert.equal(read().task, materialized.task); return { task: detail }; };
    f.configure = () => calls.push("configure");
    f.open = async (/** @type {{task: unknown}} */ input) => { calls.push("open"); assert.equal(input.task, detail); assert.equal(read().materializationRefreshPending, true); return "cancelled"; };
    const result = await f.openTaskEditor({ mode: "edit", templateId: "template", instanceDate: "date",
      onSaved: function (/** @type {unknown} */ value) { assert.equal(this, read()); assert.equal(value, materialized); calls.push("saved"); },
      refresh: function (/** @type {unknown} */ value) { assert.equal(this, read()); assert.equal(value, materialized); calls.push("refresh"); },
    });
    assert.equal(result, "cancelled"); assert.deepEqual(calls, ["POST", "prepare", "configure", "open", "saved", "refresh"]);
  });

  it("save notification clears pending refresh and awaits unbound callbacks without duplicate materialization refresh", async () => {
    const { sandbox: f, read } = fixture({ requireApi: () => ({ postJson: async () => ({ task: { task_id: "made" } }) }) });
    f.prepareStandaloneContext = async () => ({}); f.configure = () => {};
    /** @type {unknown[]} */ const receivers = []; let saves = 0;
    const saved = { task: { task_id: "made" } };
    f.open = async () => { await f.notifyTaskEditorSaved(saved); assert.equal(read().materializationRefreshPending, false); return "complete"; };
    /** @this {unknown} */
    const onSaved = async function (/** @type {unknown} */ result) { receivers.push(this); assert.equal(result, saved); await Promise.resolve(); saves++; };
    assert.equal(await f.openTaskEditor({ templateId: "t", instanceDate: "d", onSaved }), "complete");
    assert.equal(saves, 1); assert.deepEqual(receivers, [undefined]);
  });

  it("keeps failed-request cleanup identity-sensitive and preserves ID coercion before the GET", async () => {
    const failure = new Error("read failed"); let gets = 0;
    const { sandbox: f, read } = fixture({ requireApi: () => ({ getJson: async (/** @type {string} */ url) => { gets++; assert.equal(url, "/api/tasks/id%20value"); throw failure; } }) });
    f.configure = () => {};
    const task = { task_id: { [Symbol.toPrimitive](/** @type {string} */ hint) { assert.equal(hint, "string"); return "id value"; } } };
    await assert.rejects(f.openTaskEditor({ task }), (error) => error === failure);
    assert.equal(gets, 1); assert.equal(read(), null);
    await assert.rejects(f.openTaskEditor({ task: { task_id: Symbol("id") } }), { name: "TypeError" });
    assert.equal(gets, 1); assert.equal(read(), null);
    f.open = async () => { f.replacement = f.normalizeTaskEditorRequest({ mode: "add" }); vm.runInContext("currentTaskEditorRequest = replacement", f); throw failure; };
    await assert.rejects(f.openTaskEditor({ mode: "add" }), (error) => error === failure);
    assert.equal(read(), f.replacement);
  });

  it("transitions a created request to edit without rebuilding its callbacks or opaque fields", async () => {
    const { sandbox: f, read } = fixture();
    for (const name of ["updateBlockTaskActionState", "writeTaskMetadataRibbon", "writeChecklistFields", "writeTaskTimerFields", "mountTaskFileAttachments", "mountTaskNotesPanel", "writeTaskNotificationFollowFields"]) f[name] = () => {};
    f.seed = f.normalizeTaskEditorRequest({ mode: "add", onSaved: () => {} });
    vm.runInContext("currentTaskEditorRequest = seed", f);
    const task = { task_id: "saved", extension: {} };
    await f.transitionCreatedTaskToEdit(task);
    assert.notEqual(read(), f.seed); assert.equal(read().mode, "edit"); assert.equal(read().task, task);
    assert.equal(read().taskId, "saved"); assert.equal(read().onSaved, f.seed.onSaved); assert.equal(read().defaults, f.seed.defaults);
    vm.runInContext("currentTaskEditorRequest = null", f);
    await f.transitionCreatedTaskToEdit(task); assert.equal(read(), null);
  });

  it("standalone preparation preserves task/timer references and status callback receiver, return and failure", async () => {
    let gets = 0;
    /** @type {string[]} */ const urls = [];
    const task = { task_id: "a" };
    /** @type {unknown[]} */ const timers = [];
    /** @type {unknown[]} */ const tags = [];
    const { sandbox: f } = fixture({ requireApi: () => ({ getJson: async (/** @type {string} */ url) => { gets++; urls.push(url); return { task, tasks: [task] }; } }), loadTaskTimers: async () => timers,
      loadTagOptions: async () => tags, requireTaskRecords: () => ({ readTaskTimers: (/** @type {unknown} */ value) => value }), readCurrentUserId: () => "user",
      isReadableJsonObject: (/** @type {unknown} */ value) => typeof value === "object" && value !== null, defaultTaskOptions: () => ({}),
    });
    const result = {}; const options = {}; const host = { setStatus(/** @type {unknown} */ message, /** @type {unknown} */ receivedOptions) { assert.equal(this, host); assert.equal(message, "message"); assert.equal(receivedOptions, options); return result; } };
    const prepared = await f.prepareStandaloneContext({ taskId: 42, hostContext: host });
    assert.equal(gets, 2); assert.equal(prepared.task, task); assert.equal(prepared.taskTimers, timers); assert.equal(prepared.tagOptions, tags);
    assert.deepEqual(urls, ["/api/tasks/42", "/api/tasks"]);
    await assert.rejects(f.prepareStandaloneContext({ taskId: Symbol("id") }), { name: "TypeError" });
    assert.equal(gets, 2);
    assert.equal(prepared.setStatus("message", options), result);
    for (const setStatus of [null, undefined]) assert.equal((await f.prepareStandaloneContext({ hostContext: { setStatus } })).setStatus("message"), undefined);
    for (const setStatus of [false, 0, "not callable", {}]) {
      const invalid = await f.prepareStandaloneContext({ hostContext: { setStatus } });
      assert.throws(() => invalid.setStatus("message"), { name: "TypeError" });
    }
    const failure = new Error("status"); Object.defineProperty(host, "setStatus", { value: () => { throw failure; } });
    assert.throws(() => prepared.setStatus("message"), (error) => error === failure);
  });
});
