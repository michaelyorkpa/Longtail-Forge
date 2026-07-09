import assert from "node:assert/strict";
import fs from "node:fs";

const moduleActionsSource = fs.readFileSync("public/js/shared/module-actions.js", "utf8");
const workbenchView = fs.readFileSync("views/protected/workbench.html", "utf8");
const taskView = fs.readFileSync("views/protected/tasks.html", "utf8");
const timeEntriesView = fs.readFileSync("views/protected/time-entries.html", "utf8");
const projectsView = fs.readFileSync("views/protected/projects.html", "utf8");
const clientsView = fs.readFileSync("views/protected/clients.html", "utf8");
const notesView = fs.readFileSync("views/protected/notes.html", "utf8");
const listsView = fs.readFileSync("views/protected/lists.html", "utf8");
const filesView = fs.readFileSync("views/protected/files.html", "utf8");
const workbenchScript = fs.readFileSync("public/js/workbench.js", "utf8");
const tasksScript = fs.readFileSync("public/js/tasks.js", "utf8");
const taskDialogScript = fs.readFileSync("public/js/task-dialog.js", "utf8");
const timeEntryDialogScript = fs.readFileSync("public/js/time-entry-dialog.js", "utf8");
const timeTrackingTimerDialogScript = fs.readFileSync("public/js/time-tracking-timer-dialog.js", "utf8");
const timeEntriesScript = fs.readFileSync("public/js/time-entries.js", "utf8");
const clientsProjectsScript = fs.readFileSync("public/js/clients-projects.js", "utf8");
const notesScript = fs.readFileSync("public/js/notes.js", "utf8");
const listsScript = fs.readFileSync("public/js/lists.js", "utf8");
const filesScript = fs.readFileSync("public/js/files.js", "utf8");
let checks = 0;

function check(name, assertion) {
  assertion();
  checks += 1;
}

check("first-party module modal actions are registered", () => {
  [
    "tasks.add",
    "tasks.edit",
    "time-tracking.timer.create",
    "time-entries.add",
    "time-entries.edit",
    "notes.add",
    "notes.edit",
    "notes.view",
    "lists.add",
    "lists.edit",
    "projects.add",
    "projects.edit",
    "clients.add",
    "clients.edit",
    "files.edit",
    "files.preview",
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
    notesView,
    listsView,
    filesView,
  ].forEach((view) => assert.match(view, /js\/shared\/module-actions\.js/));
});

check("Workbench Add Task dispatches a module action instead of navigating away", () => {
  assert.match(workbenchScript, /label: "Add Task"[\s\S]*onClick: openAddTaskAction/, "Workbench guided host should create the Add Task trigger");
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

check("Time Tracking timer action uses module-owned reusable dialog helpers", () => {
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.timeTrackingTimerDialog\.openCreate\(params, hostContext\)/);
  assert.match(timeTrackingTimerDialogScript, /actionId: TIMER_ACTION_ID/);
  assert.match(timeTrackingTimerDialogScript, /namespace\.timeTrackingTimerDialog = timeTrackingTimerDialogApi/);
  assert.match(timeTrackingTimerDialogScript, /openCreate/);
  assert.match(timeTrackingTimerDialogScript, /api\.putJson\(`\/api\/active-timers\/\$\{encodeURIComponent\(timerSlot\)\}`/);
  assert.match(timeTrackingTimerDialogScript, /api\.putJson\(`\/api\/tasks\/\$\{encodeURIComponent\(task\.id\)\}\/timer`/);
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

check("Notes, Lists, and Files actions use module-owned canonical openers", () => {
  assert.match(notesView, /js\/shared\/module-actions\.js\?v=2/);
  assert.match(listsView, /js\/shared\/module-actions\.js\?v=2/);
  assert.match(filesView, /js\/shared\/module-actions\.js\?v=2/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.notesDialog\.openNoteEditor\(\{ \.\.\.params, mode: "add" \}, hostContext\)/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.notesDialog\.openNoteEditor\(\{ \.\.\.params, mode: "edit" \}, hostContext\)/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.notesDialog\.openNoteViewer\(params, hostContext\)/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.listsDialog\.openListEditor\(\{ \.\.\.params, mode: "add" \}, hostContext\)/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.listsDialog\.openListEditor\(\{ \.\.\.params, mode: "edit" \}, hostContext\)/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.filesDialog\.openFileEditorAction\(params, hostContext\)/);
  assert.match(moduleActionsSource, /open: \(params, hostContext\) => namespace\.filesDialog\.openFilePreviewAction\(params, hostContext\)/);
  assert.match(notesScript, /window\.LongtailForge\.notesDialog = Object\.freeze/);
  assert.match(notesScript, /openNoteEditor/);
  assert.match(notesScript, /openNoteViewer/);
  assert.match(listsScript, /window\.LongtailForge\.listsDialog = Object\.freeze/);
  assert.match(listsScript, /openListEditor/);
  assert.match(filesScript, /openFileEditorAction/);
  assert.match(filesScript, /openFilePreviewAction/);
});

check("module-owned saves can signal host completion", () => {
  assert.match(taskDialogScript, /hostContext\?\.complete/);
  assert.match(timeEntryDialogScript, /hostContext\?\.complete/);
  assert.match(timeTrackingTimerDialogScript, /hostContext\?\.complete/);
  assert.match(timeTrackingTimerDialogScript, /hostContext\?\.refresh/);
  assert.match(clientsProjectsScript, /hostContext\.complete\(detail\)/);
  assert.match(notesScript, /completeNoteEditorHostContext/);
  assert.match(listsScript, /completeListDialogHostContext/);
  assert.match(filesScript, /hostContext\?\.complete\?\.\(\{/);
  assert.match(timeEntriesScript, /timeEntryDialog\.openEdit/);
  assert.match(timeEntriesScript, /complete: async \(\) =>/);
  assert.match(clientsProjectsScript, /signalClientProjectModuleAction/);
});

console.log(`Module actions regression passed ${checks} checks.`);
