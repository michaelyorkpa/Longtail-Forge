import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");
const names = ["deriveSuggestedLibraryBucket", "updateLibrarySuggestion", "defaultLibraryForCreate", "populateNoteCollectionOptions", "collectionOptionLabel", "createOption", "libraryLabel", "formatToken", "requireNotesValue", "handleEditorLinkedContextRemove", "removeEditorStagedTarget", "editorLinkTargetMatches", "removeEditorNoteLink"];
/** @param {unknown} value */
const plain = (value) => { assert.notEqual(value, undefined, "Expected an observation."); return JSON.parse(JSON.stringify(value)); };
function fixture() {
  const document = new FakeDocument();
  /** @type {unknown[]} */
  const events = [];
  const state = { activeBucket: "all", libraryManuallyChanged: false, editingNoteId: "",
    /** @type {unknown} */ editorNote: null,
    /** @type {unknown} */ editorSelectedTarget: null,
    /** @type {unknown[]} */ editorStagedTargets: [],
    collections: [
      { note_library_collection_id: "reference", title: "Reference", path_cache: "", depth: 0, library_bucket: "reference", status: "active" },
      { note_library_collection_id: "work", title: "Work", path_cache: "", depth: 0, library_bucket: "active_work", status: "active" },
      { note_library_collection_id: "child", title: "Child", path_cache: "Work / Child", depth: 1, library_bucket: "active_work", status: "active" },
      { note_library_collection_id: "archived", title: "Archived", path_cache: "", depth: 0, library_bucket: "active_work", status: "archived" },
    ] };
  const context = vm.createContext({ document, state, events,
    taskInput: document.createElement("input"), clientInput: document.createElement("select"), projectInput: document.createElement("select"), userInput: document.createElement("input"),
    libraryInput: document.createElement("select"), collectionInput: document.createElement("select"), suggestionMessage: document.createElement("p"), formStatus: document.createElement("p"),
    requireApi: () => ({ postJson: async (/** @type {unknown} */ url, /** @type {unknown} */ body) => { events.push(["post", url, body]); } }),
    refreshEditorNote: async (/** @type {unknown} */ id) => { events.push(["refresh", id]); },
    renderEditorContextSelection: () => events.push("render"),
    safeNoteErrorMessage: (/** @type {unknown} */ error, /** @type {string} */ fallback) => { events.push(["safe-error", error]); return fallback; },
  });
  context.libraryInput.value = "reference";
  const labels = source.match(/const BUCKET_LABELS = [\s\S]*?;/); assert.ok(labels);
  const api = vm.runInContext(`${labels[0]}\n${names.map((name) => extractFunctionBlock(source, name)).join("\n")}\n({${names.join(",")}})`, context);
  return { api, context, state, events };
}

