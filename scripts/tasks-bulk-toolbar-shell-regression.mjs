import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.20.3";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const tasksScript = readText("public/js/tasks.js");
const tasksView = readText("views/protected/tasks.html");
const viewBuilder = readText("public/js/shared/view-builder.js");
const styles = readText("public/css/longtail-forge.css");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");

assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current app version");
assert.match(viewBuilder, /function createBulkActionToolbar\(options = \{\}\)[\s\S]*className:\s*\["view-bulk-action-toolbar", "surface-main-panel"/, "Framework should own the bulk action toolbar shell helper");
assert.match(viewBuilder, /data-view-bulk-selection-count/, "Framework bulk toolbar helper should expose a selection-count mount");
assert.match(viewBuilder, /createBulkActionToolbar,/, "Framework bulk toolbar helper should be exported");

const mainChrome = functionBlock(tasksScript, "createTaskMainListChrome");
const bulkChrome = functionBlock(tasksScript, "createTaskBulkToolbarChrome");
const bulkControls = functionBlock(tasksScript, "taskBulkToolbarControls");
const updateBulkControls = functionBlock(tasksScript, "updateBulkControls");
assert(
  tasksScript.indexOf("let state = {") < tasksScript.indexOf("buildTasksViewShell();"),
  "Tasks state should initialize before the descriptor shell renders the bulk toolbar",
);
assert.match(mainChrome, /view\.createListShell\(\{[\s\S]*toolbar:\s*createTaskBulkToolbarChrome\(\)[\s\S]*children:\s*list/, "Bulk toolbar should appear above status and task list through the framework list shell");
assert.match(bulkChrome, /view\.createBulkActionToolbar\(\{[\s\S]*label:\s*"Bulk Actions"[\s\S]*selectedCount:\s*state\.selectedTaskIds\.size[\s\S]*bodyClassName:\s*"task-bulk-grid"[\s\S]*"data-task-bulk-toolbar":\s*""/, "Tasks should pass module-owned bulk controls into the framework shell");
assert.doesNotMatch(bulkChrome, /<details|<summary/, "Tasks should not hand-build the bulk toolbar details or summary shell");
assert.match(bulkControls, /data-task-bulk-status-control[\s\S]*data-task-bulk-priority-control[\s\S]*data-task-bulk-due-date-control[\s\S]*data-task-bulk-due-time-control[\s\S]*data-task-bulk-assignee-control[\s\S]*data-task-bulk-tag-action-control[\s\S]*data-task-bulk-lifecycle-control/, "Tasks should keep existing bulk control fields and lifecycle control");
assert.match(updateBulkControls, /updateBulkToolbarSummary\(selectedCount\)/, "Bulk control updates should refresh the framework summary count");
assert.match(updateBulkControls, /if \(bulkToolbar && selectedCount > 0\) \{[\s\S]*bulkToolbar\.open = true/, "Bulk toolbar should auto-expand when tasks are selected");
assert.doesNotMatch(updateBulkControls, /reloadTaskList|renderTasks/, "Expanding or summarizing the bulk toolbar should not reload or reorder the task list");
assert.match(tasksScript, /function updateBulkToolbarSummary\(selectedCount\)[\s\S]*bulkSelectionCount\.textContent = `\$\{selectedCount\} selected`[\s\S]*bulkSelectionCount\.hidden = selectedCount === 0/, "Tasks should display selected counts only when applicable");

const taskViewChrome = functionBlock(tasksScript, "createTaskViewSelectorChrome");
const filterChrome = functionBlock(tasksScript, "createTaskFilterChrome");
assert.doesNotMatch(taskViewChrome, /data-task-bulk-toolbar|data-task-bulk-status-control/, "Saved Task Views sidebar panel should not contain the bulk toolbar");
assert.doesNotMatch(filterChrome, /data-task-bulk-toolbar|data-task-bulk-status-control/, "Sorting and Filters sidebar panel should not contain the bulk toolbar");

assert.match(tasksView, /css\/longtail-forge\.css\?v=73[\s\S]*js\/shared\/view-builder\.js\?v=16[\s\S]*js\/shared\/view-renderer\.js\?v=13[\s\S]*js\/tasks\.js\?v=21/, "Tasks host should load the bulk toolbar shell cache keys");
assert.match(styles, /\.view-bulk-action-toolbar-summary\s*\{[\s\S]*display:\s*flex[\s\S]*cursor:\s*pointer/, "Shared CSS should own bulk toolbar summary anatomy");
assert.match(styles, /\.view-bulk-action-toolbar-summary::before\s*\{[\s\S]*border-left:\s*6px solid var\(--color-text-secondary\)/, "Shared CSS should show a custom disclosure caret for the bulk toolbar");
assert.match(styles, /\.view-bulk-action-toolbar\[open\] > \.view-bulk-action-toolbar-summary::before\s*\{[\s\S]*transform:\s*rotate\(90deg\)/, "Shared CSS should rotate the bulk toolbar caret when open");
assert.match(styles, /\.view-bulk-action-toolbar-count\s*\{[\s\S]*margin-left:\s*auto[\s\S]*white-space:\s*nowrap/, "Shared CSS should own the selected-count chip placement");
assert.match(styles, /\.task-bulk-grid \.checkbox-line\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*justify-self:\s*center;[\s\S]*white-space:\s*nowrap;/, "Tasks bulk clear controls should center the checkbox and label under their fields");
assert.match(styles, /\.task-bulk-grid \.checkbox-line input\[type="checkbox"\]\s*\{[\s\S]*width:\s*auto;[\s\S]*margin:\s*0;/, "Tasks bulk clear checkboxes should not inherit full-width input styling");
assert.match(regressionSuite, /scripts\/tasks-bulk-toolbar-shell-regression\.mjs/, "Regression suite should include the Tasks bulk toolbar shell regression");

console.log("Tasks bulk toolbar shell regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
