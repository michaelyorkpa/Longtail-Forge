import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/notes.js");
const names = ["isKnownNoteKind", "noteKindLabel", "ensureNoteKindOption", "resetLegacyNoteKindOptions", "isKnownContextTargetType", "contextTypeLabel", "normalizeText", "formatToken"];
function fixture() {
  const browser = createFakeBrowserContext();
  const typeInput = browser.document.createElement("select");
  const context = vm.createContext({ ...browser, typeInput,
    createOption: (/** @type {string} */ value, /** @type {string} */ label) => Object.assign(browser.document.createElement("option"), { value, textContent: label }),
  });
  // Lift the actual producer literals: the fixture must not supply its own labels or keys.
  for (const name of ["NOTE_KIND_LABELS", "LEGACY_NOTE_KINDS", "LINK_TARGET_TYPE_LABELS"]) {
    const start = source.indexOf(`const ${name} =`); assert.ok(start >= 0);
    vm.runInContext(source.slice(start, source.indexOf(";", start) + 1), context);
  }
  for (const name of names) vm.runInContext(extractFunctionBlock(source, name), context);
  return { api: vm.runInContext(`({${names.join(",")}})`, context), context, typeInput, document: browser.document };
}

describe("Notes kind labels and legacy options", () => {
  it("reads all declared kind labels and formats unknown tokens without accepting prototype keys", () => {
    const { api } = fixture();
    const labels = { general: "General", meeting: "Meeting", research: "Research", decision: "Decision", procedure: "Procedure", reference: "Reference", idea: "Idea", log: "Log",
      client: "Legacy client", project: "Legacy project", task: "Legacy task", ticket: "Legacy ticket", user: "Legacy user" };
    for (const [key, label] of Object.entries(labels)) { assert.equal(api.isKnownNoteKind(key), true); assert.equal(api.noteKindLabel(key), label); }
    // The wire contract allows a string, not a promise that it names an own dictionary key.
    for (const [key, label] of [["future_kind", "Future Kind"], ["mixed-token_name", "Mixed Token Name"], ["", ""], ["constructor", "Constructor"], ["toString", "ToString"], ["__proto__", " Proto "]]) {
      assert.equal(api.isKnownNoteKind(key), false); assert.equal(api.noteKindLabel(key), label);
    }
  });

  it("adds each legacy option once, preserves existing choices and removes only generated options", () => {
    const f = fixture();
    const general = f.document.createElement("option"); general.value = "general"; general.textContent = "General"; f.typeInput.append(general);
    const existing = f.document.createElement("option"); existing.value = "project"; existing.textContent = "Existing project"; f.typeInput.append(existing);
    for (const key of ["client", "project", "task", "ticket", "user"]) { f.api.ensureNoteKindOption(` ${key} `); f.api.ensureNoteKindOption(key); }
    assert.deepEqual(f.typeInput.options.map((/** @type {{value: string}} */ option) => option.value), ["general", "project", "client", "task", "ticket", "user"]);
    assert.strictEqual(f.typeInput.options[0], general); assert.strictEqual(f.typeInput.options[1], existing);
    assert.equal(existing.textContent, "Existing project");
    assert.deepEqual(f.typeInput.options.slice(2).map((/** @type {{textContent: string, dataset: Record<string,string>}} */ option) => [option.textContent, option.dataset.legacyNoteKind]),
      [["Legacy client", "true"], ["Legacy task", "true"], ["Legacy ticket", "true"], ["Legacy user", "true"]]);
    f.api.resetLegacyNoteKindOptions(); assert.deepEqual(f.typeInput.options, [general, existing]);
  });

  it("normalizes the option input and ignores nonlegacy or absent-control cases", () => {
    const f = fixture();
    for (const value of [undefined, null, false, 0, 42, {}, [], "", "general", "future_kind", "constructor"]) f.api.ensureNoteKindOption(value);
    assert.equal(f.typeInput.options.length, 0);
    f.api.ensureNoteKindOption({ toString: () => "task" }); assert.equal(f.typeInput.options.length, 1);
    assert.equal(f.typeInput.options[0].value, "task");
    f.context.typeInput = null;
    assert.doesNotThrow(() => f.api.ensureNoteKindOption("client")); assert.doesNotThrow(() => f.api.resetLegacyNoteKindOptions());
  });

  it("keeps directory labels and formats the wider strings forwarded by the URL editor", () => {
    const { api } = fixture();
    for (const [type, label] of Object.entries({ workspace: "Workspace", client: "Client", list: "List", note: "Note", project: "Project", task: "Task", user: "User" })) {
      assert.equal(api.isKnownContextTargetType(type), true);
      assert.equal(api.contextTypeLabel(type), label);
    }
    for (const [type, label] of [["future_record", "Future Record"], ["", "Context"], ["constructor", "Constructor"], ["toString", "ToString"]]) {
      assert.equal(api.isKnownContextTargetType(type), false); assert.equal(api.contextTypeLabel(type), label);
    }
  });

  it("establishes the URL producer's string domain without pretending it is a directory result", async () => {
    /** @type {unknown[]} */ const opened = [];
    const context = vm.createContext({ URLSearchParams, window: { location: { search: "?targetType=future_record&targetId=fixture-id" } },
      openEditorForLinkedTarget: (/** @type {unknown} */ target) => opened.push(target),
      selectNote: () => { throw new Error("Unexpected saved-note selection"); },
    });
    vm.runInContext(extractFunctionBlock(source, "openNoteFromUrl"), context);
    await vm.runInContext("openNoteFromUrl()", context);
    assert.deepEqual(JSON.parse(JSON.stringify(opened)), [{ clientId: "", libraryBucket: "", moduleId: "", noteKind: "", projectId: "", targetId: "fixture-id", targetType: "future_record" }]);
  });
});
