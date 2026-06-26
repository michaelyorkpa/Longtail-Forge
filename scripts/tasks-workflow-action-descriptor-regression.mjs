import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.18.11.13";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const tasksRoutes = readText("src/modules/tasks/tasks.routes.js");
const tasksScript = readText("public/js/tasks.js");
const taskDialogScript = readText("public/js/task-dialog.js");
const tasksStyles = readText("public/css/longtail-forge.css");
const tasksView = readText("views/protected/tasks.html");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current app version");

const workflowHandlers = constBlock(tasksScript, "TASK_WORKFLOW_BEHAVIOR_HANDLERS");
const registerWorkflows = functionBlock(tasksScript, "registerTaskWorkflowBehaviors");
const createActions = functionBlock(tasksScript, "createActions");
const workflowMenu = functionBlock(tasksScript, "createTaskWorkflowActionMenu");
const workflowDescriptor = functionBlock(tasksScript, "taskWorkflowActionMenuDescriptor");
const workflowButton = functionBlock(tasksScript, "taskWorkflowActionButton");
const disabledReason = functionBlock(tasksScript, "taskWorkflowDisabledReason");
const permissionCheck = functionBlock(tasksScript, "hasTaskWorkflowPermission");
const timerDisabledReason = functionBlock(tasksScript, "taskTimerDisabledReason");
const runWorkflowAction = functionBlock(tasksScript, "runTaskWorkflowAction");
const openWorkflowDialog = functionBlock(tasksScript, "openTaskDialogForWorkflow");
const saveTimerAction = functionBlock(tasksScript, "saveTaskTimerAction");
const readElapsed = functionBlock(tasksScript, "readTaskTimerElapsedSeconds");
const configureDialog = functionBlock(tasksScript, "configureTaskDialog");
const normalizeFocus = functionBlock(taskDialogScript, "normalizeTaskEditorFocusTarget");
const openTaskEditor = functionBlock(taskDialogScript, "openTaskEditor");
const openEditor = functionBlock(taskDialogScript, "open");
const focusTarget = functionBlock(taskDialogScript, "focusTaskEditorTarget");

assert.match(registerWorkflows, /taskWorkflowActionMenuDescriptor\(\)\.actions\.forEach[\s\S]*view\.registerBehavior\(action\.behavior, handler\)/, "Workflow behaviors should be registered through the view behavior registry");
assert.match(workflowHandlers, /"tasks\.workflow\.assign"[\s\S]*openTaskDialogForWorkflow\(record, action, trigger\)/, "Assign should dispatch to the canonical task editor");
assert.match(workflowHandlers, /"tasks\.workflow\.due-date"[\s\S]*openTaskDialogForWorkflow\(record, action, trigger\)/, "Due date should dispatch to the canonical task editor");
assert.match(workflowHandlers, /"tasks\.workflow\.due-time"[\s\S]*openTaskDialogForWorkflow\(record, action, trigger\)/, "Due time should dispatch to the canonical task editor");
assert.match(workflowHandlers, /"tasks\.workflow\.recurrence"[\s\S]*openTaskDialogForWorkflow\(record, action, trigger\)/, "Recurrence should dispatch to the canonical task editor");
assert.match(workflowHandlers, /"tasks\.workflow\.timer\.start"[\s\S]*saveTaskTimerAction\(record, action\.timerStatus \|\| "running"\)/, "Start timer should dispatch to the Tasks timer handler");
assert.match(workflowHandlers, /"tasks\.workflow\.timer\.pause"[\s\S]*saveTaskTimerAction\(record, action\.timerStatus \|\| "paused"\)/, "Pause timer should dispatch to the Tasks timer handler");
assert.match(workflowHandlers, /"tasks\.workflow\.timer\.resume"[\s\S]*saveTaskTimerAction\(record, action\.timerStatus \|\| "running"\)/, "Resume timer should dispatch to the Tasks timer handler");

