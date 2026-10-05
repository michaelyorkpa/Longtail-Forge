import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText;
const source = read("public/js/notes.js"), registry = read("public/js/shared/module-actions.js");
const start = source.indexOf("namespace.moduleActions?.register?.({");
const end = source.indexOf("function buildNotesViewShell()", start);
assert.ok(start >= 0 && end > start);
// Execute the actual contribution literals and registrations, not a fixture's registry.
const registrations = source.slice(start, end);

function fixture() {
  const browser = createFakeBrowserContext();
  /** @type {unknown[][]} */ const calls = [];
  /** @type {Map<string, {actionId: string, open: (...args: unknown[]) => Promise<unknown>}>} */ const actions = new Map();
  const surface = { register(/** @type {{actionId: string, open: (...args: unknown[]) => Promise<unknown>}} */ action) {
    assert.equal(this, surface); actions.set(action.actionId, action);
  } };
  const context = vm.createContext({ ...browser, namespace: { moduleActions: surface },
    state: { editorHostContext: null, editorHostContextSettled: false },
    toPublicAction: (/** @type {unknown} */ action) => action,
    openNoteEditor: (/** @type {unknown[]} */ ...args) => { calls.push(["editor", ...args]); return Promise.resolve("editor-result"); },
    openNoteViewer: (/** @type {unknown[]} */ ...args) => { calls.push(["viewer", ...args]); return Promise.resolve("viewer-result"); },
  });
  vm.runInContext(extractFunctionBlock(registry, "createHostContext"), context);
  for (const name of ["completeNoteEditorHostContext", "cancelNoteEditorHostContext", "normalizeNoteEditorMode", "isSecureNote"])
    vm.runInContext(extractFunctionBlock(source, name), context);
  vm.runInContext(registrations, context);
  return { context, calls, actions, browser, api: vm.runInContext("({createHostContext, completeNoteEditorHostContext, cancelNoteEditorHostContext, normalizeNoteEditorMode, isSecureNote})", context) };
}
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));

