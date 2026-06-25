import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.11.4";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const filesScript = readText("public/js/files.js");
const filesService = readText("src/services/files.service.js");
const styles = readText("public/css/longtail-forge.css");
const frameworkSurfaceSource = readText("src/core/view-surfaces/framework-view-surfaces.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");

[
  /uploadedAt:\s*"file\.createdAt"/,
  /uploadedByLabel:\s*"file\.uploadedByLabel"/,
  /deletedAt:\s*"file\.deletedAt"/,
].forEach((pattern) => {
  assert.match(frameworkSurfaceSource, pattern, `Files descriptor should expose safe detail field binding ${pattern}`);
});

assert.doesNotMatch(filesService, /LEFT JOIN users AS uploaded_user|uploaded_user\.username|uploaded_user\.display_name/, "Files attachment reads should avoid user-table joins so test and legacy schemas stay compatible");
assert.match(filesService, /files\.created_at AS file_created_at[\s\S]*files\.updated_at AS file_updated_at[\s\S]*files\.uploaded_by_user_id AS file_uploaded_by_user_id/, "Files attachment reads should expose safe uploaded detail metadata without rendering uploader IDs");
assert.match(filesService, /uploadedByLabelForSession\(session, attachment\.file_uploaded_by_user_id\)/, "Files attachment read model should derive safe uploader labels from the active session only when available");
assert.match(filesService, /file:[\s\S]*uploadedByLabel,[\s\S]*uploaded_by_label: uploadedByLabel/, "Files attachment read model should shape uploader display labels without exposing IDs");
assert.doesNotMatch(functionBlock(filesService, "shapeAttachment"), /uploadedByUserId|uploaded_by_user_id|storage_key|sha256Hash|storageProvider/, "Attachment read model should not expose uploader IDs, storage keys, hashes, or storage providers to the browse UI");

const resultsChrome = functionBlock(filesScript, "createFilesResultsChrome");
assert.match(resultsChrome, /summaryMount\.dataset\.fileSummaryMount = ""[\s\S]*summaryMount\.appendChild\(createFilesSummaryPanel\(\[\]\)\)/, "Files results should include a summary panel mount before the table");
assert.match(resultsChrome, /detailMount\.dataset\.fileDetailMount = ""[\s\S]*detailMount\.appendChild\(createFilesDetailPanel\(null\)\)/, "Files results should include a selected-file detail mount");
assert.match(resultsChrome, /children:\s*\[summaryMount, tableMount, detailMount\]/, "Files results should keep summary, table, and detail anatomy inside the shared list shell");

const renderFiles = functionBlock(filesScript, "renderFiles");
assert.match(renderFiles, /state\.fileRows = rows[\s\S]*reconcileSelectedFile\(rows\)[\s\S]*renderFilesSummary\(rows\)[\s\S]*renderFilesTable\(rows\)[\s\S]*renderSelectedFileDetail\(\)/, "Files render should keep summary/table/detail in sync from the shaped rows");

const fileRow = functionBlock(filesScript, "fileRow");
assert.match(fileRow, /selectionKey:\s*fileSelectionKey\(attachmentId, fileId, fileName\)/, "Files rows should keep selection keys internal to the adapter");
assert.match(fileRow, /fileStatusLabel:\s*formatToken\(status\)[\s\S]*scanStatusLabel:\s*scanStatusLabel\(scanStatus\)/, "Files rows should shape readable status and scan detail labels");
assert.match(fileRow, /uploadedAtLabel:\s*formatDate\(file\.createdAt \|\| file\.created_at\)[\s\S]*uploadedByLabel:/, "Files rows should shape uploaded metadata from the read model");
assert.match(fileRow, /availabilityHint:\s*fileAvailabilityHint\(status, scanStatus\)/, "Files rows should shape safe availability hints");
assert.doesNotMatch(fileRow, /storage_key|storageProvider|sha256Hash|quarantineReason|scanner/, "Files row shaping should not expose storage paths, hashes, quarantine reasons, or scanner internals");

