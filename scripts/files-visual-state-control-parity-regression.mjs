import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.19.5";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const filesScript = readText("public/js/files.js");
const attachmentHelper = readText("public/js/shared/file-attachments.js");
const styles = readText("public/css/longtail-forge.css");
const filesHtml = readText("views/protected/files.html");
const notesHtml = readText("views/protected/notes.html");
const tasksHtml = readText("views/protected/tasks.html");
const workbenchHtml = readText("views/protected/workbench.html");
const changelog = readText("CHANGELOG.md");
const roadmap = readText("ROADMAP.md");
const viewContract = readText("docs/view-building-contract.md");
const moduleContract = readText("docs/module-contract.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Files visual parity version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Files visual parity version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Files visual parity version");

assert.match(filesHtml, /css\/longtail-forge\.css\?v=13/, "Files page should cache-bust the visual parity stylesheet");
assert.match(filesHtml, /js\/shared\/icons\.js\?v=6/, "Files page should cache-bust the shared action icons");
assert.match(filesHtml, /js\/files\.js\?v=13/, "Files page should cache-bust the visual parity adapter");
assert.match(notesHtml, /css\/longtail-forge\.css\?v=56[\s\S]*js\/shared\/file-attachments\.js\?v=5/, "Notes should cache-bust shared attachment visuals");
assert.match(tasksHtml, /css\/longtail-forge\.css\?v=72[\s\S]*js\/shared\/file-attachments\.js\?v=4/, "Tasks should cache-bust shared attachment visuals");
assert.match(workbenchHtml, /css\/longtail-forge\.css\?v=21[\s\S]*js\/shared\/file-attachments\.js\?v=4/, "Workbench should cache-bust shared attachment visuals");

const filesTable = functionBlock(filesScript, "createFilesTable");
assert.match(filesTable, /emptyMessage:\s*"No file attachments match the current filters\."/,
  "Files browse empty state should describe the attachment-scoped surface");

const statusSelect = functionBlock(filesScript, "createStatusSelect");
assert.match(statusSelect, /\["deleted", "Unavailable"\][\s\S]*\["pending", "Review pending"\][\s\S]*\["quarantined", "In review"\]/,
  "Files status filter should use broad available/review language while retaining route values");

const fileStatusCell = functionBlock(filesScript, "createFileStatusCell");
assert.match(fileStatusCell, /className: "file-status-cell surface-chip-row"/, "Files status cell should render a wrapping chip row");
assert.match(fileStatusCell, /const reviewLabel = reviewStateLabel\(row\.status, row\.scanStatus\)[\s\S]*createFileStatusChip\(row\.status, row\.statusLabel\)[\s\S]*createFileScanStatusChip\(row\.scanStatus, reviewLabel, row\.statusLabel\)/,
  "Files status cell should include a distinct review-state chip only when it is not duplicating availability");
assert.match(fileStatusCell, /status\.dataset\.fileSize = row\.fileSizeLabel/, "Files status cell should preserve file-size data for future display without adding metadata panels");

