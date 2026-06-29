import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.14.2";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const filesScript = readText("public/js/files.js");
const attachmentHelper = readText("public/js/shared/file-attachments.js");
const appShellService = readText("src/services/app-shell.service.js");
const filesRoutes = readText("src/routes/files.routes.js");
const filesService = readText("src/services/files.service.js");
const filesHtml = readText("views/protected/files.html");
const notesHtml = readText("views/protected/notes.html");
const tasksHtml = readText("views/protected/tasks.html");
const workbenchHtml = readText("views/protected/workbench.html");
const changelog = readText("CHANGELOG.md");
const roadmap = readText("ROADMAP.md");
const viewContract = readText("docs/view-building-contract.md");
const moduleContract = readText("docs/module-contract.md");
const declarativeSurfaces = readText("docs/declarative-view-surfaces.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Files action-wiring version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Files action-wiring version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Files action-wiring version");

const fileRow = functionBlock(filesScript, "fileRow");
assert.match(fileRow, /reportable: canReportFileRow\(attachment, file, fileId, status\)/, "Files rows should shape report visibility through an action helper");
assert.match(fileRow, /quarantineable: canQuarantineFileRow\(attachment, file, fileId, status\)/, "Files rows should shape quarantine visibility through a permission-aware helper");

const rowActions = functionBlock(filesScript, "createFileActions");
assert.match(rowActions, /view\.createDetailActionStrip\(\{[\s\S]*className: "files-row-actions"[\s\S]*actions: rowActions/, "Files row actions should use the shared dense action placement");
assert.match(rowActions, /actions\.dataset\.fileActions = ""/, "Files row actions should expose a stable dense-action hook");
assert.match(rowActions, /createPreviewAction\(row\)[\s\S]*createDownloadAction\(row\)[\s\S]*createReportAction\(row\)[\s\S]*createQuarantineAction\(row\)[\s\S]*createDeleteAction\(row\)[\s\S]*createRestoreAction\(row\)/, "Files rows should keep Preview, Download, Report, Quarantine, Delete, and Restore as distinct controls");

assert.match(functionBlock(filesScript, "createPreviewAction"), /action: "files\.preview"[\s\S]*stopFileRowActionEvent\(event\)[\s\S]*openFilePreview\(row/, "Preview should remain a distinct modal action and stop row activation");
assert.match(functionBlock(filesScript, "createDownloadAction"), /className: "button-link action-button view-action-button icon-button files-row-action"[\s\S]*download: true[\s\S]*href: `\/api\/files\/\$\{encodeURIComponent\(row\.fileId\)\}\/download`[\s\S]*surfaceAction: "files\.download"/, "Download should remain a shared Files download route action");
const rowReportAction = functionBlock(filesScript, "createReportAction");
assert.match(rowReportAction, /action: "files\.report"/, "Report should expose the Files report action ID");
assert.match(rowReportAction, /icon: "alert"[\s\S]*iconOnly: true[\s\S]*text: ""[\s\S]*stopFileRowActionEvent\(event\)[\s\S]*reportFile\(row\.fileId, row\.file, row\.attachmentId\)/, "Report should be an accessible icon-only, distinct Files action");
const rowQuarantineAction = functionBlock(filesScript, "createQuarantineAction");
assert.match(rowQuarantineAction, /action: "files\.quarantine"/, "Quarantine should expose the Files quarantine action ID");
assert.match(rowQuarantineAction, /icon: "shield-alert"[\s\S]*iconOnly: true[\s\S]*text: ""[\s\S]*variant: "danger"[\s\S]*quarantineFile\(row\.fileId, row\.file\)/, "Quarantine route action should appear as a distinct icon-only Review action");
const rowDeleteAction = functionBlock(filesScript, "createDeleteAction");
assert.match(rowDeleteAction, /action: "files\.delete"/, "Delete should expose the Files delete action ID");
assert.match(rowDeleteAction, /variant: "danger"[\s\S]*deleteFile\(row\.fileId, row\.file\)/, "Delete should keep its danger styling and Files route handler");
assert.match(functionBlock(filesScript, "createRestoreAction"), /action: "files\.restore"[\s\S]*restoreFile\(row\.fileId\)/, "Restore should keep a distinct Files route handler");
assert.match(functionBlock(filesScript, "isFileRowActionEvent"), /\[data-file-action\], a, button, input, select, textarea/, "Row click and Enter should ignore action controls");

assert.match(functionBlock(filesScript, "createPreviewDownloadAction"), /surfaceAction: "files\.download"/, "Preview modal download should share the Files download action vocabulary");
assert.match(functionBlock(filesScript, "buildFileEditorDialog"), /action: "files\.preview"[\s\S]*openFilePreview\(row/, "File Context may preserve Preview placement without reimplementing Preview");
assert.match(functionBlock(filesScript, "previewAvailabilityForRow"), /state: "download_only"/, "Unsupported files should remain download-only instead of opening a detail panel");

const rowReport = functionBlock(filesScript, "reportFile");
assert.match(rowReport, /modal\.confirm/, "Report should preserve explicit confirmation");
assert.match(rowReport, /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/report/, "Report should call the existing Files report route");
assert.match(rowReport, /attachmentId[\s\S]*reason: FILE_REPORT_REASON/, "Report should send the selected attachment context and allowed report reason");
assert.match(rowReport, /loadFiles\(\)/, "Report should refresh the Files listing after mutation");

const rowQuarantine = functionBlock(filesScript, "quarantineFile");
assert.match(rowQuarantine, /modal\.confirm/, "Quarantine should preserve explicit confirmation");
assert.match(rowQuarantine, /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/quarantine/, "Quarantine should call the existing Files quarantine route");
assert.match(rowQuarantine, /reason: FILE_QUARANTINE_REASON/, "Quarantine should send the manual quarantine reason");
assert.match(rowQuarantine, /loadFiles\(\)/, "Quarantine should refresh the Files listing after mutation");

assert.match(functionBlock(filesScript, "canQuarantineFileRow"), /canManageFileReview\(attachment, file, fileId\)[\s\S]*status !== "quarantined"/, "Quarantine row visibility should use the shared explicit review permission evidence");
assert.match(functionBlock(filesScript, "canManageFileReview"), /workspaceHasPermission\("files\.manage_quarantine"\)/, "Review visibility should use explicit permission evidence");
assert.match(functionBlock(filesScript, "workspaceHasPermission"), /permissionHints\?\.filesManageQuarantine === true/, "Files page should honor the app-shell quarantine permission hint");

const helperActions = functionBlock(attachmentHelper, "createAttachmentActions");
assert.match(helperActions, /view\?\.createDetailActionStrip[\s\S]*className: "file-attachment-actions"/, "Attachment actions should use shared dense action placement");
assert.match(helperActions, /files\.removeAttachment[\s\S]*files\.report[\s\S]*files\.quarantine[\s\S]*files\.delete[\s\S]*files\.restore/, "Attachment actions should expose Files action IDs for shipped mutations");
assert.match(helperActions, /const actionNodes = \[download, remove, report, quarantine, deleteButton, restore\]/, "Attachment controls should remain distinct and ordered as separate controls");
assert.match(functionBlock(attachmentHelper, "createAttachmentDownloadAction"), /"aria-label": `Download \$\{name\}`[\s\S]*"data-surface-action": "files\.download"[\s\S]*href: `\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/download`/, "Attachment downloads should remain accessible Files route actions");
assert.match(functionBlock(attachmentHelper, "normalizeOptions"), /canReport: true[\s\S]*canQuarantine: workspaceHasPermission\("files\.manage_quarantine"\)/, "Attachment helper should support permission-shaped report and quarantine visibility");

const helperReport = functionBlock(attachmentHelper, "reportFile");
assert.match(helperReport, /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/report/, "Attachment Report should call the Files report route");
assert.match(helperReport, /attachmentId[\s\S]*reason: FILE_REPORT_REASON/, "Attachment Report should preserve attachment context and allowed report reason");
assert.match(helperReport, /emit\(container, state, "fileReported"[\s\S]*refresh\(container, state\)/, "Attachment Report should emit and refresh after mutation");

const helperQuarantine = functionBlock(attachmentHelper, "quarantineFile");
assert.match(helperQuarantine, /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/quarantine/, "Attachment Quarantine should call the Files quarantine route");
assert.match(helperQuarantine, /reason: FILE_QUARANTINE_REASON/, "Attachment Quarantine should send the manual quarantine reason");
assert.match(helperQuarantine, /emit\(container, state, "fileQuarantined"[\s\S]*refresh\(container, state\)/, "Attachment Quarantine should emit and refresh after mutation");

assert.match(functionBlock(attachmentHelper, "workspaceHasPermission"), /permissionHints\?\.filesManageQuarantine === true/, "Attachment helper should honor the app-shell quarantine permission hint");
assert.doesNotMatch(attachmentHelper, /openFileEditor|openFilePreview|preview\/content|Inspector/, "Attachment helper should not become File Context, Preview, or Inspector UI");

assert.match(functionBlock(appShellService, "readPermissionHints"), /files\.manage_quarantine[\s\S]*filesManageQuarantine: canManageFileQuarantine/, "App shell should expose a narrow quarantine permission hint");
assert.match(filesRoutes, /post\("\/files\/:fileId\/report"/, "Files report route should remain the browser mutation route");
assert.match(filesRoutes, /post\("\/files\/:fileId\/quarantine"/, "Files quarantine route should remain the browser mutation route");
assert.match(functionBlock(filesService, "reportFile"), /canReadAnyAttachment[\s\S]*normalizeReportReason[\s\S]*status = 'quarantined'/, "Report service should keep read checks, allowed reasons, and quarantine lifecycle behavior");
assert.match(functionBlock(filesService, "quarantineFile"), /assertCan\(session, "files\.manage_quarantine"[\s\S]*status = 'quarantined'/, "Quarantine service should keep server-side permission authority");

assert.match(filesHtml, /js\/shared\/icons\.js\?v=6/, "Files page should cache-bust the shared row-action icons");
assert.match(filesHtml, /js\/files\.js\?v=13/, "Files page should cache-bust the Files action wiring");
assert.match(notesHtml, /js\/shared\/file-attachments\.js\?v=5/, "Notes should cache-bust the shared attachment action helper");
assert.match(tasksHtml, /js\/shared\/file-attachments\.js\?v=4/, "Tasks should cache-bust the shared attachment action helper");
assert.match(workbenchHtml, /js\/shared\/file-attachments\.js\?v=4/, "Workbench should cache-bust the shared attachment action helper");

assert.match(changelog, /## Version 0\.33\.5\.18\.12\.4[\s\S]*Files visual states and control parity/, "Changelog should document the current Files visual parity slice");
assert.match(roadmap, /Completed 0\.33\.5\.18\.12\.1 through 0\.33\.5\.18\.12\.7 are archived/, "Roadmap should archive the completed Files action/guardrail branch");
assert.match(viewContract, /Implementation Notes For 0\.33\.5\.18\.12\.4/, "View-building contract should document the current Files visual parity slice");
assert.match(moduleContract, /As of 0\.33\.5\.18\.12\.4/, "Module contract should document the current Files visual parity boundary");
assert.match(declarativeSurfaces, /As of 0\.33\.5\.18\.12\.4/, "Declarative surface contract should document the current Files visual parity boundary");
assert.match(regressionSuite, /scripts\/files-row-attachment-actions-regression\.mjs/, "Full regression suite should include the Files action-wiring regression");

["rename", "hard purge", "permanent delete", "storage move", "file replacement"].forEach((forbidden) => {
  assert.doesNotMatch(rowActions, new RegExp(forbidden, "i"), `Files row actions should not introduce ${forbidden}`);
  assert.doesNotMatch(helperActions, new RegExp(forbidden, "i"), `Attachment actions should not introduce ${forbidden}`);
});

console.log("Files row and attachment action wiring regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
