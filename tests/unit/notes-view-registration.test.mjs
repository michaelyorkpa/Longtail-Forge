import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText;
const source = read("public/js/notes.js");
const builder = read("public/js/shared/view-builder.js");
const renderer = read("public/js/shared/view-renderer.js");
const names = ["requireView", "hasDescriptorRenderers", "requireDescriptorRenderers", "registerNotesViewBehaviors", "runNoteWorkflow", "createNoteViewDialog", "emptyText",
  "isResponseRecord", "hasNoteIdentity", "requireNoteWorkflowIdentity", "isNoteWorkflowEditorSeed", "requireNoteWorkflowEditorSeed"];
const mapSource = source.slice(source.indexOf("const NOTE_WORKFLOW_HANDLERS ="), source.indexOf("const NOTE_EDITOR_TOOLBAR_ACTIONS ="));

function fixture() {
  const browser = createFakeBrowserContext();
  /** @type {unknown[]} */ const calls = [];
  const outcomes = { edit: Promise.resolve("edited"), archive: Promise.resolve("archived"), restore: Promise.resolve("restored") };
  const library = browser.document.createElement("div"), sort = browser.document.createElement("select"), pagination = browser.document.createElement("nav");
  const context = vm.createContext({ ...browser, calls, outcomes, behaviors: new Map(),
    state: { selectedNote: { note_id: "selected" } },
    openEditor: /** @param {...unknown} args */ (...args) => { calls.push(["edit", ...args]); return outcomes.edit; },
    archiveNote: (/** @type {unknown} */ note) => { calls.push(["archive", note]); return outcomes.archive; },
    restoreNote: (/** @type {unknown} */ note) => { calls.push(["restore", note]); return outcomes.restore; },
    createNotesLibraryChrome: () => { calls.push("library"); return library; },
    createNotesListSortControl: () => { calls.push("sort"); return sort; },
    createNotesPagination: () => { calls.push("pagination"); return pagination; },
    hydrateNoteTagFilterOptions: (/** @type {unknown} */ value) => value,
    requireApiClient: () => ({ marker: "api" }), surfaceOwnsRenderedData: () => false,
  });
  vm.runInContext(builder, context);
  vm.runInContext(["registerBehavior", "flushMounts", "runBehaviorAction"].map((name) => extractFunctionBlock(renderer, name)).join("\n"), context);
  const shared = vm.runInContext("({registerBehavior, flushMounts, runBehaviorAction})", context);
  const view = { ...context.window.LongtailForge.view, registerBehavior: shared.registerBehavior,
    renderDescriptorActionMenu() {}, renderDescriptorLinkedRecordsPanel() {}, renderDescriptorModalForm() {}, renderSurface() {},
    closeModal: (/** @type {unknown} */ dialog, /** @type {unknown} */ reason) => calls.push(["close", dialog, reason]),
  };
  context.window.LongtailForge.view = view;
  context.root = context.window.LongtailForge;
  vm.runInContext(`${mapSource}\n${names.map((name) => extractFunctionBlock(source, name)).join("\n")}`, context);
  const api = vm.runInContext(`({${names.join(",")}})`, context);
  return { context, api, view, shared, calls, outcomes, library, sort, pagination, document: browser.document };
}

