import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.21.0.4";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const tasksScript = readText("public/js/tasks.js");
const taskDialogScript = readText("public/js/task-dialog.js");
const declarativeGuardrails = readText("scripts/view-descriptor-declarative-guardrails.mjs");
const declarativeGuide = readText("docs/declarative-view-surfaces.md");
const inventoryDoc = readText("docs/tasks-strict-guardrail-inventory.md");
const tasksDocs = readText("docs/tasks-module.md");
const moduleContract = readText("docs/module-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current app version");

const taskViewSelector = functionBlock(tasksScript, "createTaskViewSelectorChrome");
const taskFilter = functionBlock(tasksScript, "createTaskFilterChrome");
const mainList = functionBlock(tasksScript, "createTaskMainListChrome");
const bulkToolbar = functionBlock(tasksScript, "createTaskBulkToolbarChrome");
const bulkToolbarControls = functionBlock(tasksScript, "taskBulkToolbarControls");
const bulkAssignees = functionBlock(tasksScript, "renderBulkAssigneeOptions");
const renderTasks = functionBlock(tasksScript, "renderTasks");
const taskRow = functionBlock(tasksScript, "createTaskRow");
const workflowMenu = functionBlock(tasksScript, "createTaskWorkflowActionMenu");
const lifecycleStrip = functionBlock(tasksScript, "createTaskLifecycleActionStrip");
const taskContext = functionBlock(tasksScript, "appendTaskContext");
const fieldNodes = functionBlock(taskDialogScript, "taskEditorFieldNodes");
const detailsSection = functionBlock(taskDialogScript, "taskEditorDetailsSection");
const checklistSection = functionBlock(taskDialogScript, "taskEditorChecklistSection");
const recurrenceSection = functionBlock(taskDialogScript, "taskEditorRecurrenceSection");
const timerSection = functionBlock(taskDialogScript, "taskEditorTimerSection");
const reminderSection = functionBlock(taskDialogScript, "taskEditorReminderSection");
const tagsDialog = functionBlock(taskDialogScript, "createTaskTagsDialog");
const filesDialog = functionBlock(taskDialogScript, "createTaskFilesDialog");
const recurrenceFields = functionBlock(taskDialogScript, "taskRecurrenceFieldNodes");
const checklistRow = functionBlock(taskDialogScript, "checklistItemRow");
const timerWriter = functionBlock(taskDialogScript, "writeTaskTimerFields");

assert.match(declarativeGuardrails, /const strictDeclarativeSurfaceIds = new Set\(\[[\s\S]*"client-projects\.clients"[\s\S]*"client-projects\.projects"[\s\S]*"files\.browse"[\s\S]*"lists\.workspace"[\s\S]*"notes\.workspace"[\s\S]*"tasks\.workspace"[\s\S]*\]\)/, "Tasks should remain under strict declarative enforcement alongside Clients, Projects, Files, Lists, and Notes");
assert.match(declarativeGuardrails, /Tasks descriptor should be strict-converted/, "Declarative guardrails should fail if Tasks leaves strict enforcement");
assert.match(declarativeGuide, /\| Tasks \| tasks \| tasks\.html \| tasks\.workspace \| strict \|/, "Declarative guide should mark Tasks strict");

assert.doesNotMatch(tasksScript, /taskTemplateElement|document\.createElement\("template"\)|innerHTML/, "Tasks browser adapter should not parse framework-owned chrome from raw templates");
assert.doesNotMatch(taskDialogScript, /taskTemplateElements|taskEditorFieldMarkup|document\.createElement\("template"\)|innerHTML/, "Task dialog should not parse framework-owned modal fields from raw templates");

