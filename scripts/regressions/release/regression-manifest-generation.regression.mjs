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
  collectContractOwnershipErrors,
  collectCoverageFloorDriftErrors,
  collectRegressionCoverageErrors,
  countAssertions,
  generatedContentMatches,
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

/** @typedef {{ assertionCount: number, path: string }} ContractAssertionModule */
/** @typedef {{ assertionCount: number, contractAssertionCount: number, contractModules: ContractAssertionModule[], entryPointAssertionCount: number, id: string, path: string }} ManifestRegression */
/** @typedef {{ assertionInventory: { creditedAssertionReduction: number, ownerPaths: string[], sourceAssertionCount: number }, floorCredit: boolean, script: string }} ReviewableRetirement */
/** @typedef {(filePath: string, encoding: "utf8") => string} SourceReader */

const manifest = readJson("scripts/regression-coverage-manifest.json");
const policy = readJson("scripts/regression-coverage-exceptions.json");
const historicalEvidence = readJson("scripts/historical-closeout-evidence.json");
const generatorSource = readFileSync("scripts/generate-regression-manifest.mjs", "utf8");
const docs = readFileSync("docs/regression-suite.md", "utf8");
/** @type {ManifestRegression[]} */
const manifestRegressions = manifest.regressions;
/** @type {{ assertionCount: number, path: string }[]} */
const directOwnerInventory = manifest.assertionInventory.directOwners;
/** @type {ReviewableRetirement[]} */
const policyRetirements = policy.retiredScripts;

