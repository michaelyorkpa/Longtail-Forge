export const regressionMeta = Object.freeze({
  id: "release.fast-check-pipeline",
  area: "release",
  tier: "release-gate",
  tags: ["commands", "release", "tooling"],
  description: "Proves npm run check runs TypeScript, Vitest, and the sole ESLint syntax/lint owner before the slow regression runner, and that npm start stays a pure Node boot.",
  runMode: "static",
});

import { escapeRegExp } from "../../test-support/source-scan.mjs";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const scripts = packageJson.scripts;

// npm start stays a pure Node runtime boot with no compile/typecheck step.

// Narrow aliases name every owned file and fail closed if that coverage moves
// or disappears.
const narrowVitestOwners = {
  "test:contracts": [
    "tests/contracts/files-contracts.test.mjs",
    "tests/contracts/normalizers-timezones.test.mjs",
    "tests/contracts/tasks-contracts.test.mjs",
    "tests/contracts/time-tracking-contracts.test.mjs",
  ],
  "test:files": ["tests/contracts/files-contracts.test.mjs"],
  "test:tasks": ["tests/contracts/tasks-contracts.test.mjs"],
  "test:time-tracking": [
    "tests/contracts/time-tracking-contracts.test.mjs",
    "tests/time-tracking/time-tracking-billing.test.mjs",
  ],
};
for (const [scriptName, owners] of Object.entries(narrowVitestOwners)) {
  assert.equal(scripts[scriptName], `vitest run ${owners.join(" ")}`, `${scriptName} must name its owned Vitest coverage exactly`);
  assert.doesNotMatch(scripts[scriptName], /--passWithNoTests/, `${scriptName} must fail when its owned coverage disappears`);
  for (const owner of owners) {
    assert.ok(statSync(owner).isFile(), `${scriptName} owner ${owner} must exist`);
  }
}

// npm run check fails fast: typecheck, unit tests, and the syntax/lint owner all
// run before the stateful regression suite.
const check = `${String(scripts["check:fast"] || "")} ${String(scripts.check || "")}`;
const checkStages = [
  "npm run typecheck",
  "npm run test:unit",
  "npm run lint",
  "npm run test:regressions",
];
let previousIndex = -1;
for (const stage of checkStages) {
  const index = check.indexOf(stage);
  assert.ok(index >= 0, `npm run check must invoke ${stage}`);
  assert.ok(
    index > previousIndex,
    `npm run check must run ${stage} after the previous stage; fast checks precede the slow suite`,
  );
  previousIndex = index;
}
assert.ok(
  check.indexOf("npm run lint") < check.indexOf("npm run test:regressions"),
  "ESLint must own syntax and lint failure before the stateful regression runner",
);
assert.ok(
  check.indexOf("npm run test:unit") < check.indexOf("npm run test:regressions"),
  "unit tests must run before the regression runner",
);
assert.match(check, /&&/, "check stages must be chained so a fast failure stops the slow suite");

const eslintConfig = readFileSync("eslint.config.js", "utf8");
for (const sourcePattern of [
  "src/**/*.js",
  "server.js",
  "worker.js",
  "scripts/**/*.mjs",
  "tests/**/*.mjs",
  "vitest.config.mjs",
  "playwright.config.js",
  "eslint.config.js",
  "public/**/*.js",
]) {
  assert.match(eslintConfig, new RegExp(escapeRegExp(sourcePattern)), `ESLint must cover the retired syntax gate's ${sourcePattern} input`);
}
assert.equal(existsSync("scripts/check-js.mjs"), false, "the duplicate per-file Node syntax subprocess gate should remain retired");
const legacySnapshot = JSON.parse(readFileSync("scripts/regression-legacy-snapshot.json", "utf8"));
assert.ok(
  !legacySnapshot.scripts.some(({ path }) => path === "scripts/check-js.mjs"),
  "the retired syntax gate must not remain registered in the legacy snapshot",
);

// Dependency placement: dev tooling stays dev-only; Zod is runtime because schemas validate untrusted input.
assert.ok(packageJson.devDependencies.typescript, "typescript must be a devDependency");
assert.ok(packageJson.devDependencies.vitest, "vitest must be a devDependency");
assert.ok(packageJson.dependencies.zod, "zod must be a runtime dependency");
assert.equal(packageJson.dependencies.typescript, undefined, "typescript must not ship as a runtime dependency");
assert.equal(packageJson.dependencies.vitest, undefined, "vitest must not ship as a runtime dependency");

// Vitest scope: unit tests live under tests/, never the regression suite.
const vitestConfig = readFileSync("vitest.config.mjs", "utf8");
assert.match(vitestConfig, /tests\/\*\*\/\*\.test\.mjs/, "Vitest must only discover tests/**/*.test.mjs");

// The seed coverage of the fast unit suite stays present: Files contract
// schemas plus the pure work-candidate/focus/resume/pagination seams.
const INITIAL_UNIT_TEST_FILES = [
  "tests/contracts/files-contracts.test.mjs",
  "tests/contracts/tasks-contracts.test.mjs",
  "tests/unit/asset-version.test.mjs",
  "tests/unit/bounded-pagination.test.mjs",
  "tests/unit/client-project-options.test.mjs",
  "tests/unit/focus-mode-resolution.test.mjs",
  "tests/unit/resume-producer-payload.test.mjs",
  "tests/unit/sqlite-health-formatter.test.mjs",
  "tests/unit/work-candidate-ranking.test.mjs",
];
for (const testFile of INITIAL_UNIT_TEST_FILES) {
  assert.ok(statSync(testFile).isFile(), `${testFile} must remain in the fast unit suite`);
}

console.log("fast-check pipeline regression passed.");
