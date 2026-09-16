import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/task-dialog.js");
/** @param {{sandbox?: Record<string, unknown>, [key: string]: unknown}} overrides */
function fixture(overrides = {}) {
  /** @type {unknown[]} */ const calls = [];
  const form = { dataset: { taskDialogBound: "true" }, addEventListener: (/** @type {string} */ event) => calls.push(event) };
  const control = (/** @type {string} */ name) => ({
    dataset: {},
    querySelector: (/** @type {string} */ selector) => { calls.push(`${name}:${selector}`); return selector === "[data-task-form]" ? form : null; },
    addEventListener: (/** @type {string} */ event) => calls.push(`${name}:${event}`),
  });
  const controls = { "[data-task-dialog]": control("editor"), "[data-task-recurrence-dialog]": control("recurrence"), "[data-task-tags-dialog]": control("tags"), "[data-task-files-dialog]": control("files"), ...overrides };
  const sandbox = vm.createContext({
    document: { querySelector: (/** @type {string} */ selector) => Object.entries(controls).find(([key]) => key === selector)?.[1], body: { append: () => {} } },
    dialog: null, recurrenceDialog: null, tagsDialog: null, filesDialog: null, form: null, fields: {},
    createTaskDialogElements: (/** @type {unknown} */ options) => { calls.push(options); return []; }, decorateTaskDialogControls: () => calls.push("decorate"),
    bindRecurrenceDialogEvents: () => calls.push("bind recurrence"),
    closeTaskTagsDialog: () => {}, closeTaskFilesDialog: () => {},
    handleTaskTagsDialogClose: () => {}, handleTaskFilesDialogClose: () => {},
    ...overrides.sandbox,
  });
  for (const name of ["taskProjectionFields", "optionalTaskProjectionFields", "callTaskContextCollection", "taskContextOptionItems", "requireTaskControl", "writeTaskControl", "requireTaskControlDataset", "taskDialogCloseReason", "focusTaskControl", "bindTaskUtilityDialogEvents", "ensureDialog", "openTaskTagsDialog", "populateFormOptions"])
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return { sandbox, calls, controls, form, run: (/** @type {string} */ expression) => vm.runInContext(expression, sandbox) };
}

