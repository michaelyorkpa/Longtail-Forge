import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readText("views/protected/lists.html");
const listsModule = readText("src/modules/lists/module.js");
const listsJs = readText("public/js/lists.js");
const renderer = readText("public/js/shared/view-renderer.js");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));

assert.equal(packageJson.version, "0.33.5.21.0.5", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.21.0.5", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.21.0.5", "package-lock package entry should report the current app version");

assert.match(html, /<main class="wide-page lists-page" data-lists-host><\/main>/, "Lists protected view should remain a minimal host");
assert.match(html, /js\/shared\/view-builder\.js\?v=5[\s\S]*js\/shared\/view-renderer\.js\?v=6[\s\S]*js\/lists\.js\?v=13/, "Lists should load the renderer between the view builder and module script");
assert.doesNotMatch(html, /data-list-filter-status|data-lists-list|data-list-detail|data-list-dialog/, "Lists HTML should not reintroduce protected workspace anatomy");

assert.match(listsModule, /viewSurfaces:\s*\[/, "Lists manifest should declare a viewSurfaces descriptor");
assert.match(listsModule, /id:\s*"lists\.workspace"/, "Lists descriptor should use a stable surface id");
assert.match(listsModule, /layout:\s*"stacked"/, "Lists descriptor should own the stacked layout");
assert.match(listsModule, /field:\s*"status"[\s\S]*field:\s*"listType"[\s\S]*field:\s*"reusable"[\s\S]*field:\s*"clientId"[\s\S]*field:\s*"projectId"[\s\S]*field:\s*"assigneeId"[\s\S]*field:\s*"neededByDate"[\s\S]*field:\s*"archiveState"[\s\S]*field:\s*"sort"/, "Lists descriptor should declare the read-path filters");
assert.match(listsModule, /indexPanel:\s*\{[\s\S]*title:\s*"List Selector"[\s\S]*initialSelection:\s*"none"[\s\S]*collapseOnSelect:\s*true/, "Lists descriptor should declare the selector title and selection behavior");
assert.match(listsModule, /summaryPanels:\s*\[[\s\S]*title:\s*"Next"[\s\S]*title:\s*"Source"[\s\S]*title:\s*"Costs"[\s\S]*title:\s*"Linked Records"/, "Lists descriptor should declare read-only detail summary panels");
assert.match(listsModule, /dataSource:\s*\{[\s\S]*route:\s*"\/api\/lists"[\s\S]*fieldBindings:/, "Lists descriptor should keep the canonical list read route");

assert.match(listsJs, /view\.renderSurface\(renderDescriptor, host\)/, "Lists browser script should ask the framework renderer to fill the host");
assert.match(listsJs, /listsViewSurfaceDescriptor\(\)/, "Lists browser script should resolve the delivered descriptor");
assert.match(listsJs, /workspaceContext\?\.viewSurfaces/, "Lists browser script should prefer app-shell delivered descriptors");
assert.match(listsJs, /fallbackListsViewSurfaceDescriptor/, "Lists browser script should keep a startup fallback while app-shell context loads");
assert.match(listsJs, /decorateListsDeclarativeSurface/, "Lists browser script should decorate generic descriptor anatomy with legacy hooks");
assert.match(listsJs, /dataSource:\s*null/, "Lists should not let the generic renderer replace the existing Lists read workflow in this slice");
assert.match(listsJs, /summaryTitle\.textContent = listSelectorTitle\(descriptor\)/, "Lists selector heading should come from the descriptor title");
assert.match(listsJs, /activeListsViewDescriptor\?\.indexPanel\?\.collapseOnSelect/, "Lists selector collapse policy should come from the descriptor");
assert.doesNotMatch(listsJs, /selectList\(lists\[0\]\.list_id/, "Lists should not auto-select the first list on initial render");
assert.match(listsJs, /\/api\/lists\?\$\{buildListQueryParams\(\)\}/, "Lists query route should stay module-owned");
assert.match(listsJs, /api\.postJson\("\/api\/lists", payload\)/, "Lists create route should stay module-owned");
assert.match(listsJs, /api\.putJson\(`\/api\/lists\/\$\{encodeURIComponent\(state\.editingListId\)\}`/, "Lists update route should stay module-owned");
assert.match(listsJs, /createItemDialogShell\(/, "Lists item add/edit form is a framework-rendered modal");
assert.match(listsJs, /createLinkedRecordsPanel\(/, "Lists linked records management should remain in the module script for this slice");
assert.match(listsJs, /createListDialogShell\(/, "Lists modal shell should remain imperative until the modal slice");

assert.match(renderer, /function createFieldControl\(field, view, options = \{\}\)/, "Renderer should support descriptor field controls");
assert.match(renderer, /field\.type === "select"/, "Renderer should support descriptor select filters");
assert.match(renderer, /data-view-input/, "Renderer should expose stable generic field input hooks");

assert.match(changelog, /## Version 0\.33\.5\.16\.9 - /, "Changelog should include Lists declarative proof version");
assert.match(regressionSuite, /scripts\/lists-declarative-readonly-surface-regression\.mjs/, "Regression suite should include Lists declarative proof regression");

console.log("Lists declarative read-only surface regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
