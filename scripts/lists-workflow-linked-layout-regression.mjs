import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const listsModule = readText("src/modules/lists/module.js");
const listsJs = readText("public/js/lists.js");
const listsRoutes = readText("src/modules/lists/lists.routes.js");
const listsService = readText("src/modules/lists/lists.service.js");
const manifestContract = readText("src/core/modules/manifest-contract.js");
const renderer = readText("public/js/shared/view-renderer.js");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-legacy-snapshot.json");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");

assert.match(listsModule, /version:\s*appVersion/, "Lists module should report the current app version");
assert.match(listsModule, /actionStrip:\s*\{[\s\S]*id:\s*"duplicate-list"[\s\S]*behavior:\s*"lists\.workflow\.duplicate"[\s\S]*id:\s*"edit-list"[\s\S]*id:\s*"complete-list"[\s\S]*id:\s*"finalize-list"[\s\S]*id:\s*"reopen-list"[\s\S]*id:\s*"mark-reusable-list"[\s\S]*id:\s*"unmark-reusable-list"[\s\S]*id:\s*"archive-list"[\s\S]*id:\s*"delete-list"[\s\S]*id:\s*"restore-list"/, "Lists descriptor should declare workflow actions and behavior IDs");
assert.doesNotMatch(listsModule, /linkedRecords:\s*\{[\s\S]*field:\s*"task_search"[\s\S]*field:\s*"task_picker"[\s\S]*field:\s*"target_id"/, "Lists descriptor should not keep the retired detail-side task/raw-ID linked-record editor");
assert.match(listsModule, /id:\s*"list-editor"[\s\S]*size:\s*"wide"[\s\S]*field:\s*"title"[\s\S]*width:\s*"full"[\s\S]*field:\s*"project_id"[\s\S]*width:\s*"wide"/, "The List editor descriptor should select the framework wide modal and shared field width hints");
assert.match(listsModule, /LIST_PERMISSIONS\.DUPLICATE[\s\S]*LIST_PERMISSIONS\.COMPLETE[\s\S]*LIST_PERMISSIONS\.FINALIZE[\s\S]*LIST_PERMISSIONS\.MANAGE_REUSABLE/, "Workflow descriptor actions should use specific Lists permissions");

assert.match(manifestContract, /"linkedRecords"/, "Manifest contract should allow detail.linkedRecords");
assert.match(manifestContract, /function validateLinkedRecordsDescriptor/, "Manifest contract should validate linked-record descriptors");
assert.match(manifestContract, /VIEW_MODAL_FIELDS = new Set\(\[[\s\S]*"size"/, "Manifest modal descriptors should allow the framework size contract");
assert.match(manifestContract, /detail\.actionStrip\.actions/, "Reference validation should include detail action strip actions");
assert.match(manifestContract, /detail\.linkedRecords\.actions/, "Reference validation should include linked-record actions");

for (const helper of [
  "renderDescriptorActionMenu",
  "renderDescriptorDataTable",
  "renderDescriptorFieldGrid",
  "renderDescriptorInlineActions",
  "renderDescriptorModalForm",
]) {
  assert.match(renderer, new RegExp(helper), `Renderer should expose ${helper}`);
  assert.match(listsJs, new RegExp(`view\\.${helper}`), `Lists should consume ${helper}`);
}

assert.match(listsJs, /registerListsViewBehaviors/, "Lists should register descriptor behavior handlers");
assert.match(listsJs, /"lists\.workflow\.duplicate":\s*"duplicate-list"[\s\S]*"lists\.workflow\.restore":\s*"restore-list"/, "Lists should map workflow behavior IDs to existing workflow actions");
assert.match(listsJs, /listsActionStripSurfaceDescriptor\(\)/, "Lists action strip should be descriptor-backed");
assert.doesNotMatch(listsJs, /listsLinkedRecordsSurfaceDescriptor|renderDescriptorLinkedRecordsPanel|field:\s*"task_search"|field:\s*"task_picker"|loadTaskLinkTargets|taskLinkTargets/, "Lists should not keep the retired detail-side task/raw-ID linked-record editor or its task bootstrap");
assert.match(listsJs, /function createListDetailsPanel\(list\)[\s\S]*view\.createInfoPanel\(\{[\s\S]*title:\s*"List Details"[\s\S]*collapsible:\s*true[\s\S]*open:\s*true[\s\S]*view\.createLinkedContextList\(\{[\s\S]*readonly:\s*true/, "Lists detail should use a collapsible List Details box with a read-only shared linked-context list");
assert.match(listsJs, /function linkedContextItems\(list\)[\s\S]*unavailableLinkedRecordLabel\(targetType\)[\s\S]*removable:\s*false/, "Lists linked rows should adapt soft-read targets into safe read-only linked-context rows");
assert.match(listsJs, /function unavailableLinkedRecordLabel\(targetType\)[\s\S]*`Unavailable \$\{typeLabel\.toLowerCase\(\)\}`/, "Unavailable linked targets should show safe fallback labels instead of raw IDs");
assert.doesNotMatch(functionBlock(listsJs, "renderDetail"), /createLinkedRecordsPanel\(/, "Lists detail should not render the inline linked-record add/remove picker");
assert.match(functionBlock(listsJs, "createListDialogShell"), /view\.createLinkedContextPicker\(\{[\s\S]*onRemove:\s*handleListEditorLinkedContextRemove[\s\S]*onUseTarget:\s*applyListEditorLinkTarget/, "The List editor should host the shared Linked Context picker");
assert.match(functionBlock(listsJs, "createListDialogShell"), /view\.renderDescriptorFieldGrid[\s\S]*className:\s*"lists-editor-fields"/, "The List editor should render fields through the framework field-grid anatomy");
assert.doesNotMatch(functionBlock(listsJs, "createListDialogShell"), /lists-form-grid|Paste record ID|field:\s*"task_picker"|field:\s*"task_search"|renderDescriptorLinkedRecordsPanel/, "The List editor should not rebuild the retired cramped/raw-ID picker");
assert.match(listsJs, /state\.editorStagedTargets = \[\.\.\.state\.editorStagedTargets, target\]/, "Create mode should stage linked targets until the new list exists");
assert.match(listsJs, /for \(const target of state\.editorStagedTargets\)[\s\S]*api\.postJson\(`\/api\/lists\/\$\{encodeURIComponent\(savedListId\)\}\/links`/, "Creating a list should persist staged targets through the existing Lists link route");
assert.match(listsRoutes, /get\("\/lists\/link-targets"[\s\S]*listsService\.listLinkTargets/, "Lists should expose its permission-filtered picker-target route");
assert.match(listsService, /assertCanInAnyScope\(session, LIST_PERMISSIONS\.MANAGE_LINKS[\s\S]*listActiveLinkedContextProviders[\s\S]*LIST_LINK_TARGET_TYPES/, "Picker targets should require Lists link-write permission and active readable providers");
assert.match(listsService, /assertLinkedContextTargetContract/, "Picker rows should satisfy the shared linked-context target response contract");
assert.match(listsJs, /button\.dataset\.surfaceAction = options\.behavior/, "Descriptor-derived buttons should expose their behavior IDs");

for (const forbidden of [
  "view.createPageHeader",
  "view.createFilterPanel",
  "view.createCollapsibleIndexPanel",
  "view.createSplitListDetail",
  "view.createDataTable",
  "view.createModalForm",
  "view.createDetailActionStrip",
  "view.createFieldGrid",
  "view.createInlineActionRow",
]) {
  assert.doesNotMatch(listsJs, new RegExp(escapeRegExp(forbidden)), `Lists should not call ${forbidden} directly for the declarative surface`);
}

assert.match(listsJs, /\/api\/lists\/\$\{listId\}\/duplicate/, "Duplicate workflow route should remain Lists-owned");
assert.match(listsJs, /\/api\/lists\/\$\{listId\}\/complete/, "Complete workflow route should remain Lists-owned");
assert.match(listsJs, /\/api\/lists\/\$\{listId\}\/finalize/, "Finalize workflow route should remain Lists-owned");
assert.match(listsJs, /\/api\/lists\/\$\{listId\}\/reopen/, "Reopen workflow route should remain Lists-owned");
assert.match(listsJs, /\/api\/lists\/\$\{listId\}\/mark-reusable/, "Reusable workflow route should remain Lists-owned");
assert.match(listsJs, /\/api\/lists\/\$\{encodeURIComponent\(listId\)\}\/links/, "Linked-record add route should remain Lists-owned");
assert.match(listsJs, /\/api\/lists\/\$\{listId\}\/links\/\$\{encodeURIComponent\(linkId\)\}\/remove/, "Linked-record remove route should remain Lists-owned");
assert.match(listsJs, /setBusinessControlsVisible\(usesBusinessScope\(\)\)/, "Business client/project controls should remain workspace-scoped");
assert.match(listsJs, /setContextControlsVisible\(usesBusinessScope\(\)\)/, "Personal and Family workspace context behavior should remain preserved");

assert.match(changelog, /## Version 0\.33\.5\.16\.11 - /, "Changelog should include the Lists workflow/link descriptor version");
assert.match(regressionSuite, /scripts\/lists-workflow-linked-layout-regression\.mjs/, "Regression suite should include Lists workflow/link layout regression");

console.log("Lists workflow, linked records, and layout descriptor regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}
