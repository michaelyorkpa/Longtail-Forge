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
import {
  CLOSEOUT_CHECKPOINT,
  TRAILER_NAMES,
  parseCheckpointTrailers,
  validateCheckpointCommit,
} from "../../release/checkpoint-commits.mjs";

const agentBriefSource = readFileSync("scripts/agent-brief.mjs", "utf8");
assert.match(agentBriefSource, /\^#\{2,4\} Version/, "agent brief should locate umbrella, branch, and numbered child roadmap cursors");

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
assert.equal(focusedSlice.permissionHarnessIncluded, false);
const fullSlice = createSliceVerificationPlan(createChangedRegressionPlan(["src/db/schema/current.sql"]));
assert.equal(fullSlice.stages.find(({ id }) => id === "fast-checks").included, true);
assert.equal(fullSlice.stages.find(({ id }) => id === "regressions-1").command, "npm run test:regressions");
assert.equal(fullSlice.permissionHarnessIncluded, true, "the discovered harness should run once inside every full registry");
assert.equal(fullSlice.commands.filter((command) => command === "npm run test:regressions").length, 1);
assert.ok(!fullSlice.commands.includes("npm run test:permissions"), "slice verification must not run the discovered harness a second time");
const permissionSlice = createSliceVerificationPlan(createChangedRegressionPlan(["src/routes/permissions.routes.js"]));
assert.equal(permissionSlice.permissionHarnessIncluded, true);
assert.deepEqual(permissionSlice.commands.filter((command) => /permission/.test(command)), [], "permission routing should reach the harness through the one full registry command");
const executed = executeSliceVerificationPlan(focusedSlice, { contextSeconds: 0.25, runCommand: () => ({ status: 0 }) });
const summary = formatSliceVerificationSummary(focusedSlice, executed);
for (const label of ["Context/setup", "Closeout gates", "Typecheck/unit/lint", "Regression buckets", "Browser checks", "Packaging"]) {
  assert.match(summary, new RegExp(label.replace("/", "\\/")), `${label} timing/status must stay visible`);
}
assert.match(summary, /\[SKIPPED\]/);
assert.match(summary, /Permission harness discovered through regression buckets: no/);

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

const roadmapSource = readFileSync("ROADMAP.md", "utf8");
const roadmapArchiveSource = ["0.33.33.1", "0.33.33.2", "0.33.33.3", "0.33.33.6"]
  .map((version) => `## Version ${version} - Synthetic completed checkpoint fixture`)
  .join("\n");
const workflowSource = readFileSync(".github/workflows/development-pr.yml", "utf8");
const agentGuide = readFileSync("AGENTS.md", "utf8");
const versioning = readFileSync("docs/versioning.md", "utf8");
const firstCheckpointMessage = checkpointMessage({
  checkpoint: "0.33.33.1",
  docs: "Docs updated: AGENTS.md, docs/versioning.md.",
  summary: "Rebase internal checkpoint ceremony on branch-closeout identity",
});
const firstCheckpoint = validateCheckpointCommit({
  message: firstCheckpointMessage,
  paths: [
    ".github/workflows/development-pr.yml",
    "AGENTS.md",
    "docs/versioning.md",
    "scripts/release/checkpoint-commits.mjs",
    "scripts/regressions/release/developer-verification-throughput.regression.mjs",
  ],
  roadmapArchiveSource,
  roadmapSource,
});
assert.equal(firstCheckpoint.kind, "checkpoint");
assert.deepEqual(firstCheckpoint.errors, []);
assert.deepEqual(firstCheckpoint.ceremonyPaths, ["AGENTS.md", "docs/versioning.md"]);

const nextCheckpoint = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: "0.33.33.2",
    docs: "No docs change needed: branch-closeout rollup owns durable prose.",
    summary: "Retire inert historical evidence while retaining live owners",
  }),
  paths: ["scripts/regressions/release/example.regression.mjs", "scripts/regression-coverage-manifest.json"],
  roadmapArchiveSource,
  roadmapSource,
});
assert.equal(nextCheckpoint.kind, "checkpoint");
assert.deepEqual(nextCheckpoint.errors, []);
assert.ok(nextCheckpoint.ceremonyPaths.length <= 2, "the next checkpoint must fit the ceremony ceiling without release identity files");
assert.ok(!nextCheckpoint.paths.some((filePath) => ["package.json", "package-lock.json", "CHANGELOG.md"].includes(filePath)));

const archivedCheckpoint = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: "0.33.33.1",
    docs: "No docs change needed: completed checkpoint moved to roadmap archive.",
    summary: "Archive the completed checkpoint after protected merge proof",
  }),
  paths: ["ROADMAP.md", "ROADMAP-ARCHIVE.md"],
  roadmapArchiveSource,
  roadmapSource: roadmapSource.replace(/^### 0\.33\.33\.1[\s\S]*?(?=^### 0\.33\.33\.2)/m, ""),
});
assert.equal(archivedCheckpoint.kind, "checkpoint");
assert.deepEqual(archivedCheckpoint.errors, []);
assert.deepEqual(archivedCheckpoint.ceremonyPaths, ["ROADMAP-ARCHIVE.md", "ROADMAP.md"]);

const parsedTrailers = parseCheckpointTrailers(firstCheckpointMessage);
assert.equal(parsedTrailers.values.get(TRAILER_NAMES.checkpoint), "0.33.33.1");
assert.equal(parsedTrailers.values.get(TRAILER_NAMES.summary), "Rebase internal checkpoint ceremony on branch-closeout identity");
assert.equal(parsedTrailers.values.get(TRAILER_NAMES.docs), "Docs updated: AGENTS.md, docs/versioning.md.");

