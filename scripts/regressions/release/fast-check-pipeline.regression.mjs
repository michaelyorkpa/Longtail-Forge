export const regressionMeta = Object.freeze({
  id: "release.fast-check-pipeline",
  area: "release",
  tier: "release-gate",
  tags: ["commands", "release", "tooling"],
  description: "Proves npm run check runs TypeScript, Vitest, and the sole ESLint syntax/lint owner before the slow regression runner, and that npm start stays a pure Node boot.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const scripts = packageJson.scripts;

// npm start stays a pure Node runtime boot with no compile/typecheck step.
assert.equal(scripts.start, "node server.js");

// Fast-check commands exist and run the expected tools.
assert.equal(scripts.typecheck, "tsc --noEmit", "typecheck must run tsc in noEmit mode");
assert.equal(scripts["test:unit"], "vitest run", "test:unit must run Vitest once");
assert.equal(scripts["test:watch"], "vitest", "test:watch must run Vitest in watch mode");
for (const narrow of ["test:contracts", "test:files", "test:tasks"]) {
  assert.match(
    String(scripts[narrow] || ""),
    /^vitest run --passWithNoTests /,
    `${narrow} must run a filtered Vitest pass that tolerates an empty match until its module lands`,
  );
}

// npm run check fails fast: typecheck, unit tests, and the syntax/lint owner all
// run before the stateful regression suite.
const check = String(scripts.check || "");
const checkStages = [
  "npm run typecheck",
  "npm run test:unit",
  "eslint",
  "node scripts/run-regressions.mjs",
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
  check.indexOf("eslint") < check.indexOf("node scripts/run-regressions.mjs"),
  "ESLint must own syntax and lint failure before the stateful regression runner",
);
assert.ok(
  check.indexOf("npm run test:unit") < check.indexOf("node scripts/run-regressions.mjs"),
  "unit tests must run before the regression runner",
);
assert.match(check, /&&/, "check stages must be chained so a fast failure stops the slow suite");

const eslintConfig = readFileSync("eslint.config.js", "utf8");
for (const sourcePattern of [
  "src/**/*.js",
  "server.js",
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

// tsconfig contract: dev-time checking only, no emit, JS allowed, checkJs opt-in per file.
const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
assert.equal(tsconfig.compilerOptions.noEmit, true, "tsconfig must keep noEmit: true");
assert.equal(tsconfig.compilerOptions.allowJs, true, "tsconfig must keep allowJs: true");
assert.notEqual(tsconfig.compilerOptions.checkJs, true, "checkJs stays selective (per-file @ts-check), not repo-wide");
assert.ok(
  Array.isArray(tsconfig.exclude) && tsconfig.exclude.includes("node_modules") && tsconfig.exclude.includes("archive"),
  "tsconfig must exclude node_modules and archive",
);
assert.ok(
  !tsconfig.include.some((entry) => entry.startsWith("public")),
  "browser UI scripts stay out of the typecheck scope in this slice",
);

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
  "tests/unit/focus-mode-resolution.test.mjs",
  "tests/unit/resume-producer-payload.test.mjs",
  "tests/unit/work-candidate-ranking.test.mjs",
];
for (const testFile of INITIAL_UNIT_TEST_FILES) {
  assert.ok(statSync(testFile).isFile(), `${testFile} must remain in the fast unit suite`);
}

console.log("fast-check pipeline regression passed.");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