describe("Notes view registration and dialog shell", () => {
  it("acquires the published view lazily on every use and preserves missing-root and missing-view failure", () => {
    const f = fixture();
    assert.equal(f.api.requireView(), f.view);
    let reads = 0;
    Object.defineProperty(f.context.window.LongtailForge, "view", { configurable: true, get() { reads += 1; return f.view; } });
    assert.equal(reads, 0); assert.equal(f.api.requireView(), f.view); assert.equal(f.api.requireView(), f.view); assert.equal(reads, 2);
    for (const root of [undefined, {}, { view: null }]) {
      f.context.window.LongtailForge = root;
      assert.throws(() => f.api.requireView(), /Notes requires LongtailForge\.view\./);
    }
    f.context.window.LongtailForge = { view: f.view };
    assert.equal(f.api.requireView(), f.view);
  });

  it("skips unavailable registration but requires the full renderer before installing any behavior", () => {
    for (const registration of [undefined, null, false, "unavailable"]) {
      const f = fixture(); f.context.window.LongtailForge.view = { ...f.view, registerBehavior: registration };
      assert.doesNotThrow(() => f.api.registerNotesViewBehaviors()); assert.equal(f.context.behaviors.size, 0);
    }
    for (const member of ["renderDescriptorActionMenu", "renderDescriptorLinkedRecordsPanel", "renderDescriptorModalForm", "renderSurface"]) {
      const f = fixture(); f.context.window.LongtailForge.view = { ...f.view, [member]: null };
      assert.throws(() => f.api.registerNotesViewBehaviors(), /Notes requires the LongtailForge\.view descriptor renderers/);
      assert.equal(f.context.behaviors.size, 0);
    }
    const f = fixture(); delete f.context.window.LongtailForge.view;
    assert.throws(() => f.api.registerNotesViewBehaviors(), /Notes requires LongtailForge\.view/);
  });

  it("registers the exact ordered behaviors and keeps the tag callback and create result", () => {
    const f = fixture(); f.api.registerNotesViewBehaviors();
    assert.deepEqual([...f.context.behaviors.keys()], ["notes.create", "notes.sidebar.library", "notes.sidebar.notes-list-footer", "notes.filters.tags", "notes.workflow.edit", "notes.workflow.archive", "notes.workflow.restore"]);
    assert.equal(f.context.behaviors.get("notes.filters.tags"), f.context.hydrateNoteTagFilterOptions);
    assert.equal(f.context.behaviors.get("notes.create")(), f.outcomes.edit);
    assert.deepEqual(f.calls, [["edit"]]);
    f.api.registerNotesViewBehaviors(); assert.equal(f.context.behaviors.size, 7);
  });

  it("reacquires the checked renderer between registrations rather than retaining a stale factory", () => {
    const f = fixture();
    f.view.registerBehavior = (/** @type {unknown} */ id, /** @type {unknown} */ handler) => {
      f.shared.registerBehavior(id, handler);
      f.context.window.LongtailForge.view = { ...f.view, renderSurface: null };
    };
    assert.throws(() => f.api.registerNotesViewBehaviors(), /descriptor renderers/);
    assert.deepEqual([...f.context.behaviors.keys()], ["notes.create"]);
  });

  it("mounts sidebar content into the renderer's actual container, replacing children in the original order", () => {
    const f = fixture(); f.api.registerNotesViewBehaviors();
    const container = f.document.createElement("div"); container.appendChild(f.document.createElement("p"));
    const state = { pendingMounts: [{ region: { behavior: "notes.sidebar.library" }, container, record: null }], surface: { refresh() {} }, view: f.view };
    f.shared.flushMounts(state);
    assert.equal(state.pendingMounts.length, 0); assert.deepEqual(container.children, [f.library]); assert.deepEqual(f.calls, ["library"]);
    state.pendingMounts.push({ region: { behavior: "notes.sidebar.notes-list-footer" }, container, record: null });
    f.shared.flushMounts(state);
    assert.deepEqual(container.children, [f.sort, f.pagination]); assert.deepEqual(f.calls, ["library", "sort", "pagination"]);
    f.calls.length = 0;
    for (const id of ["notes.sidebar.library", "notes.sidebar.notes-list-footer"]) {
      assert.throws(() => f.context.behaviors.get(id)({ container: null }), /null/);
      assert.deepEqual(f.calls, []);
    }
  });

  it("dispatches each workflow with record identity and result intact, skipping only absent handlers or falsy notes", () => {
    const f = fixture(); const note = { note_id: "explicit" };
    for (const [action, result] of Object.entries(f.outcomes)) {
      assert.equal(f.api.runNoteWorkflow(`notes.workflow.${action}`, note), result);
      assert.deepEqual(f.calls.pop(), [action, note]);
    }
    for (const note of [null, undefined, false, 0, ""]) assert.doesNotThrow(() => {
      assert.equal(f.api.runNoteWorkflow("notes.workflow.edit", note), undefined);
    });
    assert.equal(f.api.runNoteWorkflow("notes.workflow.missing", note), undefined); assert.deepEqual(f.calls, []);
    // These inherited names are part of the current object lookup; this typing pass must not silently change it.
    assert.equal(f.api.runNoteWorkflow("constructor", note), note);
    assert.throws(() => f.api.runNoteWorkflow("__proto__", note), /not a function/);
  });

  it("preserves the generic renderer record and live selected-note fallback after checking the consumed identity", async () => {
    const f = fixture(); f.api.registerNotesViewBehaviors();
    const action = { behavior: "notes.workflow.archive" };
    const record = { note_id: "from-renderer", extra: { unvalidated: true } };
    const state = { selectedRecord: record, surface: {}, actionError: new Error("old") };
    await f.shared.runBehaviorAction(action, state);
    const call = f.calls[0]; assert.ok(Array.isArray(call));
    assert.equal(call[1], record); assert.equal(state.actionError, null);
    for (const value of [null, undefined, false, 0, ""]) {
      f.context.state.selectedNote = { note_id: `fallback-${String(value)}` };
      assert.equal(f.context.behaviors.get(action.behavior)({ record: value }), f.outcomes.archive);
      const call = f.calls.at(-1); assert.ok(Array.isArray(call));
      assert.equal(call[1], f.context.state.selectedNote);
    }
  });

  it("accepts partial editor seeds by identity without requiring a full response or dropping context", () => {
    const f = fixture();
    for (const seed of [{}, { note_id: "" }, { note_id: " a/b ? " }, { title: "Draft", body_markdown: "Body", client_id: null },
      { note_id: "saved", note_collection_id: null, project_id: "project", task_id: null, linked_user_id: "user",
        library_bucket: "reference", note_type: "general", visibility: "private", security_mode: "secure", linked_context: { task: { label: "Context" } },
        trigger: f.library, hostContext: { complete() {}, cancel() {} } }]) {
      assert.doesNotThrow(() => {
        assert.equal(f.api.runNoteWorkflow("notes.workflow.edit", seed), f.outcomes.edit);
      });
      const call = f.calls.pop(); assert.ok(Array.isArray(call)); assert.equal(call[1], seed);
    }
    // Archive/restore consume only identity; unrelated members are not a full-detail claim.
    const seed = { note_id: "saved", title: 12, tags: null };
    assert.equal(f.api.runNoteWorkflow("notes.workflow.archive", seed), f.outcomes.archive);
    const call = f.calls.pop(); assert.ok(Array.isArray(call)); assert.equal(call[1], seed);
  });

  it("rejects malformed renderer inputs before any editor or write action starts", async () => {
    const f = fixture(); f.api.registerNotesViewBehaviors();
    for (const record of [true, 1, "note", [], { note_id: null }, { note_id: 12 }, { note_id: "  " }, { note_id: ["saved"] }]) {
      for (const action of ["edit", "archive", "restore"]) {
        await assert.rejects(() => f.shared.runBehaviorAction({ behavior: `notes.workflow.${action}` }, { selectedRecord: record, surface: {} }), /workflow/i);
        assert.deepEqual(f.calls, []);
      }
    }
    for (const key of ["title", "library_bucket", "note_type", "visibility", "security_mode", "body_markdown"]) {
      for (const value of [null, 1, [], {}]) {
        assert.throws(() => f.api.runNoteWorkflow("notes.workflow.edit", { note_id: "saved", [key]: value }), /workflow input/);
        assert.deepEqual(f.calls, []);
      }
    }
    for (const key of ["note_collection_id", "client_id", "project_id", "task_id", "linked_user_id"]) {
      for (const value of [1, false, [], {}]) {
        assert.throws(() => f.api.runNoteWorkflow("notes.workflow.edit", { note_id: "saved", [key]: value }), /workflow input/);
        assert.deepEqual(f.calls, []);
      }
    }
    for (const action of ["archive", "restore"]) for (const record of [{}, { note_id: "" }]) {
      assert.throws(() => f.api.runNoteWorkflow(`notes.workflow.${action}`, record), /note ID/);
      assert.deepEqual(f.calls, []);
    }
  });

  it("builds the read-only shell through the actual factory and closes the correct captured dialog", async () => {
    const f = fixture(); const dialog = f.api.createNoteViewDialog(" a/b ? ");
    assert.equal(dialog.tagName, "DIALOG"); assert.equal(dialog.dataset.noteViewDialog, ""); assert.equal(dialog.dataset.noteId, " a/b ? ");
    assert.equal(dialog.viewParts.title.textContent, "View Note");
    assert.equal(dialog.getAttribute("aria-labelledby"), dialog.viewParts.title.id);
    assert.equal(dialog.classList.contains("notes-view-dialog"), true);
    assert.equal(dialog.classList.contains("view-modal--wide"), true);
    const body = dialog.querySelector("[data-note-view-body]");
    assert.ok(body, "the dialog retains its loading body");
    assert.equal(body.className, "notes-view-body"); assert.equal(body.getAttribute("aria-live"), "polite");
    assert.equal(body.textContent, "Loading note..."); assert.equal(dialog.querySelector("input,select,textarea,form"), null);
    /** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement[]} */
    const buttons = dialog.querySelectorAll("[data-note-view-action]");
    assert.deepEqual(buttons.map((button) => [button.textContent, button.dataset.noteViewAction, button.dataset.surfaceAction, button.dataset.surfaceActionRole, button.disabled]),
      [["Close", "close", "notes.view.close", "secondary", false], ["Edit", "edit", "notes.view.edit", "primary", true]]);
    assert.ok(buttons.every((button) => button.classList.contains("surface-modal-footer-action")));
    const other = f.api.createNoteViewDialog("other");
    await buttons[0].click(); assert.deepEqual(f.calls, [["close", dialog, "close"]]);
    await other.querySelector("[data-note-view-action='close']").click(); assert.deepEqual(f.calls.at(-1), ["close", other, "close"]);
  });
});
