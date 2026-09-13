import assert from "node:assert/strict";
import vm from "node:vm";
import { URLSearchParams } from "node:url";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const read = createProjectTextReader().readText, source = read("public/js/notes.js");
const names = ["mountFilesPanel", "fileVisibilityForNote", "mountNoteEditorFiles", "updateFilesUtilityState", "openFilesDialog", "closeFilesDialog",
  "handleFilesDialogClose", "closeTagsDialog", "isSecureNote", "isSecureEditorMode", "createNoteFilesDialogShell", "findNotesControl", "cacheNotesElements",
  "requireNamespace", "requireView", "readStoredOpenExternalLinksPreference"];
/** @param {unknown} value */ const plain = (value) => JSON.parse(JSON.stringify(value));
/** @param {Record<string, unknown>} [changes] */
function note(changes = {}) { return { note_id: "saved / note", security_mode: "normal", status: "active", visibility: "internal", client_id: "client", project_id: "project", ...changes }; }
function fixture() {
  const browser = createFakeBrowserContext();
  browser.window.location = { search: "" }; browser.window.localStorage = { getItem: () => null };
  /** @type {unknown[][]} */ const calls = [];
  const context = vm.createContext({ ...browser, URLSearchParams });
  vm.runInContext(read("public/js/shared/view-builder.js"), context);
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  for (const name of ["LINK_CLIENT_CONTEXT_ALL", "OPEN_EXTERNAL_LINKS_STORAGE_KEY"]) {
    const start = source.indexOf(`const ${name} =`); assert.ok(start >= 0);
    vm.runInContext(source.slice(start, source.indexOf(";", start) + 1), context);
  }
  const start = source.indexOf("let state = {"); assert.ok(start >= 0);
  vm.runInContext(source.slice(start, source.indexOf("\n  };", start) + 5), context);
  const state = vm.runInContext("state", context), api = vm.runInContext(`({${names.join(",")}})`, context);
  const view = context.window.LongtailForge.view;
  const files = api.createNoteFilesDialogShell(), parent = view.createModal({ title: "Note" }), tags = view.createModal({ title: "Tags" });
  parent.dataset.noteDialog = ""; tags.dataset.noteTagsDialog = "";
  const toggle = view.createActionButton({ label: "Files" }); toggle.dataset.noteFilesToggle = ""; toggle.setAttribute("aria-expanded", "false");
  const security = browser.document.createElement("select"); security.dataset.noteSecurity = ""; security.value = "normal";
  parent.append(toggle, security); browser.document.body.append(parent, tags, files);
  const component = { mount: (/** @type {unknown} */ mount, /** @type {unknown} */ options) => {
    const controller = { destroy: () => { calls.push(["destroy-new", controller]); } };
    calls.push(["mount", mount, options, controller]); return controller;
  } };
  context.window.LongtailForge.fileAttachments = component;
  context.window.LongtailForge.view = { ...view,
    showModal: (/** @type {unknown} */ dialog, /** @type {unknown} */ options) => { calls.push(["show", dialog, options]); },
    closeModal: (/** @type {unknown} */ dialog) => { calls.push(["close", dialog]); },
  };
  api.cacheNotesElements();
  return { api, state, context, calls, component, document: browser.document, files, parent, tags, toggle, security,
    warning: files.querySelector("[data-note-files-save-first-warning]"), mount: files.querySelector("[data-note-files-editor]") };
}
/** @param {ReturnType<typeof fixture>} f */
function lastMount(f) { const call = f.calls.findLast((c) => c[0] === "mount"); assert.ok(call); return call; }

