import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.21.7.6";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tasksModule = readText("src/modules/tasks/module.js");
const taskDialogScript = readText("public/js/task-dialog.js");
const tasksScript = readText("public/js/tasks.js");
const workbenchScript = readText("public/js/workbench.js");
const workbenchView = readText("views/protected/workbench.html");
const moduleActions = readText("public/js/shared/module-actions.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the current app version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the current app version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should report the current Tasks release");

assert.match(taskDialogScript, /async function openTaskEditor\(params = \{\}, hostContext = null\)/, "Task dialog should expose one canonical editor opener");
assert.match(taskDialogScript, /function normalizeTaskEditorRequest\(params = \{\}, hostContext = null\)/, "Canonical opener should normalize add/edit/default request shape");
assert.match(taskDialogScript, /function normalizeTaskEditorDefaults\(params = \{\}\)[\s\S]*sourceContext[\s\S]*params\.defaults[\s\S]*clientId[\s\S]*projectId[\s\S]*dueDate[\s\S]*nextAction/, "Canonical opener should accept defaults and source context from callers");
assert.match(taskDialogScript, /const needsTaskFetch = Boolean\(taskId\) && !task && \(mode === "edit" \|\| duplicate\)[\s\S]*needsStandaloneContext: Boolean\(hostContext\) \|\| !context \|\| needsTaskFetch/, "Canonical opener should refresh standalone host context and fetch task-backed edit/duplicate opens");
assert.match(taskDialogScript, /function openAdd\(params = \{\}, hostContext = null\)[\s\S]*return openTaskEditor\(\{ \.\.\.params, mode: "add" \}, hostContext\)/, "Legacy add opener should delegate to the canonical opener");
assert.match(taskDialogScript, /function openEdit\(params = \{\}, hostContext = null\)[\s\S]*return openTaskEditor\(\{ \.\.\.params, mode: "edit" \}, hostContext\)/, "Legacy edit opener should delegate to the canonical opener");
assert.match(taskDialogScript, /const taskDialogApi = \{[\s\S]*open,[\s\S]*openAdd,[\s\S]*openEdit,[\s\S]*openTaskEditor/, "Task dialog API should publish the canonical opener while preserving aliases");
assert.match(taskDialogScript, /namespace\.moduleActions\?\.register\?\.\(\{[\s\S]*id: "tasks\.add"[\s\S]*open: \(params, hostContext\) => openTaskEditor\(\{ \.\.\.params, mode: "add" \}, hostContext\)/, "Registered task add action should use the canonical opener");
assert.match(taskDialogScript, /namespace\.moduleActions\?\.register\?\.\(\{[\s\S]*id: "tasks\.edit"[\s\S]*open: \(params, hostContext\) => openTaskEditor\(\{ \.\.\.params, mode: "edit" \}, hostContext\)/, "Registered task edit action should use the canonical opener");

assert.match(moduleActions, /id: "tasks\.add"[\s\S]*open: \(params, hostContext\) => namespace\.tasksDialog\.openTaskEditor\(\{ \.\.\.params, mode: "add" \}, hostContext\)/, "Framework task add action should call the canonical opener");
assert.match(moduleActions, /id: "tasks\.edit"[\s\S]*open: \(params, hostContext\) => namespace\.tasksDialog\.openTaskEditor\(\{ \.\.\.params, mode: "edit" \}, hostContext\)/, "Framework task edit action should call the canonical opener");
assert.match(moduleActions, /const trigger = document\.activeElement[\s\S]*trigger,/, "Module actions should expose the triggering control for focus return");

assert.match(tasksScript, /view\.registerBehavior\("tasks\.create", \(\) => openTaskDialog\(\)\)/, "Tasks descriptor create behavior should open the shared task editor wrapper");
assert.match(tasksScript, /function openTaskDialog\(task = null, options = \{\}\)[\s\S]*tasksDialog\.openTaskEditor\(\{[\s\S]*defaults: options\.defaults \|\| \{\}[\s\S]*mode: task && options\.duplicate !== true \? "edit" : "add"[\s\S]*returnFocusTo: options\.returnFocusTo \|\| document\.activeElement[\s\S]*task,[\s\S]*\}, options\.hostContext \|\| null\)/, "Tasks page should use the canonical task editor opener for add/edit/duplicate/focus flows");
assert.doesNotMatch(tasksScript, /tasksDialog\.open\(\{/, "Tasks page should not call the low-level task dialog open path directly");

assert.match(workbenchView, /data-workbench-add-task/, "Workbench should keep a task creation trigger");
assert.match(workbenchScript, /moduleActions\.open\("tasks\.add", \{[\s\S]*context: \{ source: "workbench" \}[\s\S]*\}, \{ refresh: loadWorkbench, setStatus \}\)/, "Workbench add task should pass source context and refresh hook into module actions");
assert.match(workbenchScript, /moduleActions\.open\("tasks\.edit", \{[\s\S]*context: \{ source: "workbench", sourceType: "task-workbench-item" \}[\s\S]*recordId: task\.task_id[\s\S]*taskId: task\.task_id[\s\S]*\}, \{ refresh: loadWorkbench, setStatus \}\)/, "Workbench edit task should use the same canonical module action path");
assert.doesNotMatch(workbenchView, /data-task-form|data-task-dialog|data-task-title/, "Workbench must not duplicate task editor markup");
assert.doesNotMatch(workbenchScript, /tasksDialog\.open(Add|Edit)?\(/, "Workbench should not bypass module actions or the canonical opener");

assert.match(taskDialogScript, /await notifyTaskEditorSaved\(result\)/, "Task save should use one callback/refresh notification helper");
assert.match(taskDialogScript, /function notifyTaskEditorSaved\(result\)[\s\S]*configuredCallback[\s\S]*requestCallback[\s\S]*requestRefresh[\s\S]*hostRefresh/, "Task save should support configured callbacks, per-open callbacks, and caller refresh hooks");
assert.match(taskDialogScript, /restoreTaskEditorFocus\(returnFocusTo\)/, "Task dialog should restore focus when the editor closes");
assert.match(taskDialogScript, /function restoreTaskEditorFocus\(target\)[\s\S]*target\.isConnected[\s\S]*target\.focus\(\)/, "Focus restoration should target a live caller control");
assert.match(regressionSuite, /scripts\/tasks-canonical-editor-opener-regression\.mjs/, "Regression suite should include the canonical task editor opener regression");

console.log("Tasks canonical editor opener regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
