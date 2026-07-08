import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.6.11b";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const roadmap = readText("ROADMAP.md");
const taskDialogScript = readText("public/js/task-dialog.js");
const moduleActions = readText("public/js/shared/module-actions.js");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");

assert.equal(packageJson.version, appVersion, "package.json should report the in-place Workbench open-work version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the in-place Workbench open-work version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the in-place Workbench open-work version");

assert.match(
  workbenchHtml,
  /js\/task-dialog\.js\?v=23[\s\S]*js\/workbench\.js\?v=27/,
  "Workbench should load the canonical Task dialog before the cache-busted Workbench adapter",
);

assert.match(
  workbenchScript,
  /onClick: \(event\) => openCandidate\(candidate, event\?\.currentTarget \|\| null\)/,
  "Recommended and secondary Open Work controls should pass their triggering control into the candidate opener",
);
assert.match(
  functionBody(workbenchScript, "candidateActionLabel"),
  /candidateModuleAction\(candidate\) \|\| candidate\.sourceUrl \|\| candidate\.primaryAction\?\.href[\s\S]*return "Open work";/,
  "Candidates with a module action or page fallback should keep the Open Work label",
);

const openCandidateBody = functionBody(workbenchScript, "openCandidate");
assert.match(
  openCandidateBody,
  /const taskId = candidateTaskId\(candidate\);[\s\S]*if \(taskId\) \{[\s\S]*await openTaskCandidate\(candidate, taskId, trigger\);[\s\S]*return;[\s\S]*\}[\s\S]*const action = candidateModuleAction\(candidate\);[\s\S]*if \(action\) \{[\s\S]*await openModuleActionCandidate\(candidate, action, trigger\);[\s\S]*return;[\s\S]*\}[\s\S]*openCandidateNavigationFallback\(candidate\);/,
  "Open Work should dispatch task candidates and registered module-action candidates before falling back to navigation",
);
assert.doesNotMatch(
  openCandidateBody,
  /window\.location\.href/,
  "The main candidate opener should not navigate task candidates away from Workbench",
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

const fallbackBody = functionBody(workbenchScript, "openCandidateNavigationFallback");
assert.match(
  fallbackBody,
  /const href = candidate\.primaryAction\?\.href \|\| candidate\.sourceUrl \|\| "";[\s\S]*Opening this work in its module page\.[\s\S]*window\.location\.href = href;/,
  "Candidates without an in-place editor should keep an explicit temporary page fallback",
);
assert.match(
  fallbackBody,
  /does not have an in-place editor or page fallback yet/,
  "Candidates without a modal or page URL should explain the missing opener instead of silently doing nothing",
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
  roadmap,
  /### Version 0\.33\.6\.6c - In-place record editing from Workbench[\s\S]*- \[x\] Change the Workbench "Open Work" action[\s\S]*- \[x\] Reuse the canonical task opener[\s\S]*- \[x\] Where a candidate's record type has no in-place modal yet[\s\S]*- \[x\] Preserve permission checks[\s\S]*- \[x\] Add regressions proving "Open Work"/,
  "Roadmap should mark the Workbench in-place Open Work slice complete",
);

console.log("Workbench in-place Open Work regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

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
