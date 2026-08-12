import assert from "node:assert/strict";

import { assertRoadmapCursorAtLeast } from "./lib/roadmap-cursor.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const changelog = readText("CHANGELOG.md");
const moduleContract = readText("docs/module-contract.md");
const taskDialogScript = readText("public/js/task-dialog.js");
const moduleActions = readText("public/js/shared/module-actions.js");
const workbenchScript = readText("public/js/workbench.js");

assert.match(
  workbenchScript,
  /src: "js\/task-dialog\.js"/,
  "Workbench should lazy-load the canonical Task dialog for the in-place open-work adapter",
);

assert.match(
  workbenchScript,
  /onClick: \(event\) => openCandidate\(candidate, event\?\.currentTarget \|\| null, \{ mode: "candidate-primary" \}\)/,
  "Recommended candidate controls should pass their trigger through the primary candidate opener",
);
assert.match(
  functionBody(workbenchScript, "createWorkbenchInspectorItem"),
  /workbenchInspectorOpenMode: openMode[\s\S]*openCandidate\(candidate, event\.currentTarget, \{ mode: openMode \}\)/,
  "Inspector overflow controls should pass their trigger through the resolved candidate opener",
);
assert.match(
  functionBody(workbenchScript, "candidateActionLabel"),
  /candidateTaskId\(candidate\)[\s\S]*return "Focus task";[\s\S]*isManualTimerCandidate\(candidate\)[\s\S]*return "Continue in Time Tracking";[\s\S]*candidateModuleAction\(candidate\)[\s\S]*return candidate\.primaryAction\?\.label \|\| "Open work";[\s\S]*candidate\.sourceUrl \|\| candidate\.primaryAction\?\.href[\s\S]*return "Open work";/,
  "Task candidates should focus the task, manual timers should name their Time Tracking handoff, module actions may supply a source-owned label, and page fallbacks keep the generic label",
);

