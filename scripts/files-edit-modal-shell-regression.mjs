import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const appVersion = "0.33.5.21.5";

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
const regressionSuite = read("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(filesPage, /css\/longtail-forge\.css\?v=13/, "Files page should cache-bust modal styling");
assert.match(filesPage, /js\/files\.js\?v=13/, "Files page should cache-bust the Files adapter");
assert.match(regressionSuite, /scripts\/files-edit-modal-shell-regression\.mjs/, "Regression suite should include the Files edit modal shell regression");

const openerBlock = functionBlock(filesScript, "openFileEditor");
const buildBlock = functionBlock(filesScript, "buildFileEditorDialog");
const metadataBlock = [
  functionBlock(filesScript, "createFileEditorMetadataSection"),
  functionBlock(filesScript, "createFileEditorMetadataList"),
  functionBlock(filesScript, "createReadOnlyMetadataRow"),
].join("\n");
const controlsBlock = [
  functionBlock(filesScript, "createFileEditorControlsSection"),
  functionBlock(filesScript, "createFileContextSelect"),
  functionBlock(filesScript, "hydrateFileEditorOptionControls"),
  functionBlock(filesScript, "hydrateFileEditorContextControls"),
  functionBlock(filesScript, "hydrateFileEditorProjectControl"),
  functionBlock(filesScript, "fileEditorClientOptions"),
  functionBlock(filesScript, "fileEditorProjectOptions"),
].join("\n");
const targetOptionsBlock = [
  functionBlock(filesScript, "loadFileEditorTargetOptions"),
  functionBlock(filesScript, "fileEditorTargetOptionQuery"),
  functionBlock(filesScript, "fileEditorSelectedContext"),
  functionBlock(filesScript, "hydrateTargetSelect"),
  functionBlock(filesScript, "createFileEditorTargetOption"),
  functionBlock(filesScript, "fileEditorTargetOptionLabel"),
  functionBlock(filesScript, "fileEditorTargetContextLabel"),
].join("\n");
const editorSource = [
  openerBlock,
  buildBlock,
  metadataBlock,
  controlsBlock,
  targetOptionsBlock,
  functionBlock(filesScript, "bindFileEditorControlEvents"),
  functionBlock(filesScript, "setFileEditorControlsDisabled"),
].join("\n");

assert.match(filesScript, /LongtailForge\.filesDialog = Object\.freeze\(\{[\s\S]*openFileEditor/, "Files should expose a canonical filesDialog.openFileEditor opener");
assert.match(openerBlock, /view\.showModal\(dialog,\s*\{[\s\S]*trigger/, "File editor opener should use the shared modal stack with trigger focus return");
assert.match(openerBlock, /loadFileEditorTargetOptions\(dialog,\s*row\)/, "File editor opener should load route-backed target choices");
assert.match(buildBlock, /const previewButton = view\.createActionButton\(\{[\s\S]*icon:\s*"eye"[\s\S]*label:\s*`Preview \$\{row\.fileName\}`[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)[\s\S]*openFilePreview\(row,\s*\{\s*trigger:\s*event\.currentTarget\s*\}\)/, "File editor should expose the same standalone Preview footer action as the Files list");
assert.doesNotMatch(buildBlock, /openFilePreview\(row,\s*\{\s*parent:\s*dialog/, "File editor Preview should not bind the Preview modal to the edit modal");
assert.match(buildBlock, /previewButton\.dataset\.fileContextPreview = ""[\s\S]*previewButton\.hidden = !row\.previewable[\s\S]*previewButton\.disabled = !row\.previewable/, "File editor Preview action should have a stable marker and hide for non-previewable rows");
assert.match(buildBlock, /const markReviewedButton = view\.createActionButton\(\{[\s\S]*action:\s*"files\.restore"[\s\S]*label:\s*`Mark \$\{row\.fileName\} reviewed`[\s\S]*markFileReviewedFromContext\(dialog,\s*row,\s*options\)/, "File editor should expose Mark Reviewed as a modal-only review recovery action");
assert.match(buildBlock, /markReviewedButton\.dataset\.fileContextMarkReviewed = ""[\s\S]*markReviewedButton\.hidden = !row\.reviewable[\s\S]*markReviewedButton\.disabled = !row\.reviewable/, "File editor Mark Reviewed action should have a stable marker and hide outside in-review recovery");
assert.match(buildBlock, /view\.renderDescriptorModalForm\(fileEditorModalDescriptor\(\),[\s\S]*utilityActions:\s*\[previewButton,\s*markReviewedButton\][\s\S]*actions:\s*\[closeButton,\s*saveButton\]/, "File editor should use the shared descriptor modal form shell with Preview and Mark Reviewed left of Close and Save");
assert.match(buildBlock, /viewParts\.form\.addEventListener\("submit"[\s\S]*event\.preventDefault\(\)[\s\S]*saveFileEditorContext\(dialog,\s*row,\s*options\)/, "File editor form should submit through the Files-owned context save handler");
assert.match(buildBlock, /viewParts\.footer\.dataset\.modalFooter = ""/, "File editor should mark the shared modal footer");

[
  "File name",
  "File type",
  "Size",
  "Status",
  "Review state",
  "Uploaded",
  "Attached",
  "Uploader",
].forEach((label) => {
  assert.ok(metadataBlock.includes(label), `File editor metadata should show ${label}`);
});
assert.match(metadataBlock, /createReadOnlyMetadataRow/, "File editor metadata should be rendered through read-only rows");
assert.doesNotMatch(metadataBlock, /createFileContextSelect|document\.createElement\("input"\)|document\.createElement\("select"\)|name\s*=/, "File metadata should not create editable controls");

assert.match(controlsBlock, /createFileContextSelect\("fileContextTarget",\s*"target"\)/, "File editor should expose a Target control");
assert.match(controlsBlock, /createFileContextSelect\("fileContextClient",\s*usesBusinessScope\(\) \? "clientId" : ""\)/, "File editor should expose a Business Client control");
assert.match(controlsBlock, /createFileContextSelect\("fileContextProject",\s*"projectId"\)/, "File editor should expose a Project control");
assert.match(controlsBlock, /fields:\s*\[[\s\S]*clientField,[\s\S]*createFileContextField\("Project", projectSelect\),[\s\S]*createFileContextField\("Target", targetSelect\)/, "File editor Context controls should order Client, Project, then Target");
assert.match(controlsBlock, /clientField\.hidden = !business/, "Personal and Family scope should hide the Client control");
assert.match(controlsBlock, /clientSelect\.name = business \? "clientId" : ""/, "Personal and Family scope should not submit Client values");
assert.match(buildBlock, /hydrateFileEditorContextControls\(dialog,\s*row,\s*usesBusinessScope\(\)\)/, "File editor should hydrate Client/Project controls from stable client-project state before loading targets");
assert.match(controlsBlock, /state\.clients\.map/, "File editor Client options should come from the shared /api/client-projects state, not target-option filters");
assert.match(controlsBlock, /state\.projects\.filter/, "File editor Project options should come from the shared /api/client-projects state and only filter by selected Client");
assert.match(controlsBlock, /project\.projectLabel[\s\S]*project\.label/, "Project labels should use nested project labels when a Client is selected and include Client context when all clients are shown");
assert.doesNotMatch(controlsBlock, /response\.filters\?\.client|response\.filters\?\.project/, "File editor Client/Project controls should not shrink to the filtered target-option response");
assert.match(targetOptionsBlock, /\/api\/files\/attachable-targets/, "File editor should load target choices through the attachable target provider");
assert.match(targetOptionsBlock, /usesBusinessScope\(\)[\s\S]*clientId/, "Business Client selection should participate in target option filtering");
assert.match(targetOptionsBlock, /projectId/, "Project selection should participate in target option filtering");
assert.doesNotMatch(functionBlock(filesScript, "fileEditorTargetOptionQuery"), /\bmoduleId:\s*row\.moduleId\b|\btargetType:\s*row\.targetType\b/, "File editor target query should not restrict choices to the current module/target type");
assert.match(targetOptionsBlock, /context\.clientId !== optionClientId[\s\S]*context\.projectId !== optionProjectId/, "Target option labels should omit context parts already selected by Client/Project filters");
assert.doesNotMatch(functionBlock(filesScript, "bindFileEditorControlEvents"), /setSelectValueIfPresent|applyFileEditorSelectedTargetContext/, "Target changes should not rewrite Client/Project dropdown values");

assert.match(buildBlock, /previewButton\.dataset\.fileContextPreview = ""/, "File editor should expose a shared footer Preview control");
assert.match(buildBlock, /saveButton\.dataset\.fileContextSave = ""/, "File editor should expose a shared footer Save control");
assert.doesNotMatch(editorSource, /rename|replacement|storageProvider|storageKey|quarantine|hardDelete|permanent|purge/i, "File editor shell should not add forbidden controls");
assert.doesNotMatch(functionBlock(filesScript, "createFileActions"), /openFileEditor/, "Files row actions should not open the editor in this slice");

console.log("Files edit modal shell regression passed.");
