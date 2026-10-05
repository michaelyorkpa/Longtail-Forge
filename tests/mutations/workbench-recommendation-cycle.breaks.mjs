import { runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";
runMutationCampaign({
  sourcePath: "public/js/workbench.js",
  suites: ["tests/unit/workbench-recommendation-cycle.test.mjs"],
  suiteTimeoutMs: 20000,
  campaignTimeoutMs: 120000,
  cases: [
    { name: "decimal-prefix parsing becomes whole-value conversion", find: 'Number.parseInt(`${index}`, 10)', replace: 'Number(`${index}`)' },
    { name: "empty list evaluates the index instead of short-circuiting", find: 'if (candidateCount <= 0) {', replace: 'if (candidateCount < -1) {' },
    { name: "upper index bound becomes a lower bound", find: 'Math.min(parsedIndex, candidateCount - 1)', replace: 'Math.max(parsedIndex, candidateCount - 1)' },
    { name: "previous navigation advances instead", find: '(state.recommendedCandidateIndex + direction + candidates.length) % candidates.length', replace: '(state.recommendedCandidateIndex - direction + candidates.length) % candidates.length' },
  ],
});
// Restoring parseInt(index, 10) is equivalent at runtime and intentionally not counted as a break.
