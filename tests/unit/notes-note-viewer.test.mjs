import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { FakeDocument } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");
const names = ["openNoteViewer", "createNoteViewDialog", "renderNoteViewDialog", "renderNoteViewError",
  "noteViewBodyElement", "noteViewEditAction", "openNoteViewEditHandoff", "noteViewErrorMessage", "isSecureError",
  "detailMetaItems", "readNoteEditorId"];
/** @param {Record<string, unknown>} [overrides] */
function viewer(overrides = {}) {
  const document = new FakeDocument();
  /** @type {unknown[]} */
  const events = [];
  const note = { note_id: "a/b", title: "Saved", body_html: "<p>Rendered</p>", tags: [], status: "active" };
  /** @param {string} tag @param {{className?: string, text?: string, children?: import("../../scripts/test-support/fake-dom.mjs").FakeElement[], dataset?: object}} [options] */
  const createElement = (tag, options = {}) => {
    const element = Object.assign(document.createElement(tag), { innerHTML: "", title: "" });
    element.className = options.className || "";
    element.textContent = options.text || "";
    element.append(...(options.children || []));
    Object.assign(element.dataset, options.dataset);
    return element;
  };
  const view = {
    createElement,
    createActionButton: (/** @type {{label: string, disabled?: boolean, onClick?: () => void}} */ options) => {
      const button = createElement("button", { text: options.label });
      button.disabled = Boolean(options.disabled);
      if (options.onClick) button.addEventListener("click", options.onClick);
      return button;
    },
    createModal: (/** @type {{body: import("../../scripts/test-support/fake-dom.mjs").FakeElement[], actions: import("../../scripts/test-support/fake-dom.mjs").FakeElement[]}} */ options) => {
      const dialog = Object.assign(createElement("dialog"), { viewParts: { title: createElement("h2") } });
      dialog.append(...options.body, ...options.actions);
      return dialog;
    },
    closeModal: (/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ dialog, /** @type {string} */ reason) => {
      events.push(["close", reason]); dialog.close(reason);
    },
    showModal: (/** @type {import("../../scripts/test-support/fake-dom.mjs").FakeElement} */ dialog, /** @type {unknown} */ options) => {
      events.push(["show", options]); dialog.showModal();
    },
  };
  const context = vm.createContext({ document, state: { workspaceType: "business" }, activeNoteViewDialog: null,
    requireView: () => view, requireNamespace: () => ({ workspaceContextReady: Promise.resolve() }),
    loadMarkdownRenderingPreference: async () => { events.push("preference"); },
    requireApi: () => ({ getJson: async (/** @type {string} */ url, /** @type {unknown} */ options) => {
      events.push(["read", url, options]); return { note };
    } }),
    requireNoteFromEnvelope: (/** @type {{note: unknown}} */ envelope) => { events.push("checked"); return envelope.note; },
    tagChips: () => createElement("div"), emptyText: (/** @type {string} */ text) => createElement("p", { text }),
    applyExternalMarkdownLinkPreference: () => events.push("links"), isSecureNote: (/** @type {{security_mode?: string}} */ value) => value.security_mode === "secure",
    libraryLabel: (/** @type {unknown} */ value) => value, noteKindLabel: (/** @type {unknown} */ value) => value,
    formatToken: (/** @type {unknown} */ value) => value, formatDate: (/** @type {unknown} */ value) => value,
    normalizeWorkspaceType: (/** @type {unknown} */ value) => value,
    openNoteEditor: async (/** @type {unknown} */ params, /** @type {unknown} */ host) => { events.push(["editor", params, host]); },
    safeNoteErrorMessage: () => "Safe failure", ...overrides });
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  const api = vm.runInContext(`({ ${names.join(", ")} })`, context);
  return { api, context, document, events, note, view };
}
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
/** @param {unknown} value */
const plain = (value) => JSON.parse(JSON.stringify(value));

