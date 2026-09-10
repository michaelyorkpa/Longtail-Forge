import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");
const names = ["normalizeNoteEditorDefaults", "noteDefaultString", "isResponseRecord", "openNoteEditor",
  "normalizeNoteEditorMode", "readNoteEditorId", "readEditorPayload", "readEditorVisibility", "saveNoteForm", "requireNotesValue", "normalizeText"];
const keys = ["body_markdown", "client_id", "library_bucket", "note_collection_id", "note_type", "project_id", "security_mode", "title", "visibility"];
/** @param {Record<string, unknown>} [overrides] */
function editorCase(overrides = {}) {
  /** @type {unknown[]} */
  const events = [];
  const state = { editingNoteId: "", workspaceType: "business", selectedNote: null,
    editorHostContext: { refresh: async (/** @type {unknown} */ result) => events.push(["host-refresh", result]) },
    tagPicker: { readTagIds: () => ["tag"] } };
  const note = { note_id: "saved/id", title: "Saved title", body_markdown: "Saved body" };
  const result = { note };
  const context = vm.createContext({ state, isNotesWorkspaceSurface: true,
    titleInput: { value: "Title" }, bodyInput: { value: "Fallback body" }, libraryInput: { value: "reference" },
    collectionInput: { value: "" }, typeInput: { value: "general" }, securityInput: { value: "normal" },
    clientInput: { value: " client " }, projectInput: { value: " project " }, userInput: { value: " user " }, visibilityInput: { value: "client_visible" },
    editor: { getValue: () => "Editor body" }, saveButton: { disabled: false }, saveCloseButton: { disabled: false },
    stagedLinkPayloads: () => [{ moduleId: "", targetType: "task", targetId: "task" }],
    usesBusinessScope: () => true, normalizeWorkspaceType: (/** @type {string} */ value) => value,
    prepareNoteDialogData: async () => events.push("prepare"),
    openEditor: async (/** @type {unknown} */ note, /** @type {unknown} */ options) => { events.push(["open", note, options]); return "closed"; },
    requireApi: () => ({ postJson: async (/** @type {string} */ url, /** @type {unknown} */ payload) => { events.push(["post", url, payload]); return result; },
      putJson: async (/** @type {string} */ url, /** @type {unknown} */ payload) => { events.push(["put", url, payload]); return result; } }),
    loadCollections: async () => events.push("collections"), loadNotes: async () => events.push("notes"),
    requireNoteFromEnvelope: (/** @type {{note: unknown}} */ value) => { events.push("checked"); return value.note; },
    transitionCreatedNoteToEdit: async (/** @type {typeof note} */ value) => { events.push(["transition", value]); state.editingNoteId = value.note_id; },
    renderNotes: () => events.push("render-notes"), renderDetail: (/** @type {unknown} */ value) => events.push(["detail", value]),
    updateUrl: (/** @type {string} */ id) => events.push(["url", id]), selectNote: async (/** @type {string} */ id) => events.push(["select", id]),
    completeNoteEditorHostContext: (/** @type {unknown} */ detail) => events.push(["complete", detail]),
    closeEditor: (/** @type {unknown} */ options) => events.push(["close", options]),
    setEditorFormStatus: /** @param {...unknown} args */ (...args) => events.push(["status", ...args]),
    safeNoteErrorMessage: () => "Safe save failure", ...overrides });
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  return { api: vm.runInContext(`({ ${names.join(", ")} })`, context), context, state, events, note, result };
}
/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

