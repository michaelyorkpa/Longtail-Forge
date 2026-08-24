import assert from "node:assert/strict";

import { createProjectTextReader, extractFunctionSpan } from "../../test-support/source-scan.mjs";
// Consolidated under notes.current-static-contracts by 0.33.33.10.
const { readText } = createProjectTextReader();

const tasksModule = readText("src/modules/tasks/module.js");
const notesScript = readText("public/js/notes.js");
const taskDialog = readText("public/js/task-dialog.js");
const notesView = readText("views/protected/notes.html");
const tasksView = readText("views/protected/tasks.html");
const workbenchScript = readText("public/js/workbench.js");
const tasksDocs = readText("docs/tasks-module.md");
const notesDocs = readText("docs/notes-module.md");

assert.match(tasksModule, /version:\s*appVersion/, "Tasks module should report the modal footer visual parity version");

const noteShell = extractFunctionSpan(notesScript, "createNoteDialogShell");
const openEditor = extractFunctionSpan(notesScript, "openEditor");
const copyCurrentNoteLink = extractFunctionSpan(notesScript, "copyCurrentNoteLink");
const taskUtilityActions = extractFunctionSpan(taskDialog, "taskEditorUtilityActions");
const taskDescriptor = extractFunctionSpan(taskDialog, "taskEditorModalDescriptor");
const taskDecorateControls = extractFunctionSpan(taskDialog, "decorateTaskDialogControls");

assert.match(noteShell, /const cancel = view\.createActionButton\(\{[\s\S]*icon: "close"[\s\S]*iconOnly: true[\s\S]*label: "Cancel"[\s\S]*role: "secondary"/, "Notes Cancel should use the compact icon commit treatment");
assert.match(noteShell, /const save = view\.createActionButton\(\{[\s\S]*icon: "save"[\s\S]*iconOnly: true[\s\S]*label: modal\.footerActions\?\.find[\s\S]*role: "primary"[\s\S]*type: "submit"/, "Notes Save should use the compact icon commit treatment");
assert.match(noteShell, /const tagsToggle = view\.createActionButton\(\{[\s\S]*icon: "tag"[\s\S]*iconOnly: false[\s\S]*label: "Tags"[\s\S]*text: "Tags"[\s\S]*title: "Tags"/, "Notes Tags should be an icon plus text utility action");
assert.match(noteShell, /const filesToggle = view\.createActionButton\(\{[\s\S]*icon: "file"[\s\S]*iconOnly: false[\s\S]*label: "Files"[\s\S]*text: "Files"[\s\S]*title: "Files"/, "Notes Files should be an icon plus text utility action");
assert.match(noteShell, /const copyLink = view\.createActionButton\(\{[\s\S]*icon: "copy"[\s\S]*iconOnly: false[\s\S]*label: "Copy note link"[\s\S]*text: "Copy Link"[\s\S]*title: "Copy note link"/, "Notes Copy Link should be an icon plus text utility action");
assert.match(noteShell, /copyLink\.dataset\.copyNoteLink = ""[\s\S]*copyLink\.hidden = true[\s\S]*utilityActions: \[tagsToggle, filesToggle, copyLink\]/, "Notes Copy Link should live in the footer utility group and start hidden");
assert.match(notesScript, /const copyLinkButton = document\.querySelector\("\[data-copy-note-link\]"\)[\s\S]*copyLinkButton\?\.addEventListener\("click", copyCurrentNoteLink\)/, "Notes Copy Link should have a module-owned click handler");
assert.match(openEditor, /copyLinkButton\.hidden = !note\?\.note_id[\s\S]*copyLinkButton\.disabled = !note\?\.note_id/, "Notes Copy Link should appear only for saved notes");
assert.match(copyCurrentNoteLink, /new window\.URL\("notes\.html", window\.location\.href\)[\s\S]*url\.searchParams\.set\("note", noteId\)[\s\S]*navigator\.clipboard\.writeText\(url\.toString\(\)\)[\s\S]*setEditorFormStatus\("Note link copied\."\)/, "Notes Copy Link should construct a note URL and use clipboard with in-modal status");

assert.match(taskDescriptor, /id: "tags", label: "Task tags", icon: "tag", role: "utility", text: "Tags"[\s\S]*id: "files", label: "Task files", icon: "file", role: "utility", text: "Files"[\s\S]*id: "copy-link", label: "Copy task link", icon: "copy", role: "utility", text: "Copy Link"/, "Tasks utility descriptors should carry visible footer text");
assert.match(taskUtilityActions, /iconOnly: false[\s\S]*label: action\.label[\s\S]*role: action\.role[\s\S]*text: action\.text \|\| action\.label[\s\S]*title: action\.label/, "Tasks utility buttons should render as icon plus text actions");
assert.match(taskDecorateControls, /icons\.decorateButton\(fields\.tagToggle, \{ icon: "tag", label: "Task tags", text: "Tags", title: "Task tags", iconOnly: false \}\)[\s\S]*icons\.decorateButton\(fields\.fileToggle, \{ icon: "file", label: "Task files", text: "Files", title: "Task files", iconOnly: false \}\)[\s\S]*icons\.decorateButton\(fields\.copyLink, \{ icon: "copy", label: "Copy task link", text: "Copy Link", title: "Copy task link", iconOnly: false \}\)/, "Tasks footer utility controls should keep icon plus text decoration");
assert.match(taskDecorateControls, /icons\.decorateButton\(fields\.cancel, \{ icon: "close", label: "Cancel", text: "", title: "Cancel", iconOnly: true \}\)[\s\S]*icons\.decorateButton\(fields\.save, \{ icon: "save", label: "Save task", text: "", title: "Save task", iconOnly: true \}\)/, "Tasks commit controls should remain compact icon buttons");

assert.match(notesView, /js\/notes\.js/, "Notes view should reference follow-bell browser wiring");
assert.match(tasksView, /js\/task-dialog\.js/, "Tasks view should reference footer visual parity browser wiring");
assert.match(workbenchScript, /src: "js\/task-dialog\.js"/, "Workbench should lazy-load the shared Task dialog browser wiring");
assert.match(notesDocs, /^# Notes Module Developer Guide$/m, "Notes docs should retain the owning developer-guide heading");
assert.match(notesDocs, /Tags, Files, and Copy Link footer utilities use icon plus text/, "Notes docs should document footer utility visual parity");
assert.match(tasksDocs, /^# Tasks Module$/m, "Tasks docs should retain the owning module heading");
assert.match(tasksDocs, /Tags, Files, and Copy Link footer utilities use icon plus text/, "Tasks docs should document footer utility visual parity");

console.log("Notes and Tasks modal footer visual parity regression passed.");