describe("Notes saved-note viewer", () => {
  it("rejects absent identity before waiting or acquiring any viewer or editor controls", async () => {
    const { api, events, document } = viewer();
    let failure = "";
    void api.openNoteViewer().catch((/** @type {unknown} */ error) => { failure = String(error); });
    await flush();
    assert.match(failure, /Note ID is required/);
    assert.deepEqual(events, []);
    assert.equal(document.body.children.length, 0);
  });

  it("waits for workspace and preferences, reads encoded canonical detail, and settles only on close", async () => {
    let release = () => {};
    const ready = new Promise((resolve) => { release = () => resolve(undefined); });
    const { api, context, events, document } = viewer({ requireNamespace: () => ({ workspaceContextReady: ready }) });
    const trigger = document.createElement("button");
    const parent = document.createElement("dialog");
    /** @type {unknown[]} */
    const cancels = [];
    let settled = false;
    const result = api.openNoteViewer({ noteId: "a/b", returnFocusTo: trigger, parent }, { cancel: (/** @type {unknown} */ detail) => cancels.push(detail) });
    result.then(() => { settled = true; });
    await flush(); assert.deepEqual(events, []);
    release(); await flush();
    assert.equal(events[0], "preference");
    assert.deepEqual(plain(events[2]), ["read", "/api/notes/a%2Fb", { cache: "no-store" }]);
    assert.equal(events[3], "checked");
    const dialog = context.activeNoteViewDialog;
    assert.equal(dialog.viewParts.title.textContent, "Saved");
    assert.equal(settled, false);
    assert.equal(document.body.children.length, 1);
    assert.equal(dialog.querySelector("input,select,textarea"), null);
    assert.equal(context.activeNoteViewDialog, dialog);
    assert.equal(events.some((event) => Array.isArray(event) && event[0] === "editor"), false);
    /** @type {unknown} */
    const show = events[1]; assert.ok(Array.isArray(show));
    assert.equal(show[1].trigger, trigger); assert.equal(show[1].parent, parent);
    dialog.close("close");
    assert.equal(await result, "close");
    assert.deepEqual(plain(cancels), [{ actionId: "notes.view", recordId: "a/b" }]);
    assert.equal(context.activeNoteViewDialog, null);
    assert.equal(document.body.children.length, 0);
  });

  it("replaces connected viewers, suppresses view cancellation for edit, and honors the host result", async () => {
    const { api, context, document, events } = viewer();
    const old = Object.assign(document.createElement("dialog"), { isConnected: true });
    context.activeNoteViewDialog = old;
    let cancelCount = 0;
    const result = api.openNoteViewer({ id: "note" }, { result: Promise.resolve("host-result"), cancel: () => { cancelCount += 1; } });
    assert.equal(await result, "host-result");
    assert.ok(events.some((event) => Array.isArray(event) && event[0] === "close" && event[1] === "replace"));
    const dialog = context.activeNoteViewDialog;
    const newer = document.createElement("dialog"); context.activeNoteViewDialog = newer;
    dialog.close("edit");
    assert.equal(cancelCount, 0);
    assert.equal(context.activeNoteViewDialog, newer);
  });

  it("renders only server HTML, preserves empty/secure copy, and disables archived edits", async () => {
    const { api, events, note } = viewer();
    const dialog = api.createNoteViewDialog("note");
    api.renderNoteViewDialog(dialog, { ...note, body_markdown: "PRIVATE RAW", status: "archived" });
    assert.equal(api.noteViewBodyElement(dialog).children[2].innerHTML, "<p>Rendered</p>");
    assert.equal(api.noteViewEditAction(dialog).disabled, true);
    assert.equal(api.noteViewEditAction(dialog).title, "Restore archived notes before editing.");
    assert.ok(events.includes("links"));
    for (const security_mode of ["normal", "secure"]) {
      const empty = api.createNoteViewDialog("note");
      api.renderNoteViewDialog(empty, { ...note, body_html: "", security_mode });
      assert.equal(api.noteViewBodyElement(empty).children[2].textContent,
        security_mode === "secure" ? "Secure note body is locked or unavailable." : "No body.");
      assert.equal(api.noteViewEditAction(empty).disabled, false);
      await api.noteViewEditAction(empty).click(); await api.noteViewEditAction(empty).click();
    }
    assert.equal(events.filter((event) => Array.isArray(event) && event[0] === "editor").length, 2);
  });

  it("shows safe unavailable errors without exposing the rejected payload", async () => {
    for (const message of ["secret crypto payload", "private server path"]) {
      /** @type {unknown[]} */
      const status = [];
      const { api, context } = viewer({ requireApi: () => ({ getJson: async () => { throw new Error(message); } }) });
      const result = api.openNoteViewer({ note_id: "bad" }, { setStatus: /** @param {...unknown} args */ (...args) => status.push(args) });
      await flush();
      const dialog = context.activeNoteViewDialog;
      assert.equal(dialog.viewParts.title.textContent, "Note unavailable");
      const text = api.noteViewBodyElement(dialog).textContent;
      assert.equal(text, api.noteViewErrorMessage(new Error(message)));
      assert.ok(!text.includes(message));
      assert.equal(api.noteViewEditAction(dialog).disabled, true);
      assert.deepEqual(plain(status), [[text, { isError: true }]]);
      dialog.close("close"); await result;
    }
  });

  it("closes before opening edit, preserves note/host identity and focus precedence, and reports rejection", async () => {
    const { api, events, document, context, note } = viewer();
    const dialog = api.createNoteViewDialog("note");
    const trigger = document.createElement("button");
    const explicit = document.createElement("button");
    const host = { trigger };
    api.openNoteViewEditHandoff(dialog, "", {}, host); assert.deepEqual(events, []);
    api.openNoteViewEditHandoff(dialog, "note", { note, returnFocusTo: explicit }, host);
    /** @type {unknown} */
    const call = events[1]; assert.ok(Array.isArray(call));
    assert.deepEqual(events[0], ["close", "edit"]);
    assert.equal(call[0], "editor"); assert.equal(call[1].mode, "edit"); assert.equal(call[1].noteId, "note");
    assert.equal(call[1].note, note); assert.equal(call[1].returnFocusTo, explicit); assert.equal(call[2], host);
    api.openNoteViewEditHandoff(dialog, "note", {}, host);
    /** @type {unknown} */
    const fallback = events[3]; assert.ok(Array.isArray(fallback)); assert.equal(fallback[1].returnFocusTo, trigger);
    /** @type {unknown[]} */
    const failures = [];
    context.openNoteEditor = async () => { throw new Error("raw failure"); };
    api.openNoteViewEditHandoff(dialog, "note", {}, {
      setStatus: /** @param {...unknown} args */ (...args) => failures.push(args), cancel: (/** @type {unknown} */ detail) => failures.push(detail),
    });
    await flush();
    assert.deepEqual(plain(failures), [["Safe failure", { isError: true }], { actionId: "notes.edit", recordId: "note" }]);
  });

  it("renders shared metadata in order with accessible labels, scoped visibility, and owner fallback", () => {
    const { api, context } = viewer();
    const note = { library_bucket: "reference", note_type: "general", status: "active", visibility: "internal", security_mode: "normal",
      ticket_id: null, created_at: "created", updated_at: "updated", owner_display_name: "Owner" };
    const nodes = api.detailMetaItems(note);
    assert.deepEqual(plain(nodes.filter((/** @type {{nodeType: number}} */ node) => node.nodeType !== 3).map((/** @type {{title: string}} */ node) => node.title)),
      ["Library: reference", "Note Kind: general", "Status: active", "Visibility: internal", "Security: normal", "Created: created", "Updated: updated", "Owner: Owner"]);
    assert.equal(nodes.length, 15);
    for (const node of nodes.filter((/** @type {{nodeType: number}} */ node) => node.nodeType !== 3)) assert.equal(node.getAttribute("aria-label"), node.title);
    context.state.workspaceType = "personal";
    const personal = api.detailMetaItems({ ...note, owner_display_name: "" });
    assert.equal(personal.length, 13);
    assert.equal(personal.some((/** @type {{title?: string}} */ node) => node.title?.startsWith("Visibility:")), false);
    assert.equal(personal.at(-1).textContent, "Unavailable owner");
  });
});
