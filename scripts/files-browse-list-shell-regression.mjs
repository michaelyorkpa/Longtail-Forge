import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.21.7.7";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const filesHtml = readText("views/protected/files.html");
const filesScript = readText("public/js/files.js");
const styles = readText("public/css/longtail-forge.css");
const icons = readText("public/js/shared/icons.js");
const frameworkSurfaceSource = readText("src/core/view-surfaces/framework-view-surfaces.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");

assert.match(filesHtml, /css\/longtail-forge\.css\?v=13/, "Files host should cache-bust the compact reset stylesheet");
assert.match(filesHtml, /js\/shared\/icons\.js\?v=6[\s\S]*js\/shared\/view-renderer\.js\?v=13[\s\S]*js\/files\.js\?v=13/, "Files host should load the cache-busted icon helper and Files adapter after the renderer");

assert.match(frameworkSurfaceSource, /route:\s*"\/api\/files\/attachments"/, "Files descriptor should keep the service-owned attachments read route");
[
  /displayName:\s*"file\.displayName"/,
  /filename:\s*"file\.originalFilename"/,
  /extension:\s*"file\.extension"/,
  /mimeType:\s*"file\.mimeTypeDetected"/,
  /fileSizeBytes:\s*"file\.fileSizeBytes"/,
  /targetLabel:\s*"targetLabel"/,
  /clientLabel:\s*"clientLabel"/,
  /projectLabel:\s*"projectLabel"/,
].forEach((pattern) => {
  assert.match(frameworkSurfaceSource, pattern, `Files descriptor should expose ${pattern} through fieldBindings`);
});

