import assert from "node:assert/strict";

import { createProjectTextReader } from "../../test-support/source-scan.mjs";
// Consolidated under workbench.current-static-contracts by 0.33.33.10.
const { readText } = createProjectTextReader();

const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.match(
  workbenchHtml,
  /js\/workbench\.js/,
  "Workbench should reference the view-state adapter",
);
assert.match(
  workbenchScript,
  /const WORKBENCH_VIEW_STATE_FOCUS_SELECTION = "focus-selection";[\s\S]*const WORKBENCH_VIEW_STATE_TASK_FOCUS = "task-focus";/,
  "Workbench should define explicit Focus Selection and Task Focus state values",
);
assert.match(
  workbenchScript,
  /activeTaskFocus: null,[\s\S]*viewState: WORKBENCH_VIEW_STATE_FOCUS_SELECTION/,
  "Workbench state should default to Focus Selection with no active task focus",
);

assert.match(
  functionBody(workbenchScript, "buildWorkbenchHost"),
  /label: "Open Inspector"[\s\S]*label: "Change Focus"[\s\S]*onClick: changeFocus[\s\S]*actions: \[workbenchInspectorOpenButton, changeFocusButton\]/,
  "Workbench header should order the mobile Inspector action immediately before Change Focus",
);
assert.doesNotMatch(
  functionBody(workbenchScript, "buildWorkbenchHost"),
  /href: "time-tracker\.html"|text: "Time Tracker"/,
  "Workbench header should no longer expose the Time Tracker link in the upper-right action slot",
);
assert.match(
  functionBody(workbenchScript, "renderWorkbenchViewState"),
  /workbenchHost\.dataset\.workbenchViewState = viewState;[\s\S]*workbenchHost\.dataset\.workbenchActiveTaskFocus = activeTaskFocus\?\.taskId \|\| "";[\s\S]*changeFocusButton\.disabled = !isTaskFocus;[\s\S]*workbenchChangeFocusEnabled = isTaskFocus \? "true" : "false"/,
  "Workbench should publish state hooks and keep Change Focus disabled outside Task Focus",
);
assert.match(
  functionBody(workbenchScript, "toggleWorkbenchStatePanel"),
  /const isHidden = Boolean\(hidden\);[\s\S]*element\.hidden = isHidden;[\s\S]*setAttribute\("aria-hidden", isHidden \? "true" : "false"\);[\s\S]*element\.style\.display = isHidden \? "none" : "";[\s\S]*element\.inert = isHidden;/,
  "Workbench state panels should leave hidden opposite-state surfaces out of layout and focus order",
);
assert.match(
  functionBody(workbenchScript, "renderTaskFocusSurface"),
  /taskFocusActionMount\.hidden = !isTaskFocus;[\s\S]*taskFocusBody\.hidden = !isTaskFocus;[\s\S]*taskFocusActionMount\.replaceChildren\(\);[\s\S]*taskFocusBody\.replaceChildren\(\);[\s\S]*if \(!isTaskFocus \|\| !active\) \{[\s\S]*return;[\s\S]*taskFocusActionMount\.appendChild\(createTaskFocusActionStrip\(active\)\);/,
  "Workbench should only build Task Focus actions and shells while Task Focus is the active view state",
);

assert.match(
  functionBody(workbenchScript, "candidateActionLabel"),
  /candidateTaskId\(candidate\)[\s\S]*return "Focus task";[\s\S]*return "Open work";/,
  "Task candidates should present a focus action while non-task candidates keep the generic Open work fallback label",
);

const openCandidateBody = functionBody(workbenchScript, "openCandidate");
assert.match(
  openCandidateBody,
  /const mode = options\.mode \|\| "candidate-primary";[\s\S]*if \(mode === "candidate-primary"\) \{[\s\S]*if \(taskId\) \{[\s\S]*enterTaskFocus\(candidate, taskId\);[\s\S]*changeFocusButton\?\.focus\?\.\(\);[\s\S]*openNonTaskFocusFallback\(candidate\);/,
  "Primary candidate actions should enter Task Focus for tasks and use the explicit non-task fallback path otherwise",
);
assert.doesNotMatch(
  openCandidateBody,
  /moduleActions\.open\("tasks\.edit"/,
  "The primary candidate opener should not open the Task edit modal directly",
);
assert.match(
  functionBody(workbenchScript, "enterTaskFocus"),
  /state\.viewState = WORKBENCH_VIEW_STATE_TASK_FOCUS;[\s\S]*state\.activeTaskFocus = taskFocusFromCandidate\(candidate, taskId\);[\s\S]*renderWorkbench\(\);[\s\S]*await refreshActiveTaskFocus\(\);[\s\S]*Task Focus active:/,
  "Task candidates should set the active task focus and render Task Focus without navigation",
);
assert.match(
  functionBody(workbenchScript, "changeFocus"),
  /resetTaskFocusState\(\);[\s\S]*renderWorkbench\(\);[\s\S]*setStatus\("Choose the next focus\."\);[\s\S]*focusActiveFocusQuestion\(\);/,
  "Change Focus should clear only the active task focus and return to Focus Selection",
);
assert.doesNotMatch(
  functionBody(workbenchScript, "changeFocus"),
  /selectedClientId|selectedProjectId|focusModeId|localStorage/,
  "Change Focus should not mutate the current focus mode, client filter, or project filter",
);

assert.match(
  functionBody(workbenchScript, "handleClientFocusChange"),
  /resetTaskFocusState\(\);[\s\S]*state\.selectedClientId/,
  "Changing the client focus filter should leave Task Focus before reloading candidates",
);
assert.match(
  functionBody(workbenchScript, "handleProjectFocusChange"),
  /resetTaskFocusState\(\);[\s\S]*state\.selectedProjectId/,
  "Changing the project focus filter should leave Task Focus before reloading candidates",
);
assert.match(
  functionBody(workbenchScript, "selectFocusMode"),
  /resetTaskFocusState\(\);[\s\S]*state\.focusModeId/,
  "Changing the focus mode should leave Task Focus before reloading candidates",
);

assert.match(
  functionBody(workbenchScript, "createRecommendedCandidateCard"),
  /openCandidate\(candidate, event\?\.currentTarget \|\| null, \{ mode: "candidate-primary" \}\)/,
  "Recommended candidate actions should use the primary candidate mode",
);
assert.match(
  functionBody(workbenchScript, "createWorkbenchInspectorItem"),
  /const openMode = resolvedWorkbenchViewState\(\) === WORKBENCH_VIEW_STATE_FOCUS_SELECTION[\s\S]*"candidate-primary"[\s\S]*openCandidate\(candidate, event\.currentTarget, \{ mode: openMode \}\)/,
  "Focus Selection Inspector overflow titles should use the primary candidate mode",
);
assert.match(
  functionBody(workbenchScript, "createWorkbenchInspectorItem"),
  /: "context-open"/,
  "Inspector item rendering should preserve a context-open branch for later Task Focus context behavior",
);
assert.match(
  functionBody(workbenchScript, "openTaskCandidate"),
  /window\.LongtailForge\.moduleActions\.open\("tasks\.edit"/,
  "The explicit context-open path should retain the canonical Task editor opener",
);

assert.match(
  functionBody(workbenchScript, "openNonTaskFocusFallback"),
  /Opening this work in its module page until Task Focus supports this type\.[\s\S]*Task Focus is currently available for task candidates only/,
  "Non-task primary candidates should use a clearly labeled temporary fallback path",
);
assert.doesNotMatch(
  functionBody(workbenchScript, "openNonTaskFocusFallback"),
  /moduleActions\.open\(/,
  "Non-task primary candidates should not silently open an editor as a Task Focus substitute",
);
assert.doesNotMatch(
  workbenchScript,
  /label: "Dismiss"|dismissResumeCandidate|candidateResumeStateId|\/api\/work-resume\/\$\{encodeURIComponent\(resumeStateId\)\}\/dismiss/,
  "Recommended and secondary candidates should no longer expose resume dismissal controls",
);

assert.match(
  functionBody(workbenchScript, "snapshot"),
  /activeTaskFocusId: state\.activeTaskFocus\?\.taskId \|\| ""[\s\S]*viewState: resolvedWorkbenchViewState\(\)/,
  "Workbench page-controller snapshots should expose the active view state and focused task",
);
assert.match(
  workbenchScript,
  /toggleWorkbenchStatePanel\(taskFocusPanelElement, !isTaskFocus\);[\s\S]*toggleWorkbenchStatePanel\(focusPanelElement, isTaskFocus\);[\s\S]*toggleWorkbenchStatePanel\(recommendedActionPanelElement, isTaskFocus\);[\s\S]*toggleWorkbenchStatePanel\(secondaryWorkbenchPanelElement, false\);/,
  "Workbench should hide opposite-state focus panels while keeping the state-aware timer panel mounted",
);

console.log("Workbench view-state regression passed.");

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`) >= 0
    ? source.indexOf(`function ${name}(`)
    : source.indexOf(`${name}: () => (`);
  assert.notEqual(start, -1, `Missing function ${name}`);

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
        return source.slice(openBrace + 1, index);
      }
    }
  }

  assert.fail(`Could not extract function body for ${name}`);
}
