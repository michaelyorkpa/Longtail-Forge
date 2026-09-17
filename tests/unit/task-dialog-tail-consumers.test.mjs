import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/task-dialog.js");
/** @param {Record<string, unknown>} [overrides] */
function fixture(overrides = {}) {
  /** @type {unknown[][]} */ const calls = [];
  const s = vm.createContext({
    fields: {}, context: { options: { workspaceType: "business" } }, currentTaskId: "task", currentTask: null,
    namespace: {}, fileAttachmentsController: null, notesPanelController: null,
    setStatus: (/** @type {unknown[]} */ ...args) => calls.push(["status", ...args]),
    requireApi: () => ({ postJson: async (/** @type {unknown[]} */ ...args) => { calls.push(["post", ...args]); return {}; } }),
    applyChecklistResult: (/** @type {unknown} */ result) => calls.push(["apply", result]),
    requireErrors: () => ({ caughtMessage: (/** @type {unknown} */ _error, /** @type {string} */ fallback) => fallback }),
    updateCompleteTaskActionState() {}, updateBlockTaskActionState() {},
    ...overrides,
  });
  for (const name of ["taskProjectionFields", "optionalTaskProjectionFields", "requireTaskControl", "writeTaskControl", "callTaskContextCollection", "taskContextOptionItems", "defaultTaskOptions", "usesClientScope", "normalizeTaskEditorFocusTarget", "focusTaskEditorTarget", "restoreTaskEditorFocus", "clientFallbackLabel", "projectFallbackLabel", "taskFormSnapshot", "optionLabel", "displayUser", "optionListHasValue", "replaceOptions", "selectAssignees", "handleChecklistClick", "handleChecklistListKeydown", "handleChecklistChange", "syncTaskStatusField", "writeRecurrenceRecovery", "hasCompletedTaskMetrics", "createMetadataBadge", "mountTaskNotesPanel", "readTaskTimerIneligibleReason", "rememberTaskInContext"])
    vm.runInContext(extractFunctionBlock(source, name), s);
  return { s, calls };
}
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));

