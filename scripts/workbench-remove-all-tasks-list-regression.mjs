import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertRoadmapCursorAtLeast } from "./lib/roadmap-cursor.mjs";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const changelog = readText("CHANGELOG.md");
const css = readText("public/css/longtail-forge.css");
const workbenchHtml = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");
const workbenchService = readText("src/services/workbench.service.js");

assert.equal(packageJson.version, appVersion, "package.json should report the Workbench no-all-tasks-list version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Workbench no-all-tasks-list version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Workbench no-all-tasks-list version");
assert.match(workbenchHtml, /longtail-forge\.css/, "Workbench should bump the stylesheet cache key after removing task-list styles");
assert.match(workbenchHtml, /workbench\.js/, "Workbench should bump the script cache key after removing task-list rendering");

assert.doesNotMatch(
  workbenchScript,
  /function createTaskSection|workbench-task-list|workbench-task-toolbar|workbenchTaskList|function renderTasks|taskItems|TASK_FILTERS|WORKBENCH_TASK_FILTER_KEY|taskSortInput|taskFilters|taskList/,
  "Workbench browser code must not keep the all-tasks section, task list state, filters, sorting, or renderer",
);
assert.doesNotMatch(
  workbenchService,
  /taskItems/,
  "Workbench bootstrap should not keep an empty taskItems compatibility field after the task list is removed",
);
assert.doesNotMatch(
  css,
  /workbench-task-list|workbench-task-toolbar|workbench-task-item|workbench-task-tag|workbench-filter-bar|workbench-sort-control/,
  "Workbench stylesheet should not keep styling hooks for the removed all-tasks list",
);
assert.doesNotMatch(
  workbenchHtml,
  /workbench-task-list|workbench-task-toolbar|data-workbench-card|data-workbench-renderer/,
  "Workbench host should remain a minimal framework host without task-list anatomy",
);

assert.match(
  workbenchScript,
  /"task-workbench-items": loadTaskOptionsData[\s\S]*async function loadTaskOptionsData\(card\)/,
  "Workbench should keep the Tasks contribution source only for task options needed by surviving paths",
);
const loadTaskOptionsData = extractFunctionBody(workbenchScript, "loadTaskOptionsData");
assert.match(loadTaskOptionsData, /api\.getJson\(card\.listRoute/, "Task options should still load from the contributed list route");
assert.match(loadTaskOptionsData, /taskOptions: data\?\.options \|\| \{ projects: \[\] \}/, "Task options should remain normalized");
assert.doesNotMatch(loadTaskOptionsData, /items|taskItems/, "Task options loading must not consume task-list items");

assert.match(
  workbenchScript,
  /workbenchHost\.replaceChildren\([\s\S]*createWorkbenchShell\(\)[\s\S]*function createWorkbenchShell\(\)[\s\S]*createRecommendedActionPanel\(\)[\s\S]*createSecondaryWorkbenchPanel\(\)[\s\S]*createWorkbenchInspectorPanel\(\)/,
  "Workbench should still build the recommended-action, timer, and right-panel overflow surfaces",
);
assert.match(
  workbenchScript,
  /function renderWorkbench\(\) \{[\s\S]*renderRecommendedAction\(\);[\s\S]*renderWorkbenchInspector\(\);/,
  "Workbench render should keep the recommendation and right-panel overflow surfaces active",
);
assert.match(
  workbenchScript,
  /function renderRecommendedAction\(\)[\s\S]*recommendedCandidateWindow\(\)[\s\S]*createRecommendedCandidateCard/,
  "The focused recommended-action card should still render from ranked candidates",
);
assert.match(
  workbenchScript,
  /function workbenchInspectorCandidates\(\)[\s\S]*recommendedOverflowCandidates\(\)[\s\S]*WORKBENCH_INSPECTOR_LIMIT/,
  "The right-side More in this focus Inspector should render overflow candidates",
);
assert.match(
  workbenchScript,
  /async function openTaskCandidate\(candidate, taskId, trigger = null\)[\s\S]*moduleActions\.open\("tasks\.edit"/,
  "Task candidates should still open through the registered in-place Tasks editor",
);

const secondaryWorkbenchPanel = extractFunctionBody(workbenchScript, "createSecondaryWorkbenchPanel");
assert.match(secondaryWorkbenchPanel, /createTimerSection\(\)/, "Workbench should keep the active timer section");
assert.doesNotMatch(secondaryWorkbenchPanel, /createTaskSection|task-workbench-items|createSecondaryCandidateSection/, "Workbench should not add the removed all-tasks or main-column overflow sections to its layout");

assert.match(
  changelog,
  /## Version 0\.33\.6\.6g[\s\S]*no all-tasks\/taskItems\/task-list hooks while retaining recommended-action and secondary-candidate hooks/,
  "Changelog should preserve the completed no-all-tasks-list Workbench slice",
);
assertRoadmapCursorAtLeast("0.33.8", "Live roadmap should advance to the current active cursor after the completed Workbench history");

console.log("Workbench remove all-tasks list regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function extractFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);

  const openBrace = source.indexOf("{", start);
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
