import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.19.1.2";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const helper = readText("public/js/shared/file-attachments.js");
const filesScript = readText("public/js/files.js");
const styles = readText("public/css/longtail-forge.css");
const notesHtml = readText("views/protected/notes.html");
const tasksHtml = readText("views/protected/tasks.html");
const workbenchHtml = readText("views/protected/workbench.html");
const viewContract = readText("docs/view-building-contract.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Files upload-shell slice version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Files upload-shell slice version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Files upload-shell slice version");

const uploadControls = functionBlock(helper, "uploadControls");
assert.match(uploadControls, /const view = global\.LongtailForge\?\.view/, "Attachment helper should lazily read the view helper because host pages load it later");
assert.match(uploadControls, /createAttachmentElement\(view, "form"[\s\S]*attrs:\s*\{\s*"aria-label": "Upload files"\s*\}/, "Upload form should expose an accessible upload label");
assert.match(uploadControls, /createAttachmentElement\(view, "div"[\s\S]*className: "file-attachment-dropzone"[\s\S]*dropZone\.tabIndex = 0/, "Dropzone should remain keyboard-focusable");
assert.match(uploadControls, /text: acceptedFileHint\(options\.acceptedCategories\)/, "Upload shell should render an accepted-file hint from Files-owned categories");
assert.match(uploadControls, /input\.multiple = true/, "Upload input should preserve multi-file selection");
assert.match(uploadControls, /accept: acceptedExtensions\(options\.acceptedCategories\)\.join\(","\)/, "Upload input should keep accepted extensions Files-owned");
assert.match(uploadControls, /await uploadFiles\(container, state, \[\.\.\.input\.files\]\)/, "Submit should keep using the Files-owned upload handler");
assert.match(uploadControls, /event\.dataTransfer\?\.files[\s\S]*await uploadFiles\(container, state, files\)/, "Drop should preserve drag/drop multi-file upload");
assert.match(uploadControls, /form\.append\(createUploadShell\(state, view, \[dropZone, hint, controlRow, results\]\)\)/, "Upload controls should render through the shared shell placement");

const createUploadShell = functionBlock(helper, "createUploadShell");
assert.match(createUploadShell, /view\?\.createListShell/, "Upload shell should use the shared list shell when available");
assert.match(createUploadShell, /className: "file-attachment-upload-shell"/, "Upload shell should use a stable Files upload shell class");
assert.match(createUploadShell, /"data-file-upload-shell": ""/, "Upload shell should expose a stable data hook");
assert.match(createUploadShell, /statusMessage: uploadStatusMessage\(state\)/, "Upload shell should route progress/status through shared shell status");
assert.match(createUploadShell, /"data-file-upload-status": ""/, "Upload status should expose a stable data hook");
assert.match(createUploadShell, /return createAttachmentElement\(view, "div"[\s\S]*file-attachment-upload-shell[\s\S]*fileUploadShell/, "Upload shell should use the centralized attachment element fallback when the shared list shell is unavailable");

const createUploadButton = functionBlock(helper, "createUploadButton");
assert.match(createUploadButton, /view\?\.createActionButton/, "Upload button should use the shared action button when available");
assert.match(createUploadButton, /action: "files\.upload"[\s\S]*role: "primary"[\s\S]*type: "submit"/, "Shared upload button should keep an explicit action id, role, and submit type");
assert.match(createUploadButton, /createAttachmentElement\(view, "button"[\s\S]*type: "submit"[\s\S]*button\.disabled = state\.isUploading/, "Upload button should keep a centralized native fallback button");

const uploadResultList = functionBlock(helper, "uploadResultList");
assert.match(uploadResultList, /"data-file-upload-results": ""|fileUploadResults: ""/, "Per-file upload results should expose a stable data hook");
assert.match(uploadResultList, /state\.uploadResults\.map\(\(result\) => createUploadResultItem\(view, result\)\)/, "Per-file upload results should remain visible after batch uploads");
assert.match(uploadResultList, /result\.ok \?[\s\S]*uploaded\.[\s\S]*Upload failed\./, "Upload results should show success and failure rows");

const uploadStatusMessage = functionBlock(helper, "uploadStatusMessage");
assert.match(uploadStatusMessage, /state\.isUploading[\s\S]*Uploading files/, "Upload status should show progress while uploading");
assert.match(uploadStatusMessage, /state\.error[\s\S]*return state\.error/, "Upload status should surface rejected upload states");
assert.match(uploadStatusMessage, /state\.uploadResults\.length > 0[\s\S]*failed > 0[\s\S]*uploaded, \$\{failed\} failed/, "Upload status should summarize partial failures");
assert.match(uploadStatusMessage, /Select files to upload/, "Upload status should have an idle instruction");

const uploadFiles = functionBlock(helper, "uploadFiles");
assert.match(uploadFiles, /readFileBase64\(file\)/, "File reading should remain in the Files-owned helper");
assert.match(uploadFiles, /api\.postJson\("\/api\/files\/batch"/, "Uploads should continue using the Files batch route");
[
  "files: uploadPayloads",
  "moduleId: options.moduleId",
  "targetType: options.targetType",
  "targetId: options.targetId",
  "clientId: options.clientId",
  "projectId: options.projectId",
  "visibility: options.visibility",
].forEach((snippet) => {
  assert.ok(uploadFiles.includes(snippet), `Upload payload should preserve ${snippet}`);
});
["uploadStarted", "uploadCompleted", "attachmentAdded", "uploadFailed"].forEach((eventName) => {
  assert.match(uploadFiles, new RegExp(`"${eventName}"`), `Upload flow should still emit ${eventName}`);
});

assert.match(functionBlock(helper, "readFileBase64"), /new FileReader\(\)[\s\S]*readAsDataURL\(file\)/, "Base64 conversion should stay Files-owned");
assert.match(functionBlock(helper, "acceptedFileHint"), /acceptedExtensions\(categories\)\.join\(", "\)/, "Accepted-file hint should derive from the existing extension map");

assert.doesNotMatch(functionBlock(filesScript, "openFileEditor"), /file-attachment-upload|createUploadShell|\/api\/files\/batch/, "File Context modal should not gain upload UI");
assert.doesNotMatch(functionBlock(filesScript, "openFilePreview"), /file-attachment-upload|createUploadShell|\/api\/files\/batch/, "Files Preview modal should not gain upload UI");

assert.match(styles, /\.file-attachment-upload-shell\s*\{[\s\S]*gap:\s*10px/, "Upload shell should have explicit spacing on top of the shared list shell");
assert.match(styles, /\.file-attachment-upload-status\s*\{[\s\S]*color:\s*var\(--color-muted\)[\s\S]*font-size:\s*13px/, "Upload shell status should use the shared subdued visual language");
assert.match(styles, /\.file-attachment-upload-hint\s*\{[\s\S]*color:\s*var\(--color-muted\)[\s\S]*font-size:\s*13px/, "Accepted-file hint should be readable but quiet");
assert.match(styles, /\.file-attachment-upload-actions\s*\{[\s\S]*display:\s*flex[\s\S]*flex-wrap:\s*wrap/, "Upload action row should wrap safely on narrow widths");
assert.match(styles, /\.file-attachment-upload-results\s*\{[\s\S]*display:\s*grid/, "Upload result rows should remain grouped and readable");

assert.match(notesHtml, /css\/longtail-forge\.css\?v=56/, "Notes should cache-bust the shared stylesheet for upload shell changes");
assert.match(notesHtml, /js\/shared\/file-attachments\.js\?v=5/, "Notes should cache-bust the attachment helper");
assert.match(tasksHtml, /css\/longtail-forge\.css\?v=72/, "Tasks should cache-bust the shared stylesheet for upload shell changes");
assert.match(tasksHtml, /js\/shared\/file-attachments\.js\?v=4/, "Tasks should cache-bust the attachment helper");
assert.match(workbenchHtml, /css\/longtail-forge\.css\?v=21/, "Workbench should cache-bust the shared stylesheet for upload shell changes");
assert.match(workbenchHtml, /js\/shared\/file-attachments\.js\?v=4/, "Workbench should cache-bust the attachment helper");

assert.match(viewContract, /Implementation Notes For 0\.33\.5\.18\.12\.1/, "View-building contract should document the Files upload-shell slice");
assert.match(regressionSuite, /scripts\/files-upload-shell-regression\.mjs/, "Regression suite should include the Files upload-shell regression");

console.log("Files upload shell regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
