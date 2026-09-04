import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProjectTextReader, extractFunctionBlock } from "../../test-support/source-scan.mjs";
const { readText: read } = createProjectTextReader();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @param {string} source @param {string} name */
const filesPage = read("views/protected/files.html");
const filesScript = read("public/js/files.js");
const filePreviewScript = read("public/js/shared/file-preview.js");
const filesStyles = read("public/css/longtail-forge.css");
const icons = read("public/js/shared/icons.js");

assert.match(filesPage, /css\/longtail-forge\.css/, "Files page should reference preview modal styling");
assert.match(filesPage, /js\/shared\/file-preview\.js[\s\S]*js\/files\.js/, "Files page should load shared preview before Files browser wiring");
assert.match(icons, /eye:\s*Object\.freeze/, "Shared icon registry should include the Preview eye icon");

const fileRow = extractFunctionBlock(filesScript, "fileRow");
const actions = extractFunctionBlock(filesScript, "createFileActions");
const previewAction = extractFunctionBlock(filesScript, "createPreviewAction");
const downloadOnlyMarker = extractFunctionBlock(filesScript, "createDownloadOnlyMarker");
const rowOpen = extractFunctionBlock(filesScript, "wireFileTableRow");
const actionIsolation = extractFunctionBlock(filesScript, "isFileRowActionEvent");
const openPreview = extractFunctionBlock(filePreviewScript, "openFilePreview");
const buildPreview = extractFunctionBlock(filePreviewScript, "buildFilePreviewDialog");
const loadPreview = extractFunctionBlock(filePreviewScript, "loadFilePreview");
const renderContent = extractFunctionBlock(filePreviewScript, "renderFilePreviewContent");
const renderImage = extractFunctionBlock(filePreviewScript, "renderFilePreviewImage");
const renderText = extractFunctionBlock(filePreviewScript, "renderFilePreviewText");
const renderMarkdown = extractFunctionBlock(filePreviewScript, "renderFilePreviewMarkdown");
const downloadAction = extractFunctionBlock(filePreviewScript, "createPreviewDownloadAction");
const previewAvailability = extractFunctionBlock(filePreviewScript, "previewAvailabilityForRow");
const previewKind = extractFunctionBlock(filePreviewScript, "previewKindForExtension");
const previewStateMessage = extractFunctionBlock(filePreviewScript, "previewStateMessage");

