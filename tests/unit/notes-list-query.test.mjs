import assert from "node:assert/strict";
import vm from "node:vm";
import { URLSearchParams } from "node:url";
import { describe, it } from "vitest";
import * as library from "../../src/modules/notes/library.js";
import { FakeDocument } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/notes.js");
const service = reader.readText("src/modules/notes/notes.service.js");
const names = ["buildNotesListQuery", "appendNotesQueryParam", "activeLibraryBucketFilter", "activeStatusFilter", "normalizeText", "normalizeWorkspaceType",
  "loadNotes", "readNoteListEnvelope", "readNotePagination", "isNoteListItem", "isResponseRecord", "hasTextColumns", "hasNullableTextColumns", "hasArrayMembers",
  "renderNotes", "renderEmptyList", "renderPreview", "readMarkdownPreview", "emptyPreviewNode", "requireNotesValue"];
/** @param {string} text @param {string} name */
function constant(text, name) {
  const match = text.match(new RegExp(`const ${name} = [\\s\\S]*?;`)); assert.ok(match, name); return match[0];
}
/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));
function listCase() {
  const document = new FakeDocument();
  /** @type {unknown[]} */
  const events = [];
  const state = { workspaceType: "business", activeBucket: "all", selectedCollectionId: "", page: 1,
    notes: /** @type {unknown[]} */ ([]), notesCursorStack: /** @type {string[]} */ ([]), notesNextCursor: "", notesCurrentCursor: "", previewRequestId: 0 };
  const context = vm.createContext({ document, state, URLSearchParams, events,
    sortSelect: { value: "" }, statusFilter: { value: "active" }, visibilityFilter: { value: "all" }, securityFilter: { value: "all" }, typeFilter: { value: "all" },
    contextFilter: { value: "" }, ownerFilter: { value: "" }, tagFilter: { value: "" }, updatedFilter: { value: "" }, collectionFilter: { value: "" },
    pageLabel: document.createElement("span"), prevButton: document.createElement("button"), nextButton: document.createElement("button"), notesList: document.createElement("div"),
    preview: document.createElement("div"), bodyInput: { value: "Body fallback" }, editor: { getValue: () => "Editor body" },
    requireApi: () => ({ getJson: async (/** @type {string} */ url, /** @type {unknown} */ options) => { events.push(["get", url, options]); return context.response; },
      postJson: async (/** @type {string} */ url, /** @type {unknown} */ payload) => { events.push(["post", url, payload]); return context.response; } }),
    syncNoteSelectionToVisibleNotes: () => events.push("prune-selection"), syncNotesBulkToolbar: () => events.push("bulk"),
    noteListItem: (/** @type {{note_id: string}} */ note) => { events.push(["row", note]); const row = document.createElement("button"); row.textContent = note.note_id; return row; },
    applyExternalMarkdownLinkPreference: () => events.push("link-preference"),
    safeNoteErrorMessage: (/** @type {Error} */ error) => { events.push(["error", error]); return "Safe preview failure"; },
  });
  for (const name of ["PAGE_SIZE", "DEFAULT_NOTE_SORT", "REQUIRED_NOTE_COLUMNS", "NULLABLE_NOTE_COLUMNS"]) vm.runInContext(constant(source, name), context);
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  let html = "";
  Object.defineProperty(context.preview, "innerHTML", { get: () => html, set: (/** @type {string} */ value) => {
    events.push(["html", value]); html = value; context.preview.textContent = value.replace(/<[^>]*>/g, "");
  } });
  const columns = vm.runInContext("({ required: REQUIRED_NOTE_COLUMNS, nullable: NULLABLE_NOTE_COLUMNS })", context);
  /** @type {Record<string, unknown>} */
  const note = { ...Object.fromEntries(columns.required.map((/** @type {string} */ key) => [key, "value"])),
    ...Object.fromEntries(columns.nullable.map((/** @type {string} */ key) => [key, null])), note_id: "first", tags: [] };
  return { api: vm.runInContext(`({ ${names.join(", ")} })`, context), context, state, events, note };
}
function receiver() {
  const context = vm.createContext({ ...library, Buffer, AppError: Error });
  for (const name of ["NOTE_TYPE_VALUES", "LIBRARY_BUCKET_VALUES", "NOTE_STATUS_VALUES", "NOTE_VISIBILITY_VALUES", "NOTE_SECURITY_MODE_VALUES", "NOTE_LIST_SORT_MODES", "NOTE_LIST_DEFAULT_PAGE_SIZE", "NOTE_LIST_MAX_PAGE_SIZE"]) vm.runInContext(constant(service, name), context);
  for (const name of ["normalizeListFilters", "normalizeLibraryBucketFilter", "normalizeOptionalListEnum", "normalizeEnum", "normalizeIdList", "normalizeOptionalText", "normalizeNoteListSort", "normalizeNoteListPagination", "decodeNoteListCursor", "normalizeOffset"]) vm.runInContext(extractFunctionBlock(service, name), context);
  return vm.runInContext("({ normalizeListFilters, normalizeNoteListPagination })", context);
}
/** @param {string} html */
const previewResult = (html) => ({ bodyFormat: "markdown", bodyHtmlFormat: "html", bodyMarkdown: "input", bodyHtml: html });
function deferred() {
  /** @type {(value: unknown) => void} */
  let resolve = () => {};
  /** @type {(error: Error) => void} */
  let reject = () => {};
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("Notes list query and rendering", () => {
  it("runs the outgoing query through the actual server receiver with every emitted key consumed", () => {
    const { api, context, state } = listCase();
    state.activeBucket = "reference"; state.selectedCollectionId = "collection & saved";
    for (const [name, value] of Object.entries({ sortSelect: "title_asc", visibilityFilter: "private", securityFilter: "normal", typeFilter: "meeting",
      contextFilter: "  Acme & Project  ", ownerFilter: "  Alice  ", tagFilter: "  useful tag  ", updatedFilter: "2026-09-01", collectionFilter: "ignored" })) context[name].value = value;
    const cursor = Buffer.from('{"offset":12}').toString("base64url");
    const query = api.buildNotesListQuery(cursor);
    assert.ok(query instanceof URLSearchParams);
    const outgoing = Object.fromEntries(query);
    assert.deepEqual(outgoing, { limit: "12", sort: "title_asc", cursor, libraryBucket: "reference", status: "active", visibility: "private", security: "normal", noteType: "meeting",
      context: "Acme & Project", owner: "Alice", tags: "useful tag", updatedSince: "2026-09-01", collection: "collection & saved" });
    const server = receiver(); const filters = server.normalizeListFilters(outgoing);
    assert.deepEqual(plain(server.normalizeNoteListPagination(outgoing, { paginate: true })), { offset: 12, pageSize: 12 });
    assert.deepEqual([filters.libraryBucket, filters.status, filters.visibility, filters.securityMode, filters.noteType, filters.contextSearch, filters.ownerSearch, filters.tagQuery,
      filters.updatedSince, filters.noteCollectionId, filters.sort], ["reference", "active", "private", "normal", "meeting", "Acme & Project", "Alice", "useful tag", "2026-09-01", "collection & saved", "title_asc"]);
    assert.equal(filters.searchQuery, ""); assert.equal(Object.hasOwn(outgoing, "q"), false);
    assert.equal(server.normalizeListFilters({}).status, ""); // The receiver does not require the browser's defaults.
    assert.equal(server.normalizeNoteListPagination({}, { paginate: true }).pageSize, 50);
  });

  it("preserves absent controls, sentinels, archive precedence, and Personal visibility omission", () => {
    const { api, context, state } = listCase();
    assert.deepEqual(Object.fromEntries(api.buildNotesListQuery()), { limit: "12", sort: "updated_desc", status: "active" });
    state.workspaceType = "personal"; state.activeBucket = "archive"; context.visibilityFilter.value = "private"; context.statusFilter.value = "pinned";
    context.collectionFilter.value = " uncategorized ";
    assert.deepEqual(Object.fromEntries(api.buildNotesListQuery()), { limit: "12", sort: "updated_desc", status: "archived", collection: "uncategorized" });
    state.activeBucket = "all";
    for (const name of ["sortSelect", "statusFilter", "visibilityFilter", "securityFilter", "typeFilter", "contextFilter", "ownerFilter", "tagFilter", "updatedFilter", "collectionFilter"]) context[name] = null;
    assert.deepEqual(Object.fromEntries(api.buildNotesListQuery()), { limit: "12", sort: "updated_desc", status: "active" });
  });

  it("loads checked list projections and renders the entire server page in response order", async () => {
    const { api, context, state, events, note } = listCase();
    const notes = Array.from({ length: 15 }, (_, index) => ({ ...note, note_id: String(15 - index) }));
    context.response = { notes: [null, ...notes, { note_id: "unreadable" }], pagination: { hasMore: true, limit: 12, pageSize: 12, nextCursor: "next" } };
    await api.loadNotes("cursor");
    assert.equal(state.notesCurrentCursor, "cursor"); assert.equal(state.notesNextCursor, "next"); assert.equal(state.notes.length, 15);
    const first = state.notes[0]; assert.ok(first && typeof first === "object");
    assert.equal(Object.hasOwn(first, "body_markdown"), false);
    assert.deepEqual(plain(events[0]), ["get", "/api/notes?limit=12&sort=updated_desc&cursor=cursor&status=active", { cache: "no-store" }]);
    state.page = 3; state.notesCursorStack.push("previous"); api.renderNotes();
    assert.equal(context.pageLabel.textContent, "Page 3"); assert.equal(context.prevButton.disabled, false); assert.equal(context.nextButton.disabled, false);
    assert.deepEqual(context.notesList.children.map((/** @type {{textContent: string}} */ row) => row.textContent), notes.map((note) => note.note_id));
    const rows = events.filter((event) => Array.isArray(event) && event[0] === "row");
    assert.equal(rows.length, 15); const firstRow = rows[0]; assert.ok(Array.isArray(firstRow));
    assert.equal(firstRow[1], notes[0]); assert.equal(events.at(-1), "bulk");
  });

  it("renders the existing empty state and preserves required-control failure order", () => {
    const { api, context, state, events, note } = listCase();
    api.renderNotes();
    assert.equal(context.pageLabel.textContent, "Page 1"); assert.equal(context.prevButton.disabled, true); assert.equal(context.nextButton.disabled, true);
    assert.equal(context.notesList.textContent, "No notes match the current filters."); assert.equal(events.at(-1), "bulk");
    state.notes = [note]; events.length = 0; context.notesList = null;
    assert.throws(() => api.renderNotes(), /Required Notes value/); assert.deepEqual(events, []);
    context.pageLabel = null; context.prevButton.disabled = false;
    assert.throws(() => api.renderNotes(), /Required Notes value/); assert.equal(context.prevButton.disabled, false);
  });

  it("previews the complete editor body through the checked response with no local truncation", async () => {
    const { api, context, events } = listCase();
    const body = "Full body ".repeat(1000); const html = `<p>${body}</p>`;
    context.editor.getValue = () => body; context.response = previewResult(html);
    await api.renderPreview();
    assert.deepEqual(plain(events[0]), ["post", "/api/notes/preview", { body_markdown: body }]);
    assert.equal(context.preview.innerHTML, html); assert.equal(context.preview.textContent, body);
    assert.deepEqual(plain(events.slice(1)), [["html", html], "link-preference"]);
    context.editor.getValue = () => ""; context.response = previewResult(" \n "); events.length = 0;
    await api.renderPreview();
    assert.deepEqual(plain(events[0]), ["post", "/api/notes/preview", { body_markdown: "Body fallback" }]);
    assert.equal(context.preview.textContent, "No preview.");
  });

  it("keeps hidden preview inert and missing required inputs failing before the request", async () => {
    const { api, context, state, events } = listCase();
    context.preview.hidden = true; context.bodyInput = null; context.editor = null;
    await assert.doesNotReject(() => api.renderPreview()); assert.deepEqual(events, []); assert.equal(state.previewRequestId, 0);
    context.preview.hidden = false;
    await assert.rejects(api.renderPreview(), /Required Notes value/); assert.deepEqual(events, []);
    context.preview = null;
    await assert.rejects(api.renderPreview(), /Required Notes value/); assert.equal(state.previewRequestId, 0);
  });

  it("refuses malformed preview envelopes before assigning HTML and uses the existing error forward", async () => {
    const { api, context, events } = listCase();
    for (const response of [null, { bodyHtml: "unsafe" }, { ...previewResult("valid"), bodyHtmlFormat: "text" }, { ...previewResult("valid"), bodyHtml: {} }]) {
      context.response = response; events.length = 0; await api.renderPreview();
      assert.equal(context.preview.textContent, "Safe preview failure");
      assert.equal(events.some((event) => Array.isArray(event) && event[0] === "html"), false);
      assert.equal(events.some((event) => Array.isArray(event) && event[0] === "error"), true);
    }
  });

  it("ignores stale preview success and failure while the newest response wins", async () => {
    for (const fail of [false, true]) {
      const { api, context, events } = listCase(); const first = deferred(); const second = deferred(); let calls = 0;
      context.requireApi = () => ({ postJson: () => (++calls === 1 ? first.promise : second.promise) });
      const old = api.renderPreview(); const current = api.renderPreview();
      assert.equal(context.preview.textContent, "Loading preview...");
      second.resolve(previewResult("<p>Latest</p>")); await current;
      if (fail) first.reject(new Error("Stale failure")); else first.resolve(previewResult("<p>Stale</p>"));
      await old;
      assert.equal(context.preview.textContent, "Latest");
      assert.deepEqual(plain(events), [["html", "<p>Latest</p>"], "link-preference"]);
    }
  });
});
