import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.20.4";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const filesScript = readText("public/js/files.js");
const attachmentHelper = readText("public/js/shared/file-attachments.js");
const declarativeGuardrails = readText("scripts/view-descriptor-declarative-guardrails.mjs");
const declarativeGuide = readText("docs/declarative-view-surfaces.md");
const inventoryDoc = readText("docs/files-strict-guardrail-inventory.md");
const viewContract = readText("docs/view-building-contract.md");
const moduleContract = readText("docs/module-contract.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Files strict enforcement version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Files strict enforcement version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Files strict enforcement version");

const strictSetMatch = declarativeGuardrails.match(/const strictDeclarativeSurfaceIds = new Set\(\[([^\]]*)\]\)/);
assert.ok(strictSetMatch, "Declarative guardrails should expose the strict surface set");
assert.match(strictSetMatch[1], /files\.browse[\s\S]*lists\.workspace[\s\S]*notes\.workspace[\s\S]*tasks\.workspace/, "Current strict set should keep Files, Lists, Notes, and Tasks");
assert.match(declarativeGuardrails, /Files descriptor should be strict-converted/, "Declarative guardrails should keep Files under strict enforcement");
assert.match(declarativeGuide, /\| Files \| files \| files\.html \| files\.browse \| strict \|/, "Declarative guide should mark Files as strict");
assert.match(declarativeGuide, /Strict guardrails currently enforce[\s\S]*`files\.browse`[\s\S]*`lists\.workspace`[\s\S]*`notes\.workspace`[\s\S]*`tasks\.workspace`/, "Declarative guide should include Files in strict enforcement");

assert.match(inventoryDoc, /Current as of 0\.33\.5\.18\.12\.7/, "Files inventory should report the current slice");
assert.match(inventoryDoc, /strict enforcement is active/, "Files inventory should document active strict enforcement");
assert.match(inventoryDoc, /Framework-Owned Anatomy Strictly Guarded[\s\S]*Page host and header[\s\S]*Slide-out sidebar and filters[\s\S]*Results list and table shell[\s\S]*Dense row actions[\s\S]*File Context modal placement[\s\S]*Preview modal placement[\s\S]*Attachment panel shell[\s\S]*Upload and dropzone shell[\s\S]*Empty and status states[\s\S]*Modal and overlay stacking/, "Files inventory should map framework-owned guarded anatomy");
assert.match(inventoryDoc, /Allowed Files-Owned Escape Hatches[\s\S]*File reading and upload payloads[\s\S]*Attachment reads and host callbacks[\s\S]*Scan, review, download, and preview availability[\s\S]*Files route calls[\s\S]*Confirmations and lifecycle meaning[\s\S]*Permission-aware visibility[\s\S]*Target metadata and readable labels[\s\S]*Deleted, unavailable, and in-review recovery states[\s\S]*File Context modal opener[\s\S]*Preview modal opener/, "Files inventory should document Files-owned escape hatches");
assert.match(inventoryDoc, /Forbidden In Strict Enforcement[\s\S]*Persistent inline Browse Summary panels[\s\S]*Selected-file detail headers[\s\S]*Inline Preview panes[\s\S]*Inline Metadata panels[\s\S]*Inspector-style browse behavior/, "Files inventory should forbid inline browse detail patterns");
assert.match(inventoryDoc, /Files strict enforcement now fails if `public\/js\/files\.js` reintroduces direct DOM construction/, "Files inventory regression should fail direct Files DOM construction");
assert.match(inventoryDoc, /Closeout Coverage In 0\.33\.5\.18\.12\.7[\s\S]*compact listing-first browse[\s\S]*route-backed Preview[\s\S]*strict `files\.browse` guardrails/,
  "Files inventory should document the closeout boundary");

const resultsChrome = functionBlock(filesScript, "createFilesResultsChrome");
const filesTable = functionBlock(filesScript, "createFilesTable");
const fileStatusCell = functionBlock(filesScript, "createFileStatusCell");
const fileActions = functionBlock(filesScript, "createFileActions");
const fileEditorDialog = functionBlock(filesScript, "buildFileEditorDialog");
const fileEditorControls = functionBlock(filesScript, "createFileEditorControlsSection");
const filePreviewDialog = functionBlock(filesScript, "buildFilePreviewDialog");
const filePreviewLoader = functionBlock(filesScript, "loadFilePreview");
const previewAvailability = functionBlock(filesScript, "previewAvailabilityForRow");

assert.equal(countMatches(filesScript, /document\.createElement/g), 0, "Files browse should not create DOM nodes directly after strict enforcement");
assert.equal(countMatches(filesScript, /innerHTML/g), 1, "Files browse should only use innerHTML for route-sanitized Markdown preview content");
assert.match(functionBlock(filesScript, "renderFilePreviewMarkdown"), /content\.innerHTML = html \|\| ""/,
  "Markdown preview should keep the documented route-sanitized innerHTML escape hatch");
