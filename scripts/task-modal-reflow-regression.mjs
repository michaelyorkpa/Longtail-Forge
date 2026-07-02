import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tasksView = readText("views/protected/tasks.html");
const taskDialogScript = readText("public/js/task-dialog.js");
const stylesheet = readText("public/css/longtail-forge.css");
const iconsScript = readText("public/js/shared/icons.js");
const tasksModule = readText("src/modules/tasks/module.js");
const currentTasksVersion = "0.33.5.21.0.4";

assert.match(taskDialogScript, /function taskEditorDetailsSection[\s\S]*className: \["task-details-field", "surface-modal-group"\][\s\S]*"data-task-details-panel": ""[\s\S]*open: true/, "Task Details should be the single collapsible field panel in the page dialog");
assert.match(taskDialogScript, /Task Details[\s\S]*data-task-form-status[\s\S]*data-task-priority[\s\S]*data-task-parent-task[\s\S]*data-task-due-date[\s\S]*data-task-due-time[\s\S]*data-task-resume-note[\s\S]*data-task-next-action[\s\S]*data-task-client[\s\S]*data-task-project[\s\S]*data-task-description[\s\S]*data-task-assignees[\s\S]*data-task-blocked-reason/, "Task Details should contain status, priority, parent, scheduling, resume/next action, context, description, assignment, and blocked reason");
assert.doesNotMatch(taskDialogScript, /Core Task Details|Assignment and Scheduling|<summary class="surface-modal-section-heading">Primary Context<\/summary>|Advanced Details/, "Task Details should not be split into extra modal boxes");
assert.match(taskDialogScript, /function taskEditorChecklistSection[\s\S]*className: \["task-checklist-field", "surface-modal-group"\][\s\S]*"data-task-checklist-field": ""/, "Checklist should be collapsible");
assert.match(taskDialogScript, /function taskEditorRecurrenceSection[\s\S]*className: \["task-recurrence-field", "surface-modal-group", "surface-divider-top"\][\s\S]*"data-task-recurrence-panel": ""/, "Recurrence should remain collapsed by default");
assert.match(taskDialogScript, /function taskEditorReminderSection[\s\S]*className: \["task-reminder-field", "surface-modal-group", "surface-divider-top"\][\s\S]*"data-task-reminder-details": ""/, "Reminders should remain collapsed by default");
assert.match(taskDialogScript, /utilityActions: \[[\s\S]*id: "tags"[\s\S]*id: "files"[\s\S]*id: "copy-link"/, "Tags and Files should move to footer utility actions before commit controls");
assert.match(taskDialogScript, /button\.dataset\.taskTagsToggle[\s\S]*button\.dataset\.taskFilesToggle[\s\S]*button\.dataset\.copyTaskLink/, "Footer utility actions should keep task-owned hooks");
assert.match(taskDialogScript, /function createTaskTagsDialog\(\)[\s\S]*view\.createModal\([\s\S]*title: "Task Tags"/, "Tags picker should mount in a stacked child dialog");
assert.match(taskDialogScript, /function createTaskFilesDialog\(\)[\s\S]*view\.createModal\([\s\S]*title: "Task Files"/, "Files helper should mount in a stacked child dialog");
assert.match(tasksView, /css\/longtail-forge\.css\?v=73/, "Task reflow should cache-bust shared CSS");
assert.match(tasksView, /js\/shared\/icons\.js\?v=4/, "Task reflow should cache-bust shared icons");
assert.match(tasksView, /js\/task-dialog\.js\?v=21/, "Task reflow should cache-bust Task dialog JS");

assert.match(taskDialogScript, /fields\.taskDetailsPanel\.open = !task \|\| isDuplicate/, "Task Details should open for Add/Duplicate and collapse for Edit");
assert.match(taskDialogScript, /writeParentTaskFields/, "Task dialog should populate Parent Task options");
assert.match(taskDialogScript, /readCurrentParentTaskId/, "Task dialog should read current parent relationship state");
assert.match(taskDialogScript, /syncParentTaskRelationship/, "Task dialog should sync parent relationship on save");
assert.match(taskDialogScript, /\/api\/tasks\/\$\{encodeURIComponent\(nextParentTaskId\)\}\/children/, "Task dialog should use the Tasks relationship API to add a parent");
assert.match(taskDialogScript, /fields\.tagToggle\?\.addEventListener\("click", openTaskTagsDialog\)[\s\S]*fields\.fileToggle\?\.addEventListener\("click", openTaskFilesDialog\)/, "Task dialog should open Tags and Files child dialogs from footer buttons");
assert.match(taskDialogScript, /icons\.decorateButton\(fields\.tagToggle, \{ icon: "tag"/, "Tags footer action should use a recognizable tag icon");
assert.match(taskDialogScript, /icons\.decorateButton\(fields\.fileToggle, \{ icon: "file"/, "Files footer action should use a recognizable file icon");
assert.match(taskDialogScript, /function taskEditorFieldNodes\(\)/, "Task-owned editor field nodes should remain present");
assert.doesNotMatch(taskDialogScript, /function taskEditorFieldMarkup\(\)|taskTemplateElements|document\.createElement\("template"\)|innerHTML/, "Task-owned editor fields should not use raw markup templates");
assert.match(taskDialogScript, /data-task-details-panel/, "Task-owned editor fields should include Task Details");
assert.match(taskDialogScript, /button\.dataset\.taskTagsToggle/, "Framework-built footer action should include the Tags hook");

assert.match(stylesheet, /\.task-details-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "Task Details should use a compact two-column grid");
assert.match(stylesheet, /\.task-details-field \{[\s\S]*box-sizing: border-box;[\s\S]*min-width: 0;/, "Task Details should stay inside the modal group boundary");
assert.match(stylesheet, /\.task-details-grid > label \{[\s\S]*min-width: 0;/, "Task Details controls should shrink inside their grid columns");
assert.match(stylesheet, /\.task-blocked-reason-field,[\s\S]*\.task-assignee-field,[\s\S]*\.task-parent-field,[\s\S]*\.task-description-field \{[\s\S]*grid-column: 1 \/ -1;/, "Full-width task modal fields should span both columns");
assert.doesNotMatch(stylesheet, /\.task-footer-panel \{[\s\S]*grid-column: 1 \/ -1;/, "Tags and Files should no longer add parent-body footer panels below the main sections");

assert.match(iconsScript, /tag: Object\.freeze/, "Shared icons should include a tag icon");
assert.match(iconsScript, /file: Object\.freeze/, "Shared icons should include a file icon");
assert.match(tasksModule, new RegExp(`version: "${escapeRegExp(currentTasksVersion)}"`), "Tasks module version should match the current Tasks release");

console.log("Task modal reflow regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
