import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const notesHtml = readText("views/protected/notes.html");
const notesJs = readText("public/js/notes.js");
const notesCss = readText("public/css/longtail-forge.css");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, "0.33.5.21.7.3", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.21.7.3", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.21.7.3", "package-lock package entry should report the current app version");

assert.match(notesHtml, /css\/longtail-forge\.css\?v=56/, "Notes should cache-bust the stacked Files modal warning styles");
assert.match(notesHtml, /js\/notes\.js\?v=69/, "Notes should cache-bust the stacked Files modal browser wiring");
assert.match(notesHtml, /js\/shared\/view-builder\.js\?v=11/, "Notes should keep using the modal-stack-enabled view builder");
assert.match(notesHtml, /js\/shared\/view-renderer\.js\?v=12/, "Notes should keep using the modal-stack-enabled renderer");

assert.match(notesJs, /function createNoteFilesDialogShell\(\)/, "Notes should build a dedicated Files dialog shell");
assert.match(notesJs, /document\.body\.append\([\s\S]*createNoteDialogShell\(\),[\s\S]*createNoteTagsDialogShell\(\),[\s\S]*createNoteFilesDialogShell\(\),[\s\S]*createCollectionDialogShell\(\),[\s\S]*createCollectionActionsDialogShell\(\),[\s\S]*\)/, "The Files dialog should be a sibling dialog, not inline editor content");
assert.match(notesJs, /dialog\.dataset\.noteFilesDialog = ""/, "The Files dialog should expose a stable dialog hook");
assert.match(notesJs, /filesMount\.dataset\.noteFilesEditor = ""/, "The shared file attachment helper should mount inside the stacked Files dialog");
assert.match(notesJs, /saveFirstWarning\.dataset\.noteFilesSaveFirstWarning = ""/, "The unsaved-note warning should expose a stable hook");
assert.match(notesJs, /text: "Save the note before adding files\."/ , "The Files dialog should use the required unsaved-note warning copy");

assert.match(notesJs, /filesToggle\?\.addEventListener\("click", openFilesDialog\)/, "The Files utility button should open the stacked Files dialog");
assert.match(notesJs, /filesDialogCloseButton\?\.addEventListener\("click", closeFilesDialog\)/, "The Files dialog should have an explicit close control");
assert.match(notesJs, /filesDialog\?\.addEventListener\("close", handleFilesDialogClose\)/, "Closing the Files dialog should reset utility button state");
assert.match(notesJs, /function openFilesDialog\(\)[\s\S]*view\.showModal\(filesDialog, \{ parent: dialog, trigger: filesToggle \}\)[\s\S]*data-file-attachment-input[\s\S]*data-note-files-save-first-warning[\s\S]*focusTarget\?\.focus\(\)/, "Files should open as a child modal above the Add/Edit Note editor and focus the attachment input or save-first warning");
assert.match(notesJs, /function closeFilesDialog\(\)[\s\S]*view\.closeModal\(filesDialog\)/, "Files should close through the shared modal stack helper");
assert.match(notesJs, /function handleFilesDialogClose\(\)[\s\S]*filesToggle\?\.setAttribute\("aria-expanded", "false"\)/, "Closing Files should return the footer utility to the collapsed state");

assert.doesNotMatch(notesJs, /noteFilesPanel|data-note-files-panel|toggleNoteEditorPanel\("files"\)|function toggleNoteEditorPanel/, "Files should no longer render or toggle an inline editor panel below Body");
assert.match(notesJs, /function mountNoteEditorFiles\(note\)[\s\S]*filesSaveFirstWarning\.hidden = Boolean\(note\?\.note_id\)/, "Unsaved notes should show the save-first warning in the Files dialog");
assert.match(notesJs, /if \(!filesAvailable \|\| secure \|\| !note\?\.note_id\) \{[\s\S]*filesEditor\?\.replaceChildren\?\.\(\)/, "Unsaved notes should not mount the attachment helper against an empty target id");
assert.match(notesJs, /state\.editorAttachmentController = window\.LongtailForge\.fileAttachments\.mount\(filesEditor, \{[\s\S]*canUpload: Boolean\(note\?\.note_id\) && note\?\.status !== "archived"[\s\S]*targetId: note\?\.note_id \|\| ""/, "Saved normal notes should mount the shared attachment helper with the saved note id");
assert.match(notesJs, /const secure = isSecureNote\(note\) \|\| \(!note\?\.note_id && isSecureEditorMode\(\)\)/, "Secure saved notes and secure draft notes should keep normal file attachments unavailable");
assert.match(notesJs, /filesToggle\.hidden = secure \|\| !filesAvailable[\s\S]*closeFilesDialog\(\)/, "Unavailable or secure Files utility state should collapse and close the child dialog");
assert.match(notesJs, /function resetNoteEditorPanels\(\)[\s\S]*closeTagsDialog\(\)[\s\S]*closeFilesDialog\(\)/, "Resetting the note editor should close any stacked utility dialogs");

assert.match(notesCss, /\.notes-files-save-first-warning\s*\{[\s\S]*border:\s*1px solid var\(--color-danger-border\);[\s\S]*background:\s*var\(--color-danger-bg\);[\s\S]*color:\s*var\(--color-danger\);/, "The unsaved-note Files warning should use danger styling");
assert.match(regressionSuite, /scripts\/notes-files-stacked-modal-regression\.mjs/, "The stacked Files modal regression should be part of the full suite");

console.log("Notes Files stacked modal regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