const openCandidateBody = functionBody(workbenchScript, "openCandidate");
assert.match(
  openCandidateBody,
  /if \(mode === "candidate-primary"\) \{[\s\S]*enterTaskFocus\(candidate, taskId\);[\s\S]*const action = candidateModuleAction\(candidate\);[\s\S]*await openModuleActionCandidate\(candidate, action, trigger\);[\s\S]*openNonTaskFocusFallback\(candidate\);[\s\S]*if \(taskId\) \{[\s\S]*await openTaskCandidate\(candidate, taskId, trigger\);[\s\S]*openCandidateNavigationFallback\(candidate\);/,
  "Primary candidate actions should enter Task Focus, then open registered module actions (e.g. Notes view) in place before any page fallback",
);
assert.doesNotMatch(
  openCandidateBody,
  /window\.location\.href/,
  "The shared candidate opener should delegate navigation to explicit fallback helpers",
);

const openTaskCandidateBody = functionBody(workbenchScript, "openTaskCandidate");
assert.match(
  openTaskCandidateBody,
  /if \(!moduleEnabled\("tasks"\)\) \{[\s\S]*Tasks are not available in this workspace\./,
  "Task candidate opening should preserve disabled-module handling before dispatching the editor",
);
assert.match(
  openTaskCandidateBody,
  /window\.LongtailForge\.moduleActions\.open\("tasks\.edit", \{[\s\S]*source: "workbench"[\s\S]*sourceType: "work-candidate"[\s\S]*candidateId: candidate\.candidateId \|\| ""[\s\S]*recordId: taskId[\s\S]*returnFocusTo: trigger \|\| document\.activeElement[\s\S]*taskId,[\s\S]*\}, \{ refresh: loadWorkbench, setStatus \}\)/,
  "Task candidate opening should reuse the canonical registered Task edit action with refresh and focus-return context",
);
assert.match(
  openTaskCandidateBody,
  /if \(result\.completed\) \{[\s\S]*detail\.taskLifecycleAction === "complete"[\s\S]*setTaskCompletionStatus\(detail\)[\s\S]*setStatus\("Task updated\."\)/,
  "Workbench should preserve task completion messaging and normal update messaging after the in-place editor closes",
);
assert.doesNotMatch(
  openTaskCandidateBody,
  /window\.location\.href/,
  "Task candidate opening should not navigate away from Workbench",
);

const fallbackBody = functionBody(workbenchScript, "openNonTaskFocusFallback");
assert.match(
  fallbackBody,
  /const href = candidatePageFallback\(candidate\);[\s\S]*Continuing this timer in Time Tracking\.[\s\S]*Opening this work in its module page until Task Focus supports this type\.[\s\S]*navigateFromWorkbench\(href, "work-candidate-fallback"\);/,
  "Non-task primary candidates should keep an explicit temporary page fallback through the guarded navigation path",
);
assert.match(
  fallbackBody,
  /Task Focus is currently available for task candidates only/,
  "Non-task primary candidates without a page URL should explain the missing Task Focus support",
);
assert.match(
  functionBody(workbenchScript, "isManualTimerCandidate"),
  /candidate\.moduleId === "time-tracking"[\s\S]*candidate\.recordType === "active_work_timer"[\s\S]*candidate\.metadata\?\.source_type \|\| "manual"/,
  "only Time Tracking-owned manual active-timer candidates should receive the explicit timer handoff",
);
assert.match(
  functionBody(workbenchScript, "candidatePageFallback"),
  /isManualTimerCandidate\(candidate\)[\s\S]*return "time-tracker\.html";[\s\S]*candidate\.primaryAction\?\.href \|\| candidate\.sourceUrl/,
  "manual timers should deliberately navigate to the Time Tracking page without a Workbench-owned editor or unstable record opener",
);
assert.doesNotMatch(
  functionBody(workbenchScript, "candidateModuleAction"),
  /time-tracking|active_work_timer|timer\.(?:edit|resume)/,
  "Workbench must not invent a registered manual-timer editor or lifecycle opener",
);

assert.match(
  functionBody(workbenchScript, "candidateTaskId"),
  /candidate\.moduleId === "tasks" && candidate\.recordType === "task" && candidate\.recordId[\s\S]*return candidate\.recordId;/,
  "Workbench should only treat normalized task records as in-place Task editor candidates",
);
assert.match(
  moduleActions,
  /const trigger = document\.activeElement[\s\S]*if \(trigger && typeof trigger\.focus === "function"\) \{[\s\S]*trigger\.focus\(\);/,
  "The shared module-action host should retain focus return for dispatched modal actions",
);
assert.match(
  taskDialogScript,
  /const returnFocusTo = params\.returnFocusTo \|\| params\.trigger \|\| hostContext\?\.trigger \|\| document\.activeElement \|\| null;/,
  "The canonical Task dialog should honor the Workbench trigger passed through module actions",
);
assert.match(
  taskDialogScript,
  /showTaskModal\(dialog, \{ trigger: returnFocusTo \}\)[\s\S]*restoreTaskEditorFocus\(returnFocusTo\);/,
  "The canonical Task dialog should open through the modal stack and restore focus on close",
);

assert.match(
  changelog,
  /## Version 0\.33\.6\.12a[\s\S]*Focus Selection\/Task Focus[\s\S]*`Focus task` markers/,
  "Changelog should preserve the Workbench Task Focus primary-action direction closeout",
);
assert.match(
  moduleContract,
  /As of 0\.33\.6\.12c-1, Workbench has explicit `focus-selection` and `task-focus` browser states[\s\S]*Primary actions on normalized Task candidates are labeled `Focus task` and enter Task Focus[\s\S]*The header action slot is `Change Focus`/,
  "Module contract should preserve the Workbench Task Focus primary-action direction",
);
assertRoadmapCursorAtLeast("0.33.8", "Live roadmap should advance to the current active cursor after the completed Workbench history");

console.log("Workbench explicit open/context regression passed.");

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`) >= 0
    ? source.indexOf(`function ${name}(`)
    : source.indexOf(`async function ${name}(`);
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
