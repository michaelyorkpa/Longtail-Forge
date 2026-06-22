import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const listsModule = readText("src/modules/lists/module.js");
const listsJs = readText("public/js/lists.js");
const manifestContract = readText("src/core/modules/manifest-contract.js");
const renderer = readText("public/js/shared/view-renderer.js");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, "0.33.5.18.6.6.3", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.18.6.6.3", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.18.6.6.3", "package-lock package entry should report the current app version");

assert.match(listsModule, /version:\s*"0\.33\.5\.16\.12"/, "Lists module should report the current declarative closeout version");
assert.match(listsModule, /actionStrip:\s*\{[\s\S]*id:\s*"duplicate-list"[\s\S]*behavior:\s*"lists\.workflow\.duplicate"[\s\S]*id:\s*"edit-list"[\s\S]*id:\s*"complete-list"[\s\S]*id:\s*"finalize-list"[\s\S]*id:\s*"reopen-list"[\s\S]*id:\s*"mark-reusable-list"[\s\S]*id:\s*"unmark-reusable-list"[\s\S]*id:\s*"archive-list"[\s\S]*id:\s*"delete-list"[\s\S]*id:\s*"restore-list"/, "Lists descriptor should declare workflow actions and behavior IDs");
assert.match(listsModule, /linkedRecords:\s*\{[\s\S]*recordsField:\s*"links"[\s\S]*targetTypeField:\s*"target_type"[\s\S]*targetLabelField:\s*"target\.label"[\s\S]*field:\s*"task_search"[\s\S]*field:\s*"task_picker"[\s\S]*field:\s*"target_id"[\s\S]*id:\s*"add-link"[\s\S]*id:\s*"remove-link"/, "Lists descriptor should declare linked-record picker fields and row metadata");
assert.match(listsModule, /LIST_PERMISSIONS\.MANAGE_LINKS/, "Linked-record descriptor actions should use the Lists link permission metadata");
assert.match(listsModule, /LIST_PERMISSIONS\.DUPLICATE[\s\S]*LIST_PERMISSIONS\.COMPLETE[\s\S]*LIST_PERMISSIONS\.FINALIZE[\s\S]*LIST_PERMISSIONS\.MANAGE_REUSABLE/, "Workflow descriptor actions should use specific Lists permissions");

assert.match(manifestContract, /"linkedRecords"/, "Manifest contract should allow detail.linkedRecords");
assert.match(manifestContract, /function validateLinkedRecordsDescriptor/, "Manifest contract should validate linked-record descriptors");
assert.match(manifestContract, /detail\.actionStrip\.actions/, "Reference validation should include detail action strip actions");
assert.match(manifestContract, /detail\.linkedRecords\.actions/, "Reference validation should include linked-record actions");

for (const helper of [
  "renderDescriptorActionMenu",
  "renderDescriptorDataTable",
  "renderDescriptorFieldGrid",
  "renderDescriptorInlineActions",
  "renderDescriptorLinkedRecordsPanel",
  "renderDescriptorModalForm",
]) {
  assert.match(renderer, new RegExp(helper), `Renderer should expose ${helper}`);
  assert.match(listsJs, new RegExp(`view\\.${helper}`), `Lists should consume ${helper}`);
}

assert.match(listsJs, /registerListsViewBehaviors/, "Lists should register descriptor behavior handlers");
assert.match(listsJs, /"lists\.workflow\.duplicate":\s*"duplicate-list"[\s\S]*"lists\.workflow\.restore":\s*"restore-list"/, "Lists should map workflow behavior IDs to existing workflow actions");
assert.match(listsJs, /listsActionStripSurfaceDescriptor\(\)/, "Lists action strip should be descriptor-backed");
assert.match(listsJs, /listsLinkedRecordsSurfaceDescriptor\(\)/, "Lists linked records should be descriptor-backed");
assert.match(listsJs, /createLinkedRecordField/, "Linked-record picker controls should bind from descriptor fields");
assert.match(listsJs, /linkRecordNodes/, "Linked-record rows should bind from descriptor row metadata");
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
assert.match(listsJs, /usesBusinessScope\(\) \? \[option\("client", "Client"\)\] : \[\]/, "Business client link type should remain workspace-scoped");
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
