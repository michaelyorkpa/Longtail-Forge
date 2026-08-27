import assert from "node:assert/strict";

import { createProjectTextReader, extractFunctionSpan } from "../../test-support/source-scan.mjs";
// Consolidated under tasks.current-static-contracts by 0.33.33.10.
const { readText } = createProjectTextReader();

const tasksModule = readText("src/modules/tasks/module.js");
const tasksView = readText("views/protected/tasks.html");
const tasksScript = readText("public/js/tasks.js");
const styles = readText("public/css/longtail-forge.css");
const declarativeGuide = readText("docs/declarative-view-surfaces.md");

assert.match(tasksModule, /version:\s*appVersion/, "Tasks module should report the current app version");
assert.match(tasksModule, /viewSurfaces:\s*\[/, "Tasks module should declare viewSurfaces");
assert.match(tasksModule, /id:\s*"tasks\.workspace"[\s\S]*moduleId:\s*"tasks"[\s\S]*viewId:\s*"tasks"/, "Tasks descriptor should bind to the protected Tasks view");
assert.match(tasksModule, /layout:\s*"slide-out-sidebar"/, "Tasks descriptor should use the slide-out sidebar layout");
assert.match(tasksModule, /sidebarPanels:\s*\[[\s\S]*id:\s*"tasks-view-selector"[\s\S]*title:\s*"Saved Task Views"[\s\S]*behavior:\s*"tasks\.sidebar\.view-selector"[\s\S]*collapsible:\s*false[\s\S]*id:\s*"tasks-filters"[\s\S]*title:\s*"Sorting and Filters"[\s\S]*behavior:\s*"tasks\.sidebar\.filters"[\s\S]*open:\s*false/, "Tasks descriptor should reserve ordered sidebar panels for the saved task views selector and collapsed filters");
assert.match(tasksModule, /detail:\s*\{[\s\S]*regions:\s*\[[\s\S]*id:\s*"tasks-main-list"[\s\S]*behavior:\s*"tasks\.main\.list"[\s\S]*className:\s*"tasks-main-list-region"/, "Tasks descriptor should reserve a detail region for the main task list");
assert.match(tasksModule, /dataSource:\s*\{[\s\S]*route:\s*"\/api\/tasks"[\s\S]*method:\s*"GET"/, "Tasks descriptor should point at the existing Tasks read route");
assert.match(tasksModule, /primaryAction:\s*\{[\s\S]*behavior:\s*"tasks\.create"[\s\S]*requiredPermissions:\s*\["tasks\.create"\]/, "Tasks descriptor should keep create permission intent on the header action");

assert.match(tasksView, /<main class="wide-page tasks-page" data-tasks-host><\/main>/, "Tasks protected view should be reduced to a minimal host");
assert.match(tasksView, /css\/longtail-forge\.css/, "Tasks protected view should load the current stylesheet cache key");
assert.match(tasksView, /js\/shared\/view-builder\.js[\s\S]*js\/shared\/view-renderer\.js[\s\S]*js\/task-dialog\.js[\s\S]*js\/tasks\.js/, "Tasks protected view should load the renderer before the module adapter");
assertNoProtectedAnatomy(tasksView, "views/protected/tasks.html");

assert.match(tasksScript, /buildTasksViewShell\(\);[\s\S]*tasksDialog\?\.configure\?\.\(\)/, "Tasks adapter should build the descriptor shell before querying task hooks");
assert.match(tasksScript, /view\.renderSurface\(\{ \.\.\.activeTasksViewDescriptor, dataSource: null, modals: \[\] \}, host\)/, "Tasks adapter should render the descriptor shell without converting read data or modal internals yet");
assert.match(tasksScript, /workspaceContext\?\.viewSurfaces/, "Tasks adapter should prefer bootstrapped descriptor data");
// 0.33.33.35.1.2 deleted the module-local descriptor fallbacks. The server surface is the
// only source now, so this owner asserts the absence of a local copy rather than its presence,
// and the descriptor's shape is owned where it is declared - in the module/framework source.
assert.doesNotMatch(
  tasksScript,
  /function fallback\w*ViewSurfaceDescriptor\(|LinkedRecordsFallbackDescriptor\(/,
  "Tasks must not reintroduce a local descriptor fallback",
);
assert.match(
  tasksScript,
  /surface\.id === "tasks.workspace"[^\n]*\|\| null;/,
  "Tasks should resolve to null when the server did not deliver its surface",
);
assert.match(tasksScript, /view\.registerBehavior\("tasks\.create"/, "Tasks adapter should register the create action behavior");
assert.match(tasksScript, /view\.registerBehavior\("tasks\.sidebar\.view-selector"/, "Tasks adapter should register the task view selector behavior");
assert.match(tasksScript, /view\.registerBehavior\("tasks\.sidebar\.filters"/, "Tasks adapter should register the sidebar filter behavior");
assert.match(tasksScript, /view\.registerBehavior\("tasks\.main\.list"[\s\S]*container\.replaceChildren\(createTaskMainListChrome\(\)\)/, "Tasks adapter should mount the task list through a descriptor detail-region behavior");
assert.match(tasksScript, /const main = surface\.querySelector\("\.view-slideout-sidebar-main"\)/, "Tasks adapter should target the slide-out main panel for the task list");
assert.doesNotMatch(tasksScript, /main\.replaceChildren\(createTaskMainListChrome\(\)\)/, "Tasks adapter should not replace the framework-owned main panel");

const filterChrome = extractFunctionSpan(tasksScript, "createTaskFilterChrome");
const taskViewChrome = extractFunctionSpan(tasksScript, "createTaskViewSelectorChrome");
const mainChrome = extractFunctionSpan(tasksScript, "createTaskMainListChrome");
const bulkChrome = extractFunctionSpan(tasksScript, "createTaskBulkToolbarChrome");
assert.match(taskViewChrome, /data-task-view-selector/, "Tasks sidebar should expose a task view selector");
assert.doesNotMatch(taskViewChrome, /<button|<details|<label|>\s*Task View\s*<|data-task-list/, "Tasks view selector panel should not render button filters, collapsible sections, repeated visible labels, or task lists");
assert.match(filterChrome, /data-task-filter-details/, "Tasks sidebar should keep the sorting/filter controls");
assert.doesNotMatch(filterChrome, /data-task-list|data-task-bulk-toolbar|Task Details<\/th>/, "Tasks sidebar filter chrome must not contain the task list or bulk toolbar");
assert.match(mainChrome, /data-task-main-list-surface/, "Tasks main panel should own the task list surface");
assert.match(bulkChrome, /data-task-bulk-toolbar/, "Tasks bulk toolbar should remain in the main panel for now");
assert.match(mainChrome, /view\.createListShell\(\{[\s\S]*children:\s*list/, "Tasks main panel should mount the task list through the framework list shell");
assert.match(mainChrome, /view\.createElement\("tbody"[\s\S]*"data-task-list":\s*""/, "Tasks task list should remain in the main panel");

assert.match(styles, /\.view-slideout-sidebar-drawer \.task-page-toolbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/, "Tasks drawer filters should collapse to one column");
assert.match(styles, /\.task-view-selector-control select\s*\{[\s\S]*width:\s*100%/, "Tasks task view selector should fill the drawer panel");
assert.match(styles, /\.view-slideout-sidebar-drawer \.tasks-filters-panel \.view-collapsible-index-body\s*\{[\s\S]*max-height:\s*none;[\s\S]*overflow-y:\s*visible/, "Tasks drawer filters should expand without a nested scroll pane where possible");
assert.match(styles, /\.view-list-shell\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*0/, "Framework list shell should not add whitespace between Bulk Actions and the task list");
assert.match(styles, /\.view-list-shell-status:empty\s*\{[\s\S]*display:\s*none/, "Empty list status text should not create a gap between Bulk Actions and the task list");
assert.match(styles, /\.view-slideout-sidebar-main > \.tasks-main-list-region\s*\{[\s\S]*border:\s*0;[\s\S]*padding:\s*0;[\s\S]*background:\s*transparent/, "Tasks list region wrapper should not add a visible redesign layer");

assert.match(declarativeGuide, /\| Tasks \| tasks \| tasks\.html \| tasks\.workspace \| strict \|/, "Declarative guide should inventory Tasks as a strict descriptor surface");


// 0.33.33.35.1.1 - the view shell waits for the workspace context.
//
// The shell is built from a server-delivered descriptor. The synchronous workspace context is
// hydrated from localStorage, so it is legitimately empty on a first visit, in a private
// window, after cleared site data, or straight after a logout; the protected view ships only
// an empty host; and nothing re-renders when the context arrives. Building the shell before
// the context therefore renders whatever the local fallback says rather than what the server
// delivered. 0.33.33.35.1.2 removes those fallbacks and depends on this ordering holding.
assert.match(
  tasksScript,
  /async function initializeTasksPage\(\)[\s\S]*await window\.LongtailForge\?\.workspaceContextReady[\s\S]*buildTasksViewShell\(\)[\s\S]*cacheTasksElements\(\)[\s\S]*bindTasksEvents\(\)/,
  "Tasks should await the workspace context before building the shell and caching the DOM it creates",
);
assert.doesNotMatch(
  tasksScript,
  /^  buildTasksViewShell\(\);$/m,
  "Tasks must not build the workspace shell outside the context-aware bootstrap",
);

console.log("Tasks declarative read-only surface regression passed.");

/**
 * Assert one view ships no protected-view anatomy outside its descriptor host.
 * @param {string} html view text from the shared project text reader
 * @param {string} label the view name shown on failure
 */
function assertNoProtectedAnatomy(html, label) {
  const body = html.slice(html.indexOf("<body"), html.indexOf("</body>"));
  assert.doesNotMatch(body, /<(section|form|table|dialog|details|button|h1|h2|ul|ol)\b/i, `${label} should not ship protected view anatomy outside the descriptor host`);
  assert.doesNotMatch(body, /\b(data-task-list|data-task-dialog|data-task-quick-filter|data-task-bulk-toolbar|data-task-status-filter)\b/, `${label} should not ship Tasks workspace hooks outside the host`);
}