assert.match(taskViewSelector, /view\.createElement\("div"[\s\S]*"data-task-view-selector-control"[\s\S]*"data-task-view-selector"[\s\S]*"Saved Task Views"[\s\S]*taskOptions\(\[/, "Saved Task Views sidebar chrome should be helper-built");
assert.match(taskFilter, /view\.createElement\("div"[\s\S]*"data-task-filter-toolbar"[\s\S]*"data-task-filter-details"[\s\S]*taskControlLabel\("Sort"[\s\S]*"data-task-reset-filters"/, "Sorting and Filters sidebar chrome should be helper-built");
assert.match(mainList, /view\.createListShell\(\{[\s\S]*toolbar:\s*createTaskBulkToolbarChrome\(\)[\s\S]*statusAttrs:\s*\{\s*"data-task-status":\s*""\s*\}[\s\S]*children:\s*list/, "Tasks main list should use the shared list shell");
assert.match(bulkToolbar, /view\.createBulkActionToolbar\(\{[\s\S]*body:\s*taskBulkToolbarControls\(\)/, "Tasks bulk actions should use the shared toolbar shell");
assert.match(bulkToolbarControls, /taskControlLabel\("Status"[\s\S]*"data-task-bulk-status"[\s\S]*taskControlLabel\("Priority"[\s\S]*"data-task-bulk-priority"[\s\S]*taskControlLabel\("Due Date"[\s\S]*"data-task-bulk-due-date"[\s\S]*taskControlLabel\("Due Time"[\s\S]*"data-task-bulk-due-time"[\s\S]*taskControlLabel\("Assignees"[\s\S]*"data-task-bulk-assignees"[\s\S]*taskControlLabel\("Tag Action"[\s\S]*"data-task-bulk-tag-action"[\s\S]*taskControlLabel\("Tags"[\s\S]*"data-task-bulk-tags"[\s\S]*taskControlLabel\("Lifecycle"[\s\S]*"data-task-bulk-lifecycle"[\s\S]*"data-task-bulk-apply"/, "Bulk toolbar body controls should be helper-built and hook-compatible");
assert.match(bulkAssignees, /view\.createElement\("label"[\s\S]*task-bulk-assignee-option[\s\S]*view\.createElement\("input"[\s\S]*checked: selectedIds\.has\(user\.user_id\)/, "Bulk assignee options should be helper-built");
assert.match(renderTasks, /view\.createElement\("tr"[\s\S]*emptyTaskMessage\(\)[\s\S]*tasks\.forEach\(\(task\) => taskList\.append\(\.\.\.createTaskRow\(task\)\)\)/, "Empty list state should be helper-built while rows stay Tasks-owned");

assert.match(fieldNodes, /taskEditorTitleField\(view\)[\s\S]*taskEditorMetadataRibbon\(view\)[\s\S]*taskEditorDetailsSection\(view\)[\s\S]*taskEditorChecklistSection\(view\)[\s\S]*taskEditorRecurrenceSection\(view\)[\s\S]*taskEditorTimerSection\(view\)[\s\S]*taskEditorReminderSection\(view\)[\s\S]*taskEditorNotesSection\(view\)/, "Task editor field nodes should compose helper-built sections");
assert.match(detailsSection, /className: \["task-details-field", "surface-modal-group"\][\s\S]*"data-task-details-panel"[\s\S]*taskEditorLabel\(view, "Status"[\s\S]*taskEditorLabel\(view, "Priority"[\s\S]*taskEditorLabel\(view, "Parent Task"[\s\S]*taskEditorLabel\(view, "Due Date"[\s\S]*taskEditorLabel\(view, "Due Time"[\s\S]*taskEditorLabel\(view, "Resume note"[\s\S]*taskEditorLabel\(view, "Next action"[\s\S]*taskEditorLabel\(view, "Client"[\s\S]*taskEditorLabel\(view, "Project"[\s\S]*taskEditorLabel\(view, "Description"[\s\S]*taskEditorLabel\(view, "Assignees"[\s\S]*taskEditorLabel\(view, "Blocked reason"/, "Task Details standard field grid should be helper-built");
assert.match(checklistSection, /className: \["task-checklist-field", "surface-modal-group"\][\s\S]*"data-task-checklist-field"[\s\S]*"data-task-checklist-status"[\s\S]*"data-task-checklist-input"[\s\S]*"data-task-checklist-add"[\s\S]*"data-task-checklist-list"/, "Checklist section shell should be helper-built");
assert.match(recurrenceSection, /className: \["task-recurrence-field", "surface-modal-group", "surface-divider-top"\][\s\S]*"data-task-recurrence-panel"[\s\S]*"data-task-recurring"[\s\S]*"data-task-recurrence-details"[\s\S]*"data-task-recurrence-summary"/, "Recurrence section shell should be helper-built");
assert.match(timerSection, /className: \["task-timer-field", "surface-modal-group"\][\s\S]*"data-task-timer-field"[\s\S]*"data-task-timer-start"[\s\S]*"data-task-timer-pause"[\s\S]*"data-task-timer-finalize"[\s\S]*"data-task-timer-reset"/, "Task Timer section shell should be helper-built");
assert.match(reminderSection, /className: \["task-reminder-field", "surface-modal-group", "surface-divider-top"\][\s\S]*"data-task-reminder-details"[\s\S]*"data-task-reminder-override"[\s\S]*"data-task-reminder-override-fields"/, "Reminder section shell should be helper-built");
assert.match(tagsDialog, /view\.createModal\(\{[\s\S]*title: "Task Tags"[\s\S]*body: \[tagsMount\][\s\S]*actions: \[close\]/, "Tags utility child dialog shell should be helper-built");
assert.match(filesDialog, /view\.createModal\(\{[\s\S]*title: "Task Files"[\s\S]*body: \[filesMount\][\s\S]*actions: \[close\]/, "Files utility child dialog shell should be helper-built");

assert.match(taskRow, /document\.createElement\("tr"\)[\s\S]*row\.classList\.add\("task-density-row"\)[\s\S]*appendTaskMetadata\(metaBand, task\)[\s\S]*appendTaskContext\(metaBand, task\)/, "Task row-specific content should remain an explicit escape hatch");
assert.match(workflowMenu, /taskWorkflowActionsForTask\(task\)[\s\S]*view\.createDetailActionMenu/, "Workflow action choice should remain Tasks-owned while placement uses the shared action menu");
assert.match(lifecycleStrip, /taskLifecycleActionsForTask\(task\)[\s\S]*view\.createDetailActionStrip/, "Lifecycle action choice should remain Tasks-owned while placement uses the shared action strip");
assert.match(taskContext, /blockingSummaryText\(task\.relationshipSummary\)[\s\S]*view\.createDetailBadgeRow/, "Relationship and recovery context should stay Tasks-owned while using shared badge anatomy");
assert.match(recurrenceFields, /view\.createElement\("label"[\s\S]*taskRecurrenceFrequency[\s\S]*taskRecurrenceInterval[\s\S]*taskRecurrenceEndDate/, "Recurrence editor internals should remain an explicit escape hatch");
assert.match(checklistRow, /document\.createElement\("div"\)[\s\S]*task-checklist-item[\s\S]*taskChecklistToggle[\s\S]*taskChecklistLabel/, "Checklist row behavior should remain an explicit escape hatch");
assert.match(timerWriter, /taskTimersEnabled[\s\S]*timeTrackingEnabled[\s\S]*timer_status[\s\S]*readTaskTimerIneligibleReason\(task\)/, "Timer state behavior should remain an explicit escape hatch");

assert.match(inventoryDoc, /Current as of 0\.33\.5\.18\.10\.7/, "Strict guardrail doc should report the current slice");
assert.match(inventoryDoc, /`tasks\.workspace` is now a strict declarative surface/, "Strict guardrail doc should document active enforcement");
assert.match(inventoryDoc, /Fail-On-Violation Tasks Guardrails[\s\S]*Raw template parsing[\s\S]*Page shell[\s\S]*Slide-out sidebar shell[\s\S]*Filter panel shell[\s\S]*Bulk toolbar shell[\s\S]*Modal shell\/footer[\s\S]*Standard field grids[\s\S]*Standard action placement/, "Strict guardrail doc should list hard failures");
assert.match(inventoryDoc, /Documented Tasks-Owned Escape Hatches[\s\S]*Task row-specific content[\s\S]*Recurrence editor internals[\s\S]*Checklist behavior fragments[\s\S]*Timer state behavior/, "Strict guardrail doc should keep explicit Tasks-owned escape hatches");
assert.match(tasksDocs, /As of 0\.33\.5\.18\.10\.6[\s\S]*strict declarative guardrails now enforce `tasks\.workspace`/, "Tasks docs should summarize strict enforcement");
assert.match(moduleContract, /0\.33\.5\.18\.10\.6[\s\S]*Tasks strict declarative guardrails/, "Module contract should document the strict Tasks decision");
assert.match(viewContract, /strict guardrail enforcement shipped in 0\.33\.5\.18\.10\.6/, "View-building contract should record the strict enforcement slice");
assert.match(regressionSuite, /scripts\/tasks-strict-guardrail-inventory-regression\.mjs/, "Regression suite should include the strict Tasks guardrail regression");

console.log(`Tasks strict declarative guardrail regression passed. Remaining direct DOM calls are documented escape hatches: tasks.js=${countMatches(tasksScript, /document\.createElement/g)}, task-dialog.js=${countMatches(taskDialogScript, /document\.createElement/g)}.`);

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
