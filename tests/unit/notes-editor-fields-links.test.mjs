import assert from "node:assert/strict";
import vm from "node:vm";
import { setImmediate } from "node:timers/promises";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText;
const source = read("public/js/notes.js");
const builder = read("public/js/shared/view-builder.js");
const renderer = read("public/js/shared/view-renderer.js");
const manifestLiteral = read("src/modules/notes/module.js").match(/viewSurfaces:\s*(\[[\s\S]*?\n  \]),\n  browserAssets/);
assert.ok(manifestLiteral);
const manifest = vm.runInNewContext(`(${manifestLiteral[1]})`, { NOTE_PERMISSIONS: new Proxy({}, { get: (_target, key) => String(key) }) })[0];
const names = ["requireView", "modalFieldOptions", "isNoteFieldOptionPair", "noteSelect", "noteInput", "noteTextarea", "notesOptionElement", "noteFieldLabel",
  "renderLinksPanel", "linkItem", "linkPayloadFromTarget", "linkedRecordsField", "notePrimaryContextSummary", "isNoteContextLabel", "isNoteLinkDisplay",
  "isResponseRecord", "formatToken", "unavailableTargetLabel", "usesBusinessScope", "workspaceHasClientTools", "normalizeWorkspaceType", "normalizeText", "linkRecordNodes", "notePrimaryContextItem",
  "scopeNotesVisibilityContributions", "scopeNotesVisibilityOptions", "readSelectedLinkTarget"];
/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

function fixture() {
  const browser = createFakeBrowserContext({ workspaceContext: { workspaceCapabilities: { availableTools: ["clients_projects"] } } });
  /** @type {unknown[][]} */ const calls = [];
  /** @type {Map<number, { callback: () => Promise<void>, delay: number }>} */ const timers = new Map();
  let nextTimer = 0;
  const context = vm.createContext({ ...browser, calls, state: { workspaceType: "business" },
    descriptor: plain(manifest.detail.linkedRecords), fetchAnswer: Promise.resolve([]),
    fetchLinkTargets: (/** @type {unknown} */ query) => { calls.push(["fetch", query]); return context.fetchAnswer; },
    notesLinkedRecordsDescriptor: () => context.descriptor,
    populateLinkTargetTypeSelect: (/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ select) => { select.value = "project"; },
    // This boundary supplies directory results; the tests observe Notes' loading,
    // request, debounce and submission behavior, not this stand-in's option layout.
    populateLinkTargetSelect: (/** @type {unknown} */ select, /** @type {unknown} */ targets) => calls.push(["populate", select, targets]),
    addNoteLink: (/** @type {unknown} */ note, /** @type {unknown} */ payload) => calls.push(["add", note, payload]),
    removeNoteLink: (/** @type {unknown} */ note, /** @type {unknown} */ link) => calls.push(["remove", note, link]),
  });
  context.window.Option = function (/** @type {string} */ text, /** @type {string} */ value) {
    const option = browser.document.createElement("option"); option.textContent = text; option.value = value; return option;
  };
  context.window.setTimeout = (/** @type {() => Promise<void>} */ callback, /** @type {number} */ delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; };
  context.window.clearTimeout = (/** @type {number} */ id) => timers.delete(id);
  vm.runInContext(read("public/js/shared/view-surface-descriptor.js"), context);
  vm.runInContext(builder, context);
  const view = context.window.LongtailForge.view;
  context.requireViewPrimitives = () => view;
  vm.runInContext(extractFunctionBlock(renderer, "renderDescriptorLinkedRecordsPanel"), context);
  context.requireDescriptorRenderers = () => ({ renderDescriptorLinkedRecordsPanel: context.renderDescriptorLinkedRecordsPanel });
  const labels = source.match(/const LINK_TARGET_TYPE_LABELS = \{[\s\S]*?\n  \};/); assert.ok(labels);
  vm.runInContext(`${labels[0]}\n${names.map((name) => extractFunctionBlock(source, name)).join("\n")}\n${extractFunctionBlock(builder, "normalizeFieldOptions")}`, context);
  return { api: vm.runInContext(`({${names.join(",")},normalizeFieldOptions})`, context), context, calls, timers, view, document: browser.document };
}

