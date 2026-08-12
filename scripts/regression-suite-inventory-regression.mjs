import { escapeRegExp } from "./test-support/source-scan.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REGRESSION_BUCKETS, REGRESSION_ENTRIES, REGRESSION_SCRIPTS } from "./regression-suite.mjs";

const docs = readFileSync("docs/regression-suite.md", "utf8");
const runner = readFileSync("scripts/run-regressions.mjs", "utf8");
const suite = readFileSync("scripts/regression-suite.mjs", "utf8");
const discovery = readFileSync("scripts/lib/regression-discovery.mjs", "utf8");
const legacySnapshot = JSON.parse(readFileSync("scripts/regression-legacy-snapshot.json", "utf8"));
const coveragePolicy = JSON.parse(readFileSync("scripts/regression-coverage-exceptions.json", "utf8"));

for (const entryPoint of [
  "scripts/run-regressions.mjs",
  "scripts/regression-suite.mjs",
  "scripts/regression-coverage-ratchet.mjs",
  "scripts/regression-clean-clone-contract.mjs",
  "scripts/regression-coverage-manifest.json",
  "scripts/regression-coverage-exceptions.json",
  "scripts/generate-regression-manifest.mjs",
  "scripts/generate-regression-doc-inventory.mjs",
  "package.json",
]) {
  assert.match(docs, new RegExp(escapeRegExp(entryPoint)), `${entryPoint} should be inventoried`);
}

for (const area of [
  "framework",
  "views",
  "dashboard",
  "workbench",
  "tasks",
  "notes",
  "lists",
  "files",
  "search",
  "notifications",
  "tags",
  "time-tracking",
  "database",
  "permissions",
  "jobs",
  "public-api",
  "release",
  "docs",
  "licensing",
]) {
  assert.match(docs, new RegExp(`- \`${escapeRegExp(area)}\``), `${area} should be a canonical area`);
}

for (const tier of ["unit-like", "focused", "integration", "release-gate", "slow"]) {
  assert.match(docs, new RegExp(`- \`${escapeRegExp(tier)}\``), `${tier} should be a canonical tier`);
}

for (const field of ["id", "area", "tier", "tags", "description", "runMode"]) {
  assert.match(docs, new RegExp(`- \`${field}\``), `${field} metadata should be defined`);
}

for (const runMode of ["static", "serial-database", "serial-files", "isolated-files", "isolated-database"]) {
  assert.match(docs, new RegExp(`\\| \`${runMode}\` \\|`), `${runMode} should be a canonical run mode`);
}

assert.match(docs, /scripts\/regressions\/<area>\/<name>\.regression\.mjs/);
assert.match(docs, /scripts\/\*-regression\.mjs/);
assert.match(docs, /warning-only licensing\/public-release process gate/);
assert.match(docs, /0\.33\.6\.16\.2/);
assert.match(docs, /auto-discover/);
assert.match(docs, /Agents do not manually add the same regression/);
assert.match(docs, /GENERATED REGRESSION INVENTORY START/, "current docs should delimit generated inventory");
assert.match(docs, /Convention-path metadata regressions/, "current docs should use the canonical coverage phrase");
assert.match(docs, /300 seconds/, "current docs should publish the formal suite-time review budget");

assert.equal(REGRESSION_BUCKETS.length, 5, "inventory should preserve all five scheduling buckets");
assert.deepEqual(
  REGRESSION_BUCKETS.map(({ mode, name }) => [name, mode]),
  [
    ["static/source regressions", "parallel"],
    ["default database regressions", "serial"],
    ["file storage regressions", "serial"],
    ["isolated file storage regressions", "parallel"],
    ["isolated database regressions", "parallel"],
  ],
  "inventory slice should preserve existing bucket scheduling",
);
assert.ok(
  REGRESSION_SCRIPTS.includes("scripts/regression-suite-inventory-regression.mjs"),
  "inventory contract guardrail should be registered",
);
assert.ok(
  legacySnapshot.scripts.length <= coveragePolicy.legacyMetadataException.maximumScripts,
  "the legacy migration snapshot must not exceed its shrink-only ceiling",
);
const flattenedBucketScripts = REGRESSION_BUCKETS.flatMap((bucket) => bucket.scripts);
assert.equal(flattenedBucketScripts.length, REGRESSION_ENTRIES.length, "bucket membership should cover every discovered entry");
assert.equal(new Set(flattenedBucketScripts).size, flattenedBucketScripts.length, "each discovered script should appear in exactly one bucket");
assert.deepEqual(
  flattenedBucketScripts.toSorted(),
  REGRESSION_ENTRIES.map((entry) => entry.path).toSorted(),
  "flattened bucket membership should equal discovery exactly",
);
const bucketFloors = new Map([
  ["static/source regressions", 200],
  ["default database regressions", 1],
  ["file storage regressions", 0],
  ["isolated file storage regressions", 9],
  ["isolated database regressions", 150],
]);
const bucketRunModes = new Map([
  ["static/source regressions", "static"],
  ["default database regressions", "serial-database"],
  ["file storage regressions", "serial-files"],
  ["isolated file storage regressions", "isolated-files"],
  ["isolated database regressions", "isolated-database"],
]);
for (const bucket of REGRESSION_BUCKETS) {
  const retiredCredits = coveragePolicy.retiredScripts.filter((entry) => (
    entry.floorCredit === true && entry.runMode === bucketRunModes.get(bucket.name)
  )).length;
  assert.ok(
    bucket.scripts.length + retiredCredits >= bucketFloors.get(bucket.name),
    bucket.name + " should retain its coverage floor without pinning safe reclassification",
  );
}
assert.match(suite, /discoverRegressionEntries/);
assert.match(suite, /createRegressionSuite/);
assert.match(discovery, /listConventionCandidates/);
assert.match(discovery, /listTopLevelLegacyCandidates/);
assert.match(runner, /process\.argv\.slice\(2\)/);
assert.match(runner, /printRegressionList/);
assert.match(runner, /printDryRun/);

console.log("Regression suite inventory contract passed.");
