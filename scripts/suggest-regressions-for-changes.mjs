import {
  collectChangedPaths,
  suggestRegressionsForPaths,
} from "./lib/regression-change-routing.mjs";

const suggestion = suggestRegressionsForPaths(collectChangedPaths());

if (suggestion.paths.length === 0) {
  console.log("No changed files found. Suggested fallback:");
} else {
  console.log(`Changed files inspected: ${suggestion.paths.length}`);
  console.log("Suggested focused regression commands:");
}
for (const command of suggestion.commands) {
  console.log(`- ${command}`);
}
console.log(`Release closeout gate (always): ${suggestion.releaseGate}`);