describe("Notes Files utility lifecycle", () => {
  it("executes the real state and shell producers and caches only the two actual HTML controls", () => {
    const f = fixture();
    assert.equal(f.state.attachmentController, null); assert.equal(f.state.editorAttachmentController, null); assert.equal(f.state.filesDialogNoteId, "");
    assert.equal(f.context.filesToggle === f.toggle, true); assert.equal(f.context.filesSaveFirstWarning === f.warning, true);
    assert.equal(f.warning.tagName, "P"); assert.equal(f.warning.textContent, "Save the note before adding files.");
    assert.equal(f.warning.getAttribute("role"), "alert"); assert.equal(f.warning.getAttribute("tabindex"), "-1"); assert.equal(f.warning.hidden, true);
    const wrong = f.document.createElement("div"); wrong.dataset.noteFilesToggle = ""; f.toggle.remove(); f.parent.append(wrong);
    assert.equal(f.context.filesToggle === f.toggle, true); f.api.cacheNotesElements(); assert.equal(f.context.filesToggle === null, true);
    f.warning.remove(); f.api.cacheNotesElements(); assert.equal(f.context.filesSaveFirstWarning === null, true);
    assert.doesNotThrow(() => f.api.mountNoteEditorFiles(null));
    // This fake treats every tag as HTMLElement, so it cannot distinguish HTML from SVG.
    // Pin only that constructor fact; the browser suite proves the actual SVG boundary.
    assert.match(extractFunctionBlock(source, "cacheNotesElements"), /filesSaveFirstWarning = findNotesControl\("\[data-note-files-save-first-warning\]", HTMLElement\)/);
    assert.match(extractFunctionBlock(source, "openFilesDialog"), /const focusTarget = candidate instanceof HTMLElement \? candidate : null/);
  });
  it("maps the three visibility branches without treating other note metadata as authority", () => {
    for (const [visibility, expected] of [["client_visible", "client"], ["private", "private"], ["internal", "workspace"], ["workspace", "workspace"], ["public", "workspace"], [undefined, "workspace"]]) {
      assert.equal(fixture().api.fileVisibilityForNote({ visibility }), expected);
    }
  });
  it("retains the detail controller on missing mount, missing surface or either secure mode", () => {
    for (const condition of ["mount", "surface", "secure", "effective"]) {
      const f = fixture(), old = { destroy: () => f.calls.push(["destroy-old"]) }; f.state.attachmentController = old;
      if (condition === "surface") delete f.context.window.LongtailForge.fileAttachments;
      const record = note(condition === "secure" ? { security_mode: "secure" } : condition === "effective" ? { effective_security_mode: "secure" } : {});
      assert.doesNotThrow(() => f.api.mountFilesPanel(record, condition === "mount" ? null : f.mount));
      assert.equal(f.state.attachmentController === old, true); assert.equal(f.calls.length, 0);
    }
  });
  it("destroys the previous detail controller before mounting with the exact note-owned options", () => {
    for (const status of ["active", "archived"]) {
      const f = fixture(); f.state.attachmentController = { destroy: () => f.calls.push(["destroy-old"]) };
      f.api.mountFilesPanel(note({ status, visibility: "private" }), f.mount);
      assert.deepEqual(f.calls.map((c) => c[0]), ["destroy-old", "mount"]); const call = lastMount(f);
      assert.equal(call[1] === f.mount, true); assert.equal(f.state.attachmentController === call[3], true);
      assert.deepEqual(plain(call[2]), { acceptedCategories: ["document", "image", "pdf", "spreadsheet", "presentation", "text", "other"],
        canRemove: status !== "archived", canUpload: status !== "archived", clientId: "client", moduleId: "notes", projectId: "project",
        saveFirstMessage: "Save the note before adding files.", targetId: "saved / note", targetType: "note", title: "Files", visibility: "private" });
    }
  });
  it("clears the editor controller and mount on every unavailable path while retaining save-first identity", () => {
    for (const condition of ["unsaved", "surface", "mount", "secure", "effective", "secure-new"]) {
      const f = fixture(); f.state.editorAttachmentController = { destroy: () => f.calls.push(["destroy-old"]) }; f.mount.textContent = "Old attachments";
      const record = condition === "unsaved" || condition === "secure-new" ? null : note(condition === "secure" ? { security_mode: "secure" } : condition === "effective" ? { effective_security_mode: "secure" } : {});
      if (condition === "surface") delete f.context.window.LongtailForge.fileAttachments;
      if (condition === "mount") f.context.filesEditor = null;
      if (condition === "secure-new") f.security.value = "secure";
      assert.doesNotThrow(() => f.api.mountNoteEditorFiles(record));
      assert.equal(f.state.editorAttachmentController, null); assert.equal(f.calls.filter((c) => c[0] === "destroy-old").length, 1); assert.equal(f.calls.some((c) => c[0] === "mount"), false);
      assert.equal(f.state.filesDialogNoteId, record?.note_id || ""); assert.equal(f.warning.hidden, Boolean(record?.note_id));
      if (condition !== "mount") assert.equal(f.mount.textContent, "");
      assert.equal(f.toggle.hidden, condition !== "unsaved");
      if (condition !== "unsaved") { assert.equal(f.toggle.getAttribute("aria-expanded"), "false"); assert.equal(f.calls[0][0], "close"); assert.equal(f.calls[0][1] === f.files, true); }
    }
  });
  it("mounts the saved editor with exact scope and raw archived comparison, including partial seeds", () => {
    for (const status of ["active", "archived", undefined, null, 42, { unreadable: true }]) {
      const f = fixture(); f.state.editorAttachmentController = { destroy: () => f.calls.push(["destroy-old"]) };
      f.api.mountNoteEditorFiles(note({ status, visibility: "client_visible" }));
      assert.deepEqual(f.calls.map((c) => c[0]), ["destroy-old", "mount"]); const call = lastMount(f);
      assert.equal(call[1] === f.mount, true); assert.equal(f.state.editorAttachmentController === call[3], true);
      assert.equal(f.state.filesDialogNoteId, "saved / note"); assert.equal(f.warning.hidden, true); assert.equal(f.toggle.hidden, false);
      assert.deepEqual(plain(call[2]), { acceptedCategories: ["document", "image", "pdf", "spreadsheet", "presentation", "text", "other"],
        canRemove: status !== "archived", canUpload: status !== "archived", clientId: "client", moduleId: "notes", projectId: "project",
        saveFirstMessage: "Save the note before adding files.", targetId: "saved / note", targetType: "note", title: "Files", visibility: "client" });
    }
    const f = fixture(); f.api.mountNoteEditorFiles({ note_id: "seed" }); const call = lastMount(f);
    assert.equal(plain(call[2]).clientId, ""); assert.equal(plain(call[2]).projectId, ""); assert.equal(plain(call[2]).visibility, "workspace");
  });
  it("uses live note/security state for visibility and closes a utility that becomes unavailable", () => {
    const f = fixture(); f.state.editorNote = note(); f.toggle.hidden = true; f.api.updateFilesUtilityState(); assert.equal(f.toggle.hidden, false);
    f.state.editorNote = null; f.security.value = "secure"; f.toggle.setAttribute("aria-expanded", "true");
    f.api.updateFilesUtilityState(); assert.equal(f.toggle.hidden, true); assert.equal(f.toggle.getAttribute("aria-expanded"), "false"); assert.equal(f.calls.at(-1)?.[1] === f.files, true);
    f.security.value = "normal"; f.api.updateFilesUtilityState(); assert.equal(f.toggle.hidden, false);
    f.context.filesToggle = null; f.calls.length = 0; delete f.context.window.LongtailForge; assert.doesNotThrow(() => f.api.updateFilesUtilityState()); assert.equal(f.calls.length, 0);
  });
  it("opens in the existing order and focuses the saved input or unsaved warning after showing", () => {
    for (const saved of [false, true]) {
      const f = fixture(), input = f.document.createElement("input"); input.dataset.fileAttachmentInput = ""; f.mount.append(input);
      f.state.filesDialogNoteId = saved ? "saved" : ""; const focus = saved ? input : f.warning;
      focus.focus = () => { f.calls.push(["focus", focus]); };
      f.api.openFilesDialog(); assert.deepEqual(f.calls.map((c) => c[0]), ["close", "show", "focus"]);
      assert.equal(f.calls[0][1] === f.tags, true); assert.equal(f.calls[1][1] === f.files, true); assert.equal(f.calls[2][1] === focus, true);
      const options = f.calls[1][2]; assert.ok(options && typeof options === "object" && "parent" in options && "trigger" in options);
      assert.equal(options.parent === f.parent, true); assert.equal(options.trigger === f.toggle, true); assert.equal(f.toggle.getAttribute("aria-expanded"), "true");
      f.api.closeFilesDialog(); assert.equal(f.calls.at(-1)?.[1] === f.files, true); f.api.handleFilesDialogClose(); assert.equal(f.toggle.getAttribute("aria-expanded"), "false");
    }
  });
  it("keeps hidden and missing dialogs inert and tolerates missing or unreadable focus fields", () => {
    for (const condition of ["hidden", "missing"]) {
      const f = fixture(); if (condition === "hidden") f.toggle.hidden = true; else f.context.filesDialog = null;
      f.api.openFilesDialog(); assert.equal(f.calls.length, 0);
    }
    for (const saved of [false, true]) {
      const f = fixture(); f.state.filesDialogNoteId = saved ? "saved" : ""; f.warning.remove();
      assert.doesNotThrow(() => f.api.openFilesDialog()); assert.deepEqual(f.calls.map((c) => c[0]), ["close", "show"]);
      // Deliberately unreadable query output; this asserts the guard rather than emulating HTML parsing.
      f.files.querySelector = () => ({ focus: () => { f.calls.push(["bad-focus"]); } });
      f.calls.length = 0; assert.doesNotThrow(() => f.api.openFilesDialog()); assert.deepEqual(f.calls.map((c) => c[0]), ["close", "show"]);
    }
  });
});
