import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readText("views/protected/lists.html");
const listsJs = readText("public/js/lists.js");
const css = readText("public/css/longtail-forge.css");
const renderer = readText("public/js/shared/view-renderer.js");
const changelog = readText("CHANGELOG.md");
const viewContract = readText("docs/view-building-contract.md");
const regressionSuite = readText("scripts/regression-suite.mjs");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));

assert.equal(packageJson.version, "0.33.5.21.7.7", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.21.7.7", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.21.7.7", "package-lock package entry should report the current app version");

assert.match(html, /<main class="wide-page lists-page" data-lists-host><\/main>/, "Lists protected view should be a minimal host");
assert.match(html, /js\/shared\/view-builder\.js\?v=5/, "Lists protected view should load the framework view builder");
assert.match(html, /js\/shared\/view-renderer\.js\?v=6/, "Lists protected view should load the framework view renderer");
assert.match(html, /js\/lists\.js\?v=13/, "Lists protected view should cache-bust the converted Lists script");
assert.doesNotMatch(html, /data-list-filter-status|data-lists-list|data-list-detail|data-list-dialog/, "Lists static HTML should not own converted workspace anatomy");
assert.doesNotMatch(html, /lists-filters-panel|lists-index-panel|lists-detail-panel|list-table-wrap/, "Lists static HTML should not rely on one-off layout classes for converted structures");

for (const helper of [
  "createPageHeader",
  "createStatusMessage",
  "createFilterPanel",
  "createCollapsibleIndexPanel",
  "createDataTable",
  "createDetailHeader",
  "createDetailActionStrip",
  "createInfoPanel",
  "createFieldGrid",
  "createInlineActionRow",
  "createModalForm",
  "createEmptyState",
]) {
  assert.match(renderer, new RegExp(`view\\.${helper}`), `Declarative renderer should consume LongtailForge.view.${helper}`);
}
assert.match(listsJs, /view\.createActionButton/, "Lists behavior adapter should still use LongtailForge.view.createActionButton for module-specific controls");

for (const helper of [
  "renderDescriptorActionMenu",
  "renderDescriptorDataTable",
  "renderDescriptorFieldGrid",
  "renderDescriptorInlineActions",
  "renderDescriptorLinkedRecordsPanel",
  "renderDescriptorModalForm",
]) {
  assert.match(listsJs, new RegExp(`view\\.${helper}`), `Lists declarative adapter should consume LongtailForge.view.${helper}`);
}

for (const hook of [
  "dataset.listsTitle",
  "dataset.listCreate",
  "dataset.listsStatus",
  "dataset.listsFilters",
  "dataset.listsIndexPanel",
  "dataset.listsIndexContent",
  "dataset.listsList",
  "dataset.listDetail",
  "dataset.listDialog",
  "dataset.listForm",
]) {
  assert.match(listsJs, new RegExp(escapeRegExp(hook)), `Converted Lists shell should preserve ${hook}`);
}

for (const hook of [
  "listFilterStatus",
  "listFilterType",
  "listFilterReusable",
  "listFilterClient",
  "listFilterProject",
  "listFilterAssignee",
  "listFilterNeeded",
  "listFilterArchive",
  "listSort",
]) {
  assert.match(listsJs, new RegExp(`"${hook}"`), `Converted Lists shell should preserve ${hook}`);
}

assert.match(listsJs, /\/api\/lists\?\$\{buildListQueryParams\(\)\}/, "Lists pilot should preserve list query route");
assert.match(listsJs, /api\.postJson\("\/api\/lists", payload\)/, "Lists pilot should preserve create payload route");
assert.match(listsJs, /api\.putJson\(`\/api\/lists\/\$\{encodeURIComponent\(state\.editingListId\)\}`/, "Lists pilot should preserve update payload route");
assert.match(listsJs, /client_id: usesBusinessScope\(\) \? listClientInput\.value : ""/, "Lists pilot should preserve Personal/Family workspace scope payloads");
assert.match(listsJs, /setBusinessControlsVisible\(usesBusinessScope\(\)\)/, "Lists pilot should preserve Business control visibility");
assert.match(listsJs, /setContextControlsVisible\(usesBusinessScope\(\)\)/, "Lists pilot should preserve context control initialization");
assert.doesNotMatch(listsJs, /document\.createElement\("dialog"\)/, "Converted Lists pilot should use the modal form helper for the list dialog shell");

assert.match(css, /\.view-split-list-detail\s*\{[\s\S]*grid-template-columns/, "Shared CSS should own split list/detail layout");
assert.match(css, /\.view-table-wrap\s*\{[\s\S]*overflow-x:\s*auto/, "Shared CSS should own data table overflow");
assert.match(css, /\.view-detail-action-strip,[\s\S]*\.view-inline-action-row\s*\{[\s\S]*flex-wrap:\s*wrap/, "Shared CSS should own wrapping action rows");

assert.match(viewContract, /As of 0\.33\.5\.15\.6/, "View-building contract should document the current view-builder line");
assert.match(viewContract, /Lists protected workspace now uses `LongtailForge\.view`/, "View-building contract should describe the converted Lists workspace");
assert.match(changelog, /## Version 0\.33\.5\.15\.3 - /, "Changelog should include the Lists pilot version");
assert.match(regressionSuite, /scripts\/lists-view-builder-pilot-regression\.mjs/, "Regression suite should include the Lists pilot regression");

console.log("Lists view-builder pilot regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
