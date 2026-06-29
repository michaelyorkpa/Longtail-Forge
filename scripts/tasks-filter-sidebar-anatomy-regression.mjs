import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.14.2";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const tasksScript = readText("public/js/tasks.js");
const tasksView = readText("views/protected/tasks.html");
const styles = readText("public/css/longtail-forge.css");
const regressionSuite = readText("scripts/regression-suite.mjs");
const rendererShellRegression = readText("scripts/view-renderer-shell-regression.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");

const sidebarPanels = sourceSlice(tasksModule, "sidebarPanels: [", "      ],");
assert.match(sidebarPanels, /id:\s*"tasks-view-selector"[\s\S]*title:\s*"Saved Task Views"[\s\S]*behavior:\s*"tasks\.sidebar\.view-selector"[\s\S]*collapsible:\s*false/, "Tasks descriptor should put a non-collapsible Saved Task Views selector first");
assert.match(sidebarPanels, /id:\s*"tasks-filters"[\s\S]*title:\s*"Sorting and Filters"[\s\S]*behavior:\s*"tasks\.sidebar\.filters"[\s\S]*open:\s*false/, "Tasks descriptor should put collapsed Sorting and Filters after the view selector");
assert.ok(
  sidebarPanels.indexOf('id: "tasks-view-selector"') < sidebarPanels.indexOf('id: "tasks-filters"'),
  "Saved Task Views selector should render before Sorting and Filters",
);

assert.match(tasksScript, /const DEFAULT_TASK_VIEW = "my"/, "Tasks browser state should default to My Tasks");
assert.match(tasksScript, /const TASK_VIEW_VALUES = new Set\(\["all", \.\.\.QUICK_FILTERS\]\)/, "Tasks browser should recognize the selector values");
assert.match(tasksScript, /taskViewSelector\?\.addEventListener\("change", handleTaskViewChange\)/, "Saved Task Views dropdown should drive Tasks-owned filter state");
assert.match(tasksScript, /state\.quickFilter = selectedView/, "Saved Task Views dropdown should keep the selected view in Tasks-owned state");
assert.match(tasksScript, /params\.set\("task_view", canonicalTaskViewValue\(taskView\)\)/, "Saved Task Views dropdown should use the Tasks-owned task_view query contract");
assert.match(tasksScript, /if \(Object\.hasOwn\(saved, "quickFilter"\)\)/, "Saved explicit task view state should be preserved");
assert.match(tasksScript, /state\.quickFilter = DEFAULT_TASK_VIEW/, "Missing or invalid saved state should fall back to My Tasks");
assert.doesNotMatch(tasksScript, /handleFilterDetailsToggle|data-task-quick-filter|task-quick-filters/, "Tasks sidebar should not keep the old quick-filter button row or clear the view when filters open");

const taskViewChrome = functionBlock(tasksScript, "createTaskViewSelectorChrome");
const filterChrome = functionBlock(tasksScript, "createTaskFilterChrome");
assert.match(
  taskViewChrome,
  /"data-task-view-selector"[\s\S]*"aria-label": "Saved Task Views"[\s\S]*\["my", "My Tasks", true\],\s*\["all", "All"\],\s*\["unassigned", "Unassigned"\],\s*\["overdue", "Overdue"\],\s*\["today", "Due Today"\],\s*\["week", "Due This Week"\],\s*\["complete", "Completed"\],\s*\["archived", "Archived"\]/,
  "Saved Task Views selector should expose the expected options in order with My Tasks selected",
);
assert.doesNotMatch(taskViewChrome, /<details|<button|<label|>\s*Task View\s*<|data-task-list/, "Saved Task Views selector panel should not be collapsible, button-based, repeat a visible label, or list-owning");
assert.match(filterChrome, /data-task-filter-details/, "Sorting and Filters panel should own the detailed filter fields");
assert.match(filterChrome, /"data-task-sort"[\s\S]*"data-task-status-filter"[\s\S]*"data-task-assignee-filter"[\s\S]*"data-task-client-filter"[\s\S]*"data-client-workspace-control"[\s\S]*"data-task-project-filter"[\s\S]*"data-task-tag-filter"/, "Detailed filter panel should preserve existing sort, status, assignee, client, project, and tag controls");
assert.doesNotMatch(filterChrome, /data-task-view-selector|data-task-list|data-task-bulk-toolbar/, "Sorting and Filters panel should not contain the view selector, task list, or bulk toolbar");

assert.match(tasksScript, /function usesClientScope\(\)[\s\S]*state\.options\.workspaceType === "business"/, "Client filter visibility should remain Business-workspace-only");
assert.match(tasksScript, /setClientScopeControlsVisible\(hasClientScope\)/, "Tasks filter population should keep client controls scoped by workspace type");
assert.match(tasksScript, /document\.querySelectorAll\("\[data-client-workspace-control\]"\)/, "Client filter visibility should use the shared data hook across generated controls");

assert.match(tasksView, /css\/longtail-forge\.css\?v=72[\s\S]*js\/tasks\.js\?v=20/, "Tasks host should load the current sidebar anatomy cache keys");
assert.match(styles, /\.task-view-selector-control\s*\{[\s\S]*display:\s*grid/, "Saved Task Views selector should have a stable drawer layout");
assert.match(styles, /\.view-slideout-sidebar-drawer \.task-page-toolbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/, "Sorting and Filters controls should stay one-column in the drawer");
assert.match(styles, /\.view-slideout-sidebar-drawer \.tasks-filters-panel \.view-collapsible-index-body\s*\{[\s\S]*max-height:\s*none;[\s\S]*overflow-y:\s*visible/, "Sorting and Filters panel should expand inside the drawer instead of forcing a small internal scroll pane");

assert.match(rendererShellRegression, /Trigger click should open the slide-out drawer/, "Shared renderer regression should cover slide-out trigger open behavior");
assert.match(rendererShellRegression, /Backdrop click should close the drawer/, "Shared renderer regression should cover slide-out backdrop close behavior");
assert.match(rendererShellRegression, /Escape should close the drawer/, "Shared renderer regression should cover slide-out Escape close behavior");
assert.match(regressionSuite, /scripts\/tasks-filter-sidebar-anatomy-regression\.mjs/, "Regression suite should include the Tasks filter sidebar anatomy regression");

console.log("Tasks filter sidebar anatomy regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}

function sourceSlice(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.notEqual(start, -1, `Missing source start: ${startText}`);
  const end = source.indexOf(endText, start + startText.length);
  assert.notEqual(end, -1, `Missing source end after: ${startText}`);
  return source.slice(start, end + endText.length);
}
