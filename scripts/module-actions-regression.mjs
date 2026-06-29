import assert from "node:assert/strict";
import fs from "node:fs";

const moduleActionsSource = fs.readFileSync("public/js/shared/module-actions.js", "utf8");
const workbenchView = fs.readFileSync("views/protected/workbench.html", "utf8");
const taskView = fs.readFileSync("views/protected/tasks.html", "utf8");
const timeEntriesView = fs.readFileSync("views/protected/time-entries.html", "utf8");
const projectsView = fs.readFileSync("views/protected/projects.html", "utf8");
const clientsView = fs.readFileSync("views/protected/clients.html", "utf8");
const workbenchScript = fs.readFileSync("public/js/workbench.js", "utf8");
const tasksScript = fs.readFileSync("public/js/tasks.js", "utf8");
const taskDialogScript = fs.readFileSync("public/js/task-dialog.js", "utf8");
const timeEntryDialogScript = fs.readFileSync("public/js/time-entry-dialog.js", "utf8");
const timeEntriesScript = fs.readFileSync("public/js/time-entries.js", "utf8");
const clientsProjectsScript = fs.readFileSync("public/js/clients-projects.js", "utf8");
let checks = 0;

function check(name, assertion) {
  assertion();
  checks += 1;
}

check("first-party module modal actions are registered", () => {
  [
    "tasks.add",
    "tasks.edit",
    "time-entries.add",
    "time-entries.edit",
    "projects.add",
    "projects.edit",
    "clients.add",
    "clients.edit",
  ].forEach((actionId) => assert.match(moduleActionsSource, new RegExp(`id: "${actionId.replace(".", "\\.")}"`)));
});

check("module action availability respects module and workspace state", () => {
  assert.match(moduleActionsSource, /function isModuleAvailable/);
  assert.match(moduleActionsSource, /enabledModules\.includes\(moduleId\)/);
  assert.match(moduleActionsSource, /function isWorkspaceTypeAvailable/);
  assert.match(moduleActionsSource, /requiredCapabilities\.some\(\(capability\) => capabilities\.includes\(capability\)\)/);
  assert.match(moduleActionsSource, /workspaceTypes: \["business"\]/);
  assert.match(moduleActionsSource, /id: "clients\.add"[\s\S]*workspaceTypes: \["business"\]/);
  assert.match(moduleActionsSource, /id: "clients\.edit"[\s\S]*workspaceTypes: \["business"\]/);
  assert.match(moduleActionsSource, /id: "projects\.add"[\s\S]*requiredWorkspaceCapabilities: \["projects", "clients_projects"\]/);
});

