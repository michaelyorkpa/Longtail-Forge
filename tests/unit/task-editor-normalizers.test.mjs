import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const reader = createProjectTextReader();
const source = reader.readText("public/js/task-dialog.js");
function fixture() {
  /** @type {string[]} */ const calls = [];
  const control = (/** @type {string} */ name) => ({ focus: () => calls.push(name), scrollIntoView: () => {} });
  const fields = { titleInput: control("title"), nextAction: control("next"), dueDate: control("date"), notesPanel: control("notes"), taskDetailsPanel: { open: false } };
  const sandbox = vm.createContext({ fields, context: null, document: { activeElement: null } });
  for (const name of ["taskProjectionFields", "optionalTaskProjectionFields", "normalizeTaskEditorMode", "normalizeTaskEditorFocusTarget", "normalizeTaskEditorDefaults", "normalizeTaskEditorRequest", "focusTaskEditorTarget"])
    vm.runInContext(extractFunctionBlock(source, name), sandbox);
  return { calls, fields, sandbox, ...vm.runInContext("({mode:normalizeTaskEditorMode,defaults:normalizeTaskEditorDefaults,focus:normalizeTaskEditorFocusTarget,request:normalizeTaskEditorRequest,applyFocus:focusTaskEditorTarget})", sandbox) };
}
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));

