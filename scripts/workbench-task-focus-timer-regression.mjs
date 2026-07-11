import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appShellService = readText("src/services/app-shell.service.js");
const changelog = readText("CHANGELOG.md");
const css = readText("public/css/longtail-forge.css");
const moduleActions = readText("public/js/shared/module-actions.js");
const moduleContract = readText("docs/module-contract.md");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const regressionManifest = readText("scripts/regression-coverage-manifest.json");
const regressionSuite = readText("scripts/regression-legacy-snapshot.json");
const roadmap = readText("ROADMAP.md");
const tasksDoc = readText("docs/tasks-module.md");
const tasksRoutes = readText("src/modules/tasks/tasks.routes.js");
const timeTrackingDoc = readText("docs/time-tracking-module.md");
const timeTrackingModule = readText("src/modules/time-tracking/module.js");
const uiSurfaceContract = readText("docs/ui-surface-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.equal(packageJson.version, appVersion, "package.json should report the Task Focus timer version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Task Focus timer version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Task Focus timer version");
assert.match(
  workbenchHtml,
  /longtail-forge\.css\?v=36[\s\S]*workbench\.js\?v=36/,
  "Workbench should cache-bust CSS and JS for the Task Focus timer surface",
);

assert.doesNotMatch(
  workbenchScript,
  /workbenchManualTimerForm|workbenchManualClient|workbenchManualProject|workbenchManualDescription|workbenchManualBillable|startManualTimer|populateManualTimerForm|workbench-manual-timer-form|Start Timer/,
  "Focus Selection should no longer contain the manual timer creation row or helper path",
);
assert.doesNotMatch(
  css,
  /workbench-manual-timer-form|workbench-billable-option|billable-inherited-flash/,
  "Retired Workbench manual timer form styles should not remain in the stylesheet",
);
assert.doesNotMatch(
  timeTrackingModule,
  /manual timer controls/,
  "Time Tracking Workbench contribution metadata should not describe manual Workbench creation controls",
);

assert.match(
  functionBody(workbenchScript, "createTimerSection"),
  /body: \[timerList\][\s\S]*cardId: "active-work-timers"[\s\S]*defaultOpen: shouldOpenTimerSectionByDefault\(\)[\s\S]*title: "Timers"/,
  "Focus Selection Timers should render only the active timer list in the card body",
);
assert.match(
  functionBody(workbenchScript, "renderTimers"),
  /const timers = sortedTimers\(visibleTimerPanelTimers\(\)\);[\s\S]*const emptyMessage = timerPanelEmptyStateText\(\);[\s\S]*updateTimerSectionTitle\(\);[\s\S]*timerList\.appendChild\(emptyState\(emptyMessage\)\)/,
  "Timer rendering should use the state-aware visible timer list, title, and empty state",
);
assert.match(
  functionBody(workbenchScript, "activeOrPausedTimers"),
  /\["running", "paused"\]\.includes\(timer\?\.timer_status\)/,
  "Timer rendering should explicitly filter to active and paused records",
);
assert.match(
  functionBody(workbenchScript, "visibleTimerPanelTimers"),
  /const timers = activeOrPausedTimers\(state\.timers\);[\s\S]*if \(!isTaskFocusView\(\)\) \{[\s\S]*return timers;[\s\S]*const focusedTaskId = currentTaskFocusId\(\);[\s\S]*return timers\.filter\(\(timer\) => !taskTimerMatches\(timer, focusedTaskId\)\);/,
  "Task Focus should filter the focused task's active or paused timer out of the lower timer panel",
);
assert.match(
  functionBody(workbenchScript, "timerPanelEmptyStateText"),
  /isTaskFocusView\(\) \? "No other active or paused timers\." : "No active or paused timers\."/,
  "Task Focus should use a distinct Other Active Timers empty state without changing Focus Selection",
);
assert.match(
  functionBody(workbenchScript, "updateTimerSectionTitle"),
  /title\.textContent = isTaskFocusView\(\) \? "Other Active Timers" : "Timers";/,
  "Task Focus should rename the lower timer panel to Other Active Timers",
);
assert.match(
  functionBody(workbenchScript, "renderWorkbenchViewState"),
  /toggleWorkbenchStatePanel\(secondaryWorkbenchPanelElement, false\);/,
  "The lower timer panel should remain mounted so Task Focus can show Other Active Timers",
);

assert.match(
  functionBody(workbenchScript, "renderTaskFocusSurface"),
  /createTaskFocusSummary\(active\)[\s\S]*createTaskDetailsSection\(active\)[\s\S]*createTaskFocusChecklistSection\(active\)[\s\S]*createTaskFocusTimerSection\(active\)/,
  "Task Focus should render the task-linked timer section after Checklist at the bottom of the main column",
);
assert.match(
  functionBody(workbenchScript, "createTaskFocusTimerSection"),
  /workbenchTaskFocusTimer: ""[\s\S]*workbenchTaskFocusTimerDefaultOpen: "true"[\s\S]*workbenchTaskFocusTimerLinked: "task"[\s\S]*title: "Task Timer"[\s\S]*setWorkbenchDisclosureOpen\(details, true\);/,
  "Task Focus timer should be a default-open task-linked collapsible section with the shared summary caret",
);
assert.match(
  functionBody(workbenchScript, "createTaskFocusTimerControls"),
  /label: "Start"[\s\S]*saveFocusedTaskTimer\("running"\)[\s\S]*label: "Pause"[\s\S]*saveFocusedTaskTimer\("paused"\)[\s\S]*label: "Save Time"[\s\S]*finalizeFocusedTaskTimer[\s\S]*label: "Reset"[\s\S]*resetFocusedTaskTimer/,
  "Task Focus timer controls should expose Start, Pause, Save Time, and Reset",
);
assert.doesNotMatch(
  functionBody(workbenchScript, "createTaskFocusTimerControls"),
  /createElement\("(select|input|textarea)"|Client|Project|workbenchManual/,
  "Task Focus timer controls should use the selected task context and not ask the user to reselect Client, Project, or Task",
);
assert.match(
  functionBody(workbenchScript, "createTaskFocusTimerControls"),
  /dataset: \{ workbenchTaskFocusTimerDisplay: "" \}[\s\S]*duration\.dataset\.workbenchDuration = timer\.active_timer_id;/,
  "The Task Timer control counter should be the focused task timer's live duration display",
);
assert.match(
  functionBody(workbenchScript, "startTicking"),
  /document\.querySelector\(`\[data-workbench-duration="\$\{timer\.active_timer_id\}"\]`\)[\s\S]*element\.textContent = formatDuration\(readElapsedSeconds\(timer\)\);/,
  "The focused Task Timer counter should update through the shared live duration tick while running",
);
assert.doesNotMatch(
  workbenchScript,
  /function createTaskFocusTimerList|function createTaskFocusTimerCard|workbenchTaskFocusActiveTimer|workbench-task-focus-timer-card/,
  "Task Focus should not render a duplicate focused-task timer card below the controls",
);
assert.match(
  functionBody(workbenchScript, "currentTaskFocusTimer"),
  /activeOrPausedTimers\(state\.timers\)\.find\(\(timer\) => taskTimerMatches\(timer, taskId\)\)/,
  "Task Focus timer lookup should be scoped to the focused task, not a manual project picker",
);

assert.match(
  functionBody(workbenchScript, "saveFocusedTaskTimer"),
  /api\.putJson\(`\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/timer`[\s\S]*active_task_timer_id:[\s\S]*timer_status: timerStatus[\s\S]*accumulated_elapsed_seconds: readElapsedSeconds\(timer\)/,
  "Task Focus Start/Pause should reuse the Tasks-owned task timer save route",
);
assert.match(
  functionBody(workbenchScript, "finalizeFocusedTaskTimer"),
  /api\.postJson\(`\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/timer\/finalize`[\s\S]*duration_seconds: Math\.max\(1, readElapsedSeconds\(timer\)\)[\s\S]*end_time: new Date\(\)\.toISOString\(\)/,
  "Task Focus Save Time should reuse the Tasks-owned task timer finalize route",
);
assert.match(
  functionBody(workbenchScript, "resetFocusedTaskTimer"),
  /modal\.confirm\(\{[\s\S]*title: "Reset task timer"[\s\S]*api\.deleteJson\(`\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/timer`\)/,
  "Task Focus Reset should confirm and reuse the Tasks-owned task timer delete route",
);
assert.match(
  functionBody(workbenchScript, "taskFocusTimerEligibility"),
  /options\.taskTimersEnabled === false[\s\S]*Task timers are disabled\.[\s\S]*!task\.project_id[\s\S]*Task timers require a project-linked task\.[\s\S]*Completed and archived tasks cannot use task timers\./,
  "Task Focus timer controls should preserve the Task modal eligibility rules",
);
assert.match(
  functionBody(workbenchScript, "refreshWorkbenchAfterTaskFocusTimerMutation"),
  /applyActiveTaskFocusTask\(result\.task\)[\s\S]*await loadWorkbench\(\)[\s\S]*renderTaskFocusSurface\(\)/,
  "Task Focus timer mutations should refresh both timer state and the focused task read model",
);

assert.match(
  functionBody(workbenchScript, "finalizeTimer"),
  /timer\.source_type === "task"[\s\S]*finalizeSourceTaskTimer\(timer\)/,
  "Existing Workbench task timer cards should finalize through the Tasks timer service when the task source is readable",
);
assert.match(
  functionBody(workbenchScript, "discardTimer"),
  /timer\.source_type === "task"[\s\S]*api\.deleteJson\(`\/api\/tasks\/\$\{encodeURIComponent\(timer\.source_id\)\}\/timer`\)[\s\S]*api\.deleteJson\(`\/api\/active-timers\/\$\{encodeURIComponent\(timer\.timer_slot\)\}`\)/,
  "Existing Workbench task timer cards should reset through Tasks while manual/recovery timers keep the active-timer fallback",
);
assert.match(
  tasksRoutes,
  /tasksRoutes\.put\("\/tasks\/:taskId\/timer"[\s\S]*taskTimersService\.save[\s\S]*tasksRoutes\.post\("\/tasks\/:taskId\/timer\/finalize"[\s\S]*taskTimersService\.finalize[\s\S]*tasksRoutes\.delete\("\/tasks\/:taskId\/timer"[\s\S]*taskTimersService\.remove/,
  "Task timer routes should remain Tasks-owned",
);

assert.match(
  css,
  /\.workbench-section > summary::before,[\s\S]*\.workbench-timer-card > summary::before/,
  "Task Focus timer should inherit the shared Workbench collapsible caret affordance",
);
assert.match(
  css,
  /\.workbench-task-focus-timer-control-box \{[\s\S]*border: 1px solid var\(--color-border-subtle\);[\s\S]*\.workbench-task-focus-timer-controls \{[\s\S]*align-items: center;/,
  "Task Focus timer styles should align with the Task modal timer controls while staying compact",
);
assert.doesNotMatch(
  css,
  /workbench-task-focus-timer-list|workbench-task-focus-timer-card/,
  "Retired duplicate Task Focus timer card styles should not remain",
);

const timerAction = actionDefinitionBlock(appShellService, "timer");
assert.match(timerAction, /actionType: "module-action"[\s\S]*moduleActionId: "time-tracking\.timer\.create"/);
assert.match(moduleActions, /time-tracking\.timer\.create/);

assert.match(
  moduleContract,
  /As of 0\.33\.6\.12k[\s\S]*Task Focus keeps the secondary timer panel visible as `Other Active Timers`[\s\S]*excludes the focused task's running or paused task timer[\s\S]*No other active or paused timers\./,
  "Module contract should record the Workbench timer view-state split",
);
assert.match(
  uiSurfaceContract,
  /As of 0\.33\.6\.12k[\s\S]*Task Focus timer display[\s\S]*one visible focused-task timer representation[\s\S]*Other Active Timers/,
  "UI surface contract should describe the Task Focus timer section",
);
assert.match(
  tasksDoc,
  /As of 0\.33\.6\.12k[\s\S]*Task Focus timer UI renders the focused task's timer only inside the Task Timer section[\s\S]*does not render the focused task's active\/paused timer in `Other Active Timers`/,
  "Tasks docs should record the Workbench task timer route ownership",
);
assert.match(
  timeTrackingDoc,
  /As of 0\.33\.6\.12k[\s\S]*Task Focus renames the lower timer panel to `Other Active Timers`[\s\S]*Manual timers and other task timers remain eligible/,
  "Time Tracking docs should record the Workbench active-timer contribution boundary",
);
assert.match(
  viewContract,
  /Workbench \| As of 0\.33\.6\.12d-1[\s\S]*As of 0\.33\.6\.12k, Task Focus keeps exactly one visible focused-task timer representation[\s\S]*Other Active Timers/,
  "View-building contract should include the Task Focus timer anatomy",
);
assert.match(
  changelog,
  /## Version 0\.33\.6\.12k[\s\S]*focused task's timer is represented only by the Task Timer section[\s\S]*Other Active Timers/,
  "Changelog should preserve the Workbench Task Focus timer de-duplication closeout",
);
assert.match(
  roadmap,
  /Active cursor: `0\.33\.8`\./,
  "Live roadmap should advance to the current active cursor after the completed Workbench history",
);
assert.match(regressionSuite, /scripts\/workbench-task-focus-timer-regression\.mjs/);
assert.match(regressionManifest, /scripts\/workbench-task-focus-timer-regression\.mjs/);

console.log("Workbench Task Focus timer regression passed.");

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

function actionDefinitionBlock(source, actionId) {
  const start = source.indexOf(`id: "${actionId}"`);
  assert.notEqual(start, -1, `Missing quick action ${actionId}`);
  const rest = source.slice(start);
  const end = rest.indexOf("  }),");
  return end === -1 ? rest : rest.slice(0, end + 6);
}
