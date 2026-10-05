import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");
const names = ["openBulkEditor", "applyBulkEdit", "readBulkNoteChanges", "syncNotesBulkToolbar", "populateBulkCollectionOptions",
  "toggleBulkNoteSelection", "syncNoteSelectionToVisibleNotes", "refreshSelectedNoteAfterBulk", "bulkChangedIds", "isResponseRecord", "requireNotesValue", "findNotesControl"];
/** @param {Record<string, unknown>} [overrides] */
function bulk(overrides = {}) {
  const document = new FakeDocument();
  /** @type {unknown[]} */
  const events = [];
  const state = { selectedNoteIds: new Set(["a", "b"]), bulkCollections: [], bulkTagPicker: { readTagIds: () => [] },
    notes: [{ note_id: "a", status: "active" }, { note_id: "b", status: "archived" }], selectedNote: { note_id: "a" } };
  const context = vm.createContext({ document, Set, ...fakeDomConstructors(), state, isNotesWorkspaceSurface: true,
    NOTE_BULK_COLLECTION_UNCATEGORIZED: "__uncategorized__",
    bulkToolbar: document.createElement("details"), bulkEditButton: document.createElement("button"), bulkClearButton: document.createElement("button"),
    bulkApplyButton: document.createElement("button"), bulkDialog: document.createElement("dialog"),
    bulkLibraryInput: document.createElement("select"), bulkCollectionInput: document.createElement("select"),
    bulkTypeInput: document.createElement("select"), bulkVisibilityInput: document.createElement("select"), bulkTagActionInput: document.createElement("select"),
    requireApi: () => ({
      getJson: async () => ({ collections: [] }),
      postJson: async (/** @type {string} */ url, /** @type {unknown} */ payload) => { events.push([url, payload]); return { notes: [{ note_id: "a" }, { note_id: "b" }], errors: [] }; },
    }),
    requireView: () => ({ showModal: () => events.push("show") }),
    requireErrors: () => ({ caughtMessage: () => "Safe failure", readBulkFailures: (/** @type {{errors?: unknown[]}} */ result) => result.errors || [] }),
    readEnvelopeMember: (/** @type {{collections: unknown}} */ body) => body.collections,
    normalizeCollections: (/** @type {unknown} */ collections) => { events.push("normalize"); return collections; },
    populateBulkVisibilityOptions: () => {}, mountBulkTagPicker: async () => { events.push("tags"); },
    libraryLabel: (/** @type {string} */ bucket) => bucket,
    notesOptionElement: (/** @type {string} */ value, /** @type {string} */ label) => {
      const option = document.createElement("option"); option.value = value; option.textContent = label; return option;
    },
    setBulkFormStatus: /** @param {...unknown} args */ (...args) => events.push(["form", ...args]),
    setStatus: /** @param {...unknown} args */ (...args) => events.push(["status", ...args]),
    loadCollections: async () => events.push("collections"), loadNotes: async () => events.push("notes"),
    renderCollections: () => events.push("render-collections"), renderNotes: () => events.push("render-notes"),
    requireNoteFromEnvelope: (/** @type {{note: unknown}} */ value) => value.note,
    renderDetail: (/** @type {unknown} */ value) => events.push(["detail", value]),
    closeBulkEditor: () => events.push("close"), ...overrides });
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  const api = vm.runInContext(`({ ${names.join(", ")} })`, context);
  return { api, context, state, events, document };
}
/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));
const event = () => ({ preventDefault() {} });
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

