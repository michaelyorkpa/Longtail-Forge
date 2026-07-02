import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const notesHtml = readText("views/protected/notes.html");
const notesJs = readText("public/js/notes.js");
const notesServiceJs = readText("src/modules/notes/notes.service.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, "0.33.5.21.3", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.21.3", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.21.3", "package-lock package entry should report the current app version");

assert.match(notesHtml, /css\/longtail-forge\.css\?v=56/, "Notes should cache-bust the stacked Files modal warning styles");
assert.match(notesHtml, /js\/notes\.js\?v=69/, "Notes should cache-bust the stacked Tags and Files modal browser wiring");
assert.match(notesHtml, /js\/shared\/view-builder\.js\?v=11/, "Notes should keep using the modal-stack-enabled view builder");
assert.match(notesHtml, /js\/shared\/view-renderer\.js\?v=12/, "Notes should keep using the modal-stack-enabled renderer");

assert.match(notesJs, /function createNoteTagsDialogShell\(\)/, "Notes should build a dedicated Tags dialog shell");
assert.match(notesJs, /document\.body\.append\([\s\S]*createNoteDialogShell\(\),[\s\S]*createNoteTagsDialogShell\(\),[\s\S]*createNoteFilesDialogShell\(\),[\s\S]*createCollectionDialogShell\(\),[\s\S]*createCollectionActionsDialogShell\(\),[\s\S]*\)/, "The Tags dialog should be a sibling dialog, not body content inside the editor form");
assert.match(notesJs, /dialog\.dataset\.noteTagsDialog = ""/, "The Tags dialog should expose a stable dialog hook");
assert.match(notesJs, /tagsMount\.dataset\.noteTagsEditor = ""/, "The shared tag picker should mount inside the stacked Tags dialog");
assert.match(notesJs, /tagsToggle\?\.addEventListener\("click", openTagsDialog\)/, "The Tags utility button should open the stacked Tags dialog");
assert.match(notesJs, /tagsDialogCloseButton\?\.addEventListener\("click", closeTagsDialog\)/, "The Tags dialog should have an explicit close control");
assert.match(notesJs, /tagsDialog\?\.addEventListener\("close", handleTagsDialogClose\)/, "Closing the Tags dialog should reset utility button state");
assert.match(notesJs, /function openTagsDialog\(\)[\s\S]*view\.showModal\(tagsDialog, \{ parent: dialog, trigger: tagsToggle \}\)[\s\S]*\[data-tag-picker-input\][\s\S]*\.focus\(\)/, "Tags should open as a child modal above the Add/Edit Note editor and focus the picker input");
assert.match(notesJs, /function closeTagsDialog\(\)[\s\S]*view\.closeModal\(tagsDialog\)/, "Tags should close through the shared modal stack helper");
assert.match(notesJs, /function handleTagsDialogClose\(\)[\s\S]*tagsToggle\?\.setAttribute\("aria-expanded", "false"\)/, "Closing Tags should return the footer utility to the collapsed state");

assert.doesNotMatch(notesJs, /tagPanel|noteTagsPanel/, "Tags should no longer render or toggle an inline editor panel below Body");
assert.doesNotMatch(notesJs, /toggleNoteEditorPanel\("tags"\)/, "The Tags button must not use the inline panel toggle");
assert.doesNotMatch(notesJs, /noteFilesPanel|toggleNoteEditorPanel\("files"\)/, "Files should no longer use the deferred inline editor panel after the Files slice");

assert.match(notesJs, /state\.tagPicker = await window\.LongtailForge\.tags\.mountPicker\(tagsEditor, \{[\s\S]*selectedTags: note\?\.tags \|\| \[\]/, "Opening an editor should hydrate the Tags modal picker from the current note tags");
assert.match(notesJs, /tagIds: state\.tagPicker\?\.readTagIds\?\.\(\) \|\| \[\]/, "Saving the note should still persist staged tag picker selections");
assert.match(notesServiceJs, /await tagsService\.replaceAssignments\(session, \{[\s\S]*targetType: "note"[\s\S]*tagIds: payload\.tagIds \|\| payload\.tag_ids \|\| \[\]/, "Notes service should keep tag persistence on create/update payloads");
assert.match(regressionSuite, /scripts\/notes-tags-stacked-modal-regression\.mjs/, "The stacked Tags modal regression should be part of the full suite");

console.log("Notes Tags stacked modal regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