const resultsChrome = functionBlock(filesScript, "createFilesResultsChrome");
assert.match(resultsChrome, /requireFilesViewHelper\("createListShell"\)/, "Files results should require the shared list shell helper");
assert.match(resultsChrome, /view\.createListShell\(\{[\s\S]*className:\s*"files-browse-list-shell"[\s\S]*statusAttrs:\s*\{\s*"data-file-status":\s*""\s*\}[\s\S]*children:\s*\[[\s\S]*tableMount,[\s\S]*createFilesPaginationChrome\(\)[\s\S]*\]/, "Files results should mount the compact status, table, and bounded pagination through the shared list shell");
assert.match(resultsChrome, /dataset:\s*\{\s*fileTableMount:\s*""\s*\}/, "Files results should expose a stable table remount target");
assert.doesNotMatch(resultsChrome, /summaryMount|detailMount|createFilesSummaryPanel|createFilesDetailPanel/, "Files results should not mount inline summary or detail panels");

const filesTable = functionBlock(filesScript, "createFilesTable");
assert.match(filesTable, /requireFilesViewHelper\("createDataTable"\)/, "Files browse table should require the shared data table helper");
assert.match(filesTable, /view\.createDataTable\(\{[\s\S]*className:\s*"files-table-wrap"[\s\S]*tableClassName:\s*"files-table"[\s\S]*columns:\s*filesTableColumns\(\)[\s\S]*emptyMessage:\s*"No file attachments match the current filters\."/,
  "Files browse table should render through the shared data table helper with the existing empty state");
assert.match(filesTable, /tbody\.dataset\.fileList = ""/, "Files browse table should keep a stable file-list hook after remounting");
assert.doesNotMatch(filesTable, /wireSelectableFileRow|fileSelectableRow|fileSelectedRow/, "Files browse table should not wire selected-row behavior");

const renderFiles = functionBlock(filesScript, "renderFiles");
assert.match(renderFiles, /attachments\.map\(\(attachment\) => fileRow\(attachment\)\)/, "Files should shape API attachments before rendering rows");
assert.match(renderFiles, /renderFilesTable\(rows\)/, "Files render should delegate table rendering to the helper-owned table remount path");
assert.doesNotMatch(renderFiles, /state\.fileRows|reconcileSelectedFile|renderFilesSummary|renderSelectedFileDetail/, "Files render should stay compact without selected-row detail sync");
const renderFilesTable = functionBlock(filesScript, "renderFilesTable");
assert.match(renderFilesTable, /fileTableMount\.replaceChildren\(createFilesTable\(rows\)\)/, "Files should remount the helper-owned table instead of manually rebuilding table rows");

const fileRow = functionBlock(filesScript, "fileRow");
assert.match(fileRow, /const fileSizeBytes = Number\(file\.fileSizeBytes \|\| file\.file_size_bytes \|\| 0\)[\s\S]*fileSizeBytes,[\s\S]*fileSizeLabel:\s*formatBytes\(fileSizeBytes\)/, "Files row shaping should keep file size display data owned by Files");
assert.match(fileRow, /moduleLabel:\s*formatToken\(attachment\.moduleId \|\| attachment\.module_id \|\| ""\)/, "Files should shape the readable module label");
assert.match(fileRow, /targetLabel:\s*formatTargetDisplay\(targetType, targetLabel\)/, "Files should shape readable target labels");
assert.match(fileRow, /clientLabel,[\s\S]*projectLabel,[\s\S]*statusLabel:[\s\S]*attachedAtLabel:/, "Files should shape client/project/status/timestamp display data");
assert.match(fileRow, /downloadable:[\s\S]*deletable:[\s\S]*restorable:/, "Files should keep action availability in the Files adapter");
assert.match(fileRow, /targetId:[\s\S]*clientId:[\s\S]*projectId:/, "Files may keep raw context IDs internally for the modal shell");
assert.doesNotMatch(fileRow, /selectionKey/, "Normal Files browse rows should not expose selection keys");
assert.doesNotMatch(fileRow, /targetLabel:\s*[^,\n]*(targetId|target_id)|clientLabel:\s*[^,\n]*(clientId|client_id)|projectLabel:\s*[^,\n]*(projectId|project_id)/, "Normal Files browse visible labels should not fall back to raw target/client/project IDs");

assert.doesNotMatch(filesScript, /\b(querySql|runSql|storage_key|file_attachments|search_index|tagsService|tagLinks)\b/, "Files browser adapter should not query storage, search, tags, or attachment tables directly");
assert.match(filesScript, /api\.getJson\(`\/api\/files\/attachments\?\$\{params\.toString\(\)\}`/, "Files browse should continue loading through the service-owned attachments route");

const fileCell = functionBlock(filesScript, "createFileCell");
assert.match(fileCell, /createFilesElement\("span"[\s\S]*className: "files-file-cell"/, "File cell should use the compact file-cell anatomy");
assert.match(fileCell, /children:\s*\[[\s\S]*createFileTypeIcon\(row\)[\s\S]*createTruncatedText\(row\.fileName, "files-file-name"\)/, "File cell should render the file-type icon before the truncated filename");

const fileTypeIcon = functionBlock(filesScript, "createFileTypeIcon");
assert.match(fileTypeIcon, /className: "files-file-type-label"[\s\S]*text: fileTypeBadgeText\(row\.extension, row\.fileTypeLabel\)/, "File type indicator should render safe file-type text inside the icon");
assert.match(fileTypeIcon, /dataset:\s*\{\s*fileType: safeFileTypeToken/, "File type indicator should expose only a safe file-type token");
assert.doesNotMatch(fileTypeIcon, /\.title\s*=/, "File type indicator should not use native title tooltips");

const fileTypeBadgeText = functionBlock(filesScript, "fileTypeBadgeText");
assert.match(fileTypeBadgeText, /replace\(\S*\/\^\\\.\//, "File type badge text should derive from a sanitized extension");
assert.match(fileTypeBadgeText, /slice\(0, 4\)\.toUpperCase\(\)/, "File type badge text should fit inside the small icon");

const truncatedText = functionBlock(filesScript, "createTruncatedText");
assert.match(truncatedText, /className: \["files-truncate", className\]\.filter\(Boolean\)\.join\(" "\)/, "Truncated text should use the shared Files truncation class");
assert.doesNotMatch(truncatedText, /span\.title = text/, "Truncated text should not create a duplicate native title tooltip");
assert.match(truncatedText, /span\.dataset\.fullText = text[\s\S]*span\.tabIndex = 0[\s\S]*span\.setAttribute\("aria-label", text\)/, "Truncated text should keep full safe value data and accessible labels");
assert.match(truncatedText, /pointerenter[\s\S]*showFilesTooltip\(span, text\)[\s\S]*pointerleave[\s\S]*hideFilesTooltip[\s\S]*focus[\s\S]*showFilesTooltip\(span, text\)[\s\S]*blur[\s\S]*hideFilesTooltip/, "Truncated text should reveal through the custom floating tooltip on hover and focus");

const showFilesTooltip = functionBlock(filesScript, "showFilesTooltip");
assert.match(showFilesTooltip, /document\.body\.appendChild\(activeFilesTooltip\)/, "Files tooltip should be appended to the body so it can float above table overflow");
assert.match(showFilesTooltip, /target\.setAttribute\("aria-describedby", activeFilesTooltip\.id\)/, "Files tooltip should wire focus users through aria-describedby");

const positionFilesTooltip = functionBlock(filesScript, "positionFilesTooltip");
assert.match(positionFilesTooltip, /getBoundingClientRect\(\)[\s\S]*window\.innerWidth[\s\S]*window\.innerHeight/, "Files tooltip should position against the viewport");

const actions = functionBlock(filesScript, "createFileActions");
assert.match(actions, /view\.createDetailActionStrip\(\{[\s\S]*className: "files-row-actions"[\s\S]*actions: rowActions/, "File row actions should use the shared dense action strip");
assert.match(actions, /createDownloadAction\(row\)[\s\S]*createDeleteAction\(row\)[\s\S]*createRestoreAction\(row\)/, "Files should keep existing download/delete/restore action availability");

const downloadAction = functionBlock(filesScript, "createDownloadAction");
assert.match(downloadAction, /className: "button-link action-button view-action-button icon-button files-row-action"/, "Download should be an icon-only bordered action control");
assert.match(downloadAction, /"aria-label": label[\s\S]*download: true[\s\S]*title: label/, "Download should keep accessible label/title and browser download semantics");
assert.match(downloadAction, /createIcon\?\.\("download", \{ decorative: true \}\)/, "Download should use the shared download icon");

const deleteAction = functionBlock(filesScript, "createDeleteAction");
assert.match(deleteAction, /view\.createActionButton\(\{[\s\S]*icon:\s*"delete"[\s\S]*iconOnly:\s*true[\s\S]*label:\s*`Delete \$\{row\.fileName\}`[\s\S]*text:\s*""[\s\S]*title:\s*`Delete \$\{row\.fileName\}`[\s\S]*variant:\s*"danger"/, "Delete should be an icon-only shared action button with accessible label/title");
assert.match(deleteAction, /onClick:\s*\(event\) => \{[\s\S]*stopFileRowActionEvent\(event\)[\s\S]*deleteFile\(row\.fileId, row\.file\)/, "Delete should preserve the Files-owned delete workflow while isolating row activation");

assert.match(icons, /download:\s*Object\.freeze/, "Shared icon registry should include the download icon for Files rows");
assert.match(styles, /\.view-slideout-sidebar-main > \.files-browse-results-region\s*\{[\s\S]*border:\s*0;[\s\S]*padding:\s*0;[\s\S]*background:\s*transparent/, "Files browse results should not add a second frame around the listing");
assert.match(styles, /\.files-table-wrap\s*\{[\s\S]*overflow-x:\s*auto;[\s\S]*border:\s*1px solid var\(--color-border\)[\s\S]*border-radius:\s*8px/, "Files table wrapper should own the single listing frame");
assert.match(styles, /\.files-table\s*\{[\s\S]*table-layout:\s*fixed[\s\S]*min-width:\s*0;[\s\S]*font-size:\s*14px/, "Files table should stay compact without forcing horizontal overflow");
assert.doesNotMatch(styles, /\.files-table\s*\{[\s\S]*min-width:\s*960px/, "Files table should not force a horizontal scrollbar at normal desktop widths");
assert.match(styles, /\.files-table th:last-child,[\s\S]*\.files-table td:last-child\s*\{[\s\S]*width:\s*148px;[\s\S]*padding-right:\s*6px;[\s\S]*padding-left:\s*6px;[\s\S]*text-align:\s*right/, "Files action column should reserve enough room for compact icon row actions");
assert.match(styles, /\.files-file-cell\s*\{[\s\S]*display:\s*flex[\s\S]*min-width:\s*0/, "Files filename cell should stay compact");
assert.match(styles, /\.files-file-type-icon\s*\{[\s\S]*display:\s*inline-flex[\s\S]*width:\s*34px/, "Files file-type icon should have a stable footprint for extension text");
assert.match(styles, /\.files-file-type-label\s*\{[\s\S]*font-size:\s*9px[\s\S]*text-transform:\s*uppercase/, "Files file-type icon should visibly show the safe file type text");
assert.match(styles, /\.files-truncate\s*\{[\s\S]*overflow:\s*hidden[\s\S]*text-overflow:\s*ellipsis[\s\S]*white-space:\s*nowrap/, "Files labels should truncate in table cells");
assert.doesNotMatch(styles, /\.files-truncate\[data-full-text\]:hover[\s\S]*overflow:\s*visible/, "Files labels should not expand inside the table on hover");
assert.match(styles, /\.files-floating-tooltip\s*\{[\s\S]*position:\s*fixed[\s\S]*z-index:\s*10000[\s\S]*pointer-events:\s*none/, "Files truncated labels should reveal through one fixed floating tooltip above overflow containers");
assert.match(styles, /\.files-row-actions\s*\{[\s\S]*display:\s*flex[\s\S]*flex-wrap:\s*wrap[\s\S]*justify-content:\s*flex-end/, "Files actions should stay compact, wrapped, and right-aligned");

assert.match(regressionSuite, /scripts\/files-browse-list-shell-regression\.mjs/, "Regression suite should include the Files browse list shell regression");

console.log("Files browse list shell regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
