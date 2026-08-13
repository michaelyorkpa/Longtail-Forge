import assert from "node:assert/strict";

import { createProjectTextReader } from "../../test-support/source-scan.mjs";
// Consolidated under lists.current-static-contracts by 0.33.33.10.
const { readText } = createProjectTextReader();

const html = readText("views/protected/lists.html");
const listsModule = readText("src/modules/lists/module.js");
const listsJs = readText("public/js/lists.js");
const builder = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
const changelog = readText("CHANGELOG.md");

assert.match(html, /<main class="wide-page lists-page" data-lists-host><\/main>/, "Lists protected view should remain a minimal host");
assert.match(html, /js\/shared\/view-builder\.js[\s\S]*js\/shared\/view-renderer\.js[\s\S]*js\/lists\.js/, "Lists should load the renderer between the view builder and module script");
assert.doesNotMatch(html, /data-list-filter-status|data-lists-list|data-list-detail|data-list-dialog/, "Lists HTML should not reintroduce protected workspace anatomy");

assert.match(listsModule, /viewSurfaces:\s*\[/, "Lists manifest should declare a viewSurfaces descriptor");
assert.match(listsModule, /id:\s*"lists\.workspace"/, "Lists descriptor should use a stable surface id");
assert.match(listsModule, /layout:\s*"slide-out-sidebar"/, "Lists descriptor should use the framework slide-out sidebar layout");
assert.match(listsModule, /sidebarPanels:\s*\[[\s\S]*id:\s*"lists-filters"[\s\S]*type:\s*"filters"[\s\S]*title:\s*"Filters"[\s\S]*open:\s*false[\s\S]*className:\s*"lists-filters-panel"[\s\S]*id:\s*"lists-index"[\s\S]*type:\s*"index"[\s\S]*title:\s*"List Selector"/, "Lists descriptor should host filters and the selector in the sidebar drawer");
assert.match(listsModule, /field:\s*"status"[\s\S]*field:\s*"listType"[\s\S]*field:\s*"reusable"[\s\S]*field:\s*"clientId"[\s\S]*field:\s*"projectId"[\s\S]*field:\s*"assigneeId"[\s\S]*field:\s*"neededByDate"[\s\S]*field:\s*"archiveState"[\s\S]*field:\s*"sort"/, "Lists descriptor should declare the read-path filters");
assert.match(listsModule, /indexPanel:\s*\{[\s\S]*title:\s*"List Selector"[\s\S]*initialSelection:\s*"none"[\s\S]*collapseOnSelect:\s*true/, "Lists descriptor should declare the selector title and selection behavior");
assert.match(listsModule, /summaryPanels:\s*\[[\s\S]*title:\s*"List Details"[\s\S]*title:\s*"Next"[\s\S]*title:\s*"Source"[\s\S]*title:\s*"Costs"/, "Lists descriptor should declare the List Details, Next, Source, and Costs read-only detail panels");
assert.doesNotMatch(summaryPanelsBlock(listsModule), /title:\s*"Linked Records"/, "Lists descriptor should not keep a separate Linked Records summary panel");
assert.match(listsModule, /dataSource:\s*\{[\s\S]*route:\s*"\/api\/lists"[\s\S]*fieldBindings:/, "Lists descriptor should keep the canonical list read route");

assert.match(listsJs, /view\.renderSurface\(renderDescriptor, host\)/, "Lists browser script should ask the framework renderer to fill the host");
assert.match(listsJs, /listsViewSurfaceDescriptor\(\)/, "Lists browser script should resolve the delivered descriptor");
assert.match(listsJs, /workspaceContext\?\.viewSurfaces/, "Lists browser script should prefer app-shell delivered descriptors");
assert.match(listsJs, /fallbackListsViewSurfaceDescriptor/, "Lists browser script should keep a startup fallback while app-shell context loads");
assert.match(listsJs, /decorateListsDeclarativeSurface/, "Lists browser script should decorate generic descriptor anatomy with legacy hooks");
assert.match(listsJs, /data-view-sidebar-panel=\"lists-filters\"/, "Lists browser decoration should resolve the filter panel from the drawer");
assert.match(listsJs, /data-view-sidebar-panel=\"lists-index\"/, "Lists browser decoration should resolve the selector panel from the drawer");
assert.match(listsJs, /\.view-slideout-sidebar-main/, "Lists browser decoration should resolve the full-width drawer main region");
assert.match(listsJs, /dataSource:\s*null/, "Lists should not let the generic renderer replace the existing Lists read workflow in this slice");
assert.match(listsJs, /summaryTitle\.textContent = listSelectorTitle\(descriptor\)/, "Lists selector heading should come from the descriptor title");
assert.match(listsJs, /activeListsViewDescriptor\?\.indexPanel\?\.collapseOnSelect/, "Lists selector collapse policy should come from the descriptor");
assert.doesNotMatch(listsJs, /selectList\(lists\[0\]\.list_id/, "Lists should not auto-select the first list on initial render");
assert.match(listsJs, /\/api\/lists\?\$\{buildListQueryParams\(\)\}/, "Lists query route should stay module-owned");
assert.match(listsJs, /api\.postJson\("\/api\/lists", payload\)/, "Lists create route should stay module-owned");
assert.match(listsJs, /api\.putJson\(`\/api\/lists\/\$\{encodeURIComponent\(state\.editingListId\)\}`/, "Lists update route should stay module-owned");
assert.match(listsJs, /createItemDialogShell\(/, "Lists item add/edit form is a framework-rendered modal");
assert.match(listsJs, /createListDetailsPanel\(list\)/, "Lists detail should render a collapsible List Details panel");
assert.match(listsJs, /view\.createLinkedContextList\(/, "Lists detail should render linked records through the shared read-only linked-context list");
assert.doesNotMatch(functionBlock(listsJs, "renderDetail"), /createLinkedRecordsPanel\(/, "Lists detail should no longer host the inline linked-record add/remove panel");
assert.match(listsJs, /createListDialogShell\(/, "Lists modal shell should remain imperative until the modal slice");

assert.match(renderer, /function renderFieldShell\(field, view, options = \{\}\)[\s\S]*return view\.createField\(field, options\)/, "Renderer should route descriptor fields through the shared field factory");
assert.match(builder, /options\.fieldType === "select" \|\| options\.fieldType === "multi-select"/, "Shared field factory should support descriptor select filters");
assert.match(renderer, /data-view-input/, "Renderer should expose stable generic field input hooks");

assert.match(changelog, /## Version 0\.33\.5\.16\.9 - /, "Changelog should include Lists declarative proof version");

console.log("Lists declarative read-only surface regression passed.");

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

function summaryPanelsBlock(source) {
  const start = source.indexOf("summaryPanels:");
  assert.notEqual(start, -1, "summaryPanels should exist");
  const next = source.indexOf("\n        emptyState:", start);
  assert.notEqual(next, -1, "emptyState should follow summaryPanels");
  return source.slice(start, next);
}
