import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRegressionManifest,
  collectRegressionCoverageErrors,
  validateRegressionCoverage,
} from "./lib/regression-manifest.mjs";
import { REGRESSION_ENTRIES } from "./regression-suite.mjs";

const manifest = JSON.parse(readFileSync("scripts/regression-coverage-manifest.json", "utf8"));
const policy = JSON.parse(readFileSync("scripts/regression-coverage-exceptions.json", "utf8"));

validateRegressionCoverage({ entries: REGRESSION_ENTRIES, manifest, policy });

const requiredReleaseGateId = policy.requiredReleaseGateIds[0];
const withoutReleaseGate = REGRESSION_ENTRIES.filter((entry) => entry.id !== requiredReleaseGateId);
const uncoveredManifest = buildRegressionManifest({ entries: withoutReleaseGate, policy });
const uncoveredErrors = collectRegressionCoverageErrors({
  entries: withoutReleaseGate,
  manifest: uncoveredManifest,
  policy,
}).join("\n");

assert.match(uncoveredErrors, /active regression count .* below policy floor/);
assert.match(uncoveredErrors, /release-gate count .* below policy floor/);
assert.match(uncoveredErrors, new RegExp(`required release-gate regression ${escapeRegExp(requiredReleaseGateId)} is missing`));

const malformedPolicy = cloneFixture(policy);
malformedPolicy.retiredScripts.push({
  script: "scripts/synthetic-retired-regression.mjs",
  retirementType: "assertions-moved",
  floorCredit: true,
  retainedCoverageOwners: [],
  verificationPerformed: [],
});
const malformedManifest = buildRegressionManifest({ entries: REGRESSION_ENTRIES, policy: malformedPolicy });
const malformedErrors = collectRegressionCoverageErrors({
  entries: REGRESSION_ENTRIES,
  manifest: malformedManifest,
  policy: malformedPolicy,
}).join("\n");

for (const requiredEvidence of [
  "retiredInVersion",
  "rationale",
  "assertionDisposition",
  "retainedCoverageOwners",
  "verificationPerformed",
  "credited retirement should include id",
  "credited retirement should include area",
  "credited retirement should include tier",
  "credited retirement should include tags",
]) {
  assert.match(malformedErrors, new RegExp(escapeRegExp(requiredEvidence)));
}

const manualEdit = cloneFixture(manifest);
manualEdit.summary.discoveredScripts -= 1;
assert.match(
  collectRegressionCoverageErrors({ entries: REGRESSION_ENTRIES, manifest: manualEdit, policy }).join("\n"),
  /generated manifest is stale/,
  "manual generated manifest edits should fail",
);

console.log("Regression coverage ratchet passed.");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cloneFixture(value) {
  return JSON.parse(JSON.stringify(value));
}