const missingTrailers = validateCheckpointCommit({ message: "Implement work without trailers", paths: ["src/core/app.js"], roadmapSource });
assert.match(missingTrailers.errors.join("\n"), /missing required LTF-Checkpoint trailer/);
const planningCommit = validateCheckpointCommit({ message: "Plan the branch", paths: ["ROADMAP.md"], roadmapSource });
assert.equal(planningCommit.kind, "planning", "a roadmap-only umbrella planning commit may precede checkpoint enforcement");
assert.deepEqual(planningCommit.errors, []);

const deferredIdentity = validateCheckpointCommit({
  message: checkpointMessage({ checkpoint: "0.33.33.2", docs: "No docs change needed: recorded for branch closeout.", summary: "Attempt an early release identity change" }),
  paths: ["package.json", "package-lock.json", "CHANGELOG.md"],
  roadmapSource,
});
for (const filePath of ["package.json", "package-lock.json", "CHANGELOG.md"]) {
  assert.match(deferredIdentity.errors.join("\n"), new RegExp(`${filePath.replace(".", "\\.")} is reserved for`));
}

const packageScriptCheckpoint = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: "0.33.33.6",
    docs: "No docs change needed: exact narrow command ownership changed without durable prose.",
    summary: "Make narrow Vitest aliases fail when their owned suites disappear",
  }),
  packageBeforeSource: JSON.stringify({ name: "longtail-forge", scripts: { "test:tasks": "vitest run --passWithNoTests tasks" }, version: "9.8.7.6" }),
  packageAfterSource: JSON.stringify({ name: "longtail-forge", scripts: { "test:tasks": "vitest run tests/contracts/tasks-contracts.test.mjs" }, version: "9.8.7.6" }),
  paths: ["package.json"],
  roadmapArchiveSource,
  roadmapSource,
});
assert.deepEqual(packageScriptCheckpoint.errors, [], "internal checkpoints may change package scripts without changing release identity");

const packageVersionCheckpoint = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: "0.33.33.6",
    docs: "No docs change needed: synthetic release-identity rejection.",
    summary: "Attempt an early package version change",
  }),
  packageBeforeSource: JSON.stringify({ name: "longtail-forge", scripts: {}, version: "9.8.7.6" }),
  packageAfterSource: JSON.stringify({ name: "longtail-forge", scripts: {}, version: "9.8.7.7" }),
  paths: ["package.json"],
  roadmapArchiveSource,
  roadmapSource,
});
assert.match(packageVersionCheckpoint.errors.join("\n"), /package\.json is reserved/);

const earlyDurableDocs = validateCheckpointCommit({
  message: checkpointMessage({ checkpoint: "0.33.33.2", docs: "Docs updated: docs/versioning.md.", summary: "Attempt an early durable documentation change" }),
  paths: ["docs/versioning.md"],
  roadmapSource,
});
assert.match(earlyDurableDocs.errors.join("\n"), /durable documentation is reserved/);
const generatedInventoryDocs = validateCheckpointCommit({
  message: checkpointMessage({ checkpoint: "0.33.33.3", docs: "Docs updated: docs/regression-suite.md.", summary: "Refresh the generated regression coverage inventory" }),
  paths: ["docs/regression-suite.md", "scripts/regression-coverage-manifest.json"],
  roadmapArchiveSource,
  roadmapSource,
});
assert.deepEqual(generatedInventoryDocs.errors, [], "generated inventory documentation may move with its internal checkpoint");
const docsMismatch = validateCheckpointCommit({
  message: checkpointMessage({ checkpoint: "0.33.33.1", docs: "Docs updated: docs/versioning.md.", summary: "Declare an incomplete documentation disposition" }),
  paths: ["AGENTS.md", "docs/versioning.md"],
  roadmapSource,
});
assert.match(docsMismatch.errors.join("\n"), /paths must exactly match changed documentation/);
const ceremonyOverflow = validateCheckpointCommit({
  message: firstCheckpointMessage,
  paths: ["AGENTS.md", "docs/versioning.md", "ROADMAP.md"],
  roadmapSource,
});
assert.match(ceremonyOverflow.errors.join("\n"), /maximum is 2/);

const closeoutCheckpoint = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: CLOSEOUT_CHECKPOINT,
    docs: "Docs updated: AGENTS.md, docs/versioning.md.",
    summary: "Roll up the Lean Core branch release identity and durable evidence",
  }),
  paths: ["AGENTS.md", "CHANGELOG.md", "DECISIONS.md", "ROADMAP-ARCHIVE.md", "ROADMAP.md", "docs/versioning.md", "package-lock.json", "package.json"],
  roadmapSource,
});
assert.deepEqual(closeoutCheckpoint.errors, [], "branch closeout may own the deferred release and documentation ceremony");

assert.match(workflowSource, /LTF_CHECKPOINT_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
assert.match(workflowSource, /node scripts\/release\/checkpoint-commits\.mjs/);
assert.match(agentGuide, /LTF-Checkpoint: <slice-id>/);
assert.match(agentGuide, /LTF-Summary: <single-line outcome>/);
assert.match(agentGuide, /LTF-Docs: <documentation disposition>/);
assert.match(versioning, /Version-wide Internal Checkpoints/);
assert.match(versioning, /Completed numbered checkpoints move from `ROADMAP\.md` to `ROADMAP-ARCHIVE\.md` after their protected merge/);

console.log("Developer verification throughput regression passed.");

function checkpointMessage({ checkpoint, docs, summary }) {
  return `Complete ${checkpoint}\n\n${TRAILER_NAMES.checkpoint}: ${checkpoint}\n${TRAILER_NAMES.summary}: ${summary}\n${TRAILER_NAMES.docs}: ${docs}`;
}