describe("Task Dialog control readiness", () => {
  it("retains every queried field handle and its null or optional-absence answer", () => {
    const f = fixture();
    /** @type {Map<string, unknown>} */ const answers = new Map();
    for (const [shell, control] of Object.entries(f.controls)) {
      control.querySelector = (/** @type {string} */ selector) => {
        if (selector === "[data-task-form]") return f.form;
        const value = selector === "[data-task-title]" ? null : { shell, selector, addEventListener() {} };
        answers.set(`${shell}:${selector}`, value);
        return value;
      };
    }
    f.run("ensureDialog()");
    const acquired = f.sandbox.fields;
    assert.equal(Object.keys(acquired).length, 63);
    assert.equal(Object.keys(acquired.recurrence).length, 5);
    for (const value of [...Object.values(acquired).filter((entry) => entry !== acquired.recurrence), ...Object.values(acquired.recurrence)])
      assert.ok([...answers.values()].includes(value));
    assert.equal(acquired.titleInput, null);
    assert.equal(acquired.timerStart, answers.get("[data-task-dialog]:[data-task-timer-start]"));
    assert.equal(acquired.recurrence.form, answers.get("[data-task-recurrence-dialog]:[data-task-recurrence-form]"));
    const missing = fixture({ "[data-task-tags-dialog]": null, "[data-task-files-dialog]": null });
    missing.run("ensureDialog()");
    for (const name of ["tagContainer", "tagDialogClose", "fileContainer", "fileDialogClose"])
      assert.equal(missing.sandbox.fields[name], undefined);
  });
  it("evaluates the display value before a missing target fails, retaining setter receiver and errors", () => {
    const f = fixture();
    /** @type {string[]} */ const order = [];
    const timer = {};
    f.sandbox.readTaskTimerElapsedSeconds = (/** @type {unknown} */ value) => { assert.equal(value, timer); order.push("elapsed"); return 12; };
    f.sandbox.formatDuration = (/** @type {unknown} */ value) => { assert.equal(value, 12); order.push("format"); return "00:12"; };
    vm.runInContext(extractFunctionBlock(source, "updateTaskTimerDisplay"), f.sandbox);
    for (const missing of [null, undefined]) {
      f.sandbox.fields = { get timerDisplay() { order.push("target"); return missing; } };
      order.length = 0;
      assert.throws(() => f.sandbox.updateTaskTimerDisplay(timer), /Task dialog control is unavailable/);
      assert.deepEqual(order, ["target", "elapsed", "format"]);
    }
    const failure = new Error("setter failure");
    const display = Object.create({ set textContent(/** @type {unknown} */ value) {
      assert.equal(this, display); assert.equal(value, "00:12"); order.push("write"); throw failure;
    } });
    f.sandbox.fields = { timerDisplay: display };
    order.length = 0;
    assert.throws(() => f.sandbox.updateTaskTimerDisplay(timer), (error) => error === failure);
    assert.deepEqual(order, ["elapsed", "format", "write"]);
    const rhsFailure = new Error("format failure");
    f.sandbox.fields = { timerDisplay: null };
    f.sandbox.formatDuration = () => { throw rhsFailure; };
    assert.throws(() => f.sandbox.updateTaskTimerDisplay(timer), (error) => error === rhsFailure);
  });
  it("retains values and refuses missing required controls", () => {
    const { sandbox } = fixture();
    const value = {};
    assert.equal(sandbox.requireTaskControl(value), value);
    for (const missing of [null, undefined]) assert.throws(() => sandbox.requireTaskControl(missing), /control is unavailable/);
  });
  it("keeps optional acquisition optional and checks icon handles only at decoration", () => {
    const f = fixture();
    for (const name of ["requireTaskIconButton", "decorateTaskDialogControls"])
      vm.runInContext(extractFunctionBlock(source, name), f.sandbox);
    f.sandbox.namespace = {};
    assert.doesNotThrow(() => f.sandbox.decorateTaskDialogControls());
    f.sandbox.namespace.icons = { decorateButton() { throw new Error("unexpected decoration"); } };
    for (const missing of [null, undefined]) {
      f.sandbox.fields = { timerStart: missing };
      assert.throws(() => f.sandbox.decorateTaskDialogControls(), { name: "Error", message: "decorateButton requires a button element." });
    }
    const button = {};
    assert.equal(f.sandbox.requireTaskIconButton(button), button);
  });
  it("keeps inherited setters, frozen writes and undefined values on the original handle", () => {
    const f = fixture();
    /** @type {unknown[]} */ const values = [];
    const control = Object.create({ set value(/** @type {unknown} */ value) { assert.equal(this, control); values.push(value); } });
    for (const value of [undefined, null, 0, false, { opaque: true }])
      f.sandbox.writeTaskControl(control, "value", value);
    assert.deepEqual(values, [undefined, null, 0, false, { opaque: true }]);
    assert.doesNotThrow(() => f.sandbox.writeTaskControl(Object.freeze({ value: "fixed" }), "value", "ignored"));
  });
  it("keeps Files focus after modal display, including inherited SVG-style focus and absent matches", () => {
    const f = fixture();
    /** @type {string[]} */ const order = [];
    vm.runInContext(extractFunctionBlock(source, "openTaskFilesDialog"), f.sandbox);
    f.sandbox.fields = { fileToggle: { setAttribute() { order.push("expanded"); } } };
    f.sandbox.currentTaskId = "saved";
    f.sandbox.closeTaskTagsDialog = () => order.push("close tags");
    f.sandbox.showTaskModal = () => order.push("show files");
    const target = Object.create({ focus() { assert.equal(this, target); order.push("focus"); } });
    f.sandbox.filesDialog = { querySelector() { order.push("query"); return target; } };
    f.sandbox.openTaskFilesDialog();
    assert.deepEqual(order, ["close tags", "expanded", "show files", "query", "focus"]);
    f.sandbox.filesDialog.querySelector = () => null;
    assert.doesNotThrow(() => f.sandbox.openTaskFilesDialog());
    f.sandbox.filesDialog.querySelector = () => ({ focus: false });
    assert.throws(() => f.sandbox.openTaskFilesDialog(), /Task dialog control cannot receive focus/);
  });
  it("reads inherited dataset once and retains its identity and opaque members", () => {
    const { sandbox } = fixture();
    const dataset = { extension: { opaque: true } }; let reads = 0;
    const element = Object.create({ get dataset() { reads++; return dataset; } });
    assert.doesNotThrow(() => assert.equal(sandbox.requireTaskControlDataset(element), dataset)); assert.equal(reads, 1);
    for (const value of [[], () => {}]) assert.doesNotThrow(() => assert.equal(sandbox.requireTaskControlDataset({ dataset: value }), value));
    for (const value of [null, undefined, "", 7]) assert.throws(() => sandbox.requireTaskControlDataset({ dataset: value }), /dataset is unavailable/);
    assert.throws(() => sandbox.requireTaskControlDataset(null), /control is unavailable/);
  });
  it("builds missing shells before the main dialog dereference still fails", () => {
    const f = fixture({ "[data-task-dialog]": null });
    assert.throws(() => f.run("ensureDialog()"), /control is unavailable/);
    assert.equal(f.calls.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])), { includeEditor: true, includeFiles: false, includeRecurrence: false, includeTags: false });
  });
  it("acquires editor fields before missing recurrence still fails", () => {
    const f = fixture({ "[data-task-recurrence-dialog]": null });
    assert.throws(() => f.run("ensureDialog()"), /control is unavailable/);
    assert.ok(f.calls.includes("editor:[data-task-workbench-open]"));
    assert.ok(!f.calls.includes("decorate"));
  });
  it("binds child dialogs before a missing form still fails", () => {
    const f = fixture(); f.controls["[data-task-dialog]"].querySelector = () => null;
    assert.throws(() => f.run("ensureDialog()"), /control is unavailable/);
    assert.ok(f.calls.includes("bind recurrence")); assert.ok(f.calls.includes("tags:close")); assert.ok(f.calls.includes("files:close"));
  });
  it("keeps absent optional utility shells tolerated and registers each present child once", () => {
    const absent = fixture({ "[data-task-tags-dialog]": null, "[data-task-files-dialog]": null });
    absent.run("ensureDialog()"); assert.deepEqual(JSON.parse(JSON.stringify(absent.calls[0])), { includeEditor: false, includeFiles: true, includeRecurrence: false, includeTags: true });
    const f = fixture(); f.run("ensureDialog(); ensureDialog()");
    assert.equal(f.calls.filter((item) => item === "tags:close").length, 1);
    assert.equal(f.calls.filter((item) => item === "files:close").length, 1);
  });
  it("keeps inherited duck-typed focus and its receiver, absent no-op and invalid-call refusal", () => {
    const { sandbox } = fixture(); let receiver; let count = 0;
    const element = Object.create({ focus() { receiver = this; count++; } });
    assert.doesNotThrow(() => sandbox.focusTaskControl(element)); assert.equal(receiver, element); assert.equal(count, 1);
    sandbox.focusTaskControl(null); sandbox.focusTaskControl(undefined); assert.equal(count, 1);
    for (const value of [{}, { focus: null }, { focus: true }]) assert.throws(() => sandbox.focusTaskControl(value), /cannot receive focus/);
  });
  it("focuses only after showing Tags, preserving optional absence and invalid focus failure timing", () => {
    const f = fixture({ sandbox: { fields: {}, showTaskModal: () => f.calls.push("show") } });
    f.sandbox.tagsDialog = { querySelector: () => ({ focus: () => f.calls.push("focus") }) };
    f.run("openTaskTagsDialog()"); assert.deepEqual(f.calls, ["show", "focus"]);
    f.sandbox.tagsDialog.querySelector = () => ({}); f.calls.length = 0;
    assert.throws(() => f.run("openTaskTagsDialog()"), /cannot receive focus/); assert.deepEqual(f.calls, ["show"]);
  });
  it("writes visibility through inherited setters and plain element expandos before building options", () => {
    for (const business of [true, false]) {
      /** @type {unknown[]} */ const writes = []; const plain = {}; const frozen = Object.freeze({});
      const inherited = Object.create({ set hidden(/** @type {unknown} */ value) { writes.push(value); } });
      const stop = new Error("option boundary");
      const f = fixture({ sandbox: {
        dialog: { querySelectorAll: () => [inherited, plain, frozen] }, form: {}, context: null,
        defaultTaskOptions: () => ({}), usesClientScope: () => business,
        option: () => ({}), workspaceProjectsLabel: () => "Workspace", replaceOptions: () => { throw stop; },
      } });
      assert.throws(() => f.run("populateFormOptions()"), (error) => error === stop);
      assert.deepEqual(writes, [!business]); assert.deepEqual(plain, { hidden: !business });
    }
  });
  it("retains native and inherited close text, missing and falsy defaults, and rejects a non-text close result", () => {
    const { sandbox } = fixture();
    for (const value of [undefined, null, "", false, 0, NaN]) assert.equal(sandbox.taskDialogCloseReason({ returnValue: value }), "closed");
    assert.equal(sandbox.taskDialogCloseReason({}), "closed");
    assert.equal(sandbox.taskDialogCloseReason(Object.create({ returnValue: "cancel" })), "cancel");
    assert.throws(() => sandbox.taskDialogCloseReason(null), /control is unavailable/);
    for (const value of [true, 3, {}, []]) assert.throws(() => sandbox.taskDialogCloseReason({ returnValue: value }), /close reason must be text/);
  });
});

