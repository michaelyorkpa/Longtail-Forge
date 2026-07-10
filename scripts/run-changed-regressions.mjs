import { collectChangedPaths } from "./lib/regression-change-routing.mjs";
import {
  createChangedRegressionPlan,
  executeChangedRegressionPlan,
  formatChangedRegressionPlan,
} from "./lib/changed-regression-runner.mjs";

if (process.argv.length > 2) {
  throw new Error("Usage: node scripts/run-changed-regressions.mjs");
}

const plan = createChangedRegressionPlan(collectChangedPaths());
console.log(formatChangedRegressionPlan(plan));
const result = executeChangedRegressionPlan(plan);
process.exitCode = result.status;
