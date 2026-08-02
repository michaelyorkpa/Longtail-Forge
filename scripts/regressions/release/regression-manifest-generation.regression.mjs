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
  buildRatchetedCoveragePolicy,
  collectCoverageFloorDriftErrors,
  collectRegressionCoverageErrors,
  serializeRegressionManifest,
} from "../../lib/regression-manifest.mjs";
import {
  INVENTORY_END,
  INVENTORY_START,
  buildRegressionDocInventory,
  replaceRegressionDocInventory,
} from "../../lib/regression-doc-inventory.mjs";
import { extractRegressionMeta } from "../../lib/regression-metadata.mjs";
import { REGRESSION_ENTRIES } from "../../regression-suite.mjs";

const manifest = JSON.parse(readFileSync("scripts/regression-coverage-manifest.json", "utf8"));
const policy = JSON.parse(readFileSync("scripts/regression-coverage-exceptions.json", "utf8"));
const generatorSource = readFileSync("scripts/generate-regression-manifest.mjs", "utf8");
const docInventorySource = readFileSync("scripts/generate-regression-doc-inventory.mjs", "utf8");
const docs = readFileSync("docs/regression-suite.md", "utf8");

assert.match(generatorSource, /Regression coverage manifest is stale/);
assert.match(generatorSource, /--ratchet-floors/);
assert.match(docInventorySource, /--write/);
assert.match(docInventorySource, /--check/);

const deterministicManifest = buildRegressionManifest({ entries: REGRESSION_ENTRIES, policy });
assert.equal(
  serializeRegressionManifest(deterministicManifest),
  serializeRegressionManifest(buildRegressionManifest({ entries: REGRESSION_ENTRIES, policy })),
  "manifest generation should be deterministic",
);
assert.deepEqual(
  collectCoverageFloorDriftErrors({ entries: REGRESSION_ENTRIES, policy }),
  [],
  "reviewed floors should stay exactly armed to active coverage plus credited retirements",
);

const laggingPolicy = cloneFixture(policy);
laggingPolicy.minimumActiveScripts -= 1;
assert.match(
  collectCoverageFloorDriftErrors({ entries: REGRESSION_ENTRIES, policy: laggingPolicy }).join("\n"),
  /minimumActiveScripts lags current discovered coverage.*--ratchet-floors/,
  "ordinary non-mutating validation should expose a lagging global floor",
);

const ratchetedPolicy = buildRatchetedCoveragePolicy({ entries: REGRESSION_ENTRIES, policy: laggingPolicy });
assert.equal(
  ratchetedPolicy.minimumActiveScripts,
  REGRESSION_ENTRIES.length + policy.retiredScripts.filter((entry) => entry.floorCredit === true).length,
  "explicit ratcheting should derive the global floor from active coverage plus credits",
);
assert.deepEqual(
  collectCoverageFloorDriftErrors({ entries: REGRESSION_ENTRIES, policy: ratchetedPolicy }),
  [],
);
const overFloorPolicy = cloneFixture(ratchetedPolicy);
overFloorPolicy.minimumActiveScripts += 1;
assert.throws(
  () => buildRatchetedCoveragePolicy({ entries: REGRESSION_ENTRIES, policy: overFloorPolicy }),
  /Refusing to lower regression coverage floors/,
  "ratchet mode should never make coverage loss self-approving",
);

const requiredReleaseGateId = policy.requiredReleaseGateIds[0];
const withoutReleaseGate = REGRESSION_ENTRIES.filter((entry) => entry.id !== requiredReleaseGateId);
const missingGatePolicy = cloneFixture(policy);
const creditedRetirements = policy.retiredScripts.filter((entry) => entry.floorCredit === true);
missingGatePolicy.minimumActiveScripts = REGRESSION_ENTRIES.length + creditedRetirements.length + 1;
missingGatePolicy.minimumReleaseGateScripts = REGRESSION_ENTRIES.filter((entry) => entry.tier === "release-gate").length
  + creditedRetirements.filter((entry) => entry.tier === "release-gate").length
  + 1;
const missingGateManifest = buildRegressionManifest({ entries: withoutReleaseGate, policy: missingGatePolicy });
const missingGateErrors = collectRegressionCoverageErrors({
  entries: withoutReleaseGate,
  manifest: missingGateManifest,
  policy: missingGatePolicy,
}).join("\n");
assert.match(missingGateErrors, /active regression count .* below policy floor/);
assert.match(missingGateErrors, /release-gate count .* below policy floor/);
assert.match(missingGateErrors, new RegExp(`required release-gate regression ${escapeRegExp(requiredReleaseGateId)} is missing`));

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

const malformedMovementPolicy = cloneFixture(policy);
malformedMovementPolicy.assertionMovements.push({
  sourceRegression: "scripts/missing-source-regression.mjs",
  movementType: "unknown",
  assertionCount: 0,
  movedTo: "tests/unit/missing.test.mjs",
  retainedIntegrationOwner: "scripts/missing-owner-regression.mjs",
  verificationPerformed: [],
});
const malformedMovementManifest = buildRegressionManifest({
  entries: REGRESSION_ENTRIES,
  policy: malformedMovementPolicy,
});
const malformedMovementErrors = collectRegressionCoverageErrors({
  entries: REGRESSION_ENTRIES,
  manifest: malformedMovementManifest,
  policy: malformedMovementPolicy,
}).join("\n");
for (const requiredEvidence of [
  "movedInVersion",
  "rationale",
  "assertionDisposition",
  "movementType should be pure-contract-to-vitest or duplicate-contract-to-regression",
  "positive assertionCount",
  "source regression should remain discovered",
  "retained integration owner should remain discovered",
  "verificationPerformed",
]) {
  assert.match(malformedMovementErrors, new RegExp(escapeRegExp(requiredEvidence)));
}

const expectedDocBlock = buildRegressionDocInventory({ manifest, policy });
assert.equal(
  replaceRegressionDocInventory(docs, expectedDocBlock),
  docs,
  "the single delimited numeric inventory block should match manifest and policy data",
);
assert.equal(docs.split(INVENTORY_START).length - 1, 1);
assert.equal(docs.split(INVENTORY_END).length - 1, 1);
assert.match(expectedDocBlock, /Convention-path metadata regressions/);
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
  + uncoveredPolicy.retiredScripts.filter((entry) => entry.floorCredit === true).length;
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
