import assert from "node:assert/strict";
import vm from "node:vm";
import { it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");

it("initializes dialog handles and publishes Notes actions synchronously on a non-Notes host", () => {
  const browser = createFakeBrowserContext();
  /** @type {unknown[]} */ const registered = [];
  /** @type {unknown[]} */ const editors = [];
  browser.window.location = { search: "" };
  browser.window.localStorage = { getItem: () => null };
  browser.window.LongtailForge.moduleActions = { register: (/** @type {unknown} */ action) => registered.push(action) };
  browser.window.LongtailForge.notesEditor = { createPlainTextarea: (/** @type {unknown} */ control) => { editors.push(control); return null; } };
  // Existing host shells exercise the real acquisition, binding and publication sequence.
  // Fresh shell construction is covered by the real browser import regression.
  for (const attribute of ["data-note-dialog", "data-note-tags-dialog", "data-note-files-dialog"]) {
    const dialog = browser.document.createElement("dialog");
    dialog.setAttribute(attribute, "");
    browser.document.body.append(dialog);
  }
  const body = browser.document.createElement("textarea");
  body.setAttribute("data-note-body", "");
  browser.document.body.append(body);
  const context = vm.createContext({ ...browser, URLSearchParams });
  vm.runInContext(source, context, { timeout: 1000 });
  assert.deepEqual(editors, [body]);
  const actions = vm.runInContext("window.LongtailForge.notesDialog", context);
  assert.equal(typeof actions.openNoteViewer, "function");
  assert.equal(typeof actions.openNoteEditor, "function");
  assert.equal(Object.isFrozen(actions), true);
  assert.deepEqual(registered.map(action => {
    assert.ok(action && typeof action === "object" && "id" in action);
    return action.id;
  }), ["notes.add", "notes.edit", "notes.view"]);
});
