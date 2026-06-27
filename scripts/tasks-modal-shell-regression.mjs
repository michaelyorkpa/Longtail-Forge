import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.12.5";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const taskDialogScript = readText("public/js/task-dialog.js");
const stylesheet = readText("public/css/longtail-forge.css");
const tasksView = readText("views/protected/tasks.html");
const workbenchView = readText("views/protected/workbench.html");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(tasksModule, new RegExp(`version: "${escapeRegExp(appVersion)}"`), "Tasks module version should match the current Tasks release");

assert.match(taskDialogScript, /function createTaskEditorDialog\(\)/, "Task dialog should create one canonical editor dialog");
assert.match(taskDialogScript, /const descriptor = taskEditorModalDescriptor\(\)/, "Task dialog should describe the modal before rendering");
assert.match(taskDialogScript, /view\.renderDescriptorModalForm\(descriptor, \{[\s\S]*className: "task-detail-dialog"[\s\S]*formClassName: "task-form"[\s\S]*size: descriptor\.size[\s\S]*fields: taskEditorFieldNodes\(\)[\s\S]*utilityActions: taskEditorUtilityActions\(descriptor\)[\s\S]*actions: taskEditorCommitActions\(descriptor\)/, "Task editor should render through the framework descriptor modal form helper");
assert.match(taskDialogScript, /function requireTaskDialogView\(\)[\s\S]*renderDescriptorModalForm[\s\S]*createModalForm[\s\S]*showModal[\s\S]*closeModal[\s\S]*createActionButton[\s\S]*createElement/, "Task editor should require framework modal/action helpers");
assert.match(taskDialogScript, /function taskEditorModalDescriptor\(\)[\s\S]*id: "task\.editor"[\s\S]*title: "Task"[\s\S]*size: "wide"/, "Task editor descriptor should name the canonical Task modal");
assert.doesNotMatch(taskDialogScript, /<dialog class="task-detail-dialog[^"]*" data-task-dialog>/, "Task editor dialog shell should not be hand-authored as fallback markup");
assert.doesNotMatch(taskDialogScript, /<form method="dialog" class="task-form" data-task-form>/, "Task editor form shell should not be hand-authored as fallback markup");

assert.match(taskDialogScript, /dialog\.dataset\.taskDialog = ""/, "Framework-built dialog should keep the task dialog hook");
assert.match(taskDialogScript, /dialog\.viewParts\.form\.dataset\.taskForm = ""/, "Framework-built form should keep the task form hook");
assert.match(taskDialogScript, /dialog\.viewParts\.title\.dataset\.taskDialogTitle = ""/, "Framework-built title should keep the task title hook");
assert.match(taskDialogScript, /dialog\.viewParts\.body\.classList\.add\("task-form-fields"\)/, "Framework-built modal body should keep task field styling");
assert.match(taskDialogScript, /dialog\.viewParts\.footer\.classList\.add\("form-actions", "task-modal-actions", "surface-modal-footer--dense"\)/, "Framework-built footer should keep task footer styling");
assert.match(taskDialogScript, /dialog\.viewParts\.footer\.dataset\.modalFooter = ""/, "Framework-built footer should keep the modal footer hook");
assert.match(taskDialogScript, /notificationToggle\.dataset\.taskNotificationToggle = ""[\s\S]*notificationToggle\.hidden = true[\s\S]*notificationToggle\.setAttribute\("aria-pressed", "false"\)/, "Notification follow utility should stay a direct bell toggle");

assert.match(taskDialogScript, /function taskEditorUtilityActions\(descriptor\)[\s\S]*view\.createActionButton[\s\S]*className: "surface-modal-footer-action"[\s\S]*data(TaskTagsToggle|set\.taskTagsToggle)[\s\S]*data(TaskFilesToggle|set\.taskFilesToggle)[\s\S]*copyTaskLink[\s\S]*button\.hidden = true/, "Task utility actions should be framework action buttons with task-owned hooks");
assert.match(taskDialogScript, /function taskEditorCommitActions\(descriptor\)[\s\S]*view\.createActionButton[\s\S]*type: action\.id === "save" \? "submit" : "button"[\s\S]*cancelTask[\s\S]*saveTask/, "Task commit actions should be framework action buttons with task-owned hooks");
assert.ok(
  taskDialogScript.indexOf("function taskEditorUtilityActions") < taskDialogScript.indexOf("function taskEditorCommitActions"),
  "Footer utility actions should be declared before commit actions",
);

for (const taskOwnedFragment of [
  "data-task-checklist-field",
  "data-task-recurrence-panel",
  "data-task-timer-field",
  "data-task-tags-dialog",
  "data-task-files-dialog",
  "data-task-notes-panel",
  "data-client-workspace-control",
]) {
  assert.match(taskDialogScript, new RegExp(taskOwnedFragment), `${taskOwnedFragment} should remain on the Tasks-owned field path`);
}

assert.match(taskDialogScript, /dialog\.querySelectorAll\("\[data-client-workspace-control\]"\)\.forEach\(\(element\) => \{[\s\S]*element\.hidden = !hasClientScope;/, "Task modal should still hide Client controls outside Business scope");
assert.match(taskDialogScript, /function usesClientScope\(\)[\s\S]*workspaceType === "business"/, "Task modal should still derive Client visibility from workspace type");
assert.match(taskDialogScript, /function createTaskRecurrenceDialog\(\)[\s\S]*view\.createModalForm\(\{[\s\S]*className: "task-recurrence-dialog"[\s\S]*formClassName: "task-recurrence-form"[\s\S]*fields: taskRecurrenceFieldNodes\(\)[\s\S]*actions: taskRecurrenceActions\(descriptor\)/, "Recurrence should use a framework modal shell with Tasks-owned fields and actions");
assert.match(taskDialogScript, /dialog\.dataset\.taskRecurrenceDialog = ""[\s\S]*dialog\.viewParts\.form\.dataset\.taskRecurrenceForm = ""[\s\S]*dialog\.viewParts\.body\.classList\.add\("task-recurrence-fields"\)/, "Framework-built recurrence dialog should keep task hooks for recurrence behavior");
assert.match(taskDialogScript, /showTaskModal\(dialog, \{ trigger: returnFocusTo \}\)/, "Task editor should open through the shared modal stack helper");
assert.match(taskDialogScript, /showTaskModal\(recurrenceDialog, \{ parent: dialog, trigger: fields\.recurrenceDetails \}\)/, "Recurrence child dialog should open through the shared modal stack helper with the Task editor as parent");
assert.match(taskDialogScript, /closeTaskModal\(recurrenceDialog, "saved"\)/, "Recurrence save should close through the shared modal stack helper");
assert.doesNotMatch(taskDialogScript, /<dialog class="task-recurrence-dialog"/, "Recurrence dialog shell should not be hand-authored as raw dialog markup");

assert.match(stylesheet, /\.task-form > \.view-modal-form-fields \{[\s\S]*display: grid;[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*padding: 0;/, "Task modal should let the framework field grid own placement without extra padding");
assert.match(stylesheet, /\.task-details-field \{[\s\S]*box-sizing: border-box;[\s\S]*min-width: 0;/, "Task Details should stay inside the framework modal field grid");
assert.match(stylesheet, /\.task-details-grid > label \{[\s\S]*min-width: 0;/, "Task Details controls should shrink safely in their grid columns");

assert.ok(
  tasksView.indexOf("js/shared/view-builder.js?v=16") < tasksView.indexOf("js/shared/view-renderer.js?v=12")
    && tasksView.indexOf("js/shared/view-renderer.js?v=12") < tasksView.indexOf("js/task-dialog.js?v=21")
    && tasksView.indexOf("js/task-dialog.js?v=21") < tasksView.indexOf("js/tasks.js?v=20"),
  "Tasks host should load framework view helpers before the Task dialog and page controller",
);
assert.ok(
  workbenchView.indexOf("js/shared/view-builder.js?v=16") < workbenchView.indexOf("js/shared/view-renderer.js?v=12")
    && workbenchView.indexOf("js/shared/view-renderer.js?v=12") < workbenchView.indexOf("js/task-dialog.js?v=21"),
  "Workbench host should load framework view helpers before the shared Task dialog",
);
assert.match(regressionSuite, /scripts\/tasks-modal-shell-regression\.mjs/, "Task modal shell regression should be included in the regression suite");

console.log("Tasks modal shell regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
