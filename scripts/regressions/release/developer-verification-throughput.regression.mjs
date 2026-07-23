export const regressionMeta = Object.freeze({
  id: "release.developer-verification-throughput",
  area: "release",
  tier: "release-gate",
  tags: ["ci", "commands", "release", "routing", "timing"],
  description: "Proves ceremony-aware routing, prechecked CI escalation, stage timing, and the generated canonical agent brief.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createChangedRegressionPlan } from "../../lib/changed-regression-runner.mjs";
import { isApplicationVersionOnlyChange, suggestRegressionsForPaths } from "../../lib/regression-change-routing.mjs";
import { createSliceVerificationPlan, executeSliceVerificationPlan, formatSliceVerificationSummary } from "../../lib/slice-verification-plan.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const agentBriefSource = readFileSync("scripts/agent-brief.mjs", "utf8");
assert.equal(packageJson.scripts["agent:brief"], "node scripts/agent-brief.mjs");
assert.match(agentBriefSource, /\^#\{2,4\} Version/, "agent brief should locate umbrella, branch, and numbered child roadmap cursors");
assert.equal(packageJson.scripts["test:regressions:changed:ci"], "node scripts/run-changed-regressions.mjs --prechecked");

const beforePackage = { name: "longtail-forge", version: "1.0.0", scripts: { check: "old" } };
assert.equal(isApplicationVersionOnlyChange(beforePackage, { ...beforePackage, version: "1.0.1" }, "package.json"), true);
assert.equal(isApplicationVersionOnlyChange(beforePackage, { ...beforePackage, version: "1.0.1", scripts: { check: "new" } }, "package.json"), false);
const beforeLock = { name: "longtail-forge", version: "1.0.0", lockfileVersion: 3, packages: { "": { name: "longtail-forge", version: "1.0.0" } } };
const afterLock = JSON.parse(JSON.stringify(beforeLock));
afterLock.version = "1.0.1";
afterLock.packages[""].version = "1.0.1";
assert.equal(isApplicationVersionOnlyChange(beforeLock, afterLock, "package-lock.json"), true);

for (const path of [
  "src/modules/files/files.routes.js",
  "src/db/schema/current.sql",
  "src/routes/permissions.routes.js",
  ".github/workflows/development-pr.yml",
  "scripts/regression-coverage-manifest.json",
  "unmapped/unknown.bin",
]) {
  assert.equal(suggestRegressionsForPaths([path]).fullCheckRecommended, true, `${path} must retain complete escalation`);
}

const focused = createChangedRegressionPlan(["src/modules/tasks/tasks.service.js"]);
const focusedSlice = createSliceVerificationPlan(focused);
assert.equal(focusedSlice.stages.find(({ id }) => id === "fast-checks").included, false);
assert.equal(focusedSlice.stages.find(({ id }) => id === "regressions-1").command, "npm run test:regressions:tasks");
const fullSlice = createSliceVerificationPlan(createChangedRegressionPlan(["src/db/schema/current.sql"]));
assert.equal(fullSlice.stages.find(({ id }) => id === "fast-checks").included, true);
assert.equal(fullSlice.stages.find(({ id }) => id === "regressions-1").command, "npm run test:regressions");
const executed = executeSliceVerificationPlan(focusedSlice, { contextSeconds: 0.25, runCommand: () => ({ status: 0 }) });
const summary = formatSliceVerificationSummary(focusedSlice, executed);
for (const label of ["Context/setup", "Closeout gates", "Typecheck/unit/lint", "Regression buckets", "Permission checks", "Browser checks", "Packaging"]) {
  assert.match(summary, new RegExp(label.replace("/", "\\/")), `${label} timing/status must stay visible`);
}
assert.match(summary, /\[SKIPPED\]/);

for (const workflowPath of [
  ".github/workflows/development-pr.yml",
  ".github/workflows/nightly.yml",
  ".github/workflows/promotion.yml",
  ".github/workflows/main-release.yml",
  ".github/workflows/manual-preview.yml",
  ".github/workflows/manual-release.yml",
]) {
  assert.match(readFileSync(workflowPath, "utf8"), /run-timed-stage\.mjs/, `${workflowPath} must emit explicit stage timing`);
}
assert.match(readFileSync(".github/workflows/development-pr.yml", "utf8"), /test:regressions:changed:ci/);

const brief = spawnSync(process.execPath, ["scripts/agent-brief.mjs"], { encoding: "utf8" });
assert.equal(brief.status, 0, brief.stderr);
const activeCursor = readFileSync("ROADMAP.md", "utf8").match(/^Active cursor: `([^`]+)`\./m)?.[1];
assert.ok(activeCursor);
assert.match(brief.stdout, new RegExp(`Agent brief: ${activeCursor.replaceAll(".", "\\.")}`));
assert.match(brief.stdout, /Active roadmap slice and acceptance criteria/);
assert.match(brief.stdout, /Relevant governing decisions/);
assert.match(brief.stdout, /Documentation owners/);
assert.match(brief.stdout, /Likely test commands/);

console.log("Developer verification throughput regression passed.");