/**
 * A controlled non-native host: unlike HTMLDialogElement's native setter, its
 * returnValue retains the supplied value. Only opening dependencies are stubbed;
 * the entire real open() and its registered close listener execute.
 * @param {unknown} reason
 * @param {Record<string, unknown>} [input]
 * @param {(sandbox: import("node:vm").Context) => void} [inspect]
 */
async function openedHost(reason, input = {}, inspect = () => {}) {
  /** @type {string[]} */ const calls = [];
  /** @type {{callback: () => void, once: boolean} | undefined} */ let listener;
  const host = {
    get returnValue() {
      assert.equal(sandbox.fileAttachmentsController, null);
      assert.equal(sandbox.notesPanelController, null);
      assert.equal(sandbox.currentTaskEditorRequest, null);
      calls.push("read reason"); return reason;
    },
    /** @param {string} event @param {() => void} callback @param {{once?: boolean}} options */
    addEventListener(event, callback, options) {
      assert.equal(event, "close"); assert.equal(options.once, true);
      listener = { callback, once: options.once === true };
    },
    close() {
      const registered = listener;
      if (!registered) return;
      if (registered.once) listener = undefined;
      registered.callback();
    },
  };
  const trigger = {};
  const sandbox = vm.createContext({
    dialog: host,
    fields: Object.fromEntries(["title", "copyLink", "workbenchOpen", "titleInput", "status", "priority", "estimate", "client", "dueDate", "dueTime", "nextAction", "blockedReason", "resumeNote", "description", "taskDetailsPanel"].map((name) => [name, {}])),
    context: { onSaved: () => calls.push("saved callback") }, currentTaskEditorRequest: { mode: "add" },
    fileAttachmentsController: { destroy: () => calls.push("destroy Files") },
    notesPanelController: { destroy: () => calls.push("destroy Notes") },
    taskDefaultStatuses: () => ["open"], taskDefaultPriorities: () => ["normal"], currentUserId: () => "user",
    taskFormSnapshot: () => "snapshot", closeTaskUtilityDialogs: () => calls.push("close utilities"),
    clearTaskTimerInterval: () => calls.push("dispose timer"),
    restoreTaskEditorFocus: (/** @type {unknown} */ target) => { assert.equal(target, trigger); calls.push("restore focus"); },
    requireApi: () => { throw new Error("close must not write or materialize"); },
  });
  for (const name of ["ensureDialog", "ensureClientOption", "populateProjectInput", "syncClientFromSelectedProject", "applySelectedProjectTaskDefaults", "updateBlockedReasonState", "writeParentTaskFields", "writeTaskCompletionFields", "writeTaskMetadataRibbon", "writeChecklistFields", "selectAssignees", "writeRecurrenceFields", "writeRecurrenceContinuity", "writeRecurrenceRecovery", "writeReminderFields", "writeTaskTimerFields", "mountTaskTagPicker", "mountTaskFileAttachments", "mountTaskNotesPanel", "writeTaskNotificationFollowFields", "updateCompleteTaskActionState", "updateBlockTaskActionState", "showTaskModal", "focusTaskEditorTarget"])
    sandbox[name] = () => {};
  for (const name of ["taskProjectionFields", "optionalTaskProjectionFields", "requireTaskControl", "writeTaskControl", "taskDialogCloseReason", "open"])
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  sandbox.selectAssignees = (/** @type {unknown} */ value) => { sandbox.selectedAssignees = value; };
  /** @type {Promise<{status: string, value?: unknown, error?: unknown}>} */
  const outcome = sandbox.open({ ...input, returnFocusTo: trigger, hostContext: {
    complete: () => calls.push("host complete"), cancel: () => calls.push("host cancel"),
  } }).then(
    (/** @type {unknown} */ value) => ({ status: "fulfilled", value }),
    (/** @type {unknown} */ error) => ({ status: "rejected", error }),
  );
  for (let turn = 0; turn < 20 && !listener; turn++) await Promise.resolve();
  assert.ok(listener, "open must install its close listener after initialization");
  inspect(sandbox);
  calls.length = 0;
  assert.doesNotThrow(() => host.close(), "validation failure must not escape the event listener");
  /** @type {ReturnType<typeof setTimeout> | undefined} */ let timer;
  try {
    /** @type {Promise<never>} */ const deadline = new Promise((_, reject) => {
      timer = globalThis.setTimeout(() => reject(new assert.AssertionError({ message: "open stayed pending after close" })), 1000);
    });
    const settled = await Promise.race([outcome, deadline]);
    assert.deepEqual(calls, ["close utilities", "dispose timer", "destroy Files", "destroy Notes", "restore focus", "read reason"]);
    assert.equal(sandbox.fileAttachmentsController, null);
    assert.equal(sandbox.notesPanelController, null);
    assert.equal(sandbox.currentTaskEditorRequest, null);
    host.close();
    assert.equal(calls.length, 6, "a repeated close must not repeat cleanup or host callbacks");
    return settled;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

describe("Task Dialog open promise close path", () => {
  it("passes familiar, unfamiliar and whitespace-only strings through unchanged after cleanup", async () => {
    for (const value of ["cancel", "complete", "saved", "extension:custom-result", "  untouched  ", " ", "\n"])
      assert.deepEqual(await openedHost(value), { status: "fulfilled", value });
  });
  it("preserves all ordinary falsy close defaults through the returned promise", async () => {
    for (const value of [undefined, null, "", false, 0, -0, 0n, NaN])
      assert.deepEqual(await openedHost(value), { status: "fulfilled", value: "closed" });
  });
  it("rejects truthy non-string host results promptly after cleanup without replay or callbacks", async () => {
    for (const value of [true, 1, -1, 1n, Symbol("close"), {}, [], () => {}, Object("saved")]) {
      const result = await openedHost(value);
      assert.equal(result.status, "rejected");
      assert.match(String(result.error), /TypeError: Task dialog close reason must be text/);
      assert.equal(Object.hasOwn(result, "value"), false);
    }
  });
});

// Execute the actual opening consumer as well as the unchanged close listener.
describe("Task request forwarding into the low-level editor", () => {
  it("preserves default getter reads and inherited seed assignees without changing the published record", async () => {
    let statusReads = 0; let priorityReads = 0; let assigneeReads = 0;
    const defaults = { get status() { statusReads++; return "open"; }, get priority() { priorityReads++; return "normal"; } };
    const assignees = ["selected"];
    const task = Object.create({ get assignee_ids() { assigneeReads++; return assignees; } });
    await openedHost("cancel", { task, defaults }, (sandbox) => {
      assert.equal(sandbox.selectedAssignees, assignees);
      assert.equal(sandbox.fields.status.value, "open"); assert.equal(sandbox.fields.priority.value, "normal");
    });
    assert.equal(statusReads, 2); assert.equal(priorityReads, 2); assert.equal(assigneeReads, 1);
    await openedHost("cancel", { task: { assignees: [{ user_id: "published" }] } }, (sandbox) => {
      assert.deepEqual(Array.from(sandbox.selectedAssignees), [], "do not silently change the existing assignee_ids read to another field");
    });
    await openedHost("cancel", {}, (sandbox) => { assert.deepEqual(Array.from(sandbox.selectedAssignees), ["user"]); });
    const repository = createProjectTextReader().readText("src/modules/tasks/tasks.repo.js");
    const producer = vm.createContext({});
    for (const name of ["assigneeRowToAppValue", "attachAssignees"])
      vm.runInContext(extractFunctionBlock(repository, name), producer);
    const [produced] = producer.attachAssignees([{ task_id: "task" }], [{ task_id: "task", user_id: "actual assignee" }]);
    assert.deepEqual(Array.from(produced.assignee_ids), ["actual assignee"], "the real producer emits the member omitted by the shared declaration");
    await openedHost("cancel", { task: produced }, (sandbox) => { assert.equal(sandbox.selectedAssignees, produced.assignee_ids); });
  });
});
