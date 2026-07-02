import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.21.7.8";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const icons = readText("public/js/shared/icons.js");
const taskDialog = readText("public/js/task-dialog.js");
const taskService = readText("src/modules/tasks/tasks.service.js");
const tasksModule = readText("src/modules/tasks/module.js");
const stylesheet = readText("public/css/longtail-forge.css");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the checklist editor display version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the checklist editor display version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the checklist editor display version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the checklist editor display version");

for (const iconName of ["add", "save", "up", "down", "delete"]) {
  assert.match(icons, new RegExp(`["']?${escapeRegExp(iconName)}["']?:\\s*Object\\.freeze`), `shared icons should include ${iconName}`);
}

assert.match(
  taskDialog,
  /function taskEditorChecklistAddButton\(view\)[\s\S]*view\.createActionButton\(\{[\s\S]*className: "task-checklist-add-button"[\s\S]*icon: "add"[\s\S]*iconOnly: true[\s\S]*label: "Add checklist item"[\s\S]*text: ""[\s\S]*title: "Add checklist item"[\s\S]*button\.dataset\.taskChecklistAdd = ""/,
  "Checklist add should be a shared icon-only action button while preserving the add hook.",
);
assert.match(
  taskDialog,
  /function checklistActionButton\(action, label\)[\s\S]*namespace\.icons\.createIconButton\(\{[\s\S]*icon: checklistActionIcon\(action\)[\s\S]*iconOnly: true[\s\S]*label,[\s\S]*text: ""[\s\S]*title: label[\s\S]*variant: action === "delete" \? "danger" : ""[\s\S]*button\.classList\.add\("task-checklist-action"\)[\s\S]*button\.dataset\.taskChecklistAction = action/,
  "Checklist row actions should use shared icon-only buttons with labels, titles, hooks, and danger styling for delete.",
);
assert.match(
  taskDialog,
  /function checklistActionIcon\(action\)[\s\S]*delete: "delete"[\s\S]*down: "down"[\s\S]*save: "save"[\s\S]*up: "up"/,
  "Checklist row actions should map to recognizable shared icons.",
);
assert.match(
  taskDialog,
  /const up = checklistActionButton\("up", "Move checklist item up"\)[\s\S]*const down = checklistActionButton\("down", "Move checklist item down"\)[\s\S]*up\.disabled = index === 0[\s\S]*down\.disabled = index >= totalItems - 1/,
  "Checklist up/down controls should keep their accessible names and disabled edge logic.",
);
assert.match(
  stylesheet,
  /\.task-checklist-add-row,[\s\S]*\.task-checklist-item\s*\{[\s\S]*display: grid;[\s\S]*align-items: center;[\s\S]*\}[\s\S]*\.task-checklist-item\s*\{[\s\S]*grid-template-columns: auto minmax\(0, 1fr\) auto auto auto auto;[\s\S]*\}[\s\S]*\.task-checklist-add-row input,[\s\S]*\.task-checklist-item input\[type="text"\]\s*\{[\s\S]*min-width: 0;/,
  "Checklist input and icon-button rows should keep stable grid alignment and shrink safely.",
);

assert.match(
  taskDialog,
  /async function openTaskEditor\(params = \{\}, hostContext = null\)[\s\S]*if \(request\.taskId && request\.mode === "edit"\) \{[\s\S]*api\.getJson\(`\/api\/tasks\/\$\{encodeURIComponent\(request\.taskId\)\}`,\s*\{ cache: "no-store" \}\)[\s\S]*request\.task = detail\?\.task \|\| request\.task/,
  "Opening the editor for an existing task should fetch single-task detail even when the caller passes a list row.",
);
assert.match(
  taskService,
  /async function attachTaskDetails\(task\)[\s\S]*const checklistItems = await taskChecklistsRepository\.readForTask\(task\.workspace_id, task\.task_id\)[\s\S]*checklistItems,[\s\S]*checklistProgress/,
  "Single-task detail reads should carry checklist item rows for the editor.",
);
assert.match(
  taskService,
  /function taskSummaryRow\(task, currentUserId = ""\)[\s\S]*checklistProgress: task\.checklistProgress \|\| emptyChecklistProgress\(\)[\s\S]*relationshipSummary:/,
  "List rows should remain lightweight summary rows with checklist progress.",
);
assert.doesNotMatch(
  functionBlock(taskService, "taskSummaryRow"),
  /checklistItems/,
  "List rows should not start carrying full checklist item arrays.",
);
assert.match(
  taskDialog,
  /function writeChecklistFields\(task\)[\s\S]*const items = task\?\.checklistItems \|\| \[\][\s\S]*fields\.checklistList\.replaceChildren\(\.\.\.items\.map\(\(item, index\) => checklistItemRow\(item, index, items\.length\)\)\)/,
  "The task editor should render checklist rows from detail checklistItems.",
);
assert.match(
  regressionSuite,
  /scripts\/task-checklist-editor-display-regression\.mjs/,
  "The checklist editor display regression should run in the regression suite.",
);

console.log("Task checklist editor display regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`async function ${functionName}`);
  const fallbackStart = source.indexOf(`function ${functionName}`);
  const blockStart = start >= 0 ? start : fallbackStart;
  assert.notEqual(blockStart, -1, `${functionName} should exist`);
  const nextFunction = source.slice(blockStart + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(blockStart, nextFunction === -1 ? source.length : blockStart + 1 + nextFunction);
}
