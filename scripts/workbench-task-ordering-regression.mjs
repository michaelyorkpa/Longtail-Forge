import assert from "node:assert/strict";

import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

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
  /"task-workbench-items": loadTaskOptionsData/,
  "Workbench should retain the Tasks source loader only for module-owned task options.",
);
assert.match(
  workbenchScript,
  /async function loadTaskOptionsData\(card\)[\s\S]*api\.getJson\(card\.listRoute[\s\S]*taskOptions: data\?\.options \|\| \{ projects: \[\] \}/,
  "Workbench should load Tasks options from the contributed route without consuming an all-tasks list.",
);
assert.match(
  workbenchScript,
  /taskOptions: sourceData\.taskOptions \|\| bootstrap\.taskOptions \|\| \{ projects: \[\] \}/,
  "Workbench browser state should retain task options from module-owned source payloads.",
);
assert.doesNotMatch(
  workbenchScript,
  /taskItems|workbench-task-list|function renderTasks|taskSortInput|readTaskProjectSortOrders/,
  "Workbench should not keep the removed all-tasks list, task item state, or list ordering path.",
);
assert.match(
  tasksScript,
  /function defaultStatusForTaskView\(taskView\)[\s\S]*return "active";/,
  "Tasks active saved views should reset stale Completed or Archived status filters to Active.",
);

console.log("Workbench task options regression passed.");
