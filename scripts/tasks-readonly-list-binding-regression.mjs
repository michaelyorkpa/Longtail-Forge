import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.14.2";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const tasksScript = readText("public/js/tasks.js");
const tasksView = readText("views/protected/tasks.html");
const renderer = readText("public/js/shared/view-renderer.js");
const styles = readText("public/css/longtail-forge.css");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");

assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current app version");
assert.match(tasksModule, /detail:\s*\{[\s\S]*regions:\s*\[[\s\S]*id:\s*"tasks-main-list"[\s\S]*behavior:\s*"tasks\.main\.list"[\s\S]*className:\s*"tasks-main-list-region"[\s\S]*ariaLabel:\s*"Task list"/, "Tasks descriptor should bind the task list to a labeled main-panel detail region");
assert.match(tasksModule, /sidebarPanels:\s*\[[\s\S]*id:\s*"tasks-view-selector"[\s\S]*id:\s*"tasks-filters"/, "Tasks descriptor should keep list controls in ordered sidebar panels");

assert.match(tasksScript, /view\.registerBehavior\("tasks\.main\.list"[\s\S]*container\.replaceChildren\(createTaskMainListChrome\(\)\)/, "Tasks adapter should mount the current list chrome through the descriptor region");
assert.doesNotMatch(tasksScript, /main\.replaceChildren\(createTaskMainListChrome\(\)\)/, "Tasks adapter should not replace the framework-owned main panel");
assert.match(tasksScript, /main\.classList\.add\("tasks-main-list-panel"\)[\s\S]*main\.dataset\.tasksMainPanel = ""/, "Tasks adapter may keep compatibility hooks on the framework main panel");

const registerBehaviors = functionBlock(tasksScript, "registerTasksViewBehaviors");
assert.match(registerBehaviors, /tasks\.sidebar\.view-selector[\s\S]*createTaskViewSelectorChrome/, "Saved Task Views should mount in the sidebar");
assert.match(registerBehaviors, /tasks\.sidebar\.filters[\s\S]*createTaskFilterChrome/, "Sorting and Filters should mount in the sidebar");
assert.match(registerBehaviors, /tasks\.main\.list[\s\S]*createTaskMainListChrome/, "Task list chrome should mount in the main detail region");

const taskViewChrome = functionBlock(tasksScript, "createTaskViewSelectorChrome");
const filterChrome = functionBlock(tasksScript, "createTaskFilterChrome");
const mainChrome = functionBlock(tasksScript, "createTaskMainListChrome");
assert.doesNotMatch(taskViewChrome, /data-task-list|task-density-row|data-task-bulk-toolbar/, "Saved Task Views sidebar chrome should not contain list rows or bulk actions");
assert.doesNotMatch(filterChrome, /data-task-list|task-density-row|data-task-bulk-toolbar|Task Details<\/th>/, "Sorting and Filters sidebar chrome should not contain list rows or bulk actions");
assert.match(mainChrome, /view\.createListShell\(\{[\s\S]*className:\s*"tasks-main-list-surface"[\s\S]*toolbar:\s*createTaskBulkToolbarChrome\(\)[\s\S]*statusAttrs:\s*\{\s*"data-task-status":\s*""\s*\}[\s\S]*children:\s*list/, "Main list chrome should use the framework list shell and place the bulk toolbar before the task table");
assert.match(mainChrome, /view\.createElement\("tbody"[\s\S]*"data-task-list":\s*""/, "Main list chrome should keep the module-owned task row mount");
assert.match(mainChrome, /className:\s*\["view-table-wrap", "list-table-wrap"\]/, "Main list chrome should reuse the shared table overflow wrapper while preserving list-table compatibility styling");
assert.match(tasksScript, /function createTaskBulkToolbarChrome\(\)[\s\S]*view\.createBulkActionToolbar\([\s\S]*data-task-bulk-toolbar/, "Tasks bulk toolbar should mount through the framework bulk toolbar shell");

const renderTasks = functionBlock(tasksScript, "renderTasks");
assert.match(renderTasks, /taskList\.replaceChildren\(\)/, "Existing list rows should still render into the task list body");
assert.match(renderTasks, /tasks\.forEach\(\(task\) => taskList\.append\(\.\.\.createTaskRow\(task\)\)\)/, "Task rows should still come from the Tasks-owned row builder");

const createTaskRow = functionBlock(tasksScript, "createTaskRow");
assert.match(createTaskRow, /row\.classList\.add\("task-density-row"\)/, "Task rows should keep the dense row class");
assert.match(createTaskRow, /appendTaskMetadata\(metaBand, task\)/, "Task rows should keep due date, status, priority, scope, and assignee metadata");
assert.match(createTaskRow, /contentCell\.colSpan = 6/, "Task rows should keep the current table density");

const createActions = functionBlock(tasksScript, "createActions");
assert.match(createActions, /actionButton\("Edit"[\s\S]*actionButton\("Duplicate"[\s\S]*actionButton\("Copy Link"[\s\S]*actionButton\("Follow Notifications"[\s\S]*createTaskLifecycleActionStrip\(task\)/, "Existing row utility actions should still appear while lifecycle actions use the framework action strip");
const lifecycleDescriptor = functionBlock(tasksScript, "taskLifecycleActionStripDescriptor");
assert.match(lifecycleDescriptor, /id:\s*"complete-task"[\s\S]*id:\s*"reopen-task"[\s\S]*id:\s*"block-task"[\s\S]*id:\s*"unblock-task"[\s\S]*id:\s*"archive-task"[\s\S]*id:\s*"restore-task"/, "Completed, blocked, archived, and active lifecycle row actions should still appear when applicable");

const buildTaskQuery = functionBlock(tasksScript, "buildTaskQuery");
assert.match(buildTaskQuery, /params\.set\("task_view", canonicalTaskViewValue\(taskView\)\)/, "Saved task view should still affect visible task reads");
assert.match(buildTaskQuery, /params\.set\("status", canonicalStatusValue\(statusValue\)\)/, "Status filter should still affect visible task reads");
assert.match(buildTaskQuery, /params\.set\("sort", canonicalSortValue/, "Sort filter should still affect visible task reads");
assert.match(buildTaskQuery, /params\.set\("client_id", clientValue\)/, "Client filter should still affect visible task reads where scoped");
assert.match(buildTaskQuery, /params\.set\("project_id", projectValue\)/, "Project filter should still affect visible task reads");
assert.match(buildTaskQuery, /params\.set\("tags", tagValue\)/, "Tag filter should still affect visible task reads");
assert.match(tasksScript, /\[sortInput, statusFilter, assigneeFilter, clientFilter, projectFilter, tagFilter\]\.forEach\(\(input\) => \{[\s\S]*await reloadTaskList\(\)/, "Existing filter controls should still reload the visible task list");

assert.match(tasksView, /<main class="wide-page tasks-page" data-tasks-host><\/main>/, "Tasks protected view should remain a minimal descriptor host");
assert.match(tasksView, /css\/longtail-forge\.css\?v=72[\s\S]*js\/shared\/view-builder\.js\?v=16[\s\S]*js\/shared\/view-renderer\.js\?v=13[\s\S]*js\/tasks\.js\?v=20/, "Tasks host should load the read-only list binding cache keys");
assert.match(renderer, /detail\.itemRows\s*\? renderItemCollection\(detail\.itemRows, view, state\)/, "Renderer should only show the generic Items placeholder when itemRows are declared");
assert.match(styles, /\.view-slideout-sidebar-main > \.tasks-main-list-region\s*\{[\s\S]*border:\s*0;[\s\S]*padding:\s*0;[\s\S]*background:\s*transparent/, "Framework region wrapper should not visually redesign the task list");
assert.match(styles, /\.view-list-shell\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*0/, "Framework list shell should own no-gap list placement");
assert.match(regressionSuite, /scripts\/tasks-readonly-list-binding-regression\.mjs/, "Regression suite should include the Tasks read-only list binding regression");

console.log("Tasks read-only list binding regression passed.");

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
