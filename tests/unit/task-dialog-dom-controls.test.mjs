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
  for (const name of ["requireTaskControl", "requireTaskControlDataset", "taskDialogCloseReason", "focusTaskControl", "bindTaskUtilityDialogEvents", "ensureDialog", "openTaskTagsDialog", "populateFormOptions"])
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return { sandbox, calls, controls, form, run: (/** @type {string} */ expression) => vm.runInContext(expression, sandbox) };
}

describe("Task Dialog control readiness", () => {
  it("retains values and refuses missing required controls", () => {
    const { sandbox } = fixture();
    const value = {};
    assert.equal(sandbox.requireTaskControl(value), value);
    for (const missing of [null, undefined]) assert.throws(() => sandbox.requireTaskControl(missing), /control is unavailable/);
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
