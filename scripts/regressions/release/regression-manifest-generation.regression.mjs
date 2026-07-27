export const regressionMeta = Object.freeze({
  id: "release.regression-manifest-generation",
  area: "release",
  tier: "release-gate",
  tags: ["coverage", "manifest", "release"],
  description: "Proves the generated regression coverage index and explicit exception policy prevent silent coverage loss.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRegressionManifest,
  collectRegressionCoverageErrors,
  serializeRegressionManifest,
} from "../../lib/regression-manifest.mjs";
import { extractRegressionMeta } from "../../lib/regression-metadata.mjs";
import { REGRESSION_ENTRIES } from "../../regression-suite.mjs";

const manifest = JSON.parse(readFileSync("scripts/regression-coverage-manifest.json", "utf8"));
const policy = JSON.parse(readFileSync("scripts/regression-coverage-exceptions.json", "utf8"));
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const generatorSource = readFileSync("scripts/generate-regression-manifest.mjs", "utf8");
const generated = buildRegressionManifest({ entries: REGRESSION_ENTRIES, policy });

assert.equal(packageJson.scripts["regressions:manifest"], "node scripts/generate-regression-manifest.mjs");
assert.equal(packageJson.scripts["regressions:manifest:check"], "node scripts/generate-regression-manifest.mjs --check");
assert.match(generatorSource, /Regression coverage manifest is stale/);

assert.equal(
  serializeRegressionManifest(generated),
  serializeRegressionManifest(buildRegressionManifest({ entries: REGRESSION_ENTRIES, policy })),
  "manifest generation should be deterministic",
);
assert.equal(
  serializeRegressionManifest(manifest),
  serializeRegressionManifest(generated),
  "checked-in manifest should equal metadata generation",
);
assert.deepEqual(
  collectRegressionCoverageErrors({ entries: REGRESSION_ENTRIES, manifest, policy }),
  [],
  "live generated coverage should satisfy the exception policy",
);
assert.equal(manifest.summary.discoveredScripts, REGRESSION_ENTRIES.length);
const creditedLegacyRetirements = policy.retiredScripts.filter((entry) => entry.floorCredit === true && entry.legacy === true).length;
assert.equal(
  manifest.summary.legacyScripts,
  policy.legacyMetadataException.expectedScripts - creditedLegacyRetirements,
  "legacy summary should preserve the recorded baseline minus credited legacy retirements",
);
assert.ok(
  manifest.regressions.every((entry) => (
    entry.id && entry.area && entry.tier && Array.isArray(entry.tags) && entry.description && entry.runMode
  )),
  "generated index should carry required discovered metadata",
);
assert.ok(
  manifest.regressions.filter((entry) => entry.releaseGate).every((entry) => entry.tier === "release-gate"),
  "release-gate status should be derived from metadata tier",
);
assert.deepEqual(
  manifest.assertionMovements,
  [...policy.assertionMovements].sort((left, right) => left.sourceRegression.localeCompare(right.sourceRegression)),
  "generated coverage should retain explicit partial assertion movements without retiring their integration owners",
);

assert.throws(
  () => extractRegressionMeta(
    "export const regressionMeta = { id: \"release.missing-fields\", area: \"release\" };",
    "scripts/regressions/release/missing-fields.regression.mjs",
  ),
  /missing required field\(s\)/,
  "missing metadata should be rejected before manifest generation",
);

const duplicateEntries = [
  ...REGRESSION_ENTRIES,
  { ...REGRESSION_ENTRIES[0], path: "scripts/regressions/release/duplicate-id.regression.mjs" },
];
assert.throws(
  () => buildRegressionManifest({ entries: duplicateEntries, policy }),
  /duplicate regression IDs/,
  "duplicate regression IDs should fail generation",
);

const dashboardEntries = REGRESSION_ENTRIES.filter((entry) => entry.area === "dashboard");
assert.equal(dashboardEntries.length, 2, "fixture needs both active Dashboard coverage owners");
const withoutDashboard = REGRESSION_ENTRIES.filter((entry) => entry.area !== "dashboard");
const uncoveredPolicy = cloneFixture(policy);
uncoveredPolicy.minimumActiveScripts = REGRESSION_ENTRIES.length
  + uncoveredPolicy.retiredScripts.filter((entry) => entry.floorCredit === true).length
  + 1;
const uncoveredManifest = buildRegressionManifest({ entries: withoutDashboard, policy: uncoveredPolicy });
const uncoveredErrors = collectRegressionCoverageErrors({
  entries: withoutDashboard,
  manifest: uncoveredManifest,
  policy: uncoveredPolicy,
}).join("\n");
assert.match(uncoveredErrors, /area dashboard has 0 regressions below policy floor 2/);
assert.match(uncoveredErrors, /protected area dashboard has no active regression or credited retirement/);
assert.match(uncoveredErrors, /active regression count .* below policy floor/);

const retirementPolicy = cloneFixture(policy);
for (const dashboardEntry of dashboardEntries) {
  retirementPolicy.retiredScripts.push({
    id: dashboardEntry.id,
    script: dashboardEntry.path,
    area: dashboardEntry.area,
    tier: dashboardEntry.tier,
    tags: [...dashboardEntry.tags],
    legacy: dashboardEntry.legacy,
    floorCredit: true,
    retiredInVersion: "synthetic-test-fixture",
    retirementType: "assertions-moved",
    rationale: "Synthetic fixture proves explicit credited retirements can lower protected floors.",
    assertionDisposition: "Synthetic Dashboard assertions move to the retained regression discovery owner.",
    retainedCoverageOwners: ["release.regression-manifest-generation"],
    verificationPerformed: ["node scripts/regressions/release/regression-manifest-generation.regression.mjs"],
  });
}
const retiredManifest = buildRegressionManifest({ entries: withoutDashboard, policy: retirementPolicy });
assert.deepEqual(
  collectRegressionCoverageErrors({ entries: withoutDashboard, manifest: retiredManifest, policy: retirementPolicy }),
  [],
  "complete explicit retirement should lower global, area, and legacy floors without weakening other coverage",
);

const staleManifest = cloneFixture(manifest);
staleManifest.regressions = staleManifest.regressions.slice(1);
assert.match(
  collectRegressionCoverageErrors({ entries: REGRESSION_ENTRIES, manifest: staleManifest, policy }).join("\n"),
  /generated manifest is stale/,
  "manual generated-index edits should fail the manifest check",
);

console.log("Regression manifest generation and ratchet passed.");

function cloneFixture(value) {
  return JSON.parse(JSON.stringify(value));
}
