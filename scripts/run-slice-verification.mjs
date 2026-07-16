import { collectChangedPaths } from "./lib/regression-change-routing.mjs";
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

const changedPaths = collectChangedPaths();
const changedRegressionPlan = createChangedRegressionPlan(changedPaths);
const plan = createSliceVerificationPlan(changedRegressionPlan);

console.log(formatSliceVerificationPlan(plan));
const result = executeSliceVerificationPlan(plan);
console.log(`\n${formatSliceVerificationSummary(plan, result)}`);
process.exitCode = result.status;
