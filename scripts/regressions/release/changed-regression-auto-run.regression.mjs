export const regressionMeta = Object.freeze({
  id: "release.changed-regression-auto-run",
  area: "release",
  tier: "release-gate",
  tags: ["commands", "release", "routing"],
  description: "Proves changed-file routing can execute focused areas in one step and escalates shared changes without replacing the release gate.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createChangedRegressionPlan,
  executeChangedRegressionPlan,
  formatChangedRegressionPlan,
} from "../../lib/changed-regression-runner.mjs";
import { suggestRegressionsForPaths } from "../../lib/regression-change-routing.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const commandSource = readFileSync("scripts/run-changed-regressions.mjs", "utf8");
const routingSource = readFileSync("scripts/lib/regression-change-routing.mjs", "utf8");

assert.equal(packageJson.scripts["test:regressions:changed"], "node scripts/run-changed-regressions.mjs");
assert.match(commandSource, /collectChangedPaths\(\)/, "auto-run should inspect changes on the same basis as the suggester");
assert.match(commandSource, /createChangedRegressionPlan/, "auto-run should consume the shared routing plan");
assert.match(routingSource, /LTF_REGRESSION_BASE_SHA/, "clean CI checkouts should compare the pull-request head with its exact base SHA");
assert.match(routingSource, /\$\{baseSha\}\.\.\.HEAD/, "CI comparison should use the merge-base diff rather than an empty working tree");

const taskPaths = ["src/modules/tasks/tasks.service.js"];
const taskSuggestion = suggestRegressionsForPaths(taskPaths);
const taskPlan = createChangedRegressionPlan(taskPaths);
assert.deepEqual(taskPlan.areas, taskSuggestion.areas);
assert.deepEqual(taskPlan.commands, ["npm run test:regressions:tasks"]);
assert.equal(taskPlan.mode, "focused");
assert.match(formatChangedRegressionPlan(taskPlan), /Tasks-owned path -> tasks/);

const taskExecutions = [];
const taskResult = executeChangedRegressionPlan(taskPlan, {
  runCommand(command) {
    taskExecutions.push(command);
    return { status: 0 };
  },
});
assert.equal(taskResult.status, 0);
assert.deepEqual(taskExecutions, ["npm run test:regressions:tasks"], "one-module changes should run only their selected area");

for (const [filePath, expectedAreas] of [
  ["public/js/shared/view-builder.js", ["framework", "views"]],
  ["src/db/migrations/070_example.sql", ["database"]],
  ["src/core/version.js", ["framework", "release"]],
]) {
  const suggestion = suggestRegressionsForPaths([filePath]);
  const plan = createChangedRegressionPlan([filePath]);
  assert.deepEqual(plan.areas, suggestion.areas, `${filePath} execution and suggestion areas should agree`);
  assert.deepEqual(plan.areas, expectedAreas);
  assert.equal(plan.mode, "full-check");
  assert.deepEqual(plan.commands, ["npm run check"], `${filePath} should conservatively escalate to the full gate`);
}

const unknownPlan = createChangedRegressionPlan(["unmapped/example.txt"]);
assert.equal(unknownPlan.mode, "fallback");
assert.deepEqual(unknownPlan.commands, ["npm run test:regressions"]);
assert.match(formatChangedRegressionPlan(unknownPlan), /No specific route matched/);

const emptyPlan = createChangedRegressionPlan([]);
let emptyExecutions = 0;
const emptyResult = executeChangedRegressionPlan(emptyPlan, {
  runCommand() {
    emptyExecutions += 1;
    return { status: 0 };
  },
});
assert.equal(emptyResult.status, 0);
assert.equal(emptyExecutions, 0, "an empty change set should not run a command");
assert.deepEqual(emptyPlan.commands, []);
assert.match(formatChangedRegressionPlan(emptyPlan), /No changed files found\. No regressions were run\./);
assert.doesNotMatch(formatChangedRegressionPlan(emptyPlan), /pass(?:ed|ing)/i, "empty routing should not report a false passing run");

const failedResult = executeChangedRegressionPlan(taskPlan, { runCommand: () => ({ status: 7 }) });
assert.equal(failedResult.status, 7, "auto-run should propagate selected regression failures");

console.log("Changed-area regression auto-run command passed.");