describe("Notes editor defaults and payload", () => {
  it("lifts the shipped defaults producer and proves every output against hostile inputs", () => {
    const { api } = editorCase();
    const poison = { toString() { throw new Error("No object coercion permitted"); } };
    const hostile = [undefined, null, 0, 42, true, false, [], ["value"], {}, poison, () => "value", Symbol("value"), 1n];
    for (const input of [...hostile, "scalar"]) {
      const output = api.normalizeNoteEditorDefaults(input);
      assert.deepEqual(Object.keys(output), keys);
      assert.ok(Object.values(output).every((value) => typeof value === "string"));
      assert.ok(Object.values(output).every((value) => value === ""));
    }
    for (const value of hostile) {
      const input = Object.fromEntries(keys.map((key) => [key, value]));
      input.context = value;
      const output = api.normalizeNoteEditorDefaults(input);
      assert.deepEqual(Object.keys(output), keys);
      assert.ok(Object.values(output).every((entry) => typeof entry === "string" && entry === ""));
      const nested = api.normalizeNoteEditorDefaults({ context: { clientId: value, projectId: value } });
      assert.equal(nested.client_id, ""); assert.equal(nested.project_id, "");
    }
    const array = Object.assign([], { context: { clientId: "injected" }, title: "injected" });
    const fn = Object.assign(() => {}, { title: "injected" });
    assert.equal(api.normalizeNoteEditorDefaults(array).title, ""); assert.equal(api.normalizeNoteEditorDefaults(fn).title, "");
    for (const context of [Object.assign([], { clientId: "injected", projectId: "injected" }), Object.assign(() => {}, { clientId: "injected" })]) {
      const output = api.normalizeNoteEditorDefaults({ context });
      assert.equal(output.client_id, ""); assert.equal(output.project_id, "");
    }
  });

  it("preserves valid alias precedence and whitespace while invalid values yield to valid aliases", () => {
    const { api } = editorCase();
    assert.deepEqual(plain(api.normalizeNoteEditorDefaults({ body_markdown: "  Body  ", bodyMarkdown: "ignored", body: "ignored",
      client_id: "client", clientId: "ignored", context: { clientId: "ignored", projectId: "ignored" },
      library_bucket: "reference", libraryBucket: "ignored", note_collection_id: "collection", noteCollectionId: "ignored",
      note_type: "log", noteType: "ignored", project_id: "project", projectId: "ignored", security_mode: "secure", securityMode: "ignored",
      title: "  Title  ", visibility: "private", secure_payload: "never" })), {
      body_markdown: "  Body  ", client_id: "client", library_bucket: "reference", note_collection_id: "collection", note_type: "log",
      project_id: "project", security_mode: "secure", title: "  Title  ", visibility: "private",
    });
    const alternate = api.normalizeNoteEditorDefaults({ body_markdown: {}, bodyMarkdown: 123, body: "fallback", client_id: [], clientId: false,
      project_id: 42, projectId: {}, context: { clientId: "context-client", projectId: "context-project" },
      libraryBucket: "ongoing_area", noteCollectionId: "alias-collection", noteType: "meeting", securityMode: "normal" });
    assert.equal(alternate.body_markdown, "fallback"); assert.equal(alternate.client_id, "context-client"); assert.equal(alternate.project_id, "context-project");
    assert.equal(alternate.library_bucket, "ongoing_area"); assert.equal(alternate.note_collection_id, "alias-collection");
    assert.equal(alternate.note_type, "meeting"); assert.equal(alternate.security_mode, "normal");
    assert.equal(api.normalizeNoteEditorDefaults({ body_markdown: "", bodyMarkdown: "alias" }).body_markdown, "alias");
  });

  it("preserves editor dispatch, seed identity, preparation order, and host focus/result", async () => {
    const { api, events } = editorCase();
    const seed = { note_id: "note", title: "Seed" }; const trigger = {}; const explicit = {}; const host = { trigger, result: "host-result" };
    assert.equal(await api.openNoteEditor({ mode: "edit", note: seed, record: { note_id: "ignored" }, title: "Draft", returnFocusTo: explicit }, host), "host-result");
    assert.equal(events[0], "prepare");
    /** @type {unknown} */
    const opened = events[1]; assert.ok(Array.isArray(opened));
    assert.equal(opened[1], seed); assert.equal(opened[2].hostContext, host); assert.equal(opened[2].trigger, explicit); assert.equal(opened[2].defaults.title, "Draft");
    for (const alias of ["record", "noteRecord"]) {
      events.length = 0; await api.openNoteEditor({ mode: "edit", noteId: "fallback-id", [alias]: seed }, host);
      /** @type {unknown} */
      const call = events[1]; assert.ok(Array.isArray(call)); assert.equal(call[1], seed); assert.equal(call[2].trigger, trigger);
    }
    events.length = 0; await api.openNoteEditor({ mode: "add", note: seed });
    /** @type {unknown} */
    const added = events[1]; assert.ok(Array.isArray(added)); assert.equal(added[1], null);
    events.length = 0; await assert.rejects(api.openNoteEditor({ mode: "edit" }), /Note ID is required/); assert.deepEqual(events, ["prepare"]);
  });

  it("reads typed controls and producer-backed slots with exact scope, null, body, and link semantics", () => {
    const { api, context, state } = editorCase();
    const payload = api.readEditorPayload();
    assert.deepEqual(plain(payload), { title: "Title", body_markdown: "Editor body", library_bucket: "reference", noteCollectionId: null,
      note_type: "general", visibility: "client_visible", security_mode: "normal", tagIds: ["tag"], client_id: "client", project_id: "project",
      task_id: null, linked_user_id: "user", links: [{ moduleId: "", targetType: "task", targetId: "task" }] });
    state.editingNoteId = "saved"; context.securityInput.value = "secure"; context.editor.getValue = () => "";
    assert.deepEqual(plain(api.readEditorPayload().links), []); assert.equal(api.readEditorPayload().body_markdown, "Fallback body");
    assert.equal(api.readEditorPayload().security_mode, "secure");
    context.usesBusinessScope = () => false; context.clientInput = null;
    assert.equal(api.readEditorPayload().client_id, null); assert.equal(api.readEditorPayload().visibility, "internal");
    state.workspaceType = "personal"; context.visibilityInput = null;
    assert.equal(Object.hasOwn(api.readEditorPayload(), "visibility"), false);
    context.editor = null; context.state.tagPicker = null; context.projectInput.value = " "; context.userInput.value = "";
    assert.deepEqual(plain(api.readEditorPayload().tagIds), []); assert.equal(api.readEditorPayload().project_id, null);
    assert.equal(api.readEditorPayload().linked_user_id, null);
    context.titleInput = null; assert.throws(() => api.readEditorPayload(), /Required Notes value/);
  });

  it("keeps create open after transition and sends the next save as an encoded update", async () => {
    const { api, context, state, events, note, result } = editorCase();
    assert.equal(await api.saveNoteForm({ closeOnSuccess: false }), result);
    assert.equal(state.editingNoteId, note.note_id); assert.equal(state.selectedNote, note);
    assert.ok(events.indexOf("checked") < events.findIndex((value) => Array.isArray(value) && value[0] === "transition"));
    assert.equal(events.some((value) => Array.isArray(value) && value[0] === "close"), false);
    assert.deepEqual(plain(events.at(-1)), ["status", "Note saved. Continue editing or choose Save & Close."]);
    assert.equal(context.saveButton.disabled, false); assert.equal(context.saveCloseButton.disabled, false);
    events.length = 0; await api.saveNoteForm();
    const update = events.find((value) => Array.isArray(value) && value[0] === "put"); assert.ok(Array.isArray(update));
    assert.equal(update[1], "/api/notes/saved%2Fid"); assert.deepEqual(plain(update[2].links), []);
    assert.equal(events.some((value) => Array.isArray(value) && value[0] === "transition"), false);
    const complete = events.findIndex((value) => Array.isArray(value) && value[0] === "complete");
    const close = events.findIndex((value) => Array.isArray(value) && value[0] === "close");
    const select = events.findIndex((value) => Array.isArray(value) && value[0] === "select");
    assert.ok(complete >= 0 && complete < close && close < select);
    assert.deepEqual(plain(events[complete]), ["complete", { actionId: "notes.edit", recordId: note.note_id, title: note.title }]);
  });

  it("waits for persistence and host refresh and preserves partial-save failure without rollback", async () => {
    const { api, context, state, events, result } = editorCase();
    let release = () => {};
    const pending = new Promise((resolve) => { release = () => resolve(result); });
    const failure = new Error("Refresh failed after commit");
    context.requireApi = () => ({ postJson: () => pending });
    context.state.editorHostContext.refresh = async () => { throw failure; };
    const saving = api.saveNoteForm();
    const rejected = assert.rejects(saving, (error) => error === failure);
    await flush(); assert.equal(context.saveButton.disabled, true); assert.equal(events.includes("collections"), false);
    release(); await rejected;
    assert.ok(events.includes("collections") && events.includes("notes")); assert.equal(events.includes("checked"), false);
    assert.equal(state.editingNoteId, ""); assert.equal(state.selectedNote, null);
    assert.equal(context.saveButton.disabled, false); assert.equal(context.saveCloseButton.disabled, false);
    assert.deepEqual(plain(events.at(-1)), ["status", "Safe save failure", true]);
    assert.equal(events.some((value) => Array.isArray(value) && ["close", "complete", "transition"].includes(value[0])), false);
  });

  it("keeps external saves off workspace rendering and refuses invalid returned detail before transition", async () => {
    const { api, context, events } = editorCase({ isNotesWorkspaceSurface: false });
    await api.saveNoteForm({ closeOnSuccess: false });
    assert.ok(events.includes("collections")); assert.equal(events.includes("notes"), false); assert.equal(events.includes("render-notes"), false);
    events.length = 0; context.state.editingNoteId = "";
    const bad = new Error("Invalid detail"); context.requireNoteFromEnvelope = () => { throw bad; };
    await assert.rejects(api.saveNoteForm(), (error) => error === bad);
    assert.equal(events.some((value) => Array.isArray(value) && value[0] === "transition"), false);
    assert.equal(context.saveCloseButton.disabled, false);
    context.saveButton = null; events.length = 0;
    await assert.rejects(api.saveNoteForm(), /Required Notes value/); assert.equal(events.length, 0);
  });
});
