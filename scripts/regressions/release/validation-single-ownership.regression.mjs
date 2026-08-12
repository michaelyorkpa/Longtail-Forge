export const regressionMeta = Object.freeze({
  id: "release.validation-single-ownership",
  area: "release",
  tier: "release-gate",
  tags: ["closeout", "coverage", "performance", "release"],
  description: "Proves repeated validation assertions and package-script pins stay behind one named owner with machine-readable movement evidence.",
  runMode: "static",
});

import assert from "node:assert/strict";
import {
  createProjectTextReader,
  extractFunctionBlock,
  sourceContainsInOrder,
} from "../../test-support/source-scan.mjs";
import { REGRESSION_ENTRIES } from "../../regression-suite.mjs";

const reader = createProjectTextReader();
const packageJson = reader.readJson("package.json");
const packageScriptContract = reader.readJson("scripts/package-script-contracts.json");
const ownershipEvidence = reader.readJson("scripts/validation-ownership-consolidation.json");
const scanEvidence = reader.readJson("scripts/source-scan-consolidation-evidence.json");

assert.equal(packageScriptContract.schemaVersion, 1);
assert.equal(packageScriptContract.owner, "scripts/regressions/release/validation-single-ownership.regression.mjs");
assert.deepEqual(
  Object.fromEntries(Object.entries(packageJson.scripts).sort(([left], [right]) => left.localeCompare(right))),
  packageScriptContract.scripts,
  "one reviewed package-script contract should own exact root command strings",
);

assert.equal(ownershipEvidence.schemaVersion, 1);
assert.equal(ownershipEvidence.consolidation, "validation-single-ownership");
assert.equal(scanEvidence.measurement, "source-scan-consolidation");
assert.equal(ownershipEvidence.processMeasurements.parameterBindingRegression.removedChildProcesses, 1);
assert.equal(ownershipEvidence.processMeasurements.licensingRegression.removedChildProcesses, 1);
assert.ok(
  ownershipEvidence.processMeasurements.parameterBindingRegression.afterMs
    < ownershipEvidence.processMeasurements.parameterBindingRegression.beforeMs,
);
assert.ok(
  ownershipEvidence.processMeasurements.licensingRegression.afterMs
    < ownershipEvidence.processMeasurements.licensingRegression.beforeMs,
);
for (const [family, expectedOwner] of Object.entries({
  changelogCurrentHeading: "scripts/version-literal-guardrail-regression.mjs",
  currentVersionTriples: "scripts/version-literal-guardrail-regression.mjs",
  exactPackageScriptPins: "scripts/regressions/release/validation-single-ownership.regression.mjs",
  legacySelfRegistration: "scripts/regressions/release/regression-manifest-generation.regression.mjs",
})) {
  const evidence = ownershipEvidence.families[family];
  assert.ok(evidence.assertionCount > 0, `${family} should retain a measured assertion count`);
  assert.equal(evidence.retainedOwner, expectedOwner);
  assert.ok(evidence.sourcePaths.length > 0, `${family} should retain its source inventory`);
  for (const sourcePath of evidence.sourcePaths) {
    assert.equal(typeof reader.readText(sourcePath), "string", `${family} source should remain reviewable: ${sourcePath}`);
  }
}