assert.match(generatorSource, /Regression coverage manifest is stale/);
assert.match(generatorSource, /--ratchet-floors/);
assert.equal(generatedContentMatches("{\n  \"a\": 1\n}\n", "{\r\n  \"a\": 1\r\n}\r\n"), true, "a CRLF working copy of byte-identical generated content must not read as stale");
assert.equal(generatedContentMatches("{\n  \"a\": 1\n}\n", "{\n  \"a\": 2\n}\n"), false, "real generated-content drift must still read as stale");
assert.match(generatorSource, /generatedContentMatches\(/, "the manifest staleness gate must use the shared line-ending-tolerant comparison");
assert.match(readFileSync("scripts/generate-regression-doc-inventory.mjs", "utf8"), /generatedContentMatches\(/, "the doc-inventory staleness gate must use the shared line-ending-tolerant comparison");
assert.equal(policy.schemaVersion, 2);
assert.equal(manifest.schemaVersion, 5);
assert.equal(policy.maximumActiveScripts, REGRESSION_ENTRIES.length, "active-script ceiling should be armed to current discovery");
assert.equal(policy.minimumAssertionCount, manifest.assertionInventory.effectiveAssertionCount);
assert.ok(manifestRegressions.every((entry) => Number.isInteger(entry.assertionCount)));
assert.ok(manifestRegressions.every((entry) => (
  entry.assertionCount === entry.entryPointAssertionCount + entry.contractAssertionCount
)));
assert.ok(manifestRegressions.some((entry) => entry.contractAssertionCount > 0));
assert.ok(directOwnerInventory.every((entry) => !entry.path.endsWith(".contract.mjs")));
assert.equal(
  manifest.assertionInventory.activeAssertionCount,
  manifestRegressions.reduce((total, entry) => total + entry.assertionCount, 0),
);
const reconciliation = historicalEvidence.assertionReconciliation;
assert.deepEqual(Object.fromEntries(Object.entries(reconciliation.categories).map(([key, value]) => [key, value.assertions])), {
  archivedHistoricalPins: 355,
  reviewedTrueDuplicates: 126,
  vitestMovements: 38,
  tableCompressionCountingArtifact: 4009,
});
assert.equal(17839 - 355 - 126 - 38 - 4009 + reconciliation.currentOwnerGrowthAndRevisionOffset.assertions, 14026);
assert.ok(manifestRegressions.every((entry) => (
  entry.contractAssertionCount === entry.contractModules.reduce((total, module) => total + module.assertionCount, 0)
)));
assert.equal(
  manifestRegressions.reduce((total, entry) => total + entry.entryPointAssertionCount, 0)
    + manifestRegressions.reduce((total, entry) => total + entry.contractAssertionCount, 0),
  manifest.assertionInventory.activeAssertionCount,
);
assert.equal(
  new Set(manifestRegressions.flatMap((entry) => entry.contractModules.map((module) => module.path))).size,
  manifestRegressions.reduce((total, entry) => total + entry.contractModules.length, 0),
  "each contract module should contribute to exactly one discovered owner",
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

const assertionOwner = manifestRegressions.find((entry) => entry.assertionCount > 0);
assert.ok(assertionOwner, "fixture needs a discovered assertion owner");
/** @type {SourceReader} */
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

const reviewableContractRetirement = policyRetirements.find((entry) => (
  entry.floorCredit === true
  && entry.assertionInventory.creditedAssertionReduction < entry.assertionInventory.sourceAssertionCount
  && entry.assertionInventory.ownerPaths.some((ownerPath) => ownerPath.endsWith(".contract.mjs"))
));
const reviewableContractPath = reviewableContractRetirement?.assertionInventory.ownerPaths.find((ownerPath) => (
  ownerPath.endsWith(".contract.mjs")
));
const contractOwner = manifestRegressions.find((entry) => (
  entry.contractModules.some((module) => module.path === reviewableContractPath && module.assertionCount > 0)
));
const contractModule = contractOwner?.contractModules.find((entry) => entry.path === reviewableContractPath);
assert.ok(reviewableContractRetirement && contractOwner && contractModule, "fixture needs a discovered owner with a reviewable non-empty contract module");
/** @type {SourceReader} */
const contractLossReader = (filePath, encoding) => {
  const source = readFileSync(filePath, encoding);
  if (filePath !== contractModule.path) return source;
  return source.replace(/\b(?:assert(?:\.[A-Za-z][A-Za-z0-9]*)?|expect)\s*\(/, "removedAssertion(");
};
const contractLossManifest = buildRegressionManifest({
  entries: REGRESSION_ENTRIES,
  policy,
  readSource: contractLossReader,
});
assert.equal(
  contractLossManifest.regressions.find((entry) => entry.id === contractOwner.id)?.assertionCount,
  contractOwner.assertionCount - 1,
  "removing a contract-table assertion must shrink its discovered owner's inventory",
);
const contractLossErrors = collectRegressionCoverageErrors({
  entries: REGRESSION_ENTRIES,
  manifest,
  policy,
  readSource: contractLossReader,
}).join("\n");
assert.match(contractLossErrors, /effective assertion count .* below policy floor/);
assert.match(contractLossErrors, /generated manifest is stale/);

const reviewedContractMovementPolicy = clone(policy);
const reviewCreditIndex = policyRetirements.findIndex((entry) => entry.script === reviewableContractRetirement.script);
const reviewCredit = reviewedContractMovementPolicy.retiredScripts[reviewCreditIndex];
assert.ok(reviewCredit, "fixture needs retirement headroom for reviewed contract movement proof");
reviewCredit.assertionInventory.creditedAssertionReduction += 1;
const reviewedContractMovementManifest = buildRegressionManifest({
  entries: REGRESSION_ENTRIES,
  policy: reviewedContractMovementPolicy,
  readSource: contractLossReader,
});
assert.deepEqual(collectRegressionCoverageErrors({
  entries: REGRESSION_ENTRIES,
  manifest: reviewedContractMovementManifest,
  policy: reviewedContractMovementPolicy,
  readSource: contractLossReader,
}), []);

assert.match(
  collectContractOwnershipErrors({
    entries: REGRESSION_ENTRIES,
    contractMovements: [],
    contractModulePaths: ["scripts/regression-contracts/synthetic-orphan.contract.mjs"],
  }).join("\n"),
  /synthetic-orphan\.contract\.mjs contract module is imported by no discovered owner/,
);

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