const filesTable = functionBlock(filesScript, "createFilesTable");
assert.match(filesTable, /rows\.forEach\(\(row, rowIndex\) => [\s\S]*wireSelectableFileRow\(tableRow, row, rowIndex\)/, "Files table should wire selectable rows after the shared data table renders");

const selectableRow = functionBlock(filesScript, "wireSelectableFileRow");
assert.match(selectableRow, /dataset\.fileSelectableRow = ""[\s\S]*dataset\.fileRowIndex = String\(rowIndex\)/, "Selectable file rows should expose row indexes instead of raw file IDs");
assert.match(selectableRow, /aria-label", `Select \$\{row\.fileName\}`/, "Selectable file rows should have readable keyboard labels");
assert.match(selectableRow, /closest\("a, button"\)[\s\S]*selectFileRowByIndex\(rowIndex\)/, "Row selection should not intercept existing download/delete/restore controls");
assert.match(selectableRow, /event\.key === "Enter" \|\| event\.key === " "/, "Selectable file rows should support keyboard activation");
assert.doesNotMatch(selectableRow, /fileId|attachmentId|targetId|clientId|projectId/, "Selectable row DOM hooks should not expose protected IDs");

const detailPanel = functionBlock(filesScript, "createFilesDetailPanel");
assert.match(detailPanel, /className:\s*"files-detail-grid"/, "Files detail should render in a stable detail grid");
assert.match(detailPanel, /createSelectedFileHeaderPanel\(row\)[\s\S]*createFilesPreviewPanel\(row\)[\s\S]*createFilesMetadataPanel\(row\)/, "Files detail should include selected header, preview, and metadata panels");

const selectedHeader = functionBlock(filesScript, "createSelectedFileHeaderPanel");
assert.match(selectedHeader, /view\.createDetailHeader\(\{[\s\S]*title:\s*row\.fileName[\s\S]*badges:[\s\S]*Status[\s\S]*Scan[\s\S]*Type[\s\S]*Size/, "Files selected detail should use the shared detail header and badge row anatomy");
assert.match(selectedHeader, /row\.availabilityHint/, "Files selected detail should show safe availability hints");

const previewPanel = functionBlock(filesScript, "createFilesPreviewPanel");
assert.match(previewPanel, /const actions = row\.downloadable \? \[createDetailDownloadAction\(row\)\] : \[\]/, "Files preview/download availability should come from Files-owned row shaping");
assert.match(previewPanel, /title:\s*"Preview"[\s\S]*message:\s*previewMessage\(row\)[\s\S]*actions/, "Files preview shell should be a shared info panel with route-backed download action");

const metadataPanel = functionBlock(filesScript, "createFilesMetadataPanel");
[
  /label:\s*"Status"/,
  /label:\s*"Scan"/,
  /label:\s*"Module"/,
  /label:\s*"Target"/,
  /label:\s*"Client"/,
  /label:\s*"Project"/,
  /label:\s*"Size"/,
  /label:\s*"Uploaded"/,
  /label:\s*"Attached"/,
  /label:\s*"Uploader"/,
  /label:\s*"Availability"/,
].forEach((pattern) => {
  assert.match(metadataPanel, pattern, `Files metadata panel should render ${pattern} through shared detail rows`);
});
assert.doesNotMatch(metadataPanel, /fileId|attachmentId|targetId|clientId|projectId|storage|scanner|quarantineReason/, "Normal Files detail metadata should not render raw IDs, storage details, scanner internals, or quarantine reasons");

const summaryPanel = functionBlock(filesScript, "createFilesSummaryPanel");
assert.match(summaryPanel, /view\.createInfoPanel\(\{[\s\S]*title:\s*"Browse Summary"[\s\S]*items:[\s\S]*Results[\s\S]*Filters[\s\S]*Unavailable[\s\S]*Scan Review/, "Files summary should use a shared info panel for result/filter/status summary");
assert.match(summaryPanel, /view\.createDetailBadgeRow\(\{[\s\S]*Visible[\s\S]*Unavailable[\s\S]*Review/, "Files summary should add shared badge-row summary chips");

const filterSummary = functionBlock(filesScript, "currentFilterSummary");
assert.match(filterSummary, /Advanced target filters active/, "Advanced troubleshooting filters should be summarized without exposing raw IDs");
assert.doesNotMatch(filterSummary, /targetIdFilter\.value|advancedProjectFilter\.value/, "Filter summary should not render raw target/project IDs");

[
  /\.files-summary-panel,[\s\S]*\.files-selected-detail\s*\{[\s\S]*display:\s*grid/,
  /\.files-detail-grid\s*\{[\s\S]*display:\s*grid[\s\S]*gap:\s*10px/,
  /\.files-table tbody tr\[data-file-selectable-row\][\s\S]*cursor:\s*pointer/,
  /\.files-table tbody tr\[data-file-selected-row\][\s\S]*background:\s*var\(--color-surface-muted\)/,
].forEach((pattern) => {
  assert.match(styles, pattern, `Files detail/summary CSS should include ${pattern}`);
});

assert.match(regressionSuite, /scripts\/files-detail-summary-regression\.mjs/, "Regression suite should include the Files detail/summary regression");

console.log("Files detail summary regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