describe("Notes editor field constructors and linked-context panel", () => {
  it("reads the actual manifest through the shared projection and preserves workspace scope and option order", () => {
    const { api, context } = fixture();
    for (const workspaceType of ["business", "family", "personal"]) {
      context.state.workspaceType = workspaceType;
      const descriptor = api.scopeNotesVisibilityContributions(manifest);
      const editor = descriptor.modals.find((/** @type {{id: string}} */ modal) => modal.id === "note-editor");
      assert.deepEqual(plain(api.modalFieldOptions(editor, "library")), [["active_work", "Active Work"], ["ongoing_area", "Ongoing Areas"], ["reference", "Reference Library"]]);
      const visibility = api.modalFieldOptions(editor, "visibility");
      assert.deepEqual(plain(visibility).map((/** @type {string[]} */ option) => option[0]), workspaceType === "personal" ? [] : workspaceType === "business"
        ? ["internal", "private", "workspace", "client_visible", "public"] : ["internal", "private", "workspace", "public"]);
      const collection = descriptor.modals.find((/** @type {{id: string}} */ modal) => modal.id === "note-collection");
      assert.deepEqual(plain(api.modalFieldOptions(collection, "parent")), [["", "Root collection"]]);
    }
  });

  it("retains tuple identity and metadata and reads the record vocabulary emitted by the shared field normalizer", () => {
    const { api } = fixture();
    const manifestTuple = manifest.filters.find((/** @type {{field: string}} */ field) => field.field === "status").options[0];
    assert.deepEqual(plain(manifestTuple), ["active", "Active", true]);
    const preserved = api.modalFieldOptions({ fields: [{ field: "status", options: [manifestTuple] }] }, "status");
    assert.strictEqual(preserved[0], manifestTuple); assert.equal(preserved[0][2], true);
    const tuple = ["private", "Private", true, { opaque: true }];
    const records = api.normalizeFieldOptions([["public", "Public"], ["internal", "Internal"]]);
    const options = [tuple, ...records, {}, { value: "fallback" }, { label: "Label only" }, { value: null, label: null }, { value: "v", label: "" }];
    const modal = { fields: [{ field: "other", options: [["wrong", "Wrong"]] }, { field: "visibility", options }] };
    assert.doesNotThrow(() => api.modalFieldOptions(modal, "visibility"));
    const result = api.modalFieldOptions(modal, "visibility");
    assert.strictEqual(result[0], tuple); assert.strictEqual(result[0][3], tuple[3]);
    assert.deepEqual(plain(result).slice(1), [["public", "Public"], ["internal", "Internal"], ["", ""], ["fallback", "fallback"], ["", "Label only"], ["", ""], ["v", ""]]);
    assert.deepEqual(plain(api.modalFieldOptions({}, "missing")), []);
    assert.deepEqual(plain(api.modalFieldOptions({ fields: [{ field: "missing" }] }, "missing")), []);
    assert.deepEqual(plain(api.modalFieldOptions(modal, "absent")), []);
    assert.equal(options.length, 8);
    assert.doesNotThrow(() => api.modalFieldOptions({}, "missing"));
  });

  it("refuses unreadable option values without coercion or silently shortening the option list", () => {
    const { api } = fixture();
    const poison = { toString() { throw new Error("must not coerce"); } };
    for (const entry of [null, undefined, 0, false, "private", [], ["private"], [0, "Zero"], ["private", poison], { value: 1 }, { value: "x", label: poison }]) {
      assert.throws(() => api.modalFieldOptions({ fields: [{ field: "x", options: [["good", "Good"], entry] }] }, "x"), /string values and labels/);
    }
  });

  it("constructs actual shared-view inputs and textareas with the existing defaults and explicit attributes", () => {
    const { api } = fixture();
    const input = api.noteInput("noteTitle"); assert.equal(input.tagName, "INPUT"); assert.equal(input.dataset.noteTitle, "");
    assert.equal(input.getAttribute("type"), "text"); assert.equal(input.hasAttribute("required"), false);
    const required = api.noteInput("noteLinkSearch", { type: "search", required: true });
    assert.equal(required.dataset.noteLinkSearch, ""); assert.equal(required.getAttribute("type"), "search"); assert.equal(required.hasAttribute("required"), true);
    const textarea = api.noteTextarea("noteBody"); assert.equal(textarea.tagName, "TEXTAREA"); assert.equal(textarea.dataset.noteBody, ""); assert.equal(textarea.getAttribute("rows"), "10");
    assert.equal(api.noteTextarea("noteBody", { rows: 14 }).getAttribute("rows"), "14");
    assert.equal(api.noteTextarea("noteBody", { rows: 0 }).getAttribute("rows"), "10");
  });

  it("constructs select options in order, preserves empty labels and leaves tuple metadata to its owner", () => {
    const { api } = fixture();
    const tuple = ["later", "Later", true];
    const select = api.noteSelect("noteType", [["", "Pick one"], ["first", ""], tuple]);
    assert.equal(select.tagName, "SELECT"); assert.equal(select.dataset.noteType, "");
    assert.deepEqual(Array.from(select.children, (/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ option) => [option.getAttribute("value"), option.textContent]), [["", "Pick one"], ["first", ""], ["later", "Later"]]);
    assert.equal(select.children[2].hasAttribute("selected"), false);
    assert.equal(api.noteSelect("noteClientId", []).children.length, 0); assert.deepEqual(tuple, ["later", "Later", true]);
  });

  it("acquires required view controls at their existing call boundary", () => {
    const { api, context } = fixture(); context.window.LongtailForge.view = null;
    for (const call of [() => api.noteInput("x"), () => api.noteTextarea("x"), () => api.noteSelect("x", null), () => api.renderLinksPanel({})]) assert.throws(call, /Notes requires LongtailForge.view/);
  });

  it("looks up linked fields by identity and retains absent-field defaults", () => {
    const { api } = fixture(); const field = { field: "target_search", placeholder: "Find a record" };
    assert.strictEqual(api.linkedRecordsField({ fields: [{ field: "other" }, field] }, "target_search"), field);
    assert.deepEqual(plain(api.linkedRecordsField({}, "target_search")), {});
    assert.deepEqual(plain(api.linkedRecordsField({ fields: [field] }, "other")), {});
  });

  it("formats business-only client and project context in order with missing and empty-label fallbacks", () => {
    const { api, context } = fixture();
    const note = { client_id: "c", project_id: "p", linked_context: { client: { label: "Client A" }, project: { label: "Project B" }, user: { label: "Not primary" } } };
    assert.equal(api.notePrimaryContextSummary(note), "Client: Client A / Project: Project B");
    assert.doesNotThrow(() => api.notePrimaryContextSummary());
    context.state.workspaceType = "personal"; assert.equal(api.notePrimaryContextSummary(note), "Project: Project B");
    context.state.workspaceType = "business";
    assert.equal(api.notePrimaryContextSummary({ linked_context: note.linked_context }), "Client: Client A / Project: Project B");
    assert.equal(api.notePrimaryContextSummary({ client_id: "c", project_id: "p", linked_context: { client: {}, project: { label: "" } } }), "Client: Unavailable client / Project: Unavailable project");
    assert.equal(api.notePrimaryContextSummary({ client_id: "c", project_id: "p", linked_context: null }), "Client: Unavailable client / Project: Unavailable project");
    assert.equal(api.notePrimaryContextSummary(), ""); assert.equal(api.notePrimaryContextSummary({ linked_context: { client: null, project: null } }), "");
  });

  it("omits an unreadable primary summary while keeping the context-label predicate strict", () => {
    const { api } = fixture();
    for (const context of ["bad", [], { client: "bad" }, { project: [] }, { client: { label: 4 } }, { project: { label: {} } }]) {
      const note = { client_id: "c", project_id: "p", linked_context: context };
      assert.doesNotThrow(() => api.notePrimaryContextSummary(note));
      assert.equal(api.notePrimaryContextSummary(note), ""); assert.equal(api.notePrimaryContextItem(note), null);
    }
    for (const label of [null, [], "bad", { label: 4 }, { label: false }, { label: null }, { label: {} }]) assert.equal(api.isNoteContextLabel(label), false);
    for (const label of [{}, { label: undefined }, { label: "" }, { label: "Readable" }]) assert.equal(api.isNoteContextLabel(label), true);
  });

  it("renders camel and stored-link aliases, URL precedence, fallback labels and exact removal identities", async () => {
    const { api, calls } = fixture(); const note = { note_id: "n", status: "active" };
    const link = { noteLinkId: "camel", note_link_id: "legacy", sourceUrl: "/camel", source_url: "/legacy", targetType: "project", target_type: "task", label: "Readable", subtitle: "Explicit" };
    const row = api.linkItem(note, link); assert.equal(row.className, "notes-link-item");
    assert.ok(row.querySelector("a"), "A readable URL must render a link");
    assert.equal(row.querySelector("a").getAttribute("href"), "/camel"); assert.equal(row.querySelector("a").textContent, "Readable"); assert.equal(row.querySelector("small").textContent, "Explicit");
    const remove = row.querySelector("[data-note-link-remove]"); assert.equal(remove.hidden, false); await remove.click();
    assert.equal(calls.length, 1); assert.equal(calls[0][0], "remove"); assert.strictEqual(calls[0][1], note); assert.strictEqual(calls[0][2], link);
    const legacy = api.linkItem({ status: "archived" }, { source_url: "/legacy", target_type: "task", label: "Legacy" });
    assert.ok(legacy.querySelector("a"), "Stored source_url must render a link");
    assert.equal(legacy.querySelector("a").getAttribute("href"), "/legacy"); assert.equal(legacy.querySelector("small").textContent, "Task"); assert.equal(legacy.querySelector("[data-note-link-remove]").hidden, true);
    const empty = api.linkItem(note, {}); assert.equal(empty.querySelector("a"), null); assert.equal(empty.querySelector("strong").textContent, "Unavailable linked context");
    assert.equal(api.linkItem(note, { targetType: "future_record" }).querySelector("small").textContent, "Future Record");
    assert.equal(api.linkItem(note, { targetType: "project", target_type: "task" }).querySelector("small").textContent, "Project");
  });

  it("skips unreadable stored-link members without loosening the reader or invoking removal", () => {
    const { api, calls } = fixture();
    for (const link of [null, [], "bad", { sourceUrl: {} }, { source_url: 4 }, { label: false }, { targetType: 4 }, { target_type: [] }, { subtitle: {} }, { noteLinkId: 4 }, { note_link_id: false }]) {
      assert.equal(api.isNoteLinkDisplay(link), false);
      assert.doesNotThrow(() => api.linkItem({ status: "active" }, link));
      assert.equal(api.linkItem({ status: "active" }, link), null);
    }
    assert.deepEqual(calls, []);
  });

  it("renders remaining linked rows in order and uses the existing empty state when all context is unreadable", async () => {
    const { api, context } = fixture();
    const valid = [{ label: "First", sourceUrl: "/first" }, { label: "Last", source_url: "/last" }];
    const unreadable = { label: { secret: "must not render" }, sourceUrl: "/bad" };
    /** @type {Pick<import("../../src/types/browser-contracts.js").BrowserNoteRecord, "note_id" | "status" | "client_id" | "linked_context" | "links">} */
    const note = { note_id: "n", status: "active", client_id: "c", linked_context: { client: { label: "Client" } }, links: [valid[0], unreadable, valid[1]] };
    assert.doesNotThrow(() => api.renderLinksPanel(note));
    let panel = api.renderLinksPanel(note);
    assert.deepEqual(Array.from(panel.querySelector(".notes-link-list").children, (/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ row) => row.querySelector(".notes-link-item-label").children[0].textContent), ["Primary Context", "First", "Last"]);
    note.linked_context = { client: { label: { secret: "must not render" } } };
    assert.equal(api.linkRecordNodes(note).length, 2);
    panel = api.renderLinksPanel(note);
    assert.equal(panel.querySelector(".notes-primary-context-row"), null);
    assert.deepEqual(Array.from(panel.querySelector(".notes-link-list").children, (/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ row) => row.querySelector("a").getAttribute("href")), ["/first", "/last"]);
    note.links = [unreadable]; context.descriptor.emptyState.message = "No readable context";
    panel = api.renderLinksPanel(note);
    assert.equal(panel.querySelector(".notes-link-list").children.length, 1);
    assert.ok(panel.querySelector(".notes-empty-state"), "Unreadable-only context must retain the existing empty state");
    assert.equal(panel.querySelector(".notes-empty-state").textContent, "No readable context");
    assert.equal(panel.querySelector("[data-note-link-form]").hidden, false);
    assert.strictEqual(note.links[0], unreadable);
    await setImmediate();
  });

  it("projects only the three established target identity members and preserves optional defaults", () => {
    const { api } = fixture();
    assert.deepEqual(plain(api.linkPayloadFromTarget({ moduleId: "notes", targetType: "note", targetId: " spaced ", label: "Not a payload field" })), { moduleId: "notes", targetType: "note", targetId: " spaced " });
    const empty = api.linkPayloadFromTarget(); assert.deepEqual(Object.keys(empty), ["moduleId", "targetType", "targetId"]);
    assert.equal(empty.moduleId, undefined); assert.equal(empty.targetType, undefined); assert.equal(empty.targetId, undefined);
  });

  it("retains missing-descriptor behavior and uses the real shared panel for archived and empty states", async () => {
    const { api, context, calls } = fixture(); context.descriptor = null; assert.equal(api.renderLinksPanel({}), null); assert.deepEqual(calls, []);
    context.descriptor = { title: "Context", fields: [], actions: [], emptyState: { message: "Nothing linked" } };
    const panel = api.renderLinksPanel({ note_id: "n", status: "archived", links: [] });
    assert.equal(panel.tagName, "DETAILS"); assert.notEqual(panel.open, true); assert.equal(panel.dataset.noteLinksPanel, "");
    assert.equal(panel.querySelector("summary").textContent, "Context"); assert.equal(panel.querySelector(".notes-link-list").textContent, "Nothing linked");
    const form = panel.querySelector("[data-note-link-form]"); assert.equal(form.hidden, true); assert.equal(form.dataset.noteId, "n");
    assert.equal(panel.querySelector("[data-note-link-search]").placeholder, "Search records");
    assert.equal(panel.querySelector("[data-note-link-add]").type, "submit");
    assert.equal(panel.querySelector("[data-note-link-add]").title, "Add Link");
    assert.equal(panel.querySelector("[data-note-link-add]").dataset.surfaceActionRole, "primary");
    await setImmediate();
  });

  it("renders Primary Context before linked rows and preserves action and placeholder contributions", async () => {
    const { api, context } = fixture(); context.descriptor.fields[1].placeholder = "Find context";
    context.descriptor.actions = [{ id: "unrelated", label: "Wrong" }, { id: "add-link", label: "Attach", role: "secondary", behavior: "notes.custom.add" }];
    const panel = api.renderLinksPanel({ note_id: "n", status: "active", client_id: "c", linked_context: { client: { label: "Client" } }, links: [{ label: "Linked", target_type: "task" }] });
    assert.equal(panel.querySelector("[data-note-link-form]").hidden, false);
    assert.equal(panel.querySelector(".notes-link-list").children[0].querySelector("strong").textContent, "Primary Context");
    assert.equal(panel.querySelector(".notes-link-list").children[1].querySelector("strong").textContent, "Linked");
    assert.equal(panel.querySelector("[data-note-link-search]").placeholder, "Find context");
    const add = panel.querySelector("[data-note-link-add]"); assert.equal(add.title, "Attach"); assert.equal(add.dataset.surfaceAction, "notes.custom.add"); assert.equal(add.dataset.surfaceActionRole, "secondary");
    context.descriptor.actions = [{ id: "add-link" }];
    const fallback = api.renderLinksPanel({ note_id: "n", status: "active", links: [] });
    assert.equal(fallback.querySelector("[data-note-link-add]").dataset.surfaceAction, "add-link");
    await setImmediate();
  });

  it("preserves loading, error recovery, 180ms debounce, type changes and the outgoing selection payload", async () => {
    const { api, context, calls, timers, document } = fixture();
    /** @type {(value: unknown[]) => void} */ let resolve = () => {};
    context.fetchAnswer = new Promise((done) => { resolve = done; });
    const note = { note_id: "n", status: "active", links: [] }; const panel = api.renderLinksPanel(note);
    const results = panel.querySelector("[data-note-link-results]"), search = panel.querySelector("[data-note-link-search]"), type = panel.querySelector("[data-note-link-target-type]");
    assert.equal(results.required, true); assert.equal(results.disabled, true); assert.equal(results.textContent, "Loading records...");
    assert.deepEqual(plain(calls[0]), ["fetch", { targetType: "project", search: "", limit: 40 }]);
    const records = [{ moduleId: "tasks", targetType: "task", targetId: "t" }]; resolve(records); await setImmediate();
    assert.equal(results.disabled, false); assert.strictEqual(calls[1][2], records);
    calls.length = 0; context.fetchAnswer = Promise.resolve([]);
    search.value = "first"; search.dispatchEvent({ type: "input" }); search.value = "latest"; search.dispatchEvent({ type: "input" });
    assert.equal(timers.size, 1); assert.deepEqual(calls, []); const timer = [...timers.values()][0]; assert.equal(timer.delay, 180); await timer.callback();
    assert.deepEqual(plain(calls[0]), ["fetch", { targetType: "project", search: "latest", limit: 40 }]);
    calls.length = 0; context.fetchAnswer = Promise.reject(new Error("directory unavailable")); type.value = "task"; type.dispatchEvent({ type: "change" }); await setImmediate();
    assert.equal(results.disabled, false); assert.equal(results.textContent, "No records available"); assert.deepEqual(plain(calls[0]), ["fetch", { targetType: "task", search: "latest", limit: 40 }]);
    calls.length = 0; const form = panel.querySelector("[data-note-link-form]");
    assert.equal(form.dispatchEvent({ type: "submit" }), false); await setImmediate(); assert.deepEqual(calls, []);
    const option = document.createElement("option"); option.dataset.target = JSON.stringify({ ...records[0], label: "Extra" }); option.selected = true; results.replaceChildren(option);
    assert.equal(form.dispatchEvent({ type: "submit" }), false); await setImmediate();
    assert.equal(calls.length, 1); assert.equal(calls[0][0], "add"); assert.strictEqual(calls[0][1], note); assert.deepEqual(plain(calls[0][2]), records[0]);
  });
});
