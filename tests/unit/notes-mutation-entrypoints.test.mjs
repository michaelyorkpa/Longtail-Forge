import assert from "node:assert/strict";
import vm from "node:vm";
import { setImmediate } from "node:timers/promises";
import { describe, it } from "vitest";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/notes.js");
const names = ["addNoteLink", "removeNoteLink", "archiveNote", "restoreNote", "refreshEditorNote", "requireNoteFromEnvelope", "isNoteRecord", "isNoteListItem", "isResponseRecord", "hasTextColumns", "hasNullableTextColumns", "hasOptionalTextColumns", "hasArrayMembers", "isNoteLinkDisplay"];
const tables = ["REQUIRED_NOTE_COLUMNS", "NULLABLE_NOTE_COLUMNS", "REQUIRED_NOTE_DETAIL_COLUMNS", "NULLABLE_NOTE_DETAIL_COLUMNS", "OPTIONAL_NOTE_DETAIL_MEMBERS"].map((name) => {
  const start = source.indexOf(`const ${name} = Object.freeze([`); assert.notEqual(start, -1);
  return source.slice(start, source.indexOf("]);", start) + 3);
}).join("\n");
// Input fixture values are independent of the lifted validation tables. No mutation
// of a declaration or fixture-created state is credited as runtime evidence.
/** @param {Record<string, unknown>} [overrides] */
function note(overrides = {}) {
  return { note_id: "note / one", title: "Readable note", status: "active", security_mode: "normal", created_at: "2026-01-01", updated_at: "2026-01-02",
    library_bucket: "reference", library_bucket_source: "manual", note_type: "general", visibility: "private", workspace_id: "workspace",
    archived_at: null, body_excerpt: null, client_id: null, created_by_user_id: null, deleted_at: null, import_source: null, import_source_id: null,
    imported_at: null, linked_user_id: null, note_collection_id: null, owner_user_id: null, project_id: null, slug: null, task_id: null, ticket_id: null,
    updated_by_user_id: null, body_markdown: "Readable body", owner_display_name: "Owner", body_plaintext_index: null, import_batch_id: null,
    import_source_path: null, metadata_json: null, original_notebook: null, original_page_id: null, original_section: null, original_section_group: null,
    tags: [], links: [], ...overrides };
}
function deferred() {
  /** @type {(value: unknown) => void} */ let resolve = () => {};
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  /** @type {unknown[][]} */ const calls = [];
  const state = { editorNote: note({ title: "Old editor" }), selectedNote: note({ title: "Old selection" }) };
  const context = vm.createContext({ state,
    postAnswer: Promise.resolve(), selectAnswer: Promise.resolve(false), mutateAnswer: Promise.resolve(false), getAnswer: Promise.resolve({ note: note() }), listAnswer: Promise.resolve(),
    requireApi: () => transport,
    selectNote: (/** @type {unknown} */ id) => { calls.push(["select", id]); return context.selectAnswer; },
    mutateNote: (/** @type {unknown} */ url) => { calls.push(["mutate", url]); return context.mutateAnswer; },
    renderDetail: (/** @type {unknown} */ record) => calls.push(["detail", record]),
    loadNotes: () => { calls.push(["load"]); return context.listAnswer; },
    renderNotes: () => calls.push(["render-list"]), renderEditorContextSelection: () => calls.push(["render-context"]),
  });
  const transport = {
    postJson: (/** @type {unknown} */ url, /** @type {unknown} */ payload) => { calls.push(["post", url, payload]); return context.postAnswer; },
    getJson: (/** @type {unknown} */ url, /** @type {unknown} */ options) => { calls.push(["get", url, options]); return context.getAnswer; },
  };
  vm.runInContext(`${tables}\n${names.map((name) => extractFunctionBlock(source, name)).join("\n")}`, context);
  return { api: vm.runInContext(`({${names.join(",")}})`, context), context, calls, state };
}
const plain = (/** @type {unknown} */ value) => JSON.parse(JSON.stringify(value));
describe("Notes persisted-note mutation and refresh entrypoints", () => {
  it("adds with the same payload and encoded identity, awaiting write then selection even when selection resolves false", async () => {
    const f = fixture(), write = deferred(), selection = deferred(), payload = Object.freeze({ targetId: "target", extra: { opaque: true } });
    f.context.postAnswer = write.promise; f.context.selectAnswer = selection.promise;
    let settled = false; const result = f.api.addNoteLink({ note_id: "note / one" }, payload).then((/** @type {unknown} */ value) => { settled = true; return value; });
    assert.deepEqual(plain(f.calls), [["post", "/api/notes/note%20%2F%20one/links", payload]]); assert.strictEqual(f.calls[0][2], payload);
    await setImmediate(); assert.equal(settled, false); assert.equal(f.calls.length, 1);
    write.resolve(undefined); await setImmediate(); assert.deepEqual(plain(f.calls[1]), ["select", "note / one"]); assert.equal(settled, false);
    selection.resolve(false); assert.equal(await result, undefined); assert.equal(f.calls.length, 2);
  });
  it("propagates add write failures without selecting, and selection failures after the write without a second write", async () => {
    const f = fixture(), failure = { message: "write failure" }; f.context.postAnswer = Promise.reject(failure);
    await assert.rejects(f.api.addNoteLink({ note_id: "n" }, null), (error) => error === failure); assert.equal(f.calls.length, 1);
    const g = fixture(), refreshFailure = new Error("refresh failure"); g.context.selectAnswer = Promise.reject(refreshFailure);
    await assert.rejects(g.api.addNoteLink({ note_id: "n" }, "opaque"), (error) => error === refreshFailure);
    assert.deepEqual(plain(g.calls), [["post", "/api/notes/n/links", "opaque"], ["select", "n"]]);
  });
  it("removes with the checked display reader's camel-first, legacy and absent-id coercion unchanged", async () => {
    for (const [link, encoded] of [[{ noteLinkId: "camel / id", note_link_id: "legacy" }, "camel%20%2F%20id"], [{ noteLinkId: "", note_link_id: "legacy / id" }, "legacy%20%2F%20id"], [{}, "undefined"], [{ note_link_id: "" }, ""]]) {
      const f = fixture(); assert.equal(f.api.isNoteLinkDisplay(link), true);
      assert.equal(await f.api.removeNoteLink({ note_id: "note / one" }, link), undefined);
      assert.deepEqual(plain(f.calls), [["post", `/api/notes/note%20%2F%20one/links/${encoded}/remove`, {}], ["select", "note / one"]]);
    }
    const f = fixture(); for (const value of [null, [], { noteLinkId: 12 }, { note_link_id: Symbol("bad") }]) assert.equal(f.api.isNoteLinkDisplay(value), false);
  });
  it("waits for a removal write before selecting, and preserves write refusal without refresh", async () => {
    const f = fixture(), gate = deferred(); f.context.postAnswer = gate.promise;
    const result = f.api.removeNoteLink({ note_id: "n" }, { noteLinkId: "l" }); await setImmediate(); assert.equal(f.calls.length, 1);
    gate.resolve(undefined); await result; assert.deepEqual(plain(f.calls[1]), ["select", "n"]);
    const g = fixture(), failure = new Error("remove refused"); g.context.postAnswer = Promise.reject(failure);
    await assert.rejects(g.api.removeNoteLink({ note_id: "n" }, { noteLinkId: "l" }), (error) => error === failure); assert.equal(g.calls.length, 1);
  });
  it("delegates archive and restore to the existing mutation outcome owner and waits without redefining its result", async () => {
    for (const [name, action] of [["archiveNote", "archive"], ["restoreNote", "restore"]]) {
      const f = fixture(), gate = deferred(); f.context.mutateAnswer = gate.promise;
      let settled = false; const result = f.api[name]({ note_id: "note / one" }).then((/** @type {unknown} */ value) => { settled = true; return value; });
      assert.deepEqual(plain(f.calls), [["mutate", `/api/notes/note%20%2F%20one/${action}`]]); await setImmediate(); assert.equal(settled, false);
      gate.resolve(false); assert.equal(await result, undefined);
      const g = fixture(), failure = new Error("mutation refused"); g.context.mutateAnswer = Promise.reject(failure);
      await assert.rejects(g.api[name]({ note_id: "n" }), (error) => error === failure);
    }
  });
  it("refreshes the matching editor/selection with the checked record before waiting for the list, then draws list and context", async () => {
    const f = fixture(), record = note({ title: "New record" }), gate = deferred(); f.context.getAnswer = Promise.resolve({ note: record }); f.context.listAnswer = gate.promise;
    let settled = false; const result = f.api.refreshEditorNote(record.note_id).then((/** @type {unknown} */ value) => { settled = true; return value; });
    await setImmediate(); assert.strictEqual(f.state.editorNote, record); assert.strictEqual(f.state.selectedNote, record); assert.equal(settled, false);
    assert.deepEqual(plain(f.calls), [["get", "/api/notes/note%20%2F%20one", { cache: "no-store" }], ["detail", record], ["load"]]);
    gate.resolve(undefined); assert.strictEqual(await result, record); assert.deepEqual(plain(f.calls.slice(-2)), [["render-list"], ["render-context"]]);
  });
  it("leaves a different or absent selected note alone while updating the editor and list", async () => {
    for (const selected of [note({ note_id: "other" }), null]) {
      const f = fixture(); f.context.state.selectedNote = selected; const record = note(); f.context.getAnswer = Promise.resolve({ note: record });
      assert.strictEqual(await f.api.refreshEditorNote(record.note_id), record); assert.strictEqual(f.state.editorNote, record); assert.strictEqual(f.context.state.selectedNote, selected);
      assert.deepEqual(f.calls.map((row) => row[0]), ["get", "load", "render-list", "render-context"]);
    }
  });
  it("rejects failed reads and unreadable envelopes before publishing state or rendering", async () => {
    for (const body of [null, {}, { note: note({ links: null }) }, { note: note({ note_id: "" }) }]) {
      const f = fixture(), priorEditor = f.state.editorNote, priorSelection = f.state.selectedNote; f.context.getAnswer = Promise.resolve(body);
      await assert.rejects(f.api.refreshEditorNote("n"), /note response did not contain a note/);
      assert.strictEqual(f.state.editorNote, priorEditor); assert.strictEqual(f.state.selectedNote, priorSelection); assert.equal(f.calls.length, 1);
    }
    const f = fixture(), failure = new Error("read refused"), prior = f.state.editorNote; f.context.getAnswer = Promise.reject(failure);
    await assert.rejects(f.api.refreshEditorNote("n"), (error) => error === failure); assert.strictEqual(f.state.editorNote, prior); assert.equal(f.calls.length, 1);
  });
  it("preserves a committed detail refresh when the following list read fails, without drawing stale list or context", async () => {
    const f = fixture(), record = note(), failure = new Error("list failed"); f.context.getAnswer = Promise.resolve({ note: record }); f.context.listAnswer = Promise.reject(failure);
    await assert.rejects(f.api.refreshEditorNote(record.note_id), (error) => error === failure);
    assert.strictEqual(f.state.editorNote, record); assert.strictEqual(f.state.selectedNote, record);
    assert.deepEqual(f.calls.map((row) => row[0]), ["get", "detail", "load"]);
  });
});
