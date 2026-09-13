import assert from "node:assert/strict";
import vm from "node:vm";
import { setImmediate } from "node:timers/promises";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText;
const source = read("public/js/notes.js");
const names = ["selectNote", "renderDetailPrompt", "renderBlankDetailPrompt", "inlineFilterIcon", "transitionCreatedNoteToEdit",
  "loadRevisions", "revisionItem", "renderRevisionsPanel", "isNoteRevisionSummary", "readNoteRevisions", "hasNoMembers",
  "requireNoteFromEnvelope", "isNoteRecord", "isNoteListItem", "isResponseRecord", "hasTextColumns", "hasNullableTextColumns",
  "hasOptionalTextColumns", "hasArrayMembers", "requireNotesValue", "requireView", "safeNoteErrorMessage", "isSecureError", "isSecureNote",
  "formatToken", "formatDate", "normalizeText", "normalizeWorkspaceType", "emptyText", "mutateNote", "requireNoteMutationId", "hasNoteIdentity"];
const tableNames = ["REQUIRED_NOTE_COLUMNS", "NULLABLE_NOTE_COLUMNS", "REQUIRED_NOTE_DETAIL_COLUMNS", "NULLABLE_NOTE_DETAIL_COLUMNS", "OPTIONAL_NOTE_DETAIL_MEMBERS",
  "NOTE_REVISION_SECURITY_MODES", "REQUIRED_REVISION_COLUMNS", "NULLABLE_REVISION_COLUMNS", "FORBIDDEN_REVISION_STORAGE_COLUMNS", "FORBIDDEN_SECURE_REVISION_BODY_MEMBERS"];
// Lift declaration initializers verbatim: constructing our own tables would hide
// a weakened validation table from this suite and its mutation harness.
const tables = tableNames.map((name) => {
  const start = source.indexOf(`const ${name} = Object.freeze([`); assert.notEqual(start, -1, name);
  return source.slice(start, source.indexOf("]);", start) + 3);
}).join("\n");
const plain = (/** @type {unknown} */ value) => JSON.parse(JSON.stringify(value));

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
/** @param {Record<string, unknown>} [overrides] */
function revision(overrides = {}) {
  return { note_revision_id: "revision / one", revision_number: 2, title: "Earlier note", created_at: "not-a-date", library_bucket: "reference",
    security_mode: "normal", visibility: "private", body_excerpt: "Earlier body", change_summary: "Updated", ...overrides };
}
function deferred() {
  /** @type {(value?: unknown) => void} */ let resolve = () => {};
  /** @type {(reason?: unknown) => void} */ let reject = () => {};
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const browser = createFakeBrowserContext();
  // The shared fake's append forwards strings as nodes. Model only the platform's
  // string-to-Text conversion locally; the rendered test also exercises this prompt.
  const createElement = browser.document.createElement.bind(browser.document);
  browser.document.createElement = (/** @type {string} */ tag) => {
    const element = createElement(tag), append = element.append.bind(element);
    element.append = (/** @type {Array<import("../../scripts/test-support/fake-dom.mjs").FakeNode | string | null | undefined | false>} */ ...children) => append(...children.map((child) => typeof child === "string" ? browser.document.createTextNode(child) : child));
    return element;
  };
  /** @type {unknown[][]} */ const calls = [];
  const detail = browser.document.createElement("main"), title = browser.document.createElement("h2"), security = browser.document.createElement("select"), copy = browser.document.createElement("button");
  const state = { selectedNote: note({ title: "Old selection" }), workspaceType: "business", editingNoteId: "", editorNote: null,
    editorContextSummaries: { old: true }, editorStagedTargets: [{ label: "Staged" }] };
  const context = vm.createContext({ ...browser, state, calls, detailPanel: detail, dialogTitle: title, securityInput: security, copyLinkButton: copy,
    getAnswer: Promise.resolve({ note: note() }), postAnswer: Promise.resolve({ note: note() }), followAnswer: Promise.resolve(), tagAnswer: Promise.resolve(),
    requireApi: () => { calls.push(["api"]); if (context.apiError) throw context.apiError; return transport; },
    setStatus: (/** @type {unknown} */ message, /** @type {boolean} */ error = false) => calls.push(["status", message, error]),
    renderDetail: (/** @type {unknown} */ value) => { calls.push(["detail", value]); if (context.renderError) throw context.renderError; },
    renderNotes: () => calls.push(["list"]), closeNotesSlideOutDrawer: () => calls.push(["drawer"]), updateUrl: (/** @type {unknown} */ id) => calls.push(["url", id]),
    loadCollections: () => { calls.push(["collections"]); return Promise.resolve(); }, loadNotes: () => { calls.push(["reload-list"]); return Promise.resolve(); },
    writeNoteNotificationFollowFields: (/** @type {unknown} */ value) => { calls.push(["follow", value]); return context.followAnswer; },
    mountTagEditor: (/** @type {unknown} */ value) => { calls.push(["tags", value]); return context.tagAnswer; },
    mountNoteEditorFiles: (/** @type {unknown} */ value) => calls.push(["files", value]), renderEditorContextSelection: () => calls.push(["context"]),
  });
  const transport = { getJson: (/** @type {unknown} */ url, /** @type {unknown} */ options) => { calls.push(["get", url, options]); return context.getAnswer; },
    postJson: (/** @type {unknown} */ url, /** @type {unknown} */ body) => { calls.push(["post", url, body]); return context.postAnswer; } };
  vm.runInContext(read("public/js/shared/view-builder.js"), context);
  vm.runInContext(`${tables}\n${names.map((name) => extractFunctionBlock(source, name)).join("\n")}`, context);
  return { api: vm.runInContext(`({${names.join(",")}})`, context), context, calls, state, detail, title, security, copy, document: browser.document };
}