assert.match(fileRow, /const canManageReview = canManageFileReview\(attachment, file, fileId\)[\s\S]*const preview = filePreview\.previewAvailabilityForRow\(\{[\s\S]*canPreviewInReview: canManageReview[\s\S]*extension[\s\S]*fileSizeBytes[\s\S]*scanStatus[\s\S]*status/, "Files rows should derive local preview affordance state");
assert.match(fileRow, /previewKind:\s*preview\.kind[\s\S]*previewable:\s*preview\.state === "previewable"[\s\S]*previewState:\s*preview\.state/, "Files rows should expose preview kind/state for action rendering");
assert.match(previewAvailability, /reviewPreviewAllowed[\s\S]*status !== "available"[\s\S]*scanStatus[\s\S]*"unsupported"[\s\S]*TEXT_PREVIEW_MAX_BYTES[\s\S]*state:\s*"previewable"/, "Preview affordance should mirror status, scan, supported type, review permission, and size-cap gates");
assert.match(previewKind, /IMAGE_PREVIEW_EXTENSIONS[\s\S]*MARKDOWN_PREVIEW_EXTENSIONS[\s\S]*TEXT_PREVIEW_EXTENSIONS[\s\S]*return "unsupported"/, "Preview kind should cover image, Markdown, text, and unsupported rows");

assert.match(actions, /if \(row\.previewable\)[\s\S]*createPreviewAction\(row\)[\s\S]*else if \(row\.downloadable\)[\s\S]*createDownloadOnlyMarker\(row\)[\s\S]*createDownloadAction\(row\)/, "Files rows should show Preview for previewable rows and a quiet download-only marker for non-previewable downloadable rows");
assert.match(previewAction, /icon:\s*"eye"[\s\S]*iconOnly:\s*true[\s\S]*label:\s*`Preview \$\{row\.fileName\}`[\s\S]*title:\s*`Preview \$\{row\.fileName\}`/, "Preview should use an icon-only eye action with accessible label/title");
assert.match(previewAction, /stopFileRowActionEvent\(event\)[\s\S]*filePreview\.openFilePreview\(row,\s*\{\s*trigger:\s*event\.currentTarget\s*\}\)/, "Preview button should open Preview without triggering row edit");
assert.doesNotMatch(previewAction, /openFileEditor/, "Preview button must not open the File Context editor");
assert.match(previewAction, /button\.dataset\.fileAction = "preview"/, "Preview button should participate in row action isolation");
assert.match(downloadOnlyMarker, /files-row-preview-unavailable[\s\S]*"aria-label": label[\s\S]*role: "img"[\s\S]*fileAction: "preview-unavailable"/, "Download-only marker should be visible, accessible, and isolated from row-open");

assert.match(rowOpen, /openFileEditor\(row,\s*\{\s*trigger:\s*rowElement\s*\}\)/, "Row click/Enter should still open File Context");
assert.doesNotMatch(rowOpen, /openFilePreview/, "Row click/Enter should not open Preview");
assert.match(actionIsolation, /\[data-file-action\], a, button, input, select, textarea/, "Row-open isolation should include Preview and download-only row controls");

assert.match(openPreview, /requireFilePreviewViewHelper\("createModal"\)[\s\S]*requireFilePreviewViewHelper\("showModal"\)/, "Preview should use the shared modal stack helpers");
assert.match(openPreview, /activeFilePreviewDialog[\s\S]*view\.closeModal\(activeFilePreviewDialog, "replace"\)[\s\S]*view\.showModal\(dialog, \{ parent: options\.parent \|\| null, trigger \}\)[\s\S]*loadFilePreview\(dialog, row\)/, "Preview should replace an existing preview modal, return focus through the trigger, and load route-backed content");
assert.match(buildPreview, /view\.createModal\(\{[\s\S]*title:\s*`Preview \$\{row\.fileName\}`[\s\S]*className:\s*"files-preview-dialog"[\s\S]*size:\s*"wide"[\s\S]*actions:\s*\[downloadAction,\s*closeButton\]\.filter\(Boolean\)/, "Preview modal should use the shared wide modal with Download and Close actions");
assert.match(buildPreview, /dialog\.dataset\.filePreviewDialog = ""[\s\S]*dialog\.dataset\.fileAttachmentId = row\.attachmentId \|\| ""/, "Preview modal should expose stable markers for tests and focus/debugging");

assert.match(loadPreview, /api\.getJson\(`\/api\/files\/attachments\/\$\{encodeURIComponent\(row\.attachmentId\)\}\/preview`/, "Preview modal should read the attachment-scoped preview descriptor route");
// Retargeted under `0.33.33.38.4.9.5`: the separate content-URL test is gone because the
// descriptor reader now refuses a previewable descriptor that does not carry this
// attachment's own preview content route, so the state alone decides the branch.
assert.match(loadPreview, /const preview = readFilePreviewDescriptor\(/, "Preview modal should read the descriptor through its contract reader");
assert.match(loadPreview, /if \(!preview\) \{[\s\S]*The file preview descriptor could not be read/, "An unreadable descriptor should fail rather than read as an unavailable file");
assert.match(loadPreview, /if \(preview\.state !== "previewable"\) \{[\s\S]*renderFilePreviewState\(dialog, preview\)/, "Preview modal should handle download-only/unavailable descriptor states");
assert.match(loadPreview, /preview\.kind === "image"[\s\S]*renderFilePreviewImage\(dialog, preview\)/, "Image previews should render from the authenticated content URL");
assert.match(loadPreview, /readFilePreviewContent\(await api\.getJson\(preview\.contentUrl[\s\S]*renderFilePreviewContent\(dialog, preview, contentBody\.content\)/, "Text and Markdown previews should load content through the route-backed content URL");
assert.match(loadPreview, /if \(!contentBody\) \{[\s\S]*The file preview content could not be read/, "Unreadable content should fail rather than render as empty text or empty Markdown");
assert.match(renderContent, /content\.kind === "text"[\s\S]*content\.kind === "markdown"/, "Preview content should branch only on server-provided safe content kinds");
assert.match(renderImage, /createFilePreviewElement\("img"[\s\S]*src: preview\.contentUrl[\s\S]*image\.addEventListener\("load"[\s\S]*image\.addEventListener\("error"/, "Image previews should use the authenticated content route and handle load/error states");
assert.match(renderText, /createFilePreviewElement\("code", \{ text: text \|\| "" \}\)/, "Text previews should render as textContent, not HTML");
assert.match(renderMarkdown, /content\.innerHTML = html;/, "Markdown previews should render the server-sanitized HTML payload");
// Widened under `0.33.33.38.4.9.5`: the previous spelling missed `window.markdownit`, the
// global markdown-it's own UMD build defines, which a bite-proof introduced unnoticed.
assert.doesNotMatch(renderMarkdown, /markdown-?it|marked|showdown|DOMParser/i, "Preview modal should not add a browser Markdown parser");
assert.match(previewStateMessage, /download-only[\s\S]*too large[\s\S]*permission[\s\S]*not available/i, "Preview modal should explain download-only, too-large, permission, and unavailable states");

assert.match(downloadAction, /"aria-label": label[\s\S]*download: true[\s\S]*href: `\/api\/files\/\$\{encodeURIComponent\(row\.fileId\)\}\/download`[\s\S]*surfaceAction: "files\.download"/, "Preview modal Download action should keep using the existing Files download route");

assert.match(filesStyles, /\.files-row-preview-unavailable\s*\{[\s\S]*color:\s*var\(--color-muted\)[\s\S]*cursor:\s*default/, "Download-only marker should be quiet and non-destructive");
assert.match(filesStyles, /\.files-preview-body\s*\{[\s\S]*min-height:\s*min\(48vh, 420px\)/, "Preview modal should reserve stable loading/content space");
assert.match(filesStyles, /\.files-preview-image-frame\s*\{[\s\S]*max-height:\s*min\(62vh, 680px\)[\s\S]*overflow:\s*auto/, "Image preview should stay constrained and scroll-safe");
assert.match(filesStyles, /\.files-preview-text\s*\{[\s\S]*max-height:\s*min\(62vh, 680px\)[\s\S]*overflow:\s*auto[\s\S]*white-space:\s*pre-wrap[\s\S]*overflow-wrap:\s*anywhere/, "Text preview should be readable and narrow-width safe");
assert.match(filesStyles, /\.files-preview-markdown\s*\{[\s\S]*max-height:\s*min\(62vh, 680px\)/, "Markdown preview should stay constrained inside the modal");

console.log("Files preview modal regression passed.");
// Consolidated under files.current-static-contracts by 0.33.33.11.
