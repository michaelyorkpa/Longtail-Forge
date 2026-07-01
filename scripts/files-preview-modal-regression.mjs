import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appVersion = "0.33.5.19.7";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
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

const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const filesPage = read("views/protected/files.html");
const filesScript = read("public/js/files.js");
const filesStyles = read("public/css/longtail-forge.css");
const icons = read("public/js/shared/icons.js");
const regressionSuite = read("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(filesPage, /css\/longtail-forge\.css\?v=13/, "Files page should cache-bust preview modal styling");
assert.match(filesPage, /js\/files\.js\?v=13/, "Files page should cache-bust the preview modal browser wiring");
assert.match(icons, /eye:\s*Object\.freeze/, "Shared icon registry should include the Preview eye icon");
assert.match(regressionSuite, /scripts\/files-preview-modal-regression\.mjs/, "Regression suite should include the Files preview modal regression");

const fileRow = functionBlock(filesScript, "fileRow");
const actions = functionBlock(filesScript, "createFileActions");
const previewAction = functionBlock(filesScript, "createPreviewAction");
const downloadOnlyMarker = functionBlock(filesScript, "createDownloadOnlyMarker");
const rowOpen = functionBlock(filesScript, "wireFileTableRow");
const actionIsolation = functionBlock(filesScript, "isFileRowActionEvent");
const openPreview = functionBlock(filesScript, "openFilePreview");
const buildPreview = functionBlock(filesScript, "buildFilePreviewDialog");
const loadPreview = functionBlock(filesScript, "loadFilePreview");
const renderContent = functionBlock(filesScript, "renderFilePreviewContent");
const renderImage = functionBlock(filesScript, "renderFilePreviewImage");
const renderText = functionBlock(filesScript, "renderFilePreviewText");
const renderMarkdown = functionBlock(filesScript, "renderFilePreviewMarkdown");
const downloadAction = functionBlock(filesScript, "createPreviewDownloadAction");
const previewAvailability = functionBlock(filesScript, "previewAvailabilityForRow");
const previewKind = functionBlock(filesScript, "previewKindForExtension");
const previewStateMessage = functionBlock(filesScript, "previewStateMessage");

assert.match(fileRow, /const canManageReview = canManageFileReview\(attachment, file, fileId\)[\s\S]*const preview = previewAvailabilityForRow\(\{[\s\S]*canPreviewInReview: canManageReview[\s\S]*extension[\s\S]*fileSizeBytes[\s\S]*scanStatus[\s\S]*status/, "Files rows should derive local preview affordance state");
assert.match(fileRow, /previewKind:\s*preview\.kind[\s\S]*previewable:\s*preview\.state === "previewable"[\s\S]*previewState:\s*preview\.state/, "Files rows should expose preview kind/state for action rendering");
assert.match(previewAvailability, /reviewPreviewAllowed[\s\S]*status !== "available"[\s\S]*scanStatus[\s\S]*"unsupported"[\s\S]*TEXT_PREVIEW_MAX_BYTES[\s\S]*state:\s*"previewable"/, "Preview affordance should mirror status, scan, supported type, review permission, and size-cap gates");
assert.match(previewKind, /IMAGE_PREVIEW_EXTENSIONS[\s\S]*MARKDOWN_PREVIEW_EXTENSIONS[\s\S]*TEXT_PREVIEW_EXTENSIONS[\s\S]*return "unsupported"/, "Preview kind should cover image, Markdown, text, and unsupported rows");

assert.match(actions, /if \(row\.previewable\)[\s\S]*createPreviewAction\(row\)[\s\S]*else if \(row\.downloadable\)[\s\S]*createDownloadOnlyMarker\(row\)[\s\S]*createDownloadAction\(row\)/, "Files rows should show Preview for previewable rows and a quiet download-only marker for non-previewable downloadable rows");
assert.match(previewAction, /icon:\s*"eye"[\s\S]*iconOnly:\s*true[\s\S]*label:\s*`Preview \$\{row\.fileName\}`[\s\S]*title:\s*`Preview \$\{row\.fileName\}`/, "Preview should use an icon-only eye action with accessible label/title");
assert.match(previewAction, /stopFileRowActionEvent\(event\)[\s\S]*openFilePreview\(row,\s*\{\s*trigger:\s*event\.currentTarget\s*\}\)/, "Preview button should open Preview without triggering row edit");
assert.doesNotMatch(previewAction, /openFileEditor/, "Preview button must not open the File Context editor");
assert.match(previewAction, /button\.dataset\.fileAction = "preview"/, "Preview button should participate in row action isolation");
assert.match(downloadOnlyMarker, /files-row-preview-unavailable[\s\S]*"aria-label": label[\s\S]*role: "img"[\s\S]*fileAction: "preview-unavailable"/, "Download-only marker should be visible, accessible, and isolated from row-open");

assert.match(rowOpen, /openFileEditor\(row,\s*\{\s*trigger:\s*rowElement\s*\}\)/, "Row click/Enter should still open File Context");
assert.doesNotMatch(rowOpen, /openFilePreview/, "Row click/Enter should not open Preview");
assert.match(actionIsolation, /\[data-file-action\], a, button, input, select, textarea/, "Row-open isolation should include Preview and download-only row controls");

assert.match(openPreview, /requireFilesViewHelper\("createModal"\)[\s\S]*requireFilesViewHelper\("showModal"\)/, "Preview should use the shared modal stack helpers");
assert.match(openPreview, /activeFilePreviewDialog[\s\S]*view\.closeModal\(activeFilePreviewDialog, "replace"\)[\s\S]*view\.showModal\(dialog, \{ parent: options\.parent \|\| null, trigger \}\)[\s\S]*loadFilePreview\(dialog, row\)/, "Preview should replace an existing preview modal, return focus through the trigger, and load route-backed content");
assert.match(buildPreview, /view\.createModal\(\{[\s\S]*title:\s*`Preview \$\{row\.fileName\}`[\s\S]*className:\s*"files-preview-dialog"[\s\S]*size:\s*"wide"[\s\S]*actions:\s*\[downloadAction,\s*closeButton\]\.filter\(Boolean\)/, "Preview modal should use the shared wide modal with Download and Close actions");
assert.match(buildPreview, /dialog\.dataset\.filePreviewDialog = ""[\s\S]*dialog\.dataset\.fileAttachmentId = row\.attachmentId \|\| ""/, "Preview modal should expose stable markers for tests and focus/debugging");

assert.match(loadPreview, /api\.getJson\(`\/api\/files\/attachments\/\$\{encodeURIComponent\(row\.attachmentId\)\}\/preview`/, "Preview modal should read the attachment-scoped preview descriptor route");
assert.match(loadPreview, /preview\.state !== "previewable" \|\| !preview\.contentUrl[\s\S]*renderFilePreviewState\(dialog, preview\)/, "Preview modal should handle download-only/unavailable descriptor states");
assert.match(loadPreview, /preview\.kind === "image"[\s\S]*renderFilePreviewImage\(dialog, preview\)/, "Image previews should render from the authenticated content URL");
assert.match(loadPreview, /api\.getJson\(preview\.contentUrl[\s\S]*renderFilePreviewContent\(dialog, preview, contentResponse\.content \|\| \{\}\)/, "Text and Markdown previews should load content through the route-backed content URL");
assert.match(renderContent, /content\.kind === "text"[\s\S]*content\.kind === "markdown"/, "Preview content should branch only on server-provided safe content kinds");
assert.match(renderImage, /createFilesElement\("img"[\s\S]*src: preview\.contentUrl[\s\S]*image\.addEventListener\("load"[\s\S]*image\.addEventListener\("error"/, "Image previews should use the authenticated content route and handle load/error states");
assert.match(renderText, /createFilesElement\("code", \{ text: text \|\| "" \}\)/, "Text previews should render as textContent, not HTML");
assert.match(renderMarkdown, /content\.innerHTML = html \|\| ""/, "Markdown previews should render the server-sanitized HTML payload");
assert.doesNotMatch(renderMarkdown, /MarkdownIt|marked|showdown|markdown-it|DOMParser/, "Preview modal should not add a browser Markdown parser");
assert.match(previewStateMessage, /download-only[\s\S]*too large[\s\S]*permission[\s\S]*not available/i, "Preview modal should explain download-only, too-large, permission, and unavailable states");

assert.match(downloadAction, /"aria-label": label[\s\S]*download: true[\s\S]*href: `\/api\/files\/\$\{encodeURIComponent\(row\.fileId\)\}\/download`[\s\S]*surfaceAction: "files\.download"/, "Preview modal Download action should keep using the existing Files download route");

assert.match(filesStyles, /\.files-row-preview-unavailable\s*\{[\s\S]*color:\s*var\(--color-muted\)[\s\S]*cursor:\s*default/, "Download-only marker should be quiet and non-destructive");
assert.match(filesStyles, /\.files-preview-body\s*\{[\s\S]*min-height:\s*min\(48vh, 420px\)/, "Preview modal should reserve stable loading/content space");
assert.match(filesStyles, /\.files-preview-image-frame\s*\{[\s\S]*max-height:\s*min\(62vh, 680px\)[\s\S]*overflow:\s*auto/, "Image preview should stay constrained and scroll-safe");
assert.match(filesStyles, /\.files-preview-text\s*\{[\s\S]*max-height:\s*min\(62vh, 680px\)[\s\S]*overflow:\s*auto[\s\S]*white-space:\s*pre-wrap[\s\S]*overflow-wrap:\s*anywhere/, "Text preview should be readable and narrow-width safe");
assert.match(filesStyles, /\.files-preview-markdown\s*\{[\s\S]*max-height:\s*min\(62vh, 680px\)/, "Markdown preview should stay constrained inside the modal");

console.log("Files preview modal regression passed.");
