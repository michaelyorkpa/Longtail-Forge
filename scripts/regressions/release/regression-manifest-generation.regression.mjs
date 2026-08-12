export const regressionMeta = Object.freeze({
  id: "release.regression-manifest-generation",
  area: "release",
  tier: "release-gate",
  tags: ["coverage", "manifest", "release"],
  description: "Proves shrink-only script ceilings and generated assertion ownership prevent silent coverage loss while allowing reviewed consolidation.",
  runMode: "static",
});

import { escapeRegExp } from "../../test-support/source-scan.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRegressionManifest,
  buildRatchetedCoveragePolicy,
  collectCoverageFloorDriftErrors,
  collectRegressionCoverageErrors,
  countAssertions,
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

const manifest = readJson("scripts/regression-coverage-manifest.json");
const policy = readJson("scripts/regression-coverage-exceptions.json");
const generatorSource = readFileSync("scripts/generate-regression-manifest.mjs", "utf8");
const docs = readFileSync("docs/regression-suite.md", "utf8");

assert.match(generatorSource, /Regression coverage manifest is stale/);
assert.match(generatorSource, /--ratchet-floors/);
assert.equal(policy.schemaVersion, 2);
assert.equal(manifest.schemaVersion, 4);
assert.equal(policy.maximumActiveScripts, REGRESSION_ENTRIES.length, "active-script ceiling should be armed to current discovery");
assert.equal(policy.minimumAssertionCount, manifest.assertionInventory.effectiveAssertionCount);
assert.ok(manifest.regressions.every((entry) => Number.isInteger(entry.assertionCount)));
assert.equal(
  manifest.assertionInventory.activeAssertionCount,
  manifest.regressions.reduce((total, entry) => total + entry.assertionCount, 0),
);

const deterministicManifest = buildRegressionManifest({ entries: REGRESSION_ENTRIES, policy });
assert.equal(serializeRegressionManifest(deterministicManifest), serializeRegressionManifest(manifest));
assert.deepEqual(collectCoverageFloorDriftErrors({ entries: REGRESSION_ENTRIES, policy }), []);

const looseCeiling = clone(policy);
looseCeiling.maximumActiveScripts += 1;
assert.match(
  collectCoverageFloorDriftErrors({ entries: REGRESSION_ENTRIES, policy: looseCeiling }).join("\n"),
  /maximumActiveScripts is above current discovered coverage.*--ratchet-floors/,
);
assert.equal(buildRatchetedCoveragePolicy({ entries: REGRESSION_ENTRIES, policy: looseCeiling }).maximumActiveScripts, REGRESSION_ENTRIES.length);

const laggingAssertionFloor = clone(policy);
laggingAssertionFloor.minimumAssertionCount -= 1;
assert.match(
  collectCoverageFloorDriftErrors({ entries: REGRESSION_ENTRIES, policy: laggingAssertionFloor }).join("\n"),
  /minimumAssertionCount lags current discovered coverage.*--ratchet-floors/,
);
assert.equal(
  buildRatchetedCoveragePolicy({ entries: REGRESSION_ENTRIES, policy: laggingAssertionFloor }).minimumAssertionCount,
  manifest.assertionInventory.effectiveAssertionCount,
);

const weakenedFloor = clone(policy);
weakenedFloor.minimumAssertionCount += 1;
assert.throws(
  () => buildRatchetedCoveragePolicy({ entries: REGRESSION_ENTRIES, policy: weakenedFloor }),
  /Refusing to weaken regression coverage guardrails[\s\S]*minimumAssertionCount would decrease/,
);
const raisedCeiling = clone(policy);
raisedCeiling.maximumActiveScripts -= 1;
assert.throws(
  () => buildRatchetedCoveragePolicy({ entries: REGRESSION_ENTRIES, policy: raisedCeiling }),
  /Refusing to weaken regression coverage guardrails[\s\S]*maximumActiveScripts would increase/,
);

