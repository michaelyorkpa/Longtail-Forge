import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertRoadmapCursorAtLeast } from "./lib/roadmap-cursor.mjs";

const changelog = readText("CHANGELOG.md");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const css = readText("public/css/longtail-forge.css");
const moduleContract = readText("docs/module-contract.md");
const tasksModuleDoc = readText("docs/tasks-module.md");
const uiSurfaceContract = readText("docs/ui-surface-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.equal(packageJson.version, appVersion, "package.json should report the Task Focus surface version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Task Focus surface version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Task Focus surface version");

assert.match(
  workbenchHtml,
  /longtail-forge\.css\?v=36[\s\S]*workbench\.js\?v=36/,
  "Workbench should cache-bust CSS and JS for the Task Focus surface",
);
assert.match(
  functionBody(workbenchScript, "createWorkbenchShell"),
  /createTaskFocusPanel\(\)[\s\S]*createGuidedFocusPanel\(\)[\s\S]*createRecommendedActionPanel\(\)[\s\S]*createSecondaryWorkbenchPanel\(\)[\s\S]*createWorkbenchInspectorPanel\(\)/,
  "Workbench should mount a dedicated Task Focus panel beside the existing Focus Selection panels",
);
assert.match(
  functionBody(workbenchScript, "renderWorkbenchViewState"),
  /toggleWorkbenchStatePanel\(taskFocusPanelElement, !isTaskFocus\);[\s\S]*toggleWorkbenchStatePanel\(focusPanelElement, isTaskFocus\);[\s\S]*toggleWorkbenchStatePanel\(recommendedActionPanelElement, isTaskFocus\);[\s\S]*toggleWorkbenchStatePanel\(secondaryWorkbenchPanelElement, false\);/,
  "Task Focus should hide the focus questions and recommendation card while keeping the state-aware timer panel mounted",
);
assert.match(
  functionBody(workbenchScript, "renderWorkbench"),
  /renderRecommendedAction\(\);[\s\S]*renderTaskFocusSurface\(\);[\s\S]*renderWorkbenchInspector\(\);/,
  "Workbench render should keep the Task Focus body synchronized with view state",
);

assert.match(
  functionBody(workbenchScript, "enterTaskFocus"),
  /state\.viewState = WORKBENCH_VIEW_STATE_TASK_FOCUS;[\s\S]*state\.activeTaskFocus = taskFocusFromCandidate\(candidate, taskId\);[\s\S]*await refreshActiveTaskFocus\(\);/,
  "Entering Task Focus should set the focused task immediately and refresh it from the Tasks read route",
);
assert.match(
  functionBody(workbenchScript, "refreshActiveTaskFocus"),
  /api\.getJson\(`\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}`,[\s\S]*cache: "no-store"[\s\S]*applyActiveTaskFocusTask\(result\.task \|\| null\)/,
  "Task Focus should load focused task details through the existing Tasks read route",
);

assert.match(
  functionBody(workbenchScript, "createTaskFocusActionStrip"),
  /id: "edit"[\s\S]*label: "Edit task"[\s\S]*id: "complete"[\s\S]*label: "Complete task"[\s\S]*id: "block"[\s\S]*label: "Block task"/,
  "Task Focus should render Edit, Complete, and Block actions",
);
assert.match(
  functionBody(workbenchScript, "createTaskFocusActionButton"),
  /iconOnly: true[\s\S]*text: ""[\s\S]*button\.dataset\.workbenchTaskFocusAction = id;[\s\S]*button\.dataset\.workbenchTaskFocusIconOnly = "true";/,
  "Task Focus actions should be icon-only controls with stable accessible labels and hooks",
);
assert.match(
  functionBody(workbenchScript, "openFocusedTaskEditor"),
  /openTaskCandidate\(activeTaskFocusCandidate\(\), taskId, event\?\.currentTarget \|\| null\)/,
  "Task Focus Edit should reuse the existing Task candidate editor opener path",
);
assert.match(
  functionBody(workbenchScript, "openTaskCandidate"),
  /window\.LongtailForge\.moduleActions\.open\("tasks\.edit"/,
  "Task Focus Edit should open the canonical registered Tasks edit modal",
);
assert.match(
  functionBody(workbenchScript, "completeFocusedTask"),
  /api\.postJson\(`\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/complete`, \{\}\)[\s\S]*resetTaskFocusState\(\);[\s\S]*await refreshFocusCandidates\(\);[\s\S]*setTaskCompletionStatus\(result\);/,
  "Task Focus Complete should call the existing Tasks complete route and return to Focus Selection",
);
assert.match(
  functionBody(workbenchScript, "blockFocusedTask"),
  /api\.putJson\(`\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}`, \{ status: "blocked" \}\)[\s\S]*applyActiveTaskFocusTask\(result\.task \|\| null\);[\s\S]*renderWorkbench\(\);/,
  "Task Focus Block should use the existing Tasks update route and refresh the focused task in place",
);

assert.match(
  functionBody(workbenchScript, "createTaskFocusSummary"),
  /dataset: \{ workbenchTaskFocusSummary: "" \}[\s\S]*text: "Task Focus"[\s\S]*id: "workbench-task-focus-heading"[\s\S]*taskFocusBadges\(task, active\)/,
  "Task Focus should render a readable selected-task heading and summary",
);
assert.doesNotMatch(
  functionBody(workbenchScript, "taskFocusLeadText"),
  /active\?\.contextLabel/,
  "Task Focus summary lead text should not duplicate the Client/Project context fallback",
);
assert.match(
  functionBody(workbenchScript, "taskFocusBadges"),
  /badge\(formatToken\(task\.status \|\| active\?\.status \|\| "open"\)[\s\S]*badge\(formatToken\(task\.priority \|\| active\?\.priority \|\| "normal"\)[\s\S]*dueText \? badge\(`Due \$\{dueText\}`, "due"\) : null[\s\S]*taskFocusTagBadges\(task\)/,
  "Task Focus summary badges should include status, priority, due date, and safe task tags",
);
assert.match(
  functionBody(workbenchScript, "taskFocusTagBadges"),
  /task\.directTags[\s\S]*task\.direct_tags[\s\S]*tag\.name \|\| tag\.slug[\s\S]*badge\(label, "tag"\)/,
  "Task Focus summary tag badges should come from safe direct-tag labels, not IDs",
);
assert.match(
  functionBody(workbenchScript, "createTaskDetailsSection"),
  /workbenchTaskDetailsReadonly: "true"[\s\S]*createWorkbenchSectionSummary\([\s\S]*title: "Task Details"[\s\S]*setWorkbenchDisclosureOpen\(details, false\);/,
  "Task Details should be read-only and collapsed by default",
);
assert.doesNotMatch(
  functionBody(workbenchScript, "createTaskDetailFields"),
  /createElement\("(input|select|textarea)"/,
  "Task Details should not render editable form controls",
);
assert.match(
  functionBody(workbenchScript, "createTaskDetailFields"),
  /"Title"[\s\S]*"Status"[\s\S]*"Priority"[\s\S]*"Due"[\s\S]*"Assignees"[\s\S]*"Client"[\s\S]*"Project"[\s\S]*"Blocked reason"[\s\S]*"Description"/,
  "Task Details should include the safe read-only task metadata required by the roadmap",
);
assert.match(
  functionBody(workbenchScript, "renderTaskFocusSurface"),
  /createTaskFocusSummary\(active\)[\s\S]*createTaskDetailsSection\(active\)[\s\S]*createTaskFocusChecklistSection\(active\)/,
  "Task Focus should preserve the action, summary, details, and checklist section order",
);

assert.match(
  functionBody(workbenchScript, "renderWorkbenchInspector"),
  /resolvedWorkbenchViewState\(\) === WORKBENCH_VIEW_STATE_TASK_FOCUS[\s\S]*renderTaskFocusInspector\(\);[\s\S]*return;[\s\S]*const candidates = workbenchInspectorCandidates\(\);/,
  "Task Focus should not render Focus Selection overflow candidates in the right panel",
);
assert.match(
  functionBody(workbenchScript, "renderTaskFocusInspector"),
  /setWorkbenchInspectorCopy\("Task context", "Related work for the focused task\."\)[\s\S]*taskFocusRelatedContextState\(\)[\s\S]*taskFocusRelatedContextGroups\(context\)[\s\S]*workbenchInspectorCountText\.textContent = String\(items\.length\);/,
  "Task Focus Inspector should switch from More-in-this-focus candidate overflow to selected-task related context",
);

assert.match(
  css,
  /\.workbench-task-focus-action-mount \{[\s\S]*justify-content: flex-end;[\s\S]*padding-right: 8px;/,
  "Task Focus action strip should sit near the Inspector edge with a slight margin",
);
assert.match(
  css,
  /\.workbench-task-focus-action-strip[\s\S]*justify-content: flex-end;[\s\S]*\.workbench-task-focus-action-strip \.icon-button \{[\s\S]*width: 40px;[\s\S]*height: 40px;/,
  "Task Focus actions should stay compact icon controls",
);
assert.match(
  css,
  /\.workbench-task-detail-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  "Task Details should render as a compact read-only metadata grid",
);

assert.match(
  moduleContract,
  /As of 0\.33\.6\.12c-1[\s\S]*Task Focus renders a mostly read-only selected-task work surface[\s\S]*Edit, Complete, and Block/,
  "Module contract should record the Task Focus main-surface boundary",
);
assert.match(
  uiSurfaceContract,
  /As of 0\.33\.6\.12c-1[\s\S]*Task Focus main surface[\s\S]*read-only task summary[\s\S]*Edit, Complete, and Block/,
  "UI surface contract should describe the Task Focus main surface",
);
assert.match(
  moduleContract,
  /As of 0\.33\.6\.12j[\s\S]*Client\/Project path once[\s\S]*summary chips[\s\S]*safe direct tags/,
  "Module contract should record the compact Task Focus summary metadata boundary",
);
assert.match(
  uiSurfaceContract,
  /As of 0\.33\.6\.12j[\s\S]*Task Focus summary keeps one Client\/Project context line[\s\S]*status, priority, due date\/time, and safe direct tags/,
  "UI surface contract should document the non-duplicated Task Focus summary and chip row",
);
assert.match(
  tasksModuleDoc,
  /As of 0\.33\.6\.12j[\s\S]*Task Focus summary reuses the existing Tasks read payload[\s\S]*Client\/Project path once[\s\S]*safe direct tags as summary chips/,
  "Tasks docs should describe the Task Focus summary metadata contract",
);
assert.match(
  viewContract,
  /Workbench \| As of 0\.33\.6\.12d-1[\s\S]*As of 0\.33\.6\.12j, the selected-task summary shows one Client\/Project path line and uses the summary chip row/,
  "View-building contract should include the Task Focus anatomy",
);
assert.match(
  changelog,
  /## Version 0\.33\.6\.12i[\s\S]*summary now shows that context once[\s\S]*summary chip row to surface status, priority, due date\/time, and safe direct tags/,
  "Changelog should preserve the Task Focus summary metadata cleanup closeout",
);
assertRoadmapCursorAtLeast("0.33.8", "Live roadmap should advance to the current active cursor after the completed Workbench history");

console.log("Workbench Task Focus surface regression passed.");

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
