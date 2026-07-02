import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.21.5";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const tasksScript = readText("public/js/tasks.js");
const tasksView = readText("views/protected/tasks.html");
const viewBuilder = readText("public/js/shared/view-builder.js");
const styles = readText("public/css/longtail-forge.css");
const declarativeGuardrails = readText("scripts/view-descriptor-declarative-guardrails.mjs");
const declarativeGuide = readText("docs/declarative-view-surfaces.md");
const viewContract = readText("docs/view-building-contract.md");
const tasksDocs = readText("docs/tasks-module.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current app version");

assert.match(viewBuilder, /function createListShell\(options = \{\}\)[\s\S]*className:\s*\["view-list-shell", options\.className\]/, "Framework should own a generic list-shell helper");
assert.match(viewBuilder, /createListShell,[\s\S]*createModal/, "Framework list-shell helper should be exported");
assert.match(styles, /\.view-list-shell\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*0;[\s\S]*max-width:\s*100%/, "Framework CSS should own list-shell layout");
assert.match(styles, /\.view-list-shell-status:empty\s*\{[\s\S]*display:\s*none/, "Framework CSS should hide empty list-shell status mounts");

const mainChrome = functionBlock(tasksScript, "createTaskMainListChrome");
const renderTasks = functionBlock(tasksScript, "renderTasks");
const createTaskRow = functionBlock(tasksScript, "createTaskRow");
const createActions = functionBlock(tasksScript, "createActions");
const taskViewChrome = functionBlock(tasksScript, "createTaskViewSelectorChrome");
const filterChrome = functionBlock(tasksScript, "createTaskFilterChrome");
const bulkChrome = functionBlock(tasksScript, "createTaskBulkToolbarChrome");

assert.match(tasksScript, /view\.renderSurface\(\{ \.\.\.activeTasksViewDescriptor, dataSource: null, modals: \[\] \}, host\)/, "Tasks should still use the framework-rendered page shell");
assert.match(tasksModule, /sidebarPanels:\s*\[[\s\S]*id:\s*"tasks-view-selector"[\s\S]*id:\s*"tasks-filters"/, "Tasks descriptor should own sidebar panel placement through the framework");
assert.match(tasksModule, /detail:\s*\{[\s\S]*regions:\s*\[[\s\S]*id:\s*"tasks-main-list"[\s\S]*behavior:\s*"tasks\.main\.list"/, "Tasks descriptor should mount the main list through a framework region");
assert.match(mainChrome, /view\.createListShell\(\{[\s\S]*toolbar:\s*createTaskBulkToolbarChrome\(\)[\s\S]*statusAttrs:\s*\{\s*"data-task-status":\s*""\s*\}[\s\S]*children:\s*list/, "Tasks main list should use the framework list shell with a status mount and bulk toolbar slot");
assert.match(bulkChrome, /view\.createBulkActionToolbar\(\{[\s\S]*body:\s*taskBulkToolbarControls\(\)/, "Tasks bulk controls should stay inside the framework bulk toolbar shell");
assert.doesNotMatch(mainChrome, /taskTemplateElement|<div class="list-table-wrap"|<table class="list-table task-table"|<p data-task-status/, "Tasks should not hand-build framework-owned main-list shell markup");
assert.match(mainChrome, /className:\s*\["view-table-wrap", "list-table-wrap"\]/, "Tasks should use the shared table overflow wrapper while preserving compatibility table styling");

assert.match(renderTasks, /taskList\.replaceChildren\(\)[\s\S]*tasks\.forEach\(\(task\) => taskList\.append\(\.\.\.createTaskRow\(task\)\)\)/, "Tasks should still render rows through the module-owned row builder");
assert.match(createTaskRow, /row\.classList\.add\("task-density-row"\)/, "Task rows should keep the dense row class");
assert.match(createTaskRow, /appendTaskMetadata\(metaBand, task\)/, "Task rows should keep task-specific metadata rendering");
assert.match(createTaskRow, /contentCell\.colSpan = 6/, "Task rows should keep the current dense table span");
assert.match(createActions, /actionButton\("Edit"[\s\S]*actionButton\("Duplicate"[\s\S]*actionButton\("Copy Link"[\s\S]*actionButton\("Follow Notifications"[\s\S]*createTaskLifecycleActionStrip\(task\)/, "Task row utilities should remain module-owned while lifecycle placement uses the framework action strip");
assert.doesNotMatch(viewBuilder, /task-density-row|data-task-list|data-task-bulk|task_view/, "Framework list shell should not know Tasks row or query semantics");

assert.doesNotMatch(taskViewChrome, /data-task-filter-details|data-task-list|data-task-bulk-toolbar/, "Saved Task Views sidebar panel should not duplicate filters, rows, or bulk actions");
assert.doesNotMatch(filterChrome, /data-task-view-selector|data-task-list|data-task-bulk-toolbar|task-density-row/, "Sorting and Filters sidebar panel should not duplicate saved views, rows, or bulk actions");
assert.doesNotMatch(mainChrome, /data-task-filter-details|data-task-view-selector/, "Main list shell should not duplicate sidebar filter/view controls");

assert.match(declarativeGuardrails, /const strictDeclarativeSurfaceIds = new Set\(\[[\s\S]*"client-projects\.clients"[\s\S]*"client-projects\.projects"[\s\S]*"files\.browse"[\s\S]*"lists\.workspace"[\s\S]*"notes\.workspace"[\s\S]*"tasks\.workspace"[\s\S]*\]\)/, "Tasks should remain under strict declarative enforcement alongside Clients, Projects, Files, Lists, and Notes");
assert.match(declarativeGuardrails, /Tasks descriptor should be strict-converted/, "Guardrail inventory should explicitly enforce Tasks strict conversion");
assert.match(declarativeGuide, /\| Tasks \| tasks \| tasks\.html \| tasks\.workspace \| strict \|/, "Declarative guide should keep Tasks in the strict inventory");
assert.match(declarativeGuide, /list shell, bulk toolbar, row lifecycle action strip, row workflow action menu, add\/edit modal shell, top detail\/read metadata badge row, recurrence child-modal shell, Checklist section shell, Task Timer section shell, utility footer\/heading placement, and stacked Tags\/Files utility child dialogs use shared framework helpers[\s\S]*Strict Tasks guardrails now fail/, "Declarative guide should document the Tasks framework-helper boundary");
assert.match(viewContract, /list-shell boundary shipped in 0\.33\.5\.18\.8\.4/, "View-building contract should document the Tasks list-shell boundary");
assert.match(tasksDocs, /As of 0\.33\.5\.18\.8\.4[\s\S]*framework list shell owns the main list wrapper, status mount, and table overflow wrapper/, "Tasks docs should document the list-shell boundary");

assert.match(tasksView, /css\/longtail-forge\.css\?v=73[\s\S]*js\/shared\/view-builder\.js\?v=16[\s\S]*js\/shared\/view-renderer\.js\?v=13[\s\S]*js\/tasks\.js\?v=21/, "Tasks host should load the list-shell cache keys");
assert.match(regressionSuite, /scripts\/tasks-list-surface-boundary-regression\.mjs/, "Regression suite should include the Tasks list-surface boundary regression");

console.log("Tasks list surface boundary regression passed.");

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
