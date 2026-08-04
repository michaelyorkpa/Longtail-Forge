import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const icons = readText("public/js/shared/icons.js");
const taskDialog = readText("public/js/task-dialog.js");
const taskService = readText("src/modules/tasks/tasks.service.js");
const tasksModule = readText("src/modules/tasks/module.js");
const stylesheet = readText("public/css/longtail-forge.css");
const checklistAddButton = functionBlock(taskDialog, "taskEditorChecklistAddButton");
const checklistActionButton = functionBlock(taskDialog, "checklistActionButton");
const checklistActionIcon = functionBlock(taskDialog, "checklistActionIcon");
const checklistItemRow = functionBlock(taskDialog, "checklistItemRow");
const openTaskEditor = functionBlock(taskDialog, "openTaskEditor");
const attachTaskDetails = functionBlock(taskService, "attachTaskDetails");
const taskSummaryRow = functionBlock(taskService, "taskSummaryRow");
const writeChecklistFields = functionBlock(taskDialog, "writeChecklistFields");

assert.match(tasksModule, /version:\s*appVersion/, "Tasks module should report the checklist editor display version");

for (const iconName of ["add", "save", "up", "down", "delete"]) {
  assert.match(icons, new RegExp(`["']?${escapeRegExp(iconName)}["']?:\\s*Object\\.freeze`), `shared icons should include ${iconName}`);
}

assertPatterns(checklistAddButton, [
  /view\.createActionButton\(\{/,
  /className: "task-checklist-add-button"/,
  /icon: "add"/,
  /iconOnly: true/,
  /label: "Add checklist item"/,
  /text: ""/,
  /title: "Add checklist item"/,
  /button\.dataset\.taskChecklistAdd = ""/,
], "Checklist add should be a shared icon-only action button while preserving the add hook.");

assertPatterns(checklistActionButton, [
  /namespace\.icons\.createIconButton\(\{/,
  /icon: checklistActionIcon\(action\)/,
  /iconOnly: true/,
  /label,/,
  /text: ""/,
  /title: label/,
  /variant: action === "delete" \? "danger" : ""/,
  /button\.classList\.add\("task-checklist-action"\)/,
  /button\.dataset\.taskChecklistAction = action/,
], "Checklist row actions should use shared icon-only buttons with labels, titles, hooks, and danger styling for delete.");

assertPatterns(checklistActionIcon, [
  /delete: "delete"/,
  /down: "down"/,
  /save: "save"/,
  /up: "up"/,
], "Checklist row actions should map to recognizable shared icons.");

assertPatterns(checklistItemRow, [
  /const up = checklistActionButton\("up", "Move checklist item up"\)/,
  /const down = checklistActionButton\("down", "Move checklist item down"\)/,
  /up\.disabled = index === 0/,
  /down\.disabled = index >= totalItems - 1/,
], "Checklist up/down controls should keep their accessible names and disabled edge logic.");

assert.match(
  stylesheet,
  /\.task-checklist-add-row,\s*\.task-checklist-item\s*\{[^}]*display: grid;[^}]*align-items: center;[^}]*\}/,
  "Checklist input and icon-button rows should keep stable grid alignment.",
);
assert.match(
  stylesheet,
  /\.task-checklist-item\s*\{[^}]*grid-template-columns: auto minmax\(0, 1fr\) auto auto auto auto;[^}]*\}/,
  "Checklist rows should keep their compact action-column grid.",
);
assert.match(
  stylesheet,
  /\.task-checklist-add-row input,\s*\.task-checklist-item input\[type="text"\]\s*\{[^}]*min-width: 0;[^}]*\}/,
  "Checklist text inputs should shrink safely.",
);

assertPatterns(openTaskEditor, [
  /if \(request\.taskId && request\.mode === "edit"\) \{/,
  /api\.getJson\(`\/api\/tasks\/\$\{encodeURIComponent\(request\.taskId\)\}`,[\s\S]*\{ cache: "no-store" \}\)/,
  /request\.task = detail\?\.task \|\| request\.task/,
], "Opening the editor for an existing task should fetch single-task detail even when the caller passes a list row.");

assertPatterns(attachTaskDetails, [
  /const checklistItems = await taskChecklistsRepository\.readForTask\(task\.workspace_id, task\.task_id\)/,
  /checklistItems,/,
  /checklistProgress/,
], "Single-task detail reads should carry checklist item rows for the editor.");

assert.match(
  taskSummaryRow,
  /checklistProgress: task\.checklistProgress \|\| emptyChecklistProgress\(\)/,
  "List rows should remain lightweight summary rows with checklist progress.",
);
assert.match(taskSummaryRow, /relationshipSummary:/, "List rows should preserve relationship summary context.");
assert.doesNotMatch(taskSummaryRow, /checklistItems/, "List rows should not start carrying full checklist item arrays.");

assert.match(
  writeChecklistFields,
  /const items = task\?\.checklistItems \|\| \[\]/,
  "The task editor should read checklist rows from detail checklistItems.",
);
assert.match(
  writeChecklistFields,
  /fields\.checklistList\.replaceChildren\(\.\.\.items\.map\(\(item, index\) => checklistItemRow\(item, index, items\.length\)\)\)/,
  "The task editor should render checklist rows from detail checklistItems.",
);

console.log("Task checklist editor display regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertPatterns(source, patterns, message) {
  for (const pattern of patterns) {
    assert.match(source, pattern, message);
  }
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`async function ${functionName}`);
  const fallbackStart = source.indexOf(`function ${functionName}`);
  const blockStart = start >= 0 ? start : fallbackStart;
  assert.notEqual(blockStart, -1, `${functionName} should exist`);
  const nextFunction = source.slice(blockStart + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(blockStart, nextFunction === -1 ? source.length : blockStart + 1 + nextFunction);
}
