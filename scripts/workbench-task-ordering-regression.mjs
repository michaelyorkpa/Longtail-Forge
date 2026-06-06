import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workbenchView = readText("views/protected/workbench.html");
const workbenchScript = readText("public/js/workbench.js");
const workbenchService = readText("src/services/workbench.service.js");
const tasksScript = readText("public/js/tasks.js");

assert.match(
  workbenchService,
  /taskOptions: taskResult\?\.options \|\| null/,
  "Workbench bootstrap should expose Tasks module options without Workbench owning task metadata.",
);
assert.match(
  workbenchScript,
  /taskOptions: bootstrap\.taskOptions \|\| \{ projects: \[\] \}/,
  "Workbench browser state should retain task options from the module-owned task payload.",
);
assert.match(
  workbenchView,
  /<option value="priority_desc">Priority<\/option>/,
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
  /if \(!state\.quickFilter\) \{\s*statusFilter\.value = "all";/s,
  "Tasks All quick-filter should reset the stale Completed or Archived status filter.",
);

console.log("Workbench task ordering regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
