import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const read = createProjectTextReader().readText, source = read("public/js/notes.js");
const names = ["notesOptionElement", "noteFieldLabel", "emptyText", "lockedNotice", "statusBadge", "renderEmptyList",
  "setStatus", "setEditorFormStatus", "setBulkFormStatus", "requireNotesValue", "requireView"];
function fixture() {
  const browser = createFakeBrowserContext(), document = browser.document;
  const statusMessage = document.createElement("p"), formStatus = document.createElement("p"), bulkFormStatus = document.createElement("p");
  const notesList = document.createElement("div");
  /** @type {string[]} */ const syncSnapshots = [];
  const context = vm.createContext({ ...browser, statusMessage, formStatus, bulkFormStatus, notesList,
    syncNotesBulkToolbar: () => syncSnapshots.push(notesList.textContent) });
  vm.runInContext(read("public/js/shared/view-builder.js"), context);
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  const api = vm.runInContext(`({${names.join(",")}})`, context);
  return { api, context, document, statusMessage, formStatus, bulkFormStatus, notesList, syncSnapshots };
}
const literal = '<strong data-unreadable="yes">Working & reference</strong>';

describe("Notes text and control projections", () => {
  it("delegates option values and labels to the real published view builder without narrowing its coercion vocabulary", () => {
    const f = fixture();
    for (const [value, label, attribute, text] of [
      ["active", literal, "active", literal], ["", "", "", ""], [0, false, "0", "false"],
      [false, null, null, ""], [null, undefined, null, ""], [true, 17, "", "17"],
      [{ toString: () => "key" }, { toString: () => "label" }, "key", "label"],
    ]) {
      const option = f.api.notesOptionElement(value, label);
      assert.equal(option.tagName, "OPTION"); assert.equal(option.getAttribute("value"), attribute);
      assert.equal(option.textContent, text); assert.equal(option.childElementCount, 0);
    }
  });
  it("keeps label text before the exact control and preserves the shared nested-child and absent-child semantics", () => {
    const f = fixture(), control = f.document.createElement("input"); control.value = "draft";
    const label = f.api.noteFieldLabel(literal, control);
    assert.equal(label.tagName, "LABEL"); assert.equal(label.childNodes.length, 2);
    assert.equal(label.childNodes[0].textContent, literal); assert.equal(label.childNodes[1] === control, true);
    assert.equal(control.parentNode === label, true); assert.equal(control.value, "draft");
    const second = f.document.createElement("select");
    const nested = f.api.noteFieldLabel([null, "A", false, [0, "B"]], [undefined, second]);
    assert.equal(nested.textContent, "A0B"); assert.equal(nested.childElementCount, 1);
    assert.equal(nested.childNodes.at(-1) === second, true);
    assert.equal(f.api.noteFieldLabel(null, undefined).childNodes.length, 0);
    delete f.context.window.LongtailForge.view;
    assert.throws(() => f.api.noteFieldLabel("Title", control), /requires LongtailForge.view/);
    assert.throws(() => f.api.notesOptionElement("", ""), /requires LongtailForge.view/);
  });
  it("constructs distinct empty, locked and badge elements using literal text including the empty string", () => {
    const f = fixture();
    for (const [name, tag, className] of [["emptyText", "P", "notes-empty-state"], ["lockedNotice", "P", "notes-locked-state"], ["statusBadge", "SPAN", "notes-status-badge"]]) {
      for (const text of [literal, ""]) {
        const node = f.api[name](text);
        assert.equal(node.tagName, tag); assert.equal(node.className, className);
        assert.equal(node.textContent, text); assert.equal(node.childElementCount, 0);
        assert.equal(node.parentNode, null);
      }
    }
  });
  it("replaces page status text and explicitly clears error styling on a normal or empty message", () => {
    const f = fixture(); f.statusMessage.classList.add("preserved");
    f.api.setStatus(literal, true);
    assert.equal(f.statusMessage.textContent, literal); assert.equal(f.statusMessage.classList.contains("error-text"), true);
    f.api.setStatus("Recovered");
    assert.equal(f.statusMessage.textContent, "Recovered"); assert.equal(f.statusMessage.classList.contains("error-text"), false);
    f.api.setStatus("", true); assert.equal(f.statusMessage.textContent, "");
    assert.equal(f.statusMessage.classList.contains("error-text"), true); assert.equal(f.statusMessage.classList.contains("preserved"), true);
    f.context.statusMessage = null;
    assert.throws(() => f.api.setStatus("unavailable"), /Required Notes value is unavailable/);
  });
  it("writes editor status locally, falling back only when the editor status is absent", () => {
    const f = fixture(); f.statusMessage.textContent = "Page untouched";
    f.api.setEditorFormStatus(literal, true);
    assert.equal(f.formStatus.textContent, literal); assert.equal(f.formStatus.classList.contains("error-text"), true);
    assert.equal(f.statusMessage.textContent, "Page untouched");
    f.api.setEditorFormStatus(""); assert.equal(f.formStatus.textContent, ""); assert.equal(f.formStatus.classList.contains("error-text"), false);
    f.context.formStatus = null;
    f.api.setEditorFormStatus(literal, true); assert.equal(f.statusMessage.textContent, literal); assert.equal(f.statusMessage.classList.contains("error-text"), true);
    f.api.setEditorFormStatus("Recovered"); assert.equal(f.statusMessage.textContent, "Recovered"); assert.equal(f.statusMessage.classList.contains("error-text"), false);
    f.context.statusMessage = null; assert.throws(() => f.api.setEditorFormStatus("required fallback"), /Required Notes value is unavailable/);
  });
  it("keeps an absent bulk status optional and never redirects it to the page or editor", () => {
    const f = fixture(); f.statusMessage.textContent = "Page"; f.formStatus.textContent = "Editor";
    f.api.setBulkFormStatus(literal, true); assert.equal(f.bulkFormStatus.textContent, literal); assert.equal(f.bulkFormStatus.classList.contains("error-text"), true);
    f.api.setBulkFormStatus(""); assert.equal(f.bulkFormStatus.textContent, ""); assert.equal(f.bulkFormStatus.classList.contains("error-text"), false);
    f.context.bulkFormStatus = null; assert.doesNotThrow(() => f.api.setBulkFormStatus("absent", true));
    assert.equal(f.statusMessage.textContent, "Page"); assert.equal(f.formStatus.textContent, "Editor");
    f.context.statusMessage = null; f.context.formStatus = null;
    assert.doesNotThrow(() => f.api.setBulkFormStatus("all absent", true));
  });
  it("replaces stale list rows before synchronizing the bulk toolbar, including for an empty message", () => {
    const f = fixture(), stale = f.document.createElement("button"); stale.textContent = "Old note"; f.notesList.append(stale);
    f.api.renderEmptyList(literal);
    assert.equal(stale.parentNode, null); assert.equal(f.notesList.childNodes.length, 1);
    const prompt = f.notesList.firstChild;
    assert.equal(prompt.tagName, "P"); assert.equal(prompt.className, "notes-empty-state");
    assert.equal(prompt.textContent, literal); assert.equal(prompt.childElementCount, 0);
    assert.deepEqual(f.syncSnapshots, [literal]);
    f.api.renderEmptyList(""); assert.equal(prompt.parentNode, null); assert.equal(f.notesList.textContent, "");
    assert.equal(f.notesList.childNodes.length, 1); assert.deepEqual(f.syncSnapshots, [literal, ""]);
  });
  it("still constructs the prompt before refusing an absent required list and never synchronizes after that refusal", () => {
    const f = fixture(), create = f.document.createElement.bind(f.document);
    /** @type {ReturnType<typeof create>[]} */ const built = [];
    f.document.createElement = (tag) => { const node = create(tag); built.push(node); return node; };
    f.context.notesList = null;
    assert.throws(() => f.api.renderEmptyList(literal), /Required Notes value is unavailable/);
    assert.equal(built.length, 1); assert.equal(built[0].tagName, "P");
    assert.equal(built[0].className, "notes-empty-state"); assert.equal(built[0].textContent, literal);
    assert.equal(built[0].parentNode, null); assert.equal(f.syncSnapshots.length, 0);
  });
});
