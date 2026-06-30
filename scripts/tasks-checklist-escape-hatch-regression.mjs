import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.19.5";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const taskDialogScript = readText("public/js/task-dialog.js");
const tasksService = readText("src/modules/tasks/tasks.service.js");
const tasksRoutes = readText("src/modules/tasks/tasks.routes.js");
const taskChecklistRegression = readText("scripts/task-checklist-regression.mjs");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current app version");

assert.match(
  taskDialogScript,
  /id: "task_details", label: "Task Details"[\s\S]*id: "checklist", label: "Checklist"[\s\S]*id: "recurrence", label: "Recurrence"/,
  "Task editor descriptor should keep Checklist as a specialized section after Task Details.",
);
assert.match(
  taskDialogScript,
  /function taskEditorChecklistSection\(view\)[\s\S]*className: \["task-checklist-field", "surface-modal-group"\][\s\S]*"data-task-checklist-field"[\s\S]*taskEditorSectionHeading\(view, "summary", "Checklist"\)[\s\S]*"data-task-checklist-status"[\s\S]*className: \["task-checklist-add-row", "surface-modal-section-body"\][\s\S]*"data-task-checklist-input"[\s\S]*"data-task-checklist-add"[\s\S]*"data-task-checklist-list"/,
  "Checklist should use the framework modal section shell while keeping task-owned controls inside it.",
);
assert.doesNotMatch(
  taskDialogScript,
  /createTaskChecklistDialog|taskChecklistDialogMarkup|data-task-checklist-dialog|<dialog[^>]+checklist/i,
  "Checklist preservation should not create a duplicate checklist modal shell.",
);

