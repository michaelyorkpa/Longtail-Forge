import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.19.8";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const filesHtml = readText("views/protected/files.html");
const filesScript = readText("public/js/files.js");
const filesService = readText("src/services/files.service.js");
const styles = readText("public/css/longtail-forge.css");
const frameworkSurfaceSource = readText("src/core/view-surfaces/framework-view-surfaces.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");

assert.match(filesHtml, /css\/longtail-forge\.css\?v=13/, "Files host should cache-bust the stylesheet for the compact reset");
assert.match(filesHtml, /js\/shared\/view-renderer\.js\?v=13[\s\S]*js\/files\.js\?v=13/, "Files host should load the compact-reset adapter after the renderer");

assert.match(frameworkSurfaceSource, /route:\s*"\/api\/files\/attachments"/, "Files descriptor should keep the service-owned attachments read route");
[
  /uploadedAt:\s*"file\.createdAt"/,
  /uploadedByLabel:\s*"file\.uploadedByLabel"/,
  /deletedAt:\s*"file\.deletedAt"/,
].forEach((pattern) => {
  assert.match(frameworkSurfaceSource, pattern, `Files descriptor may keep safe detail field binding ${pattern}`);
});

assert.match(filesService, /files\.created_at AS file_created_at[\s\S]*files\.updated_at AS file_updated_at[\s\S]*files\.uploaded_by_user_id AS file_uploaded_by_user_id/, "Files attachment reads should keep safe uploaded detail metadata available for later route-backed modals");
assert.match(filesService, /uploadedByLabelForSession\(session, attachment\.file_uploaded_by_user_id\)/, "Files attachment reads should keep safe uploader labels on the read model");
assert.doesNotMatch(functionBlock(filesService, "shapeAttachment"), /uploadedByUserId|uploaded_by_user_id|storage_key|sha256Hash|storageProvider/, "Attachment read model should not expose uploader IDs, storage keys, hashes, or storage providers to the browse UI");

const resultsChrome = functionBlock(filesScript, "createFilesResultsChrome");
assert.match(resultsChrome, /requireFilesViewHelper\("createListShell"\)/, "Files results should still use the shared list shell");
assert.match(resultsChrome, /dataset:\s*\{\s*fileTableMount:\s*""\s*\}[\s\S]*children:\s*\[createFilesTable\(\[\]\)\]/, "Files results should expose one table remount target");
assert.match(resultsChrome, /statusAttrs:\s*\{\s*"data-file-status":\s*""\s*\}/, "Files results should keep the small status/live region");
assert.match(resultsChrome, /children:\s*tableMount/, "Files results should mount only the compact table body inside the list shell");
assert.doesNotMatch(resultsChrome, /summaryMount|detailMount|createFilesSummaryPanel|createFilesDetailPanel/, "Files results should not mount inline summary or detail panels");

const renderFiles = functionBlock(filesScript, "renderFiles");
assert.match(renderFiles, /attachments\.map\(\(attachment\) => fileRow\(attachment\)\)[\s\S]*renderFilesTable\(rows\)/, "Files render should shape API attachments and render the compact table");
assert.doesNotMatch(renderFiles, /state\.fileRows|reconcileSelectedFile|renderFilesSummary|renderSelectedFileDetail/, "Files render should not keep selected-row state or inline detail panels in sync");

const loadFiles = functionBlock(filesScript, "loadFiles");
assert.match(loadFiles, /const attachments = result\.attachments \|\| \[\][\s\S]*renderFiles\(attachments\)[\s\S]*setStatus\(visibleFileCountLabel\(attachments\.length\)\)/, "Files successful browse loads should keep a small visible-count status message above the table");

const visibleFileCountLabel = functionBlock(filesScript, "visibleFileCountLabel");
assert.match(visibleFileCountLabel, /return `\$\{safeCount\} file attachment\$\{safeCount === 1 \? "" : "s"\} visible`/, "Files visible-count status should stay compact and attachment-scoped");