assert.match(createActions, /createTaskWorkflowActionMenu\(task\)[\s\S]*createTaskLifecycleActionStrip\(task\)/, "Task rows should place workflow actions through the framework workflow menu before lifecycle actions");
assert.match(workflowMenu, /view\.createDetailActionMenu\(\{[\s\S]*ariaLabel:\s*"Task workflow actions"[\s\S]*className:\s*"task-row-workflow-actions"[\s\S]*floating:\s*true[\s\S]*actions/, "Workflow placement should use the framework floating detail action menu");
assert.match(workflowButton, /view\.createActionButton\(options\)/, "Workflow buttons should use the framework action button helper when available");
assert.match(workflowButton, /disabled:\s*Boolean\(disabledReason\)/, "Workflow button disabled display should be driven through the framework action helper");
assert.match(workflowButton, /dataset\.taskWorkflowAction = action\.id[\s\S]*dataset\.taskWorkflowBehavior = action\.behavior/, "Workflow buttons should expose stable action and behavior hooks");

[
  ["assign-task", "Assign", "tasks.workflow.assign", "assignees"],
  ["change-task-due-date", "Due Date", "tasks.workflow.due-date", "due_date"],
  ["change-task-due-time", "Due Time", "tasks.workflow.due-time", "due_time"],
  ["apply-task-recurrence", "Recurrence", "tasks.workflow.recurrence", "recurrence"],
].forEach(([id, label, behavior, target]) => {
  assert.match(workflowDescriptor, new RegExp(`id:\\s*"${id}"[\\s\\S]*label:\\s*"${label}"[\\s\\S]*behavior:\\s*"${escapeRegExp(behavior)}"[\\s\\S]*focusTarget:\\s*"${target}"`), `${label} should declare behavior and canonical editor focus target`);
});

assert.match(workflowDescriptor, /id:\s*"assign-task"[\s\S]*requiredPermissions:\s*\["tasks\.assign"\][\s\S]*requiredAnyPermissions:\s*\["tasks\.edit_all", "tasks\.edit_own"\]/, "Assign should declare assign and edit permission intent");
assert.match(workflowDescriptor, /id:\s*"start-task-timer"[\s\S]*behavior:\s*"tasks\.workflow\.timer\.start"[\s\S]*timerStatus:\s*"running"[\s\S]*timerVisibility:\s*"none"[\s\S]*requiredPermissions:\s*\["tasks\.view", "time_entries\.create"\]/, "Start timer should declare timer permission and no-active-timer visibility");
assert.match(workflowDescriptor, /id:\s*"pause-task-timer"[\s\S]*behavior:\s*"tasks\.workflow\.timer\.pause"[\s\S]*timerStatus:\s*"paused"[\s\S]*timerVisibility:\s*"running"/, "Pause timer should only display for running task timers");
assert.match(workflowDescriptor, /id:\s*"resume-task-timer"[\s\S]*behavior:\s*"tasks\.workflow\.timer\.resume"[\s\S]*timerStatus:\s*"running"[\s\S]*timerVisibility:\s*"paused"/, "Resume timer should only display for paused task timers");
assert.doesNotMatch(workflowDescriptor, /assignee_replace|due_date", task_ids|due_time", task_ids|recurrence_template_id/, "Row workflow actions should not add inline edit payloads that bypass the canonical editor");

assert.match(disabledReason, /hasTaskWorkflowPermission\(action, task\)/, "Workflow disabled state should include permission display");
assert.match(permissionCheck, /requiredPermissions[\s\S]*requiredAnyPermissions/, "Workflow permission display should understand both all-of and any-of permission declarations");
assert.match(timerDisabledReason, /Task timers are disabled[\s\S]*Time Tracking is disabled[\s\S]*project-linked task[\s\S]*Completed and archived tasks cannot use task timers/, "Timer disabled state should mirror shipped timer eligibility reasons");
assert.match(runWorkflowAction, /handler\(\{[\s\S]*record:\s*task[\s\S]*refresh:\s*reloadTaskList[\s\S]*trigger/, "Workflow handlers should receive the Tasks record, refresh hook, and trigger");
assert.match(openWorkflowDialog, /openTaskDialog\(task, \{[\s\S]*focusTarget:\s*action\.focusTarget \|\| ""[\s\S]*returnFocusTo:\s*trigger \|\| document\.activeElement/, "Complex workflow actions should reopen the canonical task editor with field focus and focus return");
assert.match(saveTimerAction, /api\.putJson\(`\/api\/tasks\/\$\{encodeURIComponent\(task\.task_id\)\}\/timer`[\s\S]*timer_status:[\s\S]*accumulated_elapsed_seconds:[\s\S]*last_active_start_time:[\s\S]*if \(result\.task\)[\s\S]*upsertTask\(result\.task\)[\s\S]*await reloadTaskList\(\)/, "Timer workflow actions should use existing Tasks timer routes, apply returned task state, and refresh the list");
assert.match(readElapsed, /accumulated_elapsed_seconds[\s\S]*timer\.timer_status !== "running"[\s\S]*Date\.now\(\) - startedAt/, "Timer pause should preserve elapsed running time");
assert.match(configureDialog, /onSaved:\s*async \(result\) => \{[\s\S]*await reloadTaskList\(\)/, "Canonical editor saves should refresh the task list consistently");

assert.match(openTaskEditor, /focusTarget:\s*request\.focusTarget/, "Task editor opener should pass focus targets into the canonical modal");
assert.match(openEditor, /focusTaskEditorTarget\(focusNotes \? "notes" : focusTarget\)/, "Task editor should focus requested workflow targets after opening");
assert.match(normalizeFocus, /assign:[\s\S]*assignees[\s\S]*due_date:[\s\S]*due_time:[\s\S]*recurrence:[\s\S]*timer:/, "Task editor should normalize workflow focus target aliases");
assert.match(focusTarget, /assignees:\s*fields\.assignees[\s\S]*due_date:\s*fields\.dueDate[\s\S]*due_time:\s*fields\.dueTime[\s\S]*recurrence:\s*fields\.recurring[\s\S]*panel\.open = true/, "Task editor should focus the canonical controls and open their section panels");
assert.match(taskDialogScript, /data-client-workspace-control/, "Canonical task editor should remain the owner of Business-only Client visibility");

assert.match(tasksStyles, /\.task-row-actions \.view-detail-action-menu-list \.icon-button[\s\S]*width:\s*100%[\s\S]*justify-content:\s*flex-start/, "Workflow menu icon/text buttons should not inherit the dense row icon-only width");
assert.match(tasksStyles, /\.view-detail-action-menu\[data-view-floating-menu\] \.view-detail-action-menu-list\s*\{[\s\S]*position:\s*fixed;[\s\S]*visibility:\s*hidden/, "Workflow menu list should float outside the Tasks row action rail until positioned");
assert.match(tasksStyles, /\.view-detail-action-menu\[data-view-floating-menu\]\[data-view-floating-menu-positioned\] \.view-detail-action-menu-list\s*\{[\s\S]*visibility:\s*visible/, "Workflow menu list should become visible only after shared viewport positioning");
assert.match(tasksRoutes, /tasksRoutes\.put\("\/tasks\/:taskId\/timer"[\s\S]*taskTimersService\.save/, "Browser API should keep timer start/pause/resume on the existing task timer route");
assert.match(tasksView, /css\/longtail-forge\.css\?v=69[\s\S]*js\/shared\/view-builder\.js\?v=16[\s\S]*js\/shared\/view-renderer\.js\?v=12[\s\S]*js\/task-dialog\.js\?v=21[\s\S]*js\/tasks\.js\?v=20/, "Tasks host should load the workflow descriptor cache key");
assert.match(regressionSuite, /scripts\/tasks-workflow-action-descriptor-regression\.mjs/, "Regression suite should include the task workflow descriptor regression");

console.log("Tasks workflow action descriptor regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function constBlock(source, constName) {
  const start = source.indexOf(`const ${constName}`);
  assert.notEqual(start, -1, `${constName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:async\s+)?function\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}