check("module action registry dispatches callbacks without iframe bridge", () => {
  assert.doesNotMatch(moduleActionsSource, /document\.createElement\("iframe"\)/);
  assert.doesNotMatch(moduleActionsSource, /set\("moduleAction"/);
  assert.doesNotMatch(moduleActionsSource, /moduleActionId/);
  assert.doesNotMatch(moduleActionsSource, /postMessage/);
  assert.doesNotMatch(moduleActionsSource, /href:/);
  assert.doesNotMatch(moduleActionsSource, /signalComplete/);
});

check("module action registry supports module-owned dialog callbacks", () => {
  assert.match(moduleActionsSource, /typeof action\.open === "function"/);
  assert.match(moduleActionsSource, /openRegisteredDialog\(action, params, hostContext\)/);
  assert.match(moduleActionsSource, /typeof action\.canOpen === "function"/);
  assert.match(moduleActionsSource, /complete: \(detail = \{\}\) => finish\(true, detail\)/);
  assert.match(moduleActionsSource, /cancel: \(detail = \{\}\) => finish\(false, detail\)/);
});

check("module action registry exposes dialog contract metadata", () => {
  [
    "actionId",
    "moduleId",
    "recordType",
    "mode",
    "requiredPermissions",
    "requiredWorkspaceCapabilities",
    "requiredModules",
  ].forEach((field) => assert.match(moduleActionsSource, new RegExp(`${field}:`)));
});

check("host and target pages load the shared action contract", () => {
  [
    workbenchView,
    taskView,
    timeEntriesView,
    projectsView,
    clientsView,
  ].forEach((view) => assert.match(view, /js\/shared\/module-actions\.js/));
});

check("Workbench Add Task dispatches a module action instead of navigating away", () => {
  assert.match(workbenchView, /data-workbench-add-task/);
  assert.doesNotMatch(workbenchView, /href="tasks\.html\?new=1"/);
  assert.match(workbenchScript, /moduleActions\.open\("tasks\.add", \{[\s\S]*context: \{ source: "workbench" \}[\s\S]*\}, \{ refresh: loadWorkbench, setStatus \}\)/);
});

check("Tasks actions use module-owned reusable dialog helpers", () => {
  assert.match(workbenchView, /js\/task-dialog\.js/);
  assert.match(taskView, /js\/task-dialog\.js/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.tasksDialog\.openTaskEditor\(\{ \.\.\.params, mode: "add" \}, hostContext\)/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.tasksDialog\.openTaskEditor\(\{ \.\.\.params, mode: "edit" \}, hostContext\)/);
  assert.match(taskDialogScript, /namespace\.moduleActions\?\.register\?\.\(\{/);
  assert.match(taskDialogScript, /actionId: "tasks\.add"/);
  assert.match(taskDialogScript, /actionId: "tasks\.edit"/);
  assert.match(tasksScript, /tasksDialog\?\.configure/);
  assert.match(tasksScript, /tasksDialog\.openTaskEditor/);
});

check("Time Entry actions use module-owned reusable dialog helpers", () => {
  assert.match(workbenchView, /js\/time-entry-dialog\.js/);
  assert.match(timeEntriesView, /js\/time-entry-dialog\.js/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.timeEntryDialog\.openAdd\(params, hostContext\)/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.timeEntryDialog\.openEdit\(params, hostContext\)/);
  assert.match(timeEntryDialogScript, /actionId: "time-entries\.add"/);
  assert.match(timeEntryDialogScript, /actionId: "time-entries\.edit"/);
  assert.match(timeEntriesScript, /timeEntryDialog\.openAdd/);
  assert.match(timeEntriesScript, /timeEntryDialog\.openEdit/);
});

check("Client and Project actions use module-owned reusable dialog helpers", () => {
  assert.match(workbenchView, /js\/clients-projects\.js/);
  assert.match(projectsView, /js\/clients-projects\.js/);
  assert.match(clientsView, /js\/clients-projects\.js/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.clientProjectDialog\.openAddProject\(params, hostContext\)/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.clientProjectDialog\.openEditProject\(params, hostContext\)/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.clientProjectDialog\.openAddClient\(params, hostContext\)/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.clientProjectDialog\.openEditClient\(params, hostContext\)/);
  assert.match(clientsProjectsScript, /window\.LongtailForge\.clientProjectDialog = clientProjectDialogApi/);
  assert.match(clientsProjectsScript, /function openClientProjectModuleAction[\s\S]*moduleActions\.open\(actionId, params/, "Clients/Projects descriptor and query actions should dispatch through the shared module action registry");
  assert.doesNotMatch(clientsProjectsScript, /window\.LongtailForge\.moduleActions\?\.register/, "Clients/Projects adapter should not duplicate first-party module action metadata");
});

check("module-owned saves can signal host completion", () => {
  assert.match(taskDialogScript, /hostContext\?\.complete/);
  assert.match(timeEntryDialogScript, /hostContext\?\.complete/);
  assert.match(clientsProjectsScript, /hostContext\.complete\(detail\)/);
  assert.match(timeEntriesScript, /timeEntryDialog\.openEdit/);
  assert.match(timeEntriesScript, /complete: async \(\) =>/);
  assert.match(clientsProjectsScript, /signalClientProjectModuleAction/);
});

console.log(`Module actions regression passed ${checks} checks.`);
