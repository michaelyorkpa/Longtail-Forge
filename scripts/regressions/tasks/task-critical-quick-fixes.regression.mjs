export const regressionMeta = Object.freeze({
  id: "tasks.task-critical-quick-fixes",
  area: "tasks",
  tier: "focused",
  tags: ["blocked-reason", "checklist", "modal", "parent-child", "tags", "tasks", "workbench"],
  description: "Pins the current Tasks quick-fix contracts for checklist keys and spacing, searchable tag controls, parent-child creation and list anatomy, create-save continuity, workspace project narrowing, and reason-required Block flows.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const css = await readText("public/css/longtail-forge.css");
const tags = await readText("public/js/shared/tags.js");
const taskDialog = await readText("public/js/task-dialog.js");
const tasks = await readText("public/js/tasks.js");
const workbench = await readText("public/js/workbench.js");
const taskService = await readText("src/modules/tasks/tasks.service.js");

assert.match(
  functionBlock(taskDialog, "handleChecklistInputKeydown"),
  /event\.key !== "Enter"[\s\S]*event\.preventDefault\(\)[\s\S]*await addChecklistItem\(\)/,
  "Enter in the checklist add field should add an item instead of submitting the task form",
);
assert.match(
  functionBlock(taskDialog, "handleChecklistListKeydown"),
  /data-task-checklist-label[\s\S]*event\.key !== "Enter"[\s\S]*event\.preventDefault\(\)[\s\S]*await saveChecklistItemLabel\(row, itemId\)/,
  "Enter in a checklist row should save that item instead of submitting the task form",
);
assert.match(css, /\.task-checklist-field\[open\]\s*\{[\s\S]*gap:\s*12px;[\s\S]*padding:\s*14px;/, "the expanded checklist should keep readable internal spacing");
assert.match(css, /\.task-checklist-list\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*6px;/, "checklist rows should not visually run together");

assert.match(
  functionBlock(tasks, "createTaskFilterChrome"),
  /taskControlLabel\("Tag", view\.createElement\("input"[\s\S]*data-task-tag-filter[\s\S]*placeholder: "Type to search tags"/,
  "the Tasks tag filter should be a type-to-search input",
);
assert.match(functionBlock(tasks, "populateTagFilter"), /tags\?\.mountFilterPicker\?\.\(tagFilter,[\s\S]*tags,[\s\S]*value: nextValue/, "the Tasks filter should use the shared searchable tag picker");
assert.match(tags, /function mountFilterPicker\([\s\S]*"All tags"[\s\S]*"No Tags"/, "the shared filter picker should retain All tags and No Tags choices");
assert.match(tags, /function mountFilterPicker\([\s\S]*aria-activedescendant[\s\S]*ArrowDown[\s\S]*ArrowUp/, "the shared filter picker should expose keyboard-selected suggestions accessibly");
assert.match(tags, /input\.addEventListener\("keydown", async \(event\) => \{[\s\S]*ArrowDown[\s\S]*moveTagSuggestionSelection[\s\S]*activeSuggestion\.click\(\)/, "the shared tag editor should select suggestions with ArrowDown and Enter");

assert.match(
  functionBlock(taskDialog, "parentTaskOptions"),
  /taskId \|\| !\["complete", "archived"\]\.includes\(task\.status\)[\s\S]*!selectedClientId \|\| !task\.client_id \|\| task\.client_id === selectedClientId[\s\S]*selectedProjectId/,
  "new-task parent choices should exclude terminal tasks while preserving client and project scope filters",
);
const inheritance = functionBlock(taskDialog, "applySelectedParentTaskInheritance");
assert.match(inheritance, /fields\.dueDate\.value = parentTask\.due_date[\s\S]*fields\.dueTime\.value = parentTask\.due_time[\s\S]*fields\.priority\.value/, "selecting a parent should inherit schedule and priority");
assert.match(inheritance, /!fields\.client\.value && parentTask\.client_id[\s\S]*fields\.client\.value = parentTask\.client_id/, "selecting a parent should fill an empty client");
assert.match(inheritance, /!fields\.project\.value && parentTask\.project_id[\s\S]*populateProjectInput\(parentTask\.project_id/, "selecting a parent should fill an empty project");

assert.match(functionBlock(tasks, "renderTasks"), /nestedTaskDisplayRows\(tasks\)[\s\S]*taskNestingDepths\.set\(task, depth\)[\s\S]*createTaskRow\(task\)/, "the Tasks list should annotate and render its parent-before-child projection");
assert.match(functionBlock(tasks, "nestedTaskDisplayRows"), /childrenByParentId[\s\S]*appendBranch\(child, depth \+ 1/, "nested task rows should retain descendant depth");
assert.match(functionBlock(tasks, "createTaskRow"), /is-task-child[\s\S]*--task-nesting-depth/, "child rows should expose a bounded visual nesting depth");
assert.match(functionBlock(tasks, "appendParentTaskChip"), /button\.textContent = `Child of: \$\{truncateTaskName\(parentTitle\)\}`[\s\S]*openTaskDialogById\(parentTaskId, button\)/, "the truncated Child of chip should open the canonical parent editor");

assert.match(functionBlock(taskDialog, "saveTask"), /const wasCreating = !currentTaskId[\s\S]*closeOnSuccess: !wasCreating/, "Save should keep a newly created task open");
assert.match(functionBlock(taskDialog, "saveTaskForm"), /!wasEditing[\s\S]*transitionCreatedTaskToEdit\(result\.task\)[\s\S]*Task saved\. Continue editing or choose Save & Close\./, "the create dialog should transition in place to a persisted edit dialog");
assert.match(functionBlock(taskDialog, "taskEditorModalDescriptor"), /id: "save-close", label: "Save & Close"[\s\S]*id: "save", label: "Save task"/, "the task editor should expose separate Save & Close and Save actions");

assert.match(functionBlock(taskDialog, "populateFormOptions"), /option\("", workspaceProjectsLabel\(\)\)/, "Business task context should identify workspace-level projects explicitly");
assert.match(functionBlock(taskDialog, "populateProjectInput"), /\(project\.client_id \|\| ""\) === selectedClientId/, "workspace-level context should show only projects without a client association");

assert.match(functionBlock(tasks, "openTaskDialogForBlock"), /focusTarget: "blocked_reason"[\s\S]*status: "blocked"/, "Tasks Block should open the canonical editor focused on Blocked Reason");
assert.match(functionBlock(workbench, "blockFocusedTask"), /openTaskCandidate\([\s\S]*defaults: \{ status: "blocked" \}[\s\S]*focusTarget: "blocked_reason"/, "Workbench Block should open the canonical editor focused on Blocked Reason");
assert.match(functionBlock(taskDialog, "focusTaskEditorTarget"), /blocked_reason: fields\.blockedReason[\s\S]*blocked_reason: fields\.taskDetailsPanel/, "Blocked Reason focus should open Task Details and focus the field");
assert.match(functionBlock(taskDialog, "updateBlockedReasonState"), /fields\.blockedReason\.required = isBlocked/, "the canonical editor should mark Blocked Reason required while status is Blocked");
assert.match(functionBlock(taskService, "normalizeTaskPayload"), /status === "blocked" && !blockedReason[\s\S]*Blocked Reason is required when a task is Blocked\.[\s\S]*400/, "the service boundary should reject blocked tasks without a reason");
assert.match(functionBlock(tasks, "selectedBulkActions"), /blocked_reason: status === "blocked" \? blockedReason : ""/, "bulk Block should send the required reason through the canonical status action");

console.log("Task critical quick-fixes regression passed.");

async function readText(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
