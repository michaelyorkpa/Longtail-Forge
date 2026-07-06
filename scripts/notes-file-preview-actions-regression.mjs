import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.27.19";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const notesDocs = readText("docs/notes-module.md");
const moduleContract = readText("docs/module-contract.md");
const filesScript = readText("public/js/files.js");
const filePreviewScript = readText("public/js/shared/file-preview.js");
const attachmentHelper = readText("public/js/shared/file-attachments.js");
const filesView = readText("views/protected/files.html");
const notesView = readText("views/protected/notes.html");
const tasksView = readText("views/protected/tasks.html");
const workbenchView = readText("views/protected/workbench.html");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Notes file preview action version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Notes file preview action version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Notes file preview action version");

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
assert.match(functionBlock(filesScript, "fileRow"), /filePreview\.previewAvailabilityForRow\(\{[\s\S]*canPreviewInReview: canManageReview[\s\S]*extension[\s\S]*fileSizeBytes[\s\S]*scanStatus[\s\S]*status/,
  "Files rows should still derive preview affordance from the shared eligibility helper");
assert.match(functionBlock(filesScript, "createPreviewAction"), /icon:\s*"eye"[\s\S]*filePreview\.openFilePreview\(row,\s*\{\s*trigger:\s*event\.currentTarget\s*\}\)/,
  "Files row Preview action should keep opening the shared preview modal");
assert.doesNotMatch(filesScript, /function buildFilePreviewDialog|function loadFilePreview|function renderFilePreviewMarkdown|function previewAvailabilityForRow/,
  "Files page should not keep a duplicate preview modal implementation");

const createActions = functionBlock(attachmentHelper, "createAttachmentActions");
const createPreviewAction = functionBlock(attachmentHelper, "createAttachmentPreviewAction");
const createDownloadAction = functionBlock(attachmentHelper, "createAttachmentDownloadAction");
const actionButton = functionBlock(attachmentHelper, "createAttachmentActionButton");

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

assert.match(filesView, /js\/shared\/view-renderer\.js\?v=13[\s\S]*js\/shared\/file-preview\.js\?v=1[\s\S]*js\/files\.js\?v=14/,
  "Files view should load the shared preview helper before Files browser code");
assert.match(notesView, /js\/shared\/file-attachments\.js\?v=8[\s\S]*js\/shared\/view-renderer\.js\?v=12[\s\S]*js\/shared\/file-preview\.js\?v=1[\s\S]*js\/notes\.js\?v=70/,
  "Notes view should load updated attachment actions and shared preview before Notes mounts panels");
assert.match(tasksView, /js\/shared\/file-attachments\.js\?v=8[\s\S]*js\/shared\/file-preview\.js\?v=1[\s\S]*js\/task-dialog\.js\?v=23/,
  "Tasks view should load updated attachment actions and shared preview before Task Files dialogs");
assert.match(workbenchView, /js\/shared\/file-attachments\.js\?v=8[\s\S]*js\/shared\/file-preview\.js\?v=1[\s\S]*js\/task-dialog\.js\?v=23/,
  "Workbench should load updated attachment actions and shared preview before Task Files dialogs");

assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.21 durable jobs and outbox foundation work is archived in `ROADMAP-ARCHIVE\.md`/,
  "live roadmap should not carry completed-history breadcrumbs");
assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `),
  "Changelog should include the Notes file preview action slice");
assert.match(notesDocs, /As of 0\.33\.5\.21\.9\.3[\s\S]*shared Files Preview modal[\s\S]*icon-only action buttons/,
  "Notes docs should document preview and icon attachment actions");
assert.match(moduleContract, /As of 0\.33\.5\.21\.9\.3[\s\S]*public\/js\/shared\/file-preview\.js[\s\S]*LongtailForge\.filePreview/,
  "Module contract should document the shared preview helper boundary");
assert.match(regressionSuite, /scripts\/notes-file-preview-actions-regression\.mjs/,
  "Regression suite should include Notes file preview action coverage");

console.log("Notes file preview actions regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  let braceStart = -1;
  let parenDepth = 0;

  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "(") {
      parenDepth += 1;
    } else if (source[index] === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (source[index] === "{" && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }

  assert.notEqual(braceStart, -1, `${name} should have a function body`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`${name} body should close`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
