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

const commandSource = readFileSync("scripts/run-changed-regressions.mjs", "utf8");
const executionSource = readFileSync("scripts/lib/changed-regression-runner.mjs", "utf8");
const routingSource = readFileSync("scripts/lib/regression-change-routing.mjs", "utf8");
const adviceSource = readFileSync("scripts/suggest-regressions-for-changes.mjs", "utf8");
const sliceSource = readFileSync("scripts/run-slice-verification.mjs", "utf8");
const workflowSource = readFileSync(".github/workflows/development-pr.yml", "utf8");

assert.match(commandSource, /collectChangedChangeSet\(\)/, "auto-run should inspect paths and package-version-only changes together");
assert.match(commandSource, /--prechecked/, "CI should be able to skip already-passed fast checks during full escalation");
assert.match(commandSource, /createChangedRegressionPlan/, "auto-run should consume the shared routing plan");
assert.match(executionSource, /runPackageScript\(match\[1\]\)/, "focused Node package scripts should use the shared direct invocation path");
assert.doesNotMatch(executionSource, /process\.env\.ComSpec|spawnSync\("npm"/, "changed execution should not rebuild the Windows npm shim path locally");
assert.match(routingSource, /LTF_REGRESSION_BASE_SHA/, "clean CI checkouts should compare the pull-request head with its exact base SHA");
assert.match(routingSource, /\$\{baseSha\}\.\.\.HEAD/, "CI comparison should use the merge-base diff rather than an empty working tree");
assert.match(routingSource, /--name-status[\s\S]*--find-renames[\s\S]*--diff-filter=ACMRD/, "tracked collection must retain rename sources and deleted paths");
for (const [label, source] of [["advice", adviceSource], ["local execution", commandSource], ["slice verification", sliceSource]]) {
  assert.match(source, /collectChangedChangeSet/, `${label} must collect one shared change set`);
  assert.match(source, /regression-change-routing\.mjs/, `${label} must consume the canonical routing owner directly or through its plan`);
}
assert.match(workflowSource, /test:regressions:changed:ci/, "CI must invoke the same local changed-regression entry point in prechecked mode");

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
  ["src/modules/files/files.routes.js", ["files"]],
  ["src/routes/permissions.routes.js", ["permissions"]],
]) {
  const suggestion = suggestRegressionsForPaths([filePath]);
  const plan = createChangedRegressionPlan([filePath]);
  assert.deepEqual(plan.areas, suggestion.areas, `${filePath} execution and suggestion areas should agree`);
  assert.deepEqual(plan.areas, expectedAreas);
  assert.equal(plan.mode, "full-check");
  assert.deepEqual(plan.commands, ["npm run check"], `${filePath} should conservatively escalate to the full gate`);
}

const precheckedPlan = createChangedRegressionPlan(["src/db/migrations/070_example.sql"], { prechecked: true });
assert.equal(precheckedPlan.mode, "full-regressions");
assert.deepEqual(precheckedPlan.commands, ["npm run test:regressions"]);

const ceremonyPlan = createChangedRegressionPlan(["package.json", "package-lock.json", "CHANGELOG.md", "ROADMAP.md"], {
  versionBookkeepingPaths: ["package.json", "package-lock.json"],
});
assert.equal(ceremonyPlan.mode, "focused");
assert.deepEqual(ceremonyPlan.commands, ["npm run test:regressions:release"]);

const unknownPlan = createChangedRegressionPlan(["unmapped/example.txt"]);
assert.equal(unknownPlan.mode, "full-check");
assert.deepEqual(unknownPlan.commands, ["npm run check"]);
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