const filesTable = functionBlock(filesScript, "createFilesTable");
assert.match(filesTable, /view\.createDataTable\(\{[\s\S]*className:\s*"files-table-wrap"[\s\S]*tableClassName:\s*"files-table"[\s\S]*emptyMessage:\s*"No file attachments match the current filters\."/,
  "Files browse table should render through the shared data table helper with the existing empty state");
assert.match(filesTable, /tbody\.dataset\.fileList = ""/, "Files browse table should keep a stable file-list hook after remounting");
assert.doesNotMatch(filesTable, /rows\.forEach|wireSelectableFileRow|fileSelectableRow|fileSelectedRow/, "Files table should not wire selected-row behavior");

const fileRow = functionBlock(filesScript, "fileRow");
assert.match(fileRow, /moduleLabel:\s*formatToken\(attachment\.moduleId \|\| attachment\.module_id \|\| ""\)/, "Files should shape the readable module label");
assert.match(fileRow, /targetLabel:\s*formatTargetDisplay\(targetType, targetLabel\)/, "Files should shape readable target labels");
assert.match(fileRow, /clientLabel,[\s\S]*projectLabel,[\s\S]*statusLabel:[\s\S]*attachedAtLabel:/, "Files should shape client/project/status/timestamp display data");
assert.match(fileRow, /downloadable:[\s\S]*deletable:[\s\S]*restorable:/, "Files should keep action availability in the Files adapter");
assert.match(fileRow, /targetId:[\s\S]*clientId:[\s\S]*projectId:/, "Files may keep raw context IDs internally for the modal shell");
assert.doesNotMatch(fileRow, /selectionKey/, "Compact Files browse rows should not expose selection keys");
assert.doesNotMatch(fileRow, /targetLabel:\s*[^,\n]*(targetId|target_id)|clientLabel:\s*[^,\n]*(clientId|client_id)|projectLabel:\s*[^,\n]*(projectId|project_id)/, "Compact Files browse visible labels should not fall back to raw context IDs");

[
  "createFilesSummaryPanel",
  "createFilesDetailPanel",
  "createSelectedFileHeaderPanel",
  "createFilesPreviewPanel",
  "createFilesMetadataPanel",
  "createDetailDownloadAction",
  "reconcileSelectedFile",
  "selectedFileRow",
  "selectFileRowByIndex",
  "updateFilesTableSelection",
  "wireSelectableFileRow",
  "fileSelectionKey",
].forEach((functionName) => {
  assert.equal(filesScript.indexOf(`function ${functionName}`), -1, `${functionName} should be removed from compact Files browse`);
});

[
  /Browse Summary/,
  /File Details/,
  /Selected file/,
  /title:\s*"Preview"/,
  /title:\s*"Metadata"/,
  /data-file-summary-mount/,
  /data-file-detail-mount/,
  /data-file-detail-grid/,
  /data-file-selectable-row/,
  /data-file-selected-row/,
].forEach((pattern) => {
  assert.doesNotMatch(filesScript, pattern, `Files browse script should not contain inline detail/dashboard marker ${pattern}`);
});

assert.match(styles, /\.view-slideout-sidebar-main > \.files-browse-results-region\s*\{[\s\S]*border:\s*0;[\s\S]*padding:\s*0;[\s\S]*background:\s*transparent/, "Files browse results should not add an extra framed panel around the listing");
assert.match(styles, /\.files-table-wrap\s*\{[\s\S]*overflow-x:\s*auto;[\s\S]*border:\s*1px solid var\(--color-border\)[\s\S]*border-radius:\s*8px/, "Files table wrapper should own the single listing frame");
assert.match(styles, /\.files-table\s*\{[\s\S]*table-layout:\s*fixed[\s\S]*min-width:\s*0;[\s\S]*font-size:\s*14px/, "Files table should stay compact without forcing horizontal overflow");
assert.doesNotMatch(styles, /\.files-table\s*\{[\s\S]*min-width:\s*960px/, "Files table should not force a horizontal scrollbar at normal desktop widths");
assert.match(styles, /\.files-truncate\s*\{[\s\S]*overflow:\s*hidden[\s\S]*text-overflow:\s*ellipsis[\s\S]*white-space:\s*nowrap/, "Files labels should keep clipped ellipsis behavior");
assert.match(styles, /\.files-floating-tooltip\s*\{[\s\S]*position:\s*fixed[\s\S]*z-index:\s*10000[\s\S]*pointer-events:\s*none/, "Truncated labels should reveal through the body-level floating tooltip");
[
  /\.files-summary-panel/,
  /\.files-detail-grid/,
  /\.files-detail-empty/,
  /\.files-preview-panel/,
  /\.files-metadata-panel/,
  /\.files-selected-detail/,
  /\[data-file-selectable-row\]/,
  /\[data-file-selected-row\]/,
  /\.files-availability-hint/,
].forEach((pattern) => {
  assert.doesNotMatch(styles, pattern, `Files compact CSS should not include inline detail/dashboard selector ${pattern}`);
});

assert.match(regressionSuite, /scripts\/files-browse-compact-reset-regression\.mjs/, "Regression suite should include the Files compact reset regression");
assert.doesNotMatch(regressionSuite, /scripts\/files-detail-summary-regression\.mjs/, "Regression suite should not keep the replaced detail summary regression");

console.log("Files browse compact reset regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
