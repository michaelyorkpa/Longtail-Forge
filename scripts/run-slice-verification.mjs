import { performance } from "node:perf_hooks";
import { collectChangedChangeSet } from "./lib/regression-change-routing.mjs";
import { createChangedRegressionPlan } from "./lib/changed-regression-runner.mjs";
import {
  createSliceVerificationPlan,
  executeSliceVerificationPlan,
  formatSliceVerificationPlan,
  formatSliceVerificationSummary,
} from "./lib/slice-verification-plan.mjs";

if (process.argv.length > 2) {
  throw new Error("Usage: node scripts/run-slice-verification.mjs");
}

const contextStarted = performance.now();
const changeSet = collectChangedChangeSet();
const changedRegressionPlan = createChangedRegressionPlan(changeSet.paths, {
  versionBookkeepingPaths: changeSet.versionBookkeepingPaths,
});
const plan = createSliceVerificationPlan(changedRegressionPlan);
const contextSeconds = (performance.now() - contextStarted) / 1000;

console.log(formatSliceVerificationPlan(plan));
const result = executeSliceVerificationPlan(plan, { contextSeconds });
console.log(`\n${formatSliceVerificationSummary(plan, result)}`);
process.exitCode = result.status;