describe("Notes bulk editing", () => {
  it("reads only explicit control writes and distinguishes no change from Uncategorized", () => {
    const { api, context } = bulk();
    assert.deepEqual(plain(api.readBulkNoteChanges()), {});
    context.bulkLibraryInput.value = "reference"; context.bulkCollectionInput.value = "__uncategorized__";
    context.bulkTypeInput.value = "meeting"; context.bulkVisibilityInput.value = "private";
    assert.deepEqual(plain(api.readBulkNoteChanges()), { libraryBucket: "reference", noteCollectionId: null, noteType: "meeting", visibility: "private" });
    context.bulkCollectionInput.value = "collection";
    assert.equal(api.readBulkNoteChanges().noteCollectionId, "collection");
    context.bulkLibraryInput = null; context.bulkCollectionInput = null; context.bulkTypeInput = null; context.bulkVisibilityInput = null;
    assert.deepEqual(plain(api.readBulkNoteChanges()), {});
  });

  it("keeps only visible non-archived selections and preserves toolbar preference and fallback", () => {
    const { api, state, context, document } = bulk();
    const published = document.createElement("span"); const fallback = document.createElement("span");
    fallback.setAttribute("data-view-bulk-selection-count", "");
    context.bulkToolbar.append(fallback); context.bulkToolbar.viewParts = { count: published };
    state.selectedNoteIds.add("off-page"); api.syncNoteSelectionToVisibleNotes();
    assert.deepEqual([...state.selectedNoteIds], ["a"]);
    api.syncNotesBulkToolbar();
    assert.equal(published.textContent, "1 selected"); assert.equal(fallback.textContent, "");
    assert.equal(context.bulkToolbar.open, true); assert.equal(context.bulkEditButton.disabled, false);
    context.bulkToolbar.viewParts = null;
    api.toggleBulkNoteSelection("a", false);
    assert.equal(fallback.textContent, "0 selected"); assert.equal(fallback.hidden, true);
    assert.equal(context.bulkToolbar.open, true); assert.equal(context.bulkClearButton.disabled, true);
    api.toggleBulkNoteSelection("a", true); assert.equal(fallback.hidden, false);
    context.bulkToolbar = null; context.bulkEditButton = null; context.bulkClearButton = null; api.syncNotesBulkToolbar();
  });

  it("filters validated collections by library and retains only available prior choices", () => {
    const { api, context, document } = bulk();
    context.state.bulkCollections = [
      { note_library_collection_id: "one", library_bucket: "reference", path_cache: "Parent / Child", title: "Child" },
      { note_library_collection_id: "two", library_bucket: "active_work", path_cache: "", title: "Work" },
    ];
    context.bulkCollectionInput.value = "two"; api.populateBulkCollectionOptions();
    assert.deepEqual(plain(context.bulkCollectionInput.children.map((/** @type {{textContent: string}} */ node) => node.textContent)),
      ["No change", "Uncategorized", "reference: Parent / Child", "active_work: Work"]);
    assert.equal(context.bulkCollectionInput.value, "two");
    context.bulkLibraryInput.value = "reference"; api.populateBulkCollectionOptions();
    assert.equal(context.bulkCollectionInput.value, "");
    assert.equal(context.bulkCollectionInput.children[2].textContent, "Parent / Child");
    context.bulkCollectionInput.value = "__uncategorized__"; api.populateBulkCollectionOptions();
    assert.equal(context.bulkCollectionInput.value, "__uncategorized__");
    context.bulkCollectionInput = null; api.populateBulkCollectionOptions();
    const wrong = document.createElement("div"); wrong.setAttribute("data-note-bulk-library", ""); document.body.append(wrong);
    assert.equal(api.findNotesControl("[data-note-bulk-library]", context.HTMLSelectElement), null);
  });

  it("opens only after collection normalization and tag mounting, with required access at its original time", async () => {
    let release = () => {};
    const pending = new Promise((resolve) => { release = () => resolve({ collections: [] }); });
    const { api, context, events, document } = bulk({ requireApi: () => ({ getJson: () => pending }) });
    context.bulkLibraryInput.value = "old"; context.bulkTypeInput.value = "old"; context.bulkTagActionInput.value = "old";
    const opening = api.openBulkEditor(); await flush();
    assert.equal(context.bulkLibraryInput.value, "old"); assert.equal(events.includes("normalize"), false);
    release(); await opening;
    assert.equal(context.bulkLibraryInput.value, ""); assert.equal(context.bulkTypeInput.value, ""); assert.equal(context.bulkTagActionInput.value, "");
    assert.ok(events.indexOf("normalize") < events.indexOf("tags")); assert.ok(events.indexOf("tags") < events.indexOf("show"));
    assert.equal(document.activeElement, context.bulkLibraryInput);
    events.length = 0; context.state.selectedNoteIds.clear(); await api.openBulkEditor(); assert.equal(events.length, 0);
    context.state.selectedNoteIds.add("a"); context.bulkLibraryInput = null;
    await api.openBulkEditor(); assert.ok(events.includes("normalize")); assert.equal(events.includes("show"), false);
    assert.deepEqual(plain(events.at(-1)), ["status", "Safe failure", true]);
  });

  it("validates empty selection, tag/action pairs, and no-change before any write", async () => {
    const { api, context, events } = bulk();
    for (const [selected, action, ids, message] of [
      [false, "", [], "Select at least one note to update."],
      [true, "add", [], "Choose at least one tag for the selected tag action."],
      [true, "", ["tag"], "Choose a tag action for the selected tags."],
      [true, "", [], "Choose at least one field to update."],
    ]) {
      context.state.selectedNoteIds = new Set(selected ? ["a"] : []); context.bulkTagActionInput.value = action;
      context.state.bulkTagPicker = { readTagIds: () => ids }; events.length = 0;
      await api.applyBulkEdit(event()); assert.deepEqual(plain(events), [["form", message, true]]);
    }
  });

  it("sends metadata then tags with the same ID snapshot and retains the union of per-note failures", async () => {
    const { api, context, state, events } = bulk();
    /** @type {unknown[]} */
    const requests = [];
    let release = () => {};
    const pending = new Promise((resolve) => { release = () => resolve({ notes: [{ note_id: "a" }], errors: [{ note_id: "b", message: "Metadata failed" }] }); });
    context.requireApi = () => ({ postJson: async (/** @type {string} */ url, /** @type {unknown} */ payload) => {
      requests.push([url, payload]); return url === "/api/notes/bulk" ? pending : { changed: [{ target_id: "b" }], errors: [{ target_id: "a", message: "Tags failed" }] };
    } });
    context.refreshSelectedNoteAfterBulk = (/** @type {Set<string>} */ ids) => events.push(["refresh", [...ids]]);
    context.bulkLibraryInput.value = "reference"; context.bulkTagActionInput.value = "add"; context.state.bulkTagPicker = { readTagIds: () => ["tag"] };
    const applying = api.applyBulkEdit(event()); await flush();
    assert.equal(requests.length, 1); assert.equal(context.bulkApplyButton.disabled, true);
    release(); await applying;
    assert.deepEqual(plain(requests), [["/api/notes/bulk", { noteIds: ["a", "b"], changes: { libraryBucket: "reference" } }],
      ["/api/tags/bulk-assignments", { action: "add", tagIds: ["tag"], targetIds: ["a", "b"], targetType: "note" }]]);
    assert.deepEqual([...state.selectedNoteIds], ["b", "a"]);
    assert.ok(events.includes("collections") && events.includes("notes"));
    assert.deepEqual(plain(events.find((value) => Array.isArray(value) && value[0] === "refresh")), ["refresh", ["a", "b"]]);
    assert.equal(events.includes("close"), false); assert.equal(context.bulkApplyButton.disabled, false);
    assert.deepEqual(plain(events.at(-1)), ["form", "Metadata failed", true]);
  });

  it("closes after partial success, keeps failed IDs, and does not roll back a first write on transport failure", async () => {
    const { api, context, state, events } = bulk();
    context.bulkTypeInput.value = "meeting"; context.refreshSelectedNoteAfterBulk = async () => {};
    context.requireApi = () => ({ postJson: async () => ({ notes: [{ note_id: "a" }], errors: [{ note_id: "b", message: "Denied" }, { message: "No identity" }] }) });
    await api.applyBulkEdit(event());
    assert.deepEqual([...state.selectedNoteIds], ["b"]); assert.ok(events.includes("close"));
    assert.deepEqual(plain(events.at(-1)), ["status", "Updated 1 notes; 1 could not be fully updated."]);
    state.selectedNoteIds = new Set(["a", "b"]); events.length = 0;
    context.bulkTagActionInput.value = "remove"; context.state.bulkTagPicker = { readTagIds: () => ["tag"] };
    /** @type {unknown[]} */
    const requests = [];
    context.requireApi = () => ({ postJson: async (/** @type {string} */ url) => {
      requests.push(url); if (url.includes("tags")) throw new Error("private failure"); return { notes: [{ note_id: "a" }, { note_id: "b" }] };
    } });
    await api.applyBulkEdit(event());
    assert.deepEqual(requests, ["/api/notes/bulk", "/api/tags/bulk-assignments"]);
    assert.deepEqual([...state.selectedNoteIds], ["a", "b"]); assert.equal(events.includes("collections"), false);
    assert.equal(events.includes("close"), false); assert.equal(context.bulkApplyButton.disabled, false);
    assert.deepEqual(plain(events.at(-1)), ["form", "Safe failure", true]);
  });

  it("refreshes only a changed selected detail through the checked envelope", async () => {
    const { api, context, state, events } = bulk();
    const note = { note_id: "a", title: "Fresh" };
    context.requireApi = () => ({ getJson: async (/** @type {string} */ url, /** @type {unknown} */ options) => {
      events.push([url, options]); return { note };
    } });
    await api.refreshSelectedNoteAfterBulk(new Set(["b"])); assert.equal(events.length, 0);
    await api.refreshSelectedNoteAfterBulk(new Set(["a"]));
    assert.equal(state.selectedNote, note);
    assert.deepEqual(plain(events), [["/api/notes/a", { cache: "no-store" }], ["detail", note]]);
  });
});
