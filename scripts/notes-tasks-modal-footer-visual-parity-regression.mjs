import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.21.7.5";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const notesScript = readText("public/js/notes.js");
const taskDialog = readText("public/js/task-dialog.js");
const notesView = readText("views/protected/notes.html");
const tasksView = readText("views/protected/tasks.html");
const workbenchView = readText("views/protected/workbench.html");
const tasksDocs = readText("docs/tasks-module.md");
const notesDocs = readText("docs/notes-module.md");
const roadmap = readText("ROADMAP.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the modal footer visual parity version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the modal footer visual parity version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the modal footer visual parity version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the modal footer visual parity version");

const noteShell = functionBlock(notesScript, "createNoteDialogShell");
const openEditor = functionBlock(notesScript, "openEditor");
const copyCurrentNoteLink = functionBlock(notesScript, "copyCurrentNoteLink");
const taskUtilityActions = functionBlock(taskDialog, "taskEditorUtilityActions");
const taskDescriptor = functionBlock(taskDialog, "taskEditorModalDescriptor");
const taskDecorateControls = functionBlock(taskDialog, "decorateTaskDialogControls");

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

assert.match(notesView, /js\/notes\.js\?v=69/, "Notes view should cache-bust follow-bell browser wiring");
assert.match(tasksView, /js\/task-dialog\.js\?v=21/, "Tasks view should cache-bust footer visual parity browser wiring");
assert.match(workbenchView, /js\/task-dialog\.js\?v=21/, "Workbench should cache-bust the shared Task dialog browser wiring");
assert.match(notesDocs, new RegExp(`current Notes implementation as of ${escapeRegExp(appVersion)}`), "Notes docs should report the current module handoff version");
assert.match(notesDocs, /Tags, Files, and Copy Link footer utilities use icon plus text/, "Notes docs should document footer utility visual parity");
assert.match(tasksDocs, new RegExp(`current Tasks module behavior as of ${escapeRegExp(appVersion)}`), "Tasks docs should report the current module handoff version");
assert.match(tasksDocs, /Tags, Files, and Copy Link footer utilities use icon plus text/, "Tasks docs should document footer utility visual parity");
assert.match(roadmap, /Completed 0\.33\.5\.18\.12\.1 through 0\.33\.5\.18\.12\.7 are archived/, "Roadmap should archive the completed Files upload/action/guardrail branch");
assert.match(regressionSuite, /scripts\/notes-tasks-modal-footer-visual-parity-regression\.mjs/, "Regression suite should include the modal footer visual parity regression");

console.log("Notes and Tasks modal footer visual parity regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