describe("Notes module-action contribution and host channels", () => {
  it("registers the same ordered metadata, permissions and modes", () => {
    const f = fixture();
    assert.deepEqual([...f.actions.keys()], ["notes.add", "notes.edit", "notes.view"]);
    const values = [...f.actions.values()].map((action) => plain(action));
    assert.deepEqual(values, [
      { actionId: "notes.add", id: "notes.add", label: "Add Note", mode: "add", moduleId: "notes", recordType: "note", requiredModules: ["notes"], requiredPermissions: ["notes.create"], title: "Add Note" },
      { actionId: "notes.edit", id: "notes.edit", label: "Edit Note", mode: "edit", moduleId: "notes", recordType: "note", requiredModules: ["notes"], requiredPermissions: ["notes.view"], title: "Edit Note" },
      { actionId: "notes.view", id: "notes.view", label: "View Note", mode: "view", moduleId: "notes", recordType: "note", requiredModules: ["notes"], requiredPermissions: ["notes.view"], title: "View Note" },
    ]);
  });

  it("forwards the same host and opaque params while add/edit override only mode", async () => {
    const f = fixture(), note = { note_id: "note" }, extra = { untouched: true }, host = { refresh: "opaque" };
    const params = { note, mode: "wrong", context: extra };
    for (const [id, mode] of [["notes.add", "add"], ["notes.edit", "edit"]]) {
      assert.equal(await f.actions.get(id)?.open(params, host), "editor-result");
      const call = f.calls.at(-1); assert.ok(call);
      assert.deepEqual(plain(call), ["editor", { note, mode, context: extra }, host]);
      assert.notEqual(call[1], params);
      const passed = call[1]; assert.ok(passed && typeof passed === "object" && "note" in passed && "context" in passed);
      assert.equal(passed.note, note); assert.equal(passed.context, extra); assert.equal(call[2], host);
    }
    await f.actions.get("notes.view")?.open(params, host);
    assert.equal(f.calls.at(-1)?.[1], params); assert.equal(f.calls.at(-1)?.[2], host);
    assert.equal(params.mode, "wrong");
    // Preserve the existing spread semantics, including strings and null; annotations
    // must not add a record guard at these already-existing forwarding callbacks.
    await f.actions.get("notes.add")?.open("xy", null);
    assert.deepEqual(plain(f.calls.at(-1)), ["editor", { 0: "x", 1: "y", mode: "add" }, null]);
    await f.actions.get("notes.edit")?.open(); assert.equal(f.calls.at(-1)?.[2], undefined);
    assert.deepEqual(plain(f.calls.at(-1)?.[1]), { mode: "edit" });
    const failure = new Error("opener rejected"); f.context.openNoteViewer = () => Promise.reject(failure);
    const viewAction = f.actions.get("notes.view"); assert.ok(viewAction);
    await assert.rejects(viewAction.open(params, host), (error) => error === failure);
  });

  it("tolerates an absent registry or register method without changing the dialog publication", () => {
    for (const moduleActions of [undefined, null, {}]) {
      const context = vm.createContext({ namespace: { moduleActions } });
      assert.doesNotThrow(() => vm.runInContext(registrations, context));
    }
  });

  it("lifts the real host producer: preserves opaque refresh and status channels, then completes only once", async () => {
    const f = fixture(), trigger = f.browser.document.createElement("button"), detail = { recordId: "note", extra: { retained: true } };
    f.browser.document.body.append(trigger); trigger.focus();
    let focused = 0; trigger.focus = () => { focused += 1; };
    const refresh = { deliberatelyNotCallable: true };
    const host = f.api.createHostContext({ actionId: "notes.add" }, { id: "note" }, {
      refresh,
      setStatus: (/** @type {unknown[]} */ ...args) => f.calls.push(["status", ...args]),
      onComplete: (/** @type {unknown} */ value) => f.calls.push(["complete", value]),
      onCancel: (/** @type {unknown} */ value) => f.calls.push(["cancel", value]),
    });
    assert.equal(host.refresh, refresh); assert.equal(host.trigger, trigger);
    const options = { isError: true }; host.setStatus("message", options);
    assert.equal(f.calls[0][2], options);
    f.context.state.editorHostContext = host;
    f.api.completeNoteEditorHostContext(detail); f.api.cancelNoteEditorHostContext({ ignored: true });
    const outcome = await host.result;
    assert.deepEqual(plain(outcome), { actionId: "notes.add", completed: true, detail }); assert.equal(outcome.detail, detail);
    assert.deepEqual(f.calls.map((call) => call[0]), ["status", "complete"]); assert.equal(f.calls[1][1], detail);
    assert.equal(focused, 1); assert.equal(f.context.state.editorHostContext, null); assert.equal(f.context.state.editorHostContextSettled, true);
  });

  it("keeps cancellation separate and passes the result promise through the real editor opener", async () => {
    const f = fixture();
    for (const name of ["openNoteEditor", "normalizeNoteEditorDefaults", "noteDefaultString", "isResponseRecord", "readNoteEditorId"])
      vm.runInContext(extractFunctionBlock(source, name), f.context);
    f.context.prepareNoteDialogData = async () => {};
    /** @type {(value?: unknown) => void} */ let opened = () => {};
    const ready = new Promise((resolve) => { opened = resolve; });
    f.context.openEditor = (/** @type {unknown} */ note, /** @type {{hostContext: unknown}} */ options) => {
      f.calls.push(["open", note, options]); f.context.state.editorHostContext = options.hostContext;
      opened(); return Promise.resolve("closed");
    };
    const host = f.api.createHostContext({ actionId: "notes.edit" }, {}, { onCancel: (/** @type {unknown} */ detail) => f.calls.push(["cancel", detail]) });
    const note = { note_id: "saved" }, completion = f.actions.get("notes.edit")?.open({ note }, host);
    await ready; assert.equal(f.calls[0][1], note);
    const detail = { recordId: "saved" }; f.api.cancelNoteEditorHostContext(detail);
    const outcome = await completion;
    assert.equal(outcome, await host.result); assert.deepEqual(plain(outcome), { actionId: "notes.edit", completed: false, detail });
    assert.equal(f.calls[1][1], detail);
    assert.equal(host.refresh, null); assert.doesNotThrow(() => host.setStatus("optional channel absent"));
  });

  it("retains mode coercion/defaults and exact secure-mode comparisons without new validation", () => {
    const { api } = fixture();
    assert.equal(api.normalizeNoteEditorMode(), "add");
    assert.equal(api.normalizeNoteEditorMode({ mode: "EDIT", actionMode: "add" }), "edit");
    assert.equal(api.normalizeNoteEditorMode({ mode: "", actionMode: "edit" }), "edit");
    assert.equal(api.normalizeNoteEditorMode({ mode: { toString: () => "edit" } }), "edit");
    assert.equal(api.normalizeNoteEditorMode({ mode: " edit " }), "add");
    assert.throws(() => api.normalizeNoteEditorMode(null), { name: "TypeError" });
    assert.equal(api.isSecureNote(null), false); assert.equal(api.isSecureNote(undefined), false);
    for (const mode of ["secure", "normal", "SECURE", false, null, {}, 1]) {
      assert.equal(api.isSecureNote({ security_mode: "normal", effective_security_mode: mode }), mode === "secure");
      assert.equal(api.isSecureNote({ security_mode: "secure", effective_security_mode: mode }), true);
    }
    assert.equal(api.isSecureNote(Object.create({ effective_security_mode: "secure" })), true);
  });
});