describe("Task editor input normalizers", () => {
  it("keeps explicit mode precedence, aliases, case and deliberate non-trimming", () => {
    const { mode } = fixture();
    for (const [answer, aliases] of [["add", ["add", "CREATE", "new"]], ["edit", ["edit", "UPDATE"]], ["duplicate", ["duplicate", "COPY"]]])
      for (const alias of aliases) assert.equal(mode({ mode: alias, action: "edit", duplicate: true }), answer);
    assert.equal(mode({ mode: "", action: "COPY" }), "duplicate");
    assert.equal(mode({ mode: " create ", action: "edit", taskId: "saved" }), "edit");
    assert.equal(mode({ mode: "unknown", duplicate: true }), "duplicate");
    assert.equal(mode({ duplicate: "true" }), "add");
    assert.equal(mode({ mode: { toString: () => "EDIT" } }), "edit");
  });
  it("keeps all truthy identity fallbacks and inherited host inputs", () => {
    const { mode } = fixture();
    assert.equal(mode(), "add");
    for (const key of ["task", "taskId", "task_id", "recordId", "id"]) {
      assert.equal(mode({ [key]: [] }), "edit");
      for (const value of [null, undefined, false, 0, ""]) assert.equal(mode({ [key]: value }), "add");
    }
    assert.equal(mode(Object.create({ action: "copy" })), "duplicate");
    assert.throws(() => mode(null), /null/);
  });
  it("preserves precedence for every current defaults key, including null and empty overrides", () => {
    const { defaults } = fixture();
    const keys = ["blockedReason", "blocked_reason", "clientId", "client_id", "description", "dueDate", "due_date", "dueTime", "due_time", "estimateMinutes", "estimate_minutes", "nextAction", "next_action", "priority", "projectId", "project_id", "resumeNote", "resume_note", "status", "title"];
    for (const key of keys) {
      const context = { defaults: { [key]: "context nested" }, [key]: "context flat" };
      const input = { context, defaults: { [key]: "params nested" } };
      assert.equal(defaults(input)[key], "context flat");
      for (const value of [null, false, 0, "", "top", { opaque: true }]) assert.equal(defaults({ ...input, [key]: value })[key], value);
      assert.equal(defaults({ ...input, [key]: undefined })[key], "context flat");
      assert.equal(defaults({ context: { defaults: context.defaults }, defaults: input.defaults })[key], "params nested");
    }
  });
  it("preserves opaque spread metadata, symbols, getters and source identity without mutation", () => {
    const { defaults } = fixture();
    const symbol = Symbol("extension"), nested = { retained: true };
    let reads = 0;
    const sourceDefaults = { extra: nested, [symbol]: nested, get title() { reads++; return "copied"; } };
    Object.defineProperty(sourceDefaults, "hidden", { value: "not enumerable" });
    const context = Object.create({ priority: "high" }); context.defaults = sourceDefaults;
    const result = defaults({ sourceContext: context, defaults: { title: "override", another: nested } });
    assert.equal(result.extra, nested); assert.equal(result.another, nested); assert.equal(result[symbol], nested);
    assert.equal(result.priority, "high"); assert.equal(result.title, "override"); assert.equal(reads, 1);
    assert.equal(Object.hasOwn(result, "hidden"), false); assert.equal(Object.hasOwn(sourceDefaults, "another"), false);
    const getterInput = { get title() { reads++; return "twice"; } };
    reads = 0; assert.equal(defaults(getterInput).title, "twice"); assert.equal(reads, 2);
    const failure = new Error("getter failed");
    assert.throws(() => defaults({ defaults: { get title() { throw failure; } } }), (error) => error === failure);
  });
  it("keeps context selection and primitive spread boxing", () => {
    const { defaults } = fixture();
    assert.deepEqual(plain(defaults()), {});
    assert.deepEqual(plain(defaults({ context: {}, sourceContext: { title: "ignored" } })), {});
    assert.equal(defaults({ context: false, sourceContext: { title: "used" } }).title, "used");
    assert.deepEqual(plain(defaults({ context: 42, defaults: "abc" })), { 0: "a", 1: "b", 2: "c" });
    assert.deepEqual(plain(defaults({ context: { defaults: "ab" }, defaults: ["X"] })), { 0: "X", 1: "b" });
    assert.equal(defaults(Object.create({ defaults: { title: "inherited host" } })).title, "inherited host");
    assert.throws(() => defaults(null), /null/);
  });
  it("normalizes declared focus aliases, coercion and unknown inputs", () => {
    const { focus } = fixture();
    for (const [answer, aliases] of [["assignees", ["assign", "assignee", "assignees"]], ["blocked_reason", ["block", "blocked", "blocked_reason", "blockedreason"]], ["due_date", ["due", "due_date", "duedate"]], ["due_time", ["due_time", "duetime"]], ["next_action", ["next", "next_action", "nextaction"]], ["notes", ["notes"]], ["recurrence", ["recurrence", "recurring"]], ["timer", ["timer"]]])
      for (const alias of aliases) assert.equal(focus(`  ${alias.toUpperCase().replaceAll("_", "-")}  `), answer);
    for (const value of [undefined, null, false, 0, "", "unknown", "constructor", "__proto__", "toString"]) assert.equal(focus(value), "");
    assert.equal(focus({ toString: () => " DUE-TIME " }), "due_time");
  });
  it("executes the unchanged focus consumer and request producer, preserving title fallback", () => {
    const f = fixture();
    for (const value of ["constructor", "__proto__", "unknown"]) {
      f.applyFocus(value); assert.equal(f.calls.pop(), "title");
      const request = f.request({ mode: "create", focus: value });
      f.applyFocus(request.focusTarget); assert.equal(f.calls.pop(), "title");
    }
    f.applyFocus("NEXT-ACTION"); assert.equal(f.calls.pop(), "next"); assert.equal(f.fields.taskDetailsPanel.open, true);
    const request = f.request({ action: "copy", taskId: "original", defaults: { title: "seed" }, title: "override", focusField: "due-date" });
    assert.equal(request.mode, "add"); assert.equal(request.duplicate, true); assert.equal(request.taskId, "original");
    assert.equal(request.defaults.title, "override"); assert.equal(request.focusTarget, "due_date");
    assert.equal(f.request({ mode: "edit", templateId: "template", instanceDate: "2026-09-16" }).templateId, "template");
    assert.throws(() => f.request({ mode: "edit" }), /Task ID is required/);
  });
  it("accepts focus targets emitted by the actual Tasks workflow descriptor", () => {
    const f = fixture();
    f.sandbox.requireTaskLifecycleLegality = () => ({ activeStatuses: () => ["open"] });
    vm.runInContext(extractFunctionBlock(reader.readText("public/js/tasks.js"), "taskWorkflowActionMenuDescriptor"), f.sandbox);
    const actions = vm.runInContext("taskWorkflowActionMenuDescriptor().actions", f.sandbox);
    const targets = actions.filter((/** @type {{focusTarget?: string}} */ action) => action.focusTarget).map((/** @type {{focusTarget: string}} */ action) => action.focusTarget);
    assert.deepEqual(plain(targets), ["assignees", "due_date", "due_time", "recurrence"]);
    for (const target of targets) assert.equal(f.focus(target), target);
  });
});
