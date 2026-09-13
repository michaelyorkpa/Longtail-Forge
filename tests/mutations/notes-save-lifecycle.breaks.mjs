import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

// Explicit checkpoint proof; never run concurrently with a server or source verification.
const path = "public/js/notes.js";
const original = Buffer.from(readFileSync(path));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const before = hash(original);
const cases = [
  ["submit permits navigation", "saveNote", "event.preventDefault();", ""],
  ["submit inverts create/edit close policy", "saveNote", "closeOnSuccess: !wasCreating", "closeOnSuccess: wasCreating"],
  ["submit does not wait for save", "saveNote", "await saveNoteForm(", "saveNoteForm("],
  ["submit rethrows reported failure", "saveNote", "} catch {", "} catch (error) { throw error;"],
  ["failed POST is claimed committed", "mutateNote", "let writeCompleted = false;", "let writeCompleted = true;"],
  ["successful POST is never marked committed", "mutateNote", "writeCompleted = true;", ""],
  ["commit flag moves after refresh", "mutateNote", "writeCompleted = true;\n      await Promise.all([loadCollections(), loadNotes()]);", "await Promise.all([loadCollections(), loadNotes()]);\n      writeCompleted = true;"],
  ["mutation refresh precedes completed write", "mutateNote", "await api.postJson(url, {})", "api.postJson(url, {})"],
  ["mutation uses wrong route", "mutateNote", "api.postJson(url, {})", "api.postJson('/wrong', {})"],
  ["mutation skips collections refresh", "mutateNote", "Promise.all([loadCollections(), loadNotes()])", "Promise.all([loadNotes()])"],
  ["mutation skips list refresh", "mutateNote", "Promise.all([loadCollections(), loadNotes()])", "Promise.all([loadCollections()])"],
  ["mutation skips the refresh barrier", "mutateNote", "await Promise.all([loadCollections(), loadNotes()]);", "Promise.all([loadCollections(), loadNotes()]);"],
  ["failed detail refresh is treated as success", "mutateNote", "if (!selected)", "if (false)"],
  ["successful detail refresh is treated as failure", "mutateNote", "if (!selected)", "if (true)"],
  ["mutation stops awaiting selection", "mutateNote", "await selectNote(", "selectNote("],
  ["mutation loses refreshed identity", "mutateNote", "selectNote(requireNoteMutationId(result))", "selectNote('wrong')"],
  ["mutation collapses post-commit refresh failure", "mutateNote", "setStatus(writeCompleted", "setStatus(false"],
  // Removing this clear alone is redundant: real selectNote already clears it on success.
  // Re-aim at the visible result instead of requiring a duplicate status write.
  ["mutation restores a stale saving status after success", "mutateNote", 'setStatus("");', 'setStatus("Saving note...");'],
  ["save POST becomes update", "saveNoteForm", 'api.postJson("/api/notes", payload)', 'api.putJson("/api/notes", payload)'],
  ["save drops encoded editor identity", "saveNoteForm", "encodeURIComponent(state.editingNoteId)", "state.editingNoteId"],
  ["save loses external-surface isolation", "saveNoteForm", "if (isNotesWorkspaceSurface)", "if (true)"],
  ["save skips host refresh", "saveNoteForm", "await state.editorHostContext.refresh(result);", ""],
  ["save omits creation transition", "saveNoteForm", "await transitionCreatedNoteToEdit(savedNote);", ""],
  ["save transition wrongly runs for edit", "saveNoteForm", "if (!wasEditing)", "if (true)"],
  ["save close policy inverted", "saveNoteForm", "if (closeOnSuccess)", "if (!closeOnSuccess)"],
  ["save host action loses edit/create distinction", "saveNoteForm", 'wasEditing ? "notes.edit" : "notes.add"', '"notes.add"'],
  ["save closes as cancel", "saveNoteForm", 'closeEditor({ returnValue: "complete" });', 'closeEditor({ returnValue: "cancel" });'],
  ["save closes before completing host", "saveNoteForm", "completeNoteEditorHostContext({", 'closeEditor({ returnValue: "complete" }); completeNoteEditorHostContext({'],
  ["save failure leaves submit disabled", "saveNoteForm", "requireNotesValue(saveButton).disabled = false;", ""],
  ["save failure leaves save-close disabled", "saveNoteForm", "requireNotesValue(saveCloseButton).disabled = false;", ""],
  ["save failure is swallowed", "saveNoteForm", "throw error;", ""],
  ["open skips hydration assignment", "openEditor", "note = await hydrateEditorNote(note);", "await hydrateEditorNote(note);"],
  ["open no longer waits for hydration", "openEditor", "note = await hydrateEditorNote(note);", "note = hydrateEditorNote(note);"],
  ["close retains editor record", "closeEditor", "state.editorNote = null;", ""],
  ["close retains selected linked target", "closeEditor", "state.editorSelectedTarget = null;", ""],
  ["close retains staged links", "closeEditor", "state.editorStagedTargets = [];", ""],
  ["close leaves file identity", "closeEditor", 'state.filesDialogNoteId = "";', ""],
  ["close leaves tag identity", "closeEditor", 'state.tagsDialogNoteId = "";', ""],
  ["close leaves copy visible", "closeEditor", "copyLinkButton.hidden = true;", "copyLinkButton.hidden = false;"],
  ["close leaves copy enabled", "closeEditor", "copyLinkButton.disabled = true;", "copyLinkButton.disabled = false;"],
  ["close leaves follow state", "closeEditor", "resetNoteNotificationFollowFields();", ""],
  ["close loses completion value", "closeEditor", 'options.returnValue || ""', '""'],
];
const command = ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-revisions-selection.test.mjs", "tests/unit/notes-editor-defaults.test.mjs", "tests/unit/notes-editor-lifecycle.test.mjs"];
let caught = 0;
/** @type {string[]} */ const inert = [];
try {
  const baseline = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, name, from, to] of cases) {
    assert.ok(label && name && from && to !== undefined);
    const start = source.indexOf(`const ${name} = Object.freeze([`);
    const region = start === -1 ? extractFunctionBlock(source, name) : source.slice(start, source.indexOf("]);", start) + 3);
    assert.ok(region.includes(from), `${label}: intended mutation site must exist`);
    try {
      writeFileSync(path, source.replace(region, region.replaceAll(from, to)));
      const syntax = spawnSync(process.execPath, ["--check", path], { encoding: "utf8", windowsHide: true });
      assert.equal(syntax.status, 0, `${label}: syntax errors are not caught breaks\n${syntax.stderr}`);
      const result = spawnSync(process.execPath, command, { encoding: "utf8", windowsHide: true });
      const output = result.stdout + result.stderr;
      if (result.status === 0) { inert.push(label); console.log(`INERT: ${label}; diagnose before delivery`); }
      else {
        assert.equal(result.status, 1, output);
        assert.match(output, /AssertionError/, `${label}: an infrastructure or runtime crash is not assertion coverage\n${output}`);
        caught += 1; console.log(`CAUGHT: ${label}`);
      }
    } finally {
      writeFileSync(path, original); assert.equal(hash(readFileSync(path)), before, `${label}: byte restoration`);
    }
  }
} finally {
  writeFileSync(path, original); assert.equal(hash(readFileSync(path)), before, "final byte restoration");
  console.log(`Restored SHA-256 ${before}`);
}
console.log(`${caught}/${cases.length} caught; ${inert.length} inert.`);
assert.equal(inert.length, 0, `Diagnose every inert mutation: ${inert.join(", ")}`);
