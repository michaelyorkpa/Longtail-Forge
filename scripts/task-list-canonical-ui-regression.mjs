import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tasksScript = readText("public/js/tasks.js");
const tasksView = readText("views/protected/tasks.html");
const taskDensityRegression = readText("scripts/task-list-density-regression.mjs");

assert.match(tasksScript, /function buildTaskQuery\(\)/, "Tasks browser script should build canonical task query intent");
assert.match(tasksScript, /new URLSearchParams\(\)/, "Tasks browser filters should be sent as URL query parameters");
assert.match(tasksScript, /api\.getJson\(query \? `\/api\/tasks\?\$\{query\}` : "\/api\/tasks"/, "Tasks browser should load filtered lists from the canonical Tasks API");
assert.match(tasksScript, /params\.set\("status", canonicalStatusValue\(statusValue\)\)/, "Tasks browser should send status filter intent");
assert.match(tasksScript, /params\.set\("sort", canonicalSortValue/, "Tasks browser should send sort intent");
assert.match(tasksScript, /params\.set\("task_view", canonicalTaskViewValue\(taskView\)\)/, "Tasks browser should send saved task views as canonical task_view intent");
assert.match(tasksScript, /params\.set\("tags", tagValue\)/, "Tasks browser should send tag and No Tags filter intent to the Tags contract");
assert.match(tasksScript, /function emptyTaskMessage\(\)/, "Tasks browser should keep filter-specific empty states");

assert.doesNotMatch(tasksScript, /function filteredTasks\(/, "Tasks browser must not own canonical task filtering");
assert.doesNotMatch(tasksScript, /function sortedTasks\(/, "Tasks browser must not own canonical task sorting");
assert.doesNotMatch(tasksScript, /function matchesQuickFilter\(/, "Tasks browser must not duplicate canonical quick-filter rules");
assert.doesNotMatch(tasksScript, /function dueSortValue\(/, "Tasks browser must not keep due-date sorting as canonical logic");
assert.doesNotMatch(tasksScript, /function priorityRank\(/, "Tasks browser must not keep priority sorting as canonical logic");

assert.match(tasksView, /<main class="wide-page tasks-page" data-tasks-host><\/main>/, "Tasks protected view should remain a descriptor host");
assert.doesNotMatch(tasksView, /data-task-view-selector|data-task-list|data-task-dialog|data-task-bulk-toolbar/, "Tasks protected view should not ship view, list, bulk, or dialog anatomy");
assert.match(tasksScript, /<option value="my" selected>My Tasks<\/option>\s*<option value="all">All<\/option>\s*<option value="unassigned">Unassigned<\/option>/, "All task view option should remain between My Tasks and Unassigned");
assert.doesNotMatch(tasksScript, /data-task-quick-filter/, "Tasks sidebar should not keep the old quick-filter button controls");
assert.match(tasksScript, /<option value="last_worked">Last Worked<\/option>/, "Tasks sort control should expose Last Worked");
assert.match(tasksScript, /<option value="context">Project \/ Client<\/option>/, "Tasks sort control should expose Project / Client context sorting");
assert.match(taskDensityRegression, /task-density-row/, "Dense task row regression should remain active");

console.log("Task list canonical UI regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
