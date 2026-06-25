import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.11.4";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const taskDialogScript = readText("public/js/task-dialog.js");
const stylesheet = readText("public/css/longtail-forge.css");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current Tasks release");

assert.match(taskDialogScript, /id: "task_details", label: "Task Details"[\s\S]*id: "checklist", label: "Checklist"[\s\S]*id: "recurrence", label: "Recurrence"[\s\S]*id: "timer", label: "Task Timer"[\s\S]*id: "reminders", label: "Reminders"[\s\S]*id: "notes", label: "Notes"/, "Task editor descriptor should declare one Task Details section before specialized escape hatches");
assert.match(taskDialogScript, /Task Details[\s\S]*Checklist[\s\S]*Recurrence[\s\S]*Task Timer[\s\S]*Reminders[\s\S]*Notes/, "Task editor markup should keep Task Details before specialized escape hatches");
assert.doesNotMatch(taskDialogScript, /Core Task Details|Assignment and Scheduling|<summary class="surface-modal-section-heading">Primary Context<\/summary>|Advanced Details/, "Task Details should not be split into extra visible section boxes");
assert.doesNotMatch(taskDialogScript, /task-core-details-field|task-assignment-schedule-field|task-primary-context-field|task-advanced-details-field/, "Task Details should not keep obsolete split-section classes");
assert.match(taskDialogScript, /taskEditorDetailsSection[\s\S]*Task Details[\s\S]*data-task-form-status[\s\S]*data-task-priority[\s\S]*data-task-parent-task[\s\S]*data-task-due-date[\s\S]*data-task-due-time[\s\S]*data-task-resume-note[\s\S]*data-task-next-action[\s\S]*data-task-client[\s\S]*data-client-workspace-control[\s\S]*data-task-project[\s\S]*data-task-description[\s\S]*data-task-assignees[\s\S]*data-task-blocked-reason/, "Task Details should keep parent, scheduling, context, description, assignment, and blocked reason in the requested order");
assert.match(taskDialogScript, /const isBlocked = fields\.status\?\.value === "blocked"[\s\S]*fields\.blockedReasonField\.hidden = !isBlocked;[\s\S]*fields\.blockedReason\.disabled = !isBlocked;/, "Blocked Reason should only be selectable when status is blocked");

assert.match(taskDialogScript, /dialog\.querySelectorAll\("\[data-client-workspace-control\]"\)\.forEach\(\(element\) => \{[\s\S]*element\.hidden = !hasClientScope;/, "Personal and Family workspaces should hide Client controls");
assert.match(taskDialogScript, /function usesClientScope\(\)[\s\S]*workspaceType === "business"/, "Client visibility should remain workspace-type driven");
assert.match(taskDialogScript, /option\("", "No client"\)[\s\S]*option\("", "No project"\)/, "Client and Project context should use nullable labels instead of filter labels");
assert.doesNotMatch(taskDialogScript, /option\("all", "All Projects"\)/, "Task editor context selects should not use the old filter-style All Projects option");
assert.match(taskDialogScript, /client_id: usesClientScope\(\) \? fields\.client\.value : ""/, "Personal and Family task saves should keep client context empty");

assert.match(taskDialogScript, /fields\.project\?\.addEventListener\("change", \(\) => \{[\s\S]*syncClientFromSelectedProject\(\);[\s\S]*applySelectedProjectTaskDefaults\(\);/, "Project changes should derive Client before project task defaults run");
assert.match(taskDialogScript, /function syncClientFromSelectedProject\(\)[\s\S]*const project = findProjectOption\(fields\.project\.value\)[\s\S]*const derivedClientId = project\.client_id \|\| ""[\s\S]*fields\.client\.value = derivedClientId[\s\S]*populateProjectInput\(fields\.project\.value\)/, "Project selection should derive the Business client and preserve the selected project");
assert.match(taskDialogScript, /populateProjectInput\(selectedProjectId, task, \{ allowFallback: true \}\);[\s\S]*syncClientFromSelectedProject\(\);/, "Default project opens should derive Client before the modal is shown");

assert.match(taskDialogScript, /function ensureClientOption\(selectedClientId = "", sourceTask = currentTask\)[\s\S]*clientFallbackLabel\(sourceTask/, "Edit opens should preserve missing selected clients with safe fallback labels");
assert.match(taskDialogScript, /function projectFallbackLabel\(sourceTask = null\)[\s\S]*return `\$\{projectName\} - \$\{clientName\}`[\s\S]*return projectName \|\| "Unavailable project"/, "Project fallback labels should prefer readable names and never the raw id");
assert.match(taskDialogScript, /function clientFallbackLabel\(sourceTask = null\)[\s\S]*return sourceTask\?\.client_name \|\| sourceTask\?\.clientName \|\| "Unavailable client"/, "Client fallback labels should prefer readable names and never the raw id");
assert.doesNotMatch(taskDialogScript, /return selected(Client|Project)Id/, "Fallback context labels should not expose raw selected ids in normal UI");

assert.match(stylesheet, /\.task-details-field \{[\s\S]*box-sizing: border-box;[\s\S]*min-width: 0;/, "Task Details should stay inside the modal group boundary");
assert.match(stylesheet, /\.task-details-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "Task Details should keep the compact two-column field layout");
assert.match(stylesheet, /\.task-details-grid > label \{[\s\S]*min-width: 0;/, "Task Details controls should shrink inside their grid columns");
assert.match(stylesheet, /\.task-blocked-reason-field,[\s\S]*\.task-assignee-field,[\s\S]*\.task-parent-field,[\s\S]*\.task-description-field \{[\s\S]*grid-column: 1 \/ -1;/, "Full-width Task Details fields should span both columns");
assert.doesNotMatch(stylesheet, /task-core-details-field|task-assignment-schedule-field|task-primary-context-field|task-advanced-details-field/, "Stylesheet should not keep obsolete split-section task modal classes");
assert.doesNotMatch(stylesheet, /\.task-detail-dialog\s*\{[\s\S]*width:/, "Task modal should use the framework wide modal width rather than a narrower Task-only override");
assert.match(regressionSuite, /scripts\/tasks-modal-context-sections-regression\.mjs/, "Regression suite should include the 9.3 context/section regression");

console.log("Tasks modal context sections regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

