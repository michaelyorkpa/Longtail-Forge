import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appVersion = "0.33.5.18.12.5";

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
const regressionSuite = read("scripts/regression-suite.mjs");
const viewContract = read("docs/view-building-contract.md");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(filesPage, /css\/longtail-forge\.css\?v=12/, "Files page should cache-bust row affordance and modal styling");
assert.match(filesPage, /js\/files\.js\?v=12/, "Files page should cache-bust the Files adapter");
assert.match(regressionSuite, /scripts\/files-edit-modal-save-regression\.mjs/, "Regression suite should include the Files edit modal save regression");

const fileRowBlock = functionBlock(filesScript, "fileRow");
const tableBlock = functionBlock(filesScript, "createFilesTable");
const wireRowsBlock = functionBlock(filesScript, "wireFilesTableRows");
const wireRowBlock = functionBlock(filesScript, "wireFileTableRow");
const actionIsolationBlock = functionBlock(filesScript, "isFileRowActionEvent");
const buildBlock = functionBlock(filesScript, "buildFileEditorDialog");
const controlBlock = [
  functionBlock(filesScript, "bindFileEditorControlEvents"),
  functionBlock(filesScript, "hydrateFileEditorContextControls"),
  functionBlock(filesScript, "hydrateFileEditorProjectControl"),
  functionBlock(filesScript, "setFileEditorControlsDisabled"),
  functionBlock(filesScript, "syncFileEditorSaveState"),
].join("\n");
const saveBlock = functionBlock(filesScript, "saveFileEditorContext");
const payloadBlock = functionBlock(filesScript, "fileEditorContextPayload");

assert.match(fileRowBlock, /const attachmentId = attachment\.fileAttachmentId \|\| attachment\.file_attachment_id \|\| ""/, "File rows should normalize the file attachment id");
assert.match(fileRowBlock, /attachmentId,/, "File rows should expose the normalized attachment id");
assert.match(tableBlock, /wireFilesTableRows\(tbody,\s*rows\)/, "Files table creation should wire rows after rendering through the helper table");
assert.match(wireRowsBlock, /const row = rows\[index\]/, "Files row wiring should preserve row-to-record pairing");
assert.match(wireRowsBlock, /if \(!row\?\.attachmentId\)/, "Files row wiring should only attach editor behavior to persisted file attachments");
assert.match(wireRowsBlock, /wireFileTableRow\(rowElement,\s*row\)/, "Files row wiring should delegate per-row behavior");

