import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REGRESSION_BUCKETS, REGRESSION_ENTRIES, REGRESSION_SCRIPTS } from "./regression-suite.mjs";

const docs = readFileSync("docs/regression-suite.md", "utf8");
const runner = readFileSync("scripts/run-regressions.mjs", "utf8");
const suite = readFileSync("scripts/regression-suite.mjs", "utf8");
const discovery = readFileSync("scripts/lib/regression-discovery.mjs", "utf8");
const legacySnapshot = JSON.parse(readFileSync("scripts/regression-legacy-snapshot.json", "utf8"));
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

for (const entryPoint of [
  "scripts/run-regressions.mjs",
  "scripts/regression-suite.mjs",
  "scripts/regression-coverage-ratchet.mjs",
  "scripts/regression-clean-clone-contract.mjs",
  "scripts/regression-coverage-manifest.json",
  "scripts/regression-coverage-exceptions.json",
  "scripts/generate-regression-manifest.mjs",
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

for (const runMode of ["static", "serial-database", "serial-files", "isolated-database"]) {
  assert.match(docs, new RegExp(`\| \`${runMode}\` \|`), `${runMode} should be a canonical run mode`);
}

assert.match(docs, /scripts\/regressions\/<area>\/<name>\.regression\.mjs/);
assert.match(docs, /scripts\/\*-regression\.mjs/);
assert.match(docs, /warning-only licensing\/public-release process gate/);
assert.match(docs, /0\.33\.6\.16\.2/);
assert.match(docs, /auto-discover/);
assert.match(docs, /Agents do not manually add the same regression/);

assert.equal(REGRESSION_BUCKETS.length, 4, "inventory slice should preserve the four current buckets");
assert.deepEqual(
  REGRESSION_BUCKETS.map(({ mode, name }) => [name, mode]),
  [
    ["static/source regressions", "parallel"],
    ["default database regressions", "serial"],
    ["file storage regressions", "serial"],
    ["isolated database regressions", "parallel"],
  ],
  "inventory slice should preserve existing bucket scheduling",
);
assert.ok(
  REGRESSION_SCRIPTS.includes("scripts/regression-suite-inventory-regression.mjs"),
  "inventory contract guardrail should be registered",
);
assert.equal(legacySnapshot.scripts.length, 312, "legacy migration snapshot should preserve the inventory baseline");
assert.equal(REGRESSION_ENTRIES.length, 326, "auto-discovery should add fourteen convention-path guardrails to the legacy baseline");
assert.deepEqual(
  REGRESSION_BUCKETS.map((bucket) => bucket.scripts.length),
  [165, 6, 29, 126],
  "auto-discovery must preserve legacy bucket counts and add fourteen static convention guardrails",
);
assert.match(suite, /discoverRegressionEntries/);
assert.match(suite, /createRegressionSuite/);
assert.match(discovery, /listConventionCandidates/);
assert.match(discovery, /listTopLevelLegacyCandidates/);
assert.match(runner, /process\.argv\.slice\(2\)/);
assert.match(runner, /printRegressionList/);
assert.match(runner, /printDryRun/);
assert.equal(
  packageJson.scripts.check,
  "npm run typecheck && npm run test:unit && node scripts/run-regressions.mjs && eslint . --cache --cache-strategy content --cache-location .eslintcache",
);
assert.equal(packageJson.scripts["test:permissions"], "node scripts/permission-regression.mjs");
assert.equal(packageJson.scripts["test:sqlite-driver"], "node scripts/better-sqlite3-install-smoke.mjs");
assert.equal(packageJson.scripts["test:regressions:changed"], "node scripts/run-changed-regressions.mjs");
assert.equal(packageJson.scripts["regressions:manifest"], "node scripts/generate-regression-manifest.mjs");
assert.equal(packageJson.scripts["regressions:manifest:check"], "node scripts/generate-regression-manifest.mjs --check");
assert.equal(packageJson.scripts["licensing:gates"], "node scripts/check-licensing-gates.mjs");
assert.equal(packageJson.scripts.closeout, "node scripts/run-closeout.mjs");
assert.equal(packageJson.scripts["version:guard"], "node scripts/version-literal-guardrail-regression.mjs");

console.log("Regression suite inventory contract passed.");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