assert.match(functionBlock(filesScript, "createFileStatusChip"), /surface-chip files-status-chip[\s\S]*File status:[\s\S]*dataset:\s*\{\s*fileStatusChip/,
  "Files availability chip should use shared chip styling and accessible status labels");
assert.match(functionBlock(filesScript, "createFileScanStatusChip"), /text === statusLabelText[\s\S]*surface-chip files-status-chip[\s\S]*Review state:[\s\S]*dataset:\s*\{\s*fileScanStatusChip/,
  "Files review chip should use shared chip styling, accessible labels, and suppress duplicate review text");

const filesStatusLabel = functionBlock(filesScript, "statusLabel");
assert.match(filesStatusLabel, /status === "deleted"[\s\S]*"Unavailable"/, "Deleted Files rows should be presented as unavailable");
assert.match(filesStatusLabel, /status === "quarantined"[\s\S]*"In review"/, "Quarantined Files rows should be presented as in review");
assert.match(filesStatusLabel, /"Review pending"[\s\S]*"Review needed"[\s\S]*"Available"/, "Files statuses should use review/available language");
assert.doesNotMatch(filesStatusLabel, /Quarantined|Pending scan|Scan error/, "Files status labels should not expose quarantine or scan jargon in normal UI");
assert.match(functionBlock(filesScript, "scanStatusLabel"), /not_required[\s\S]*No review needed[\s\S]*passed[\s\S]*Reviewed[\s\S]*pending[\s\S]*Review pending[\s\S]*error[\s\S]*Review needed/,
  "Files scan-status chips should be normalized as review-state labels");
assert.match(functionBlock(filesScript, "reviewStateLabel"), /status === "quarantined"[\s\S]*"In review"[\s\S]*scanStatusLabel\(scanStatus\)/,
  "In-review files should not show contradictory reviewed scan text in review-state display");
assert.match(functionBlock(filesScript, "createFileEditorMetadataList"), /\["Review state", reviewStateLabel\(row\.status, row\.scanStatus \|\| ""\), "review-state"\]/,
  "File Context metadata should include the same review-state language without changing route-backed behavior");

const rowActions = functionBlock(filesScript, "createFileActions");
assert.match(rowActions, /createPreviewAction\(row\)[\s\S]*createDownloadAction\(row\)[\s\S]*createReportAction\(row\)[\s\S]*createQuarantineAction\(row\)[\s\S]*createDeleteAction\(row\)[\s\S]*createRestoreAction\(row\)/,
  "Files rows should keep Preview, Download, Report, Review, Delete, and Restore as separate controls");
assert.match(functionBlock(filesScript, "createReportAction"), /icon:\s*"alert"[\s\S]*iconOnly:\s*true[\s\S]*text:\s*""[\s\S]*action:\s*"files\.report"[\s\S]*stopFileRowActionEvent/,
  "Report should be icon-only and route-backed on dense Files rows");
assert.match(functionBlock(filesScript, "createQuarantineAction"), /icon:\s*"shield-alert"[\s\S]*iconOnly:\s*true[\s\S]*label:\s*`Review \$\{row\.fileName\}`[\s\S]*text:\s*""[\s\S]*action:\s*"files\.quarantine"[\s\S]*quarantineFile\(row\.fileId, row\.file\)/,
  "The quarantine route action should appear as an icon-only Review control in normal UI");
assert.match(functionBlock(filesScript, "quarantineFile"), /title:\s*"Move file to review\?"[\s\S]*confirmLabel:\s*"Move to Review"[\s\S]*\/quarantine/,
  "Review action should preserve the protected quarantine route with review-oriented confirmation copy");
assert.match(functionBlock(filesScript, "reportFile"), /Downloads will be paused until a workspace admin reviews it/,
  "Report confirmation should use review-oriented availability copy");
assert.match(functionBlock(filesScript, "buildFileEditorDialog"), /action:\s*"files\.preview"[\s\S]*openFilePreview\(row/,
  "File Context may keep its Preview control without reimplementing Preview behavior");
assert.match(functionBlock(filesScript, "createPreviewDownloadAction"), /surfaceAction: "files\.download"/,
  "Preview modal download should stay tied to the shared Files download action vocabulary");

const attachmentItem = functionBlock(attachmentHelper, "attachmentItem");
assert.match(attachmentItem, /className: "file-attachment-meta surface-chip-row"/, "Attachment metadata should render as a wrapping chip row");
assert.match(attachmentItem, /const statusText = statusLabel\(file\.status, file\.scanStatus\)[\s\S]*const reviewText = reviewStateLabel\(file\.status, file\.scanStatus\)[\s\S]*reviewText === statusText \? null : createAttachmentMetaChip\(view, "Review state", reviewText/,
  "Attachment metadata should include distinct status and review-state chips without contradictory duplicates");
assert.match(attachmentItem, /createAttachmentRecoveryState\(view, recoveryMessage\)/, "Attachment recovery copy should remain close to the owning attachment");
assert.match(functionBlock(attachmentHelper, "createAttachmentMetaChip"), /surface-chip[\s\S]*file-attachment-meta-chip[\s\S]*aria-label/,
  "Attachment chips should use shared chip styling and accessible labels");
const attachmentActions = functionBlock(attachmentHelper, "createAttachmentActions");
assert.match(attachmentActions, /action:\s*"files\.report"[\s\S]*label:\s*"Report"/,
  "Attachment Report should keep visible text with the Files report action ID");
assert.match(attachmentActions, /action:\s*"files\.quarantine"[\s\S]*label:\s*"Review"/,
  "Attachment Review should keep visible text with the Files quarantine action ID");

const attachmentStatusMessage = functionBlock(attachmentHelper, "statusMessage");
assert.match(attachmentStatusMessage, /Uploading attachments[\s\S]*Loading attachments[\s\S]*1 attachment[\s\S]*attachments/,
  "Attachment panel counts and loading states should use attachment language");
assert.match(functionBlock(attachmentHelper, "attachmentList"), /"No attachments yet\."/,
  "Attachment panels should share the standardized empty state copy");
const attachmentStatusLabel = functionBlock(attachmentHelper, "statusLabel");
assert.match(attachmentStatusLabel, /status === "deleted"[\s\S]*"Unavailable"[\s\S]*status === "quarantined"[\s\S]*"In review"/,
  "Attachment status labels should match Files browse status language");
assert.doesNotMatch(attachmentStatusLabel, /Quarantined|Pending scan|Scan error/, "Attachment status labels should avoid quarantine and scan jargon in normal UI");
assert.match(functionBlock(attachmentHelper, "attachmentRecoveryMessage"), /recovery window[\s\S]*in review[\s\S]*review completes[\s\S]*review is complete/,
  "Attachment recovery copy should standardize deleted, in-review, and pending review messaging");

assert.match(styles, /\.file-status-cell\s*\{[\s\S]*flex-wrap:\s*wrap[\s\S]*white-space:\s*normal/, "Files status chips should wrap inside the status cell");
assert.match(styles, /\.files-status-chip,[\s\S]*\.file-attachment-meta-chip\s*\{[\s\S]*max-width:\s*100%[\s\S]*text-overflow:\s*ellipsis[\s\S]*white-space:\s*nowrap/,
  "Files and attachment chips should stay contained");
assert.match(styles, /\.files-table th:last-child,[\s\S]*\.files-table td:last-child\s*\{[\s\S]*width:\s*148px/, "Files action column should reserve room for compact icon controls");
assert.match(styles, /\.files-row-actions\s*\{[\s\S]*display:\s*flex[\s\S]*flex-wrap:\s*wrap[\s\S]*max-width:\s*100%/, "Files row actions should wrap instead of overlapping filenames");
assert.doesNotMatch(styles, /\.files-row-action-text/, "Files browse row actions should no longer reserve text-button widths");
assert.match(styles, /\.file-attachment-item\s*\{[\s\S]*flex-wrap:\s*wrap/, "Attachment items should allow action rows to move below metadata on narrow widths");
assert.match(styles, /\.file-attachment-summary\s*\{[\s\S]*flex:\s*1 1 260px[\s\S]*max-width:\s*100%/, "Attachment summaries should keep metadata contained beside actions");
assert.match(styles, /\.file-attachment-actions\s*\{[\s\S]*flex:\s*1 1 180px[\s\S]*max-width:\s*100%[\s\S]*min-width:\s*min\(100%, 180px\)/,
  "Attachment action rows should wrap without overlapping attachment content");
assert.match(styles, /@media \(max-width:\s*760px\)[\s\S]*\.files-table th:last-child,[\s\S]*width:\s*148px[\s\S]*\.files-row-actions,[\s\S]*\.file-attachment-actions[\s\S]*justify-content:\s*flex-start/,
  "Narrow-width rules should keep Files and attachment action rows readable");

assert.doesNotMatch(filesScript, /selectedFile|selected-row|createFilesDetailPanel|createFilesPreviewPanel|createFilesMetadataPanel|Inspector/,
  "Files visual work should preserve the compact browse boundary without inline detail, preview, metadata, or Inspector behavior");
assert.match(viewContract, /Implementation Notes For 0\.33\.5\.18\.12\.4/, "View-building contract should document visual/control parity");
assert.match(moduleContract, /As of 0\.33\.5\.18\.12\.4/, "Module contract should document Files visual/control parity");
assert.match(changelog, /## Version 0\.33\.5\.18\.12\.4[\s\S]*Files visual states and control parity/, "Changelog should document the Files visual parity slice");
assert.match(roadmap, /Completed 0\.33\.5\.18\.12\.1 through 0\.33\.5\.18\.12\.7 are archived/, "Roadmap should archive the completed Files visual/action/guardrail branch");
assert.match(regressionSuite, /scripts\/files-visual-state-control-parity-regression\.mjs/, "Regression suite should include the Files visual parity regression");

console.log("Files visual state and control parity regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