assert.match(wireRowBlock, /rowElement\.tabIndex = 0/, "Files rows should be keyboard focusable");
assert.match(wireRowBlock, /rowElement\.dataset\.fileEditorRow = ""/, "Files rows should expose a stable row-open marker");
assert.match(wireRowBlock, /rowElement\.dataset\.fileAttachmentId = row\.attachmentId/, "Files rows should keep the attachment id available for focus return");
assert.match(wireRowBlock, /openFileEditor\(row,\s*\{\s*trigger:\s*rowElement\s*\}\)/, "Files row click/Enter should open the canonical File Context modal with focus return");
assert.match(wireRowBlock, /event\.key !== "Enter"/, "Files row keyboard activation should use Enter");
assert.doesNotMatch(wireRowBlock, /Space|Spacebar|event\.key\s*===\s*" "/, "Files rows should not claim Space activation while preserving table semantics");
assert.doesNotMatch(wireRowBlock, /role",\s*"button"|role:\s*"button"/, "Files rows should not be recast as button controls");
assert.match(actionIsolationBlock, /\[data-file-action\], a, button, input, select, textarea/, "Files row-open should ignore repeated row actions and embedded controls");

assert.match(filesStyles, /\.files-table tbody tr\[data-file-editor-row\][\s\S]*cursor: pointer/, "Files rows should advertise clickability without adding selected-row state");
assert.match(filesStyles, /\.files-table tbody tr\[data-file-editor-row\]:focus-visible[\s\S]*outline: 2px solid var\(--color-accent\)/, "Files rows should expose a visible keyboard focus ring");

assert.match(buildBlock, /const previewButton = view\.createActionButton\(\{[\s\S]*icon:\s*"eye"[\s\S]*iconOnly:\s*true[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)[\s\S]*openFilePreview\(row,\s*\{\s*trigger:\s*event\.currentTarget\s*\}\)/, "File Context modal should expose the same standalone icon-only Preview action as the Files list");
assert.doesNotMatch(buildBlock, /openFilePreview\(row,\s*\{\s*parent:\s*dialog/, "File Context Preview should not bind the Preview modal to the edit modal");
assert.match(buildBlock, /const saveButton = view\.createActionButton\(\{[\s\S]*icon:\s*"save"[\s\S]*iconOnly:\s*true[\s\S]*type:\s*"submit"/, "File Context modal should expose an icon-only Save footer action");
assert.match(buildBlock, /actions:\s*\[previewButton,\s*closeButton,\s*saveButton\]/, "File Context footer should place Preview to the left of Close and Save");
assert.match(buildBlock, /previewButton\.dataset\.fileContextPreview = ""/, "File Context Preview should use a stable marker for footer control");
assert.match(buildBlock, /saveButton\.dataset\.fileContextSave = ""/, "File Context Save should use a stable marker for state control");
assert.match(buildBlock, /saveFileEditorContext\(dialog,\s*row,\s*options\)/, "File Context form submit should call the Files-owned save handler");

assert.match(controlBlock, /hydrateFileEditorProjectControl\(dialog,\s*row\)[\s\S]*loadFileEditorTargetOptions\(dialog,\s*row\)/, "Client changes should refresh the stable Project list before reloading target choices");
assert.doesNotMatch(controlBlock, /applyFileEditorSelectedTargetContext|setSelectValueIfPresent/, "Target changes should not rewrite Client/Project dropdown values");
assert.match(controlBlock, /syncFileEditorSaveState\(dialog/, "Target and loading states should keep Save disabled until an available target exists");
assert.match(controlBlock, /saveButton\.disabled = forceDisabled \|\| !targetSelect\?\.value \|\| selectedTarget\?\.disabled/, "Save should be disabled while loading, blank, or on unavailable fallback targets");

assert.match(saveBlock, /api\.patchJson\(`\/api\/files\/attachments\/\$\{encodeURIComponent\(row\.attachmentId\)\}\/context`,\s*payload\)/, "File Context Save should call the attachment-context PATCH route");
assert.match(saveBlock, /view\.closeModal\(dialog,\s*"saved"\)/, "Successful save should close the modal");
assert.match(saveBlock, /await loadFiles\(\)/, "Successful save should refresh the browse list");
assert.match(saveBlock, /focusFileRowByAttachmentId\(row\.attachmentId\)/, "Successful save should return focus to the refreshed attachment row when present");
assert.match(saveBlock, /catch \(error\) \{[\s\S]*setFileEditorControlsDisabled\(dialog,\s*false\)[\s\S]*setFileEditorStatus\(dialog,\s*error\.message \|\| "File context was not saved\.",\s*true\)/, "Failed save should keep the modal open and report an inline error");

assert.match(payloadBlock, /moduleId:[\s\S]*targetId:[\s\S]*targetType:/, "Save payload should include only the target identity required by the route");
assert.match(payloadBlock, /payload\.clientId = clientId/, "Business Client selector hints should be sent when available");
assert.match(payloadBlock, /payload\.projectId = projectId/, "Project selector hints should be sent when available");
assert.doesNotMatch(payloadBlock, /fileName|displayName|originalFilename|fileId|storageProvider|storageKey|storagePath|hash|scan|quarantine|delete|download/i, "Save payload should not expose file metadata, storage data, scanner state, or file lifecycle operations");

const targetQueryBlock = functionBlock(filesScript, "fileEditorTargetOptionQuery");
assert.doesNotMatch(targetQueryBlock, /\bmoduleId:\s*row\.moduleId\b|\btargetType:\s*row\.targetType\b/, "File Context target option query should allow cross-module targets such as Notes as well as Tasks");

assert.match(viewContract, /0\.33\.5\.18\.11\.9[\s\S]*Enter[\s\S]*Space[\s\S]*PATCH [`']?\/api\/files\/attachments\/:fileAttachmentId\/context/, "View-building contract should document the Enter-only row activation and save-route boundary");
assert.match(viewContract, /0\.33\.5\.18\.11\.9[\s\S]*row-open[\s\S]*Save[\s\S]*PATCH [`']?\/api\/files\/attachments\/:fileAttachmentId\/context/, "View-building contract should document the Files row-open and Save wiring");

console.log("Files edit modal save regression passed.");
