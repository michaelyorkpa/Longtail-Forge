import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertRoadmapCursorAtLeast } from "./lib/roadmap-cursor.mjs";

const changelog = readText("CHANGELOG.md");
const tasksHelp = readText("help/framework/tasks-basics.md");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const css = readText("public/css/longtail-forge.css");
const moduleContract = readText("docs/module-contract.md");
const tasksModuleDoc = readText("docs/tasks-module.md");
const tasksRoutes = readText("src/modules/tasks/tasks.routes.js");
const tasksService = readText("src/modules/tasks/tasks.service.js");
const taskWorkEvidenceService = readText("src/modules/tasks/task-work-evidence.service.js");
const uiSurfaceContract = readText("docs/ui-surface-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.equal(packageJson.version, appVersion, "package.json should report the Task Focus checklist version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Task Focus checklist version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Task Focus checklist version");
assert.match(
  workbenchHtml,
  /longtail-forge\.css[\s\S]*workbench\.js/,
  "Workbench should reference CSS and JS for the Task Focus checklist surface",
);

assert.match(
  functionBody(workbenchScript, "renderTaskFocusSurface"),
  /createTaskFocusSummary\(active\)[\s\S]*createTaskDetailsSection\(active\)[\s\S]*createTaskFocusChecklistSection\(active\)/,
  "Task Focus should render Checklist after summary and read-only Task Details",
);
assert.match(
  functionBody(workbenchScript, "createTaskFocusChecklistSection"),
  /dataset: \{[\s\S]*workbenchTaskFocusChecklist: ""[\s\S]*workbenchTaskFocusChecklistMount: ""[\s\S]*workbenchTaskFocusChecklistStructure: "check-only"[\s\S]*body\.addEventListener\("change", handleTaskFocusChecklistChange\)[\s\S]*setWorkbenchDisclosureOpen\(details, items\.length > 0\);/,
  "Checklist should be a stable check-only mount that opens by default when populated",
);
assert.match(
  functionBody(workbenchScript, "createTaskFocusChecklistBody"),
  /message: "Edit task to add checklist items\."[\s\S]*title: "No checklist items"/,
  "Empty Task Focus checklists should collapse with the required edit-task message",
);
assert.doesNotMatch(
  functionBody(workbenchScript, "createTaskFocusChecklistBody"),
  /checklistAdd|taskChecklistAdd|checklist\/reorder|api\.(putJson|deleteJson)/,
  "Task Focus checklist body should not expose add, rename, reorder, or remove behavior",
);
assert.match(
  functionBody(workbenchScript, "createTaskFocusChecklistItem"),
  /type: "checkbox"[\s\S]*dataset: \{ workbenchTaskFocusChecklistToggle: "" \}[\s\S]*className: "workbench-task-checklist-label"/,
  "Task Focus checklist rows should render only a checkbox and read-only label",
);
assert.doesNotMatch(
  functionBody(workbenchScript, "createTaskFocusChecklistItem"),
  /createActionButton|<button|type: "text"|textarea|select|taskChecklistAction/,
  "Task Focus checklist rows should not render structure-editing controls",
);

assert.match(
  functionBody(workbenchScript, "handleTaskFocusChecklistChange"),
  /const action = checked \? "check" : "uncheck";[\s\S]*api\.postJson\(\s*`\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/checklist\/\$\{encodeURIComponent\(itemId\)\}\/\$\{action\}`[\s\S]*applyTaskFocusChecklistResult\(result\)[\s\S]*renderWorkbench\(\);/,
  "Checklist check/uncheck should dispatch through the existing Tasks-owned checklist mutation route",
);
assert.match(
  functionBody(workbenchScript, "handleTaskFocusChecklistChange"),
  /catch \(error\)[\s\S]*checklistError: error\.message \|\| "Checklist item was not updated\."[\s\S]*setStatus\(state\.activeTaskFocus\.checklistError, \{ isError: true \}\);/,
  "Checklist permission or mutation failures should surface safely through Task Focus status and section copy",
);
assert.doesNotMatch(
  functionBody(workbenchScript, "handleTaskFocusChecklistChange"),
  /api\.(putJson|deleteJson)\(|checklist\/reorder|\/checklist`, \{ label/,
  "Task Focus checklist mutation should be limited to check/uncheck",
);
assert.match(
  functionBody(workbenchScript, "applyTaskFocusChecklistResult"),
  /result\.task \|\| \{[\s\S]*checklistItems: result\.items \|\| existingTask\.checklistItems \|\| \[\][\s\S]*checklistProgress: result\.checklistProgress \|\| existingTask\.checklistProgress[\s\S]*applyActiveTaskFocusTask\(nextTask\)/,
  "Checklist mutation results should refresh the focused task from the Tasks response shape",
);
assert.match(
  functionBody(workbenchScript, "applyActiveTaskFocusTask"),
  /status: nextTask\?\.status \|\| state\.activeTaskFocus\.status \|\| ""/,
  "Task Focus should refresh the selected task status from the returned Tasks payload",
);

assert.match(
  tasksRoutes,
  /tasksRoutes\.post\("\/tasks\/:taskId\/checklist\/:itemId\/check"[\s\S]*tasksService\.checkChecklistItem[\s\S]*tasksRoutes\.post\("\/tasks\/:taskId\/checklist\/:itemId\/uncheck"[\s\S]*tasksService\.uncheckChecklistItem/,
  "Check/uncheck routes should remain Tasks-owned",
);
assert.match(
  tasksService,
  /async function setChecklistItemChecked\(taskId, itemId, checked, session\)[\s\S]*assertModuleWriteEnabled\(session, TASKS_MODULE_ID\)[\s\S]*assertCanEditTask\(session, task\)[\s\S]*finalizeChecklistMutation\(/,
  "Checklist check/uncheck should keep Tasks-owned module, permission, and mutation validation",
);
assert.match(
  tasksService,
  /async function finalizeChecklistMutation\(\{[\s\S]*tasksRepository\.markWorkedAt[\s\S]*auditService\.record\([\s\S]*modulesService\.emitInternalEvent\(eventName[\s\S]*syncTaskSearchIndex\(session\.workspace_id, task\.task_id, eventName\)[\s\S]*return \{[\s\S]*items: currentItems[\s\S]*checklistProgress[\s\S]*task: taskWithDetails/,
  "Checklist mutations should preserve progress, audit, event, search, and task refresh side effects",
);
assert.match(
  tasksService,
  /async function checklistDrivenStatus\(workspaceId, task, checked, currentItems = \[\]\)[\s\S]*checked === true && \(task\.status === "open" \|\| task\.status === "blocked"\)[\s\S]*return "in_progress"[\s\S]*taskWorkEvidenceService\.readStartedWorkEvidence[\s\S]*evidence\.hasStartedWork \? "" : "open"/,
  "Checklist check/uncheck should preserve eligible Open/Blocked-to-In Progress transitions through Tasks-owned started-work evidence",
);
assert.match(
  taskWorkEvidenceService,
  /taskTimersRepository\.hasActiveForTask[\s\S]*timeEntriesService\.hasTaskTime[\s\S]*taskChecklistsRepository\.readForTask[\s\S]*hasCheckedChecklistItem[\s\S]*hasStartedWork: hasActiveTimer \|\| hasPersistedTime \|\| hasCheckedChecklistItem/,
  "Tasks-owned started-work evidence should combine running or paused timers, persisted task time, and checked checklist work",
);
assert.match(
  tasksService,
  /async function applyChecklistDrivenStatusTransition\(\{[\s\S]*recordTaskAudit\([\s\S]*emitTaskEvent\("task\.updated"[\s\S]*syncTaskSearchIndex\(session\.workspace_id, task\.task_id, "task\.checklist_status_updated"[\s\S]*queueTaskReminderJobsForTask/,
  "Checklist-driven status transitions should preserve task-level audit, event, search, and reminder side effects",
);

assert.match(
  css,
  /\.workbench-task-checklist-list \{[\s\S]*display: grid;[\s\S]*\.workbench-task-checklist-item \{[\s\S]*grid-template-columns: 24px minmax\(0, 1fr\);[\s\S]*\.workbench-task-checklist-item\.is-checked \.workbench-task-checklist-label \{[\s\S]*text-decoration: line-through;/,
  "Task Focus checklist styling should keep rows compact, stable, and visibly complete",
);
assert.match(
  moduleContract,
  /As of 0\.33\.6\.12l[\s\S]*Task Focus checklist toggles are status-aware[\s\S]*As of 0\.33\.21\.3\.3[\s\S]*remaining checked item[\s\S]*running or paused task timer[\s\S]*persisted task-linked time entry[\s\S]*As of 0\.33\.21\.4\.3[\s\S]*checking a Blocked Task returns In Progress[\s\S]*empty active Blocked Reason/,
  "Module contract should record the Task Focus checklist boundary",
);
assert.match(
  uiSurfaceContract,
  /As of 0\.33\.6\.12l[\s\S]*Task Focus checklist toggles refresh the selected task summary status chip[\s\S]*full page reload/,
  "UI surface contract should describe populated and empty Task Focus checklist states",
);
assert.match(
  tasksModuleDoc,
  /As of 0\.33\.6\.12l[\s\S]*[Cc]hecking any checklist item on an Open task moves it to In Progress[\s\S]*As of 0\.33\.21\.3\.3[\s\S]*running or paused task timer[\s\S]*persisted task-linked time[\s\S]*As of 0\.33\.21\.4\.3[\s\S]*checking an item on a Blocked Task[\s\S]*clears the active Blocked Reason/,
  "Tasks docs should state the Workbench checklist execution boundary",
);
assert.match(
  tasksHelp,
  /Unchecking the last checklist item returns an In Progress task to Open only when there is no running or paused task timer, saved task time, or other checked item/,
  "Tasks Help should explain when clearing checklist work may legitimately return a task to Open",
);
assert.match(
  viewContract,
  /Workbench \| As of 0\.33\.6\.12d-1[\s\S]*As of 0\.33\.6\.12l[\s\S]*checklist mutation response refreshes the selected task status chip/,
  "View-building contract should include the Task Focus checklist anatomy",
);
assert.match(
  changelog,
  /## Version 0\.33\.6\.12l[\s\S]*checking checklist work on an Open task now returns an In Progress task, and unchecking the last checked item on an eligible In Progress task returns it to Open\./,
  "Changelog should preserve the Task Focus checklist-driven status transition closeout",
);
assertRoadmapCursorAtLeast("0.33.8", "Live roadmap should advance to the current active cursor after the completed Workbench history");

console.log("Workbench Task Focus checklist regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function functionBody(source, name) {
  const starts = [
    `async function ${name}(`,
    `function ${name}(`,
    `${name}: () => (`,
  ];
  const start = starts
    .map((signature) => source.indexOf(signature))
    .find((index) => index >= 0);
  assert.notEqual(start, undefined, `Missing function ${name}`);

  const signatureEnd = source.indexOf(") {", start);
  const openBrace = signatureEnd >= 0 ? signatureEnd + 2 : source.indexOf("{", start);
  assert.notEqual(openBrace, -1, `Missing body for function ${name}`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace, index + 1);
      }
    }
  }

  throw new Error(`Could not parse function ${name}`);
}
