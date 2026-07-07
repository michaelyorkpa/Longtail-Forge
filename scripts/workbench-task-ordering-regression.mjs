import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workbenchScript = readText("public/js/workbench.js");
const tasksService = readText("src/modules/tasks/tasks.service.js");
const tasksScript = readText("public/js/tasks.js");

assert.match(
  tasksService,
  /async function listWorkbenchItems\(session, query = \{\}\)[\s\S]*listWorkItems\(session, query\)/,
  "Tasks should own the canonical Workbench work item payload.",
);
assert.match(
  workbenchScript,
  /loadTaskCardData[\s\S]*card\.listRoute[\s\S]*taskOptions: data\?\.options \|\| \{ projects: \[\] \}/,
  "Workbench should load Tasks options from the contributed workbench list route.",
);
assert.match(
  workbenchScript,
  /taskOptions: sourceData\.taskOptions \|\| bootstrap\.taskOptions \|\| \{ projects: \[\] \}/,
  "Workbench browser state should retain task options from module-owned source payloads.",
);
assert.match(
  workbenchScript,
  /option\("priority_desc", "Priority"\)/,
  "Workbench task sort control should expose a priority sort option.",
);
assert.match(
  workbenchScript,
  /if \(taskSortInput\?\.value === "priority_desc"\)/,
  "Workbench task sort should implement priority sorting.",
);
assert.match(
  workbenchScript,
  /function readTaskProjectSortOrders/,
  "Workbench task sort should read project default sort orders from task options.",
);
assert.match(
  workbenchScript,
  /function compareByProjectSortOrder/,
  "Workbench task sort should compare tasks by project default sort order.",
);
assert.match(
  workbenchScript,
  /projectsById\.get\(projectId\)\?\.taskDefaults\?\.sortOrder/,
  "Workbench should use project taskDefaults.sortOrder rather than hard-coded project metadata.",
);
assert.match(
  tasksScript,
  /function defaultStatusForTaskView\(taskView\)[\s\S]*return "active";/,
  "Tasks active saved views should reset stale Completed or Archived status filters to Active.",
);

console.log("Workbench task ordering regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
