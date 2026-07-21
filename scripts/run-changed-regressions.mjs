import { collectChangedChangeSet } from "./lib/regression-change-routing.mjs";
import {
  createChangedRegressionPlan,
  executeChangedRegressionPlan,
  formatChangedRegressionPlan,
} from "./lib/changed-regression-runner.mjs";

const args = process.argv.slice(2);
if (args.some((argument) => argument !== "--prechecked") || args.filter((argument) => argument === "--prechecked").length > 1) {
  throw new Error("Usage: node scripts/run-changed-regressions.mjs [--prechecked]");
}

const changeSet = collectChangedChangeSet();
const plan = createChangedRegressionPlan(changeSet.paths, {
  prechecked: args.includes("--prechecked"),
  versionBookkeepingPaths: changeSet.versionBookkeepingPaths,
});
console.log(formatChangedRegressionPlan(plan));
const result = executeChangedRegressionPlan(plan);
process.exitCode = result.status;
