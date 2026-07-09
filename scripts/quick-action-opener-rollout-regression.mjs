import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appShellService = readText("src/services/app-shell.service.js");
const footer = readText("public/js/footer.js");
const moduleActions = readText("public/js/shared/module-actions.js");
const notesScript = readText("public/js/notes.js");
const listsScript = readText("public/js/lists.js");
const filesScript = readText("public/js/files.js");
const notesView = readText("views/protected/notes.html");
const listsView = readText("views/protected/lists.html");
const filesView = readText("views/protected/files.html");
const moduleContract = readText("docs/module-contract.md");
const surfaceContract = readText("docs/ui-surface-contract.md");
const regressionSuite = readText("scripts/regression-suite.mjs");
let checks = 0;

function check(name, assertion) {
  assertion();
  checks += 1;
}

check("QAC dispatches Notes and Lists through shared module actions", () => {
  assert.match(appShellService, /id: "note"[\s\S]*actionType: "module-action"[\s\S]*moduleActionId: "notes\.add"[\s\S]*requiredPermissions: \["notes\.create"\]/);
  assert.match(appShellService, /id: "list"[\s\S]*actionType: "module-action"[\s\S]*moduleActionId: "lists\.add"[\s\S]*requiredPermissions: \["lists\.create"\]/);
  assert.doesNotMatch(actionDefinitionBlock(appShellService, "note"), /temporaryFallback: true/);
  assert.doesNotMatch(actionDefinitionBlock(appShellService, "list"), /temporaryFallback: true/);
  assert.match(footer, /const moduleActionBaseDependencies = \[[\s\S]*js\/shared\/module-actions\.js\?v=2/);
  assert.match(footer, /"notes\.add": \[[\s\S]*\.\.\.moduleActionBaseDependencies[\s\S]*module: true, src: "js\/notes\.js\?v=71"/);
  assert.match(footer, /"lists\.add": \[[\s\S]*\.\.\.moduleActionBaseDependencies[\s\S]*module: true, src: "js\/lists\.js\?v=14"/);
  assert.match(footer, /function loadQuickActionScript\(dependency\)[\s\S]*dependency\.module[\s\S]*import\(key\)[\s\S]*document\.createElement\("script"\)/);
});

check("shared registry exposes first-party Notes, Lists, and Files actions", () => {
  [
    "notes.add",
    "notes.edit",
    "lists.add",
    "lists.edit",
    "files.edit",
    "files.preview",
  ].forEach((actionId) => assert.match(moduleActions, new RegExp(`id: "${escapeRegExp(actionId)}"`)));
  assert.match(moduleActions, /open: \(params, hostContext\) => namespace\.notesDialog\.openNoteEditor\(\{ \.\.\.params, mode: "add" \}, hostContext\)/);
  assert.match(moduleActions, /open: \(params, hostContext\) => namespace\.listsDialog\.openListEditor\(\{ \.\.\.params, mode: "add" \}, hostContext\)/);
  assert.match(moduleActions, /open: \(params, hostContext\) => namespace\.filesDialog\.openFileEditorAction\(params, hostContext\)/);
  assert.match(moduleActions, /open: \(params, hostContext\) => namespace\.filesDialog\.openFilePreviewAction\(params, hostContext\)/);
  assert.match(moduleActions, /moduleId === "framework"/);
});

check("module adapters wrap existing canonical openers instead of duplicating forms", () => {
  assert.match(notesScript, /window\.LongtailForge\.notesDialog = Object\.freeze/);
  assert.match(notesScript, /function openNoteEditor\(params = \{\}, hostContext = null\)[\s\S]*openEditor\(/);
  assert.match(notesScript, /completeNoteEditorHostContext\(\{[\s\S]*actionId: wasEditing \? "notes\.edit" : "notes\.add"/);
  assert.match(notesScript, /cancelNoteEditorHostContext/);
  assert.match(notesScript, /ensureNotesDialogShells\(\)/);
  assert.match(listsScript, /window\.LongtailForge\.listsDialog = Object\.freeze/);
  assert.match(listsScript, /function openListEditor\(params = \{\}, hostContext = null\)[\s\S]*openListDialog\(/);
  assert.match(listsScript, /completeListDialogHostContext\(\{[\s\S]*actionId: wasEditing \? "lists\.edit" : "lists\.add"/);
  assert.match(listsScript, /cancelListDialogHostContext/);
  assert.match(listsScript, /ensureListsDialogShell\(\)/);
});

check("Files registry stays attachment-scoped and does not invent a targetless upload modal", () => {
  assert.match(filesScript, /function openFileEditorAction\(params = \{\}, hostContext = null\)[\s\S]*openFileEditor\(attachmentOrRow/);
  assert.match(filesScript, /function openFilePreviewAction\(params = \{\}, hostContext = null\)[\s\S]*filePreview\.openFilePreview\(attachmentOrRow/);
  assert.match(filesScript, /File Context requires an attachment record/);
  assert.match(filesScript, /File Preview requires an attachment record/);
  assert.doesNotMatch(filesScript, /actionId: "files\.upload"/);
  assert.match(appShellService, /id: "file"[\s\S]*actionType: "fallback-link"[\s\S]*target-aware file upload capture ships/);
});

check("protected pages load the action registry before module adapters", () => {
  assert.ok(notesView.indexOf("js/shared/module-actions.js?v=2") < notesView.indexOf("js/notes.js?v=71"));
  assert.ok(listsView.indexOf("js/shared/module-actions.js?v=2") < listsView.indexOf("js/lists.js?v=14"));
  assert.ok(filesView.indexOf("js/shared/module-actions.js?v=2") < filesView.indexOf("js/files.js?v=15"));
});

check("documentation and suite registration cover the 0.33.6.12e-2 boundary", () => {
  assert.match(moduleContract, /As of 0\.33\.6\.10b[\s\S]*Notes and Lists now expose canonical add\/edit opener registrations/);
  assert.match(moduleContract, /Files exposes attachment-scoped `files\.edit` and `files\.preview` registrations/);
  assert.match(surfaceContract, /As of 0\.33\.6\.10b[\s\S]*Task, Note, and List capture rows use registered module actions/);
  assert.match(surfaceContract, /File capture remains an explicit temporary page fallback/);
  assert.match(regressionSuite, /scripts\/quick-action-opener-rollout-regression\.mjs/);
});

console.log(`Quick Action opener rollout regression passed ${checks} checks.`);

function readText(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function actionDefinitionBlock(source, actionId) {
  const start = source.indexOf(`id: "${actionId}"`);
  assert.notEqual(start, -1, `Missing quick action ${actionId}`);
  const rest = source.slice(start);
  const end = rest.indexOf("  }),");
  return end === -1 ? rest : rest.slice(0, end + 6);
}
