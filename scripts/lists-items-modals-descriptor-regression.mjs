import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const listsModule = readText("src/modules/lists/module.js");
const listsJs = readText("public/js/lists.js");
const stylesheet = readText("public/css/longtail-forge.css");
const manifestContract = readText("src/core/modules/manifest-contract.js");
const renderer = readText("public/js/shared/view-renderer.js");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, "0.33.5.18.12.4", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.18.12.4", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.18.12.4", "package-lock package entry should report the current app version");

assert.match(listsModule, /version:\s*"0\.33\.5\.16\.12"/, "Lists module should report the current declarative closeout version");
assert.match(listsModule, /itemForm:\s*\{[\s\S]*field:\s*"item_name"[\s\S]*behavior:\s*"lists\.catalog-suggestions"[\s\S]*field:\s*"save_to_catalog"/, "Lists descriptor should declare item entry fields and catalog behavior hook");
assert.match(listsModule, /itemRows:\s*\{[\s\S]*columns:\s*\[[\s\S]*id:\s*"done"[\s\S]*id:\s*"actions"[\s\S]*actions:\s*\[[\s\S]*id:\s*"edit-item"[\s\S]*id:\s*"delete-item"/, "Lists descriptor should declare item row columns and action placement");
assert.match(listsModule, /modals:\s*\[[\s\S]*id:\s*"list-editor"[\s\S]*field:\s*"title"[\s\S]*field:\s*"description"[\s\S]*footerActions:\s*\[[\s\S]*id:\s*"cancel-list"[\s\S]*id:\s*"save-list"/, "Lists descriptor should declare the create/edit list modal shell");

assert.match(manifestContract, /VIEW_FIELD_FIELDS = new Set\(\[[\s\S]*"placement"[\s\S]*"behavior"[\s\S]*"hidden"/, "Manifest contract should allow descriptor field behavior metadata");
assert.match(manifestContract, /function validateItemFormDescriptor/, "Manifest contract should validate item form descriptors");
assert.match(manifestContract, /function validateItemRowsDescriptor/, "Manifest contract should validate item row descriptors");
assert.match(manifestContract, /detail\.itemForm\.actions/, "Reference validation should include item form actions");
assert.match(manifestContract, /detail\.itemRows\.actions/, "Reference validation should include item row actions");
assert.match(renderer, /min:\s*field\.min[\s\S]*step:\s*field\.step[\s\S]*rows:\s*field\.rows/, "Renderer should preserve basic descriptor field attributes");

assert.match(listsJs, /function listsItemFormDescriptor\(\)/, "Lists browser fallback should declare the item form descriptor");
assert.match(listsJs, /function listsItemRowsDescriptor\(\)/, "Lists browser fallback should declare the item rows descriptor");
assert.match(listsJs, /function listsModalDescriptor\(\)/, "Lists browser fallback should declare the list modal descriptor");
assert.match(listsJs, /listsItemFormSurfaceDescriptor\(\)/, "Lists item form should consume the descriptor block");
assert.match(listsJs, /createItemFieldFromDescriptor/, "Lists item fields should be bound from descriptor fields");
assert.match(listsJs, /listsItemRowsSurfaceDescriptor\(\)\.actions\.map/, "Lists item row actions should be placed from descriptor actions");
assert.match(listsJs, /listsEditorModalDescriptor\(\)/, "Lists modal shell should consume the descriptor modal block");
assert.match(listsJs, /api\.postJson\(`\/api\/lists\/\$\{encodeURIComponent\(listId\)\}\/items`/, "Lists item create route should remain module-owned");
assert.match(listsJs, /api\.putJson\(`\/api\/lists\/\$\{encodeURIComponent\(listId\)\}\/items\/\$\{encodeURIComponent\(editingItemId\)\}`/, "Lists item edit route should remain module-owned");
assert.match(listsJs, /api\.postJson\(`\/api\/lists\/\$\{encodeURIComponent\(list\.list_id\)\}\/items\/reorder`/, "Lists item reorder route should remain module-owned");
assert.match(listsJs, /\/api\/lists\/item-suggestions/, "Lists catalog suggestions should remain module-owned");

assert.match(stylesheet, /\.surface-main-panel\s*\{[\s\S]*box-sizing:\s*border-box;[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/, "Shared surface panels should not let nested content set a wider intrinsic width");
assert.match(stylesheet, /\.lists-detail-content\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/, "Lists detail content should stay contained inside the framework detail panel");
assert.match(stylesheet, /\.lists-item-entry\s*\{[\s\S]*box-sizing:\s*border-box;[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/, "Lists item entry should not overflow the detail panel");
assert.match(stylesheet, /\.lists-items\s*\{[\s\S]*box-sizing:\s*border-box;[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/, "Lists items wrapper should cap table overflow inside the detail panel");
assert.match(stylesheet, /\.lists-items-table\s*\{[\s\S]*width:\s*auto;[\s\S]*min-width:\s*0;[\s\S]*table-layout:\s*auto;[\s\S]*\}/, "Lists item table should be content-sized (auto layout, not stretched) so columns pack together");
assert.doesNotMatch(stylesheet, /\.lists-items-table\s*\{[\s\S]*min-width:\s*(680|760)px/, "Lists item table should not reintroduce the old fixed minimum width");

assert.match(changelog, /## Version 0\.33\.5\.16\.10 - /, "Changelog should include the Lists item/modal descriptor version");
assert.match(regressionSuite, /scripts\/lists-items-modals-descriptor-regression\.mjs/, "Regression suite should include Lists item/modal descriptor regression");

console.log("Lists items and modals descriptor regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