const EXECUTABLE_TEST_TEXT_PROXY_PATTERNS = Object.freeze([
  ["permission harness text proxy", /\b(?:read|readText|readFileSync)\s*\(\s*["']scripts\/permission-regression\.mjs/],
  ["Playwright spec text proxy", /\b(?:readFile|readFileSync|readText)\s*\([^;\n]*(?:tests\/e2e|["']tests["'][^;\n]*["']e2e["'])/],
  ["Playwright config text proxy", /\b(?:readFileSync|readText)\s*\(\s*["']playwright\.config\.js/],
  ["Playwright directory text proxy", /\breaddirSync\s*\(\s*["']tests\/e2e["']/],
  ["Vitest source text proxy", /\b(?:readFile|readFileSync|readText)\s*\([^;\n]*tests\/(?:contracts|files|tasks|unit)\/[^"'`\n]+\.test\.mjs/],
]);
const duplicateErrors = [];
const executableTestProxyErrors = [];
for (const entry of REGRESSION_ENTRIES) {
  const source = reader.readText(entry.path);
  if (/assert\.equal\([^\n]*(?:packageJson\.version|packageLock\.version|packageLock\.packages\[""\]\.version)[^\n]*(?:appVersion|packageJson\.version)/.test(source)) {
    duplicateErrors.push(`${entry.path}: current-version triple`);
  }
  if (/assert\.match\([^\n]*(?:regressionSuite|legacySnapshot|regressionSnapshot)[^\n]*\/scripts\\\//.test(source)) {
    duplicateErrors.push(`${entry.path}: legacy snapshot registration`);
  }
  if (/assert\.match\([^\n]*changelog[^\n]*## Version[^\n]*(?:appVersion|currentVersion|packageJson\.version)/i.test(source)) {
    duplicateErrors.push(`${entry.path}: current changelog heading`);
  }
  if (/assert\.equal\([^\n]*(?:packageJson|repoPackage)\.scripts(?:\[|\.)/.test(source)) {
    duplicateErrors.push(`${entry.path}: exact package-script pin`);
  }
  if (entry.id !== regressionMeta.id) {
    for (const [label, pattern] of EXECUTABLE_TEST_TEXT_PROXY_PATTERNS) {
      if (pattern.test(source)) executableTestProxyErrors.push(`${entry.path}: ${label}`);
    }
  }
}
assert.deepEqual(duplicateErrors, [], `duplicate validation owners should stay retired:\n${duplicateErrors.join("\n")}`);
assert.deepEqual(
  executableTestProxyErrors,
  [],
  `regressions must execute behavioral owners instead of reading executable test source:\n${executableTestProxyErrors.join("\n")}`,
);

const closeoutSource = reader.readText("scripts/lib/closeout-gates.mjs");
for (const command of [
  "version:guard",
  "regressions:manifest:check",
  "modules:registry:check",
  "audit:params:check",
  "licensing:gates",
]) {
  assert.match(closeoutSource, new RegExp(escapeRegExp(command)), `${command} should retain one ordinary closeout owner`);
}

const parameterRegression = reader.readText("scripts/parameter-binding-audit-regression.mjs");
const licensingRegression = reader.readText("scripts/regressions/licensing/licensing-public-release-gates.regression.mjs");
assert.doesNotMatch(parameterRegression, /spawnSync|audit-parameter-bindings\.mjs.*--check/);
assert.doesNotMatch(licensingRegression, /spawnSync|check-licensing-gates\.mjs/);
assert.match(parameterRegression, /formatParameterBindingAudit\(result\)/);
assert.match(licensingRegression, /formatLicensingGateReport\(live\)/);

const moduleRegistryRegression = reader.readText("scripts/regressions/framework/bundled-module-registry.regression.mjs");
assert.match(moduleRegistryRegression, /runGenerator\(fixtureRoot, "--check"\)/, "catalog failure cases should remain synthetic fixture checks");
assert.doesNotMatch(moduleRegistryRegression, /runGenerator\(rootDir, "--check"\)/, "the suite should not duplicate the live closeout catalog check");

const manifestRegression = reader.readText("scripts/regressions/release/regression-manifest-generation.regression.mjs");
for (const retainedCase of [
  "collectCoverageFloorDriftErrors",
  "buildRatchetedCoveragePolicy",
  "assertionLossErrors",
  "malformedRetirementErrors",
  "invalidPureErrors",
  "requiredOwnerErrors",
  "malformedMovementErrors",
]) {
  assert.match(manifestRegression, new RegExp(escapeRegExp(retainedCase)), `${retainedCase} should retain its executable manifest-policy owner`);
}

const fastCheckRegression = reader.readText("scripts/regressions/release/fast-check-pipeline.regression.mjs");
const typecheckRegression = reader.readText("scripts/regressions/framework/typecheck-seams.regression.mjs");
assert.doesNotMatch(fastCheckRegression, /tsconfig\.compilerOptions/, "fast-check should rely on the typecheck-seams owner");
assert.match(typecheckRegression, /tsconfig\.compilerOptions\.noEmit/);
assert.match(typecheckRegression, /tsconfig\.compilerOptions\.strict/);

for (const target of scanEvidence.targetedFiles) {
  const source = reader.readText(target.path);
  const measured = countGreedyPatterns(source);
  assert.equal(measured, target.after, `${target.path} measured greedy-pattern count should remain current`);
  assert.ok(target.after < target.before, `${target.path} should retain a measured reduction`);
}
assert.ok(scanEvidence.untouchedMeasuredCases.length > 0, "untouched measured scan cases should remain explicit");
assert.equal(reader.readMarkdown("docs/regression-suite.md"), reader.readText("docs/regression-suite.md"));
assert.throws(() => reader.readText("../package.json"), /repository-relative path/);
assert.throws(() => reader.readMarkdown("package.json"), /\.md path/);
const balancedFixture = "function sample() { const value = `{ignored}`; if (true) { return value; } }\nfunction next() {}";
assert.equal(extractFunctionBlock(balancedFixture, "sample"), "function sample() { const value = `{ignored}`; if (true) { return value; } }");
assert.equal(sourceContainsInOrder("alpha beta gamma", ["alpha", "beta", "gamma"]), true);
assert.equal(sourceContainsInOrder("alpha gamma beta", ["alpha", "beta", "gamma"]), false);

console.log("Validation single-ownership regression passed.");

function countGreedyPatterns(source) {
  return [...source.matchAll(/\[\\s\\S\]\*|\[\^\]\*/g)].length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