assert.equal(countMatches(attachmentHelper, /document\.createElement/g), 1, "Attachment helper should only keep direct DOM creation in the centralized fallback");
assert.match(functionBlock(attachmentHelper, "createAttachmentElement"), /document\.createElement\(tagName\)/,
  "Attachment helper should centralize native DOM fallback construction");

assert.match(resultsChrome, /view\.createListShell/, "Files browse results should use the shared list shell");
assert.match(filesTable, /view\.createDataTable[\s\S]*emptyMessage:\s*"No file attachments match the current filters\."/,
  "Files browse table should use the shared data table helper");
assert.match(fileStatusCell, /createFileStatusChip[\s\S]*createFileScanStatusChip[\s\S]*surface-chip-row/,
  "Files browse status/review states should use shared chip-row anatomy");
assert.match(fileActions, /view\.createDetailActionStrip\(\{[\s\S]*className: "files-row-actions"[\s\S]*actions: rowActions/,
  "Files browse row actions should stay in a shared dense action shell");
assert.match(functionBlock(filesScript, "createPreviewAction"), /view\.createActionButton[\s\S]*action:\s*"files\.preview"/,
  "Files Preview action should use shared action button anatomy");
assert.match(functionBlock(filesScript, "createReportAction"), /view\.createActionButton[\s\S]*action:\s*"files\.report"/,
  "Files Report action should use shared action button anatomy");
assert.match(functionBlock(filesScript, "createQuarantineAction"), /view\.createActionButton[\s\S]*action:\s*"files\.quarantine"/,
  "Files Review action should keep the existing quarantine action ID through shared anatomy");
assert.match(fileEditorDialog, /view\.renderDescriptorModalForm\(fileEditorModalDescriptor\(\)[\s\S]*createFileEditorMetadataSection[\s\S]*createFileEditorControlsSection/,
  "File Context should use the shared modal form while keeping Files-owned body behavior");
assert.match(functionBlock(filesScript, "fileEditorModalDescriptor"), /id:\s*"files\.file-context"/,
  "File Context descriptor should keep the Files-owned modal ID");
assert.match(fileEditorControls, /createFileContextField\("Client"[\s\S]*view\.createFieldGrid[\s\S]*createFileContextField\("Project"[\s\S]*createFileContextField\("Target"/,
  "File Context controls should use the shared field grid");
assert.match(filePreviewDialog, /files-preview-body[\s\S]*view\.createModal[\s\S]*files-preview-dialog/,
  "Preview should use the shared modal shell");
assert.match(filePreviewLoader, /\/api\/files\/attachments\/\$\{encodeURIComponent\(row\.attachmentId\)\}\/preview[\s\S]*preview\.contentUrl[\s\S]*renderFilePreviewImage[\s\S]*renderFilePreviewContent/,
  "Preview loading should remain route-backed and Files-owned");

assert.match(previewAvailability, /reviewPreviewAllowed[\s\S]*status !== "available"[\s\S]*kind === "unsupported"[\s\S]*too_large_for_preview[\s\S]*state:\s*"previewable"/,
  "Files should keep preview/download availability decisions as a documented escape hatch");
assert.match(functionBlock(filesScript, "reportFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/report[\s\S]*FILE_REPORT_REASON/,
  "Files browse Report should keep the existing Files route");
assert.match(functionBlock(filesScript, "quarantineFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/quarantine[\s\S]*FILE_QUARANTINE_REASON/,
  "Files browse Review should keep the existing quarantine route");
assert.match(functionBlock(filesScript, "deleteFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/delete/,
  "Files browse Delete should keep the existing Files route");
assert.match(functionBlock(filesScript, "restoreFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/restore/,
  "Files browse Restore should keep the existing Files route");
assert.match(functionBlock(filesScript, "workspaceHasPermission"), /files\.manage_quarantine/,
  "Files browse permission-shaped visibility should stay Files-owned");
assert.match(functionBlock(filesScript, "hydrateFileEditorContextControls"), /business[\s\S]*clientSelect[\s\S]*hydrateFileEditorProjectControl/i,
  "File Context should keep Business-only Client and Project selector behavior Files-owned");
assert.match(functionBlock(filesScript, "loadFileEditorTargetOptions"), /\/api\/files\/attachable-targets\?[\s\S]*hydrateFileEditorOptionControls/,
  "File Context should keep target metadata loading Files-owned");

const attachmentPanelShell = functionBlock(attachmentHelper, "createAttachmentPanelShell");
const uploadShell = functionBlock(attachmentHelper, "createUploadShell");
const attachmentList = functionBlock(attachmentHelper, "attachmentList");
const attachmentItem = functionBlock(attachmentHelper, "attachmentItem");
const attachmentActions = functionBlock(attachmentHelper, "createAttachmentActions");
const uploadFiles = functionBlock(attachmentHelper, "uploadFiles");

assert.match(attachmentPanelShell, /view\?\.createListShell[\s\S]*file-attachments-panel-shell/,
  "Attachment panel shell should use the shared list shell when available");
assert.match(uploadShell, /view\?\.createListShell[\s\S]*file-attachment-upload-shell/,
  "Upload shell should use the shared list shell when available");
assert.match(attachmentList, /createAttachmentEmptyState[\s\S]*createAttachmentListShell/,
  "Attachment list states should use shared empty/list shell helpers");
assert.match(attachmentItem, /attachmentRecoveryMessage[\s\S]*file-attachment-meta surface-chip-row[\s\S]*createAttachmentRecoveryState/,
  "Attachment metadata and recovery states should remain visible in shared chip/list anatomy");
assert.match(attachmentActions, /files\.removeAttachment[\s\S]*files\.report[\s\S]*files\.quarantine[\s\S]*files\.delete[\s\S]*files\.restore[\s\S]*view\?\.createDetailActionStrip[\s\S]*className: "file-attachment-actions"/,
  "Attachment actions should stay in a shared dense action shell with Files action IDs");
assert.match(functionBlock(attachmentHelper, "createAttachmentEmptyState"), /view\?\.createEmptyState/,
  "Attachment empty states should use the shared empty-state helper when available");
assert.match(uploadFiles, /readFileBase64\(file\)[\s\S]*\/api\/files\/batch[\s\S]*visibility:\s*options\.visibility/,
  "Attachment upload behavior should keep Files-owned file reads, payloads, route calls, and visibility");
assert.match(functionBlock(attachmentHelper, "readFileBase64"), /new FileReader\(\)[\s\S]*readAsDataURL\(file\)/,
  "FileReader conversion should remain a documented Files-owned escape hatch");
assert.match(functionBlock(attachmentHelper, "acceptedExtensions"), /archive[\s\S]*document[\s\S]*image[\s\S]*pdf[\s\S]*presentation[\s\S]*text/,
  "Accepted file categories should remain Files-owned");
assert.match(functionBlock(attachmentHelper, "refresh"), /\/api\/files\/attachments\?/,
  "Attachment refresh should keep using the Files attachment route");
assert.match(functionBlock(attachmentHelper, "reportFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/report/,
  "Attachment Report should keep the existing Files route");
assert.match(functionBlock(attachmentHelper, "quarantineFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/quarantine/,
  "Attachment Review should keep the existing quarantine route");
assert.match(functionBlock(attachmentHelper, "deleteFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/delete/,
  "Attachment Delete should keep the existing Files route");
assert.match(functionBlock(attachmentHelper, "restoreFile"), /\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\/restore/,
  "Attachment Restore should keep the existing Files route");
assert.match(functionBlock(attachmentHelper, "emit"), /CustomEvent\(`longtailforge:file-attachments:/,
  "Attachment helper should keep host callbacks/events as a documented escape hatch");
assert.match(functionBlock(attachmentHelper, "attachmentRecoveryMessage"), /recovery window[\s\S]*in review[\s\S]*review completes/,
  "Attachment recovery states should stay Files-owned");

assert.doesNotMatch(filesScript, /createFilesSummaryPanel|createFilesDetailPanel|createFilesPreviewPanel|createFilesMetadataPanel|selectedFile|data-file-selected-row|Inspector/,
  "Files browse should not reintroduce inline summary, detail, preview, metadata, selected-row, or Inspector behavior");
assert.doesNotMatch(filesScript, /storageKey|storagePath|signedUrl|fileHash|scannerInternal|filesystemPath/,
  "Files browser UI should not expose storage keys, protected paths, signed URLs, hashes, or scanner internals");

assert.match(viewContract, /Implementation Notes For 0\.33\.5\.18\.12\.6[\s\S]*Files strict declarative guardrail enforcement/,
  "View-building contract should document the Files strict enforcement slice");
assert.match(moduleContract, /As of 0\.33\.5\.18\.12\.6[\s\S]*Files strict declarative guardrail enforcement/,
  "Module contract should document the Files strict enforcement boundary");
assert.match(regressionSuite, /scripts\/files-strict-guardrail-inventory-regression\.mjs/,
  "Regression suite should include the Files strict guardrail enforcement regression");

console.log(`Files strict declarative guardrail enforcement passed. Direct DOM construction: files.js=${countMatches(filesScript, /document\.createElement/g)}, file-attachments.js=${countMatches(attachmentHelper, /document\.createElement/g)} centralized fallback.`);

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n\s*(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
