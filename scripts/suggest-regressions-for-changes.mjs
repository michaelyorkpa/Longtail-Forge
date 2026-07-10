import {
  collectChangedPaths,
  suggestRegressionsForPaths,
} from "./lib/regression-change-routing.mjs";

const suggestion = suggestRegressionsForPaths(collectChangedPaths());

if (suggestion.paths.length === 0) {
  console.log("No changed files found. No focused regression command is suggested.");
} else {
  console.log(`Changed files inspected: ${suggestion.paths.length}`);
  console.log("Suggested focused regression commands:");
}
for (const command of suggestion.commands) {
  console.log(`- ${command}`);
}
if (suggestion.fullCheckRecommended) {
  console.log("Escalation recommended: shared/framework, database, view, or release changes require the full release gate.");
}
console.log(`Release closeout gate (always): ${suggestion.releaseGate}`);
