import { escapeRegExp, extractFunctionBlock } from "../../test-support/source-scan.mjs";
import assert from "node:assert/strict";

import { createProjectTextReader } from "../../test-support/source-scan.mjs";
// Consolidated under notes.current-static-contracts by 0.33.33.10.
const { readText } = createProjectTextReader();

const notesDocs = readText("docs/notes-module.md");
const moduleContract = readText("docs/module-contract.md");
const filesScript = readText("public/js/files.js");
const filePreviewScript = readText("public/js/shared/file-preview.js");
const attachmentHelper = readText("public/js/shared/file-attachments.js");
const filesView = readText("views/protected/files.html");
const notesView = readText("views/protected/notes.html");
const tasksView = readText("views/protected/tasks.html");
const workbenchView = readText("views/protected/workbench.html");

assert.match(filePreviewScript, /namespace\.filePreview = Object\.freeze\(\{[\s\S]*normalizeFilePreviewRow[\s\S]*openFilePreview[\s\S]*previewAvailabilityForRow[\s\S]*previewKindForExtension[\s\S]*previewUnavailableLabel/,
  "Shared file preview helper should expose the preview modal and eligibility helpers");
assert.match(filePreviewScript, /namespace\.filesDialog = Object\.freeze\(\{[\s\S]*openFilePreview/,
  "Shared preview helper should preserve the canonical filesDialog.openFilePreview API");
assert.match(filePreviewScript, /api\.getJson\(`\/api\/files\/attachments\/\$\{encodeURIComponent\(row\.attachmentId\)\}\/preview`[\s\S]*api\.getJson\(preview\.contentUrl/,
  "Shared preview helper should keep descriptor and content loading route-backed");
assert.match(filePreviewScript, /content\.innerHTML = html \|\| ""/,
  "Shared preview helper should render only server-sanitized Markdown HTML");
assert.doesNotMatch(filePreviewScript, /MarkdownIt|marked|showdown|markdown-it|\/api\/files\/batch|openFileEditor|File Context|Inspector/,
  "Shared preview helper should not add a browser Markdown parser, upload behavior, File Context, or Inspector behavior");

assert.match(filesScript, /const filePreview = window\.LongtailForge\?\.filePreview/,
  "Files page should consume the shared preview helper");
assert.match(filesScript, /openFilePreview: \(\.\.\.args\) => filePreview\.openFilePreview\(\.\.\.args\)/,
  "Files page should keep the canonical filesDialog preview opener through the shared helper");
assert.match(extractFunctionBlock(filesScript, "fileRow"), /filePreview\.previewAvailabilityForRow\(\{[\s\S]*canPreviewInReview: canManageReview[\s\S]*extension[\s\S]*fileSizeBytes[\s\S]*scanStatus[\s\S]*status/,
  "Files rows should still derive preview affordance from the shared eligibility helper");
assert.match(extractFunctionBlock(filesScript, "createPreviewAction"), /icon:\s*"eye"[\s\S]*filePreview\.openFilePreview\(row,\s*\{\s*trigger:\s*event\.currentTarget\s*\}\)/,
  "Files row Preview action should keep opening the shared preview modal");
assert.doesNotMatch(filesScript, /function buildFilePreviewDialog|function loadFilePreview|function renderFilePreviewMarkdown|function previewAvailabilityForRow/,
  "Files page should not keep a duplicate preview modal implementation");

const createActions = extractFunctionBlock(attachmentHelper, "createAttachmentActions");
const createPreviewAction = extractFunctionBlock(attachmentHelper, "createAttachmentPreviewAction");
const createDownloadAction = extractFunctionBlock(attachmentHelper, "createAttachmentDownloadAction");
const actionButton = extractFunctionBlock(attachmentHelper, "createAttachmentActionButton");

assert.match(createActions, /createAttachmentPreviewRow\(attachment, file, options\)[\s\S]*const preview = createAttachmentPreviewAction\(view, previewRow\)[\s\S]*const actionNodes = \[preview, download, remove, report, quarantine, deleteButton, restore\]/,
  "Shared attachment rows should include Preview before the existing file actions");
assert.match(createPreviewAction, /action: "files\.preview"[\s\S]*hidden: !row\?\.previewable \|\| !namespace\.filePreview\?\.openFilePreview[\s\S]*icon: "eye"[\s\S]*iconOnly: true[\s\S]*namespace\.filePreview\.openFilePreview\(row, \{ trigger: event\?\.currentTarget \|\| null \}\)/,
  "Attachment Preview should be eligibility-gated, icon-only, accessible, and routed through the shared preview helper");
assert.match(createDownloadAction, /namespace\.icons\?\.createIcon\?\.\("download"[\s\S]*icon-button file-attachment-action[\s\S]*"aria-label": label[\s\S]*href: `\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/download`/,
  "Attachment Download should become an icon button while keeping the authenticated download route");
assert.match(actionButton, /icon: options\.icon[\s\S]*iconOnly: options\.iconOnly[\s\S]*text: options\.text/,
  "Attachment action buttons should pass icon metadata through the shared action helper");
for (const [icon, action] of [
  ["delete", "files.removeAttachment"],
  ["alert", "files.report"],
  ["shield-alert", "files.quarantine"],
  ["delete", "files.delete"],
  ["restore", "files.restore"],
]) {
  assert.match(createActions, new RegExp(`action: "${escapeRegExp(action)}"[\\s\\S]*icon: "${icon}"`),
    `${action} should render with the expected icon`);
}

assert.match(filesView, /js\/shared\/view-renderer\.js[\s\S]*js\/shared\/file-preview\.js[\s\S]*js\/files\.js/,
  "Files view should load the shared preview helper before Files browser code");
assert.match(notesView, /js\/shared\/file-attachments\.js[\s\S]*js\/shared\/view-renderer\.js[\s\S]*js\/shared\/file-preview\.js[\s\S]*js\/notes\.js/,
  "Notes view should load updated attachment actions and shared preview before Notes mounts panels");
assert.match(tasksView, /js\/shared\/file-attachments\.js[\s\S]*js\/shared\/file-preview\.js[\s\S]*js\/task-dialog\.js/,
  "Tasks view should load updated attachment actions and shared preview before Task Files dialogs");
assert.match(workbenchView, /js\/shared\/file-attachments\.js[\s\S]*js\/shared\/file-preview\.js/,
  "Workbench should load updated attachment actions and shared preview for the lazy Task Files dialogs");
assert.match(readText("public/js/workbench.js"), /src: "js\/task-dialog\.js"/,
  "Workbench should lazy-load the task dialog after its static attachment and preview helpers");

assert.match(notesDocs, /As of 0\.33\.5\.21\.9\.3[\s\S]*shared Files Preview modal[\s\S]*icon-only action buttons/,
  "Notes docs should document preview and icon attachment actions");
assert.match(moduleContract, /As of 0\.33\.5\.21\.9\.3[\s\S]*public\/js\/shared\/file-preview\.js[\s\S]*LongtailForge\.filePreview/,
  "Module contract should document the shared preview helper boundary");
console.log("Notes file preview actions regression passed.");