describe("Notes linked context and library suggestion", () => {
  it("derives task-first suggestions for every combination of the four actual input values", () => {
    const { api, context } = fixture();
    for (let mask = 0; mask < 16; mask += 1) {
      for (const [index, name] of ["taskInput", "clientInput", "projectInput", "userInput"].entries()) context[name].value = mask & (1 << index) ? "linked" : "";
      assert.equal(api.deriveSuggestedLibraryBucket(), mask & 1 ? "active_work" : mask ? "ongoing_area" : "reference");
    }
    context.taskInput.value = " "; assert.equal(api.deriveSuggestedLibraryBucket(), "active_work");
  });

  it("retains required-input failure timing and task/client/project short-circuit reads", () => {
    for (const name of ["taskInput", "clientInput", "projectInput", "userInput"]) {
      const single = fixture(); single.context[name] = null;
      assert.throws(() => single.api.deriveSuggestedLibraryBucket(), /Required Notes value/);
    }
    const { api, context } = fixture();
    for (const name of ["taskInput", "clientInput", "projectInput", "userInput"]) context[name] = null;
    assert.throws(() => api.deriveSuggestedLibraryBucket(), /Required Notes value/);
    context.taskInput = { value: "task" }; assert.equal(api.deriveSuggestedLibraryBucket(), "active_work");
    context.taskInput.value = ""; assert.throws(() => api.deriveSuggestedLibraryBucket(), /Required Notes value/);
    context.clientInput = { value: "client" }; assert.equal(api.deriveSuggestedLibraryBucket(), "ongoing_area");
    context.clientInput.value = ""; assert.throws(() => api.deriveSuggestedLibraryBucket(), /Required Notes value/);
    context.projectInput = { value: "project" }; assert.equal(api.deriveSuggestedLibraryBucket(), "ongoing_area");
    context.projectInput.value = ""; assert.throws(() => api.deriveSuggestedLibraryBucket(), /Required Notes value/);
    context.userInput = { value: "user" }; assert.equal(api.deriveSuggestedLibraryBucket(), "ongoing_area");
  });

  it("updates only untouched create defaults, always refreshing the displayed suggestion", () => {
    for (const manual of [false, true]) for (const editing of ["", "saved"]) for (const current of ["reference", "ongoing_area", "active_work"]) {
      const { api, context, state } = fixture(); state.libraryManuallyChanged = manual; state.editingNoteId = editing;
      context.libraryInput.value = current; context.taskInput.value = "task";
      context.collectionInput.value = "reference";
      api.updateLibrarySuggestion();
      const changes = !manual && !editing && current === "reference";
      assert.equal(context.libraryInput.value, changes ? "active_work" : current);
      assert.equal(context.suggestionMessage.textContent, "Suggested Library: Active Work");
      assert.equal(context.collectionInput.children.length, changes ? 3 : 0);
      assert.equal(context.collectionInput.value, changes ? "" : "reference");
    }
  });

  it("uses active-library defaults and preserves collection order, labels, filtering and selected membership", () => {
    const { api, context, state } = fixture();
    for (const bucket of ["active_work", "ongoing_area", "reference", "all", "archive", "other"]) {
      state.activeBucket = bucket; assert.equal(api.defaultLibraryForCreate(), ["active_work", "ongoing_area", "reference"].includes(bucket) ? bucket : "reference");
    }
    state.activeBucket = "active_work"; context.libraryInput.value = "active_work"; context.taskInput.value = "task";
    api.updateLibrarySuggestion(); assert.equal(context.collectionInput.children.length, 0);
    state.activeBucket = "ongoing_area"; context.libraryInput.value = "ongoing_area"; context.taskInput.value = "task"; api.updateLibrarySuggestion();
    assert.equal(context.libraryInput.value, "active_work");
    assert.deepEqual(context.collectionInput.children.map((/** @type {{value: string, textContent: string}} */ option) => [option.value, option.textContent]), [["", "Uncategorized"], ["work", "Work"], ["child", "  - Work / Child"]]);
    context.collectionInput.value = "child"; api.populateNoteCollectionOptions("active_work"); assert.equal(context.collectionInput.value, "child");
    api.populateNoteCollectionOptions("reference"); assert.equal(context.collectionInput.value, "");
    context.collectionInput = null; assert.doesNotThrow(() => api.populateNoteCollectionOptions());
  });

  it("accepts DOM Events and checked preferred text, refuses hostile truthy values before writes", () => {
    const { api, context } = fixture();
    context.userInput.value = "user"; api.updateLibrarySuggestion(new globalThis.Event("input"));
    assert.equal(context.libraryInput.value, "ongoing_area");
    context.taskInput = null;
    assert.doesNotThrow(() => api.updateLibrarySuggestion({ preferredSuggestion: "active_work" }));
    assert.equal(context.suggestionMessage.textContent, "Suggested Library: Active Work");
    assert.doesNotThrow(() => api.updateLibrarySuggestion({ preferredSuggestion: "future_bucket" }));
    assert.equal(context.suggestionMessage.textContent, "Suggested Library: Future Bucket");
    for (const value of [{}, [], 7, true, Symbol("hostile")]) {
      context.libraryInput.value = "reference"; context.suggestionMessage.textContent = "unchanged";
      assert.throws(() => api.updateLibrarySuggestion({ preferredSuggestion: value }), /Invalid Notes library suggestion/);
      assert.equal(context.libraryInput.value, "reference"); assert.equal(context.suggestionMessage.textContent, "unchanged");
    }
    context.taskInput = { value: "task" };
    for (const preferredSuggestion of [undefined, null, false, 0, ""]) {
      context.libraryInput.value = "reference"; assert.doesNotThrow(() => api.updateLibrarySuggestion({ preferredSuggestion })); assert.equal(context.libraryInput.value, "active_work");
    }
  });

  it("reads the library before the required message and never changes collections on a missing target", () => {
    const { api, context } = fixture(); context.taskInput.value = "task";
    context.libraryInput = null; context.suggestionMessage = null;
    assert.throws(() => api.updateLibrarySuggestion(), /Required Notes value/);
    context.libraryInput = { value: "reference" };
    assert.throws(() => api.updateLibrarySuggestion(), /Required Notes value/);
    assert.equal(context.libraryInput.value, "reference"); assert.equal(context.collectionInput.children.length, 0);
  });

  it("dispatches saved links before staged targets by identity and does not await the removal owner", () => {
    const { api, context, state, events } = fixture();
    const pending = new Promise(() => {});
    context.removeEditorNoteLink = (/** @type {unknown} */ note, /** @type {unknown} */ link) => { events.push([note, link]); return pending; };
    context.removeEditorStagedTarget = (/** @type {unknown} */ target) => { events.push([target]); };
    const note = { note_id: "saved" }; const link = { opaque: true }; const target = { targetType: "task", targetId: "t" };
    state.editorNote = note;
    assert.equal(api.handleEditorLinkedContextRemove({ link, target }), undefined);
    const call = events[0]; assert.ok(Array.isArray(call)); assert.equal(call[0], note); assert.equal(call[1], link); assert.equal(events.length, 1);
    state.editorNote = null; api.handleEditorLinkedContextRemove({ link });
    const fallback = events[1]; assert.ok(Array.isArray(fallback)); assert.deepEqual(plain(fallback[0]), {}); assert.equal(fallback[1], link);
    api.handleEditorLinkedContextRemove({ target }); const staged = events[2]; assert.ok(Array.isArray(staged)); assert.equal(staged[0], target);
    api.handleEditorLinkedContextRemove(); api.handleEditorLinkedContextRemove({ link: null, target: false }); assert.equal(events.length, 3);
  });

  it("removes only matching staged targets, preserves retained order and renders before recomputing", () => {
    const { api, context, state, events } = fixture();
    const remove = { moduleId: "tasks", targetType: "task", targetId: "same" };
    const retained = [{ moduleId: "other", targetType: "task", targetId: "same" }, { targetType: "user", targetId: "u" }];
    state.editorStagedTargets = [retained[0], remove, { target_type: "task", target_id: "same" }, retained[1]]; state.editorSelectedTarget = remove;
    context.updateLibrarySuggestion = () => events.push("suggest");
    api.handleEditorLinkedContextRemove({ target: remove });
    assert.deepEqual(state.editorStagedTargets, retained); assert.equal(state.editorSelectedTarget, null); assert.deepEqual(events, ["render", "suggest"]);
    state.editorSelectedTarget = retained[1]; api.handleEditorLinkedContextRemove({ target: remove }); assert.equal(state.editorSelectedTarget, retained[1]);
  });

  it("keeps saved removal routing, refresh order and failure recovery with the same editor identity", async () => {
    const { api, context, state, events } = fixture(); state.editingNoteId = "fallback";
    await api.removeEditorNoteLink({ note_id: "saved / id" }, { noteLinkId: "link / id", note_link_id: "ignored" });
    assert.deepEqual(plain(events), [["post", "/api/notes/saved%20%2F%20id/links/link%20%2F%20id/remove", {}], ["refresh", "saved / id"]]); assert.equal(context.formStatus.textContent, "");
    events.length = 0; await api.removeEditorNoteLink({}, { note_link_id: "legacy" }); assert.deepEqual(plain(events[1]), ["refresh", "fallback"]);
    state.editingNoteId = ""; events.length = 0; await api.removeEditorNoteLink({}, {}); assert.deepEqual(events, []);
    state.editingNoteId = "saved"; const failure = new Error("raw failure");
    context.requireApi = () => ({ postJson: async () => { assert.equal(context.formStatus.textContent, "Removing linked context..."); throw failure; } });
    await assert.doesNotReject(() => api.removeEditorNoteLink({}, { note_link_id: "link" }));
    assert.equal(context.formStatus.textContent, "Linked context could not be removed."); assert.deepEqual(events, [["safe-error", failure]]);
    assert.equal(state.editingNoteId, "saved");
  });
});