const assertionOwner = manifest.regressions.find((entry) => entry.assertionCount > 0);
assert.ok(assertionOwner, "fixture needs a discovered assertion owner");
const assertionLossReader = (filePath, encoding) => {
  const source = readFileSync(filePath, encoding);
  if (filePath !== assertionOwner.path) return source;
  return source.replace(/\b(?:assert(?:\.[A-Za-z][A-Za-z0-9]*)?|expect)\s*\(/, "removedAssertion(");
};
const assertionLossErrors = collectRegressionCoverageErrors({
  entries: REGRESSION_ENTRIES,
  manifest,
  policy,
  readSource: assertionLossReader,
}).join("\n");
assert.match(assertionLossErrors, /effective assertion count .* below policy floor/);
assert.match(assertionLossErrors, /generated manifest is stale/);

const malformedRetirementPolicy = clone(policy);
malformedRetirementPolicy.retiredScripts.push({
  script: "scripts/synthetic-retired-regression.mjs",
  retirementType: "assertions-moved",
  floorCredit: true,
  retainedCoverageOwners: [],
  verificationPerformed: [],
});
const malformedRetirementErrors = errorsFor(REGRESSION_ENTRIES, malformedRetirementPolicy);
for (const phrase of [
  "retiredInVersion",
  "rationale",
  "assertionDisposition",
  "retainedCoverageOwners",
  "verificationPerformed",
  "credited retirement should include id",
  "credited retirement should include assertionInventory",
]) assert.match(malformedRetirementErrors, new RegExp(escapeRegExp(phrase)));

const malformedInventoryPolicy = clone(policy);
malformedInventoryPolicy.retiredScripts.push({
  id: "release.synthetic-malformed-retirement",
  script: "scripts/synthetic-malformed-retirement.mjs",
  area: "release",
  tier: "focused",
  tags: ["release"],
  legacy: false,
  floorCredit: true,
  retiredInVersion: "synthetic",
  retirementType: "assertions-moved",
  rationale: "Synthetic malformed assertion inventory.",
  assertionDisposition: "Synthetic owner mapping.",
  retainedCoverageOwners: ["release.regression-manifest-generation"],
  verificationPerformed: ["synthetic"],
  assertionInventory: {
    sourceAssertionCount: 1,
    creditedAssertionReduction: 2,
    ownerPaths: ["scripts/missing-owner.mjs"],
  },
});
const malformedInventoryErrors = errorsFor(REGRESSION_ENTRIES, malformedInventoryPolicy);
assert.match(malformedInventoryErrors, /creditedAssertionReduction cannot exceed sourceAssertionCount/);
assert.match(malformedInventoryErrors, /assertion owner path scripts\/missing-owner\.mjs should exist/);

const pureContractPolicy = clone(policy);
pureContractPolicy.minimumAreaScripts.release += 1;
pureContractPolicy.retiredScripts.push({
  id: "release.synthetic-pure-contract",
  script: "scripts/synthetic-pure-contract.regression.mjs",
  area: "release",
  tier: "focused",
  tags: ["contract", "release"],
  legacy: false,
  floorCredit: true,
  retiredInVersion: "synthetic",
  retirementType: "pure-contract-to-vitest",
  rationale: "Synthetic positive proof for a pure-contract retirement.",
  assertionDisposition: "Vitest runs in check:fast while integration coverage remains named.",
  retainedCoverageOwners: ["release.validation-single-ownership"],
  integrationCoverageOwners: ["release.validation-single-ownership"],
  vitestOwner: "tests/unit/asset-version.test.mjs",
  verificationPerformed: ["npm run test:unit"],
  assertionInventory: {
    sourceAssertionCount: 5,
    creditedAssertionReduction: 0,
    ownerPaths: ["tests/unit/asset-version.test.mjs"],
  },
});
assert.deepEqual(errorsForArray(REGRESSION_ENTRIES, pureContractPolicy), []);

const invalidPureContractPolicy = clone(pureContractPolicy);
const invalidPure = invalidPureContractPolicy.retiredScripts.at(-1);
invalidPure.vitestOwner = "tests/unit/missing.test.mjs";
invalidPure.integrationCoverageOwners = [];
invalidPure.assertionInventory.ownerPaths = ["tests/unit/missing.test.mjs"];
const invalidPureErrors = errorsFor(REGRESSION_ENTRIES, invalidPureContractPolicy);
assert.match(invalidPureErrors, /existing vitestOwner/);
assert.match(invalidPureErrors, /name integrationCoverageOwners/);
assert.match(
  errorsFor(REGRESSION_ENTRIES, pureContractPolicy, undefined, { "check:fast": "npm run lint" }),
  /requires check:fast to run test:unit before regressions/,
);

const requiredOwner = policy.requiredReleaseGateIds[0];
const withoutRequiredOwner = REGRESSION_ENTRIES.filter((entry) => entry.id !== requiredOwner);
const requiredOwnerErrors = errorsFor(withoutRequiredOwner, policy);
assert.match(requiredOwnerErrors, new RegExp(`required release-gate behavior owner ${escapeRegExp(requiredOwner)} is missing`));
assert.match(requiredOwnerErrors, /release-gate count .* below policy floor/);
for (const retired of policy.retiredScripts.filter((entry) => entry.floorCredit === true)) {
  assert.ok(!policy.requiredReleaseGateIds.includes(retired.id), `${retired.id} must not remain a required dead entry-point ID`);
}

const withoutDashboard = REGRESSION_ENTRIES.filter((entry) => entry.area !== "dashboard");
const dashboardErrors = errorsFor(withoutDashboard, policy);
assert.match(dashboardErrors, /area dashboard has 0 regressions below policy floor 2/);
assert.match(dashboardErrors, /protected area dashboard has no active regression or credited retirement/);

const activeCloseoutOwner = REGRESSION_ENTRIES.find((entry) => entry.tags.includes("closeout"));
assert.ok(activeCloseoutOwner);
assert.match(
  errorsFor(REGRESSION_ENTRIES.filter((entry) => entry.id !== activeCloseoutOwner.id), policy),
  /coverage family closeout-regressions has .* below policy floor/,
);

const malformedMovementPolicy = clone(policy);
malformedMovementPolicy.assertionMovements.push({
  sourceRegression: "scripts/missing-source-regression.mjs",
  movementType: "unknown",
  assertionCount: 0,
  movedTo: "tests/unit/missing.test.mjs",
  retainedIntegrationOwner: "scripts/missing-owner-regression.mjs",
  verificationPerformed: [],
});
const malformedMovementErrors = errorsFor(REGRESSION_ENTRIES, malformedMovementPolicy);
for (const phrase of [
  "movedInVersion",
  "rationale",
  "assertionDisposition",
  "movementType should be pure-contract-to-vitest or duplicate-contract-to-regression",
  "positive assertionCount",
  "source regression should remain discovered",
  "retained integration owner should remain discovered",
]) assert.match(malformedMovementErrors, new RegExp(escapeRegExp(phrase)));

const expectedDocBlock = buildRegressionDocInventory({ manifest, policy });
assert.equal(replaceRegressionDocInventory(docs, expectedDocBlock), docs);
assert.equal(docs.split(INVENTORY_START).length - 1, 1);
assert.equal(docs.split(INVENTORY_END).length - 1, 1);
assert.match(expectedDocBlock, /Effective assertion floor/);
assert.equal(manifest.summary.discoveredScripts, REGRESSION_ENTRIES.length);
assert.equal(manifest.summary.legacyScripts, policy.legacyMetadataException.maximumScripts);
assert.ok(manifest.regressions.every((entry) => Number.isInteger(entry.assertionCount)));

assert.throws(
  () => extractRegressionMeta(
    "export const regressionMeta = { id: \"release.missing-fields\", area: \"release\" };",
    "scripts/regressions/release/missing-fields.regression.mjs",
  ),
  /missing required field\(s\)/,
);
const duplicateEntries = [
  ...REGRESSION_ENTRIES,
  { ...REGRESSION_ENTRIES[0], path: "scripts/regressions/release/duplicate-id.regression.mjs" },
];
assert.throws(() => buildRegressionManifest({ entries: duplicateEntries, policy }), /duplicate regression IDs/);

const staleManifest = clone(manifest);
staleManifest.regressions[0].assertionCount += 1;
assert.match(errorsFor(REGRESSION_ENTRIES, policy, staleManifest), /generated manifest is stale/);

assert.equal(countAssertions("assert.equal(a, b); expect(value).toBe(true); assert(condition);"), 3);
console.log("Regression manifest assertion ownership and shrink-only ratchet passed.");

function errorsFor(
  entries,
  fixturePolicy,
  fixtureManifest = buildRegressionManifest({ entries, policy: fixturePolicy }),
  packageScripts,
) {
  return errorsForArray(entries, fixturePolicy, fixtureManifest, packageScripts).join("\n");
}

function errorsForArray(
  entries,
  fixturePolicy,
  fixtureManifest = buildRegressionManifest({ entries, policy: fixturePolicy }),
  packageScripts,
) {
  return collectRegressionCoverageErrors({ entries, manifest: fixtureManifest, packageScripts, policy: fixturePolicy });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