describe("Task Dialog tail consumer semantics", () => {
  it("records that the raw timer writer retains a sparse value rejected by the real timer reader", () => {
    const { s } = fixture({ window: {}, taskTimers: [] });
    vm.runInContext(createProjectTextReader().readText("public/js/shared/task-records.js"), s);
    for (const name of ["upsertTaskTimer", "currentTaskTimer"])
      vm.runInContext(extractFunctionBlock(source, name), s);
    const timer = { task_id: "task", timer_status: "paused" };
    assert.equal(s.window.LongtailForge.taskRecords.readTaskTimer({ timer }), null);
    s.upsertTaskTimer(timer);
    assert.equal(s.currentTaskTimer("task"), timer);
    assert.equal(s.context.taskTimers[0], timer);
  });

  it("records the raw refreshed-task writer without replacing it with the detail reader", async () => {
    let carried;
    const { s } = fixture({ window: {}, document: { activeElement: null }, currentTaskEditorRequest: null,
      configure() {}, requireApi: () => ({ getJson: async () => ({ task: 7 }) }),
      open: async (/** @type {{task: unknown}} */ options) => { carried = options.task; return "cancel"; },
    });
    vm.runInContext(createProjectTextReader().readText("public/js/shared/task-records.js"), s);
    for (const name of ["normalizeTaskEditorMode", "normalizeTaskEditorDefaults", "normalizeTaskEditorRequest", "openTaskEditor"])
      vm.runInContext(extractFunctionBlock(source, name), s);
    assert.equal(s.window.LongtailForge.taskRecords.readTaskDetail({ task: 7 }), null);
    assert.equal(await s.openTaskEditor({ mode: "edit", task: { task_id: "task" } }), "cancel");
    assert.equal(carried, 7);
  });

  it("records that selected fallback ids are not consumed by either label helper", () => {
    const { s } = fixture();
    const id = { toString() { throw new Error("id must not become a label"); } };
    assert.equal(s.clientFallbackLabel(null, id), "Unavailable client");
    assert.equal(s.projectFallbackLabel(null, id), "Unavailable project");
    const task = Object.create({ clientName: "Client", projectName: "Project" });
    assert.equal(s.clientFallbackLabel(task, id), "Client");
    assert.equal(s.projectFallbackLabel(task, id), "Project - Client");
    s.context.options.workspaceType = "personal";
    assert.equal(s.projectFallbackLabel(task, id), "Project");
  });

  it("records parseInt's existing numeric ToString behavior, including exponential notation", () => {
    const { s } = fixture();
    for (const [interval, expected] of [[2.9, 2], [1e21, 1], [1e-7, 1], [-2.9, -2], [0, 1], [NaN, 1]]) {
      const result = s.taskFormSnapshot({ recurrence: { interval } });
      assert.equal(JSON.parse(result.all).recurrence.interval, expected);
      assert.equal(JSON.parse(result.recurrenceTemplate).recurrence.interval, expected);
    }
  });

  it("derives every focus destination from the real tables, opens before scrolling/focus and keeps fallbacks", () => {
    const { s } = fixture();
    /** @type {string[]} */ const calls = [];
    const control = (/** @type {string} */ name) => ({ scrollIntoView() { calls.push(`scroll ${name}`); }, focus() { calls.push(`focus ${name}`); } });
    const panel = { set open(/** @type {boolean} */ value) { assert.equal(value, true); calls.push("open"); } };
    s.fields = { titleInput: control("title"), assignees: control("assignees"), blockedReason: control("blocked"), dueDate: control("date"), dueTime: control("time"), nextAction: control("next"), recurring: control("recurrence"), recurrenceDetails: control("details"), timerStart: control("timer"), taskDetailsPanel: panel, recurrenceField: panel, timerField: panel, notesPanel: control("notes") };
    for (const [input, target] of [["assignees", "assignees"], ["blocked_reason", "blocked"], ["due_date", "date"], ["due_time", "time"], ["next_action", "next"], ["recurrence", "recurrence"], ["timer", "timer"]]) {
      calls.length = 0; s.focusTaskEditorTarget(input);
      assert.deepEqual(calls, ["open", `scroll ${target}`, `focus ${target}`]);
    }
    s.fields.recurring = null; calls.length = 0; s.focusTaskEditorTarget("recurrence");
    assert.deepEqual(calls, ["open", "scroll details", "focus details"]);
    for (const input of ["toString", "__proto__", "unknown", null]) {
      calls.length = 0; s.focusTaskEditorTarget(input); assert.deepEqual(calls, ["scroll title", "focus title"]);
    }
    calls.length = 0; s.focusTaskEditorTarget("notes"); assert.deepEqual(calls, ["scroll notes", "focus title"]);
  });

  it("retains return-focus receiver and a second changing-getter failure", () => {
    const { s } = fixture(); let reads = 0; let called = false;
    const target = { isConnected: true, get focus() { reads++; return /** @this {unknown} */ function () { assert.equal(this, target); called = true; }; } };
    s.restoreTaskEditorFocus(target); assert.equal(reads, 2); assert.equal(called, true);
    reads = 0; Object.defineProperty(target, "focus", { get() { return ++reads === 1 ? () => {} : 7; } });
    assert.throws(() => s.restoreTaskEditorFocus(target), { name: "TypeError" });
    s.restoreTaskEditorFocus({ isConnected: false, get focus() { throw new Error("unused"); } });
    s.restoreTaskEditorFocus({ isConnected: true, focus: 7 });
  });

  it("keeps inherited option/user labels, opaque returned values and nullable membership rows", () => {
    const { s } = fixture(); const opaque = {};
    assert.equal(s.optionLabel(Object.create({ optionLabel: opaque })), opaque);
    assert.equal(s.optionLabel(null), "");
    assert.equal(s.displayUser(Object.create({ display_name: " Person ", email: " mail " })), "Person (mail)");
    assert.throws(() => s.displayUser(null), { name: "TypeError" });
    assert.equal(s.optionListHasValue([{ value: opaque }], opaque), true);
    assert.equal(s.optionListHasValue([{ value: "2" }], 2), false);
    assert.throws(() => s.optionListHasValue([null], "x"), { name: "TypeError" });
  });

  it("preserves option replacement method/iteration ordering and selection identity", () => {
    const { s } = fixture();
    /** @type {string[]} */ const order = [];
    const value = {}; const row = { value, selected: false };
    const select = {
      selectedOptions: new Set([{ value }]), multiple: true, options: [row, { value: "other", selected: true }],
      get replaceChildren() { order.push("method"); return /** @this {unknown} */ function (/** @type {unknown[]} */ ...args) { assert.equal(this, select); assert.deepEqual(args, [row]); order.push("replace"); }; },
    };
    const options = { *[Symbol.iterator]() { order.push("iterate"); yield row; } };
    s.replaceOptions(select, options);
    assert.deepEqual(order, ["method", "iterate", "replace"]);
    assert.equal(row.selected, true); assert.equal(select.options[1].selected, false);
    s.replaceOptions(null, { get [Symbol.iterator]() { throw new Error("unused"); } });
  });

  it("keeps nullish empty assignees, iterable values and native identity membership", () => {
    const { s } = fixture(); const id = {}; const options = [{ value: id, selected: false }, { value: "x", selected: true }];
    s.fields.assignees = { options };
    s.selectAssignees(new Set([id])); assert.equal(options[0].selected, true); assert.equal(options[1].selected, false);
    s.selectAssignees(null); assert.equal(options[0].selected, false);
    s.selectAssignees("x"); assert.equal(options[1].selected, true);
    assert.throws(() => s.selectAssignees({ length: 1 }), { name: "TypeError" });
  });

  it("preserves checklist target/closest receivers and ignores missing actions without new element restrictions", async () => {
    const { s, calls } = fixture(); const row = { dataset: { taskChecklistItem: "i" } };
    const button = { dataset: { taskChecklistAction: "save" }, closest(/** @type {string} */ selector) { assert.equal(this, button); assert.equal(selector, "[data-task-checklist-item]"); return row; } };
    const target = { closest(/** @type {string} */ selector) { assert.equal(this, target); assert.equal(selector, "[data-task-checklist-action]"); return button; } };
    s.saveChecklistItemLabel = (/** @type {unknown} */ actual, /** @type {unknown} */ id) => { assert.equal(actual, row); assert.equal(id, "i"); calls.push(["save"]); };
    await s.handleChecklistClick({ target }); assert.deepEqual(calls, [["save"]]);
    calls.length = 0; button.dataset.taskChecklistAction = "unknown"; await s.handleChecklistClick({ target }); assert.equal(calls.length, 0);
    await assert.rejects(s.handleChecklistClick({ target: null }), { name: "TypeError" });
    await s.handleChecklistClick({ target: { closest: () => null } });
  });

  it("keeps checklist keyboard short-circuit order and composition suppression", async () => {
    const { s, calls } = fixture(); const row = { dataset: { taskChecklistItem: "i" } }; const input = { closest: () => row };
    s.saveChecklistItemLabel = () => calls.push(["save"]);
    const event = { target: { closest: () => input }, key: "Enter", isComposing: true, preventDefault: () => calls.push(["prevent"]) };
    await s.handleChecklistListKeydown(event); assert.equal(calls.length, 0);
    event.isComposing = false; await s.handleChecklistListKeydown(event); assert.deepEqual(calls, [["prevent"], ["save"]]);
    await assert.rejects(s.handleChecklistListKeydown({ ...event, key: "Escape", target: null }), { name: "TypeError" });
  });

  it("keeps independent checkbox reads and rollback at the failed write", async () => {
    const { s, calls } = fixture(); let reads = 0; let rollback;
    const checkbox = { closest: () => ({ dataset: { taskChecklistItem: "i" } }), get checked() { return ++reads !== 2; }, set checked(value) { rollback = value; } };
    s.requireApi = () => ({ postJson: async (/** @type {unknown} */ url) => { calls.push(["post", url]); throw new Error("offline"); } });
    await s.handleChecklistChange({ target: { closest: () => checkbox } });
    assert.equal(reads, 3); assert.equal(rollback, false);
    assert.deepEqual(plain(calls), [["status", "Unchecking item..."], ["post", "/api/tasks/task/checklist/i/check"], ["status", "Checklist item was not updated.", { isError: true }]]);
  });

  it("keeps recovery/metrics truthiness and the badge producer's values", () => {
    const { s } = fixture(); s.fields = { recurrenceSkipCurrent: {}, status: { value: "complete" } };
    s.writeRecurrenceRecovery(Object.create({ available: 1, blockedByActiveTimer: "yes" }));
    assert.equal(s.fields.recurrenceSkipCurrent.hidden, false); assert.equal(s.fields.recurrenceSkipCurrent.disabled, false);
    assert.match(s.fields.recurrenceSkipCurrent.title, /Stop or save/);
    assert.equal(s.hasCompletedTaskMetrics({ status: "complete", completionMetrics: Object.create({ completed_at: "today" }) }), true);
    assert.equal(s.hasCompletedTaskMetrics({ status: "open", completed_at: "today" }), false);
    const badge = s.createMetadataBadge({ label: "Due", value: 3 }); assert.equal(badge.value, 3); assert.equal(badge.title, "Due: 3");
  });

  it("keeps notification owner lookup, method ordering and raw task-id identity", async () => {
    const { s } = fixture();
    vm.runInContext(extractFunctionBlock(source, "writeTaskNotificationFollowFields"), s);
    /** @type {string[]} */ const order = [];
    const id = {}; const target = {}; let ownerReads = 0;
    const statusOwner = { get readStatus() { order.push("readStatus getter"); return /** @this {unknown} */ async function (/** @type {unknown} */ actual) {
      assert.equal(this, statusOwner); assert.equal(actual, target); order.push("readStatus call"); return { isFollowing: true };
    }; } };
    const targetOwner = { get taskTarget() { order.push("taskTarget getter"); return /** @this {unknown} */ function (/** @type {unknown} */ actual) {
      assert.equal(this, targetOwner); assert.equal(actual, id); order.push("taskTarget call"); return target;
    }; } };
    s.fields.notificationToggle = { setAttribute() {} };
    s.writeNotificationFollowState = (/** @type {boolean} */ value) => order.push(`state ${value}`);
    Object.defineProperty(s.namespace, "notificationSubscriptions", { get() { ownerReads++; order.push(`owner ${ownerReads}`); return ownerReads === 4 ? targetOwner : statusOwner; } });
    await s.writeTaskNotificationFollowFields({ task_id: id });
    assert.deepEqual(order, ["owner 1", "state false", "owner 2", "owner 3", "readStatus getter", "owner 4", "taskTarget getter", "taskTarget call", "readStatus call", "state true"]);
  });

  it("keeps module-action objects and their actual host/parameter forwards", async () => {
    /** @type {Record<string, unknown>[]} */ const actions = [];
    /** @type {[Record<string, unknown>, unknown][]} */ const observed = [];
    const s = vm.createContext({ namespace: { moduleActions: { register(/** @type {Record<string, unknown>} */ value) { actions.push(value); } } }, openTaskEditor: (/** @type {Record<string, unknown>} */ params, /** @type {unknown} */ host) => { observed.push([params, host]); return "result"; } });
    const start = source.indexOf("  const addTaskAction = {"); const end = source.indexOf("  global.LongtailForge = namespace;", start);
    assert.ok(start > 0 && end > start); vm.runInContext(source.slice(start, end), s);
    const host = {}; const params = { taskId: "t", mode: "ignored", extra: {} };
    for (const action of actions) {
      assert.ok(typeof action.open === "function");
      assert.equal(await Reflect.apply(action.open, action, [params, host]), "result");
    }
    assert.equal(observed[0][0].mode, "add"); assert.equal(observed[1][0].mode, "edit");
    assert.equal(observed[0][0].extra, params.extra); assert.equal(observed[1][1], host);
  });
});
