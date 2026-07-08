import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.6.12c-2";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const css = readText("public/css/longtail-forge.css");
const moduleContract = readText("docs/module-contract.md");
const roadmap = readText("ROADMAP.md");
const tasksModuleDoc = readText("docs/tasks-module.md");
const tasksRoutes = readText("src/modules/tasks/tasks.routes.js");
const tasksService = readText("src/modules/tasks/tasks.service.js");
const uiSurfaceContract = readText("docs/ui-surface-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.equal(packageJson.version, appVersion, "package.json should report the Task Focus checklist version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Task Focus checklist version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Task Focus checklist version");
assert.match(
  workbenchHtml,
  /longtail-forge\.css\?v=32[\s\S]*workbench\.js\?v=31/,
  "Workbench should cache-bust CSS and JS for the Task Focus checklist surface",
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
  css,
  /\.workbench-task-checklist-list \{[\s\S]*display: grid;[\s\S]*\.workbench-task-checklist-item \{[\s\S]*grid-template-columns: 24px minmax\(0, 1fr\);[\s\S]*\.workbench-task-checklist-item\.is-checked \.workbench-task-checklist-label \{[\s\S]*text-decoration: line-through;/,
  "Task Focus checklist styling should keep rows compact, stable, and visibly complete",
);
assert.match(
  moduleContract,
  /As of 0\.33\.6\.12c-2[\s\S]*Task Focus Checklist[\s\S]*check and uncheck only[\s\S]*POST `\/api\/tasks\/:taskId\/checklist\/:itemId\/\{check\|uncheck\}`/,
  "Module contract should record the Task Focus checklist boundary",
);
assert.match(
  uiSurfaceContract,
  /As of 0\.33\.6\.12c-2[\s\S]*Task Focus Checklist[\s\S]*open by default when populated[\s\S]*`Edit task to add checklist items\.`/,
  "UI surface contract should describe populated and empty Task Focus checklist states",
);
assert.match(
  tasksModuleDoc,
  /As of 0\.33\.6\.12c-2[\s\S]*Task Focus can check and uncheck existing checklist items[\s\S]*structure editing remains in the canonical Task editor/,
  "Tasks docs should state the Workbench checklist execution boundary",
);
assert.match(
  viewContract,
  /Workbench \| As of 0\.33\.6\.12c-2[\s\S]*Task Focus Checklist[\s\S]*check-only execution surface/,
  "View-building contract should include the Task Focus checklist anatomy",
);
assert.match(
  roadmap,
  /### Version 0\.33\.6\.12c-2 - Task Focus checklist execution[\s\S]*- \[x\] Render Checklist as a prominent Task Focus section[\s\S]*- \[x\] Use existing Tasks-owned checklist routes\/services[\s\S]*- \[x\] Add focused regressions proving:[\s\S]*Acceptance criteria:/,
  "Roadmap should mark the Task Focus checklist slice complete",
);

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
