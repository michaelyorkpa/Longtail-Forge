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
// 0.33.33.34 reduced `window.LongtailForge.filesDialog` to its canonical Files owner.
// This helper had merged `openFilePreview` in through its namespace alias, a member
// files.js already republishes and nothing in the tree read from `filesDialog`; it now
// publishes the whole preview surface, including the action-shaped opener, under
// `filePreview`.
assert.match(filePreviewScript, /namespace\.filePreview = Object\.freeze\(\{[\s\S]*openFilePreview,\s*\n\s*openFilePreviewAction,/,
  "Shared preview helper should publish the action-shaped opener alongside the preview API");
assert.doesNotMatch(filePreviewScript, /namespace\.filesDialog =/,
  "Shared preview helper must not write the Files dialog namespace it does not own");
assert.match(filePreviewScript, /api\.getJson\(`\/api\/files\/attachments\/\$\{encodeURIComponent\(row\.attachmentId\)\}\/preview`[\s\S]*api\.getJson\(preview\.contentUrl/,
  "Shared preview helper should keep descriptor and content loading route-backed");
// Retargeted under `0.33.33.38.4.9.5`: the sink is unchanged, but what reaches it is now the
// `bodyHtml` of a vouched-for content record rather than a raw `.content || {}` read, so this
// owner asserts the whole path - read through the contract reader, assign only its markup.
assert.match(filePreviewScript, /readFilePreviewContent\(await api\.getJson\(preview\.contentUrl/,
  "Shared preview helper should read content through its contract reader");
assert.match(filePreviewScript, /content\.innerHTML = html;/,
  "Shared preview helper should render only server-sanitized Markdown HTML");
// Split from the combined guard below and made case-insensitive under `0.33.33.38.4.9.5`: the
// previous spelling missed `window.markdownit`, the global markdown-it's own UMD build
// defines, which a bite-proof introduced and this guard let through.
assert.doesNotMatch(filePreviewScript, /markdown-?it|marked|showdown/i,
  "Shared preview helper should not add a browser Markdown parser");
assert.doesNotMatch(filePreviewScript, /\/api\/files\/batch|openFileEditor|File Context|Inspector/,
  "Shared preview helper should not add upload behavior, File Context, or Inspector behavior");

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
assert.match(readText("public/js/shared/module-actions.js"), /src: "js\/task-dialog\.js"/,
  "The registry should lazy-load the task dialog after a host page's static attachment and preview helpers");

assert.match(notesDocs, /As of 0\.33\.5\.21\.9\.3[\s\S]*shared Files Preview modal[\s\S]*icon-only action buttons/,
  "Notes docs should document preview and icon attachment actions");
assert.match(moduleContract, /As of 0\.33\.5\.21\.9\.3[\s\S]*public\/js\/shared\/file-preview\.js[\s\S]*LongtailForge\.filePreview/,
  "Module contract should document the shared preview helper boundary");
console.log("Notes file preview actions regression passed.");