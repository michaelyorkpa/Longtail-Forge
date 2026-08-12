import assert from "node:assert/strict";

import { assertRoadmapCursorAtLeast } from "./lib/roadmap-cursor.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const appShellService = readText("src/services/app-shell.service.js");
const changelog = readText("CHANGELOG.md");
const css = readText("public/css/longtail-forge.css");
const moduleActions = readText("public/js/shared/module-actions.js");
const moduleContract = readText("docs/module-contract.md");
const tasksDoc = readText("docs/tasks-module.md");
const tasksRoutes = readText("src/modules/tasks/tasks.routes.js");
const taskTimersService = readText("src/modules/tasks/task-timers.service.js");
const timeTrackingDoc = readText("docs/time-tracking-module.md");
const timeTrackingModule = readText("src/modules/time-tracking/module.js");
const uiSurfaceContract = readText("docs/ui-surface-contract.md");
const viewContract = readText("docs/view-building-contract.md");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.match(
  workbenchHtml,
  /longtail-forge\.css[\s\S]*workbench\.js/,
  "Workbench should reference CSS and JS for the Task Focus timer surface",
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
  /activeOrPausedTimers\(state\.timers\)\.filter\(\(timer\) => \([\s\S]*taskTimerSurfaceAvailable\(\) \|\| !isTaskTimer\(timer\)[\s\S]*if \(!isTaskFocusView\(\)\) \{[\s\S]*return timers;[\s\S]*const focusedTaskId = currentTaskFocusId\(\);[\s\S]*return timers\.filter\(\(timer\) => !taskTimerMatches\(timer, focusedTaskId\)\);/,
  "the lower timer panel should suppress task timers when unavailable and otherwise filter the focused task timer",
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
  functionBody(workbenchScript, "applyActiveTaskFocusTask"),
  /preserveTaskFocusChecklistData\(task, state\.activeTaskFocus\.task\)/,
  "Applying a focused task should preserve prior checklist data when the payload omits it",
);
assert.match(
  functionBody(workbenchScript, "preserveTaskFocusChecklistData"),
  /!Array\.isArray\(merged\.checklistItems\) && Array\.isArray\(existingTask\?\.checklistItems\)[\s\S]*!merged\.checklistProgress && existingTask\?\.checklistProgress/,
  "Checklist preservation should carry forward the focused task's checklist items and progress across un-enriched timer payloads",
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
  functionBody(taskTimersService, "transitionTaskToInProgressForTimerStart"),
  /task\.status !== "open" && task\.status !== "blocked"[\s\S]*previousBlockedReason[\s\S]*blocked_reason: ""[\s\S]*movedTaskToInProgress: true/,
  "Tasks should own Open/Blocked timer-start transitions and the exact recoverable Blocked reason",
);
assert.match(
  functionBody(taskTimersService, "revertTaskTimerStartTransition"),
  /taskWorkEvidenceService\.readStartedWorkEvidence[\s\S]*evidence\.hasStartedWork[\s\S]*restoredStatus[\s\S]*previousBlockedReason/,
  "Task Timer Reset should restore the prior lifecycle only when no independent work evidence remains",
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
  /\.workbench-badge\[data-badge-type="disabled"\]\s*\{[\s\S]*?opacity\s*:/,
  "Disabled Workbench badges should retain the accessible secondary-text contrast instead of dimming the whole badge",
);
assert.match(
  functionBody(workbenchScript, "createTimerCard"),
  /title\.className = "workbench-timer-title";[\s\S]*meta\.className = "workbench-card-meta";[\s\S]*summary\.append\(title, meta\);/,
  "Each timer card should retain explicit title and badge-group hooks inside its own summary",
);
assert.match(
  css,
  /@media \(max-width: 700px\) \{[\s\S]*\.workbench-timer-card > summary \{[\s\S]*grid-template-columns: auto minmax\(0, 1fr\);[\s\S]*\.workbench-timer-card > summary \.workbench-card-meta \{[\s\S]*grid-column: 2;[\s\S]*justify-content: flex-start;/,
  "Phone timer cards should place each card's badges directly below its own title",
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
  moduleContract,
  /As of 0\.33\.21\.4\.3[\s\S]*Task timer start recovers Open or Blocked Tasks into In Progress[\s\S]*Reset restores that state only when Tasks finds no checked checklist item or persisted task time/,
  "Module contract should pin recoverable Blocked timer lifecycle ownership",
);
assert.match(
  tasksDoc,
  /As of 0\.33\.21\.4\.3[\s\S]*timer that alone recovered a Blocked Task[\s\S]*Reset restores them only when no checked checklist item or persisted task-linked time/,
  "Tasks docs should explain the evidence-aware timer reset contract",
);
assert.match(
  timeTrackingDoc,
  /As of 0\.33\.21\.4\.3[\s\S]*source_metadata_json[\s\S]*prior lifecycle status and exact Blocked Reason[\s\S]*Tasks alone decides whether Reset may restore/,
  "Time Tracking docs should limit timer metadata persistence to the Tasks-authored lifecycle handoff",
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
assertRoadmapCursorAtLeast("0.33.8", "Live roadmap should advance to the current active cursor after the completed Workbench history");

console.log("Workbench Task Focus timer regression passed.");

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