assert.match(
  taskDialogScript,
  /fields\.checklistAdd\?\.addEventListener\("click", addChecklistItem\)[\s\S]*fields\.checklistList\?\.addEventListener\("click", handleChecklistClick\)[\s\S]*fields\.checklistList\?\.addEventListener\("change", handleChecklistChange\)/,
  "Checklist behavior should remain mounted through Tasks-owned browser handlers.",
);
assert.match(
  taskDialogScript,
  /async function addChecklistItem\(\)[\s\S]*api\.postJson\(`\/api\/tasks\/\$\{encodeURIComponent\(currentTaskId\)\}\/checklist`, \{ label \}\)[\s\S]*applyChecklistResult\(result\)/,
  "Checklist add should keep using the Tasks checklist API route and refresh path.",
);
assert.match(
  taskDialogScript,
  /async function handleChecklistChange\(event\)[\s\S]*const action = checkbox\.checked \? "check" : "uncheck";[\s\S]*api\.postJson\(`\/api\/tasks\/\$\{encodeURIComponent\(currentTaskId\)\}\/checklist\/\$\{encodeURIComponent\(itemId\)\}\/\$\{action\}`, \{\}\)/,
  "Checklist check/uncheck should keep using the Tasks checklist API route.",
);
assert.match(
  taskDialogScript,
  /async function saveChecklistItemLabel\(row, itemId\)[\s\S]*api\.putJson\(`\/api\/tasks\/\$\{encodeURIComponent\(currentTaskId\)\}\/checklist\/\$\{encodeURIComponent\(itemId\)\}`, \{ label \}\)/,
  "Checklist label edits should keep using the Tasks checklist API route.",
);
assert.match(
  taskDialogScript,
  /async function deleteChecklistItem\(row, itemId\)[\s\S]*modal\.confirm\(\{[\s\S]*title: "Remove checklist item"[\s\S]*danger: true[\s\S]*api\.deleteJson\(`\/api\/tasks\/\$\{encodeURIComponent\(currentTaskId\)\}\/checklist\/\$\{encodeURIComponent\(itemId\)\}`\)/,
  "Checklist delete should keep the confirmation and Tasks checklist API route.",
);
assert.match(
  taskDialogScript,
  /async function moveChecklistItem\(itemId, direction\)[\s\S]*api\.postJson\(`\/api\/tasks\/\$\{encodeURIComponent\(currentTaskId\)\}\/checklist\/reorder`, \{[\s\S]*item_ids: items\.map\(\(candidate\) => candidate\.task_checklist_item_id\)/,
  "Checklist reorder should keep using the Tasks checklist reorder route.",
);
assert.match(
  taskDialogScript,
  /function applyChecklistResult\(result\)[\s\S]*checklistItems: result\?\.items \|\| currentTask\.checklistItems \|\| \[\][\s\S]*checklistProgress: result\?\.checklistProgress \|\| currentTask\.checklistProgress[\s\S]*writeChecklistFields\(currentTask\)[\s\S]*notifyTaskEditorSaved\(result\)/,
  "Checklist results should refresh task-owned row state, progress, and host callbacks.",
);
assert.match(
  taskDialogScript,
  /function writeChecklistFields\(task\)[\s\S]*fields\.checklistInput\.disabled = !canUseChecklist[\s\S]*fields\.checklistStatus\.textContent = canUseChecklist[\s\S]*formatChecklistProgress\(progress\)[\s\S]*fields\.checklistList\.replaceChildren\(\.\.\.items\.map\(\(item, index\) => checklistItemRow\(item, index, items\.length\)\)\)[\s\S]*fields\.checklistField\.open = items\.length > 0/,
  "Checklist section should preserve unsaved-task gating, progress summary, row rendering, and auto-open behavior.",
);
assert.match(
  taskDialogScript,
  /function checklistItemRow\(item, index, totalItems\)[\s\S]*document\.createElement\("div"\)[\s\S]*row\.className = "task-checklist-item"[\s\S]*data(TaskChecklistToggle|set\.taskChecklistToggle)[\s\S]*data(TaskChecklistLabel|set\.taskChecklistLabel)[\s\S]*checklistActionButton\("save"[\s\S]*checklistActionButton\("up"[\s\S]*checklistActionButton\("down"[\s\S]*checklistActionButton\("delete"/,
  "Checklist rows should remain Tasks-owned fragments with the shipped row controls.",
);

for (const routePattern of [
  /tasksRoutes\.get\("\/tasks\/:taskId\/checklist"[\s\S]*tasksService\.listChecklistItems/,
  /tasksRoutes\.post\("\/tasks\/:taskId\/checklist"[\s\S]*tasksService\.addChecklistItem/,
  /tasksRoutes\.post\("\/tasks\/:taskId\/checklist\/reorder"[\s\S]*tasksService\.reorderChecklistItems/,
  /tasksRoutes\.put\("\/tasks\/:taskId\/checklist\/:itemId"[\s\S]*tasksService\.updateChecklistItem/,
  /tasksRoutes\.post\("\/tasks\/:taskId\/checklist\/:itemId\/check"[\s\S]*tasksService\.checkChecklistItem/,
  /tasksRoutes\.post\("\/tasks\/:taskId\/checklist\/:itemId\/uncheck"[\s\S]*tasksService\.uncheckChecklistItem/,
  /tasksRoutes\.delete\("\/tasks\/:taskId\/checklist\/:itemId"[\s\S]*tasksService\.deleteChecklistItem/,
]) {
  assert.match(tasksRoutes, routePattern, "Checklist routes should stay Tasks-owned.");
}

for (const serviceFunction of [
  "addChecklistItem",
  "updateChecklistItem",
  "reorderChecklistItems",
  "deleteChecklistItem",
  "setChecklistItemChecked",
]) {
  const block = functionBlock(tasksService, serviceFunction);
  assert.match(block, /assertModuleWriteEnabled\(session, TASKS_MODULE_ID\)/, `${serviceFunction} should enforce module writes.`);
  assert.match(block, /assertCanEditTask\(session, task\)/, `${serviceFunction} should enforce task edit permission.`);
}

assert.match(
  tasksService,
  /async function finalizeChecklistMutation\(\{[\s\S]*tasksRepository\.markWorkedAt[\s\S]*taskChecklistProgress\(currentItems\)[\s\S]*auditService\.record\(\{[\s\S]*recordType: "task_checklist_item"[\s\S]*modulesService\.emitInternalEvent\(eventName[\s\S]*checklist_progress: checklistProgress[\s\S]*syncTaskSearchIndex\(session\.workspace_id, task\.task_id, eventName\)[\s\S]*return \{[\s\S]*items: currentItems[\s\S]*checklistProgress[\s\S]*task: taskWithDetails/,
  "Checklist service should preserve progress, audit/event/search side effects, and task refresh response shape.",
);
assert.match(
  taskChecklistRegression,
  /assertChecklistLifecycleAndProgress[\s\S]*addChecklistItem[\s\S]*checkChecklistItem[\s\S]*updateChecklistItem[\s\S]*reorderChecklistItems[\s\S]*uncheckChecklistItem[\s\S]*deleteChecklistItem/,
  "The database checklist regression should continue covering the shipped checklist lifecycle.",
);
assert.match(
  regressionSuite,
  /scripts\/tasks-checklist-escape-hatch-regression\.mjs/,
  "The checklist preservation regression should run in the regression suite.",
);

console.log("Tasks checklist escape-hatch regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`async function ${functionName}`);
  const fallbackStart = source.indexOf(`function ${functionName}`);
  const blockStart = start >= 0 ? start : fallbackStart;
  assert.notEqual(blockStart, -1, `${functionName} should exist`);
  const nextFunction = source.slice(blockStart + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(blockStart, nextFunction === -1 ? source.length : blockStart + 1 + nextFunction);
}
