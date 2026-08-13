// Consolidated under notes.current-static-contracts by 0.33.33.10.
export const regressionMeta = Object.freeze({
  id: "notes.notes-critical-quick-fixes",
  area: "notes",
  tier: "focused",
  tags: ["bulk-edit", "collections", "modal", "notes", "permissions", "selection"],
  description: "Pins the current Notes quick-fix contracts for permission-safe metadata bulk editing and create-save continuity with an explicit Save and Close path.",
  runMode: "static",
});

import assert from "node:assert/strict";

import { createProjectTextReader } from "../../test-support/source-scan.mjs";
const { readTextAsync: readText } = createProjectTextReader();

const css = await readText("public/css/longtail-forge.css");
const notes = await readText("public/js/notes.js");
const notesModule = await readText("src/modules/notes/module.js");
const notesRoutes = await readText("src/modules/notes/notes.routes.js");
const notesService = await readText("src/modules/notes/notes.service.js");

assert.match(notesRoutes, /post\("\/notes\/bulk"[\s\S]*notesService\.bulkUpdate/, "Notes should expose one module-owned bulk metadata route");
assert.match(functionBlock(notesService, "bulkUpdate"), /assertNotesWriteEnabled\(session\)[\s\S]*at most 100 notes[\s\S]*normalizeNoteBulkChanges[\s\S]*readNoteOrThrow\(session, noteId\)[\s\S]*assertCanAccess\(session, previousNote, "update"\)[\s\S]*updateValidatedNote\(noteId, changes, session, previousNote\)[\s\S]*errors\.push/, "bulk updates should stay bounded and run every selected note through the canonical validated update pipeline");
assert.match(functionBlock(notesService, "normalizeNoteBulkChanges"), /readCollectionById\(session\.workspace_id, noteCollectionId\)[\s\S]*collection\.library_bucket[\s\S]*changes\.note_collection_id = null[\s\S]*Choose at least one Notes field/, "bulk field normalization should keep collection and Library state consistent and reject empty changes");

assert.match(notesModule, /id: "note-bulk-editor"[\s\S]*field: "library"[\s\S]*field: "collection"[\s\S]*field: "noteType"[\s\S]*field: "visibility"[\s\S]*field: "tagAction"/, "the Notes descriptor should declare metadata fields plus the bulk tag action");
assert.match(functionBlock(notes, "createNotesListChrome"), /createNotesBulkToolbar\(\)[\s\S]*list/, "the bulk control should stay with the Notes List in the slide-out sidebar");
assert.match(functionBlock(notes, "createNotesBulkToolbar"), /view\.createBulkActionToolbar[\s\S]*Edit selected notes[\s\S]*Clear selection/, "Notes should use the shared bulk-toolbar shell");
assert.match(functionBlock(notes, "noteListItem"), /notes-list-select[\s\S]*aria-label[\s\S]*toggleBulkNoteSelection[\s\S]*row\.append\(selection, button\)/, "row selection should remain distinct from opening the selected note");
assert.match(functionBlock(notes, "createNoteBulkDialogShell"), /dataset\.noteBulkTagAction[\s\S]*notes-bulk-tags-field[\s\S]*dataset\.noteBulkTags/, "the bulk modal should keep the tag action in descriptor anatomy and provide a module-owned shared-picker mount");
assert.match(functionBlock(notes, "mountBulkTagPicker"), /tags\.mountPicker\(bulkTagsEditor,[\s\S]*allowCreate: false[\s\S]*placeholder: "Type to search tags"[\s\S]*tags: state\.availableTags/, "Notes bulk tagging should use the native typable shared picker instead of a multi-select scroll box");
assert.match(functionBlock(notes, "applyBulkEdit"), /postJson\("\/api\/notes\/bulk"[\s\S]*postJson\("\/api\/tags\/bulk-assignments"[\s\S]*targetType: "note"[\s\S]*state\.selectedNoteIds = failedNoteIds[\s\S]*could not be fully updated/, "the browser should apply metadata and Tags-owned bulk actions while retaining failed selections");
assert.match(functionBlock(notes, "readBulkNoteChanges"), /libraryBucket[\s\S]*noteCollectionId = null[\s\S]*noteType[\s\S]*visibility/, "the bulk modal should send only explicitly selected metadata fields");
assert.match(css, /\.notes-list-row\s*\{[\s\S]*grid-template-columns: auto minmax\(0, 1fr\)/, "selection checkboxes should have a dedicated column beside the Notes-owned row button");

assert.match(notesModule, /id: "save-close-note", label: "Save & Close"[\s\S]*id: "save-note", label: "Save Note"/, "the Notes editor descriptor should expose separate Save and Save and Close actions");
assert.match(functionBlock(notes, "saveNote"), /const wasCreating = !state\.editingNoteId[\s\S]*closeOnSuccess: !wasCreating/, "Save should keep a newly created note open");
assert.match(functionBlock(notes, "saveNoteForm"), /!wasEditing[\s\S]*transitionCreatedNoteToEdit\(result\.note\)[\s\S]*Note saved\. Continue editing or choose Save & Close\./, "the create dialog should transition in place to a persisted edit dialog");
assert.match(functionBlock(notes, "transitionCreatedNoteToEdit"), /state\.editingNoteId = note\.note_id[\s\S]*dialogTitle\.textContent = "Edit Note"[\s\S]*mountTagEditor\(note\)[\s\S]*mountNoteEditorFiles\(note\)/, "the persisted note should enable the canonical saved-note utilities without closing the dialog");

console.log("Notes critical quick-fixes regression passed.");

function functionBlock(source, functionName) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${functionName}\\(`).exec(source);
  assert.ok(match, `${functionName} should exist`);
  const start = match.index;
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
