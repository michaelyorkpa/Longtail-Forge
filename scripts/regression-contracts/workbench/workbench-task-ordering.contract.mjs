import assert from "node:assert/strict";

import { createProjectTextReader } from "../../test-support/source-scan.mjs";
// Consolidated under workbench.current-static-contracts by 0.33.33.10.
const { readText } = createProjectTextReader();

const workbenchScript = readText("public/js/workbench.js");
const workbenchService = readText("src/services/workbench.service.js");
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
// 0.33.33.38.4.3.7: the bootstrap arm this used to pin was dead. `workbenchService.bootstrap`
// returns `taskOptions: null` unconditionally, so the middle branch could never be taken, and the
// browser contract now states that. What the assertion actually names - that module-owned source
// payloads win over the local default - is asserted directly.
assert.match(
  workbenchScript,
  /taskOptions: sourceData\.taskOptions \|\| \{ projects: \[\] \}/,
  "Workbench browser state should retain task options from module-owned source payloads.",
);
assert.match(
  workbenchService,
  /\n\s+taskOptions: null,/,
  "and the bootstrap must keep sending none, or the browser owes that branch a contract again.",
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
