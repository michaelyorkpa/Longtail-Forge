import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.19.5";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const notesModule = readText("src/modules/notes/module.js");
const tasksModule = readText("src/modules/tasks/module.js");
const helper = readText("public/js/shared/file-attachments.js");
const filesScript = readText("public/js/files.js");
const notesJs = readText("public/js/notes.js");
const taskDialog = readText("public/js/task-dialog.js");
const styles = readText("public/css/longtail-forge.css");
const notesHtml = readText("views/protected/notes.html");
const tasksHtml = readText("views/protected/tasks.html");
const workbenchHtml = readText("views/protected/workbench.html");
const viewContract = readText("docs/view-building-contract.md");
const moduleContract = readText("docs/module-contract.md");
const declarativeSurfaces = readText("docs/declarative-view-surfaces.md");
const roadmap = readText("ROADMAP.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Files attachment-panel shell version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Files attachment-panel shell version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Files attachment-panel shell version");
assert.match(notesModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Notes module should report the current attachment-panel shell version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current attachment-panel shell version");

const render = functionBlock(helper, "render");
assert.match(render, /const view = global\.LongtailForge\?\.view/, "Attachment helper render should lazily read the view helper for host load-order safety");
assert.match(render, /createAttachmentPanelShell\(state, view, header, children\)/, "Attachment panel should render through a panel shell helper");
assert.match(render, /createAttachmentEmptyState\(options\.saveFirstMessage \|\| "Save before adding files\.", false, view\)/, "Unsaved records should keep save-first messaging through the shared empty shell");
assert.match(render, /uploadControls\(container, state\)[\s\S]*attachmentList\(container, state, view\)/, "Saved records should keep upload and list behavior in the shared helper");

const panelShell = functionBlock(helper, "createAttachmentPanelShell");
assert.match(panelShell, /view\?\.createListShell/, "Attachment panel should use the shared list shell when available");
assert.match(panelShell, /tagName: "section"[\s\S]*className: "file-attachments file-attachments-panel-shell"/, "Attachment panel should use stable shared shell classes");
assert.match(panelShell, /"data-file-attachment-panel": ""/, "Attachment panel should expose a stable panel hook");
assert.match(panelShell, /statusMessage: statusMessage\(state\)/, "Attachment panel status should route through the shared shell status slot");
assert.match(panelShell, /"data-file-attachments-status": ""/, "Attachment panel status should expose a stable hook");
assert.match(panelShell, /return createAttachmentElement\(view, "section"[\s\S]*attrs,/, "Attachment panel should use the centralized attachment element fallback");

const listShell = functionBlock(helper, "createAttachmentListShell");
assert.match(listShell, /view\?\.createListShell/, "Attachment list should use the shared list shell when available");
assert.match(listShell, /className: "file-attachments-list"[\s\S]*"data-file-attachments-list": ""[\s\S]*status: false/, "Attachment list shell should keep a stable list hook without duplicate status chrome");
assert.match(listShell, /return createAttachmentElement\(view, "div"[\s\S]*"data-file-attachments-list": ""/, "Attachment list should use the centralized attachment element fallback");

const emptyShell = functionBlock(helper, "createAttachmentEmptyState");
assert.match(emptyShell, /view\?\.createEmptyState/, "Loading, error, empty, and save-first states should use the shared empty-state shell when available");
assert.match(emptyShell, /role: isError \? "alert" : "status"/, "Attachment empty/error states should keep accessible live semantics");
assert.match(emptyShell, /view\?\.createEmptyState[\s\S]*return emptyState\(message, isError\)/, "Attachment empty states should use the shared empty-state helper with one centralized fallback");

const uploadResults = functionBlock(helper, "uploadResultList");
assert.match(uploadResults, /view\?\.createListShell/, "Upload result rows should use the shared list shell when available");
assert.match(uploadResults, /"data-file-upload-results": ""[\s\S]*status: false/, "Upload result rows should keep their stable hook without duplicate status chrome");
assert.match(uploadResults, /createUploadResultItem/, "Upload result rows should remain visible per uploaded file");

const uploadResultItem = functionBlock(helper, "createUploadResultItem");
assert.match(uploadResultItem, /data-file-upload-result/, "Upload result rows should expose success/error hooks");
assert.match(uploadResultItem, /result\.ok \?[\s\S]*uploaded\.[\s\S]*Upload failed\./, "Upload result rows should keep success and failure copy");

const attachmentItem = functionBlock(helper, "attachmentItem");
assert.match(attachmentItem, /attrs:\s*\{\s*"data-file-attachment-item": ""\s*\}/, "Attachment rows should expose a stable item hook");
assert.match(attachmentItem, /is-deleted[\s\S]*is-quarantined[\s\S]*is-unavailable/, "Attachment rows should classify deleted, quarantined, and unavailable states");
assert.match(attachmentItem, /attachmentRecoveryMessage\(file, isDownloadable, isDeleted\)/, "Attachment rows should compute gentle recovery-state copy");
assert.match(attachmentItem, /createAttachmentActions\(container, state, attachment, view/, "Attachment rows should render actions through a dense action shell");

const actions = functionBlock(helper, "createAttachmentActions");
assert.match(actions, /view\?\.createDetailActionStrip[\s\S]*className: "file-attachment-actions"/, "Attachment actions should use the shared dense action strip when available");
assert.match(actions, /data-file-attachment-actions/, "Attachment actions should expose a stable dense-action hook");
assert.match(actions, /createAttachmentDownloadAction/, "Download should stay a Files-owned route action");
assert.match(actions, /createAttachmentActionButton\(view[\s\S]*files\.removeAttachment[\s\S]*files\.delete[\s\S]*files\.restore/, "Remove, delete, and restore should use shared action buttons while keeping Files actions");

const actionButton = functionBlock(helper, "createAttachmentActionButton");
assert.match(actionButton, /view\?\.createActionButton/, "Attachment buttons should use shared action buttons when available");
assert.match(actionButton, /createAttachmentElement\(view, "button"\)/, "Attachment buttons should keep a centralized native fallback");

const recovery = functionBlock(helper, "attachmentRecoveryMessage");
["recovery window", "in review", "review completes", "review is complete", "unavailable for this file"].forEach((copy) => {
  assert.ok(recovery.includes(copy), `Recovery-safe copy should cover ${copy}`);
});

const refresh = functionBlock(helper, "refresh");
assert.match(refresh, /api\.getJson\(`\/api\/files\/attachments\?/, "Attachment list reads should remain Files-owned route calls");
const uploadFiles = functionBlock(helper, "uploadFiles");
assert.match(uploadFiles, /readFileBase64\(file\)/, "Upload file reading should remain Files-owned helper behavior");
assert.match(uploadFiles, /api\.postJson\("\/api\/files\/batch"/, "Upload should keep using the Files batch route");
assert.match(functionBlock(helper, "removeAttachment"), /\/api\/files\/attachments\/\$\{encodeURIComponent\(attachmentId\)\}\/remove/, "Remove should keep using the Files attachment route");
assert.match(functionBlock(helper, "deleteFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/delete/, "Delete should keep using the Files lifecycle route");
assert.match(functionBlock(helper, "restoreFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/restore/, "Restore should keep using the Files lifecycle route");

assert.doesNotMatch(helper, /openFileEditor|openFilePreview|preview\/content|File Context|Inspector/, "Attachment helper should not become File Context, Preview, or Inspector UI");
assert.match(filesScript, /function openFileEditor\(/, "Canonical File Context workflow should remain Files-owned outside the attachment helper");
assert.match(filesScript, /function openFilePreview\(/, "Canonical Preview workflow should remain Files-owned outside the attachment helper");

assert.match(styles, /\.file-attachments-panel-shell\.view-list-shell\s*\{[\s\S]*gap:\s*12px/, "Attachment panel shared shell should keep compact spacing");
assert.match(styles, /\.file-attachments-empty\.view-empty-state\s*\{[\s\S]*border-style:\s*dashed/, "Shared empty state should render as gentle recovery-safe chrome");
assert.match(styles, /\.file-attachment-upload-results\.view-list-shell\s*\{[\s\S]*gap:\s*4px/, "Upload result shell should keep compact row spacing");
assert.match(styles, /\.file-attachments-list\.view-list-shell\s*\{[\s\S]*gap:\s*8px/, "Attachment list shell should keep compact row spacing");
assert.match(styles, /\.file-attachment-item\.is-unavailable:not\(\.is-deleted\)/, "Unavailable attachment rows should have a gentle visible state");
assert.match(styles, /\.file-attachment-recovery-state\s*\{[\s\S]*color:\s*var\(--color-muted\)/, "Recovery-state copy should stay quiet");
assert.match(styles, /\.file-attachment-actions\s*\{[\s\S]*flex-wrap:\s*wrap/, "Attachment action shell should wrap safely in stacked dialogs");

assert.match(notesHtml, /css\/longtail-forge\.css\?v=56/, "Notes should cache-bust the shared stylesheet for attachment panel shell changes");
assert.match(notesHtml, /js\/shared\/file-attachments\.js\?v=5/, "Notes should cache-bust the attachment helper for panel shell changes");
assert.match(tasksHtml, /css\/longtail-forge\.css\?v=72/, "Tasks should cache-bust the shared stylesheet for attachment panel shell changes");
assert.match(tasksHtml, /js\/shared\/file-attachments\.js\?v=4/, "Tasks should cache-bust the attachment helper for panel shell changes");
assert.match(workbenchHtml, /css\/longtail-forge\.css\?v=21/, "Workbench should cache-bust the shared stylesheet for attachment panel shell changes");
assert.match(workbenchHtml, /js\/shared\/file-attachments\.js\?v=4/, "Workbench should cache-bust the attachment helper for panel shell changes");

assert.match(functionBlock(notesJs, "openFilesDialog"), /view\.showModal\(filesDialog, \{ parent: dialog, trigger: filesToggle \}\)[\s\S]*data-file-attachment-input[\s\S]*focusTarget\?\.focus\(\)/, "Notes Files utility should still open as a stacked child dialog and focus the helper input when available");
assert.match(functionBlock(taskDialog, "openTaskFilesDialog"), /showTaskModal\(filesDialog, \{ parent: dialog, trigger: fields\.fileToggle \}\)[\s\S]*\[data-file-attachment-input\]/, "Tasks Files utility should still open as a stacked child dialog and focus the helper input when saved");
assert.match(functionBlock(taskDialog, "mountTaskFileAttachments"), /saveFirstMessage: "Save the task before adding files\."/ , "Tasks should preserve save-first messaging for unsaved records");

assert.match(viewContract, /Implementation Notes For 0\.33\.5\.18\.12\.2/, "View-building contract should document the attachment-panel shell slice");
assert.match(moduleContract, /As of 0\.33\.5\.18\.12\.2, the shared Files attachment helper wraps its reusable attachment panel/, "Module contract should document the panel shell boundary");
assert.match(declarativeSurfaces, /As of 0\.33\.5\.18\.12\.2, the shared Files attachment helper also standardizes its reusable attachment panel/, "Declarative surface contract should mention the panel shell standardization");
assert.match(roadmap, /Completed 0\.33\.5\.18\.12\.1 through 0\.33\.5\.18\.12\.7 are archived/, "Roadmap should archive the completed Files panel shell branch");
assert.match(regressionSuite, /scripts\/files-attachment-panel-shell-regression\.mjs/, "Full regression suite should include the attachment-panel shell regression");

console.log("Files attachment panel shell regression passed.");

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