describe("Notes revision history and detail selection", () => {
  it("returns true only after the checked note has rendered, the list and drawer have updated, and the URL is set", async () => {
    const f = fixture(), pending = deferred(), selected = note(); f.context.getAnswer = pending.promise;
    const choosing = f.api.selectNote(selected.note_id);
    assert.deepEqual(plain(f.calls), [["api"], ["status", "Loading note...", false], ["get", "/api/notes/note%20%2F%20one", { cache: "no-store" }]]);
    assert.equal(f.state.selectedNote.title, "Old selection"); pending.resolve({ note: selected });
    assert.equal(await choosing, true); assert.strictEqual(f.state.selectedNote, selected);
    assert.deepEqual(plain(f.calls.slice(3)), [["detail", selected], ["list"], ["drawer"], ["url", selected.note_id], ["status", "", false]]);
  });

  it("returns false for failed or malformed reads, preserves the old selection, and sanitizes secure failures", async () => {
    for (const failure of [new Error("ordinary failure"), new Error("cipher key SECRET"), null, undefined, "decrypt SECRET", { message: 42 }, { message: { detail: "unreadable" } }]) {
      const f = fixture(), old = f.state.selectedNote; f.detail.textContent = "Previous note detail"; f.context.getAnswer = Promise.reject(failure);
      assert.equal(await f.api.selectNote("n"), false); assert.strictEqual(f.state.selectedNote, old);
      assert.equal(f.calls.some(([kind]) => ["detail", "list", "drawer", "url"].includes(String(kind))), false);
      const prompt = f.detail.children[0]; assert.ok(prompt); assert.equal(prompt.textContent.includes("SECRET"), false);
      assert.equal(f.calls.at(-1)?.[2], true); assert.doesNotMatch(f.detail.textContent, /Previous note detail/);
      if (String(failure).includes("cipher") || String(failure).includes("decrypt")) assert.equal(prompt.classList.contains("notes-locked-state"), true);
    }
    const f = fixture(); f.context.getAnswer = Promise.resolve({ note: { note_id: "n" } });
    assert.equal(await f.api.selectNote("n"), false); assert.equal(f.state.selectedNote.title, "Old selection");
  });

  it("keeps acquisition outside the catch and reports render failure after assigning the checked note", async () => {
    const f = fixture(), missing = new Error("Missing API"); f.context.apiError = missing;
    await assert.rejects(f.api.selectNote("n"), (error) => error === missing); assert.deepEqual(f.calls, [["api"]]);
    delete f.context.apiError; f.context.renderError = new Error("Cannot render");
    assert.equal(await f.api.selectNote("n"), false); assert.equal(f.state.selectedNote.title, "Readable note");
    assert.equal(f.calls.some(([kind]) => kind === "url"), false);
  });

  it("preserves the updated-but-not-refreshed outcome consumed by the real mutation workflow", async () => {
    const f = fixture(); f.context.getAnswer = Promise.reject(new Error("refresh failed"));
    await f.api.mutateNote("/mutation");
    assert.deepEqual(f.calls.at(-1), ["status", "Note was updated, but its details could not be refreshed. Reload Notes to check its current state.", true]);
    const good = fixture(); await good.api.mutateNote("/mutation"); assert.deepEqual(good.calls.at(-1), ["status", "", false]);
    const failed = fixture(); failed.context.postAnswer = Promise.reject(new Error("write failed"));
    await failed.api.mutateNote("/mutation"); assert.match(String(failed.calls.at(-1)?.[1]), /Note update|write failed/);
    assert.doesNotMatch(String(failed.calls.at(-1)?.[1]), /was updated/);
  });

  it("always replaces stale detail with readable text or an explicit fallback, preserving required-control timing", () => {
    const f = fixture(); f.api.renderDetailPrompt("<literal>", { locked: true });
    const prompt = f.detail.children[0]; assert.ok(prompt); assert.equal(prompt.textContent, "<literal>"); assert.equal(prompt.classList.contains("notes-locked-state"), true);
    for (const value of [null, undefined, false, 0, 42, [], { message: "wrong" }, Symbol("unreadable")]) {
      f.detail.replaceChildren(prompt); assert.equal(f.detail.textContent, "<literal>");
      assert.doesNotThrow(() => f.api.renderDetailPrompt(value));
      assert.notStrictEqual(f.detail.children[0], prompt);
      assert.equal(f.detail.textContent, "Note details could not be displayed.");
    }
    f.api.renderBlankDetailPrompt(); assert.match(f.detail.textContent, /Open the .* sidebar and select a note/);
    assert.ok(f.detail.querySelector(".notes-empty-state-icon"));
    f.api.renderDetailPrompt(42, { sidebarHint: true }); assert.match(f.detail.textContent, /Open the /);
    f.api.renderDetailPrompt(""); assert.equal(f.detail.textContent, "");
    let creations = 0; const original = f.document.createElement.bind(f.document);
    f.document.createElement = (/** @type {string} */ tag) => { creations += 1; return original(tag); };
    f.context.detailPanel = null;
    for (const value of ["Readable", null, { message: 42 }]) {
      creations = 0; assert.throws(() => f.api.renderDetailPrompt(value), /Required Notes value/); assert.equal(creations, 1);
    }
  });

  it("accepts unknown errors at the helper and returns only readable nonempty messages or the caller fallback", () => {
    const f = fixture();
    for (const value of [null, undefined, false, 0, 42, 1n, Symbol("ordinary"), "ordinary", [], {}, { message: null }, { message: false },
      { message: 0 }, { message: 42 }, { message: {} }, { message: ["ordinary"] }, { message: "" }]) {
      assert.equal(f.api.safeNoteErrorMessage(value, "Caller fallback"), "Caller fallback");
    }
    assert.equal(f.api.safeNoteErrorMessage(), "Note action failed.");
    assert.equal(f.api.safeNoteErrorMessage({ message: 42 }, ""), "");
    for (const value of [new Error("Readable failure"), { message: "Readable failure" }, Object.create({ message: "Readable failure" }),
      Object.assign(() => {}, { message: "Readable failure" }), vm.runInNewContext('new Error("Readable failure")')]) {
      assert.equal(f.api.safeNoteErrorMessage(value), "Readable failure");
    }
    assert.equal(f.api.safeNoteErrorMessage({ message: "  " }), "  ", "Truthy whitespace retains existing behavior");
    let reads = 0;
    assert.equal(f.api.safeNoteErrorMessage({ get message() { reads += 1; return "Readable failure"; } }), "Readable failure");
    assert.equal(reads, 2, "Classification and display each read once, as before");
  });

  it("retains secure classification for message and raw error forms without forwarding sensitive details", () => {
    const f = fixture(), locked = "Secure note is locked or could not be decrypted. Check secure-note access and server key configuration.";
    for (const word of ["secure", "decrypt", "encrypt", "cipher", "crypto", "key", "nonce", "auth", "authenticate", "unsupported state", "payload"]) {
      for (const value of [word.toUpperCase() + " SECRET", { message: word + " SECRET" }, { message: [word, "SECRET"] },
        Object.assign(() => {}, { message: word + " SECRET" }), Object.create({ message: word + " SECRET" }), { toString: () => word + " SECRET" }]) {
        assert.equal(f.api.isSecureError(value), true); assert.equal(f.api.safeNoteErrorMessage(value, "Caller fallback"), locked);
      }
    }
    assert.equal(f.api.isSecureError(), false);
    assert.equal(f.api.isSecureError({ message: "ordinary", toString: () => "cipher SECRET" }), false, "Truthy message retains precedence over the raw value");
    assert.equal(f.api.isSecureError({ message: "", toString: () => "cipher SECRET" }), true, "Falsy message still falls through to raw value");
    let reads = 0;
    assert.equal(f.api.safeNoteErrorMessage({ get message() { reads += 1; return "cipher SECRET"; } }), locked);
    assert.equal(reads, 1, "Secure return precedes a second message read");
  });

  it("confirms the current API throw producer stringifies hostile wire messages before Notes sees them", () => {
    const f = fixture(); vm.runInContext(read("public/js/shared/error-contract.js"), f.context);
    for (const message of [42, { detail: "ordinary" }, ["ordinary"], false, null]) {
      const thrown = f.context.window.LongtailForge.errors.createError({ error: { message } }, "Request failed", 503);
      assert.equal(typeof thrown.message, "string"); assert.equal(typeof f.api.safeNoteErrorMessage(thrown), "string");
    }
    const thrown = f.context.window.LongtailForge.errors.createError({ error: { message: ["cipher", "SECRET"] } }, "Request failed", 503);
    assert.equal(f.api.isSecureError(thrown), true); assert.doesNotMatch(f.api.safeNoteErrorMessage(thrown), /SECRET/);
  });

  it("transitions only a saved note and awaits follow then tags before files/context, retaining required-control timing", async () => {
    const f = fixture(), follow = deferred(), tags = deferred(), linked = { project: { label: "Project" } }, saved = note({ linked_context: linked });
    f.copy.hidden = true; f.copy.disabled = true; f.context.followAnswer = follow.promise; f.context.tagAnswer = tags.promise;
    for (const missing of [null, undefined, { note_id: "" }]) await f.api.transitionCreatedNoteToEdit(missing);
    assert.deepEqual(plain(f.calls), []); const editing = f.api.transitionCreatedNoteToEdit(saved);
    assert.equal(f.state.editingNoteId, saved.note_id); assert.strictEqual(f.state.editorNote, saved); assert.strictEqual(f.state.editorContextSummaries, linked);
    assert.deepEqual(plain(f.state.editorStagedTargets), []); assert.equal(f.title.textContent, "Edit Note"); assert.equal(f.security.disabled, true);
    assert.equal(f.copy.hidden, false); assert.equal(f.copy.disabled, false); assert.deepEqual(plain(f.calls), [["follow", saved]]);
    follow.resolve(); await setImmediate(); assert.deepEqual(f.calls.map(([kind]) => kind), ["follow", "tags"]);
    tags.resolve(); await editing; assert.deepEqual(f.calls.map(([kind]) => kind), ["follow", "tags", "files", "context"]);
    const optional = fixture(), summaries = optional.state.editorContextSummaries; optional.context.copyLinkButton = null;
    await optional.api.transitionCreatedNoteToEdit(note({ linked_context: null })); assert.strictEqual(optional.state.editorContextSummaries, summaries);
    for (const control of ["dialogTitle", "securityInput"]) {
      const absent = fixture(); absent.context[control] = null;
      await assert.rejects(absent.api.transitionCreatedNoteToEdit(saved), /Required Notes value/);
      assert.strictEqual(absent.state.editorNote, saved); assert.deepEqual(absent.calls, []);
      if (control === "securityInput") assert.equal(absent.title.textContent, "Edit Note");
    }
    const failed = fixture(); failed.context.followAnswer = Promise.reject(new Error("follow failed"));
    await assert.rejects(failed.api.transitionCreatedNoteToEdit(saved), /follow failed/); assert.equal(failed.calls.length, 1);
  });

  it("builds the collapsed revision shell with its loading and archived markers", () => {
    const f = fixture(); for (const status of ["active", "archived"]) {
      const panel = f.api.renderRevisionsPanel(note({ status })); assert.equal(panel.tagName, "DETAILS"); assert.notEqual(panel.open, true);
      assert.equal(panel.querySelector("summary").textContent, "Revisions"); const list = panel.querySelector("[data-note-revisions-list]");
      assert.ok(list); assert.equal(list.textContent, "Loading revisions..."); assert.equal(list.dataset.archived, status === "archived" ? "true" : undefined);
    }
  });

  it("renders checked revision labels, metadata, secure privacy and restore controls", () => {
    const f = fixture(); let row = f.api.revisionItem(note(), revision({ revision_number: 1 }));
    assert.ok(row); assert.equal(row.querySelector("strong").textContent, "Original");
    assert.equal(row.querySelectorAll("p")[0].textContent, "Updated - Reference - Private - Normal - not-a-date");
    assert.equal(row.querySelectorAll("p")[1].textContent, "Earlier body"); assert.equal(row.querySelector("button").hidden, false); assert.equal(row.querySelector("button").type, "button");
    row = f.api.revisionItem(note({ status: "archived", security_mode: "secure" }), revision({ revision_number: 3, security_mode: "secure", body_excerpt: null }));
    assert.equal(row.querySelector("strong").textContent, "Revision 3"); assert.equal(row.querySelectorAll("p")[1].textContent, "Secure revision body hidden from history.");
    assert.equal(row.querySelector("button").hidden, true); assert.equal(row.querySelector("button").title, "Secure revision restore re-encrypts the restored body.");
    f.state.workspaceType = "personal"; row = f.api.revisionItem(note(), revision({ body_excerpt: null, change_summary: null }));
    assert.equal(row.querySelectorAll("p")[0].textContent, "Reference - Normal - not-a-date"); assert.equal(row.querySelectorAll("p")[1].textContent, "Earlier note");
    assert.equal(f.api.revisionItem(note(), revision({ body_excerpt: "", title: "" })).querySelectorAll("p")[1].textContent, "");
  });

  it("drops unreadable rows without weakening the real revision tables or secure-body predicate", () => {
    const f = fixture(); for (const bad of [null, [], "bad", revision({ title: null }), revision({ revision_number: 1.5 }), revision({ note_revision_id: "" }),
      revision({ security_mode: "mystery" }), revision({ secure_payload: "SECRET" }), revision({ security_mode: "secure", body_excerpt: "SECRET" }),
      revision({ security_mode: "secure", body_excerpt: null, body_markdown: "SECRET" })]) {
      assert.equal(f.api.isNoteRevisionSummary(bad), false);
      let row; assert.doesNotThrow(() => { row = f.api.revisionItem(note(), bad); }); assert.equal(row, null);
    }
    assert.equal(f.calls.some(([kind]) => kind === "post"), false);
  });

  it("restores the exact revision before refreshing the same note and sanitizes restore errors", async () => {
    const f = fixture(), pending = deferred(); f.context.postAnswer = pending.promise;
    const row = f.api.revisionItem(note(), revision()); const clicked = row.querySelector("button").click();
    assert.deepEqual(plain(f.calls), [["api"], ["post", "/api/notes/note%20%2F%20one/revisions/revision%20%2F%20one/restore", {}]]);
    pending.resolve(); await clicked; assert.equal(f.calls.some(([kind]) => kind === "get"), true);
    const bad = fixture(); bad.context.postAnswer = Promise.reject(new Error("cipher SECRET"));
    await bad.api.revisionItem(note(), revision()).querySelector("button").click();
    assert.equal(bad.calls.some(([kind]) => kind === "get"), false); assert.equal(bad.calls.at(-1)?.[2], true); assert.doesNotMatch(String(bad.calls.at(-1)?.[1]), /SECRET/);
  });

  it("loads checked history without caching, preserves empty/error states and tolerates an absent mount after acquiring the API", async () => {
    const f = fixture(), list = f.document.createElement("div");
    await f.api.loadRevisions(note(), null); assert.deepEqual(f.calls, [["api"]]);
    f.calls.length = 0; f.context.getAnswer = Promise.resolve({ revisions: [revision({ revision_number: 3 }), revision({ revision_number: 1 })] });
    await f.api.loadRevisions(note(), list); assert.deepEqual(plain(f.calls.slice(0, 2)), [["api"], ["get", "/api/notes/note%20%2F%20one/revisions", { cache: "no-store" }]]);
    assert.deepEqual(Array.from(list.children, (/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ row) => row.querySelector("strong").textContent), ["Revision 3", "Original"]);
    f.context.getAnswer = Promise.resolve({ revisions: [] }); await f.api.loadRevisions(note(), list); assert.equal(list.textContent, "No revisions.");
    f.context.getAnswer = Promise.resolve({}); await f.api.loadRevisions(note(), list); assert.equal(list.textContent, "The revision history could not be read.");
    f.context.getAnswer = Promise.reject(null); await f.api.loadRevisions(note(), list); assert.equal(list.textContent, "Revisions could not be loaded.");
  });

  it("keeps readable revision identities and order, announces omissions, and never presents unreadable history as empty", async () => {
    const f = fixture(), list = f.document.createElement("div");
    const first = revision({ note_revision_id: "first", revision_number: 3 }), last = revision({ note_revision_id: "last", revision_number: 1 });
    const bad = revision({ title: { privateMarker: "SECRET" } });
    const body = { revisions: [first, bad, last], extra: "preserve" }; f.context.getAnswer = Promise.resolve(body);
    assert.equal(f.api.readNoteRevisions(body), null, "The existing complete-history contract remains strict");
    await f.api.loadRevisions(note(), list);
    assert.equal(list.querySelectorAll("article").length, 2);
    assert.deepEqual(Array.from(list.querySelectorAll("strong"), (/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ title) => title.textContent), ["Revision 3", "Original"]);
    assert.equal(list.children.at(-1)?.textContent, "Some revisions could not be read. History is incomplete.");
    assert.doesNotMatch(list.textContent, /SECRET/); assert.strictEqual(body.revisions[1], bad);
    await list.querySelectorAll("button")[1].click();
    assert.ok(f.calls.some(([kind, url]) => kind === "post" && String(url).endsWith("/revisions/last/restore")));
    for (const unreadable of [[bad], [null], [revision({ security_mode: "secure", body_excerpt: "SECRET" })]]) {
      f.context.getAnswer = Promise.resolve({ revisions: unreadable }); await f.api.loadRevisions(note(), list);
      assert.equal(list.querySelectorAll("article").length, 0);
      assert.equal(list.textContent, "Some revisions could not be read. History is incomplete.");
    }
  });
});
